/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-contribution-aggregator.ts
 *
 * Deterministic aggregation of local multi-agent collective runs into immutable
 * swarm-node contributions.
 */

import {
  type MultiAgentCollectiveDecision,
  type MultiAgentEvidence,
  type MultiAgentExecutionOutcome,
  type MultiAgentObservation,
  type MultiAgentRiskFinding,
  type MultiAgentRunResult,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

import {
  type TradingSwarmConfidence,
  type TradingSwarmContributionAggregatorPort,
  type TradingSwarmEvidenceReference,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmLocalCollectiveRun,
  type TradingSwarmMission,
  type TradingSwarmNodeContribution,
  type TradingSwarmObservation,
  type TradingSwarmObservationType,
  type TradingSwarmRisk,
  type TradingSwarmScore,
  type TradingSwarmTaskAssignment,
  type TradingSwarmTimestamp,
  type TradingSwarmUtility,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmContributionAggregatorErrorCode =
  | "INVALID_MISSION"
  | "INVALID_ASSIGNMENTS"
  | "INVALID_RUNS"
  | "DUPLICATE_ASSIGNMENT"
  | "DUPLICATE_RUN"
  | "MISSING_ASSIGNMENT"
  | "MISSION_MISMATCH"
  | "TASK_MISMATCH"
  | "NODE_MISMATCH"
  | "RUN_TIMING_INVALID"
  | "OUTCOME_IDENTITY_INVALID"
  | "FOREIGN_SELECTED_AGENT"
  | "OBSERVATION_ID_COLLISION"
  | "DECISION_ID_COLLISION"
  | "NO_CONTRIBUTIONS"
  | "AGGREGATION_FAILED";

export interface SwarmContributionAggregatorErrorDetails {
  readonly missionId?: string;
  readonly taskId?: string;
  readonly nodeId?: string;
  readonly runId?: string;
  readonly observationId?: string;
  readonly decisionId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmContributionAggregatorError extends Error {
  public readonly code: SwarmContributionAggregatorErrorCode;
  public readonly details: SwarmContributionAggregatorErrorDetails;

  public constructor(
    code: SwarmContributionAggregatorErrorCode,
    message: string,
    details: SwarmContributionAggregatorErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmContributionAggregatorError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmContributionAggregatorWeights {
  readonly observationConfidence: number;
  readonly observationQuality: number;
  readonly decisionConfidence: number;
  readonly successfulRunRatio: number;
  readonly warningPenalty: number;
  readonly failedRunPenalty: number;
  readonly rejectedRunPenalty: number;
  readonly cancelledRunPenalty: number;
  readonly deferredRunPenalty: number;
}

export interface SwarmContributionAggregatorOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly weights?: Partial<SwarmContributionAggregatorWeights>;
  readonly requireEveryRunAssignment?: boolean;
  readonly requireAtLeastOneContribution?: boolean;
  readonly includeTerminalRuns?: boolean;
  readonly includeOutcomeObservations?: boolean;
  readonly includeOutcomeDecisions?: boolean;
  readonly deduplicateEvidence?: boolean;
  readonly submittedAtStrategy?: "LATEST_RUN_COMPLETION" | "MISSION_CREATED_AT";
  readonly defaultTerminalConfidence?: TradingSwarmConfidence;
  readonly defaultTerminalRisk?: TradingSwarmRisk;
  readonly defaultTerminalUtility?: TradingSwarmUtility;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly weights: SwarmContributionAggregatorWeights;
  readonly requireEveryRunAssignment: boolean;
  readonly requireAtLeastOneContribution: boolean;
  readonly includeTerminalRuns: boolean;
  readonly includeOutcomeObservations: boolean;
  readonly includeOutcomeDecisions: boolean;
  readonly deduplicateEvidence: boolean;
  readonly submittedAtStrategy:
    | "LATEST_RUN_COMPLETION"
    | "MISSION_CREATED_AT";
  readonly defaultTerminalConfidence: TradingSwarmConfidence;
  readonly defaultTerminalRisk: TradingSwarmRisk;
  readonly defaultTerminalUtility: TradingSwarmUtility;
}

interface AggregationGroup {
  readonly nodeId: string;
  readonly assignments: TradingSwarmTaskAssignment[];
  readonly runs: TradingSwarmLocalCollectiveRun[];
}

interface ObservationMetrics {
  readonly averageConfidence: number;
  readonly averageQuality: number;
  readonly averageRisk: number;
  readonly averageUtility: number;
}

interface RunStatusMetrics {
  readonly completed: number;
  readonly completedWithWarnings: number;
  readonly deferred: number;
  readonly rejected: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly other: number;
}

interface ContributionMetrics {
  readonly confidence: TradingSwarmConfidence;
  readonly utility: TradingSwarmUtility;
  readonly risk: TradingSwarmRisk;
  readonly reliability: TradingSwarmScore;
}

/* ========================================================================== *
 * Defaults
 * ========================================================================== */

export const DEFAULT_SWARM_CONTRIBUTION_AGGREGATOR_WEIGHTS:
  SwarmContributionAggregatorWeights = Object.freeze({
    observationConfidence: 0.24,
    observationQuality: 0.12,
    decisionConfidence: 0.24,
    successfulRunRatio: 0.40,
    warningPenalty: 0.05,
    failedRunPenalty: 0.35,
    rejectedRunPenalty: 0.30,
    cancelledRunPenalty: 0.20,
    deferredRunPenalty: 0.10,
  });

/* ========================================================================== *
 * Aggregator
 * ========================================================================== */

export class SwarmContributionAggregator
  implements TradingSwarmContributionAggregatorPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmContributionAggregatorOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public aggregate(
    mission: TradingSwarmMission,
    assignments: readonly TradingSwarmTaskAssignment[],
    runs: readonly TradingSwarmLocalCollectiveRun[],
  ): readonly TradingSwarmNodeContribution[] {
    try {
      this.validateInputs(mission, assignments, runs);

      const assignmentByTaskId = indexAssignments(assignments);
      const runIds = new Set<string>();

      for (const run of runs) {
        const outcomeRunId = run.outcome.runId;

        if (runIds.has(outcomeRunId)) {
          throw new SwarmContributionAggregatorError(
            "DUPLICATE_RUN",
            `Duplicate local run outcome "${outcomeRunId}".`,
            {
              missionId: mission.missionId,
              taskId: run.taskId,
              nodeId: run.nodeId,
              runId: outcomeRunId,
            },
          );
        }

        runIds.add(outcomeRunId);

        const assignment = assignmentByTaskId.get(run.taskId);

        if (assignment === undefined) {
          if (this.options.requireEveryRunAssignment) {
            throw new SwarmContributionAggregatorError(
              "MISSING_ASSIGNMENT",
              `No assignment exists for local run task "${run.taskId}".`,
              {
                missionId: mission.missionId,
                taskId: run.taskId,
                nodeId: run.nodeId,
                runId: outcomeRunId,
              },
            );
          }

          continue;
        }

        this.validateRunAgainstAssignment(
          mission,
          assignment,
          run,
        );
      }

      const groups = buildGroups(
        assignments,
        runs,
        assignmentByTaskId,
      );

      const contributions = groups
        .map((group) =>
          this.buildContribution(
            mission,
            group,
          ),
        )
        .filter(
          (
            contribution,
          ): contribution is TradingSwarmNodeContribution =>
            contribution !== undefined,
        )
        .sort((left, right) =>
          left.nodeId.localeCompare(right.nodeId),
        );

      if (
        contributions.length === 0 &&
        this.options.requireAtLeastOneContribution
      ) {
        throw new SwarmContributionAggregatorError(
          "NO_CONTRIBUTIONS",
          `Mission "${mission.missionId}" produced no node contributions.`,
          { missionId: mission.missionId },
        );
      }

      return Object.freeze(contributions);
    } catch (error) {
      if (
        error instanceof
        SwarmContributionAggregatorError
      ) {
        throw error;
      }

      throw new SwarmContributionAggregatorError(
        "AGGREGATION_FAILED",
        "Failed to aggregate swarm-node contributions.",
        {
          missionId: mission?.missionId,
          cause: error,
        },
      );
    }
  }

  private buildContribution(
    mission: TradingSwarmMission,
    group: AggregationGroup,
  ): TradingSwarmNodeContribution | undefined {
    const includedRuns = group.runs
      .filter((run) =>
        this.options.includeTerminalRuns ||
        !isTerminalFailureOutcome(run.outcome),
      )
      .sort(compareRuns);

    if (includedRuns.length === 0) {
      return undefined;
    }

    const observationIds = new Set<string>();
    const decisionIds = new Set<string>();
    const observations: TradingSwarmObservation[] = [];
    const localDecisions: MultiAgentCollectiveDecision[] = [];

    for (const run of includedRuns) {
      if (
        this.options.includeOutcomeObservations &&
        isFullRunResult(run.outcome)
      ) {
        for (const observation of [...run.outcome.observations].sort(
          (left, right) =>
            left.observationId.localeCompare(
              right.observationId,
            ),
        )) {
          const converted = convertObservation(
            mission,
            group.nodeId,
            run,
            observation,
            this.options,
          );

          if (observationIds.has(converted.observationId)) {
            throw new SwarmContributionAggregatorError(
              "OBSERVATION_ID_COLLISION",
              `Duplicate aggregated observation "${converted.observationId}".`,
              {
                missionId: mission.missionId,
                taskId: run.taskId,
                nodeId: group.nodeId,
                runId: run.outcome.runId,
                observationId: converted.observationId,
              },
            );
          }

          observationIds.add(converted.observationId);
          observations.push(converted);
        }
      }

      if (
        this.options.includeOutcomeDecisions &&
        isFullRunResult(run.outcome) &&
        run.outcome.decision !== undefined
      ) {
        const decision = deepFreeze(
          run.outcome.decision,
        );

        if (decisionIds.has(decision.decisionId)) {
          throw new SwarmContributionAggregatorError(
            "DECISION_ID_COLLISION",
            `Duplicate local decision "${decision.decisionId}".`,
            {
              missionId: mission.missionId,
              taskId: run.taskId,
              nodeId: group.nodeId,
              runId: run.outcome.runId,
              decisionId: decision.decisionId,
            },
          );
        }

        decisionIds.add(decision.decisionId);
        localDecisions.push(decision);
      }
    }

    observations.sort((left, right) => {
      const timeOrder =
        left.observedAtMs - right.observedAtMs;

      if (timeOrder !== 0) {
        return timeOrder;
      }

      return left.observationId.localeCompare(
        right.observationId,
      );
    });

    localDecisions.sort((left, right) => {
      const timeOrder =
        left.decidedAtMs - right.decidedAtMs;

      if (timeOrder !== 0) {
        return timeOrder;
      }

      return left.decisionId.localeCompare(
        right.decisionId,
      );
    });

    const metrics = calculateContributionMetrics(
      includedRuns,
      observations,
      localDecisions,
      this.options,
    );

    const partitionIds = Object.freeze(
      uniqueSorted(
        group.assignments
          .map(
            (assignment) =>
              assignment.task.partitionId,
          )
          .filter(
            (
              partitionId,
            ): partitionId is string =>
              partitionId !== undefined,
          ),
      ),
    );

    const localRunIds = Object.freeze(
      includedRuns
        .map((run) => run.outcome.runId)
        .sort((left, right) =>
          left.localeCompare(right),
        ),
    );

    const submittedAtMs =
      resolveSubmittedAtMs(
        mission,
        includedRuns,
        this.options.submittedAtStrategy,
      );

    const contributionBase = {
      nodeId: group.nodeId,
      partitionIds,
      localRunIds,
      observations: Object.freeze(observations),
      localDecisions: Object.freeze(localDecisions),
      confidence: metrics.confidence,
      utilityContribution: metrics.utility,
      riskContribution: metrics.risk,
      reliabilityScore: metrics.reliability,
      submittedAtMs,
    } satisfies Omit<
      TradingSwarmNodeContribution,
      "deterministicFingerprint"
    >;

    return deepFreeze<TradingSwarmNodeContribution>({
      ...contributionBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          contributionFingerprintInput(
            mission,
            contributionBase,
          ),
        ),
    });
  }

  private validateInputs(
    mission: TradingSwarmMission,
    assignments: readonly TradingSwarmTaskAssignment[],
    runs: readonly TradingSwarmLocalCollectiveRun[],
  ): void {
    if (mission === undefined || mission === null) {
      throw new SwarmContributionAggregatorError(
        "INVALID_MISSION",
        "A swarm mission is required.",
      );
    }

    assertNonEmptyText(
      mission.missionId,
      "mission.missionId",
      "INVALID_MISSION",
    );
    assertNonEmptyText(
      mission.runId,
      "mission.runId",
      "INVALID_MISSION",
    );

    if (!Array.isArray(assignments)) {
      throw new SwarmContributionAggregatorError(
        "INVALID_ASSIGNMENTS",
        "assignments must be an array.",
        { missionId: mission.missionId },
      );
    }

    if (!Array.isArray(runs)) {
      throw new SwarmContributionAggregatorError(
        "INVALID_RUNS",
        "runs must be an array.",
        { missionId: mission.missionId },
      );
    }

    for (const assignment of assignments) {
      assertNonEmptyText(
        assignment.task.taskId,
        "assignment.task.taskId",
        "INVALID_ASSIGNMENTS",
      );

      if (
        assignment.task.missionId !==
          mission.missionId ||
        assignment.task.runId !== mission.runId
      ) {
        throw new SwarmContributionAggregatorError(
          "MISSION_MISMATCH",
          `Assignment task "${assignment.task.taskId}" does not belong to mission "${mission.missionId}".`,
          {
            missionId: mission.missionId,
            taskId: assignment.task.taskId,
            nodeId: assignment.node.identity.nodeId,
          },
        );
      }
    }

    for (const run of runs) {
      assertNonEmptyText(
        run.taskId,
        "run.taskId",
        "INVALID_RUNS",
      );
      assertNonEmptyText(
        run.nodeId,
        "run.nodeId",
        "INVALID_RUNS",
      );
      assertNonEmptyText(
        run.outcome.runId,
        "run.outcome.runId",
        "INVALID_RUNS",
      );

      if (run.missionId !== mission.missionId) {
        throw new SwarmContributionAggregatorError(
          "MISSION_MISMATCH",
          `Local run "${run.outcome.runId}" does not belong to mission "${mission.missionId}".`,
          {
            missionId: mission.missionId,
            taskId: run.taskId,
            nodeId: run.nodeId,
            runId: run.outcome.runId,
          },
        );
      }
    }
  }

  private validateRunAgainstAssignment(
    mission: TradingSwarmMission,
    assignment: TradingSwarmTaskAssignment,
    run: TradingSwarmLocalCollectiveRun,
  ): void {
    if (assignment.task.taskId !== run.taskId) {
      throw new SwarmContributionAggregatorError(
        "TASK_MISMATCH",
        "The local run task does not match its assignment.",
        {
          missionId: mission.missionId,
          taskId: run.taskId,
          nodeId: run.nodeId,
          runId: run.outcome.runId,
        },
      );
    }

    if (
      assignment.node.identity.nodeId !==
      run.nodeId
    ) {
      throw new SwarmContributionAggregatorError(
        "NODE_MISMATCH",
        "The local run node does not match the assignment node.",
        {
          missionId: mission.missionId,
          taskId: run.taskId,
          nodeId: run.nodeId,
          runId: run.outcome.runId,
        },
      );
    }

    if (
      run.completedAtMs < run.startedAtMs
    ) {
      throw new SwarmContributionAggregatorError(
        "RUN_TIMING_INVALID",
        "The local run completed before it started.",
        {
          missionId: mission.missionId,
          taskId: run.taskId,
          nodeId: run.nodeId,
          runId: run.outcome.runId,
        },
      );
    }

    if (
      run.request.requestId !==
      run.outcome.requestId
    ) {
      throw new SwarmContributionAggregatorError(
        "OUTCOME_IDENTITY_INVALID",
        "The local run request and outcome identifiers do not match.",
        {
          missionId: mission.missionId,
          taskId: run.taskId,
          nodeId: run.nodeId,
          runId: run.outcome.runId,
        },
      );
    }

    const localAgentIds = new Set(
      assignment.node.agents.map(
        (agent) => agent.identity.agentId,
      ),
    );

    for (const agentId of run.selectedAgentIds) {
      if (!localAgentIds.has(agentId)) {
        throw new SwarmContributionAggregatorError(
          "FOREIGN_SELECTED_AGENT",
          `Selected agent "${agentId}" is not registered on node "${run.nodeId}".`,
          {
            missionId: mission.missionId,
            taskId: run.taskId,
            nodeId: run.nodeId,
            runId: run.outcome.runId,
          },
        );
      }
    }
  }
}

/* ========================================================================== *
 * Conversion
 * ========================================================================== */

function convertObservation(
  mission: TradingSwarmMission,
  nodeId: string,
  run: TradingSwarmLocalCollectiveRun,
  observation: MultiAgentObservation,
  options: NormalizedOptions,
): TradingSwarmObservation {
  const evidence = convertEvidence(
    nodeId,
    run,
    observation,
    options.deduplicateEvidence,
  );

  const risk = calculateObservationRisk(
    observation.risks,
  );

  const utility =
    calculateObservationUtility(observation);

  const recommendations = Object.freeze(
    uniqueSorted([
      ...observation.opportunities.map(
        (opportunity) =>
          opportunity.description,
      ),
      ...observation.risks
        .map((finding) => finding.mitigation)
        .filter(
          (
            mitigation,
          ): mitigation is string =>
            mitigation !== undefined &&
            mitigation.trim().length > 0,
        ),
    ]),
  );

  const warnings = Object.freeze(
    observation.risks
      .filter(
        (finding) =>
          severityRank(finding.severity) >= 2,
      )
      .map(
        (finding) =>
          `${finding.code}: ${finding.description}`,
      )
      .sort((left, right) =>
        left.localeCompare(right),
      ),
  );

  const observationBase = {
    observationId: createSwarmObservationId(
      mission.missionId,
      run,
      observation,
    ),
    missionId: mission.missionId,
    taskId: run.taskId,
    nodeId,
    ...(runAssignmentPartitionId(run) === undefined
      ? {}
      : {
          partitionId:
            runAssignmentPartitionId(run),
        }),
    type: mapObservationType(
      observation.type,
    ),
    summary: observation.summary,
    confidence: clampScore(
      observation.confidence,
    ),
    risk,
    utility,
    evidence,
    recommendations,
    warnings,
    errors: Object.freeze([]),
    observedAtMs:
      observation.observedAtMs as TradingSwarmTimestamp,
    metadata: deepFreeze({
      sourceObservationId:
        observation.observationId,
      sourceAgentId: observation.agentId,
      sourceRunId: run.outcome.runId,
      sourceType: observation.type,
      qualityScore: observation.qualityScore,
      urgency: observation.urgency,
      validUntilMs:
        observation.validUntilMs ?? null,
      sourceFingerprint:
        observation.deterministicFingerprint,
    }),
  } satisfies Omit<
    TradingSwarmObservation,
    "deterministicFingerprint"
  >;

  return deepFreeze<TradingSwarmObservation>({
    ...observationBase,
    deterministicFingerprint:
      options.fingerprintGenerator.fingerprint(
        observationFingerprintInput(
          observationBase,
        ),
      ),
  });
}

function convertEvidence(
  nodeId: string,
  run: TradingSwarmLocalCollectiveRun,
  observation: MultiAgentObservation,
  deduplicate: boolean,
): readonly TradingSwarmEvidenceReference[] {
  const references = observation.evidence.map(
    (evidence) =>
      convertEvidenceReference(
        nodeId,
        run,
        observation,
        evidence,
      ),
  );

  if (!deduplicate) {
    return Object.freeze(
      references.sort(compareEvidence),
    );
  }

  const byId = new Map<
    string,
    TradingSwarmEvidenceReference
  >();

  for (const reference of references) {
    const existing = byId.get(reference.evidenceId);

    if (
      existing === undefined ||
      reference.confidence > existing.confidence
    ) {
      byId.set(reference.evidenceId, reference);
    }
  }

  return Object.freeze(
    [...byId.values()].sort(compareEvidence),
  );
}

function convertEvidenceReference(
  nodeId: string,
  run: TradingSwarmLocalCollectiveRun,
  observation: MultiAgentObservation,
  evidence: MultiAgentEvidence,
): TradingSwarmEvidenceReference {
  return deepFreeze({
    evidenceId: evidence.evidenceId,
    sourceNodeId: nodeId,
    sourceAgentId: observation.agentId,
    sourceRunId: run.outcome.runId,
    description: evidence.statement,
    confidence: clampScore(
      evidence.confidence,
    ),
    observedAtMs:
      evidence.observedAtMs as TradingSwarmTimestamp,
    deterministicFingerprint:
      evidence.deterministicFingerprint,
  });
}

function mapObservationType(
  type: MultiAgentObservation["type"],
): TradingSwarmObservationType {
  switch (type) {
    case "MARKET_STATE":
    case "REGIME_STATE":
    case "VOLATILITY_STATE":
    case "ORDER_FLOW_STATE":
    case "CORRELATION_STATE":
    case "PRICE_OUTLOOK":
      return "MARKET";
    case "LIQUIDITY_STATE":
      return "LIQUIDITY";
    case "ANOMALY_STATE":
      return "ANOMALY";
    case "PORTFOLIO_STATE":
      return "PORTFOLIO";
    case "RISK_STATE":
      return "RISK";
    case "STRATEGY_STATE":
      return "STRATEGY";
    case "ARBITRAGE_STATE":
      return "ARBITRAGE";
    case "EXECUTION_STATE":
      return "EXECUTION";
    case "SYSTEM_STATE":
      return "HEALTH";
    case "GOVERNANCE_STATE":
      return "CONSENSUS";
  }
}

/* ========================================================================== *
 * Metrics
 * ========================================================================== */

function calculateContributionMetrics(
  runs: readonly TradingSwarmLocalCollectiveRun[],
  observations: readonly TradingSwarmObservation[],
  decisions: readonly MultiAgentCollectiveDecision[],
  options: NormalizedOptions,
): ContributionMetrics {
  const observationMetrics =
    calculateObservationMetrics(observations);

  const statusMetrics =
    calculateRunStatusMetrics(runs);

  const successRatio =
    runs.length === 0
      ? 0
      : (statusMetrics.completed +
          statusMetrics.completedWithWarnings *
            0.8 +
          statusMetrics.deferred * 0.4) /
        runs.length;

  const decisionConfidence =
    decisions.length === 0
      ? options.defaultTerminalConfidence
      : average(
          decisions.map(
            (decision) =>
              decision.collectiveConfidence
                .finalConfidence,
          ),
        );

  const reliabilityBase =
    weightedAverage(
      [
        observationMetrics.averageConfidence,
        observationMetrics.averageQuality,
        decisionConfidence,
        successRatio,
      ],
      [
        options.weights.observationConfidence,
        options.weights.observationQuality,
        options.weights.decisionConfidence,
        options.weights.successfulRunRatio,
      ],
    );

  const reliabilityPenalty =
    runs.length === 0
      ? 0
      : (statusMetrics.completedWithWarnings *
            options.weights.warningPenalty +
          statusMetrics.failed *
            options.weights.failedRunPenalty +
          statusMetrics.rejected *
            options.weights.rejectedRunPenalty +
          statusMetrics.cancelled *
            options.weights.cancelledRunPenalty +
          statusMetrics.deferred *
            options.weights.deferredRunPenalty) /
        runs.length;

  const reliability = clampScore(
    reliabilityBase - reliabilityPenalty,
  );

  const confidence = clampScore(
    weightedAverage(
      [
        observationMetrics.averageConfidence,
        decisionConfidence,
        reliability,
      ],
      [0.35, 0.40, 0.25],
    ),
  );

  const decisionUtility =
    decisions.length === 0
      ? options.defaultTerminalUtility
      : average(
          decisions.map(
            (decision) =>
              decision.expectedUtility.totalUtility,
          ),
        );

  const utility = clampSignedUtility(
    weightedAverage(
      [
        observationMetrics.averageUtility,
        decisionUtility,
        successRatio,
      ],
      [0.30, 0.50, 0.20],
    ),
  );

  const decisionRisk =
    decisions.length === 0
      ? options.defaultTerminalRisk
      : average(
          decisions.map(calculateDecisionRisk),
        );

  const risk = clampScore(
    weightedAverage(
      [
        observationMetrics.averageRisk,
        decisionRisk,
        1 - reliability,
      ],
      [0.40, 0.40, 0.20],
    ),
  );

  return deepFreeze({
    confidence,
    utility,
    risk,
    reliability,
  });
}

function calculateObservationMetrics(
  observations: readonly TradingSwarmObservation[],
): ObservationMetrics {
  if (observations.length === 0) {
    return Object.freeze({
      averageConfidence: 0,
      averageQuality: 0,
      averageRisk: 0,
      averageUtility: 0,
    });
  }

  return Object.freeze({
    averageConfidence: average(
      observations.map(
        (observation) => observation.confidence,
      ),
    ),
    averageQuality: average(
      observations.map((observation) => {
        const quality =
          observation.metadata?.qualityScore;

        return typeof quality === "number"
          ? clampScore(quality)
          : observation.confidence;
      }),
    ),
    averageRisk: average(
      observations.map(
        (observation) => observation.risk,
      ),
    ),
    averageUtility: average(
      observations.map(
        (observation) => observation.utility,
      ),
    ),
  });
}

function calculateRunStatusMetrics(
  runs: readonly TradingSwarmLocalCollectiveRun[],
): RunStatusMetrics {
  const metrics = {
    completed: 0,
    completedWithWarnings: 0,
    deferred: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
    other: 0,
  };

  for (const run of runs) {
    switch (run.outcome.status) {
      case "COMPLETED":
        metrics.completed += 1;
        break;
      case "COMPLETED_WITH_WARNINGS":
        metrics.completedWithWarnings += 1;
        break;
      case "DEFERRED":
        metrics.deferred += 1;
        break;
      case "REJECTED":
        metrics.rejected += 1;
        break;
      case "FAILED":
        metrics.failed += 1;
        break;
      case "CANCELLED":
        metrics.cancelled += 1;
        break;
      default:
        metrics.other += 1;
        break;
    }
  }

  return Object.freeze(metrics);
}

function calculateObservationRisk(
  findings: readonly MultiAgentRiskFinding[],
): TradingSwarmRisk {
  if (findings.length === 0) {
    return 0;
  }

  let weightedRisk = 0;
  let totalWeight = 0;

  for (const finding of findings) {
    const weight =
      1 + severityRank(finding.severity);

    weightedRisk +=
      finding.impact *
      finding.probability *
      finding.confidence *
      weight;
    totalWeight += weight;
  }

  return clampScore(
    totalWeight <= 0
      ? 0
      : weightedRisk / totalWeight,
  );
}

function calculateObservationUtility(
  observation: MultiAgentObservation,
): TradingSwarmUtility {
  if (observation.opportunities.length === 0) {
    return clampSignedUtility(
      observation.qualityScore *
        observation.confidence *
        (1 -
          calculateObservationRisk(
            observation.risks,
          )),
    );
  }

  const opportunityUtility = average(
    observation.opportunities.map(
      (opportunity) =>
        opportunity.expectedUtility *
        opportunity.probability *
        opportunity.confidence,
    ),
  );

  return clampSignedUtility(
    opportunityUtility -
      calculateObservationRisk(
        observation.risks,
      ) *
        0.5,
  );
}

function calculateDecisionRisk(
  decision: MultiAgentCollectiveDecision,
): number {
  return calculateObservationRisk(
    decision.risks,
  );
}

function severityRank(
  severity: MultiAgentRiskFinding["severity"],
): number {
  switch (severity) {
    case "INFORMATIONAL":
      return 0;
    case "LOW":
      return 1;
    case "MODERATE":
      return 2;
    case "HIGH":
      return 3;
    case "CRITICAL":
      return 4;
  }
}

/* ========================================================================== *
 * Grouping and validation
 * ========================================================================== */

function indexAssignments(
  assignments: readonly TradingSwarmTaskAssignment[],
): ReadonlyMap<string, TradingSwarmTaskAssignment> {
  const result = new Map<
    string,
    TradingSwarmTaskAssignment
  >();

  for (const assignment of assignments) {
    const taskId = assignment.task.taskId;

    if (result.has(taskId)) {
      throw new SwarmContributionAggregatorError(
        "DUPLICATE_ASSIGNMENT",
        `Duplicate assignment for task "${taskId}".`,
        {
          missionId: assignment.task.missionId,
          taskId,
          nodeId: assignment.node.identity.nodeId,
        },
      );
    }

    result.set(taskId, assignment);
  }

  return result;
}

function buildGroups(
  assignments: readonly TradingSwarmTaskAssignment[],
  runs: readonly TradingSwarmLocalCollectiveRun[],
  assignmentByTaskId: ReadonlyMap<
    string,
    TradingSwarmTaskAssignment
  >,
): readonly AggregationGroup[] {
  const groups = new Map<
    string,
    AggregationGroup
  >();

  for (const assignment of assignments) {
    const nodeId =
      assignment.node.identity.nodeId;
    const current = groups.get(nodeId);

    if (current === undefined) {
      groups.set(nodeId, {
        nodeId,
        assignments: [assignment],
        runs: [],
      });
    } else {
      current.assignments.push(assignment);
    }
  }

  for (const run of runs) {
    const assignment =
      assignmentByTaskId.get(run.taskId);

    if (assignment === undefined) {
      continue;
    }

    const nodeId =
      assignment.node.identity.nodeId;
    const current = groups.get(nodeId);

    if (current === undefined) {
      groups.set(nodeId, {
        nodeId,
        assignments: [assignment],
        runs: [run],
      });
    } else {
      current.runs.push(run);
    }
  }

  return Object.freeze(
    [...groups.values()]
      .filter((group) => group.runs.length > 0)
      .map((group) =>
        deepFreeze({
          nodeId: group.nodeId,
          assignments: group.assignments.sort(
            (left, right) =>
              left.task.taskId.localeCompare(
                right.task.taskId,
              ),
          ),
          runs: group.runs.sort(compareRuns),
        }),
      )
      .sort((left, right) =>
        left.nodeId.localeCompare(right.nodeId),
      ),
  );
}

function compareRuns(
  left: TradingSwarmLocalCollectiveRun,
  right: TradingSwarmLocalCollectiveRun,
): number {
  const completionOrder =
    left.completedAtMs - right.completedAtMs;

  if (completionOrder !== 0) {
    return completionOrder;
  }

  const taskOrder =
    left.taskId.localeCompare(right.taskId);

  if (taskOrder !== 0) {
    return taskOrder;
  }

  return left.outcome.runId.localeCompare(
    right.outcome.runId,
  );
}

function compareEvidence(
  left: TradingSwarmEvidenceReference,
  right: TradingSwarmEvidenceReference,
): number {
  const timeOrder =
    left.observedAtMs - right.observedAtMs;

  if (timeOrder !== 0) {
    return timeOrder;
  }

  return left.evidenceId.localeCompare(
    right.evidenceId,
  );
}

/* ========================================================================== *
 * Fingerprint input and identity
 * ========================================================================== */

function createSwarmObservationId(
  missionId: string,
  run: TradingSwarmLocalCollectiveRun,
  observation: MultiAgentObservation,
): string {
  return `swarm-observation-${stableHash(
    stableStringify({
      missionId,
      taskId: run.taskId,
      nodeId: run.nodeId,
      runId: run.outcome.runId,
      sourceObservationId:
        observation.observationId,
      sourceFingerprint:
        observation.deterministicFingerprint,
    }),
  )}`;
}

function observationFingerprintInput(
  observation: Omit<
    TradingSwarmObservation,
    "deterministicFingerprint"
  >,
): unknown {
  return {
    observationId: observation.observationId,
    missionId: observation.missionId,
    taskId: observation.taskId,
    nodeId: observation.nodeId,
    partitionId:
      observation.partitionId ?? null,
    type: observation.type,
    summary: observation.summary,
    confidence: observation.confidence,
    risk: observation.risk,
    utility: observation.utility,
    evidence: observation.evidence.map(
      (item) => ({
        evidenceId: item.evidenceId,
        confidence: item.confidence,
        observedAtMs: item.observedAtMs,
        deterministicFingerprint:
          item.deterministicFingerprint ?? null,
      }),
    ),
    recommendations:
      observation.recommendations,
    warnings: observation.warnings,
    errors: observation.errors,
    observedAtMs: observation.observedAtMs,
  };
}

function contributionFingerprintInput(
  mission: TradingSwarmMission,
  contribution: Omit<
    TradingSwarmNodeContribution,
    "deterministicFingerprint"
  >,
): unknown {
  return {
    missionId: mission.missionId,
    missionFingerprint:
      mission.deterministicFingerprint,
    nodeId: contribution.nodeId,
    partitionIds:
      contribution.partitionIds,
    localRunIds: contribution.localRunIds,
    observationFingerprints:
      contribution.observations.map(
        (observation) =>
          observation.deterministicFingerprint,
      ),
    decisionFingerprints:
      contribution.localDecisions.map(
        (decision) =>
          decision.deterministicFingerprint,
      ),
    confidence: contribution.confidence,
    utilityContribution:
      contribution.utilityContribution,
    riskContribution:
      contribution.riskContribution,
    reliabilityScore:
      contribution.reliabilityScore,
    submittedAtMs:
      contribution.submittedAtMs,
  };
}

/* ========================================================================== *
 * Timing and outcome helpers
 * ========================================================================== */

function resolveSubmittedAtMs(
  mission: TradingSwarmMission,
  runs: readonly TradingSwarmLocalCollectiveRun[],
  strategy:
    | "LATEST_RUN_COMPLETION"
    | "MISSION_CREATED_AT",
): TradingSwarmTimestamp {
  if (strategy === "MISSION_CREATED_AT") {
    return mission.createdAtMs;
  }

  return Math.max(
    mission.createdAtMs,
    ...runs.map((run) => run.completedAtMs),
  ) as TradingSwarmTimestamp;
}

function isFullRunResult(
  outcome: MultiAgentExecutionOutcome,
): outcome is MultiAgentRunResult {
  return "selectedAgents" in outcome;
}

function isTerminalFailureOutcome(
  outcome: MultiAgentExecutionOutcome,
): boolean {
  return (
    outcome.status === "FAILED" ||
    outcome.status === "REJECTED" ||
    outcome.status === "CANCELLED"
  );
}

function runAssignmentPartitionId(
  run: TradingSwarmLocalCollectiveRun,
): string | undefined {
  const metadata =
    run.request.metadata as
      | Readonly<Record<string, unknown>>
      | undefined;

  const partitionId =
    metadata?.swarmPartitionId;

  return typeof partitionId === "string"
    ? partitionId
    : undefined;
}

/* ========================================================================== *
 * Configuration
 * ========================================================================== */

function normalizeOptions(
  options: SwarmContributionAggregatorOptions,
): NormalizedOptions {
  const weights = normalizeWeights(
    options.weights,
  );

  const defaultTerminalConfidence =
    options.defaultTerminalConfidence ?? 0;
  const defaultTerminalRisk =
    options.defaultTerminalRisk ?? 1;
  const defaultTerminalUtility =
    options.defaultTerminalUtility ?? 0;

  validateScore(
    defaultTerminalConfidence,
    "defaultTerminalConfidence",
  );
  validateScore(
    defaultTerminalRisk,
    "defaultTerminalRisk",
  );
  validateSignedUtility(
    defaultTerminalUtility,
    "defaultTerminalUtility",
  );

  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmContributionFingerprintGenerator(),
    weights,
    requireEveryRunAssignment:
      options.requireEveryRunAssignment ?? true,
    requireAtLeastOneContribution:
      options.requireAtLeastOneContribution ??
      true,
    includeTerminalRuns:
      options.includeTerminalRuns ?? true,
    includeOutcomeObservations:
      options.includeOutcomeObservations ?? true,
    includeOutcomeDecisions:
      options.includeOutcomeDecisions ?? true,
    deduplicateEvidence:
      options.deduplicateEvidence ?? true,
    submittedAtStrategy:
      options.submittedAtStrategy ??
      "LATEST_RUN_COMPLETION",
    defaultTerminalConfidence,
    defaultTerminalRisk,
    defaultTerminalUtility,
  });
}

