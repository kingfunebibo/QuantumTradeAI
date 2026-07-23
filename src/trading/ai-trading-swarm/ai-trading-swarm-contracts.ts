/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/ai-trading-swarm-contracts.ts
 *
 * Foundational deterministic and immutable contracts for coordinating multiple
 * governed AI-agent collectives as distributed trading swarms.
 *
 * Architectural guarantees:
 * - deterministic, replay-safe swarm orchestration
 * - immutable commands, observations, plans, ballots, decisions, and outcomes
 * - explicit topology, partitioning, ownership, authority, and lifecycle
 * - bounded autonomous execution with governance and safety controls
 * - deterministic leader election, quorum, failover, and recovery semantics
 * - clean integration with Milestone 38 multi-agent intelligence
 */

import type {
  MultiAgentCollectiveDecision,
  MultiAgentExecutionOutcome,
  MultiAgentHealthSnapshot,
  MultiAgentId,
  MultiAgentManagerSnapshot,
  MultiAgentMemoryRecord,
  MultiAgentMetadata,
  MultiAgentRegistration,
  MultiAgentRunRequest,
  MultiAgentSystemContext,
  MultiAgentTimestamp,
  MultiAgentValidationResult,
} from "../ai-multi-agent-intelligence/ai-multi-agent-contracts";

/* ========================================================================== *
 * Primitive aliases and immutable utility types
 * ========================================================================== */

export type TradingSwarmId = string;
export type TradingSwarmNodeId = string;
export type TradingSwarmClusterId = string;
export type TradingSwarmRunId = string;
export type TradingSwarmMissionId = string;
export type TradingSwarmTaskId = string;
export type TradingSwarmPlanId = string;
export type TradingSwarmDecisionId = string;
export type TradingSwarmBallotId = string;
export type TradingSwarmElectionId = string;
export type TradingSwarmTerm = number;
export type TradingSwarmEpoch = number;
export type TradingSwarmSequence = number;
export type TradingSwarmPartitionId = string;
export type TradingSwarmLeaseId = string;
export type TradingSwarmCheckpointId = string;
export type TradingSwarmSnapshotId = string;
export type TradingSwarmEventId = string;
export type TradingSwarmTraceId = string;
export type TradingSwarmCorrelationId = string;
export type TradingSwarmCausationId = string;
export type TradingSwarmPolicyId = string;
export type TradingSwarmStrategyId = string;
export type TradingSwarmMarketId = string;
export type TradingSwarmScore = number;
export type TradingSwarmConfidence = number;
export type TradingSwarmProbability = number;
export type TradingSwarmWeight = number;
export type TradingSwarmRisk = number;
export type TradingSwarmUtility = number;
export type TradingSwarmTimestamp = MultiAgentTimestamp;

export type TradingSwarmJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type TradingSwarmJsonValue =
  | TradingSwarmJsonPrimitive
  | readonly TradingSwarmJsonValue[]
  | Readonly<{ readonly [key: string]: TradingSwarmJsonValue }>;

export type TradingSwarmMetadata = Readonly<
  Record<string, TradingSwarmJsonValue>
>;

export type TradingSwarmReadonlyRecord<
  TKey extends PropertyKey,
  TValue,
> = Readonly<Record<TKey, TValue>>;

export type TradingSwarmDeepReadonly<TValue> =
  TValue extends (...args: never[]) => unknown
    ? TValue
    : TValue extends readonly (infer TItem)[]
      ? readonly TradingSwarmDeepReadonly<TItem>[]
      : TValue extends object
        ? {
            readonly [TKey in keyof TValue]:
              TradingSwarmDeepReadonly<TValue[TKey]>;
          }
        : TValue;

export type TradingSwarmNonEmptyReadonlyArray<TValue> = readonly [
  TValue,
  ...TValue[],
];

export const AI_TRADING_SWARM_SCHEMA_VERSION = "1.0.0" as const;

export type AiTradingSwarmSchemaVersion =
  typeof AI_TRADING_SWARM_SCHEMA_VERSION;

export const TRADING_SWARM_NORMALIZED_MINIMUM = 0;
export const TRADING_SWARM_NORMALIZED_MAXIMUM = 1;
export const TRADING_SWARM_CORRELATION_MINIMUM = -1;
export const TRADING_SWARM_CORRELATION_MAXIMUM = 1;
export const TRADING_SWARM_BASIS_POINTS_PER_UNIT = 10_000;

/* ========================================================================== *
 * Swarm taxonomy, topology, lifecycle, and authority
 * ========================================================================== */

export type TradingSwarmKind =
  | "MARKET_INTELLIGENCE_SWARM"
  | "STRATEGY_DISCOVERY_SWARM"
  | "STRATEGY_SELECTION_SWARM"
  | "PORTFOLIO_SWARM"
  | "RISK_SWARM"
  | "EXECUTION_SWARM"
  | "ARBITRAGE_SWARM"
  | "LIQUIDITY_SWARM"
  | "REGIME_SWARM"
  | "META_LEARNING_SWARM"
  | "GOVERNANCE_SWARM"
  | "EXPLAINABILITY_SWARM"
  | "SUPERVISORY_SWARM"
  | "CROSS_FUNCTIONAL_SWARM"
  | "CUSTOM";

export type TradingSwarmNodeRole =
  | "LEADER"
  | "COORDINATOR"
  | "WORKER"
  | "OBSERVER"
  | "REPLICA"
  | "ARBITER"
  | "GOVERNOR"
  | "EXECUTOR"
  | "SUPERVISOR";

export type TradingSwarmLifecycleState =
  | "CREATED"
  | "INITIALIZING"
  | "FORMING"
  | "READY"
  | "ACTIVE"
  | "REBALANCING"
  | "DEGRADED"
  | "RECOVERING"
  | "QUARANTINED"
  | "SUSPENDED"
  | "DRAINING"
  | "TERMINATED"
  | "FAILED";

export type TradingSwarmNodeLifecycleState =
  | "REGISTERED"
  | "JOINING"
  | "SYNCHRONIZING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "ISOLATED"
  | "QUARANTINED"
  | "LEAVING"
  | "REMOVED"
  | "FAILED";

export type TradingSwarmAvailability =
  | "AVAILABLE"
  | "BUSY"
  | "DRAINING"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type TradingSwarmTopology =
  | "CENTRALIZED"
  | "LEADER_FOLLOWER"
  | "HIERARCHICAL"
  | "FEDERATED"
  | "MESH"
  | "SHARDED"
  | "HYBRID";

export type TradingSwarmCoordinationMode =
  | "SYNCHRONOUS"
  | "ASYNCHRONOUS"
  | "EVENT_DRIVEN"
  | "ROUND_BASED"
  | "GOSSIP"
  | "HYBRID";

export type TradingSwarmAutonomyLevel =
  | "OBSERVE_ONLY"
  | "RECOMMEND_ONLY"
  | "PLAN_ONLY"
  | "SEMI_AUTONOMOUS"
  | "FULLY_AUTONOMOUS";

export type TradingSwarmAuthorityLevel =
  | "ADVISORY"
  | "PLANNING"
  | "COORDINATING"
  | "EXECUTION_LIMITED"
  | "EXECUTION_APPROVED"
  | "SUPERVISORY";

export type TradingSwarmCriticality =
  | "OPTIONAL"
  | "STANDARD"
  | "IMPORTANT"
  | "CRITICAL"
  | "SYSTEM_CRITICAL";

export interface TradingSwarmIdentity {
  readonly swarmId: TradingSwarmId;
  readonly name: string;
  readonly kind: TradingSwarmKind;
  readonly version: string;
  readonly description: string;
  readonly clusterId?: TradingSwarmClusterId;
  readonly criticality: TradingSwarmCriticality;
}

export interface TradingSwarmAuthority {
  readonly level: TradingSwarmAuthorityLevel;
  readonly autonomy: TradingSwarmAutonomyLevel;
  readonly mayCreateMissions: boolean;
  readonly mayDelegateTasks: boolean;
  readonly mayElectLeader: boolean;
  readonly mayRepartition: boolean;
  readonly mayMigrateNodes: boolean;
  readonly mayApproveExecution: boolean;
  readonly mayExecuteTrades: boolean;
  readonly mayPauseExecution: boolean;
  readonly mayEscalateToOperator: boolean;
  readonly maximumCapitalAuthority?: number;
  readonly maximumRiskAuthority?: TradingSwarmRisk;
  readonly maximumLeverageAuthority?: number;
  readonly restrictedActions: readonly TradingSwarmActionType[];
}

export type TradingSwarmCapability =
  | "DISTRIBUTE_MARKET_ANALYSIS"
  | "DISTRIBUTE_STRATEGY_ANALYSIS"
  | "DISTRIBUTE_RISK_ANALYSIS"
  | "DISTRIBUTE_PORTFOLIO_ANALYSIS"
  | "DISTRIBUTE_ARBITRAGE_ANALYSIS"
  | "COORDINATE_MULTI_AGENT_RUNS"
  | "FORM_DISTRIBUTED_CONSENSUS"
  | "ELECT_LEADER"
  | "MANAGE_PARTITIONS"
  | "REPLICATE_STATE"
  | "RECOVER_FAILED_NODES"
  | "MIGRATE_WORKLOAD"
  | "BALANCE_WORKLOAD"
  | "PLAN_DISTRIBUTED_EXECUTION"
  | "AUTHORIZE_EXECUTION"
  | "EXECUTE_TRADES"
  | "MONITOR_EXECUTION"
  | "ROLLBACK_EXECUTION"
  | "PUBLISH_SWARM_EVENTS"
  | "PERSIST_CHECKPOINTS"
  | "LEARN_FROM_OUTCOMES"
  | "UPDATE_SWARM_TRUST"
  | "EXPLAIN_SWARM_DECISIONS"
  | "ENFORCE_GOVERNANCE"
  | "ESCALATE_TO_OPERATOR";

export interface TradingSwarmCapabilityDeclaration {
  readonly capability: TradingSwarmCapability;
  readonly enabled: boolean;
  readonly proficiency: TradingSwarmScore;
  readonly confidenceFloor: TradingSwarmConfidence;
  readonly criticality: TradingSwarmCriticality;
  readonly supportedMarkets?: readonly TradingSwarmMarketId[];
  readonly supportedStrategies?: readonly TradingSwarmStrategyId[];
  readonly metadata?: TradingSwarmMetadata;
}

/* ========================================================================== *
 * Swarm nodes and embedded multi-agent collectives
 * ========================================================================== */

