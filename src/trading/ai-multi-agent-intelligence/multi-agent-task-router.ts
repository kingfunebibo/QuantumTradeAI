/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-task-router.ts
 *
 * Deterministic, replay-safe task planning and agent-routing infrastructure.
 */

import {
  type MultiAgentAvailability,
  type MultiAgentCapability,
  type MultiAgentHealthSnapshot,
  type MultiAgentId,
  type MultiAgentMetadata,
  type MultiAgentPriority,
  type MultiAgentRegistration,
  type MultiAgentRegistryPort,
  type MultiAgentRole,
  type MultiAgentRunId,
  type MultiAgentRunRequest,
  type MultiAgentSessionId,
  type MultiAgentSystemContext,
  type MultiAgentTask,
  type MultiAgentTaskId,
  type MultiAgentTaskType,
  type MultiAgentTimestamp,
  type MultiAgentValidationIssue,
} from "./ai-multi-agent-contracts";

export type MultiAgentTaskRouterErrorCode =
  | "INVALID_ROUTING_REQUEST"
  | "INVALID_TASK_BLUEPRINT"
  | "NO_ELIGIBLE_AGENT"
  | "REQUIRED_ROLE_UNAVAILABLE"
  | "REQUIRED_CAPABILITY_UNAVAILABLE"
  | "PREFERRED_AGENT_UNAVAILABLE"
  | "DEPENDENCY_NOT_FOUND"
  | "CYCLIC_DEPENDENCY"
  | "DUPLICATE_TASK_ID"
  | "ROUTING_CAPACITY_EXCEEDED";

export interface MultiAgentTaskRouterErrorDetails {
  readonly taskId?: MultiAgentTaskId;
  readonly taskType?: MultiAgentTaskType;
  readonly agentId?: MultiAgentId;
  readonly role?: MultiAgentRole;
  readonly capability?: MultiAgentCapability;
  readonly issues?: readonly MultiAgentValidationIssue[];
  readonly candidateAgentIds?: readonly MultiAgentId[];
  readonly dependencyTaskIds?: readonly MultiAgentTaskId[];
}

export class MultiAgentTaskRouterError extends Error {
  public readonly code: MultiAgentTaskRouterErrorCode;
  public readonly details: MultiAgentTaskRouterErrorDetails;