function normalizeWeights(
  supplied:
    | Partial<SwarmContributionAggregatorWeights>
    | undefined,
): SwarmContributionAggregatorWeights {
  const weights = {
    ...DEFAULT_SWARM_CONTRIBUTION_AGGREGATOR_WEIGHTS,
    ...(supplied ?? {}),
  };

  for (const [field, value] of Object.entries(
    weights,
  )) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new SwarmContributionAggregatorError(
        "INVALID_RUNS",
        `Weight "${field}" must be non-negative and finite.`,
        { field },
      );
    }
  }

  const positiveTotal =
    weights.observationConfidence +
    weights.observationQuality +
    weights.decisionConfidence +
    weights.successfulRunRatio;

  if (positiveTotal <= 0) {
    throw new SwarmContributionAggregatorError(
      "INVALID_RUNS",
      "At least one positive contribution weight is required.",
    );
  }

  return Object.freeze(weights);
}

/* ========================================================================== *
 * Factories
 * ========================================================================== */

export function createSwarmContributionAggregator(
  options: SwarmContributionAggregatorOptions = {},
): SwarmContributionAggregator {
  return new SwarmContributionAggregator(
    options,
  );
}

export class StableSwarmContributionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-contribution-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Numeric and immutable utilities
 * ========================================================================== */

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

