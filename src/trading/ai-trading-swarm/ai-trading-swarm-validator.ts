/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/ai-trading-swarm-validator.ts
 *
 * Deterministic, side-effect-free validator for the public Milestone 39
 * contracts. Validation results and issues are deeply immutable.
 */

import {
  AI_TRADING_SWARM_SCHEMA_VERSION,
  TRADING_SWARM_NORMALIZED_MAXIMUM,
  TRADING_SWARM_NORMALIZED_MINIMUM,
  type AiTradingSwarmConfiguration,
  type AiTradingSwarmRunRequest,
  type TradingSwarmCapability,
  type TradingSwarmCollectiveDecision,
  type TradingSwarmDecisionAction,
  type TradingSwarmFormationPolicy,
  type TradingSwarmGovernanceAssessment,
  type TradingSwarmMission,
  type TradingSwarmMissionConstraints,
  type TradingSwarmNodeRegistration,
  type TradingSwarmPartitionPolicy,
  type TradingSwarmQuorumPolicy,
  type TradingSwarmRiskAssessment,
  type TradingSwarmSafetyPolicy,
  type TradingSwarmValidatorPort,
} from "./ai-trading-swarm-contracts";

import type {
  MultiAgentJsonValue,
  MultiAgentValidationIssue,
  MultiAgentValidationResult,
  MultiAgentValidationSeverity,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

export type AiTradingSwarmValidationErrorCode =
  | "INVALID_VALUE"
  | "INVALID_TYPE"
  | "INVALID_RANGE"
  | "INVALID_RELATIONSHIP"
  | "DUPLICATE_VALUE"
  | "MISSING_REQUIRED_VALUE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "CAPABILITY_COVERAGE_MISSING"
  | "AUTHORITY_VIOLATION"
  | "EXECUTION_POLICY_VIOLATION"
  | "GOVERNANCE_VIOLATION"
  | "DETERMINISM_VIOLATION";

export class AiTradingSwarmValidationError extends Error {
  public readonly code: AiTradingSwarmValidationErrorCode;
  public readonly issues: readonly MultiAgentValidationIssue[];

  public constructor(
    code: AiTradingSwarmValidationErrorCode,
    message: string,
    issues: readonly MultiAgentValidationIssue[] = Object.freeze([]),
  ) {
    super(message);
    this.name = "AiTradingSwarmValidationError";
    this.code = code;
    this.issues = deepFreeze([...issues]);
  }
}

export interface AiTradingSwarmValidatorOptions {
  readonly requireFrozenInputs?: boolean;
  readonly requireDeterministicFingerprint?: boolean;
  readonly rejectUnknownSchemaVersion?: boolean;
  readonly maximumIssueCount?: number;
}

interface NormalizedValidatorOptions {
  readonly requireFrozenInputs: boolean;
  readonly requireDeterministicFingerprint: boolean;
  readonly rejectUnknownSchemaVersion: boolean;
  readonly maximumIssueCount: number;
}

interface ValidationContext {
  readonly issues: MultiAgentValidationIssue[];
  readonly options: NormalizedValidatorOptions;
}

const SWARM_NODE_ROLES = new Set<string>([
  "LEADER",
  "COORDINATOR",
  "WORKER",
  "OBSERVER",
  "REPLICA",
  "ARBITER",
  "GOVERNOR",
  "EXECUTOR",
  "SUPERVISOR",
]);

const SWARM_KINDS = new Set<string>([
  "MARKET_INTELLIGENCE_SWARM",
  "STRATEGY_DISCOVERY_SWARM",
  "STRATEGY_SELECTION_SWARM",
  "PORTFOLIO_SWARM",
  "RISK_SWARM",
  "EXECUTION_SWARM",
  "ARBITRAGE_SWARM",
  "LIQUIDITY_SWARM",
  "REGIME_SWARM",
  "META_LEARNING_SWARM",
  "GOVERNANCE_SWARM",
  "EXPLAINABILITY_SWARM",
  "SUPERVISORY_SWARM",
  "CROSS_FUNCTIONAL_SWARM",
  "CUSTOM",
]);

const SWARM_TOPOLOGIES = new Set<string>([
  "CENTRALIZED",
  "LEADER_FOLLOWER",
  "HIERARCHICAL",
  "FEDERATED",
  "MESH",
  "SHARDED",
  "HYBRID",
]);

const COORDINATION_MODES = new Set<string>([
  "SYNCHRONOUS",
  "ASYNCHRONOUS",
  "EVENT_DRIVEN",
  "ROUND_BASED",
  "GOSSIP",
  "HYBRID",
]);

const AUTONOMY_LEVELS = new Set<string>([
  "OBSERVE_ONLY",
  "RECOMMEND_ONLY",
  "PLAN_ONLY",
  "SEMI_AUTONOMOUS",
  "FULLY_AUTONOMOUS",
]);

const MISSION_OBJECTIVES = new Set<string>([
  "GLOBAL_MARKET_ASSESSMENT",
  "DISTRIBUTED_TRADE_DECISION",
  "CROSS_MARKET_STRATEGY_SELECTION",
  "DISTRIBUTED_PORTFOLIO_REBALANCE",
  "SYSTEMIC_RISK_RESPONSE",
  "DISTRIBUTED_ARBITRAGE_DISCOVERY",
  "CROSS_EXCHANGE_EXECUTION",
  "LIQUIDITY_COORDINATION",
  "REGIME_TRANSITION_RESPONSE",
  "AUTONOMOUS_SWARM_OPTIMIZATION",
  "DISASTER_RECOVERY",
  "FULL_SWARM_DECISION",
]);

const MISSION_STATUSES = new Set<string>([
  "CREATED",
  "VALIDATING",
  "PLANNING",
  "PARTITIONING",
  "ASSIGNING",
  "RUNNING",
  "COORDINATING",
  "FORMING_CONSENSUS",
  "GOVERNING",
  "PLANNING_EXECUTION",
  "EXECUTING",
  "MONITORING",
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "DEFERRED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

const PRIORITIES = new Set<string>([
  "BACKGROUND",
  "LOW",
  "NORMAL",
  "HIGH",
  "VERY_HIGH",
  "CRITICAL",
  "EMERGENCY",
]);

const DECISIONS = new Set<string>([
  "EXECUTE",
  "EXECUTE_WITH_RESTRICTIONS",
  "SIGNAL_ONLY",
  "HOLD",
  "DEFER",
  "REJECT",
  "PAUSE_SYSTEM",
  "RECOVER_SYSTEM",
]);

const ACTION_TYPES = new Set<string>([
  "PLACE_ORDER",
  "CANCEL_ORDER",
  "REPLACE_ORDER",
  "ALLOCATE_CAPITAL",
  "REDUCE_EXPOSURE",
  "CLOSE_POSITION",
  "ROTATE_STRATEGY",
  "PAUSE_STRATEGY",
  "RESUME_STRATEGY",
  "REBALANCE_PORTFOLIO",
  "EXECUTE_ARBITRAGE",
  "HEDGE_RISK",
  "REPARTITION_SWARM",
  "MIGRATE_WORKLOAD",
  "NO_ACTION",
]);

const CAPABILITIES = new Set<string>([
  "DISTRIBUTE_MARKET_ANALYSIS",
  "DISTRIBUTE_STRATEGY_ANALYSIS",
  "DISTRIBUTE_RISK_ANALYSIS",
  "DISTRIBUTE_PORTFOLIO_ANALYSIS",
  "DISTRIBUTE_ARBITRAGE_ANALYSIS",
  "COORDINATE_MULTI_AGENT_RUNS",
  "FORM_DISTRIBUTED_CONSENSUS",
  "ELECT_LEADER",
  "MANAGE_PARTITIONS",
  "REPLICATE_STATE",
  "RECOVER_FAILED_NODES",
  "MIGRATE_WORKLOAD",
  "BALANCE_WORKLOAD",
  "PLAN_DISTRIBUTED_EXECUTION",
  "AUTHORIZE_EXECUTION",
  "EXECUTE_TRADES",
  "MONITOR_EXECUTION",
  "ROLLBACK_EXECUTION",
  "PUBLISH_SWARM_EVENTS",
  "PERSIST_CHECKPOINTS",
  "LEARN_FROM_OUTCOMES",
  "UPDATE_SWARM_TRUST",
  "EXPLAIN_SWARM_DECISIONS",
  "ENFORCE_GOVERNANCE",
  "ESCALATE_TO_OPERATOR",
]);

const EXECUTABLE_DECISIONS = new Set<string>([
  "EXECUTE",
  "EXECUTE_WITH_RESTRICTIONS",
]);

const EXECUTION_ACTIONS = new Set<string>([
  "PLACE_ORDER",
  "CANCEL_ORDER",
  "REPLACE_ORDER",
  "ALLOCATE_CAPITAL",
  "REDUCE_EXPOSURE",
  "CLOSE_POSITION",
  "REBALANCE_PORTFOLIO",
  "EXECUTE_ARBITRAGE",
  "HEDGE_RISK",
]);

export class AiTradingSwarmValidator
  implements TradingSwarmValidatorPort
{
  private readonly options: NormalizedValidatorOptions;

  public constructor(options: AiTradingSwarmValidatorOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public validateRequest(
    request: AiTradingSwarmRunRequest,
  ): MultiAgentValidationResult<AiTradingSwarmRunRequest> {
    const context = this.createContext();

    this.validateObject(request, "$", context);
    this.validateNonEmptyText(request.requestId, "$.requestId", context);
    this.validateTimestamp(
      request.requestedAtMs,
      "$.requestedAtMs",
      context,
    );
    this.validateNonEmptyText(request.swarmId, "$.swarmId", context);
    this.validateEnum(
      request.objective,
      MISSION_OBJECTIVES,
      "$.objective",
      context,
    );

    this.validateConfigurationInternal(
      request.configuration,
      "$.configuration",
      context,
    );

    this.validateObject(request.context, "$.context", context);
    this.validateNonEmptyText(
      request.context.deterministicFingerprint,
      "$.context.deterministicFingerprint",
      context,
    );
    this.validateTimestamp(
      request.context.builtAtMs,
      "$.context.builtAtMs",
      context,
    );

    if (
      request.context.builtAtMs > request.requestedAtMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        "$.context.builtAtMs",
        "ERROR",
        "Context build time cannot be later than the request time.",
        request.context.builtAtMs,
        "<= requestedAtMs",
      );
    }

    const contextAge =
      request.requestedAtMs - request.context.builtAtMs;
    if (
      Number.isFinite(contextAge) &&
      contextAge > request.configuration.maximumContextAgeMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        "$.context.builtAtMs",
        "ERROR",
        "The supplied swarm context is older than the configured maximum.",
        contextAge,
        `<= ${request.configuration.maximumContextAgeMs}`,
      );
    }

    this.validateOptionalUniqueTextArray(
      request.marketIds,
      "$.marketIds",
      context,
    );
    this.validateOptionalUniqueTextArray(
      request.strategyIds,
      "$.strategyIds",
      context,
    );
    this.validateOptionalUniqueTextArray(
      request.preferredNodeIds,
      "$.preferredNodeIds",
      context,
    );
    this.validateOptionalUniqueTextArray(
      request.excludedNodeIds,
      "$.excludedNodeIds",
      context,
    );

    if (
      request.preferredNodeIds !== undefined &&
      request.excludedNodeIds !== undefined
    ) {
      const excluded = new Set(request.excludedNodeIds);
      for (const nodeId of request.preferredNodeIds) {
        if (excluded.has(nodeId)) {
          this.issue(
            context,
            "INVALID_RELATIONSHIP",
            "$.preferredNodeIds",
            "ERROR",
            `Node "${nodeId}" cannot be both preferred and excluded.`,
            nodeId,
          );
        }
      }
    }

    if (request.requiredNodeRoles !== undefined) {
      this.validateUniqueEnumArray(
        request.requiredNodeRoles,
        SWARM_NODE_ROLES,
        "$.requiredNodeRoles",
        context,
      );
    }

    if (request.requiredCapabilities !== undefined) {
      this.validateCapabilities(
        request.requiredCapabilities,
        "$.requiredCapabilities",
        context,
      );
    }

    if (request.constraints !== undefined) {
      this.validateMissionConstraints(
        request.constraints,
        "$.constraints",
        context,
      );
    }

    this.validateFrozenIfRequired(request, "$", context);
    return this.result(request, context);
  }

  public validateConfiguration(
    configuration: AiTradingSwarmConfiguration,
  ): MultiAgentValidationResult<AiTradingSwarmConfiguration> {
    const context = this.createContext();
    this.validateConfigurationInternal(
      configuration,
      "$",
      context,
    );
    this.validateFrozenIfRequired(configuration, "$", context);
    return this.result(configuration, context);
  }

  public validateNode(
    node: TradingSwarmNodeRegistration,
  ): MultiAgentValidationResult<TradingSwarmNodeRegistration> {
    const context = this.createContext();

    this.validateObject(node, "$", context);
    this.validateNonEmptyText(
      node.identity.nodeId,
      "$.identity.nodeId",
      context,
    );
    this.validateNonEmptyText(
      node.identity.swarmId,
      "$.identity.swarmId",
      context,
    );
    this.validateNonEmptyText(
      node.identity.name,
      "$.identity.name",
      context,
    );
    this.validateEnum(
      node.identity.role,
      SWARM_NODE_ROLES,
      "$.identity.role",
      context,
    );
    this.validateNonEmptyText(
      node.identity.version,
      "$.identity.version",
      context,
    );

    this.validatePositiveInteger(
      node.capacity.maximumConcurrentMissions,
      "$.capacity.maximumConcurrentMissions",
      context,
    );
    this.validatePositiveInteger(
      node.capacity.maximumConcurrentTasks,
      "$.capacity.maximumConcurrentTasks",
      context,
    );
    this.validatePositiveInteger(
      node.capacity.maximumAgentRuns,
      "$.capacity.maximumAgentRuns",
      context,
    );
    this.validateNonNegativeInteger(
      node.capacity.maximumMemoryRecords,
      "$.capacity.maximumMemoryRecords",
      context,
    );
    this.validatePositiveFinite(
      node.capacity.computeUnits,
      "$.capacity.computeUnits",
      context,
    );
    this.validatePositiveFinite(
      node.capacity.memoryUnits,
      "$.capacity.memoryUnits",
      context,
    );
    this.validatePositiveFinite(
      node.capacity.networkUnits,
      "$.capacity.networkUnits",
      context,
    );

    if (node.capabilities.length === 0) {
      this.issue(
        context,
        "MISSING_REQUIRED_VALUE",
        "$.capabilities",
        "ERROR",
        "A swarm node must declare at least one capability.",
      );
    }

    const capabilityNames: TradingSwarmCapability[] = [];
    node.capabilities.forEach((declaration, index) => {
      const path = `$.capabilities[${index}]`;
      this.validateEnum(
        declaration.capability,
        CAPABILITIES,
        `${path}.capability`,
        context,
      );
      capabilityNames.push(declaration.capability);
      this.validateNormalized(
        declaration.proficiency,
        `${path}.proficiency`,
        context,
      );
      this.validateNormalized(
        declaration.confidenceFloor,
        `${path}.confidenceFloor`,
        context,
      );
      this.validateOptionalUniqueTextArray(
        declaration.supportedMarkets,
        `${path}.supportedMarkets`,
        context,
      );
      this.validateOptionalUniqueTextArray(
        declaration.supportedStrategies,
        `${path}.supportedStrategies`,
        context,
      );
    });
    this.validateUniqueValues(
      capabilityNames,
      "$.capabilities",
      context,
    );

    this.validateAuthority(node, context);
    this.validateTimestamp(
      node.registeredAtMs,
      "$.registeredAtMs",
      context,
    );
    this.validateNonEmptyText(
      node.configurationVersion,
      "$.configurationVersion",
      context,
    );

    if (!node.deterministic) {
      this.issue(
        context,
        "DETERMINISM_VIOLATION",
        "$.deterministic",
        "ERROR",
        "Milestone 39 swarm nodes must be deterministic.",
        false,
        "true",
      );
    }

    if (!node.replaySafe) {
      this.issue(
        context,
        "DETERMINISM_VIOLATION",
        "$.replaySafe",
        "ERROR",
        "Milestone 39 swarm nodes must be replay-safe.",
        false,
        "true",
      );
    }

    if (
      node.authority.mayExecuteTrades &&
      !node.capabilities.some(
        (capability) =>
          capability.enabled &&
          capability.capability === "EXECUTE_TRADES",
      )
    ) {
      this.issue(
        context,
        "CAPABILITY_COVERAGE_MISSING",
        "$.authority.mayExecuteTrades",
        "ERROR",
        "A node with trade-execution authority must declare EXECUTE_TRADES.",
      );
    }

    if (
      node.authority.mayElectLeader &&
      !node.capabilities.some(
        (capability) =>
          capability.enabled &&
          capability.capability === "ELECT_LEADER",
      )
    ) {
      this.issue(
        context,
        "CAPABILITY_COVERAGE_MISSING",
        "$.authority.mayElectLeader",
        "ERROR",
        "A node with leader-election authority must declare ELECT_LEADER.",
      );
    }

    this.validateFrozenIfRequired(node, "$", context);
    return this.result(node, context);
  }

  public validateMission(
    mission: TradingSwarmMission,
  ): MultiAgentValidationResult<TradingSwarmMission> {
    const context = this.createContext();

    this.validateObject(mission, "$", context);
    this.validateNonEmptyText(
      mission.missionId,
      "$.missionId",
      context,
    );
    this.validateNonEmptyText(mission.swarmId, "$.swarmId", context);
    this.validateNonEmptyText(mission.runId, "$.runId", context);
    this.validateEnum(
      mission.objective,
      MISSION_OBJECTIVES,
      "$.objective",
      context,
    );
    this.validateEnum(
      mission.status,
      MISSION_STATUSES,
      "$.status",
      context,
    );
    this.validateEnum(
      mission.priority,
      PRIORITIES,
      "$.priority",
      context,
    );
    this.validateNonEmptyText(
      mission.requestedBy,
      "$.requestedBy",
      context,
    );
    this.validateUniqueTextArray(
      mission.marketIds,
      "$.marketIds",
      context,
    );
    this.validateUniqueTextArray(
      mission.strategyIds,
      "$.strategyIds",
      context,
    );
    this.validateUniqueTextArray(
      mission.partitionIds,
      "$.partitionIds",
      context,
    );
    this.validateMissionConstraints(
      mission.constraints,
      "$.constraints",
      context,
    );
    this.validateTimestamp(
      mission.createdAtMs,
      "$.createdAtMs",
      context,
    );

    if (mission.deadlineAtMs !== undefined) {
      this.validateTimestamp(
        mission.deadlineAtMs,
        "$.deadlineAtMs",
        context,
      );
      if (mission.deadlineAtMs < mission.createdAtMs) {
        this.issue(
          context,
          "INVALID_RELATIONSHIP",
          "$.deadlineAtMs",
          "ERROR",
          "Mission deadline cannot precede mission creation.",
          mission.deadlineAtMs,
          ">= createdAtMs",
        );
      }
    }

    this.validateFingerprint(
      mission.deterministicFingerprint,
      "$.deterministicFingerprint",
      context,
    );
    this.validateFrozenIfRequired(mission, "$", context);
    return this.result(mission, context);
  }

  public validateDecision(
    decision: TradingSwarmCollectiveDecision,
  ): MultiAgentValidationResult<TradingSwarmCollectiveDecision> {
    const context = this.createContext();

    this.validateObject(decision, "$", context);
    this.validateNonEmptyText(
      decision.decisionId,
      "$.decisionId",
      context,
    );
    this.validateNonEmptyText(
      decision.missionId,
      "$.missionId",
      context,
    );
    this.validateNonEmptyText(decision.runId, "$.runId", context);
    this.validateEnum(
      decision.decision,
      DECISIONS,
      "$.decision",
      context,
    );
    this.validateNormalized(
      decision.collectiveConfidence.finalConfidence,
      "$.collectiveConfidence.finalConfidence",
      context,
    );
    this.validateNormalized(
      decision.estimatedRisk,
      "$.estimatedRisk",
      context,
    );
    this.validateNormalized(
      decision.expectedUtility,
      "$.expectedUtility",
      context,
    );
    this.validateTimestamp(
      decision.decidedAtMs,
      "$.decidedAtMs",
      context,
    );

    if (decision.validUntilMs !== undefined) {
      this.validateTimestamp(
        decision.validUntilMs,
        "$.validUntilMs",
        context,
      );
      if (decision.validUntilMs < decision.decidedAtMs) {
        this.issue(
          context,
          "INVALID_RELATIONSHIP",
          "$.validUntilMs",
          "ERROR",
          "Decision validity cannot end before it begins.",
          decision.validUntilMs,
          ">= decidedAtMs",
        );
      }
    }

    const actionIds: string[] = [];
    decision.actions.forEach((action, index) => {
      this.validateDecisionAction(
        action,
        `$.actions[${index}]`,
        context,
      );
      actionIds.push(action.actionId);
    });
    this.validateUniqueValues(actionIds, "$.actions", context);

    this.validateConsensus(decision, context);
    this.validateGovernance(
      decision.governance,
      "$.governance",
      context,
    );

    if (
      EXECUTABLE_DECISIONS.has(decision.decision) &&
      decision.actions.length === 0
    ) {
      this.issue(
        context,
        "MISSING_REQUIRED_VALUE",
        "$.actions",
        "ERROR",
        "An executable swarm decision must contain at least one action.",
      );
    }

    if (
      EXECUTABLE_DECISIONS.has(decision.decision) &&
      !decision.governance.executionAuthorized
    ) {
      this.issue(
        context,
        "GOVERNANCE_VIOLATION",
        "$.governance.executionAuthorized",
        "ERROR",
        "An executable decision requires governance authorization.",
        false,
        "true",
      );
    }

    if (
      EXECUTABLE_DECISIONS.has(decision.decision) &&
      decision.executionPlan === undefined
    ) {
      this.issue(
        context,
        "EXECUTION_POLICY_VIOLATION",
        "$.executionPlan",
        "ERROR",
        "An executable decision requires an execution plan.",
      );
    }

    if (
      !EXECUTABLE_DECISIONS.has(decision.decision) &&
      decision.actions.some((action) =>
        EXECUTION_ACTIONS.has(action.type),
      )
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        "$.actions",
        "ERROR",
        "A non-executable decision cannot contain trading execution actions.",
      );
    }

    if (
      decision.selectedCandidateId !== undefined &&
      decision.consensus.selectedCandidateId !==
        decision.selectedCandidateId
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        "$.selectedCandidateId",
        "ERROR",
        "Decision candidate must match the consensus-selected candidate.",
        decision.selectedCandidateId,
        decision.consensus.selectedCandidateId,
      );
    }

    if (
      decision.executionPlan !== undefined &&
      decision.executionPlan.decisionId !== decision.decisionId
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        "$.executionPlan.decisionId",
        "ERROR",
        "Execution plan decisionId must match the collective decision.",
        decision.executionPlan.decisionId,
        decision.decisionId,
      );
    }

    this.validateFingerprint(
      decision.deterministicFingerprint,
      "$.deterministicFingerprint",
      context,
    );
    this.validateFrozenIfRequired(decision, "$", context);
    return this.result(decision, context);
  }

  private validateConfigurationInternal(
    configuration: AiTradingSwarmConfiguration,
    path: string,
    context: ValidationContext,
  ): void {
    this.validateObject(configuration, path, context);

    if (
      context.options.rejectUnknownSchemaVersion &&
      configuration.schemaVersion !==
        AI_TRADING_SWARM_SCHEMA_VERSION
    ) {
      this.issue(
        context,
        "UNSUPPORTED_SCHEMA_VERSION",
        `${path}.schemaVersion`,
        "ERROR",
        "Unsupported AI trading swarm schema version.",
        configuration.schemaVersion,
        AI_TRADING_SWARM_SCHEMA_VERSION,
      );
    }

    this.validateEnum(
      configuration.topology,
      SWARM_TOPOLOGIES,
      `${path}.topology`,
      context,
    );
    this.validateEnum(
      configuration.coordinationMode,
      COORDINATION_MODES,
      `${path}.coordinationMode`,
      context,
    );
    this.validateEnum(
      configuration.autonomy,
      AUTONOMY_LEVELS,
      `${path}.autonomy`,
      context,
    );

    this.validateFormationPolicy(
      configuration.formation,
      `${path}.formation`,
      context,
    );
    this.validatePartitionPolicy(
      configuration.partitioning,
      `${path}.partitioning`,
      context,
    );
    this.validateElectionPolicy(
      configuration,
      path,
      context,
    );
    this.validateConsensusPolicy(
      configuration.consensus,
      `${path}.consensus`,
      context,
    );
    this.validateSafetyPolicy(
      configuration.safety,
      `${path}.safety`,
      context,
    );
    this.validateExecutionPolicy(configuration, path, context);
    this.validateRecoveryPolicy(configuration, path, context);
    this.validateLearningPolicy(configuration, path, context);

    this.validatePositiveInteger(
      configuration.maximumMissionDurationMs,
      `${path}.maximumMissionDurationMs`,
      context,
    );
    this.validatePositiveInteger(
      configuration.maximumTaskDurationMs,
      `${path}.maximumTaskDurationMs`,
      context,
    );
    this.validatePositiveInteger(
      configuration.maximumContextAgeMs,
      `${path}.maximumContextAgeMs`,
      context,
    );
    this.validatePositiveInteger(
      configuration.maximumConcurrentMissions,
      `${path}.maximumConcurrentMissions`,
      context,
    );
    this.validateNonNegativeInteger(
      configuration.maximumRecentDecisions,
      `${path}.maximumRecentDecisions`,
      context,
    );

    if (
      configuration.maximumTaskDurationMs >
      configuration.maximumMissionDurationMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.maximumTaskDurationMs`,
        "ERROR",
        "Maximum task duration cannot exceed maximum mission duration.",
        configuration.maximumTaskDurationMs,
        `<= ${configuration.maximumMissionDurationMs}`,
      );
    }

    const ruleIds = configuration.governanceRules.map(
      (rule) => rule.ruleId,
    );
    ruleIds.forEach((ruleId, index) =>
      this.validateNonEmptyText(
        ruleId,
        `${path}.governanceRules[${index}].ruleId`,
        context,
      ),
    );
    this.validateUniqueValues(
      ruleIds,
      `${path}.governanceRules`,
      context,
    );

    configuration.governanceRules.forEach((rule, index) => {
      const rulePath = `${path}.governanceRules[${index}]`;
      this.validateNonEmptyText(
        rule.name,
        `${rulePath}.name`,
        context,
      );
      this.validateNonEmptyText(
        rule.description,
        `${rulePath}.description`,
        context,
      );
      this.validateEnum(
        rule.priority,
        PRIORITIES,
        `${rulePath}.priority`,
        context,
      );
      this.validateUniqueEnumArray(
        rule.applicableObjectives,
        MISSION_OBJECTIVES,
        `${rulePath}.applicableObjectives`,
        context,
      );
    });
  }

  private validateFormationPolicy(
    policy: TradingSwarmFormationPolicy,
    path: string,
    context: ValidationContext,
  ): void {
    this.validatePositiveInteger(
      policy.minimumNodes,
      `${path}.minimumNodes`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumNodes,
      `${path}.maximumNodes`,
      context,
    );

    if (policy.minimumNodes > policy.maximumNodes) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.minimumNodes`,
        "ERROR",
        "Minimum node count cannot exceed maximum node count.",
        policy.minimumNodes,
        `<= ${policy.maximumNodes}`,
      );
    }

    this.validateUniqueEnumArray(
      policy.requiredNodeRoles,
      SWARM_NODE_ROLES,
      `${path}.requiredNodeRoles`,
      context,
    );
    this.validateCapabilities(
      policy.requiredCapabilities,
      `${path}.requiredCapabilities`,
      context,
    );
    this.validateNormalized(
      policy.minimumNodeReadiness,
      `${path}.minimumNodeReadiness`,
      context,
    );
    this.validateNormalized(
      policy.minimumNodeReliability,
      `${path}.minimumNodeReliability`,
      context,
    );
  }

  private validatePartitionPolicy(
    policy: TradingSwarmPartitionPolicy,
    path: string,
    context: ValidationContext,
  ): void {
    this.validatePositiveInteger(
      policy.replicationFactor,
      `${path}.replicationFactor`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumPartitionsPerNode,
      `${path}.maximumPartitionsPerNode`,
      context,
    );
    this.validateNormalized(
      policy.rebalanceThreshold,
      `${path}.rebalanceThreshold`,
      context,
    );
    this.validatePositiveInteger(
      policy.leaseDurationMs,
      `${path}.leaseDurationMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.leaseRenewalWindowMs,
      `${path}.leaseRenewalWindowMs`,
      context,
    );

    if (
      policy.leaseRenewalWindowMs >= policy.leaseDurationMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.leaseRenewalWindowMs`,
        "ERROR",
        "Lease renewal window must be shorter than lease duration.",
        policy.leaseRenewalWindowMs,
        `< ${policy.leaseDurationMs}`,
      );
    }
  }

  private validateElectionPolicy(
    configuration: AiTradingSwarmConfiguration,
    path: string,
    context: ValidationContext,
  ): void {
    const policy = configuration.election;
    const electionPath = `${path}.election`;

    this.validatePositiveInteger(
      policy.electionTimeoutMs,
      `${electionPath}.electionTimeoutMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.leaderLeaseDurationMs,
      `${electionPath}.leaderLeaseDurationMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.heartbeatIntervalMs,
      `${electionPath}.heartbeatIntervalMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumMissedHeartbeats,
      `${electionPath}.maximumMissedHeartbeats`,
      context,
    );
    this.validateNormalized(
      policy.minimumCandidateReadiness,
      `${electionPath}.minimumCandidateReadiness`,
      context,
    );
    this.validateNormalized(
      policy.minimumCandidateReliability,
      `${electionPath}.minimumCandidateReliability`,
      context,
    );

    const heartbeatFailureWindow =
      policy.heartbeatIntervalMs *
      policy.maximumMissedHeartbeats;
    if (
      policy.leaderLeaseDurationMs <= heartbeatFailureWindow
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${electionPath}.leaderLeaseDurationMs`,
        "WARNING",
        "Leader lease should exceed the missed-heartbeat failure window.",
        policy.leaderLeaseDurationMs,
        `> ${heartbeatFailureWindow}`,
      );
    }

    if (
      configuration.topology === "LEADER_FOLLOWER" &&
      !policy.enabled
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${electionPath}.enabled`,
        "ERROR",
        "Leader-follower topology requires leader election.",
        false,
        "true",
      );
    }
  }

  private validateConsensusPolicy(
    policy: AiTradingSwarmConfiguration["consensus"],
    path: string,
    context: ValidationContext,
  ): void {
    this.validateNormalized(
      policy.approvalThreshold,
      `${path}.approvalThreshold`,
      context,
    );
    this.validateNormalized(
      policy.rejectionThreshold,
      `${path}.rejectionThreshold`,
      context,
    );
    this.validateNormalized(
      policy.maximumAbstentionRatio,
      `${path}.maximumAbstentionRatio`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumConsensusRounds,
      `${path}.maximumConsensusRounds`,
      context,
    );
    this.validateQuorumPolicy(
      policy.quorum,
      `${path}.quorum`,
      context,
    );

    if (
      policy.approvalThreshold <= policy.rejectionThreshold
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.approvalThreshold`,
        "WARNING",
        "Approval threshold should normally exceed rejection threshold.",
        policy.approvalThreshold,
        `> ${policy.rejectionThreshold}`,
      );
    }
  }

  private validateQuorumPolicy(
    policy: TradingSwarmQuorumPolicy,
    path: string,
    context: ValidationContext,
  ): void {
    this.validatePositiveInteger(
      policy.minimumEligibleNodes,
      `${path}.minimumEligibleNodes`,
      context,
    );
    this.validatePositiveInteger(
      policy.minimumParticipatingNodes,
      `${path}.minimumParticipatingNodes`,
      context,
    );
    this.validateNormalized(
      policy.minimumParticipationRatio,
      `${path}.minimumParticipationRatio`,
      context,
    );
    this.validateUniqueEnumArray(
      policy.requiredNodeRoles,
      SWARM_NODE_ROLES,
      `${path}.requiredNodeRoles`,
      context,
    );
    this.validateCapabilities(
      policy.requiredCapabilities,
      `${path}.requiredCapabilities`,
      context,
    );

    if (
      policy.minimumParticipatingNodes >
      policy.minimumEligibleNodes
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.minimumParticipatingNodes`,
        "ERROR",
        "Minimum participating nodes cannot exceed minimum eligible nodes.",
        policy.minimumParticipatingNodes,
        `<= ${policy.minimumEligibleNodes}`,
      );
    }
  }

  private validateSafetyPolicy(
    policy: TradingSwarmSafetyPolicy,
    path: string,
    context: ValidationContext,
  ): void {
    const normalizedFields = [
      ["minimumCollectiveConfidence", policy.minimumCollectiveConfidence],
      ["minimumNodeReliability", policy.minimumNodeReliability],
      ["minimumPartitionCoverage", policy.minimumPartitionCoverage],
      ["maximumSystemicRisk", policy.maximumSystemicRisk],
      ["maximumExecutionRisk", policy.maximumExecutionRisk],
      ["maximumDrawdown", policy.maximumDrawdown],
      ["maximumFailedNodeRatio", policy.maximumFailedNodeRatio],
      [
        "maximumUnsynchronizedNodeRatio",
        policy.maximumUnsynchronizedNodeRatio,
      ],
    ] as const;

    normalizedFields.forEach(([name, value]) =>
      this.validateNormalized(value, `${path}.${name}`, context),
    );

    this.validateNonNegativeFinite(
      policy.maximumCapitalAtRisk,
      `${path}.maximumCapitalAtRisk`,
      context,
    );
    this.validatePositiveFinite(
      policy.maximumLeverage,
      `${path}.maximumLeverage`,
      context,
    );
  }

  private validateExecutionPolicy(
    configuration: AiTradingSwarmConfiguration,
    path: string,
    context: ValidationContext,
  ): void {
    const policy = configuration.execution;
    const executionPath = `${path}.execution`;

    this.validatePositiveInteger(
      policy.maximumConcurrentExecutionSteps,
      `${executionPath}.maximumConcurrentExecutionSteps`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumActionsPerDecision,
      `${executionPath}.maximumActionsPerDecision`,
      context,
    );
    this.validateNonNegativeFinite(
      policy.maximumTotalNotional,
      `${executionPath}.maximumTotalNotional`,
      context,
    );

    if (
      configuration.autonomy === "FULLY_AUTONOMOUS" &&
      policy.mode !== "FULLY_AUTOMATED"
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${executionPath}.mode`,
        "WARNING",
        "Fully autonomous swarm configuration normally uses fully automated execution.",
        policy.mode,
        "FULLY_AUTOMATED",
      );
    }

    if (
      policy.mode === "FULLY_AUTOMATED" &&
      !policy.requireGovernanceApproval
    ) {
      this.issue(
        context,
        "GOVERNANCE_VIOLATION",
        `${executionPath}.requireGovernanceApproval`,
        "ERROR",
        "Fully automated execution requires governance approval.",
        false,
        "true",
      );
    }
  }

  private validateRecoveryPolicy(
    configuration: AiTradingSwarmConfiguration,
    path: string,
    context: ValidationContext,
  ): void {
    const policy = configuration.recovery;
    const recoveryPath = `${path}.recovery`;

    this.validatePositiveInteger(
      policy.maximumRecoveryAttempts,
      `${recoveryPath}.maximumRecoveryAttempts`,
      context,
    );
    this.validateNonNegativeInteger(
      policy.taskRetryDelayMs,
      `${recoveryPath}.taskRetryDelayMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.nodeFailureTimeoutMs,
      `${recoveryPath}.nodeFailureTimeoutMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.partitionRecoveryTimeoutMs,
      `${recoveryPath}.partitionRecoveryTimeoutMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.checkpointIntervalMs,
      `${recoveryPath}.checkpointIntervalMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.maximumCheckpointAgeMs,
      `${recoveryPath}.maximumCheckpointAgeMs`,
      context,
    );
    this.validatePositiveInteger(
      policy.quarantineAfterConsecutiveFailures,
      `${recoveryPath}.quarantineAfterConsecutiveFailures`,
      context,
    );

    if (
      policy.maximumCheckpointAgeMs <
      policy.checkpointIntervalMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${recoveryPath}.maximumCheckpointAgeMs`,
        "ERROR",
        "Maximum checkpoint age cannot be shorter than the checkpoint interval.",
        policy.maximumCheckpointAgeMs,
        `>= ${policy.checkpointIntervalMs}`,
      );
    }
  }

  private validateLearningPolicy(
    configuration: AiTradingSwarmConfiguration,
    path: string,
    context: ValidationContext,
  ): void {
    const policy = configuration.learning;
    const learningPath = `${path}.learning`;

    const normalizedFields = [
      ["initialNodeTrust", policy.initialNodeTrust],
      ["minimumVotingTrust", policy.minimumVotingTrust],
      ["reliabilityWeight", policy.reliabilityWeight],
      ["consensusIntegrityWeight", policy.consensusIntegrityWeight],
      ["executionQualityWeight", policy.executionQualityWeight],
      ["recoveryQualityWeight", policy.recoveryQualityWeight],
      ["synchronizationWeight", policy.synchronizationWeight],
      ["collaborationWeight", policy.collaborationWeight],
      [
        "governanceComplianceWeight",
        policy.governanceComplianceWeight,
      ],
      ["learningRate", policy.learningRate],
      ["decayRate", policy.decayRate],
      ["quarantineThreshold", policy.quarantineThreshold],
    ] as const;

    normalizedFields.forEach(([name, value]) =>
      this.validateNormalized(
        value,
        `${learningPath}.${name}`,
        context,
      ),
    );

    const weightSum =
      policy.reliabilityWeight +
      policy.consensusIntegrityWeight +
      policy.executionQualityWeight +
      policy.recoveryQualityWeight +
      policy.synchronizationWeight +
      policy.collaborationWeight +
      policy.governanceComplianceWeight;

    if (Math.abs(weightSum - 1) > 1e-9) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        learningPath,
        "ERROR",
        "Learning-policy component weights must sum to 1.",
        weightSum,
        "1",
      );
    }

    if (
      policy.quarantineThreshold >= policy.minimumVotingTrust
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${learningPath}.quarantineThreshold`,
        "WARNING",
        "Quarantine threshold should be lower than minimum voting trust.",
        policy.quarantineThreshold,
        `< ${policy.minimumVotingTrust}`,
      );
    }
  }

  private validateAuthority(
    node: TradingSwarmNodeRegistration,
    context: ValidationContext,
  ): void {
    const authority = node.authority;
    const path = "$.authority";

    if (
      authority.mayExecuteTrades &&
      !authority.mayApproveExecution &&
      authority.level !== "SUPERVISORY"
    ) {
      this.issue(
        context,
        "AUTHORITY_VIOLATION",
        `${path}.mayExecuteTrades`,
        "ERROR",
        "Trade execution authority requires execution approval authority.",
      );
    }

    if (
      authority.maximumCapitalAuthority !== undefined
    ) {
      this.validateNonNegativeFinite(
        authority.maximumCapitalAuthority,
        `${path}.maximumCapitalAuthority`,
        context,
      );
    }

    if (authority.maximumRiskAuthority !== undefined) {
      this.validateNormalized(
        authority.maximumRiskAuthority,
        `${path}.maximumRiskAuthority`,
        context,
      );
    }

    if (
      authority.maximumLeverageAuthority !== undefined
    ) {
      this.validatePositiveFinite(
        authority.maximumLeverageAuthority,
        `${path}.maximumLeverageAuthority`,
        context,
      );
    }

    this.validateUniqueValues(
      authority.restrictedActions,
      `${path}.restrictedActions`,
      context,
    );
  }

  private validateMissionConstraints(
    constraints: TradingSwarmMissionConstraints,
    path: string,
    context: ValidationContext,
  ): void {
    if (constraints.maximumCapitalAtRisk !== undefined) {
      this.validateNonNegativeFinite(
        constraints.maximumCapitalAtRisk,
        `${path}.maximumCapitalAtRisk`,
        context,
      );
    }
    if (constraints.maximumRiskScore !== undefined) {
      this.validateNormalized(
        constraints.maximumRiskScore,
        `${path}.maximumRiskScore`,
        context,
      );
    }
    if (constraints.maximumLeverage !== undefined) {
      this.validatePositiveFinite(
        constraints.maximumLeverage,
        `${path}.maximumLeverage`,
        context,
      );
    }
    if (constraints.maximumDrawdown !== undefined) {
      this.validateNormalized(
        constraints.maximumDrawdown,
        `${path}.maximumDrawdown`,
        context,
      );
    }
    if (
      constraints.maximumExecutionActions !== undefined
    ) {
      this.validatePositiveInteger(
        constraints.maximumExecutionActions,
        `${path}.maximumExecutionActions`,
        context,
      );
    }
    if (
      constraints.maximumMissionDurationMs !== undefined
    ) {
      this.validatePositiveInteger(
        constraints.maximumMissionDurationMs,
        `${path}.maximumMissionDurationMs`,
        context,
      );
    }
    if (constraints.requiredNodeRoles !== undefined) {
      this.validateUniqueEnumArray(
        constraints.requiredNodeRoles,
        SWARM_NODE_ROLES,
        `${path}.requiredNodeRoles`,
        context,
      );
    }
    if (
      constraints.requiredCapabilities !== undefined
    ) {
      this.validateCapabilities(
        constraints.requiredCapabilities,
        `${path}.requiredCapabilities`,
        context,
      );
    }
    this.validateOptionalUniqueTextArray(
      constraints.requiredPartitionIds,
      `${path}.requiredPartitionIds`,
      context,
    );
    if (constraints.prohibitedActions !== undefined) {
      this.validateUniqueValues(
        constraints.prohibitedActions,
        `${path}.prohibitedActions`,
        context,
      );
    }
  }

  private validateDecisionAction(
    action: TradingSwarmDecisionAction,
    path: string,
    context: ValidationContext,
  ): void {
    this.validateNonEmptyText(
      action.actionId,
      `${path}.actionId`,
      context,
    );
    this.validateEnum(
      action.type,
      ACTION_TYPES,
      `${path}.type`,
      context,
    );
    this.validateEnum(
      action.priority,
      PRIORITIES,
      `${path}.priority`,
      context,
    );
    this.validateUniqueTextArray(
      action.dependencies,
      `${path}.dependencies`,
      context,
    );

    if (action.quantity !== undefined) {
      this.validatePositiveFinite(
        action.quantity,
        `${path}.quantity`,
        context,
      );
    }
    if (action.notional !== undefined) {
      this.validatePositiveFinite(
        action.notional,
        `${path}.notional`,
        context,
      );
    }

    if (
      action.type === "NO_ACTION" &&
      (action.quantity !== undefined ||
        action.notional !== undefined)
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        path,
        "ERROR",
        "NO_ACTION cannot specify quantity or notional.",
      );
    }
  }

  private validateConsensus(
    decision: TradingSwarmCollectiveDecision,
    context: ValidationContext,
  ): void {
    const consensus = decision.consensus;
    const path = "$.consensus";

    this.validateNonEmptyText(
      consensus.consensusId,
      `${path}.consensusId`,
      context,
    );
    if (consensus.missionId !== decision.missionId) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.missionId`,
        "ERROR",
        "Consensus missionId must match decision missionId.",
        consensus.missionId,
        decision.missionId,
      );
    }

    this.validateNonNegativeFinite(
      consensus.approvalWeight,
      `${path}.approvalWeight`,
      context,
    );
    this.validateNonNegativeFinite(
      consensus.rejectionWeight,
      `${path}.rejectionWeight`,
      context,
    );
    this.validateNonNegativeFinite(
      consensus.abstentionWeight,
      `${path}.abstentionWeight`,
      context,
    );
    this.validateNonNegativeInteger(
      consensus.vetoCount,
      `${path}.vetoCount`,
      context,
    );
    this.validateNormalized(
      consensus.participationRatio,
      `${path}.participationRatio`,
      context,
    );
    this.validateNormalized(
      consensus.partitionCoverageRatio,
      `${path}.partitionCoverageRatio`,
      context,
    );
    this.validateNormalized(
      consensus.collectiveConfidence.finalConfidence,
      `${path}.collectiveConfidence.finalConfidence`,
      context,
    );
    this.validateTimestamp(
      consensus.formedAtMs,
      `${path}.formedAtMs`,
      context,
    );
    this.validateFingerprint(
      consensus.deterministicFingerprint,
      `${path}.deterministicFingerprint`,
      context,
    );

    if (
      consensus.formedAtMs > decision.decidedAtMs
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.formedAtMs`,
        "ERROR",
        "Consensus cannot be formed after the decision timestamp.",
        consensus.formedAtMs,
        `<= ${decision.decidedAtMs}`,
      );
    }

    if (
      consensus.status === "VETOED" &&
      consensus.vetoCount === 0
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.vetoCount`,
        "ERROR",
        "VETOED consensus requires at least one veto.",
        0,
        ">= 1",
      );
    }

    if (
      consensus.status === "NO_QUORUM" &&
      consensus.quorumSatisfied
    ) {
      this.issue(
        context,
        "INVALID_RELATIONSHIP",
        `${path}.quorumSatisfied`,
        "ERROR",
        "NO_QUORUM status cannot report quorum satisfied.",
      );
    }
  }

  private validateGovernance(
    governance: TradingSwarmGovernanceAssessment,
    path: string,
    context: ValidationContext,
  ): void {
    this.validateNonEmptyText(
      governance.assessmentId,
      `${path}.assessmentId`,
      context,
    );
    this.validateTimestamp(
      governance.assessedAtMs,
      `${path}.assessedAtMs`,
      context,
    );
    this.validateRiskAssessment(
      governance.riskAssessment,
      `${path}.riskAssessment`,
      context,
    );
    this.validateFingerprint(
      governance.deterministicFingerprint,
      `${path}.deterministicFingerprint`,
      context,
    );

    if (
      governance.decision === "REJECTED" &&
      governance.executionAuthorized
    ) {
      this.issue(
        context,
        "GOVERNANCE_VIOLATION",
        `${path}.executionAuthorized`,
        "ERROR",
        "Rejected governance assessment cannot authorize execution.",
      );
    }

    if (
      governance.decision === "REQUIRES_OPERATOR_APPROVAL" &&
      !governance.operatorApprovalRequired
    ) {
      this.issue(
        context,
        "GOVERNANCE_VIOLATION",
        `${path}.operatorApprovalRequired`,
        "ERROR",
        "Operator-approval governance decision must require operator approval.",
      );
    }
  }

  private validateRiskAssessment(
    risk: TradingSwarmRiskAssessment,
    path: string,
    context: ValidationContext,
  ): void {
    this.validateNonEmptyText(
      risk.assessmentId,
      `${path}.assessmentId`,
      context,
    );
    this.validateNormalized(
      risk.overallRisk,
      `${path}.overallRisk`,
      context,
    );
    this.validateNormalized(
      risk.systemicRisk,
      `${path}.systemicRisk`,
      context,
    );
    this.validateNormalized(
      risk.executionRisk,
      `${path}.executionRisk`,
      context,
    );
    this.validateNormalized(
      risk.coordinationRisk,
      `${path}.coordinationRisk`,
      context,
    );
    this.validateNormalized(
      risk.partitionRisk,
      `${path}.partitionRisk`,
      context,
    );
    this.validateTimestamp(
      risk.assessedAtMs,
      `${path}.assessedAtMs`,
      context,
    );
    this.validateFingerprint(
      risk.deterministicFingerprint,
      `${path}.deterministicFingerprint`,
      context,
    );

    if (
      !risk.executionAllowed &&
      risk.restrictions.length === 0
    ) {
      this.issue(
        context,
        "MISSING_REQUIRED_VALUE",
        `${path}.restrictions`,
        "WARNING",
        "A blocked risk assessment should explain its restrictions.",
      );
    }
  }

  private createContext(): ValidationContext {
    return {
      issues: [],
      options: this.options,
    };
  }

  private result<TValue>(
    value: TValue,
    context: ValidationContext,
  ): MultiAgentValidationResult<TValue> {
    const sortedIssues = [...context.issues]
      .sort(compareIssues)
      .slice(0, context.options.maximumIssueCount);

    const errorCount = sortedIssues.filter(
      (issue) =>
        issue.severity === "ERROR" ||
        issue.severity === "FATAL",
    ).length;
    const warningCount = sortedIssues.filter(
      (issue) => issue.severity === "WARNING",
    ).length;

    return deepFreeze({
      valid: errorCount === 0,
      value: errorCount === 0 ? value : undefined,
      issues: sortedIssues,
      errorCount,
      warningCount,
    });
  }

  private issue(
    context: ValidationContext,
    code: string,
    path: string,
    severity: MultiAgentValidationSeverity,
    message: string,
    actualValue?: unknown,
    expected?: string,
  ): void {
    if (
      context.issues.length >= context.options.maximumIssueCount
    ) {
      return;
    }

    const issue: MultiAgentValidationIssue = {
      code,
      path,
      severity,
      message,
      ...(toValidationJsonValue(actualValue) !== undefined
        ? { actualValue: toValidationJsonValue(actualValue) }
        : {}),
      ...(expected !== undefined ? { expected } : {}),
    };

    context.issues.push(deepFreeze(issue));
  }

  private validateObject(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      this.issue(
        context,
        "INVALID_TYPE",
        path,
        "FATAL",
        "Expected a non-null object.",
        value,
        "object",
      );
    }
  }

  private validateNonEmptyText(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "string" ||
      value.trim().length === 0
    ) {
      this.issue(
        context,
        "MISSING_REQUIRED_VALUE",
        path,
        "ERROR",
        "Expected a non-empty string.",
        value,
        "non-empty string",
      );
    }
  }

  private validateTimestamp(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    this.validateNonNegativeInteger(value, path, context);
  }

  private validatePositiveFinite(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      this.issue(
        context,
        "INVALID_RANGE",
        path,
        "ERROR",
        "Expected a finite number greater than zero.",
        value,
        "> 0",
      );
    }
  }

  private validateNonNegativeFinite(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      this.issue(
        context,
        "INVALID_RANGE",
        path,
        "ERROR",
        "Expected a finite non-negative number.",
        value,
        ">= 0",
      );
    }
  }

  private validatePositiveInteger(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      this.issue(
        context,
        "INVALID_RANGE",
        path,
        "ERROR",
        "Expected an integer greater than zero.",
        value,
        "positive integer",
      );
    }
  }

  private validateNonNegativeInteger(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      this.issue(
        context,
        "INVALID_RANGE",
        path,
        "ERROR",
        "Expected a non-negative integer.",
        value,
        "non-negative integer",
      );
    }
  }

  private validateNormalized(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < TRADING_SWARM_NORMALIZED_MINIMUM ||
      value > TRADING_SWARM_NORMALIZED_MAXIMUM
    ) {
      this.issue(
        context,
        "INVALID_RANGE",
        path,
        "ERROR",
        "Expected a normalized finite value.",
        value,
        `[${TRADING_SWARM_NORMALIZED_MINIMUM}, ${TRADING_SWARM_NORMALIZED_MAXIMUM}]`,
      );
    }
  }

  private validateEnum(
    value: unknown,
    allowed: ReadonlySet<string>,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      typeof value !== "string" ||
      !allowed.has(value)
    ) {
      this.issue(
        context,
        "INVALID_VALUE",
        path,
        "ERROR",
        "Value is not a supported domain literal.",
        value,
        [...allowed].join(" | "),
      );
    }
  }

  private validateUniqueEnumArray(
    values: readonly string[],
    allowed: ReadonlySet<string>,
    path: string,
    context: ValidationContext,
  ): void {
    values.forEach((value, index) =>
      this.validateEnum(
        value,
        allowed,
        `${path}[${index}]`,
        context,
      ),
    );
    this.validateUniqueValues(values, path, context);
  }

  private validateCapabilities(
    values: readonly TradingSwarmCapability[],
    path: string,
    context: ValidationContext,
  ): void {
    this.validateUniqueEnumArray(
      values,
      CAPABILITIES,
      path,
      context,
    );
  }

  private validateUniqueTextArray(
    values: readonly string[],
    path: string,
    context: ValidationContext,
  ): void {
    values.forEach((value, index) =>
      this.validateNonEmptyText(
        value,
        `${path}[${index}]`,
        context,
      ),
    );
    this.validateUniqueValues(values, path, context);
  }

  private validateOptionalUniqueTextArray(
    values: readonly string[] | undefined,
    path: string,
    context: ValidationContext,
  ): void {
    if (values !== undefined) {
      this.validateUniqueTextArray(values, path, context);
    }
  }

  private validateUniqueValues(
    values: readonly string[],
    path: string,
    context: ValidationContext,
  ): void {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        this.issue(
          context,
          "DUPLICATE_VALUE",
          `${path}[${index}]`,
          "ERROR",
          `Duplicate value "${value}".`,
          value,
          "unique value",
        );
      }
      seen.add(value);
    });
  }

  private validateFingerprint(
    value: unknown,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      context.options.requireDeterministicFingerprint
    ) {
      this.validateNonEmptyText(value, path, context);
    }
  }

  private validateFrozenIfRequired(
    value: object,
    path: string,
    context: ValidationContext,
  ): void {
    if (
      context.options.requireFrozenInputs &&
      !Object.isFrozen(value)
    ) {
      this.issue(
        context,
        "DETERMINISM_VIOLATION",
        path,
        "ERROR",
        "Input must be frozen when requireFrozenInputs is enabled.",
      );
    }
  }
}

export function createAiTradingSwarmValidator(
  options: AiTradingSwarmValidatorOptions = {},
): AiTradingSwarmValidator {
  return new AiTradingSwarmValidator(options);
}

export const aiTradingSwarmValidator =
  createAiTradingSwarmValidator();

function normalizeOptions(
  options: AiTradingSwarmValidatorOptions,
): NormalizedValidatorOptions {
  const maximumIssueCount =
    options.maximumIssueCount ?? 500;

  if (
    !Number.isInteger(maximumIssueCount) ||
    maximumIssueCount <= 0
  ) {
    throw new AiTradingSwarmValidationError(
      "INVALID_RANGE",
      "maximumIssueCount must be a positive integer.",
    );
  }

  return Object.freeze({
    requireFrozenInputs:
      options.requireFrozenInputs ?? false,
    requireDeterministicFingerprint:
      options.requireDeterministicFingerprint ?? true,
    rejectUnknownSchemaVersion:
      options.rejectUnknownSchemaVersion ?? true,
    maximumIssueCount,
  });
}

function compareIssues(
  left: MultiAgentValidationIssue,
  right: MultiAgentValidationIssue,
): number {
  const pathComparison = left.path.localeCompare(right.path);
  if (pathComparison !== 0) {
    return pathComparison;
  }

  const severityComparison =
    severityRank(right.severity) -
    severityRank(left.severity);
  if (severityComparison !== 0) {
    return severityComparison;
  }

  const codeComparison = left.code.localeCompare(right.code);
  if (codeComparison !== 0) {
    return codeComparison;
  }

  return left.message.localeCompare(right.message);
}

function severityRank(
  severity: MultiAgentValidationSeverity,
): number {
  switch (severity) {
    case "FATAL":
      return 4;
    case "ERROR":
      return 3;
    case "WARNING":
      return 2;
    case "INFO":
      return 1;
  }
}

function toValidationJsonValue(
  value: unknown,
): MultiAgentJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      toValidationJsonValue(item) ?? null,
    );
  }

  if (typeof value === "object") {
    const output: Record<string, MultiAgentJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] =
        toValidationJsonValue(item) ?? null;
    }
    return output;
  }

  return String(value);
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
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}