export interface TradingSwarmNodeIdentity {
  readonly nodeId: TradingSwarmNodeId;
  readonly swarmId: TradingSwarmId;
  readonly name: string;
  readonly role: TradingSwarmNodeRole;
  readonly version: string;
  readonly region?: string;
  readonly zone?: string;
  readonly instanceId?: string;
}

export interface TradingSwarmNodeCapacity {
  readonly maximumConcurrentMissions: number;
  readonly maximumConcurrentTasks: number;
  readonly maximumAgentRuns: number;
  readonly maximumMemoryRecords: number;
  readonly computeUnits: number;
  readonly memoryUnits: number;
  readonly networkUnits: number;
}

export interface TradingSwarmNodeRegistration {
  readonly identity: TradingSwarmNodeIdentity;
  readonly capabilities: readonly TradingSwarmCapabilityDeclaration[];
  readonly authority: TradingSwarmAuthority;
  readonly capacity: TradingSwarmNodeCapacity;
  readonly multiAgentManager: MultiAgentManagerSnapshot;
  readonly agents: readonly MultiAgentRegistration[];
  readonly deterministic: boolean;
  readonly replaySafe: boolean;
  readonly registeredAtMs: TradingSwarmTimestamp;
  readonly configurationVersion: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmNodeHealth {
  readonly nodeId: TradingSwarmNodeId;
  readonly lifecycleState: TradingSwarmNodeLifecycleState;
  readonly availability: TradingSwarmAvailability;
  readonly healthy: boolean;
  readonly readinessScore: TradingSwarmScore;
  readonly reliabilityScore: TradingSwarmScore;
  readonly latencyScore: TradingSwarmScore;
  readonly throughputScore: TradingSwarmScore;
  readonly synchronizationScore: TradingSwarmScore;
  readonly dataFreshnessScore: TradingSwarmScore;
  readonly consensusParticipationScore: TradingSwarmScore;
  readonly activeMissionCount: number;
  readonly activeTaskCount: number;
  readonly activeMultiAgentRunCount: number;
  readonly consecutiveFailures: number;
  readonly lastHeartbeatAtMs?: TradingSwarmTimestamp;
  readonly lastSuccessfulMissionAtMs?: TradingSwarmTimestamp;
  readonly lastSynchronizedAtMs?: TradingSwarmTimestamp;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly assessedAtMs: TradingSwarmTimestamp;
}

export interface TradingSwarmNodeState {
  readonly registration: TradingSwarmNodeRegistration;
  readonly health: TradingSwarmNodeHealth;
  readonly ownedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly activeMissionIds: readonly TradingSwarmMissionId[];
  readonly activeTaskIds: readonly TradingSwarmTaskId[];
  readonly currentTerm: TradingSwarmTerm;
  readonly currentEpoch: TradingSwarmEpoch;
  readonly stateVersion: number;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Membership, topology, partitions, ownership, and leases
 * ========================================================================== */

export type TradingSwarmMembershipChangeType =
  | "NODE_JOINED"
  | "NODE_LEFT"
  | "NODE_REMOVED"
  | "NODE_QUARANTINED"
  | "NODE_RESTORED"
  | "ROLE_CHANGED";

export interface TradingSwarmMembershipChange {
  readonly changeId: string;
  readonly swarmId: TradingSwarmId;
  readonly nodeId: TradingSwarmNodeId;
  readonly type: TradingSwarmMembershipChangeType;
  readonly previousRole?: TradingSwarmNodeRole;
  readonly currentRole?: TradingSwarmNodeRole;
  readonly reason: string;
  readonly effectiveAtMs: TradingSwarmTimestamp;
  readonly term: TradingSwarmTerm;
  readonly epoch: TradingSwarmEpoch;
  readonly deterministicFingerprint: string;
}

export type TradingSwarmPartitionType =
  | "MARKET"
  | "STRATEGY"
  | "PORTFOLIO"
  | "EXCHANGE"
  | "ASSET_CLASS"
  | "TIMEFRAME"
  | "RISK_DOMAIN"
  | "MISSION"
  | "CUSTOM";

export type TradingSwarmPartitionState =
  | "UNASSIGNED"
  | "ASSIGNING"
  | "ACTIVE"
  | "REBALANCING"
  | "MIGRATING"
  | "DEGRADED"
  | "RECOVERING"
  | "QUARANTINED"
  | "RETIRED";

export interface TradingSwarmPartition {
  readonly partitionId: TradingSwarmPartitionId;
  readonly swarmId: TradingSwarmId;
  readonly type: TradingSwarmPartitionType;
  readonly key: string;
  readonly state: TradingSwarmPartitionState;
  readonly ownerNodeId?: TradingSwarmNodeId;
  readonly replicaNodeIds: readonly TradingSwarmNodeId[];
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly weight: TradingSwarmWeight;
  readonly priority: TradingSwarmPriority;
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly updatedAtMs: TradingSwarmTimestamp;
  readonly version: number;
  readonly deterministicFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmPartitionLease {
  readonly leaseId: TradingSwarmLeaseId;
  readonly partitionId: TradingSwarmPartitionId;
  readonly ownerNodeId: TradingSwarmNodeId;
  readonly term: TradingSwarmTerm;
  readonly epoch: TradingSwarmEpoch;
  readonly acquiredAtMs: TradingSwarmTimestamp;
  readonly expiresAtMs: TradingSwarmTimestamp;
  readonly renewedAtMs?: TradingSwarmTimestamp;
  readonly fencingToken: number;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmTopologySnapshot {
  readonly swarmId: TradingSwarmId;
  readonly topology: TradingSwarmTopology;
  readonly coordinationMode: TradingSwarmCoordinationMode;
  readonly leaderNodeId?: TradingSwarmNodeId;
  readonly nodes: readonly TradingSwarmNodeState[];
  readonly partitions: readonly TradingSwarmPartition[];
  readonly leases: readonly TradingSwarmPartitionLease[];
  readonly term: TradingSwarmTerm;
  readonly epoch: TradingSwarmEpoch;
  readonly topologyVersion: number;
  readonly capturedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Priorities, actions, missions, tasks, and work allocation
 * ========================================================================== */

export type TradingSwarmPriority =
  | "BACKGROUND"
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "VERY_HIGH"
  | "CRITICAL"
  | "EMERGENCY";

export type TradingSwarmActionType =
  | "OBSERVE"
  | "ANALYZE"
  | "SIMULATE"
  | "PROPOSE"
  | "REVIEW"
  | "VOTE"
  | "COORDINATE"
  | "REPARTITION"
  | "MIGRATE"
  | "CHECKPOINT"
  | "RECOVER"
  | "AUTHORIZE"
  | "EXECUTE"
  | "PAUSE"
  | "CANCEL"
  | "ROLLBACK"
  | "ESCALATE";

export type TradingSwarmMissionObjective =
  | "GLOBAL_MARKET_ASSESSMENT"
  | "DISTRIBUTED_TRADE_DECISION"
  | "CROSS_MARKET_STRATEGY_SELECTION"
  | "DISTRIBUTED_PORTFOLIO_REBALANCE"
  | "SYSTEMIC_RISK_RESPONSE"
  | "DISTRIBUTED_ARBITRAGE_DISCOVERY"
  | "CROSS_EXCHANGE_EXECUTION"
  | "LIQUIDITY_COORDINATION"
  | "REGIME_TRANSITION_RESPONSE"
  | "AUTONOMOUS_SWARM_OPTIMIZATION"
  | "DISASTER_RECOVERY"
  | "FULL_SWARM_DECISION";

export type TradingSwarmMissionStatus =
  | "CREATED"
  | "VALIDATING"
  | "PLANNING"
  | "PARTITIONING"
  | "ASSIGNING"
  | "RUNNING"
  | "COORDINATING"
  | "FORMING_CONSENSUS"
  | "GOVERNING"
  | "PLANNING_EXECUTION"
  | "EXECUTING"
  | "MONITORING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "DEFERRED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export type TradingSwarmTaskType =
  | "BUILD_GLOBAL_CONTEXT"
  | "RUN_MULTI_AGENT_COLLECTIVE"
  | "ANALYZE_PARTITION"
  | "DISCOVER_OPPORTUNITIES"
  | "ASSESS_SYSTEMIC_RISK"
  | "ASSESS_LIQUIDITY"
  | "ASSESS_PORTFOLIO"
  | "ASSESS_STRATEGIES"
  | "FORM_LOCAL_DECISION"
  | "REPLICATE_STATE"
  | "CHECKPOINT_STATE"
  | "FORM_GLOBAL_CONSENSUS"
  | "EVALUATE_GOVERNANCE"
  | "PLAN_DISTRIBUTED_EXECUTION"
  | "EXECUTE_ACTION"
  | "MONITOR_EXECUTION"
  | "ROLLBACK_ACTION"
  | "LEARN_FROM_OUTCOME"
  | "RECOVER_PARTITION";

export type TradingSwarmTaskStatus =
  | "CREATED"
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "BLOCKED"
  | "RETRYING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface TradingSwarmMissionConstraints {
  readonly maximumCapitalAtRisk?: number;
  readonly maximumRiskScore?: TradingSwarmRisk;
  readonly maximumLeverage?: number;
  readonly maximumDrawdown?: number;
  readonly maximumExecutionActions?: number;
  readonly maximumMissionDurationMs?: number;
  readonly requiredNodeRoles?: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities?: readonly TradingSwarmCapability[];
  readonly requiredPartitionIds?: readonly TradingSwarmPartitionId[];
  readonly prohibitedActions?: readonly TradingSwarmActionType[];
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmMission {
  readonly missionId: TradingSwarmMissionId;
  readonly swarmId: TradingSwarmId;
  readonly runId: TradingSwarmRunId;
  readonly objective: TradingSwarmMissionObjective;
  readonly status: TradingSwarmMissionStatus;
  readonly priority: TradingSwarmPriority;
  readonly requestedBy: string;
  readonly portfolioId?: string;
  readonly marketIds: readonly TradingSwarmMarketId[];
  readonly strategyIds: readonly TradingSwarmStrategyId[];
  readonly partitionIds: readonly TradingSwarmPartitionId[];
  readonly constraints: TradingSwarmMissionConstraints;
  readonly context: TradingSwarmContext;
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly deadlineAtMs?: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmTaskDependency {
  readonly taskId: TradingSwarmTaskId;
  readonly requiredStatus: Extract<
    TradingSwarmTaskStatus,
    "COMPLETED"
  >;
  readonly optional: boolean;
}

export interface TradingSwarmTask {
  readonly taskId: TradingSwarmTaskId;
  readonly missionId: TradingSwarmMissionId;
  readonly runId: TradingSwarmRunId;
  readonly type: TradingSwarmTaskType;
  readonly status: TradingSwarmTaskStatus;
  readonly priority: TradingSwarmPriority;
  readonly assignedNodeId?: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly dependencies: readonly TradingSwarmTaskDependency[];
  readonly attempt: number;
  readonly maximumAttempts: number;
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly assignedAtMs?: TradingSwarmTimestamp;
  readonly startedAtMs?: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
  readonly deadlineAtMs?: TradingSwarmTimestamp;
  readonly inputFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmTaskAssignment {
  readonly task: TradingSwarmTask;
  readonly node: TradingSwarmNodeRegistration;
  readonly lease?: TradingSwarmPartitionLease;
  readonly assignedAtMs: TradingSwarmTimestamp;
  readonly assignmentScore: TradingSwarmScore;
  readonly rationale: string;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Context, observations, local collective runs, and node contributions
 * ========================================================================== */

export interface TradingSwarmContext {
  readonly multiAgentContext: MultiAgentSystemContext;
  readonly topology: TradingSwarmTopologySnapshot;
  readonly activeMissions: readonly TradingSwarmMissionSummary[];
  readonly recentDecisions: readonly TradingSwarmDecision[];
  readonly executionState?: TradingSwarmExecutionState;
  readonly systemRisk: TradingSwarmRiskAssessment;
  readonly builtAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmMissionSummary {
  readonly missionId: TradingSwarmMissionId;
  readonly objective: TradingSwarmMissionObjective;
  readonly status: TradingSwarmMissionStatus;
  readonly priority: TradingSwarmPriority;
  readonly participatingNodeIds: readonly TradingSwarmNodeId[];
  readonly completedTaskCount: number;
  readonly failedTaskCount: number;
  readonly progress: TradingSwarmScore;
  readonly startedAtMs?: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
}

export type TradingSwarmObservationType =
  | "MARKET"
  | "STRATEGY"
  | "PORTFOLIO"
  | "RISK"
  | "ARBITRAGE"
  | "LIQUIDITY"
  | "EXECUTION"
  | "HEALTH"
  | "TOPOLOGY"
  | "CONSENSUS"
  | "ANOMALY"
  | "RECOVERY";

export interface TradingSwarmEvidenceReference {
  readonly evidenceId: string;
  readonly sourceNodeId: TradingSwarmNodeId;
  readonly sourceAgentId?: MultiAgentId;
  readonly sourceRunId?: string;
  readonly description: string;
  readonly confidence: TradingSwarmConfidence;
  readonly observedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint?: string;
}

export interface TradingSwarmObservation {
  readonly observationId: string;
  readonly missionId: TradingSwarmMissionId;
  readonly taskId: TradingSwarmTaskId;
  readonly nodeId: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly type: TradingSwarmObservationType;
  readonly summary: string;
  readonly confidence: TradingSwarmConfidence;
  readonly risk: TradingSwarmRisk;
  readonly utility: TradingSwarmUtility;
  readonly evidence: readonly TradingSwarmEvidenceReference[];
  readonly recommendations: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly observedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmLocalCollectiveRun {
  readonly nodeId: TradingSwarmNodeId;
  readonly missionId: TradingSwarmMissionId;
  readonly taskId: TradingSwarmTaskId;
  readonly request: MultiAgentRunRequest;
  readonly outcome: MultiAgentExecutionOutcome;
  readonly selectedAgentIds: readonly MultiAgentId[];
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmNodeContribution {
  readonly nodeId: TradingSwarmNodeId;
  readonly partitionIds: readonly TradingSwarmPartitionId[];
  readonly localRunIds: readonly string[];
  readonly observations: readonly TradingSwarmObservation[];
  readonly localDecisions: readonly MultiAgentCollectiveDecision[];
  readonly confidence: TradingSwarmConfidence;
  readonly utilityContribution: TradingSwarmUtility;
  readonly riskContribution: TradingSwarmRisk;
  readonly reliabilityScore: TradingSwarmScore;
  readonly submittedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Leader election, distributed ballots, quorum, and consensus
 * ========================================================================== */

export type TradingSwarmElectionReason =
  | "INITIAL_FORMATION"
  | "LEADER_FAILURE"
  | "LEADER_DEGRADED"
  | "TERM_EXPIRED"
  | "MEMBERSHIP_CHANGE"
  | "MANUAL_REELECTION"
  | "RECOVERY";

export type TradingSwarmElectionStatus =
  | "CREATED"
  | "NOMINATING"
  | "VOTING"
  | "ELECTED"
  | "NO_QUORUM"
  | "DEADLOCKED"
  | "CANCELLED"
  | "FAILED";

export interface TradingSwarmLeaderCandidate {
  readonly nodeId: TradingSwarmNodeId;
  readonly term: TradingSwarmTerm;
  readonly readinessScore: TradingSwarmScore;
  readonly reliabilityScore: TradingSwarmScore;
  readonly synchronizationScore: TradingSwarmScore;
  readonly leadershipScore: TradingSwarmScore;
  readonly eligible: boolean;
  readonly disqualifications: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmLeaderVote {
  readonly ballotId: TradingSwarmBallotId;
  readonly electionId: TradingSwarmElectionId;
  readonly voterNodeId: TradingSwarmNodeId;
  readonly candidateNodeId?: TradingSwarmNodeId;
  readonly term: TradingSwarmTerm;
  readonly weight: TradingSwarmWeight;
  readonly abstained: boolean;
  readonly rationale: string;
  readonly castAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmLeaderElection {
  readonly electionId: TradingSwarmElectionId;
  readonly swarmId: TradingSwarmId;
  readonly reason: TradingSwarmElectionReason;
  readonly status: TradingSwarmElectionStatus;
  readonly term: TradingSwarmTerm;
  readonly candidates: readonly TradingSwarmLeaderCandidate[];
  readonly votes: readonly TradingSwarmLeaderVote[];
  readonly electedNodeId?: TradingSwarmNodeId;
  readonly quorumSatisfied: boolean;
  readonly participationRatio: TradingSwarmScore;
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export type TradingSwarmBallotChoice =
  | "APPROVE"
  | "REJECT"
  | "ABSTAIN"
  | "VETO";

export interface TradingSwarmDecisionBallot {
  readonly ballotId: TradingSwarmBallotId;
  readonly missionId: TradingSwarmMissionId;
  readonly decisionCandidateId: string;
  readonly nodeId: TradingSwarmNodeId;
  readonly choice: TradingSwarmBallotChoice;
  readonly weight: TradingSwarmWeight;
  readonly confidence: TradingSwarmConfidence;
  readonly riskAdjustment: number;
  readonly reliabilityAdjustment: number;
  readonly rationale: string;
  readonly restrictions: readonly string[];
  readonly castAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmQuorumPolicy {
  readonly minimumEligibleNodes: number;
  readonly minimumParticipatingNodes: number;
  readonly minimumParticipationRatio: TradingSwarmScore;
  readonly requiredNodeRoles: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly requireLeader: boolean;
  readonly requireRiskSwarm: boolean;
  readonly requireGovernanceSwarm: boolean;
  readonly allowDegradedNodes: boolean;
}

export type TradingSwarmConsensusMethod =
  | "UNANIMOUS"
  | "SIMPLE_MAJORITY"
  | "SUPERMAJORITY"
  | "WEIGHTED"
  | "RISK_ADJUSTED"
  | "RELIABILITY_WEIGHTED"
  | "BYZANTINE_QUORUM"
  | "HYBRID";

export type TradingSwarmConsensusStatus =
  | "CONSENSUS_REACHED"
  | "CONSENSUS_WITH_RESTRICTIONS"
  | "REJECTED"
  | "VETOED"
  | "NO_QUORUM"
  | "DEADLOCKED"
  | "DEFERRED";

export interface TradingSwarmConsensusPolicy {
  readonly method: TradingSwarmConsensusMethod;
  readonly approvalThreshold: TradingSwarmScore;
  readonly rejectionThreshold: TradingSwarmScore;
  readonly vetoEnabled: boolean;
  readonly maximumAbstentionRatio: TradingSwarmScore;
  readonly quorum: TradingSwarmQuorumPolicy;
  readonly maximumConsensusRounds: number;
  readonly deadlockResolution:
    | "LEADER"
    | "ARBITER"
    | "SUPERVISOR"
    | "OPERATOR"
    | "REJECT";
}

export interface TradingSwarmCollectiveConfidence {
  readonly rawConfidence: TradingSwarmConfidence;
  readonly nodeReliabilityAdjustment: number;
  readonly partitionCoverageAdjustment: number;
  readonly dissentAdjustment: number;
  readonly systemicRiskAdjustment: number;
  readonly governanceAdjustment: number;
  readonly finalConfidence: TradingSwarmConfidence;
}

export interface TradingSwarmConsensusResult {
  readonly consensusId: string;
  readonly missionId: TradingSwarmMissionId;
  readonly status: TradingSwarmConsensusStatus;
  readonly method: TradingSwarmConsensusMethod;
  readonly selectedCandidateId?: string;
  readonly ballots: readonly TradingSwarmDecisionBallot[];
  readonly approvalWeight: TradingSwarmWeight;
  readonly rejectionWeight: TradingSwarmWeight;
  readonly abstentionWeight: TradingSwarmWeight;
  readonly vetoCount: number;
  readonly participationRatio: TradingSwarmScore;
  readonly quorumSatisfied: boolean;
  readonly partitionCoverageRatio: TradingSwarmScore;
  readonly collectiveConfidence: TradingSwarmCollectiveConfidence;
  readonly dissent: readonly TradingSwarmDissentRecord[];
  readonly unresolvedConflictIds: readonly string[];
  readonly rationale: string;
  readonly formedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmDissentRecord {
  readonly nodeId: TradingSwarmNodeId;
  readonly choice: TradingSwarmBallotChoice;
  readonly material: boolean;
  readonly rationale: string;
  readonly riskConcern?: string;
  readonly proposedAlternative?: string;
}

/* ========================================================================== *
 * Risk, governance, safety, and operator control
 * ========================================================================== */

export type TradingSwarmRiskSeverity =
  | "INFORMATIONAL"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export type TradingSwarmRiskCategory =
  | "MARKET"
  | "LIQUIDITY"
  | "VOLATILITY"
  | "CORRELATION"
  | "CONCENTRATION"
  | "LEVERAGE"
  | "EXECUTION"
  | "COUNTERPARTY"
  | "MODEL"
  | "CONSENSUS"
  | "TOPOLOGY"
  | "PARTITION"
  | "SYNCHRONIZATION"
  | "DATA_FRESHNESS"
  | "OPERATIONAL"
  | "GOVERNANCE"
  | "SYSTEMIC";

export interface TradingSwarmRiskFinding {
  readonly findingId: string;
  readonly category: TradingSwarmRiskCategory;
  readonly severity: TradingSwarmRiskSeverity;
  readonly score: TradingSwarmRisk;
  readonly title: string;
  readonly description: string;
  readonly affectedNodeIds: readonly TradingSwarmNodeId[];
  readonly affectedPartitionIds: readonly TradingSwarmPartitionId[];
  readonly mitigations: readonly string[];
  readonly blocking: boolean;
  readonly detectedAtMs: TradingSwarmTimestamp;
}

export interface TradingSwarmRiskAssessment {
  readonly assessmentId: string;
  readonly overallRisk: TradingSwarmRisk;
  readonly systemicRisk: TradingSwarmRisk;
  readonly executionRisk: TradingSwarmRisk;
  readonly coordinationRisk: TradingSwarmRisk;
  readonly partitionRisk: TradingSwarmRisk;
  readonly findings: readonly TradingSwarmRiskFinding[];
  readonly executionAllowed: boolean;
  readonly restrictions: readonly string[];
  readonly assessedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export type TradingSwarmGovernanceDecision =
  | "APPROVED"
  | "APPROVED_WITH_RESTRICTIONS"
  | "REQUIRES_OPERATOR_APPROVAL"
  | "DEFERRED"
  | "REJECTED";

export interface TradingSwarmGovernanceRule {
  readonly ruleId: TradingSwarmPolicyId;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly priority: TradingSwarmPriority;
  readonly blocking: boolean;
  readonly applicableObjectives: readonly TradingSwarmMissionObjective[];
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmGovernanceRuleResult {
  readonly ruleId: TradingSwarmPolicyId;
  readonly passed: boolean;
  readonly blocking: boolean;
  readonly message: string;
  readonly restrictions: readonly string[];
}

export interface TradingSwarmGovernanceAssessment {
  readonly assessmentId: string;
  readonly missionId: TradingSwarmMissionId;
  readonly decision: TradingSwarmGovernanceDecision;
  readonly ruleResults: readonly TradingSwarmGovernanceRuleResult[];
  readonly riskAssessment: TradingSwarmRiskAssessment;
  readonly executionAuthorized: boolean;
  readonly operatorApprovalRequired: boolean;
  readonly restrictions: readonly string[];
  readonly assessedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmSafetyPolicy {
  readonly failClosed: boolean;
  readonly minimumCollectiveConfidence: TradingSwarmConfidence;
  readonly minimumNodeReliability: TradingSwarmScore;
  readonly minimumPartitionCoverage: TradingSwarmScore;
  readonly maximumSystemicRisk: TradingSwarmRisk;
  readonly maximumExecutionRisk: TradingSwarmRisk;
  readonly maximumCapitalAtRisk: number;
  readonly maximumLeverage: number;
  readonly maximumDrawdown: number;
  readonly maximumFailedNodeRatio: TradingSwarmScore;
  readonly maximumUnsynchronizedNodeRatio: TradingSwarmScore;
  readonly requireHealthyLeader: boolean;
  readonly requireRiskSwarmParticipation: boolean;
  readonly requireGovernanceSwarmParticipation: boolean;
  readonly rejectOnStaleContext: boolean;
  readonly rejectOnPartitionConflict: boolean;
  readonly rejectOnUnresolvedMaterialDissent: boolean;
  readonly rejectOnCriticalAnomaly: boolean;
  readonly allowOperatorOverride: boolean;
}

export interface TradingSwarmOperatorEscalation {
  readonly escalationId: string;
  readonly missionId: TradingSwarmMissionId;
  readonly reason:
    | "HIGH_RISK"
    | "NO_QUORUM"
    | "DEADLOCK"
    | "CRITICAL_DISSENT"
    | "TOPOLOGY_FAILURE"
    | "PARTITION_CONFLICT"
    | "EXECUTION_AUTHORITY_REQUIRED"
    | "POLICY_REQUIREMENT"
    | "MANUAL_REVIEW";
  readonly severity: TradingSwarmRiskSeverity;
  readonly summary: string;
  readonly requestedActions: readonly string[];
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly expiresAtMs?: TradingSwarmTimestamp;
}

/* ========================================================================== *
 * Distributed decision and execution
 * ========================================================================== */

export type TradingSwarmDecision =
  | "EXECUTE"
  | "EXECUTE_WITH_RESTRICTIONS"
  | "SIGNAL_ONLY"
  | "HOLD"
  | "DEFER"
  | "REJECT"
  | "PAUSE_SYSTEM"
  | "RECOVER_SYSTEM";

export interface TradingSwarmDecisionAction {
  readonly actionId: string;
  readonly type:
    | "PLACE_ORDER"
    | "CANCEL_ORDER"
    | "REPLACE_ORDER"
    | "ALLOCATE_CAPITAL"
    | "REDUCE_EXPOSURE"
    | "CLOSE_POSITION"
    | "ROTATE_STRATEGY"
    | "PAUSE_STRATEGY"
    | "RESUME_STRATEGY"
    | "REBALANCE_PORTFOLIO"
    | "EXECUTE_ARBITRAGE"
    | "HEDGE_RISK"
    | "REPARTITION_SWARM"
    | "MIGRATE_WORKLOAD"
    | "NO_ACTION";
  readonly assignedNodeId?: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly marketId?: TradingSwarmMarketId;
  readonly strategyId?: TradingSwarmStrategyId;
  readonly quantity?: number;
  readonly notional?: number;
  readonly priority: TradingSwarmPriority;
  readonly dependencies: readonly string[];
  readonly restrictions: readonly string[];
  readonly metadata?: TradingSwarmMetadata;
}

export interface TradingSwarmDecisionCandidate {
  readonly candidateId: string;
  readonly missionId: TradingSwarmMissionId;
  readonly proposedByNodeId: TradingSwarmNodeId;
  readonly sourceDecisionIds: readonly string[];
  readonly decision: TradingSwarmDecision;
  readonly actions: readonly TradingSwarmDecisionAction[];
  readonly confidence: TradingSwarmConfidence;
  readonly expectedUtility: TradingSwarmUtility;
  readonly estimatedRisk: TradingSwarmRisk;
  readonly partitionCoverageRatio: TradingSwarmScore;
  readonly restrictions: readonly string[];
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmCollectiveDecision {
  readonly decisionId: TradingSwarmDecisionId;
  readonly missionId: TradingSwarmMissionId;
  readonly runId: TradingSwarmRunId;
  readonly decision: TradingSwarmDecision;
  readonly selectedCandidateId?: string;
  readonly actions: readonly TradingSwarmDecisionAction[];
  readonly consensus: TradingSwarmConsensusResult;
  readonly governance: TradingSwarmGovernanceAssessment;
  readonly collectiveConfidence: TradingSwarmCollectiveConfidence;
  readonly expectedUtility: TradingSwarmUtility;
  readonly estimatedRisk: TradingSwarmRisk;
  readonly restrictions: readonly string[];
  readonly dissent: readonly TradingSwarmDissentRecord[];
  readonly operatorEscalation?: TradingSwarmOperatorEscalation;
  readonly executionPlan?: TradingSwarmExecutionPlan;
  readonly decidedAtMs: TradingSwarmTimestamp;
  readonly validUntilMs?: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: TradingSwarmMetadata;
}

export type TradingSwarmExecutionMode =
  | "SIGNAL_ONLY"
  | "SIMULATION"
  | "PAPER"
  | "SEMI_AUTOMATED"
  | "FULLY_AUTOMATED";

export type TradingSwarmExecutionStatus =
  | "NOT_STARTED"
  | "AUTHORIZED"
  | "DISPATCHING"
  | "EXECUTING"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "PAUSED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export interface TradingSwarmExecutionStep {
  readonly stepId: string;
  readonly planId: TradingSwarmPlanId;
  readonly sequence: number;
  readonly action: TradingSwarmDecisionAction;
  readonly assignedNodeId: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly timeoutMs: number;
  readonly maximumAttempts: number;
  readonly rollbackAction?: TradingSwarmDecisionAction;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmExecutionPlan {
  readonly planId: TradingSwarmPlanId;
  readonly decisionId: TradingSwarmDecisionId;
  readonly missionId: TradingSwarmMissionId;
  readonly mode: TradingSwarmExecutionMode;
  readonly status: TradingSwarmExecutionStatus;
  readonly executionAuthorized: boolean;
  readonly steps: readonly TradingSwarmExecutionStep[];
  readonly preconditions: readonly string[];
  readonly monitoringRequirements: readonly string[];
  readonly rollbackRequired: boolean;
  readonly restrictions: readonly string[];
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly expiresAtMs?: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmExecutionStepResult {
  readonly stepId: string;
  readonly nodeId: TradingSwarmNodeId;
  readonly status:
    | "COMPLETED"
    | "SKIPPED"
    | "REJECTED"
    | "FAILED"
    | "TIMED_OUT"
    | "ROLLED_BACK";
  readonly externalExecutionId?: string;
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs: TradingSwarmTimestamp;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmExecutionState {
  readonly planId: TradingSwarmPlanId;
  readonly decisionId: TradingSwarmDecisionId;
  readonly status: TradingSwarmExecutionStatus;
  readonly stepResults: readonly TradingSwarmExecutionStepResult[];
  readonly completedStepCount: number;
  readonly failedStepCount: number;
  readonly rollbackStepCount: number;
  readonly capitalCommitted: number;
  readonly realizedRisk: TradingSwarmRisk;
  readonly startedAtMs?: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Resilience, replication, checkpoints, migration, and recovery
 * ========================================================================== */

export type TradingSwarmFailureType =
  | "NODE_FAILURE"
  | "LEADER_FAILURE"
  | "PARTITION_FAILURE"
  | "CONSENSUS_FAILURE"
  | "STATE_DIVERGENCE"
  | "SYNCHRONIZATION_FAILURE"
  | "NETWORK_PARTITION"
  | "TASK_FAILURE"
  | "EXECUTION_FAILURE"
  | "PERSISTENCE_FAILURE"
  | "GOVERNANCE_FAILURE"
  | "UNKNOWN";

export interface TradingSwarmFailure {
  readonly failureId: string;
  readonly type: TradingSwarmFailureType;
  readonly code: string;
  readonly message: string;
  readonly nodeId?: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly missionId?: TradingSwarmMissionId;
  readonly taskId?: TradingSwarmTaskId;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly detectedAtMs: TradingSwarmTimestamp;
  readonly metadata?: TradingSwarmMetadata;
}

export type TradingSwarmRecoveryAction =
  | "RETRY_TASK"
  | "REASSIGN_TASK"
  | "ELECT_NEW_LEADER"
  | "REASSIGN_PARTITION"
  | "RESTORE_CHECKPOINT"
  | "REPLICATE_STATE"
  | "MIGRATE_WORKLOAD"
  | "QUARANTINE_NODE"
  | "RESTART_MISSION"
  | "ROLLBACK_EXECUTION"
  | "ESCALATE_TO_OPERATOR"
  | "FAIL_CLOSED";

export interface TradingSwarmRecoveryPlan {
  readonly recoveryPlanId: string;
  readonly failureId: string;
  readonly actions: readonly TradingSwarmRecoveryAction[];
  readonly targetNodeIds: readonly TradingSwarmNodeId[];
  readonly targetPartitionIds: readonly TradingSwarmPartitionId[];
  readonly maximumAttempts: number;
  readonly timeoutMs: number;
  readonly requiresOperatorApproval: boolean;
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmCheckpoint {
  readonly checkpointId: TradingSwarmCheckpointId;
  readonly swarmId: TradingSwarmId;
  readonly term: TradingSwarmTerm;
  readonly epoch: TradingSwarmEpoch;
  readonly topology: TradingSwarmTopologySnapshot;
  readonly activeMissions: readonly TradingSwarmMission[];
  readonly tasks: readonly TradingSwarmTask[];
  readonly decisions: readonly TradingSwarmCollectiveDecision[];
  readonly executionStates: readonly TradingSwarmExecutionState[];
  readonly multiAgentMemory: readonly MultiAgentMemoryRecord[];
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export type TradingSwarmMigrationStatus =
  | "PLANNED"
  | "PREPARING"
  | "TRANSFERRING"
  | "VERIFYING"
  | "COMPLETED"
  | "ROLLED_BACK"
  | "FAILED"
  | "CANCELLED";

export interface TradingSwarmWorkloadMigration {
  readonly migrationId: string;
  readonly partitionId: TradingSwarmPartitionId;
  readonly sourceNodeId: TradingSwarmNodeId;
  readonly targetNodeId: TradingSwarmNodeId;
  readonly status: TradingSwarmMigrationStatus;
  readonly sourceLeaseId?: TradingSwarmLeaseId;
  readonly targetLeaseId?: TradingSwarmLeaseId;
  readonly checkpointId?: TradingSwarmCheckpointId;
  readonly initiatedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Learning, trust, reputation, and swarm optimization
 * ========================================================================== */

export interface TradingSwarmNodeTrustScore {
  readonly nodeId: TradingSwarmNodeId;
  readonly overallTrust: TradingSwarmScore;
  readonly reliabilityScore: TradingSwarmScore;
  readonly consensusIntegrityScore: TradingSwarmScore;
  readonly executionQualityScore: TradingSwarmScore;
  readonly recoveryQualityScore: TradingSwarmScore;
  readonly synchronizationScore: TradingSwarmScore;
  readonly collaborationScore: TradingSwarmScore;
  readonly governanceComplianceScore: TradingSwarmScore;
  readonly sampleSize: number;
  readonly quarantined: boolean;
  readonly assessedAtMs: TradingSwarmTimestamp;
}

export interface TradingSwarmLearningObservation {
  readonly nodeId: TradingSwarmNodeId;
  readonly missionId: TradingSwarmMissionId;
  readonly predictedConfidence: TradingSwarmConfidence;
  readonly realizedCorrectness: TradingSwarmScore;
  readonly utilityContribution: TradingSwarmUtility;
  readonly riskContribution: TradingSwarmRisk;
  readonly executionQuality: TradingSwarmScore;
  readonly collaborationQuality: TradingSwarmScore;
  readonly observedAtMs: TradingSwarmTimestamp;
}

export interface TradingSwarmTrustUpdate {
  readonly nodeId: TradingSwarmNodeId;
  readonly previous: TradingSwarmNodeTrustScore;
  readonly current: TradingSwarmNodeTrustScore;
  readonly delta: number;
  readonly reason: string;
  readonly updatedAtMs: TradingSwarmTimestamp;
}

export interface TradingSwarmOptimizationRecommendation {
  readonly recommendationId: string;
  readonly type:
    | "ADD_NODE"
    | "REMOVE_NODE"
    | "CHANGE_NODE_ROLE"
    | "REPARTITION"
    | "MIGRATE_PARTITION"
    | "ADJUST_REPLICATION"
    | "ADJUST_QUORUM"
    | "ADJUST_CAPACITY"
    | "CHANGE_TOPOLOGY"
    | "CHANGE_COORDINATION_MODE";
  readonly priority: TradingSwarmPriority;
  readonly targetNodeId?: TradingSwarmNodeId;
  readonly targetPartitionId?: TradingSwarmPartitionId;
  readonly expectedBenefit: TradingSwarmUtility;
  readonly estimatedRisk: TradingSwarmRisk;
  readonly rationale: string;
  readonly generatedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Explainability, telemetry, audit, events, and snapshots
 * ========================================================================== */

export interface TradingSwarmNodeContributionExplanation {
  readonly nodeId: TradingSwarmNodeId;
  readonly role: TradingSwarmNodeRole;
  readonly partitionContribution: TradingSwarmScore;
  readonly evidenceContribution: TradingSwarmScore;
  readonly consensusContribution: TradingSwarmScore;
  readonly executionContribution: TradingSwarmScore;
  readonly finalContribution: TradingSwarmScore;
  readonly summary: string;
}

export interface TradingSwarmDecisionExplanation {
  readonly explanationId: string;
  readonly decisionId: TradingSwarmDecisionId;
  readonly headline: string;
  readonly summary: string;
  readonly topologyNarrative: string;
  readonly partitionNarrative: string;
  readonly consensusNarrative: string;
  readonly governanceNarrative: string;
  readonly executionNarrative?: string;
  readonly nodeContributions: readonly TradingSwarmNodeContributionExplanation[];
  readonly primaryFactors: readonly string[];
  readonly opposingFactors: readonly string[];
  readonly uncertaintyFactors: readonly string[];
  readonly alternativesConsidered: readonly string[];
  readonly limitations: readonly string[];
  readonly generatedAtMs: TradingSwarmTimestamp;
  readonly modelVersion: string;
}

export interface TradingSwarmStageTiming {
  readonly stage: TradingSwarmPipelineStage;
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs: TradingSwarmTimestamp;
  readonly durationMs: number;
}

export type TradingSwarmPipelineStage =
  | "VALIDATION"
  | "CONTEXT_BUILDING"
  | "TOPOLOGY_ASSESSMENT"
  | "LEADER_ELECTION"
  | "PARTITION_PLANNING"
  | "MISSION_PLANNING"
  | "TASK_ASSIGNMENT"
  | "LOCAL_MULTI_AGENT_EXECUTION"
  | "CONTRIBUTION_COLLECTION"
  | "CANDIDATE_ASSEMBLY"
  | "DISTRIBUTED_CONSENSUS"
  | "RISK_ASSESSMENT"
  | "GOVERNANCE"
  | "DECISION_ASSEMBLY"
  | "EXECUTION_PLANNING"
  | "EXECUTION"
  | "LEARNING"
  | "CHECKPOINTING"
  | "EXPLAINABILITY"
  | "PUBLICATION";

export interface TradingSwarmAuditTrace {
  readonly traceId: TradingSwarmTraceId;
  readonly runId: TradingSwarmRunId;
  readonly missionId: TradingSwarmMissionId;
  readonly createdAtMs: TradingSwarmTimestamp;
  readonly completedAtMs?: TradingSwarmTimestamp;
  readonly completedStages: readonly TradingSwarmPipelineStage[];
  readonly stageTimings: readonly TradingSwarmStageTiming[];
  readonly nodeIds: readonly TradingSwarmNodeId[];
  readonly partitionIds: readonly TradingSwarmPartitionId[];
  readonly taskIds: readonly TradingSwarmTaskId[];
  readonly localRunIds: readonly string[];
  readonly ballotIds: readonly TradingSwarmBallotId[];
  readonly eventIds: readonly TradingSwarmEventId[];
  readonly checkpointIds: readonly TradingSwarmCheckpointId[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly deterministicFingerprint: string;
}

export type TradingSwarmPublicationTopic =
  | "SWARM_CREATED"
  | "SWARM_STATE_CHANGED"
  | "NODE_REGISTERED"
  | "NODE_HEALTH_CHANGED"
  | "NODE_QUARANTINED"
  | "LEADER_ELECTION_STARTED"
  | "LEADER_ELECTED"
  | "PARTITION_ASSIGNED"
  | "PARTITION_MIGRATION_STARTED"
  | "PARTITION_MIGRATION_COMPLETED"
  | "MISSION_STARTED"
  | "TASK_ASSIGNED"
  | "LOCAL_RUN_COMPLETED"
  | "CONTRIBUTION_RECEIVED"
  | "CONSENSUS_FORMED"
  | "GOVERNANCE_EVALUATED"
  | "DECISION_COMPLETED"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "RECOVERY_STARTED"
  | "RECOVERY_COMPLETED"
  | "CHECKPOINT_CREATED"
  | "SWARM_OPTIMIZED"
  | "MISSION_FAILED";

export interface TradingSwarmEvent {
  readonly eventId: TradingSwarmEventId;
  readonly topic: TradingSwarmPublicationTopic;
  readonly swarmId: TradingSwarmId;
  readonly runId?: TradingSwarmRunId;
  readonly missionId?: TradingSwarmMissionId;
  readonly nodeId?: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly occurredAtMs: TradingSwarmTimestamp;
  readonly sequence: TradingSwarmSequence;
  readonly term: TradingSwarmTerm;
  readonly epoch: TradingSwarmEpoch;
  readonly payload: TradingSwarmJsonValue;
  readonly correlationId: TradingSwarmCorrelationId;
  readonly causationId?: TradingSwarmCausationId;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmTelemetry {
  readonly swarmId: TradingSwarmId;
  readonly capturedAtMs: TradingSwarmTimestamp;
  readonly registeredNodeCount: number;
  readonly healthyNodeCount: number;
  readonly activeNodeCount: number;
  readonly degradedNodeCount: number;
  readonly activeMissionCount: number;
  readonly activeTaskCount: number;
  readonly activePartitionCount: number;
  readonly migratingPartitionCount: number;
  readonly averageNodeReliability: TradingSwarmScore;
  readonly averageSynchronizationScore: TradingSwarmScore;
  readonly averageConsensusParticipation: TradingSwarmScore;
  readonly averageMissionConfidence: TradingSwarmConfidence;
  readonly missionSuccessRate: TradingSwarmScore;
  readonly taskSuccessRate: TradingSwarmScore;
  readonly executionSuccessRate: TradingSwarmScore;
  readonly deterministicFingerprint: string;
}

export interface TradingSwarmManagerSnapshot {
  readonly schemaVersion: AiTradingSwarmSchemaVersion;
  readonly swarm: TradingSwarmIdentity;
  readonly lifecycleState: TradingSwarmLifecycleState;
  readonly authority: TradingSwarmAuthority;
  readonly topology: TradingSwarmTopologySnapshot;
  readonly activeMissions: readonly TradingSwarmMissionSummary[];
  readonly recentDecisions: readonly TradingSwarmCollectiveDecision[];
  readonly nodeTrustScores: readonly TradingSwarmNodeTrustScore[];
  readonly failures: readonly TradingSwarmFailure[];
  readonly migrations: readonly TradingSwarmWorkloadMigration[];
  readonly optimizationRecommendations:
    readonly TradingSwarmOptimizationRecommendation[];
  readonly telemetry: TradingSwarmTelemetry;
  readonly latestCheckpointId?: TradingSwarmCheckpointId;
  readonly capturedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Configuration and default policies
 * ========================================================================== */

export interface TradingSwarmFormationPolicy {
  readonly minimumNodes: number;
  readonly maximumNodes: number;
  readonly requiredNodeRoles: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities: readonly TradingSwarmCapability[];
  readonly minimumNodeReadiness: TradingSwarmScore;
  readonly minimumNodeReliability: TradingSwarmScore;
  readonly requireDeterministicNodes: boolean;
  readonly requireReplaySafeNodes: boolean;
  readonly allowDegradedNodes: boolean;
}

export interface TradingSwarmPartitionPolicy {
  readonly enabled: boolean;
  readonly strategy:
    | "STATIC"
    | "CONSISTENT_HASH"
    | "CAPABILITY_AWARE"
    | "LOAD_AWARE"
    | "RISK_AWARE"
    | "HYBRID";
  readonly replicationFactor: number;
  readonly maximumPartitionsPerNode: number;
  readonly rebalanceThreshold: TradingSwarmScore;
  readonly leaseDurationMs: number;
  readonly leaseRenewalWindowMs: number;
  readonly requireFencingTokens: boolean;
}

export interface TradingSwarmElectionPolicy {
  readonly enabled: boolean;
  readonly electionTimeoutMs: number;
  readonly leaderLeaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly maximumMissedHeartbeats: number;
  readonly minimumCandidateReadiness: TradingSwarmScore;
  readonly minimumCandidateReliability: TradingSwarmScore;
  readonly requireSynchronizedCandidate: boolean;
  readonly deterministicTieBreaking: boolean;
}

export interface TradingSwarmExecutionPolicy {
  readonly enabled: boolean;
  readonly mode: TradingSwarmExecutionMode;
  readonly maximumConcurrentExecutionSteps: number;
  readonly maximumActionsPerDecision: number;
  readonly maximumTotalNotional: number;
  readonly requireExecutionPlan: boolean;
  readonly requireRollbackActions: boolean;
  readonly requireGovernanceApproval: boolean;
  readonly prohibitExecutionOnWarnings: boolean;
  readonly prohibitExecutionWhenDegraded: boolean;
}

export interface TradingSwarmRecoveryPolicy {
  readonly enabled: boolean;
  readonly automaticRecovery: boolean;
  readonly maximumRecoveryAttempts: number;
  readonly taskRetryDelayMs: number;
  readonly nodeFailureTimeoutMs: number;
  readonly partitionRecoveryTimeoutMs: number;
  readonly checkpointIntervalMs: number;
  readonly maximumCheckpointAgeMs: number;
  readonly quarantineAfterConsecutiveFailures: number;
  readonly failClosedOnRecoveryFailure: boolean;
}

export interface TradingSwarmLearningPolicy {
  readonly enabled: boolean;
  readonly initialNodeTrust: TradingSwarmScore;
  readonly minimumVotingTrust: TradingSwarmScore;
  readonly reliabilityWeight: TradingSwarmWeight;
  readonly consensusIntegrityWeight: TradingSwarmWeight;
  readonly executionQualityWeight: TradingSwarmWeight;
  readonly recoveryQualityWeight: TradingSwarmWeight;
  readonly synchronizationWeight: TradingSwarmWeight;
  readonly collaborationWeight: TradingSwarmWeight;
  readonly governanceComplianceWeight: TradingSwarmWeight;
  readonly learningRate: number;
  readonly decayRate: number;
  readonly quarantineThreshold: TradingSwarmScore;
}

export interface AiTradingSwarmConfiguration {
  readonly schemaVersion: AiTradingSwarmSchemaVersion;
  readonly topology: TradingSwarmTopology;
  readonly coordinationMode: TradingSwarmCoordinationMode;
  readonly autonomy: TradingSwarmAutonomyLevel;
  readonly formation: TradingSwarmFormationPolicy;
  readonly partitioning: TradingSwarmPartitionPolicy;
  readonly election: TradingSwarmElectionPolicy;
  readonly consensus: TradingSwarmConsensusPolicy;
  readonly safety: TradingSwarmSafetyPolicy;
  readonly execution: TradingSwarmExecutionPolicy;
  readonly recovery: TradingSwarmRecoveryPolicy;
  readonly learning: TradingSwarmLearningPolicy;
  readonly governanceRules: readonly TradingSwarmGovernanceRule[];
  readonly maximumMissionDurationMs: number;
  readonly maximumTaskDurationMs: number;
  readonly maximumContextAgeMs: number;
  readonly maximumConcurrentMissions: number;
  readonly maximumRecentDecisions: number;
  readonly requireDeterministicFingerprint: boolean;
  readonly publishEvents: boolean;
}

/* ========================================================================== *
 * Orchestration request, outcome, and failure contracts
 * ========================================================================== */

export interface AiTradingSwarmRunRequest {
  readonly requestId: string;
  readonly requestedAtMs: TradingSwarmTimestamp;
  readonly swarmId: TradingSwarmId;
  readonly objective: TradingSwarmMissionObjective;
  readonly context: TradingSwarmContext;
  readonly configuration: AiTradingSwarmConfiguration;
  readonly portfolioId?: string;
  readonly marketIds?: readonly TradingSwarmMarketId[];
  readonly strategyIds?: readonly TradingSwarmStrategyId[];
  readonly preferredNodeIds?: readonly TradingSwarmNodeId[];
  readonly excludedNodeIds?: readonly TradingSwarmNodeId[];
  readonly requiredNodeRoles?: readonly TradingSwarmNodeRole[];
  readonly requiredCapabilities?: readonly TradingSwarmCapability[];
  readonly constraints?: TradingSwarmMissionConstraints;
  readonly metadata?: TradingSwarmMetadata;
}

export interface AiTradingSwarmRunFailure {
  readonly code: string;
  readonly message: string;
  readonly stage?: TradingSwarmPipelineStage;
  readonly nodeId?: TradingSwarmNodeId;
  readonly partitionId?: TradingSwarmPartitionId;
  readonly taskId?: TradingSwarmTaskId;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly cause?: string;
  readonly metadata?: TradingSwarmMetadata;
}

export interface AiTradingSwarmRunResult {
  readonly runId: TradingSwarmRunId;
  readonly requestId: string;
  readonly swarmId: TradingSwarmId;
  readonly mission: TradingSwarmMission;
  readonly status: Extract<
    TradingSwarmMissionStatus,
    "COMPLETED" | "COMPLETED_WITH_WARNINGS"
  >;
  readonly validation:
    MultiAgentValidationResult<AiTradingSwarmRunRequest>;
  readonly topology: TradingSwarmTopologySnapshot;
  readonly election?: TradingSwarmLeaderElection;
  readonly assignments: readonly TradingSwarmTaskAssignment[];
  readonly localRuns: readonly TradingSwarmLocalCollectiveRun[];
  readonly contributions: readonly TradingSwarmNodeContribution[];
  readonly candidates: readonly TradingSwarmDecisionCandidate[];
  readonly consensus: TradingSwarmConsensusResult;
  readonly riskAssessment: TradingSwarmRiskAssessment;
  readonly governance: TradingSwarmGovernanceAssessment;
  readonly decision: TradingSwarmCollectiveDecision;
  readonly executionState?: TradingSwarmExecutionState;
  readonly explanation: TradingSwarmDecisionExplanation;
  readonly trustUpdates: readonly TradingSwarmTrustUpdate[];
  readonly failures: readonly AiTradingSwarmRunFailure[];
  readonly checkpoint?: TradingSwarmCheckpoint;
  readonly trace: TradingSwarmAuditTrace;
  readonly startedAtMs: TradingSwarmTimestamp;
  readonly completedAtMs: TradingSwarmTimestamp;
  readonly deterministicFingerprint: string;
}

export type AiTradingSwarmExecutionOutcome =
  | AiTradingSwarmRunResult
  | {
      readonly runId: TradingSwarmRunId;
      readonly requestId: string;
      readonly swarmId: TradingSwarmId;
      readonly missionId?: TradingSwarmMissionId;
      readonly status: Extract<
        TradingSwarmMissionStatus,
        "DEFERRED" | "REJECTED" | "FAILED" | "CANCELLED" | "TIMED_OUT"
      >;
      readonly failure: AiTradingSwarmRunFailure;
      readonly validation:
        MultiAgentValidationResult<AiTradingSwarmRunRequest>;
      readonly trace: TradingSwarmAuditTrace;
      readonly deterministicFingerprint: string;
    };

/* ========================================================================== *
 * Dependency ports
 * ========================================================================== */

export interface TradingSwarmClock {
  now(): TradingSwarmTimestamp;
}

export interface TradingSwarmIdGenerator {
  generate(prefix: string, seed: string): string;
}

export interface TradingSwarmFingerprintGenerator {
  fingerprint(value: unknown): string;
}

export interface TradingSwarmLogger {
  debug(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
  info(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
  warn(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
  error(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
}

export interface TradingSwarmRegistryPort {
  registerNode(registration: TradingSwarmNodeRegistration): void;
  unregisterNode(nodeId: TradingSwarmNodeId): void;
  getNode(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeRegistration | undefined;
  listNodes(): readonly TradingSwarmNodeRegistration[];
  health(
    nodeId: TradingSwarmNodeId,
  ): TradingSwarmNodeHealth | undefined;
  topology(): TradingSwarmTopologySnapshot;
}

export interface TradingSwarmContextBuilderPort {
  build(request: AiTradingSwarmRunRequest): TradingSwarmContext;
}

export interface TradingSwarmLeaderElectionPort {
  elect(
    topology: TradingSwarmTopologySnapshot,
    reason: TradingSwarmElectionReason,
    policy: TradingSwarmElectionPolicy,
  ): TradingSwarmLeaderElection | Promise<TradingSwarmLeaderElection>;
}

export interface TradingSwarmPartitionManagerPort {
  plan(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
    nodes: readonly TradingSwarmNodeRegistration[],
    policy: TradingSwarmPartitionPolicy,
  ): readonly TradingSwarmPartition[];

  assign(
    partitions: readonly TradingSwarmPartition[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    trust: readonly TradingSwarmNodeTrustScore[],
    policy: TradingSwarmPartitionPolicy,
  ): readonly TradingSwarmPartitionLease[];
}

export interface TradingSwarmMissionPlannerPort {
  plan(
    request: AiTradingSwarmRunRequest,
    context: TradingSwarmContext,
    topology: TradingSwarmTopologySnapshot,
  ): TradingSwarmMission;
}

export interface TradingSwarmTaskPlannerPort {
  create(
    mission: TradingSwarmMission,
    topology: TradingSwarmTopologySnapshot,
    partitions: readonly TradingSwarmPartition[],
  ): readonly TradingSwarmTask[];
}

export interface TradingSwarmTaskAllocatorPort {
  assign(
    tasks: readonly TradingSwarmTask[],
    nodes: readonly TradingSwarmNodeRegistration[],
    health: readonly TradingSwarmNodeHealth[],
    leases: readonly TradingSwarmPartitionLease[],
    trust: readonly TradingSwarmNodeTrustScore[],
  ): readonly TradingSwarmTaskAssignment[];
}

export interface TradingSwarmLocalCollectiveExecutorPort {
  execute(
    assignment: TradingSwarmTaskAssignment,
    mission: TradingSwarmMission,
    context: TradingSwarmContext,
  ): Promise<TradingSwarmLocalCollectiveRun>;
}

export interface TradingSwarmContributionAggregatorPort {
  aggregate(
    mission: TradingSwarmMission,
    assignments: readonly TradingSwarmTaskAssignment[],
    runs: readonly TradingSwarmLocalCollectiveRun[],
  ): readonly TradingSwarmNodeContribution[];
}

export interface TradingSwarmCandidateAssemblerPort {
  assemble(
    mission: TradingSwarmMission,
    contributions: readonly TradingSwarmNodeContribution[],
  ): readonly TradingSwarmDecisionCandidate[];
}

export interface TradingSwarmConsensusEnginePort {
  form(
    mission: TradingSwarmMission,
    candidates: readonly TradingSwarmDecisionCandidate[],
    contributions: readonly TradingSwarmNodeContribution[],
    nodes: readonly TradingSwarmNodeRegistration[],
    trust: readonly TradingSwarmNodeTrustScore[],
    policy: TradingSwarmConsensusPolicy,
  ): Promise<TradingSwarmConsensusResult>;
}

export interface TradingSwarmRiskEnginePort {
  assess(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    candidates: readonly TradingSwarmDecisionCandidate[],
    topology: TradingSwarmTopologySnapshot,
    safety: TradingSwarmSafetyPolicy,
  ): TradingSwarmRiskAssessment;
}

export interface TradingSwarmGovernanceEnginePort {
  evaluate(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    risk: TradingSwarmRiskAssessment,
    rules: readonly TradingSwarmGovernanceRule[],
    safety: TradingSwarmSafetyPolicy,
  ): TradingSwarmGovernanceAssessment;
}

export interface TradingSwarmDecisionAssemblerPort {
  assemble(
    mission: TradingSwarmMission,
    candidates: readonly TradingSwarmDecisionCandidate[],
    consensus: TradingSwarmConsensusResult,
    governance: TradingSwarmGovernanceAssessment,
  ): TradingSwarmCollectiveDecision;
}

export interface TradingSwarmExecutionPlannerPort {
  plan(
    mission: TradingSwarmMission,
    decision: TradingSwarmCollectiveDecision,
    topology: TradingSwarmTopologySnapshot,
    policy: TradingSwarmExecutionPolicy,
  ): Promise<TradingSwarmExecutionPlan>;
}

export interface TradingSwarmExecutionCoordinatorPort {
  execute(
    plan: TradingSwarmExecutionPlan,
    topology: TradingSwarmTopologySnapshot,
  ): Promise<TradingSwarmExecutionState>;
}

export interface TradingSwarmRecoveryManagerPort {
  plan(
    failure: TradingSwarmFailure,
    topology: TradingSwarmTopologySnapshot,
    policy: TradingSwarmRecoveryPolicy,
  ): TradingSwarmRecoveryPlan;

  recover(
    plan: TradingSwarmRecoveryPlan,
  ): Promise<TradingSwarmTopologySnapshot>;
}

export interface TradingSwarmCheckpointStorePort {
  save(checkpoint: TradingSwarmCheckpoint): void | Promise<void>;
  load(
    checkpointId: TradingSwarmCheckpointId,
  ): TradingSwarmCheckpoint | undefined | Promise<
    TradingSwarmCheckpoint | undefined
  >;
  latest(
    swarmId: TradingSwarmId,
  ): TradingSwarmCheckpoint | undefined | Promise<
    TradingSwarmCheckpoint | undefined
  >;
}

export interface TradingSwarmTrustEnginePort {
  assess(
    nodes: readonly TradingSwarmNodeRegistration[],
    history: readonly TradingSwarmLearningObservation[],
    policy: TradingSwarmLearningPolicy,
  ): readonly TradingSwarmNodeTrustScore[];

  update(
    previous: readonly TradingSwarmNodeTrustScore[],
    observations: readonly TradingSwarmLearningObservation[],
    policy: TradingSwarmLearningPolicy,
  ): readonly TradingSwarmTrustUpdate[];
}

export interface TradingSwarmExplainabilityEnginePort {
  explain(
    mission: TradingSwarmMission,
    result: {
      readonly topology: TradingSwarmTopologySnapshot;
      readonly contributions: readonly TradingSwarmNodeContribution[];
      readonly candidates: readonly TradingSwarmDecisionCandidate[];
      readonly consensus: TradingSwarmConsensusResult;
      readonly governance: TradingSwarmGovernanceAssessment;
      readonly decision: TradingSwarmCollectiveDecision;
      readonly executionState?: TradingSwarmExecutionState;
    },
  ): TradingSwarmDecisionExplanation;
}

export interface TradingSwarmValidatorPort {
  validateRequest(
    request: AiTradingSwarmRunRequest,
  ): MultiAgentValidationResult<AiTradingSwarmRunRequest>;

  validateConfiguration(
    configuration: AiTradingSwarmConfiguration,
  ): MultiAgentValidationResult<AiTradingSwarmConfiguration>;

  validateNode(
    node: TradingSwarmNodeRegistration,
  ): MultiAgentValidationResult<TradingSwarmNodeRegistration>;

  validateMission(
    mission: TradingSwarmMission,
  ): MultiAgentValidationResult<TradingSwarmMission>;

  validateDecision(
    decision: TradingSwarmCollectiveDecision,
  ): MultiAgentValidationResult<TradingSwarmCollectiveDecision>;
}

export interface TradingSwarmEventPublisherPort {
  publish(event: TradingSwarmEvent): void | Promise<void>;
}

export interface TradingSwarmPersistencePort {
  saveRun(result: AiTradingSwarmRunResult): void | Promise<void>;
  saveSnapshot(
    snapshot: TradingSwarmManagerSnapshot,
  ): void | Promise<void>;
  loadSnapshot(
    swarmId: TradingSwarmId,
  ): TradingSwarmManagerSnapshot | undefined | Promise<
    TradingSwarmManagerSnapshot | undefined
  >;
}

export interface AiTradingSwarmOrchestratorPort {
  run(
    request: AiTradingSwarmRunRequest,
  ): Promise<AiTradingSwarmExecutionOutcome>;

  snapshot(): TradingSwarmManagerSnapshot;
}

export interface AiTradingSwarmDependencies {
  readonly registry: TradingSwarmRegistryPort;
  readonly contextBuilder: TradingSwarmContextBuilderPort;
  readonly leaderElection: TradingSwarmLeaderElectionPort;
  readonly partitionManager: TradingSwarmPartitionManagerPort;
  readonly missionPlanner: TradingSwarmMissionPlannerPort;
  readonly taskPlanner: TradingSwarmTaskPlannerPort;
  readonly taskAllocator: TradingSwarmTaskAllocatorPort;
  readonly localCollectiveExecutor:
    TradingSwarmLocalCollectiveExecutorPort;
  readonly contributionAggregator:
    TradingSwarmContributionAggregatorPort;
  readonly candidateAssembler: TradingSwarmCandidateAssemblerPort;
  readonly consensusEngine: TradingSwarmConsensusEnginePort;
  readonly riskEngine: TradingSwarmRiskEnginePort;
  readonly governanceEngine: TradingSwarmGovernanceEnginePort;
  readonly decisionAssembler: TradingSwarmDecisionAssemblerPort;
  readonly executionPlanner: TradingSwarmExecutionPlannerPort;
  readonly executionCoordinator?: TradingSwarmExecutionCoordinatorPort;
  readonly recoveryManager: TradingSwarmRecoveryManagerPort;
  readonly checkpointStore: TradingSwarmCheckpointStorePort;
  readonly trustEngine: TradingSwarmTrustEnginePort;
  readonly explainabilityEngine: TradingSwarmExplainabilityEnginePort;
  readonly validator: TradingSwarmValidatorPort;
  readonly publisher?: TradingSwarmEventPublisherPort;
  readonly persistence?: TradingSwarmPersistencePort;
  readonly clock: TradingSwarmClock;
  readonly idGenerator: TradingSwarmIdGenerator;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly logger?: TradingSwarmLogger;
}

/* ========================================================================== *
 * Immutable canonical policies and constants
 * ========================================================================== */

export const TRADING_SWARM_NODE_ROLES:
  readonly TradingSwarmNodeRole[] = Object.freeze([
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

export const TRADING_SWARM_PIPELINE_ORDER:
  readonly TradingSwarmPipelineStage[] = Object.freeze([
    "VALIDATION",
    "CONTEXT_BUILDING",
    "TOPOLOGY_ASSESSMENT",
    "LEADER_ELECTION",
    "PARTITION_PLANNING",
    "MISSION_PLANNING",
    "TASK_ASSIGNMENT",
    "LOCAL_MULTI_AGENT_EXECUTION",
    "CONTRIBUTION_COLLECTION",
    "CANDIDATE_ASSEMBLY",
    "DISTRIBUTED_CONSENSUS",
    "RISK_ASSESSMENT",
    "GOVERNANCE",
    "DECISION_ASSEMBLY",
    "EXECUTION_PLANNING",
    "EXECUTION",
    "LEARNING",
    "CHECKPOINTING",
    "EXPLAINABILITY",
    "PUBLICATION",
  ]);

export const DEFAULT_TRADING_SWARM_FORMATION_POLICY:
  TradingSwarmFormationPolicy = Object.freeze({
    minimumNodes: 3,
    maximumNodes: 32,
    requiredNodeRoles: Object.freeze<TradingSwarmNodeRole[]>([
      "COORDINATOR",
      "WORKER",
      "GOVERNOR",
    ]),
    requiredCapabilities: Object.freeze<TradingSwarmCapability[]>([
      "COORDINATE_MULTI_AGENT_RUNS",
      "FORM_DISTRIBUTED_CONSENSUS",
      "ENFORCE_GOVERNANCE",
    ]),
    minimumNodeReadiness: 0.7,
    minimumNodeReliability: 0.7,
    requireDeterministicNodes: true,
    requireReplaySafeNodes: true,
    allowDegradedNodes: false,
  });

export const DEFAULT_TRADING_SWARM_PARTITION_POLICY:
  TradingSwarmPartitionPolicy = Object.freeze({
    enabled: true,
    strategy: "CAPABILITY_AWARE",
    replicationFactor: 2,
    maximumPartitionsPerNode: 16,
    rebalanceThreshold: 0.2,
    leaseDurationMs: 30_000,
    leaseRenewalWindowMs: 10_000,
    requireFencingTokens: true,
  });

export const DEFAULT_TRADING_SWARM_ELECTION_POLICY:
  TradingSwarmElectionPolicy = Object.freeze({
    enabled: true,
    electionTimeoutMs: 5_000,
    leaderLeaseDurationMs: 15_000,
    heartbeatIntervalMs: 2_000,
    maximumMissedHeartbeats: 3,
    minimumCandidateReadiness: 0.8,
    minimumCandidateReliability: 0.8,
    requireSynchronizedCandidate: true,
    deterministicTieBreaking: true,
  });

export const DEFAULT_TRADING_SWARM_QUORUM_POLICY:
  TradingSwarmQuorumPolicy = Object.freeze({
    minimumEligibleNodes: 3,
    minimumParticipatingNodes: 3,
    minimumParticipationRatio: 0.67,
    requiredNodeRoles: Object.freeze<TradingSwarmNodeRole[]>([
      "COORDINATOR",
      "WORKER",
      "GOVERNOR",
    ]),
    requiredCapabilities: Object.freeze<TradingSwarmCapability[]>([
      "FORM_DISTRIBUTED_CONSENSUS",
      "ENFORCE_GOVERNANCE",
    ]),
    requireLeader: true,
    requireRiskSwarm: true,
    requireGovernanceSwarm: true,
    allowDegradedNodes: false,
  });

export const DEFAULT_TRADING_SWARM_CONSENSUS_POLICY:
  TradingSwarmConsensusPolicy = Object.freeze({
    method: "RISK_ADJUSTED",
    approvalThreshold: 0.67,
    rejectionThreshold: 0.5,
    vetoEnabled: true,
    maximumAbstentionRatio: 0.34,
    quorum: DEFAULT_TRADING_SWARM_QUORUM_POLICY,
    maximumConsensusRounds: 3,
    deadlockResolution: "ARBITER",
  });

export const DEFAULT_TRADING_SWARM_SAFETY_POLICY:
  TradingSwarmSafetyPolicy = Object.freeze({
    failClosed: true,
    minimumCollectiveConfidence: 0.7,
    minimumNodeReliability: 0.7,
    minimumPartitionCoverage: 0.8,
    maximumSystemicRisk: 0.7,
    maximumExecutionRisk: 0.7,
    maximumCapitalAtRisk: 0,
    maximumLeverage: 1,
    maximumDrawdown: 0.2,
    maximumFailedNodeRatio: 0.25,
    maximumUnsynchronizedNodeRatio: 0.25,
    requireHealthyLeader: true,
    requireRiskSwarmParticipation: true,
    requireGovernanceSwarmParticipation: true,
    rejectOnStaleContext: true,
    rejectOnPartitionConflict: true,
    rejectOnUnresolvedMaterialDissent: true,
    rejectOnCriticalAnomaly: true,
    allowOperatorOverride: false,
  });

export const DEFAULT_TRADING_SWARM_EXECUTION_POLICY:
  TradingSwarmExecutionPolicy = Object.freeze({
    enabled: true,
    mode: "PAPER",
    maximumConcurrentExecutionSteps: 8,
    maximumActionsPerDecision: 20,
    maximumTotalNotional: 0,
    requireExecutionPlan: true,
    requireRollbackActions: true,
    requireGovernanceApproval: true,
    prohibitExecutionOnWarnings: false,
    prohibitExecutionWhenDegraded: true,
  });

export const DEFAULT_TRADING_SWARM_RECOVERY_POLICY:
  TradingSwarmRecoveryPolicy = Object.freeze({
    enabled: true,
    automaticRecovery: true,
    maximumRecoveryAttempts: 3,
    taskRetryDelayMs: 1_000,
    nodeFailureTimeoutMs: 10_000,
    partitionRecoveryTimeoutMs: 30_000,
    checkpointIntervalMs: 60_000,
    maximumCheckpointAgeMs: 300_000,
    quarantineAfterConsecutiveFailures: 3,
    failClosedOnRecoveryFailure: true,
  });

export const DEFAULT_TRADING_SWARM_LEARNING_POLICY:
  TradingSwarmLearningPolicy = Object.freeze({
    enabled: true,
    initialNodeTrust: 0.7,
    minimumVotingTrust: 0.5,
    reliabilityWeight: 0.2,
    consensusIntegrityWeight: 0.15,
    executionQualityWeight: 0.2,
    recoveryQualityWeight: 0.1,
    synchronizationWeight: 0.1,
    collaborationWeight: 0.1,
    governanceComplianceWeight: 0.15,
    learningRate: 0.1,
    decayRate: 0.01,
    quarantineThreshold: 0.25,
  });

export const DEFAULT_AI_TRADING_SWARM_CONFIGURATION:
  AiTradingSwarmConfiguration = Object.freeze({
    schemaVersion: AI_TRADING_SWARM_SCHEMA_VERSION,
    topology: "LEADER_FOLLOWER",
    coordinationMode: "EVENT_DRIVEN",
    autonomy: "SEMI_AUTONOMOUS",
    formation: DEFAULT_TRADING_SWARM_FORMATION_POLICY,
    partitioning: DEFAULT_TRADING_SWARM_PARTITION_POLICY,
    election: DEFAULT_TRADING_SWARM_ELECTION_POLICY,
    consensus: DEFAULT_TRADING_SWARM_CONSENSUS_POLICY,
    safety: DEFAULT_TRADING_SWARM_SAFETY_POLICY,
    execution: DEFAULT_TRADING_SWARM_EXECUTION_POLICY,
    recovery: DEFAULT_TRADING_SWARM_RECOVERY_POLICY,
    learning: DEFAULT_TRADING_SWARM_LEARNING_POLICY,
    governanceRules: Object.freeze([]),
    maximumMissionDurationMs: 180_000,
    maximumTaskDurationMs: 60_000,
    maximumContextAgeMs: 60_000,
    maximumConcurrentMissions: 16,
    maximumRecentDecisions: 100,
    requireDeterministicFingerprint: true,
    publishEvents: true,
  });

/* ========================================================================== *
 * Pure helpers and type guards
 * ========================================================================== */

export function isTradingSwarmNormalizedNumber(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= TRADING_SWARM_NORMALIZED_MINIMUM &&
    value <= TRADING_SWARM_NORMALIZED_MAXIMUM
  );
}

export function isTradingSwarmCorrelation(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= TRADING_SWARM_CORRELATION_MINIMUM &&
    value <= TRADING_SWARM_CORRELATION_MAXIMUM
  );
}

export function isTerminalTradingSwarmMissionStatus(
  status: TradingSwarmMissionStatus,
): boolean {
  return (
    status === "COMPLETED" ||
    status === "COMPLETED_WITH_WARNINGS" ||
    status === "DEFERRED" ||
    status === "REJECTED" ||
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "TIMED_OUT"
  );
}

export function isExecutableTradingSwarmDecision(
  decision: TradingSwarmDecision,
): boolean {
  return (
    decision === "EXECUTE" ||
    decision === "EXECUTE_WITH_RESTRICTIONS"
  );
}

export function isActiveTradingSwarmNodeState(
  state: TradingSwarmNodeLifecycleState,
): boolean {
  return state === "READY" || state === "ACTIVE";
}

export function isHealthyTradingSwarmNode(
  health: TradingSwarmNodeHealth,
): boolean {
  return (
    health.healthy &&
    isActiveTradingSwarmNodeState(health.lifecycleState) &&
    health.availability === "AVAILABLE"
  );
}

export function hasTradingSwarmCapability(
  registration: TradingSwarmNodeRegistration,
  capability: TradingSwarmCapability,
): boolean {
  return registration.capabilities.some(
    (declaration) =>
      declaration.enabled &&
      declaration.capability === capability,
  );
}

export function tradingSwarmMissionRequiresExecution(
  objective: TradingSwarmMissionObjective,
): boolean {
  return (
    objective === "CROSS_EXCHANGE_EXECUTION" ||
    objective === "DISTRIBUTED_PORTFOLIO_REBALANCE" ||
    objective === "SYSTEMIC_RISK_RESPONSE" ||
    objective === "FULL_SWARM_DECISION"
  );
}

/**
 * Compatibility bridge used by Milestone 39 adapters that need to retain
 * Milestone 38 metadata without widening either subsystem's JSON contract.
 */
export function fromMultiAgentMetadata(
  metadata: MultiAgentMetadata | undefined,
): TradingSwarmMetadata | undefined {
  return metadata as TradingSwarmMetadata | undefined;
}

/**
 * Compatibility aliases retained for explicit integration boundaries.
 */
export type TradingSwarmEmbeddedAgentRegistration =
  MultiAgentRegistration;
export type TradingSwarmEmbeddedAgentHealth =
  MultiAgentHealthSnapshot;
export type TradingSwarmEmbeddedAgentManagerSnapshot =
  MultiAgentManagerSnapshot;