function weightedAverage(
  values: readonly number[],
  weights: readonly number[],
): number {
  if (values.length !== weights.length) {
    throw new SwarmContributionAggregatorError(
      "AGGREGATION_FAILED",
      "Weighted-average inputs must have equal lengths.",
    );
  }

  let weighted = 0;
  let totalWeight = 0;

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const weight = weights[index] ?? 0;
    const value = values[index] ?? 0;

    weighted += value * weight;
    totalWeight += weight;
  }

  return totalWeight <= 0
    ? 0
    : weighted / totalWeight;
}

function clampScore(
  value: number,
): TradingSwarmScore {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, value),
  ) as TradingSwarmScore;
}

function clampSignedUtility(
  value: number,
): TradingSwarmUtility {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(-1, value),
  ) as TradingSwarmUtility;
}

function validateScore(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new SwarmContributionAggregatorError(
      "INVALID_RUNS",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }
}

function validateSignedUtility(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < -1 ||
    value > 1
  ) {
    throw new SwarmContributionAggregatorError(
      "INVALID_RUNS",
      `${field} must be between -1 and 1.`,
      { field },
    );
  }
}

function assertNonEmptyText(
  value: string,
  field: string,
  code:
    | "INVALID_MISSION"
    | "INVALID_ASSIGNMENTS"
    | "INVALID_RUNS",
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new SwarmContributionAggregatorError(
      code,
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
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

    return Object.is(value, -0)
      ? 0
      : value;
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
      .sort(compareNormalizedValues);
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

function compareNormalizedValues(
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

// End of swarm-contribution-aggregator.ts