  public constructor(
    code: MultiAgentTaskRouterErrorCode,
    message: string,
    details: MultiAgentTaskRouterErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentTaskRouterError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentTaskBlueprint {
  readonly key: string;
  readonly type: MultiAgentTaskType;
  readonly priority: MultiAgentPriority;
  readonly requiredCapabilities: readonly MultiAgentCapability[];
  readonly preferredRoles?: readonly MultiAgentRole[];
  readonly requiredRoles?: readonly MultiAgentRole[];
  readonly preferredAgentIds?: readonly MultiAgentId[];
  readonly excludedAgentIds?: readonly MultiAgentId[];
  readonly dependencyKeys?: readonly string[];
  readonly requestedByAgentId?: MultiAgentId;
  readonly deadlineAtMs?: MultiAgentTimestamp;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentTaskRoutingRequest {
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly requestedAtMs: MultiAgentTimestamp;
  readonly context: MultiAgentSystemContext;
  readonly blueprints: readonly MultiAgentTaskBlueprint[];
  readonly selectedAgents?: readonly MultiAgentRegistration[];
  readonly excludedAgentIds?: readonly MultiAgentId[];
  readonly maximumTasksPerAgent?: number;
  readonly maximumTotalTasks?: number;
  readonly strictPreferredAgents?: boolean;
  readonly allowDegradedAgents?: boolean;
  readonly requireHealthyAgents?: boolean;
  readonly requireDeterministicAgents?: boolean;
  readonly requireReplaySafeAgents?: boolean;
  readonly inputFingerprintSeed?: string;
}

export interface MultiAgentTaskCandidateScore {
  readonly agentId: MultiAgentId;
  readonly eligible: boolean;
  readonly totalScore: number;
  readonly capabilityScore: number;
  readonly proficiencyScore: number;
  readonly readinessScore: number;
  readonly reliabilityScore: number;
  readonly latencyScore: number;
  readonly dataFreshnessScore: number;
  readonly roleScore: number;
  readonly preferenceScore: number;
  readonly loadScore: number;
  readonly deterministicScore: number;
  readonly rejectionReasons: readonly string[];
}

export interface MultiAgentTaskRoutingDecision {
  readonly blueprintKey: string;
  readonly taskId: MultiAgentTaskId;
  readonly taskType: MultiAgentTaskType;
  readonly assignedAgentId: MultiAgentId;
  readonly candidateScores: readonly MultiAgentTaskCandidateScore[];
  readonly rationale: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface MultiAgentTaskRoutingResult {
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly tasks: readonly MultiAgentTask[];
  readonly decisions: readonly MultiAgentTaskRoutingDecision[];
  readonly orderedTaskIds: readonly MultiAgentTaskId[];
  readonly assignmentsByAgent: Readonly<Record<MultiAgentId, readonly MultiAgentTaskId[]>>;
  readonly warnings: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface MultiAgentTaskRouterWeights {
  readonly capability: number;
  readonly proficiency: number;
  readonly readiness: number;
  readonly reliability: number;
  readonly latency: number;
  readonly dataFreshness: number;
  readonly role: number;
  readonly preference: number;
  readonly load: number;
  readonly deterministic: number;
}

export interface MultiAgentTaskRouterOptions {
  readonly maximumTasksPerAgent?: number;
  readonly maximumTotalTasks?: number;
  readonly allowDegradedAgents?: boolean;
  readonly requireHealthyAgents?: boolean;
  readonly requireDeterministicAgents?: boolean;
  readonly requireReplaySafeAgents?: boolean;
  readonly strictPreferredAgents?: boolean;
  readonly defaultTaskDurationMs?: number;
  readonly weights?: Partial<MultiAgentTaskRouterWeights>;
  readonly taskIdFactory?: (
    prefix: string,
    seed: string,
  ) => MultiAgentTaskId;
  readonly fingerprintFactory?: (value: unknown) => string;
}

const DEFAULT_WEIGHTS: MultiAgentTaskRouterWeights = Object.freeze({
  capability: 0.18,
  proficiency: 0.18,
  readiness: 0.14,
  reliability: 0.18,
  latency: 0.08,
  dataFreshness: 0.08,
  role: 0.06,
  preference: 0.04,
  load: 0.04,
  deterministic: 0.02,
});

const DEFAULT_OPTIONS = Object.freeze({
  maximumTasksPerAgent: 8,
  maximumTotalTasks: 256,
  allowDegradedAgents: false,
  requireHealthyAgents: true,
  requireDeterministicAgents: true,
  requireReplaySafeAgents: true,
  strictPreferredAgents: false,
  defaultTaskDurationMs: 30_000,
});

const PRIORITY_ORDER: Readonly<Record<MultiAgentPriority, number>> =
  Object.freeze({
    CRITICAL: 0,
    VERY_HIGH: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
    INFORMATIONAL: 5,
  });

const TASK_CAPABILITIES: Readonly<
  Record<MultiAgentTaskType, readonly MultiAgentCapability[]>
> = {
  ANALYZE_CONTEXT: Object.freeze(["OBSERVE_MARKET_INTELLIGENCE"]),
  ASSESS_MARKET: Object.freeze(["OBSERVE_MARKET_INTELLIGENCE"]),
  ASSESS_RISK: Object.freeze(["ASSESS_RISK"]),
  ASSESS_PORTFOLIO: Object.freeze(["ASSESS_PORTFOLIO"]),
  ASSESS_STRATEGY: Object.freeze(["ASSESS_STRATEGY"]),
  ASSESS_ARBITRAGE: Object.freeze(["ASSESS_ARBITRAGE"]),
  GENERATE_PROPOSAL: Object.freeze(["PROPOSE_DECISION"]),
  REVIEW_PROPOSAL: Object.freeze(["REVIEW_PROPOSAL"]),
  CHALLENGE_PROPOSAL: Object.freeze(["CHALLENGE_PROPOSAL"]),
  RESOLVE_CONFLICT: Object.freeze(["ARBITRATE_CONFLICT"]),
  VOTE_ON_PROPOSAL: Object.freeze(["VOTE"]),
  FORM_CONSENSUS: Object.freeze(["FORM_CONSENSUS"]),
  EVALUATE_GOVERNANCE: Object.freeze(["EVALUATE_GOVERNANCE"]),
  BUILD_EXECUTION_PLAN: Object.freeze(["PLAN_EXECUTION"]),
  GENERATE_EXPLANATION: Object.freeze(["EXPLAIN_DECISION"]),
  LEARN_FROM_OUTCOME: Object.freeze(["LEARN_FROM_OUTCOME"]),
};

const TASK_PREFERRED_ROLES: Readonly<
  Record<MultiAgentTaskType, readonly MultiAgentRole[]>
> = {
  ANALYZE_CONTEXT: Object.freeze([
    "MARKET_INTELLIGENCE_AGENT",
    "SUPERVISOR_AGENT",
  ]),
  ASSESS_MARKET: Object.freeze([
    "MARKET_INTELLIGENCE_AGENT",
    "REGIME_ANALYSIS_AGENT",
    "VOLATILITY_AGENT",
    "LIQUIDITY_AGENT",
    "ORDER_FLOW_AGENT",
    "CORRELATION_AGENT",
    "ANOMALY_AGENT",
    "PRICE_PREDICTION_AGENT",
  ]),
  ASSESS_RISK: Object.freeze(["RISK_AGENT"]),
  ASSESS_PORTFOLIO: Object.freeze([
    "PORTFOLIO_CONSTRUCTION_AGENT",
    "STRATEGY_PORTFOLIO_AGENT",
  ]),
  ASSESS_STRATEGY: Object.freeze([
    "STRATEGY_SELECTION_AGENT",
    "STRATEGY_PORTFOLIO_AGENT",
    "META_LEARNING_AGENT",
  ]),
  ASSESS_ARBITRAGE: Object.freeze(["ARBITRAGE_AGENT"]),
  GENERATE_PROPOSAL: Object.freeze([
    "STRATEGY_SELECTION_AGENT",
    "PORTFOLIO_CONSTRUCTION_AGENT",
    "ARBITRAGE_AGENT",
    "SUPERVISOR_AGENT",
  ]),
  REVIEW_PROPOSAL: Object.freeze([
    "RISK_AGENT",
    "GOVERNANCE_AGENT",
    "STRATEGY_PORTFOLIO_AGENT",
  ]),
  CHALLENGE_PROPOSAL: Object.freeze([
    "RISK_AGENT",
    "GOVERNANCE_AGENT",
    "CONFLICT_ARBITER_AGENT",
  ]),
  RESOLVE_CONFLICT: Object.freeze(["CONFLICT_ARBITER_AGENT"]),
  VOTE_ON_PROPOSAL: Object.freeze([
    "RISK_AGENT",
    "GOVERNANCE_AGENT",
    "SUPERVISOR_AGENT",
  ]),
  FORM_CONSENSUS: Object.freeze(["CONSENSUS_COORDINATOR_AGENT"]),
  EVALUATE_GOVERNANCE: Object.freeze(["GOVERNANCE_AGENT"]),
  BUILD_EXECUTION_PLAN: Object.freeze(["EXECUTION_AGENT"]),
  GENERATE_EXPLANATION: Object.freeze(["EXPLAINABILITY_AGENT"]),
  LEARN_FROM_OUTCOME: Object.freeze([
    "META_LEARNING_AGENT",
    "REINFORCEMENT_AGENT",
  ]),
};

const AUTHORITY_REQUIREMENTS: Readonly<
  Partial<Record<MultiAgentTaskType, keyof MultiAgentRegistration["authority"]>>
> = Object.freeze({
  GENERATE_PROPOSAL: "mayPropose",
  REVIEW_PROPOSAL: "mayReview",
  CHALLENGE_PROPOSAL: "mayReview",
  RESOLVE_CONFLICT: "mayArbitrate",
  VOTE_ON_PROPOSAL: "mayVote",
  BUILD_EXECUTION_PLAN: "mayApproveExecution",
});

interface NormalizedOptions {
  readonly maximumTasksPerAgent: number;
  readonly maximumTotalTasks: number;
  readonly allowDegradedAgents: boolean;
  readonly requireHealthyAgents: boolean;
  readonly requireDeterministicAgents: boolean;
  readonly requireReplaySafeAgents: boolean;
  readonly strictPreferredAgents: boolean;
  readonly defaultTaskDurationMs: number;
  readonly weights: MultiAgentTaskRouterWeights;
  readonly taskIdFactory: (prefix: string, seed: string) => MultiAgentTaskId;
  readonly fingerprintFactory: (value: unknown) => string;
}

interface RoutingState {
  readonly assignments: Map<MultiAgentId, MultiAgentTaskId[]>;
  readonly taskIdsByKey: Map<string, MultiAgentTaskId>;
  readonly tasksById: Map<MultiAgentTaskId, MultiAgentTask>;
}

export class MultiAgentTaskRouter {
  private readonly registry: MultiAgentRegistryPort;
  private readonly options: NormalizedOptions;

  public constructor(
    registry: MultiAgentRegistryPort,
    options: MultiAgentTaskRouterOptions = {},
  ) {
    this.registry = registry;
    this.options = normalizeOptions(options);
  }

  public buildBlueprints(request: MultiAgentRunRequest): readonly MultiAgentTaskBlueprint[] {
    const objective = request.objective;
    const blueprints: MultiAgentTaskBlueprint[] = [];

    const add = (
      key: string,
      type: MultiAgentTaskType,
      priority: MultiAgentPriority,
      dependencyKeys: readonly string[] = Object.freeze([]),
      requiredCapabilities?: readonly MultiAgentCapability[],
      preferredRoles?: readonly MultiAgentRole[],
    ): void => {
      blueprints.push({
        key,
        type,
        priority,
        requiredCapabilities:
          requiredCapabilities ?? TASK_CAPABILITIES[type],
        preferredRoles: preferredRoles ?? TASK_PREFERRED_ROLES[type],
        dependencyKeys,
      });
    };

    add("context-analysis", "ANALYZE_CONTEXT", "VERY_HIGH");

    if (
      objective === "MARKET_ASSESSMENT" ||
      objective === "TRADE_DECISION" ||
      objective === "FULL_COLLABORATIVE_DECISION" ||
      objective === "RISK_RESPONSE" ||
      objective === "ARBITRAGE_DECISION"
    ) {
      add("market-assessment", "ASSESS_MARKET", "HIGH", ["context-analysis"]);
    }

    if (
      objective === "TRADE_DECISION" ||
      objective === "PORTFOLIO_REBALANCE" ||
      objective === "RISK_RESPONSE" ||
      objective === "EXECUTION_REVIEW" ||
      objective === "FULL_COLLABORATIVE_DECISION"
    ) {
      add("risk-assessment", "ASSESS_RISK", "CRITICAL", ["context-analysis"]);
    }

    if (
      objective === "PORTFOLIO_REBALANCE" ||
      objective === "STRATEGY_ORCHESTRATION" ||
      objective === "TRADE_DECISION" ||
      objective === "FULL_COLLABORATIVE_DECISION"
    ) {
      add(
        "portfolio-assessment",
        "ASSESS_PORTFOLIO",
        "HIGH",
        ["context-analysis"],
      );
    }

    if (
      objective === "STRATEGY_ORCHESTRATION" ||
      objective === "TRADE_DECISION" ||
      objective === "FULL_COLLABORATIVE_DECISION"
    ) {
      add("strategy-assessment", "ASSESS_STRATEGY", "HIGH", [
        "context-analysis",
      ]);
    }

    if (
      objective === "ARBITRAGE_DECISION" ||
      objective === "FULL_COLLABORATIVE_DECISION"
    ) {
      add("arbitrage-assessment", "ASSESS_ARBITRAGE", "HIGH", [
        "market-assessment",
      ]);
    }

    const assessmentKeys = blueprints
      .filter((blueprint) => blueprint.type.startsWith("ASSESS_"))
      .map((blueprint) => blueprint.key);

    if (objective !== "MARKET_ASSESSMENT") {
      add(
        "proposal-generation",
        "GENERATE_PROPOSAL",
        "VERY_HIGH",
        assessmentKeys.length > 0 ? assessmentKeys : ["context-analysis"],
      );
      add("proposal-review", "REVIEW_PROPOSAL", "VERY_HIGH", [
        "proposal-generation",
      ]);
      add("proposal-vote", "VOTE_ON_PROPOSAL", "VERY_HIGH", [
        "proposal-review",
      ]);
      add("consensus", "FORM_CONSENSUS", "CRITICAL", ["proposal-vote"]);
      add("governance", "EVALUATE_GOVERNANCE", "CRITICAL", ["consensus"]);

      if (
        objective === "TRADE_DECISION" ||
        objective === "PORTFOLIO_REBALANCE" ||
        objective === "ARBITRAGE_DECISION" ||
        objective === "EXECUTION_REVIEW" ||
        objective === "FULL_COLLABORATIVE_DECISION"
      ) {
        add("execution-plan", "BUILD_EXECUTION_PLAN", "CRITICAL", [
          "governance",
        ]);
      }

      add(
        "explanation",
        "GENERATE_EXPLANATION",
        "MEDIUM",
        blueprints.some((item) => item.key === "execution-plan")
          ? ["execution-plan"]
          : ["governance"],
      );
    }

    return deepFreeze(
      blueprints.map((blueprint) => ({
        ...blueprint,
        ...(request.preferredAgentIds !== undefined
          ? { preferredAgentIds: request.preferredAgentIds }
          : {}),
        ...(request.excludedAgentIds !== undefined
          ? { excludedAgentIds: request.excludedAgentIds }
          : {}),
      })),
    );
  }

  public routeRunRequest(
    request: MultiAgentRunRequest,
    runId: MultiAgentRunId,
    sessionId: MultiAgentSessionId,
    selectedAgents?: readonly MultiAgentRegistration[],
  ): MultiAgentTaskRoutingResult {
    return this.route({
      runId,
      sessionId,
      requestedAtMs: request.requestedAtMs,
      context: request.context,
      blueprints: this.buildBlueprints(request),
      ...(selectedAgents !== undefined ? { selectedAgents } : {}),
      ...(request.excludedAgentIds !== undefined
        ? { excludedAgentIds: request.excludedAgentIds }
        : {}),
      maximumTasksPerAgent: this.options.maximumTasksPerAgent,
      maximumTotalTasks: this.options.maximumTotalTasks,
      allowDegradedAgents: request.configuration.agentSelection.allowDegradedAgents,
      requireHealthyAgents: true,
      requireDeterministicAgents:
        request.configuration.requireDeterministicAgents,
      requireReplaySafeAgents:
        request.configuration.requireDeterministicAgents,
      strictPreferredAgents: false,
      inputFingerprintSeed: request.context.deterministicFingerprint,
    });
  }

  public route(request: MultiAgentTaskRoutingRequest): MultiAgentTaskRoutingResult {
    validateRoutingRequest(request);

    const options = mergeRequestOptions(this.options, request);
    const registrations = this.resolveRegistrations(request.selectedAgents);
    const healthByAgent = this.resolveHealth(registrations);
    const excluded = new Set<MultiAgentId>([
      ...(request.excludedAgentIds ?? []),
    ]);
    const orderedBlueprints = topologicallyOrderBlueprints(request.blueprints);

    if (orderedBlueprints.length > options.maximumTotalTasks) {
      throw new MultiAgentTaskRouterError(
        "ROUTING_CAPACITY_EXCEEDED",
        `Task count ${orderedBlueprints.length} exceeds maximumTotalTasks ${options.maximumTotalTasks}.`,
      );
    }

    const state: RoutingState = {
      assignments: new Map<MultiAgentId, MultiAgentTaskId[]>(),
      taskIdsByKey: new Map<string, MultiAgentTaskId>(),
      tasksById: new Map<MultiAgentTaskId, MultiAgentTask>(),
    };

    const decisions: MultiAgentTaskRoutingDecision[] = [];
    const warnings: string[] = [];

    for (const blueprint of orderedBlueprints) {
      const taskId = options.taskIdFactory(
        "multi-agent-task",
        canonicalStringify({
          runId: request.runId,
          sessionId: request.sessionId,
          key: blueprint.key,
          type: blueprint.type,
          inputFingerprintSeed:
            request.inputFingerprintSeed ??
            request.context.deterministicFingerprint,
        }),
      );

      if (state.tasksById.has(taskId)) {
        throw new MultiAgentTaskRouterError(
          "DUPLICATE_TASK_ID",
          `Task id "${taskId}" was generated more than once.`,
          { taskId },
        );
      }

      const requiredCapabilities = uniqueSorted([
        ...TASK_CAPABILITIES[blueprint.type],
        ...blueprint.requiredCapabilities,
      ]);

      const preferredRoles = uniqueSorted([
        ...TASK_PREFERRED_ROLES[blueprint.type],
        ...(blueprint.preferredRoles ?? []),
      ]) as readonly MultiAgentRole[];

      const requiredRoles = uniqueSorted(
        blueprint.requiredRoles ?? [],
      ) as readonly MultiAgentRole[];

      const localExcluded = new Set<MultiAgentId>([
        ...excluded,
        ...(blueprint.excludedAgentIds ?? []),
      ]);

      const candidateScores = registrations
        .map((registration) =>
          scoreCandidate({
            registration,
            health: healthByAgent.get(registration.identity.agentId),
            blueprint,
            requiredCapabilities,
            preferredRoles,
            requiredRoles,
            excludedAgentIds: localExcluded,
            assignments: state.assignments,
            options,
          }),
        )
        .sort(compareCandidateScores);

      const eligible = candidateScores.filter((candidate) => candidate.eligible);

      if (eligible.length === 0) {
        throwNoEligibleAgent(
          blueprint,
          registrations,
          requiredCapabilities,
          requiredRoles,
          candidateScores,
        );
      }

      const selected = eligible[0];
      const registration = registrations.find(
        (candidate) => candidate.identity.agentId === selected.agentId,
      );

      if (registration === undefined) {
        throw new MultiAgentTaskRouterError(
          "NO_ELIGIBLE_AGENT",
          `Selected agent "${selected.agentId}" is not registered.`,
          {
            taskType: blueprint.type,
            agentId: selected.agentId,
          },
        );
      }

      const dependencyIds = (blueprint.dependencyKeys ?? []).map((key) => {
        const dependencyId = state.taskIdsByKey.get(key);

        if (dependencyId === undefined) {
          throw new MultiAgentTaskRouterError(
            "DEPENDENCY_NOT_FOUND",
            `Task blueprint "${blueprint.key}" references unknown dependency "${key}".`,
            {
              taskType: blueprint.type,
            },
          );
        }

        return dependencyId;
      });

      const deadlineAtMs =
        blueprint.deadlineAtMs ??
        safeAddTimestamp(request.requestedAtMs, options.defaultTaskDurationMs);

      const inputFingerprint = options.fingerprintFactory({
        runId: request.runId,
        sessionId: request.sessionId,
        blueprintKey: blueprint.key,
        type: blueprint.type,
        agentId: registration.identity.agentId,
        requiredCapabilities,
        dependencies: dependencyIds,
        contextFingerprint: request.context.deterministicFingerprint,
        seed: request.inputFingerprintSeed ?? "",
      });

      const task: MultiAgentTask = deepFreeze({
        taskId,
        runId: request.runId,
        sessionId: request.sessionId,
        type: blueprint.type,
        status: "ASSIGNED",
        assignedAgentId: registration.identity.agentId,
        ...(blueprint.requestedByAgentId !== undefined
          ? { requestedByAgentId: blueprint.requestedByAgentId }
          : {}),
        priority: blueprint.priority,
        createdAtMs: request.requestedAtMs,
        deadlineAtMs,
        inputFingerprint,
        requiredCapabilities,
        dependencies: Object.freeze([...dependencyIds]),
        ...(blueprint.metadata !== undefined
          ? { metadata: deepFreeze(blueprint.metadata) }
          : {}),
      });

      const rationale = Object.freeze([
        `Selected highest-ranked eligible agent "${registration.identity.agentId}".`,
        `Candidate total score: ${formatScore(selected.totalScore)}.`,
        `Required capability coverage: ${formatScore(selected.capabilityScore)}.`,
        `Reliability score: ${formatScore(selected.reliabilityScore)}.`,
        `Current load score: ${formatScore(selected.loadScore)}.`,
      ]);

      const decisionFingerprint = options.fingerprintFactory({
        blueprintKey: blueprint.key,
        taskId,
        assignedAgentId: registration.identity.agentId,
        candidateScores,
        rationale,
      });

      decisions.push(
        deepFreeze({
          blueprintKey: blueprint.key,
          taskId,
          taskType: blueprint.type,
          assignedAgentId: registration.identity.agentId,
          candidateScores: Object.freeze(candidateScores),
          rationale,
          deterministicFingerprint: decisionFingerprint,
        }),
      );

      state.taskIdsByKey.set(blueprint.key, taskId);
      state.tasksById.set(taskId, task);

      const assigned = state.assignments.get(registration.identity.agentId) ?? [];
      assigned.push(taskId);
      state.assignments.set(registration.identity.agentId, assigned);

      if (selected.totalScore < 0.5) {
        warnings.push(
          `Task "${taskId}" was assigned with a low routing score of ${formatScore(
            selected.totalScore,
          )}.`,
        );
      }
    }

    const tasks = orderedBlueprints.map((blueprint) => {
      const taskId = state.taskIdsByKey.get(blueprint.key);
      const task = taskId === undefined ? undefined : state.tasksById.get(taskId);

      if (task === undefined) {
        throw new MultiAgentTaskRouterError(
          "DEPENDENCY_NOT_FOUND",
          `Routed task for blueprint "${blueprint.key}" was not found.`,
        );
      }

      return task;
    });

    const assignmentsByAgent = Object.freeze(
      Object.fromEntries(
        [...state.assignments.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([agentId, taskIds]) => [
            agentId,
            Object.freeze([...taskIds]),
          ]),
      ) as Record<MultiAgentId, readonly MultiAgentTaskId[]>,
    );

    const orderedTaskIds = Object.freeze(tasks.map((task) => task.taskId));
    const frozenWarnings = Object.freeze(uniqueSorted(warnings));

    const resultFingerprint = options.fingerprintFactory({
      runId: request.runId,
      sessionId: request.sessionId,
      tasks,
      decisions,
      orderedTaskIds,
      assignmentsByAgent,
      warnings: frozenWarnings,
    });

    return deepFreeze({
      runId: request.runId,
      sessionId: request.sessionId,
      tasks: Object.freeze(tasks),
      decisions: Object.freeze(decisions),
      orderedTaskIds,
      assignmentsByAgent,
      warnings: frozenWarnings,
      deterministicFingerprint: resultFingerprint,
    });
  }

  public routeSingle(
    request: Omit<MultiAgentTaskRoutingRequest, "blueprints">,
    blueprint: MultiAgentTaskBlueprint,
  ): MultiAgentTaskRoutingDecision {
    const result = this.route({
      ...request,
      blueprints: Object.freeze([blueprint]),
    });

    const decision = result.decisions[0];

    if (decision === undefined) {
      throw new MultiAgentTaskRouterError(
        "NO_ELIGIBLE_AGENT",
        "No routing decision was produced.",
        { taskType: blueprint.type },
      );
    }

    return decision;
  }

  private resolveRegistrations(
    selectedAgents?: readonly MultiAgentRegistration[],
  ): readonly MultiAgentRegistration[] {
    const source = selectedAgents ?? this.registry.list();
    const byId = new Map<MultiAgentId, MultiAgentRegistration>();

    for (const registration of source) {
      byId.set(registration.identity.agentId, registration);
    }

    return Object.freeze(
      [...byId.values()].sort((left, right) =>
        left.identity.agentId.localeCompare(right.identity.agentId),
      ),
    );
  }

  private resolveHealth(
    registrations: readonly MultiAgentRegistration[],
  ): ReadonlyMap<MultiAgentId, MultiAgentHealthSnapshot | undefined> {
    const result = new Map<
      MultiAgentId,
      MultiAgentHealthSnapshot | undefined
    >();

    for (const registration of registrations) {
      result.set(
        registration.identity.agentId,
        this.registry.health(registration.identity.agentId),
      );
    }

    return result;
  }
}

export function createMultiAgentTaskRouter(
  registry: MultiAgentRegistryPort,
  options: MultiAgentTaskRouterOptions = {},
): MultiAgentTaskRouter {
  return new MultiAgentTaskRouter(registry, options);
}

function scoreCandidate(input: {
  readonly registration: MultiAgentRegistration;
  readonly health: MultiAgentHealthSnapshot | undefined;
  readonly blueprint: MultiAgentTaskBlueprint;
  readonly requiredCapabilities: readonly MultiAgentCapability[];
  readonly preferredRoles: readonly MultiAgentRole[];
  readonly requiredRoles: readonly MultiAgentRole[];
  readonly excludedAgentIds: ReadonlySet<MultiAgentId>;
  readonly assignments: ReadonlyMap<MultiAgentId, readonly MultiAgentTaskId[]>;
  readonly options: NormalizedOptions;
}): MultiAgentTaskCandidateScore {
  const {
    registration,
    health,
    blueprint,
    requiredCapabilities,
    preferredRoles,
    requiredRoles,
    excludedAgentIds,
    assignments,
    options,
  } = input;

  const agentId = registration.identity.agentId;
  const rejectionReasons: string[] = [];
  const capabilityMap = new Map(
    registration.capabilities.map((declaration) => [
      declaration.capability,
      declaration,
    ]),
  );

  if (excludedAgentIds.has(agentId)) {
    rejectionReasons.push("Agent is excluded.");
  }

  const preferredAgentIds = blueprint.preferredAgentIds ?? [];
  if (
    options.strictPreferredAgents &&
    preferredAgentIds.length > 0 &&
    !preferredAgentIds.includes(agentId)
  ) {
    rejectionReasons.push("Agent is not in the strict preferred-agent set.");
  }

  if (
    requiredRoles.length > 0 &&
    !requiredRoles.includes(registration.identity.role)
  ) {
    rejectionReasons.push("Agent role does not satisfy a required role.");
  }

  for (const capability of requiredCapabilities) {
    const declaration = capabilityMap.get(capability);

    if (declaration === undefined || !declaration.enabled) {
      rejectionReasons.push(`Required capability "${capability}" is unavailable.`);
    }
  }

  const authorityRequirement = AUTHORITY_REQUIREMENTS[blueprint.type];
  if (
    authorityRequirement !== undefined &&
    registration.authority[authorityRequirement] !== true
  ) {
    rejectionReasons.push(
      `Authority requirement "${String(authorityRequirement)}" is not satisfied.`,
    );
  }

  if (options.requireDeterministicAgents && !registration.deterministic) {
    rejectionReasons.push("Agent is not deterministic.");
  }

  if (options.requireReplaySafeAgents && !registration.replaySafe) {
    rejectionReasons.push("Agent is not replay-safe.");
  }

  if (health === undefined) {
    if (options.requireHealthyAgents) {
      rejectionReasons.push("Agent health snapshot is unavailable.");
    }
  } else {
    if (options.requireHealthyAgents && !health.healthy) {
      rejectionReasons.push("Agent is not healthy.");
    }

    if (
      health.lifecycleState !== "READY" &&
      health.lifecycleState !== "ACTIVE" &&
      !(options.allowDegradedAgents && health.lifecycleState === "DEGRADED")
    ) {
      rejectionReasons.push(
        `Lifecycle state "${health.lifecycleState}" is not routable.`,
      );
    }

    if (!isRoutableAvailability(health.availability)) {
      rejectionReasons.push(
        `Availability "${health.availability}" is not routable.`,
      );
    }
  }

  const assignedCount = assignments.get(agentId)?.length ?? 0;
  if (assignedCount >= options.maximumTasksPerAgent) {
    rejectionReasons.push(
      `Agent reached maximum task capacity ${options.maximumTasksPerAgent}.`,
    );
  }

  const capabilityDeclarations = requiredCapabilities
    .map((capability) => capabilityMap.get(capability))
    .filter(
      (
        declaration,
      ): declaration is NonNullable<typeof declaration> =>
        declaration !== undefined && declaration.enabled,
    );

  const capabilityScore =
    requiredCapabilities.length === 0
      ? 1
      : capabilityDeclarations.length / requiredCapabilities.length;

  const proficiencyScore =
    capabilityDeclarations.length === 0
      ? 0
      : average(
          capabilityDeclarations.map((declaration) =>
            clamp01(declaration.proficiency),
          ),
        );

  const readinessScore = clamp01(health?.readinessScore ?? 0);
  const reliabilityScore = clamp01(health?.reliabilityScore ?? 0);
  const latencyScore = clamp01(health?.latencyScore ?? 0);
  const dataFreshnessScore = clamp01(health?.dataFreshnessScore ?? 0);
  const roleScore = preferredRoles.includes(registration.identity.role) ? 1 : 0;
  const preferenceScore = preferredAgentIds.includes(agentId)
    ? 1
    : preferredAgentIds.length === 0
      ? 0.5
      : 0;
  const loadScore = clamp01(
    1 - assignedCount / options.maximumTasksPerAgent,
  );
  const deterministicScore =
    registration.deterministic && registration.replaySafe ? 1 : 0;

  const weights = options.weights;
  const totalScore = clamp01(
    capabilityScore * weights.capability +
      proficiencyScore * weights.proficiency +
      readinessScore * weights.readiness +
      reliabilityScore * weights.reliability +
      latencyScore * weights.latency +
      dataFreshnessScore * weights.dataFreshness +
      roleScore * weights.role +
      preferenceScore * weights.preference +
      loadScore * weights.load +
      deterministicScore * weights.deterministic,
  );

  return deepFreeze({
    agentId,
    eligible: rejectionReasons.length === 0,
    totalScore,
    capabilityScore,
    proficiencyScore,
    readinessScore,
    reliabilityScore,
    latencyScore,
    dataFreshnessScore,
    roleScore,
    preferenceScore,
    loadScore,
    deterministicScore,
    rejectionReasons: Object.freeze(uniqueSorted(rejectionReasons)),
  });
}

function compareCandidateScores(
  left: MultiAgentTaskCandidateScore,
  right: MultiAgentTaskCandidateScore,
): number {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }

  const totalDifference = right.totalScore - left.totalScore;
  if (Math.abs(totalDifference) > Number.EPSILON) {
    return totalDifference;
  }

  const reliabilityDifference =
    right.reliabilityScore - left.reliabilityScore;
  if (Math.abs(reliabilityDifference) > Number.EPSILON) {
    return reliabilityDifference;
  }

  const proficiencyDifference =
    right.proficiencyScore - left.proficiencyScore;
  if (Math.abs(proficiencyDifference) > Number.EPSILON) {
    return proficiencyDifference;
  }

  const loadDifference = right.loadScore - left.loadScore;
  if (Math.abs(loadDifference) > Number.EPSILON) {
    return loadDifference;
  }

  return left.agentId.localeCompare(right.agentId);
}

function topologicallyOrderBlueprints(
  blueprints: readonly MultiAgentTaskBlueprint[],
): readonly MultiAgentTaskBlueprint[] {
  const byKey = new Map<string, MultiAgentTaskBlueprint>();

  for (const blueprint of blueprints) {
    validateBlueprint(blueprint);

    if (byKey.has(blueprint.key)) {
      throw new MultiAgentTaskRouterError(
        "INVALID_TASK_BLUEPRINT",
        `Duplicate task blueprint key "${blueprint.key}".`,
        { taskType: blueprint.type },
      );
    }

    byKey.set(blueprint.key, blueprint);
  }

  for (const blueprint of blueprints) {
    for (const dependencyKey of blueprint.dependencyKeys ?? []) {
      if (!byKey.has(dependencyKey)) {
        throw new MultiAgentTaskRouterError(
          "DEPENDENCY_NOT_FOUND",
          `Task blueprint "${blueprint.key}" references unknown dependency "${dependencyKey}".`,
          { taskType: blueprint.type },
        );
      }
    }
  }

  const permanent = new Set<string>();
  const temporary = new Set<string>();
  const result: MultiAgentTaskBlueprint[] = [];

  const visit = (blueprint: MultiAgentTaskBlueprint): void => {
    if (permanent.has(blueprint.key)) {
      return;
    }

    if (temporary.has(blueprint.key)) {
      throw new MultiAgentTaskRouterError(
        "CYCLIC_DEPENDENCY",
        `Cyclic task dependency detected at "${blueprint.key}".`,
        { taskType: blueprint.type },
      );
    }

    temporary.add(blueprint.key);

    const dependencies = [...(blueprint.dependencyKeys ?? [])]
      .map((key) => byKey.get(key))
      .filter(
        (dependency): dependency is MultiAgentTaskBlueprint =>
          dependency !== undefined,
      )
      .sort(compareBlueprints);

    for (const dependency of dependencies) {
      visit(dependency);
    }

    temporary.delete(blueprint.key);
    permanent.add(blueprint.key);
    result.push(blueprint);
  };

  for (const blueprint of [...blueprints].sort(compareBlueprints)) {
    visit(blueprint);
  }

  return Object.freeze(result);
}

function compareBlueprints(
  left: MultiAgentTaskBlueprint,
  right: MultiAgentTaskBlueprint,
): number {
  const priorityDifference =
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const typeDifference = left.type.localeCompare(right.type);
  if (typeDifference !== 0) {
    return typeDifference;
  }

  return left.key.localeCompare(right.key);
}

function validateRoutingRequest(request: MultiAgentTaskRoutingRequest): void {
  assertNonEmptyText(request.runId, "runId");
  assertNonEmptyText(request.sessionId, "sessionId");
  assertTimestamp(request.requestedAtMs, "requestedAtMs");

  if (!Array.isArray(request.blueprints) || request.blueprints.length === 0) {
    throw new MultiAgentTaskRouterError(
      "INVALID_ROUTING_REQUEST",
      "blueprints must contain at least one task blueprint.",
    );
  }

  if (
    request.maximumTasksPerAgent !== undefined &&
    (!Number.isInteger(request.maximumTasksPerAgent) ||
      request.maximumTasksPerAgent <= 0)
  ) {
    throw new MultiAgentTaskRouterError(
      "INVALID_ROUTING_REQUEST",
      "maximumTasksPerAgent must be a positive integer.",
    );
  }

  if (
    request.maximumTotalTasks !== undefined &&
    (!Number.isInteger(request.maximumTotalTasks) ||
      request.maximumTotalTasks <= 0)
  ) {
    throw new MultiAgentTaskRouterError(
      "INVALID_ROUTING_REQUEST",
      "maximumTotalTasks must be a positive integer.",
    );
  }
}

function validateBlueprint(blueprint: MultiAgentTaskBlueprint): void {
  assertNonEmptyText(blueprint.key, "blueprint.key");

  if (!Array.isArray(blueprint.requiredCapabilities)) {
    throw new MultiAgentTaskRouterError(
      "INVALID_TASK_BLUEPRINT",
      `Task blueprint "${blueprint.key}" has invalid requiredCapabilities.`,
      { taskType: blueprint.type },
    );
  }

  if (
    blueprint.deadlineAtMs !== undefined &&
    (!Number.isSafeInteger(blueprint.deadlineAtMs) ||
      blueprint.deadlineAtMs < 0)
  ) {
    throw new MultiAgentTaskRouterError(
      "INVALID_TASK_BLUEPRINT",
      `Task blueprint "${blueprint.key}" has an invalid deadlineAtMs.`,
      { taskType: blueprint.type },
    );
  }

  for (const dependencyKey of blueprint.dependencyKeys ?? []) {
    assertNonEmptyText(dependencyKey, "dependencyKeys[]");
    if (dependencyKey === blueprint.key) {
      throw new MultiAgentTaskRouterError(
        "CYCLIC_DEPENDENCY",
        `Task blueprint "${blueprint.key}" cannot depend on itself.`,
        { taskType: blueprint.type },
      );
    }
  }
}

function throwNoEligibleAgent(
  blueprint: MultiAgentTaskBlueprint,
  registrations: readonly MultiAgentRegistration[],
  requiredCapabilities: readonly MultiAgentCapability[],
  requiredRoles: readonly MultiAgentRole[],
  candidateScores: readonly MultiAgentTaskCandidateScore[],
): never {
  const availableCapabilities = new Set(
    registrations.flatMap((registration) =>
      registration.capabilities
        .filter((capability) => capability.enabled)
        .map((capability) => capability.capability),
    ),
  );

  for (const capability of requiredCapabilities) {
    if (!availableCapabilities.has(capability)) {
      throw new MultiAgentTaskRouterError(
        "REQUIRED_CAPABILITY_UNAVAILABLE",
        `No registered agent provides required capability "${capability}" for task "${blueprint.key}".`,
        {
          taskType: blueprint.type,
          capability,
          candidateAgentIds: candidateScores.map((candidate) => candidate.agentId),
        },
      );
    }
  }

  if (
    requiredRoles.length > 0 &&
    !registrations.some((registration) =>
      requiredRoles.includes(registration.identity.role),
    )
  ) {
    throw new MultiAgentTaskRouterError(
      "REQUIRED_ROLE_UNAVAILABLE",
      `No registered agent satisfies a required role for task "${blueprint.key}".`,
      {
        taskType: blueprint.type,
        role: requiredRoles[0],
        candidateAgentIds: candidateScores.map((candidate) => candidate.agentId),
      },
    );
  }

  throw new MultiAgentTaskRouterError(
    "NO_ELIGIBLE_AGENT",
    `No eligible agent could be selected for task "${blueprint.key}" (${blueprint.type}).`,
    {
      taskType: blueprint.type,
      candidateAgentIds: candidateScores.map((candidate) => candidate.agentId),
    },
  );
}

function normalizeOptions(
  options: MultiAgentTaskRouterOptions,
): NormalizedOptions {
  const maximumTasksPerAgent =
    options.maximumTasksPerAgent ?? DEFAULT_OPTIONS.maximumTasksPerAgent;
  const maximumTotalTasks =
    options.maximumTotalTasks ?? DEFAULT_OPTIONS.maximumTotalTasks;
  const defaultTaskDurationMs =
    options.defaultTaskDurationMs ?? DEFAULT_OPTIONS.defaultTaskDurationMs;

  assertPositiveInteger(maximumTasksPerAgent, "maximumTasksPerAgent");
  assertPositiveInteger(maximumTotalTasks, "maximumTotalTasks");
  assertPositiveInteger(defaultTaskDurationMs, "defaultTaskDurationMs");

  const weights = normalizeWeights({
    ...DEFAULT_WEIGHTS,
    ...(options.weights ?? {}),
  });

  return Object.freeze({
    maximumTasksPerAgent,
    maximumTotalTasks,
    allowDegradedAgents:
      options.allowDegradedAgents ?? DEFAULT_OPTIONS.allowDegradedAgents,
    requireHealthyAgents:
      options.requireHealthyAgents ?? DEFAULT_OPTIONS.requireHealthyAgents,
    requireDeterministicAgents:
      options.requireDeterministicAgents ??
      DEFAULT_OPTIONS.requireDeterministicAgents,
    requireReplaySafeAgents:
      options.requireReplaySafeAgents ??
      DEFAULT_OPTIONS.requireReplaySafeAgents,
    strictPreferredAgents:
      options.strictPreferredAgents ?? DEFAULT_OPTIONS.strictPreferredAgents,
    defaultTaskDurationMs,
    weights,
    taskIdFactory: options.taskIdFactory ?? defaultIdFactory,
    fingerprintFactory:
      options.fingerprintFactory ?? defaultFingerprintFactory,
  });
}

function mergeRequestOptions(
  base: NormalizedOptions,
  request: MultiAgentTaskRoutingRequest,
): NormalizedOptions {
  const maximumTasksPerAgent =
    request.maximumTasksPerAgent ?? base.maximumTasksPerAgent;
  const maximumTotalTasks =
    request.maximumTotalTasks ?? base.maximumTotalTasks;

  assertPositiveInteger(maximumTasksPerAgent, "maximumTasksPerAgent");
  assertPositiveInteger(maximumTotalTasks, "maximumTotalTasks");

  return Object.freeze({
    ...base,
    maximumTasksPerAgent,
    maximumTotalTasks,
    allowDegradedAgents:
      request.allowDegradedAgents ?? base.allowDegradedAgents,
    requireHealthyAgents:
      request.requireHealthyAgents ?? base.requireHealthyAgents,
    requireDeterministicAgents:
      request.requireDeterministicAgents ??
      base.requireDeterministicAgents,
    requireReplaySafeAgents:
      request.requireReplaySafeAgents ??
      base.requireReplaySafeAgents,
    strictPreferredAgents:
      request.strictPreferredAgents ?? base.strictPreferredAgents,
  });
}

function normalizeWeights(
  weights: MultiAgentTaskRouterWeights,
): MultiAgentTaskRouterWeights {
  const entries = Object.entries(weights) as readonly [
    keyof MultiAgentTaskRouterWeights,
    number,
  ][];

  for (const [name, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`weights.${name} must be a finite non-negative number.`);
    }
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    throw new RangeError("At least one routing weight must be greater than zero.");
  }

  return Object.freeze({
    capability: weights.capability / total,
    proficiency: weights.proficiency / total,
    readiness: weights.readiness / total,
    reliability: weights.reliability / total,
    latency: weights.latency / total,
    dataFreshness: weights.dataFreshness / total,
    role: weights.role / total,
    preference: weights.preference / total,
    load: weights.load / total,
    deterministic: weights.deterministic / total,
  });
}

function isRoutableAvailability(
  availability: MultiAgentAvailability,
): boolean {
  return availability === "AVAILABLE" || availability === "UNKNOWN";
}

function safeAddTimestamp(
  timestamp: MultiAgentTimestamp,
  durationMs: number,
): MultiAgentTimestamp {
  const result = timestamp + durationMs;

  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Task deadline exceeds the safe integer range.");
  }

  return result as MultiAgentTimestamp;
}

function defaultIdFactory(prefix: string, seed: string): MultiAgentTaskId {
  return `${prefix}-${fnv1a64(seed)}`;
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

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): readonly TValue[] {
  return Object.freeze([...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  ));
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function formatScore(value: number): string {
  return value.toFixed(6);
}

function assertNonEmptyText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MultiAgentTaskRouterError(
      "INVALID_ROUTING_REQUEST",
      `${name} must be a non-empty string.`,
    );
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MultiAgentTaskRouterError(
      "INVALID_ROUTING_REQUEST",
      `${name} must be a non-negative safe integer timestamp.`,
    );
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}