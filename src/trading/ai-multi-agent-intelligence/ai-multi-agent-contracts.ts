/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/ai-multi-agent-contracts.ts
 *
 * Foundational deterministic and immutable contracts for a governed multi-agent
 * trading-intelligence system. The subsystem coordinates specialized agents that
 * consume market intelligence, decision intelligence, meta-learning evidence,
 * strategy-portfolio state, and institutional-arbitrage opportunities.
 *
 * Design objectives:
 * - deterministic and replay-safe collaboration
 * - immutable messages, evidence, proposals, votes, and outcomes
 * - explicit agent authority, capability, trust, and lifecycle semantics
 * - auditable debate, consensus, dissent, governance, and execution handoff
 * - safe integration with existing QuantumTradeAI intelligence subsystems
 * - no runtime-specific implementation dependencies
 */

import type {
  MarketIdentity,
  MarketIntelligenceReport,
  MarketRiskSignal,
  TimestampMs,
  UnifiedPredictionConfidence,
} from "../ai-market-intelligence/ai-market-intelligence-contracts";

import type {
  DecisionCandidate,
  DecisionExecutionPlan,
  DecisionGovernanceAssessment,
  DecisionIntelligenceExecutionOutcome,
  DecisionIntelligenceManagerSnapshot,
  DecisionIntelligenceRunRequest,
  DecisionIntelligenceRunResult,
} from "../ai-decision-intelligence/ai-decision-intelligence-contracts";

import type {
  AdaptiveStrategyWeight,
  MetaLearningManagerSnapshot,
  MetaLearningRunResult,
  StrategyDescriptor,
  StrategyReinforcementState,
} from "../ai-meta-learning/ai-meta-learning-contracts";

import type {
  AiStrategyAutonomousManagerSnapshot,
  AiStrategyCandidate,
  AiStrategyPortfolioDecision,
  AiStrategyPortfolioRunRequest,
} from "../ai-strategy-portfolio/ai-strategy-portfolio-contracts";

import type {
  ArbitrageDecision,
  ArbitrageSignal,
  InstitutionalArbitrageOrchestratorRequest,
  InstitutionalArbitrageOrchestratorResult,
} from "../institutional-arbitrage/institutional-arbitrage-contracts";

/* ========================================================================== *
 * Primitive aliases and shared utility types
 * ========================================================================== */

export type MultiAgentId = string;
export type MultiAgentRunId = string;
export type MultiAgentSessionId = string;
export type MultiAgentMessageId = string;
export type MultiAgentProposalId = string;
export type MultiAgentReviewId = string;
export type MultiAgentVoteId = string;
export type MultiAgentConsensusId = string;
export type MultiAgentConflictId = string;
export type MultiAgentDecisionId = string;
export type MultiAgentPlanId = string;
export type MultiAgentTraceId = string;
export type MultiAgentCorrelationId = string;
export type MultiAgentCausationId = string;
export type MultiAgentPolicyId = string;
export type MultiAgentModelId = string;
export type MultiAgentKnowledgeId = string;
export type MultiAgentMemoryId = string;
export type MultiAgentTaskId = string;
export type MultiAgentTimestamp = TimestampMs;
export type MultiAgentSequence = number;
export type MultiAgentVersion = string;
export type MultiAgentScore = number;
export type MultiAgentConfidence = number;
export type MultiAgentProbability = number;
export type MultiAgentWeight = number;
export type MultiAgentUtility = number;
export type MultiAgentRisk = number;

export type MultiAgentJsonPrimitive = string | number | boolean | null;

export type MultiAgentJsonValue =
  | MultiAgentJsonPrimitive
  | readonly MultiAgentJsonValue[]
  | Readonly<{ readonly [key: string]: MultiAgentJsonValue }>;

export type MultiAgentMetadata = Readonly<
  Record<string, MultiAgentJsonValue>
>;

export type MultiAgentReadonlyRecord<
  TKey extends PropertyKey,
  TValue,
> = Readonly<Record<TKey, TValue>>;

export type MultiAgentDeepReadonly<TValue> =
  TValue extends (...args: never[]) => unknown
    ? TValue
    : TValue extends readonly (infer TItem)[]
      ? readonly MultiAgentDeepReadonly<TItem>[]
      : TValue extends object
        ? {
            readonly [TKey in keyof TValue]:
              MultiAgentDeepReadonly<TValue[TKey]>;
          }
        : TValue;

export type MultiAgentNonEmptyReadonlyArray<TValue> = readonly [
  TValue,
  ...TValue[],
];

export const AI_MULTI_AGENT_SCHEMA_VERSION = "1.0.0" as const;

export type AiMultiAgentSchemaVersion =
  typeof AI_MULTI_AGENT_SCHEMA_VERSION;

export const MULTI_AGENT_NORMALIZED_MINIMUM = 0;
export const MULTI_AGENT_NORMALIZED_MAXIMUM = 1;
export const MULTI_AGENT_CORRELATION_MINIMUM = -1;
export const MULTI_AGENT_CORRELATION_MAXIMUM = 1;
export const MULTI_AGENT_BASIS_POINTS_PER_UNIT = 10_000;

/* ========================================================================== *
 * Agent taxonomy, lifecycle, authority, and operating semantics
 * ========================================================================== */

export type MultiAgentRole =
  | "MARKET_INTELLIGENCE_AGENT"
  | "REGIME_ANALYSIS_AGENT"
  | "VOLATILITY_AGENT"
  | "LIQUIDITY_AGENT"
  | "ORDER_FLOW_AGENT"
  | "CORRELATION_AGENT"
  | "ANOMALY_AGENT"
  | "PRICE_PREDICTION_AGENT"
  | "STRATEGY_SELECTION_AGENT"
  | "STRATEGY_PORTFOLIO_AGENT"
  | "PORTFOLIO_CONSTRUCTION_AGENT"
  | "RISK_AGENT"
  | "EXECUTION_AGENT"
  | "ARBITRAGE_AGENT"
  | "META_LEARNING_AGENT"
  | "REINFORCEMENT_AGENT"
  | "GOVERNANCE_AGENT"
  | "EXPLAINABILITY_AGENT"
  | "CONFLICT_ARBITER_AGENT"
  | "CONSENSUS_COORDINATOR_AGENT"
  | "SUPERVISOR_AGENT"
  | "OPERATOR_PROXY_AGENT"
  | "CUSTOM";

export type MultiAgentCapability =
  | "OBSERVE_MARKET_INTELLIGENCE"
  | "ASSESS_MARKET_REGIME"
  | "ASSESS_VOLATILITY"
  | "ASSESS_LIQUIDITY"
  | "ASSESS_ORDER_FLOW"
  | "ASSESS_CORRELATION"
  | "DETECT_ANOMALIES"
  | "PREDICT_PRICE_MOVEMENT"
  | "ASSESS_PORTFOLIO"
  | "ASSESS_RISK"
  | "ASSESS_STRATEGY"
  | "SELECT_STRATEGIES"
  | "ALLOCATE_STRATEGY_CAPITAL"
  | "ASSESS_ARBITRAGE"
  | "PROPOSE_DECISION"
  | "REVIEW_PROPOSAL"
  | "CHALLENGE_PROPOSAL"
  | "VOTE"
  | "NEGOTIATE"
  | "ARBITRATE_CONFLICT"
  | "FORM_CONSENSUS"
  | "EVALUATE_GOVERNANCE"
  | "APPROVE_EXECUTION"
  | "PLAN_EXECUTION"
  | "EXPLAIN_DECISION"
  | "LEARN_FROM_OUTCOME"
  | "UPDATE_TRUST"
  | "ESCALATE_TO_OPERATOR"
  | "PUBLISH_EVENTS";

export type MultiAgentLifecycleState =
  | "REGISTERED"
  | "INITIALIZING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "QUARANTINED"
  | "SUSPENDED"
  | "FAILED"
  | "RETIRED";

export type MultiAgentAvailability =
  | "AVAILABLE"
  | "BUSY"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type MultiAgentAuthorityLevel =
  | "ADVISORY"
  | "CONTRIBUTOR"
  | "REVIEWER"
  | "ARBITER"
  | "APPROVER"
  | "SUPERVISOR";

export type MultiAgentAutonomyLevel =
  | "OBSERVE_ONLY"
  | "RECOMMEND_ONLY"
  | "PROPOSE_AND_REVIEW"
  | "SEMI_AUTONOMOUS"
  | "FULLY_AUTONOMOUS";

export type MultiAgentCriticality =
  | "OPTIONAL"
  | "STANDARD"
  | "IMPORTANT"
  | "CRITICAL"
  | "MANDATORY";

export type MultiAgentModelType =
  | "DETERMINISTIC_RULES"
  | "STATISTICAL"
  | "MACHINE_LEARNING"
  | "LARGE_LANGUAGE_MODEL"
  | "ENSEMBLE"
  | "HYBRID"
  | "EXTERNAL_SERVICE"
  | "HUMAN_PROXY";

export type MultiAgentReasoningMode =
  | "DETERMINISTIC"
  | "EVIDENCE_WEIGHTED"
  | "PROBABILISTIC"
  | "ENSEMBLE"
  | "DEBATE"
  | "CONSTRAINT_SOLVING"
  | "HYBRID";

export interface MultiAgentIdentity {
  readonly agentId: MultiAgentId;
  readonly name: string;
  readonly role: MultiAgentRole;
  readonly version: MultiAgentVersion;
  readonly modelId?: MultiAgentModelId;
  readonly modelType: MultiAgentModelType;
  readonly description: string;
}

export interface MultiAgentAuthority {
  readonly level: MultiAgentAuthorityLevel;
  readonly autonomy: MultiAgentAutonomyLevel;
  readonly mayPropose: boolean;
  readonly mayReview: boolean;
  readonly mayVote: boolean;
  readonly mayVeto: boolean;
  readonly mayArbitrate: boolean;
  readonly mayApproveExecution: boolean;
  readonly maximumCapitalAuthority?: number;
  readonly maximumRiskAuthority?: MultiAgentRisk;
  readonly restrictedActions: readonly MultiAgentActionType[];
}

export interface MultiAgentCapabilityDeclaration {
  readonly capability: MultiAgentCapability;
  readonly enabled: boolean;
  readonly proficiency: MultiAgentScore;
  readonly confidenceFloor: MultiAgentConfidence;
  readonly criticality: MultiAgentCriticality;
  readonly supportedMarkets?: readonly string[];
  readonly supportedTimeframes?: readonly string[];
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentRegistration {
  readonly identity: MultiAgentIdentity;
  readonly authority: MultiAgentAuthority;
  readonly capabilities: readonly MultiAgentCapabilityDeclaration[];
  readonly reasoningMode: MultiAgentReasoningMode;
  readonly deterministic: boolean;
  readonly replaySafe: boolean;
  readonly registeredAtMs: MultiAgentTimestamp;
  readonly configurationVersion: MultiAgentVersion;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentHealthSnapshot {
  readonly agentId: MultiAgentId;
  readonly lifecycleState: MultiAgentLifecycleState;
  readonly availability: MultiAgentAvailability;
  readonly healthy: boolean;
  readonly readinessScore: MultiAgentScore;
  readonly reliabilityScore: MultiAgentScore;
  readonly latencyScore: MultiAgentScore;
  readonly dataFreshnessScore: MultiAgentScore;
  readonly lastHeartbeatAtMs?: MultiAgentTimestamp;
  readonly lastSuccessfulTaskAtMs?: MultiAgentTimestamp;
  readonly consecutiveFailures: number;
  readonly activeTaskCount: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly assessedAtMs: MultiAgentTimestamp;
}

/* ========================================================================== *
 * Run lifecycle and pipeline stages
 * ========================================================================== */

export type MultiAgentRunStatus =
  | "CREATED"
  | "VALIDATING"
  | "BUILDING_CONTEXT"
  | "SELECTING_AGENTS"
  | "DISPATCHING_TASKS"
  | "COLLECTING_OBSERVATIONS"
  | "GENERATING_PROPOSALS"
  | "PEER_REVIEW"
  | "DEBATING"
  | "RESOLVING_CONFLICTS"
  | "FORMING_CONSENSUS"
  | "EVALUATING_GOVERNANCE"
  | "ASSEMBLING_DECISION"
  | "PLANNING_EXECUTION"
  | "EXPLAINING"
  | "PUBLISHING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "DEFERRED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type MultiAgentPipelineStage =
  | "VALIDATION"
  | "CONTEXT_BUILDING"
  | "AGENT_SELECTION"
  | "TASK_DISPATCH"
  | "OBSERVATION"
  | "PROPOSAL_GENERATION"
  | "PEER_REVIEW"
  | "DEBATE"
  | "CONFLICT_RESOLUTION"
  | "CONSENSUS_FORMATION"
  | "GOVERNANCE"
  | "DECISION_ASSEMBLY"
  | "EXECUTION_PLANNING"
  | "EXPLAINABILITY"
  | "PUBLICATION";

export type MultiAgentTerminalReason =
  | "SUCCESS"
  | "SUCCESS_WITH_WARNINGS"
  | "INSUFFICIENT_AGENT_QUORUM"
  | "INSUFFICIENT_CONFIDENCE"
  | "UNRESOLVED_CONFLICT"
  | "GOVERNANCE_REJECTION"
  | "SAFETY_REJECTION"
  | "STALE_CONTEXT"
  | "INVALID_REQUEST"
  | "AGENT_FAILURE"
  | "TIMEOUT"
  | "OPERATOR_DEFERRAL"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export interface MultiAgentStageTiming {
  readonly stage: MultiAgentPipelineStage;
  readonly startedAtMs: MultiAgentTimestamp;
  readonly completedAtMs: MultiAgentTimestamp;
  readonly durationMs: number;
}

export interface MultiAgentStageResult<TOutput> {
  readonly stage: MultiAgentPipelineStage;
  readonly success: boolean;
  readonly output?: TOutput;
  readonly participatingAgentIds: readonly MultiAgentId[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly timing: MultiAgentStageTiming;
  readonly deterministicFingerprint?: string;
}

/* ========================================================================== *
 * Input context and integrations
 * ========================================================================== */

export interface MultiAgentMarketContext {
  readonly reports: readonly MarketIntelligenceReport[];
  readonly primaryReport?: MarketIntelligenceReport;
  readonly markets: readonly MarketIdentity[];
  readonly riskSignals: readonly MarketRiskSignal[];
  readonly unifiedConfidence?: UnifiedPredictionConfidence;
  readonly generatedAtMs: MultiAgentTimestamp;
}

export interface MultiAgentDecisionContext {
  readonly request?: DecisionIntelligenceRunRequest;
  readonly latestResult?: DecisionIntelligenceRunResult;
  readonly latestOutcome?: DecisionIntelligenceExecutionOutcome;
  readonly managerSnapshot?: DecisionIntelligenceManagerSnapshot;
  readonly candidatePool: readonly DecisionCandidate[];
  readonly existingExecutionPlan?: DecisionExecutionPlan;
  readonly existingGovernanceAssessment?: DecisionGovernanceAssessment;
}

export interface MultiAgentMetaLearningContext {
  readonly latestRun?: MetaLearningRunResult;
  readonly managerSnapshot?: MetaLearningManagerSnapshot;
  readonly strategyDescriptors: readonly StrategyDescriptor[];
  readonly adaptiveWeights: readonly AdaptiveStrategyWeight[];
  readonly reinforcementStates: readonly StrategyReinforcementState[];
}

export interface MultiAgentStrategyPortfolioContext {
  readonly request?: AiStrategyPortfolioRunRequest;
  readonly latestDecision?: AiStrategyPortfolioDecision;
  readonly managerSnapshot?: AiStrategyAutonomousManagerSnapshot;
  readonly candidates: readonly AiStrategyCandidate[];
}

export interface MultiAgentArbitrageContext {
  readonly request?: InstitutionalArbitrageOrchestratorRequest;
  readonly latestResult?: InstitutionalArbitrageOrchestratorResult;
  readonly decisions: readonly ArbitrageDecision[];
  readonly signals: readonly ArbitrageSignal[];
}

export interface MultiAgentPortfolioState {
  readonly portfolioId: string;
  readonly asOfMs: MultiAgentTimestamp;
  readonly netAssetValue: number;
  readonly availableCapital: number;
  readonly committedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly leverage: number;
  readonly drawdown: number;
  readonly riskUtilization: MultiAgentScore;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentSystemContext {
  readonly market: MultiAgentMarketContext;
  readonly decisionIntelligence: MultiAgentDecisionContext;
  readonly metaLearning: MultiAgentMetaLearningContext;
  readonly strategyPortfolio: MultiAgentStrategyPortfolioContext;
  readonly arbitrage: MultiAgentArbitrageContext;
  readonly portfolio?: MultiAgentPortfolioState;
  readonly systemHealth: readonly MultiAgentHealthSnapshot[];
  readonly builtAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

/* ========================================================================== *
 * Tasks, messages, evidence, observations, and knowledge
 * ========================================================================== */

export type MultiAgentTaskType =
  | "ANALYZE_CONTEXT"
  | "ASSESS_MARKET"
  | "ASSESS_RISK"
  | "ASSESS_PORTFOLIO"
  | "ASSESS_STRATEGY"
  | "ASSESS_ARBITRAGE"
  | "GENERATE_PROPOSAL"
  | "REVIEW_PROPOSAL"
  | "CHALLENGE_PROPOSAL"
  | "RESOLVE_CONFLICT"
  | "VOTE_ON_PROPOSAL"
  | "FORM_CONSENSUS"
  | "EVALUATE_GOVERNANCE"
  | "BUILD_EXECUTION_PLAN"
  | "GENERATE_EXPLANATION"
  | "LEARN_FROM_OUTCOME";

export type MultiAgentTaskStatus =
  | "CREATED"
  | "ASSIGNED"
  | "RUNNING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export type MultiAgentMessageType =
  | "SYSTEM_DIRECTIVE"
  | "TASK_ASSIGNMENT"
  | "OBSERVATION"
  | "EVIDENCE"
  | "PROPOSAL"
  | "REVIEW"
  | "CHALLENGE"
  | "REBUTTAL"
  | "QUESTION"
  | "ANSWER"
  | "VOTE"
  | "VETO"
  | "CONFLICT"
  | "ARBITRATION"
  | "CONSENSUS"
  | "GOVERNANCE"
  | "EXECUTION_HANDOFF"
  | "FEEDBACK"
  | "HEARTBEAT"
  | "ERROR";

export type MultiAgentEvidenceSource =
  | "MARKET_INTELLIGENCE"
  | "DECISION_INTELLIGENCE"
  | "META_LEARNING"
  | "STRATEGY_PORTFOLIO"
  | "INSTITUTIONAL_ARBITRAGE"
  | "PORTFOLIO_STATE"
  | "RISK_ENGINE"
  | "EXECUTION_ENGINE"
  | "SYSTEM_HEALTH"
  | "GOVERNANCE_POLICY"
  | "AGENT_INFERENCE"
  | "PEER_AGENT"
  | "OPERATOR"
  | "EXTERNAL";

export type MultiAgentEvidenceDirection =
  | "SUPPORTING"
  | "OPPOSING"
  | "NEUTRAL"
  | "CONTEXTUAL"
  | "INVALIDATING";

export interface MultiAgentTask {
  readonly taskId: MultiAgentTaskId;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly type: MultiAgentTaskType;
  readonly status: MultiAgentTaskStatus;
  readonly assignedAgentId: MultiAgentId;
  readonly requestedByAgentId?: MultiAgentId;
  readonly priority: MultiAgentPriority;
  readonly createdAtMs: MultiAgentTimestamp;
  readonly startedAtMs?: MultiAgentTimestamp;
  readonly completedAtMs?: MultiAgentTimestamp;
  readonly deadlineAtMs?: MultiAgentTimestamp;
  readonly inputFingerprint: string;
  readonly requiredCapabilities: readonly MultiAgentCapability[];
  readonly dependencies: readonly MultiAgentTaskId[];
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentMessage<TPayload = MultiAgentJsonValue> {
  readonly messageId: MultiAgentMessageId;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly sequence: MultiAgentSequence;
  readonly type: MultiAgentMessageType;
  readonly senderAgentId: MultiAgentId;
  readonly recipientAgentIds: readonly MultiAgentId[];
  readonly correlationId: MultiAgentCorrelationId;
  readonly causationId?: MultiAgentCausationId;
  readonly createdAtMs: MultiAgentTimestamp;
  readonly expiresAtMs?: MultiAgentTimestamp;
  readonly payload: TPayload;
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentEvidence {
  readonly evidenceId: MultiAgentKnowledgeId;
  readonly source: MultiAgentEvidenceSource;
  readonly sourceReference: string;
  readonly direction: MultiAgentEvidenceDirection;
  readonly statement: string;
  readonly value?: number | string | boolean;
  readonly normalizedValue?: MultiAgentScore;
  readonly weight: MultiAgentWeight;
  readonly confidence: MultiAgentConfidence;
  readonly reliability: MultiAgentScore;
  readonly observedAtMs: MultiAgentTimestamp;
  readonly expiresAtMs?: MultiAgentTimestamp;
  readonly supportingAgentIds: readonly MultiAgentId[];
  readonly opposingAgentIds: readonly MultiAgentId[];
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

export type MultiAgentObservationType =
  | "MARKET_STATE"
  | "REGIME_STATE"
  | "VOLATILITY_STATE"
  | "LIQUIDITY_STATE"
  | "ORDER_FLOW_STATE"
  | "CORRELATION_STATE"
  | "ANOMALY_STATE"
  | "PRICE_OUTLOOK"
  | "PORTFOLIO_STATE"
  | "RISK_STATE"
  | "STRATEGY_STATE"
  | "ARBITRAGE_STATE"
  | "EXECUTION_STATE"
  | "SYSTEM_STATE"
  | "GOVERNANCE_STATE";

export interface MultiAgentObservation {
  readonly observationId: MultiAgentKnowledgeId;
  readonly agentId: MultiAgentId;
  readonly type: MultiAgentObservationType;
  readonly summary: string;
  readonly confidence: MultiAgentConfidence;
  readonly qualityScore: MultiAgentScore;
  readonly urgency: MultiAgentUrgency;
  readonly evidence: readonly MultiAgentEvidence[];
  readonly risks: readonly MultiAgentRiskFinding[];
  readonly opportunities: readonly MultiAgentOpportunityFinding[];
  readonly observedAtMs: MultiAgentTimestamp;
  readonly validUntilMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentMemoryRecord {
  readonly memoryId: MultiAgentMemoryId;
  readonly agentId?: MultiAgentId;
  readonly category:
    | "EPISODIC"
    | "SEMANTIC"
    | "PROCEDURAL"
    | "POLICY"
    | "OUTCOME"
    | "TRUST";
  readonly key: string;
  readonly value: MultiAgentJsonValue;
  readonly confidence: MultiAgentConfidence;
  readonly createdAtMs: MultiAgentTimestamp;
  readonly lastUpdatedAtMs: MultiAgentTimestamp;
  readonly expiresAtMs?: MultiAgentTimestamp;
  readonly sourceRunIds: readonly MultiAgentRunId[];
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Proposals, actions, risks, constraints, and utility
 * ========================================================================== */

export type MultiAgentActionType =
  | "NO_ACTION"
  | "MONITOR"
  | "RESEARCH"
  | "OPEN_POSITION"
  | "INCREASE_POSITION"
  | "REDUCE_POSITION"
  | "CLOSE_POSITION"
  | "HEDGE_POSITION"
  | "REBALANCE_PORTFOLIO"
  | "ACTIVATE_STRATEGY"
  | "DEACTIVATE_STRATEGY"
  | "ROTATE_STRATEGY"
  | "CHANGE_STRATEGY_WEIGHT"
  | "EXECUTE_ARBITRAGE"
  | "PUBLISH_SIGNAL"
  | "PAUSE_TRADING"
  | "RESUME_TRADING"
  | "ESCALATE_TO_OPERATOR"
  | "CUSTOM";

export type MultiAgentProposalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHALLENGED"
  | "REVISED"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "SUPERSEDED";

export type MultiAgentPriority =
  | "CRITICAL"
  | "VERY_HIGH"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFORMATIONAL";

export type MultiAgentUrgency =
  | "IMMEDIATE"
  | "HIGH"
  | "NORMAL"
  | "LOW"
  | "INFORMATIONAL";

export type MultiAgentRiskSeverity =
  | "INFORMATIONAL"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export type MultiAgentConstraintType =
  | "CAPITAL"
  | "EXPOSURE"
  | "LEVERAGE"
  | "DRAWDOWN"
  | "LIQUIDITY"
  | "VOLATILITY"
  | "CONCENTRATION"
  | "CORRELATION"
  | "TURNOVER"
  | "EXECUTION"
  | "VENUE"
  | "STRATEGY"
  | "ARBITRAGE"
  | "GOVERNANCE"
  | "COMPLIANCE"
  | "TIME"
  | "SYSTEM_HEALTH"
  | "CUSTOM";

export interface MultiAgentRiskFinding {
  readonly code: string;
  readonly name: string;
  readonly severity: MultiAgentRiskSeverity;
  readonly probability: MultiAgentProbability;
  readonly confidence: MultiAgentConfidence;
  readonly impact: MultiAgentRisk;
  readonly description: string;
  readonly mitigation?: string;
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
}

export interface MultiAgentOpportunityFinding {
  readonly code: string;
  readonly name: string;
  readonly expectedUtility: MultiAgentUtility;
  readonly probability: MultiAgentProbability;
  readonly confidence: MultiAgentConfidence;
  readonly description: string;
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
}

export interface MultiAgentConstraint {
  readonly constraintId: string;
  readonly type: MultiAgentConstraintType;
  readonly name: string;
  readonly description: string;
  readonly hard: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly actual?: number;
  readonly satisfied: boolean;
  readonly source: MultiAgentEvidenceSource;
  readonly failureReason?: string;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentUtilityAssessment {
  readonly expectedReturnUtility: MultiAgentUtility;
  readonly riskAdjustedUtility: MultiAgentUtility;
  readonly portfolioUtility: MultiAgentUtility;
  readonly strategyUtility: MultiAgentUtility;
  readonly arbitrageUtility: MultiAgentUtility;
  readonly executionUtility: MultiAgentUtility;
  readonly learningUtility: MultiAgentUtility;
  readonly operationalUtility: MultiAgentUtility;
  readonly totalUtility: MultiAgentUtility;
}

export interface MultiAgentProposalAction {
  readonly actionId: string;
  readonly type: MultiAgentActionType;
  readonly market?: MarketIdentity;
  readonly strategyId?: string;
  readonly portfolioId?: string;
  readonly arbitrageDecisionId?: string;
  readonly side?: "BUY" | "SELL" | "NEUTRAL";
  readonly quantity?: number;
  readonly notional?: number;
  readonly targetWeight?: MultiAgentWeight;
  readonly executionMode?:
    | "SIGNAL_ONLY"
    | "PAPER"
    | "SEMI_AUTOMATED"
    | "FULLY_AUTOMATED";
  readonly priority: MultiAgentPriority;
  readonly urgency: MultiAgentUrgency;
  readonly parameters?: MultiAgentMetadata;
}

export interface MultiAgentProposal {
  readonly proposalId: MultiAgentProposalId;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly proposedByAgentId: MultiAgentId;
  readonly status: MultiAgentProposalStatus;
  readonly title: string;
  readonly thesis: string;
  readonly actions: readonly MultiAgentProposalAction[];
  readonly expectedUtility: MultiAgentUtilityAssessment;
  readonly confidence: MultiAgentConfidence;
  readonly evidence: readonly MultiAgentEvidence[];
  readonly risks: readonly MultiAgentRiskFinding[];
  readonly constraints: readonly MultiAgentConstraint[];
  readonly assumptions: readonly string[];
  readonly invalidationConditions: readonly string[];
  readonly createdAtMs: MultiAgentTimestamp;
  readonly validUntilMs?: MultiAgentTimestamp;
  readonly parentProposalId?: MultiAgentProposalId;
  readonly revision: number;
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

/* ========================================================================== *
 * Peer review, challenge, debate, and conflict resolution
 * ========================================================================== */

export type MultiAgentReviewDecision =
  | "STRONGLY_SUPPORT"
  | "SUPPORT"
  | "SUPPORT_WITH_CHANGES"
  | "NEUTRAL"
  | "OPPOSE"
  | "STRONGLY_OPPOSE"
  | "VETO";

export type MultiAgentReviewDimension =
  | "EVIDENCE_QUALITY"
  | "MARKET_ALIGNMENT"
  | "PORTFOLIO_ALIGNMENT"
  | "RISK"
  | "STRATEGY_ALIGNMENT"
  | "ARBITRAGE_VALIDITY"
  | "EXECUTION_FEASIBILITY"
  | "GOVERNANCE"
  | "LEARNING_ALIGNMENT"
  | "EXPLAINABILITY";

export interface MultiAgentReviewScore {
  readonly dimension: MultiAgentReviewDimension;
  readonly score: MultiAgentScore;
  readonly confidence: MultiAgentConfidence;
  readonly rationale: string;
}

export interface MultiAgentPeerReview {
  readonly reviewId: MultiAgentReviewId;
  readonly proposalId: MultiAgentProposalId;
  readonly reviewerAgentId: MultiAgentId;
  readonly decision: MultiAgentReviewDecision;
  readonly scores: readonly MultiAgentReviewScore[];
  readonly supportingEvidence: readonly MultiAgentEvidence[];
  readonly concerns: readonly MultiAgentRiskFinding[];
  readonly requestedChanges: readonly string[];
  readonly confidence: MultiAgentConfidence;
  readonly reviewedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export type MultiAgentDebatePosition =
  | "AFFIRMATIVE"
  | "NEGATIVE"
  | "NEUTRAL"
  | "ARBITER";

export interface MultiAgentDebateStatement {
  readonly statementId: string;
  readonly debateRound: number;
  readonly agentId: MultiAgentId;
  readonly position: MultiAgentDebatePosition;
  readonly claim: string;
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
  readonly respondsToStatementId?: string;
  readonly confidence: MultiAgentConfidence;
  readonly createdAtMs: MultiAgentTimestamp;
}

export interface MultiAgentDebateTranscript {
  readonly sessionId: MultiAgentSessionId;
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly roundsCompleted: number;
  readonly statements: readonly MultiAgentDebateStatement[];
  readonly unresolvedQuestions: readonly string[];
  readonly converged: boolean;
  readonly convergenceScore: MultiAgentScore;
  readonly deterministicFingerprint: string;
}

export type MultiAgentConflictType =
  | "ACTION_CONFLICT"
  | "DIRECTION_CONFLICT"
  | "RISK_CONFLICT"
  | "CAPITAL_CONFLICT"
  | "STRATEGY_CONFLICT"
  | "ARBITRAGE_CONFLICT"
  | "EXECUTION_CONFLICT"
  | "GOVERNANCE_CONFLICT"
  | "EVIDENCE_CONFLICT"
  | "TIMING_CONFLICT"
  | "AUTHORITY_CONFLICT"
  | "POLICY_CONFLICT";

export type MultiAgentConflictResolution =
  | "SELECT_PRIMARY"
  | "MERGE_PROPOSALS"
  | "APPLY_RESTRICTIONS"
  | "REDUCE_SCOPE"
  | "DEFER"
  | "REJECT_ALL"
  | "ESCALATE"
  | "UNRESOLVED";

export interface MultiAgentConflict {
  readonly conflictId: MultiAgentConflictId;
  readonly type: MultiAgentConflictType;
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly agentIds: readonly MultiAgentId[];
  readonly description: string;
  readonly severity: MultiAgentRiskSeverity;
  readonly evidence: readonly MultiAgentEvidence[];
  readonly detectedAtMs: MultiAgentTimestamp;
}

export interface MultiAgentResolvedConflict extends MultiAgentConflict {
  readonly resolution: MultiAgentConflictResolution;
  readonly selectedProposalId?: MultiAgentProposalId;
  readonly mergedProposalId?: MultiAgentProposalId;
  readonly restrictions: readonly string[];
  readonly rationale: string;
  readonly resolvedByAgentId?: MultiAgentId;
  readonly resolvedAtMs: MultiAgentTimestamp;
  readonly confidence: MultiAgentConfidence;
}

/* ========================================================================== *
 * Voting, quorum, consensus, dissent, and collective confidence
 * ========================================================================== */

export type MultiAgentVoteChoice =
  | "APPROVE"
  | "APPROVE_WITH_RESTRICTIONS"
  | "ABSTAIN"
  | "DEFER"
  | "REJECT"
  | "VETO";

export type MultiAgentConsensusMethod =
  | "UNANIMOUS"
  | "SUPERMAJORITY"
  | "SIMPLE_MAJORITY"
  | "WEIGHTED_MAJORITY"
  | "CONFIDENCE_WEIGHTED"
  | "AUTHORITY_WEIGHTED"
  | "RISK_ADJUSTED"
  | "SUPERVISOR_DECISION"
  | "HYBRID";

export type MultiAgentConsensusStatus =
  | "NOT_STARTED"
  | "COLLECTING_VOTES"
  | "CONSENSUS_REACHED"
  | "CONSENSUS_WITH_DISSENT"
  | "DEADLOCKED"
  | "QUORUM_NOT_MET"
  | "VETOED"
  | "ESCALATED";

export interface MultiAgentVote {
  readonly voteId: MultiAgentVoteId;
  readonly proposalId: MultiAgentProposalId;
  readonly agentId: MultiAgentId;
  readonly choice: MultiAgentVoteChoice;
  readonly baseWeight: MultiAgentWeight;
  readonly trustAdjustedWeight: MultiAgentWeight;
  readonly confidenceAdjustedWeight: MultiAgentWeight;
  readonly effectiveWeight: MultiAgentWeight;
  readonly confidence: MultiAgentConfidence;
  readonly rationale: string;
  readonly restrictions: readonly string[];
  readonly castAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentQuorumPolicy {
  readonly minimumEligibleAgents: number;
  readonly minimumParticipatingAgents: number;
  readonly minimumParticipationRatio: MultiAgentScore;
  readonly requiredRoles: readonly MultiAgentRole[];
  readonly requiredCapabilities: readonly MultiAgentCapability[];
  readonly requireRiskAgent: boolean;
  readonly requireGovernanceAgent: boolean;
  readonly requireSupervisor: boolean;
  readonly allowDegradedAgents: boolean;
}

export interface MultiAgentConsensusPolicy {
  readonly method: MultiAgentConsensusMethod;
  readonly approvalThreshold: MultiAgentScore;
  readonly rejectionThreshold: MultiAgentScore;
  readonly vetoEnabled: boolean;
  readonly maximumAbstentionRatio: MultiAgentScore;
  readonly quorum: MultiAgentQuorumPolicy;
  readonly maximumDebateRounds: number;
  readonly deadlockResolution:
    | "SUPERVISOR"
    | "ARBITER"
    | "DEFER"
    | "REJECT"
    | "OPERATOR";
}

export interface MultiAgentDissentRecord {
  readonly agentId: MultiAgentId;
  readonly proposalId: MultiAgentProposalId;
  readonly vote: MultiAgentVoteChoice;
  readonly rationale: string;
  readonly material: boolean;
  readonly unresolvedRisks: readonly MultiAgentRiskFinding[];
}

export interface MultiAgentCollectiveConfidence {
  readonly rawConfidence: MultiAgentConfidence;
  readonly evidenceQualityAdjustment: number;
  readonly agentReliabilityAdjustment: number;
  readonly agreementAdjustment: number;
  readonly diversityAdjustment: number;
  readonly dissentAdjustment: number;
  readonly governanceAdjustment: number;
  readonly finalConfidence: MultiAgentConfidence;
}

export interface MultiAgentConsensusResult {
  readonly consensusId: MultiAgentConsensusId;
  readonly status: MultiAgentConsensusStatus;
  readonly method: MultiAgentConsensusMethod;
  readonly selectedProposalId?: MultiAgentProposalId;
  readonly votes: readonly MultiAgentVote[];
  readonly approvalWeight: MultiAgentWeight;
  readonly rejectionWeight: MultiAgentWeight;
  readonly abstentionWeight: MultiAgentWeight;
  readonly vetoCount: number;
  readonly participationRatio: MultiAgentScore;
  readonly quorumSatisfied: boolean;
  readonly collectiveConfidence: MultiAgentCollectiveConfidence;
  readonly dissent: readonly MultiAgentDissentRecord[];
  readonly resolvedConflicts: readonly MultiAgentResolvedConflict[];
  readonly rationale: string;
  readonly formedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Trust, reliability, calibration, and diversity
 * ========================================================================== */

export interface MultiAgentTrustScore {
  readonly agentId: MultiAgentId;
  readonly overallTrust: MultiAgentScore;
  readonly historicalAccuracy: MultiAgentScore;
  readonly calibrationScore: MultiAgentScore;
  readonly reliabilityScore: MultiAgentScore;
  readonly evidenceQualityScore: MultiAgentScore;
  readonly governanceComplianceScore: MultiAgentScore;
  readonly collaborationScore: MultiAgentScore;
  readonly outcomeContributionScore: MultiAgentScore;
  readonly sampleSize: number;
  readonly assessedAtMs: MultiAgentTimestamp;
}

export interface MultiAgentDiversityAssessment {
  readonly roleDiversity: MultiAgentScore;
  readonly capabilityDiversity: MultiAgentScore;
  readonly modelDiversity: MultiAgentScore;
  readonly evidenceDiversity: MultiAgentScore;
  readonly viewpointDiversity: MultiAgentScore;
  readonly concentrationRisk: MultiAgentRisk;
  readonly correlatedAgentGroups: readonly (readonly MultiAgentId[])[];
  readonly overallDiversity: MultiAgentScore;
}

export interface MultiAgentCalibrationObservation {
  readonly agentId: MultiAgentId;
  readonly runId: MultiAgentRunId;
  readonly predictedConfidence: MultiAgentConfidence;
  readonly realizedCorrectness: MultiAgentScore;
  readonly utilityContribution: MultiAgentUtility;
  readonly riskContribution: MultiAgentRisk;
  readonly observedAtMs: MultiAgentTimestamp;
}

export interface MultiAgentTrustUpdate {
  readonly agentId: MultiAgentId;
  readonly previous: MultiAgentTrustScore;
  readonly current: MultiAgentTrustScore;
  readonly reason: string;
  readonly supportingObservations: readonly MultiAgentCalibrationObservation[];
  readonly updatedAtMs: MultiAgentTimestamp;
}

/* ========================================================================== *
 * Governance, safety, approval, and operator escalation
 * ========================================================================== */

export type MultiAgentGovernanceDecision =
  | "APPROVED"
  | "APPROVED_WITH_RESTRICTIONS"
  | "DEFERRED"
  | "REJECTED"
  | "ESCALATED";

export type MultiAgentApprovalRequirement =
  | "NONE"
  | "AGENT_SUPERVISOR"
  | "RISK_APPROVAL"
  | "GOVERNANCE_APPROVAL"
  | "DUAL_AGENT_APPROVAL"
  | "HUMAN_APPROVAL";

export interface MultiAgentGovernanceRule {
  readonly ruleId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly hard: boolean;
  readonly priority: MultiAgentPriority;
  readonly applicableActions: readonly MultiAgentActionType[];
  readonly requiredRoles: readonly MultiAgentRole[];
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentGovernanceRuleEvaluation {
  readonly ruleId: string;
  readonly passed: boolean;
  readonly severity: MultiAgentRiskSeverity;
  readonly message: string;
  readonly restrictions: readonly string[];
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
}

export interface MultiAgentGovernanceAssessment {
  readonly decision: MultiAgentGovernanceDecision;
  readonly approvalRequirement: MultiAgentApprovalRequirement;
  readonly ruleEvaluations: readonly MultiAgentGovernanceRuleEvaluation[];
  readonly restrictions: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly approvingAgentIds: readonly MultiAgentId[];
  readonly assessedAtMs: MultiAgentTimestamp;
  readonly confidence: MultiAgentConfidence;
}

export interface MultiAgentSafetyPolicy {
  readonly failClosed: boolean;
  readonly minimumCollectiveConfidence: MultiAgentConfidence;
  readonly minimumAgentReliability: MultiAgentScore;
  readonly minimumEvidenceQuality: MultiAgentScore;
  readonly maximumRiskScore: MultiAgentRisk;
  readonly maximumCapitalAtRisk: number;
  readonly maximumLeverage: number;
  readonly maximumDrawdown: number;
  readonly requireRiskAgentParticipation: boolean;
  readonly requireGovernanceAgentParticipation: boolean;
  readonly rejectOnCriticalAnomaly: boolean;
  readonly rejectOnStaleMarketIntelligence: boolean;
  readonly rejectOnUnresolvedMaterialDissent: boolean;
  readonly rejectOnUnresolvedConflict: boolean;
  readonly requireDeterministicFingerprint: boolean;
  readonly allowOperatorOverride: boolean;
}

export interface MultiAgentOperatorEscalation {
  readonly required: boolean;
  readonly reason: string;
  readonly priority: MultiAgentPriority;
  readonly requestedAction:
    | "REVIEW"
    | "APPROVE"
    | "REJECT"
    | "RESOLVE_CONFLICT"
    | "MODIFY_RESTRICTIONS"
    | "ACKNOWLEDGE";
  readonly relatedProposalIds: readonly MultiAgentProposalId[];
  readonly unresolvedRisks: readonly MultiAgentRiskFinding[];
  readonly createdAtMs: MultiAgentTimestamp;
  readonly expiresAtMs?: MultiAgentTimestamp;
}

/* ========================================================================== *
 * Collective decision and execution handoff
 * ========================================================================== */

export type MultiAgentDecision =
  | "EXECUTE"
  | "EXECUTE_WITH_RESTRICTIONS"
  | "MONITOR"
  | "HOLD"
  | "DEFER"
  | "REJECT"
  | "ESCALATE";

export interface MultiAgentDecisionAction {
  readonly actionId: string;
  readonly sourceProposalId: MultiAgentProposalId;
  readonly action: MultiAgentProposalAction;
  readonly approved: boolean;
  readonly restrictions: readonly string[];
  readonly contributingAgentIds: readonly MultiAgentId[];
  readonly confidence: MultiAgentConfidence;
}

export interface MultiAgentExecutionHandoff {
  readonly planId: MultiAgentPlanId;
  readonly decisionIntelligenceRequest?: DecisionIntelligenceRunRequest;
  readonly decisionExecutionPlan?: DecisionExecutionPlan;
  readonly strategyPortfolioRequest?: AiStrategyPortfolioRunRequest;
  readonly arbitrageRequest?: InstitutionalArbitrageOrchestratorRequest;
  readonly actions: readonly MultiAgentDecisionAction[];
  readonly executionAuthorized: boolean;
  readonly approvalRequirement: MultiAgentApprovalRequirement;
  readonly restrictions: readonly string[];
  readonly generatedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentCollectiveDecision {
  readonly decisionId: MultiAgentDecisionId;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly decision: MultiAgentDecision;
  readonly selectedProposal?: MultiAgentProposal;
  readonly consensus: MultiAgentConsensusResult;
  readonly governance: MultiAgentGovernanceAssessment;
  readonly actions: readonly MultiAgentDecisionAction[];
  readonly collectiveConfidence: MultiAgentCollectiveConfidence;
  readonly expectedUtility: MultiAgentUtilityAssessment;
  readonly risks: readonly MultiAgentRiskFinding[];
  readonly constraints: readonly MultiAgentConstraint[];
  readonly restrictions: readonly string[];
  readonly dissent: readonly MultiAgentDissentRecord[];
  readonly operatorEscalation?: MultiAgentOperatorEscalation;
  readonly executionHandoff?: MultiAgentExecutionHandoff;
  readonly decidedAtMs: MultiAgentTimestamp;
  readonly validUntilMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
  readonly metadata?: MultiAgentMetadata;
}

/* ========================================================================== *
 * Explainability and audit trail
 * ========================================================================== */

export type MultiAgentExplanationAudience =
  | "SYSTEM"
  | "TRADER"
  | "RISK_MANAGER"
  | "PORTFOLIO_MANAGER"
  | "OPERATOR"
  | "AUDITOR"
  | "REGULATOR";

export interface MultiAgentExplanationFactor {
  readonly rank: number;
  readonly name: string;
  readonly direction: MultiAgentEvidenceDirection;
  readonly importance: MultiAgentScore;
  readonly contribution: number;
  readonly agentIds: readonly MultiAgentId[];
  readonly evidenceIds: readonly MultiAgentKnowledgeId[];
  readonly explanation: string;
}

export interface MultiAgentAgentContribution {
  readonly agentId: MultiAgentId;
  readonly role: MultiAgentRole;
  readonly proposalContribution: MultiAgentScore;
  readonly evidenceContribution: MultiAgentScore;
  readonly reviewContribution: MultiAgentScore;
  readonly consensusContribution: MultiAgentScore;
  readonly finalContribution: MultiAgentScore;
  readonly summary: string;
}

export interface MultiAgentDecisionExplanation {
  readonly explanationId: string;
  readonly decisionId: MultiAgentDecisionId;
  readonly audience: MultiAgentExplanationAudience;
  readonly headline: string;
  readonly summary: string;
  readonly primaryFactors: readonly MultiAgentExplanationFactor[];
  readonly opposingFactors: readonly MultiAgentExplanationFactor[];
  readonly uncertaintyFactors: readonly MultiAgentExplanationFactor[];
  readonly agentContributions: readonly MultiAgentAgentContribution[];
  readonly consensusNarrative: string;
  readonly governanceNarrative: string;
  readonly dissentNarrative?: string;
  readonly alternativesConsidered: readonly string[];
  readonly limitations: readonly string[];
  readonly generatedAtMs: MultiAgentTimestamp;
  readonly modelVersion: MultiAgentVersion;
}

export interface MultiAgentAuditTrace {
  readonly traceId: MultiAgentTraceId;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly createdAtMs: MultiAgentTimestamp;
  readonly completedAtMs?: MultiAgentTimestamp;
  readonly completedStages: readonly MultiAgentPipelineStage[];
  readonly stageTimings: readonly MultiAgentStageTiming[];
  readonly taskIds: readonly MultiAgentTaskId[];
  readonly messageIds: readonly MultiAgentMessageId[];
  readonly proposalIds: readonly MultiAgentProposalId[];
  readonly reviewIds: readonly MultiAgentReviewId[];
  readonly voteIds: readonly MultiAgentVoteId[];
  readonly conflictIds: readonly MultiAgentConflictId[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

export type MultiAgentValidationSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "FATAL";

export interface MultiAgentValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly severity: MultiAgentValidationSeverity;
  readonly message: string;
  readonly actualValue?: MultiAgentJsonValue;
  readonly expected?: string;
}

export interface MultiAgentValidationResult<TValue> {
  readonly valid: boolean;
  readonly value?: TValue;
  readonly issues: readonly MultiAgentValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

/* ========================================================================== *
 * Configuration
 * ========================================================================== */

export interface MultiAgentAgentSelectionPolicy {
  readonly enabledRoles: readonly MultiAgentRole[];
  readonly requiredRoles: readonly MultiAgentRole[];
  readonly minimumAgents: number;
  readonly maximumAgents: number;
  readonly minimumReadinessScore: MultiAgentScore;
  readonly minimumReliabilityScore: MultiAgentScore;
  readonly preferDeterministicAgents: boolean;
  readonly requireCapabilityCoverage: boolean;
  readonly allowDegradedAgents: boolean;
  readonly diversityWeight: MultiAgentWeight;
  readonly reliabilityWeight: MultiAgentWeight;
  readonly proficiencyWeight: MultiAgentWeight;
  readonly latencyWeight: MultiAgentWeight;
}

export interface MultiAgentDebatePolicy {
  readonly enabled: boolean;
  readonly triggerOnMaterialConflict: boolean;
  readonly triggerOnLowAgreement: boolean;
  readonly agreementThreshold: MultiAgentScore;
  readonly maximumRounds: number;
  readonly maximumStatementsPerAgentPerRound: number;
  readonly requireEvidenceReferences: boolean;
  readonly allowProposalRevision: boolean;
  readonly stopOnConvergence: boolean;
  readonly convergenceThreshold: MultiAgentScore;
}

export interface MultiAgentTrustPolicy {
  readonly enabled: boolean;
  readonly initialTrust: MultiAgentScore;
  readonly minimumVotingTrust: MultiAgentScore;
  readonly accuracyWeight: MultiAgentWeight;
  readonly calibrationWeight: MultiAgentWeight;
  readonly reliabilityWeight: MultiAgentWeight;
  readonly evidenceQualityWeight: MultiAgentWeight;
  readonly governanceComplianceWeight: MultiAgentWeight;
  readonly collaborationWeight: MultiAgentWeight;
  readonly outcomeContributionWeight: MultiAgentWeight;
  readonly learningRate: number;
  readonly decayRate: number;
  readonly quarantineThreshold: MultiAgentScore;
}

export interface MultiAgentExecutionPolicy {
  readonly enabled: boolean;
  readonly allowSignalOnly: boolean;
  readonly allowPaperExecution: boolean;
  readonly allowSemiAutomatedExecution: boolean;
  readonly allowFullyAutomatedExecution: boolean;
  readonly maximumActionsPerDecision: number;
  readonly requireDecisionIntelligenceHandoff: boolean;
  readonly requireExecutionPlan: boolean;
  readonly requireRollbackPlan: boolean;
  readonly prohibitExecutionOnWarnings: boolean;
}

export interface MultiAgentExplainabilityPolicy {
  readonly enabled: boolean;
  readonly audience: MultiAgentExplanationAudience;
  readonly maximumPrimaryFactors: number;
  readonly maximumOpposingFactors: number;
  readonly maximumUncertaintyFactors: number;
  readonly includeAgentContributions: boolean;
  readonly includeDissent: boolean;
  readonly includeAlternatives: boolean;
  readonly includeLimitations: boolean;
}

export interface MultiAgentConfiguration {
  readonly schemaVersion: AiMultiAgentSchemaVersion;
  readonly operatingMode: MultiAgentAutonomyLevel;
  readonly agentSelection: MultiAgentAgentSelectionPolicy;
  readonly consensus: MultiAgentConsensusPolicy;
  readonly debate: MultiAgentDebatePolicy;
  readonly trust: MultiAgentTrustPolicy;
  readonly safety: MultiAgentSafetyPolicy;
  readonly execution: MultiAgentExecutionPolicy;
  readonly explainability: MultiAgentExplainabilityPolicy;
  readonly governanceRules: readonly MultiAgentGovernanceRule[];
  readonly failFast: boolean;
  readonly maximumContextAgeMs: number;
  readonly maximumAgentTaskDurationMs: number;
  readonly maximumRunDurationMs: number;
  readonly requireDeterministicAgents: boolean;
  readonly requireDeterministicFingerprint: boolean;
  readonly publishEvents: boolean;
}

/* ========================================================================== *
 * Orchestration request, response, failures, snapshots, and outcomes
 * ========================================================================== */

export interface MultiAgentRunRequest {
  readonly requestId: string;
  readonly requestedAtMs: MultiAgentTimestamp;
  readonly portfolioId?: string;
  readonly objective:
    | "MARKET_ASSESSMENT"
    | "TRADE_DECISION"
    | "STRATEGY_ORCHESTRATION"
    | "PORTFOLIO_REBALANCE"
    | "RISK_RESPONSE"
    | "ARBITRAGE_DECISION"
    | "EXECUTION_REVIEW"
    | "FULL_COLLABORATIVE_DECISION";
  readonly context: MultiAgentSystemContext;
  readonly configuration: MultiAgentConfiguration;
  readonly preferredAgentIds?: readonly MultiAgentId[];
  readonly excludedAgentIds?: readonly MultiAgentId[];
  readonly requiredRoles?: readonly MultiAgentRole[];
  readonly constraints?: readonly MultiAgentConstraint[];
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentRunFailure {
  readonly code: string;
  readonly message: string;
  readonly stage?: MultiAgentPipelineStage;
  readonly agentId?: MultiAgentId;
  readonly retryable: boolean;
  readonly cause?: string;
  readonly metadata?: MultiAgentMetadata;
}

export interface MultiAgentRunResult {
  readonly runId: MultiAgentRunId;
  readonly requestId: string;
  readonly sessionId: MultiAgentSessionId;
  readonly status: MultiAgentRunStatus;
  readonly terminalReason?: MultiAgentTerminalReason;
  readonly validation: MultiAgentValidationResult<MultiAgentRunRequest>;
  readonly selectedAgents: readonly MultiAgentRegistration[];
  readonly observations: readonly MultiAgentObservation[];
  readonly proposals: readonly MultiAgentProposal[];
  readonly reviews: readonly MultiAgentPeerReview[];
  readonly debate?: MultiAgentDebateTranscript;
  readonly conflicts: readonly MultiAgentConflict[];
  readonly consensus?: MultiAgentConsensusResult;
  readonly decision?: MultiAgentCollectiveDecision;
  readonly explanation?: MultiAgentDecisionExplanation;
  readonly trustUpdates: readonly MultiAgentTrustUpdate[];
  readonly failures: readonly MultiAgentRunFailure[];
  readonly trace: MultiAgentAuditTrace;
  readonly startedAtMs: MultiAgentTimestamp;
  readonly completedAtMs: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

export type MultiAgentExecutionOutcome =
  | MultiAgentRunResult
  | {
      readonly runId: MultiAgentRunId;
      readonly requestId: string;
      readonly sessionId: MultiAgentSessionId;
      readonly status: "FAILED" | "REJECTED" | "CANCELLED";
      readonly failure: MultiAgentRunFailure;
      readonly validation: MultiAgentValidationResult<MultiAgentRunRequest>;
      readonly trace: MultiAgentAuditTrace;
      readonly deterministicFingerprint: string;
    };

export interface MultiAgentManagerSnapshot {
  readonly schemaVersion: AiMultiAgentSchemaVersion;
  readonly managerId: MultiAgentId;
  readonly capturedAtMs: MultiAgentTimestamp;
  readonly registrations: readonly MultiAgentRegistration[];
  readonly health: readonly MultiAgentHealthSnapshot[];
  readonly trustScores: readonly MultiAgentTrustScore[];
  readonly activeRunIds: readonly MultiAgentRunId[];
  readonly recentDecisions: readonly MultiAgentCollectiveDecision[];
  readonly memory: readonly MultiAgentMemoryRecord[];
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly rejectedRuns: number;
  readonly failedRuns: number;
  readonly averageCollectiveConfidence: MultiAgentConfidence;
  readonly averageConsensusParticipation: MultiAgentScore;
  readonly deterministicFingerprint: string;
}

/* ========================================================================== *
 * Dependency ports
 * ========================================================================== */

export interface MultiAgentClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentIdGenerator {
  generate(prefix: string, seed: string): MultiAgentId;
}

export interface MultiAgentFingerprintGenerator {
  fingerprint(value: unknown): string;
}

export interface MultiAgentLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface MultiAgentRegistryPort {
  register(registration: MultiAgentRegistration): void;
  unregister(agentId: MultiAgentId): void;
  get(agentId: MultiAgentId): MultiAgentRegistration | undefined;
  list(): readonly MultiAgentRegistration[];
  health(agentId: MultiAgentId): MultiAgentHealthSnapshot | undefined;
}

export interface MultiAgentContextBuilderPort {
  build(request: MultiAgentRunRequest): MultiAgentSystemContext;
}

export interface MultiAgentSelectorPort {
  select(
    request: MultiAgentRunRequest,
    registrations: readonly MultiAgentRegistration[],
    health: readonly MultiAgentHealthSnapshot[],
    trust: readonly MultiAgentTrustScore[],
  ): readonly MultiAgentRegistration[];
}

export interface MultiAgentTaskDispatcherPort {
  dispatch(
    tasks: readonly MultiAgentTask[],
    agents: readonly MultiAgentRegistration[],
    context: MultiAgentSystemContext,
  ): Promise<readonly MultiAgentObservation[]>;
}

export interface MultiAgentProposalEnginePort {
  propose(
    request: MultiAgentRunRequest,
    agents: readonly MultiAgentRegistration[],
    observations: readonly MultiAgentObservation[],
  ): Promise<readonly MultiAgentProposal[]>;
}

export interface MultiAgentPeerReviewEnginePort {
  review(
    proposals: readonly MultiAgentProposal[],
    agents: readonly MultiAgentRegistration[],
    context: MultiAgentSystemContext,
  ): Promise<readonly MultiAgentPeerReview[]>;
}

export interface MultiAgentDebateEnginePort {
  debate(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
    agents: readonly MultiAgentRegistration[],
    policy: MultiAgentDebatePolicy,
  ): Promise<MultiAgentDebateTranscript>;
}

export interface MultiAgentConflictResolverPort {
  detect(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
  ): readonly MultiAgentConflict[];

  resolve(
    conflicts: readonly MultiAgentConflict[],
    proposals: readonly MultiAgentProposal[],
    debate: MultiAgentDebateTranscript | undefined,
    agents: readonly MultiAgentRegistration[],
  ): Promise<readonly MultiAgentResolvedConflict[]>;
}

export interface MultiAgentConsensusEnginePort {
  form(
    proposals: readonly MultiAgentProposal[],
    reviews: readonly MultiAgentPeerReview[],
    resolvedConflicts: readonly MultiAgentResolvedConflict[],
    agents: readonly MultiAgentRegistration[],
    trust: readonly MultiAgentTrustScore[],
    policy: MultiAgentConsensusPolicy,
  ): Promise<MultiAgentConsensusResult>;
}

export interface MultiAgentGovernanceEnginePort {
  evaluate(
    request: MultiAgentRunRequest,
    selectedProposal: MultiAgentProposal | undefined,
    consensus: MultiAgentConsensusResult,
    rules: readonly MultiAgentGovernanceRule[],
    safety: MultiAgentSafetyPolicy,
  ): MultiAgentGovernanceAssessment;
}

export interface MultiAgentDecisionAssemblerPort {
  assemble(
    request: MultiAgentRunRequest,
    proposals: readonly MultiAgentProposal[],
    consensus: MultiAgentConsensusResult,
    governance: MultiAgentGovernanceAssessment,
  ): MultiAgentCollectiveDecision;
}

export interface MultiAgentExecutionPlannerPort {
  plan(
    request: MultiAgentRunRequest,
    decision: MultiAgentCollectiveDecision,
    policy: MultiAgentExecutionPolicy,
  ): Promise<MultiAgentExecutionHandoff>;
}

export interface MultiAgentExplainabilityEnginePort {
  explain(
    request: MultiAgentRunRequest,
    result: {
      readonly agents: readonly MultiAgentRegistration[];
      readonly observations: readonly MultiAgentObservation[];
      readonly proposals: readonly MultiAgentProposal[];
      readonly reviews: readonly MultiAgentPeerReview[];
      readonly debate?: MultiAgentDebateTranscript;
      readonly consensus: MultiAgentConsensusResult;
      readonly decision: MultiAgentCollectiveDecision;
    },
    policy: MultiAgentExplainabilityPolicy,
  ): MultiAgentDecisionExplanation;
}

export interface MultiAgentTrustEnginePort {
  assess(
    registrations: readonly MultiAgentRegistration[],
    history: readonly MultiAgentCalibrationObservation[],
    policy: MultiAgentTrustPolicy,
  ): readonly MultiAgentTrustScore[];

  update(
    previous: readonly MultiAgentTrustScore[],
    observations: readonly MultiAgentCalibrationObservation[],
    policy: MultiAgentTrustPolicy,
  ): readonly MultiAgentTrustUpdate[];
}

export interface MultiAgentMemoryPort {
  read(agentId?: MultiAgentId): readonly MultiAgentMemoryRecord[];
  write(records: readonly MultiAgentMemoryRecord[]): void;
}

export interface MultiAgentValidatorPort {
  validateRequest(
    request: MultiAgentRunRequest,
  ): MultiAgentValidationResult<MultiAgentRunRequest>;

  validateConfiguration(
    configuration: MultiAgentConfiguration,
  ): MultiAgentValidationResult<MultiAgentConfiguration>;

  validateRegistration(
    registration: MultiAgentRegistration,
  ): MultiAgentValidationResult<MultiAgentRegistration>;

  validateProposal(
    proposal: MultiAgentProposal,
  ): MultiAgentValidationResult<MultiAgentProposal>;

  validateDecision(
    decision: MultiAgentCollectiveDecision,
  ): MultiAgentValidationResult<MultiAgentCollectiveDecision>;
}

export type MultiAgentPublicationTopic =
  | "RUN_STARTED"
  | "AGENTS_SELECTED"
  | "OBSERVATIONS_COMPLETED"
  | "PROPOSALS_GENERATED"
  | "DEBATE_COMPLETED"
  | "CONFLICT_DETECTED"
  | "CONSENSUS_FORMED"
  | "GOVERNANCE_EVALUATED"
  | "DECISION_COMPLETED"
  | "EXECUTION_HANDOFF"
  | "OPERATOR_ESCALATION"
  | "RUN_FAILED";

export interface MultiAgentEvent {
  readonly eventId: string;
  readonly topic: MultiAgentPublicationTopic;
  readonly runId: MultiAgentRunId;
  readonly sessionId: MultiAgentSessionId;
  readonly occurredAtMs: MultiAgentTimestamp;
  readonly sequence: MultiAgentSequence;
  readonly payload: MultiAgentJsonValue;
  readonly correlationId: MultiAgentCorrelationId;
  readonly causationId?: MultiAgentCausationId;
  readonly deterministicFingerprint: string;
}

export interface MultiAgentEventPublisherPort {
  publish(event: MultiAgentEvent): void | Promise<void>;
}

export interface MultiAgentPersistencePort {
  saveRun(result: MultiAgentRunResult): void | Promise<void>;
  saveSnapshot(snapshot: MultiAgentManagerSnapshot): void | Promise<void>;
  loadSnapshot(): MultiAgentManagerSnapshot | undefined | Promise<
    MultiAgentManagerSnapshot | undefined
  >;
}

export interface AiMultiAgentIntelligenceOrchestratorPort {
  run(request: MultiAgentRunRequest): Promise<MultiAgentExecutionOutcome>;
  snapshot(): MultiAgentManagerSnapshot;
}

export interface AiMultiAgentIntelligenceDependencies {
  readonly registry: MultiAgentRegistryPort;
  readonly contextBuilder: MultiAgentContextBuilderPort;
  readonly selector: MultiAgentSelectorPort;
  readonly taskDispatcher: MultiAgentTaskDispatcherPort;
  readonly proposalEngine: MultiAgentProposalEnginePort;
  readonly peerReviewEngine: MultiAgentPeerReviewEnginePort;
  readonly debateEngine: MultiAgentDebateEnginePort;
  readonly conflictResolver: MultiAgentConflictResolverPort;
  readonly consensusEngine: MultiAgentConsensusEnginePort;
  readonly governanceEngine: MultiAgentGovernanceEnginePort;
  readonly decisionAssembler: MultiAgentDecisionAssemblerPort;
  readonly executionPlanner: MultiAgentExecutionPlannerPort;
  readonly explainabilityEngine: MultiAgentExplainabilityEnginePort;
  readonly trustEngine: MultiAgentTrustEnginePort;
  readonly memory: MultiAgentMemoryPort;
  readonly validator: MultiAgentValidatorPort;
  readonly publisher?: MultiAgentEventPublisherPort;
  readonly persistence?: MultiAgentPersistencePort;
  readonly clock: MultiAgentClock;
  readonly idGenerator: MultiAgentIdGenerator;
  readonly fingerprintGenerator: MultiAgentFingerprintGenerator;
  readonly logger?: MultiAgentLogger;
}

/* ========================================================================== *
 * Immutable default policies and canonical values
 * ========================================================================== */

export const MULTI_AGENT_RUN_STATUSES: readonly MultiAgentRunStatus[] =
  Object.freeze([
    "CREATED",
    "VALIDATING",
    "BUILDING_CONTEXT",
    "SELECTING_AGENTS",
    "DISPATCHING_TASKS",
    "COLLECTING_OBSERVATIONS",
    "GENERATING_PROPOSALS",
    "PEER_REVIEW",
    "DEBATING",
    "RESOLVING_CONFLICTS",
    "FORMING_CONSENSUS",
    "EVALUATING_GOVERNANCE",
    "ASSEMBLING_DECISION",
    "PLANNING_EXECUTION",
    "EXPLAINING",
    "PUBLISHING",
    "COMPLETED",
    "COMPLETED_WITH_WARNINGS",
    "DEFERRED",
    "REJECTED",
    "FAILED",
    "CANCELLED",
  ]);

export const MULTI_AGENT_PIPELINE_ORDER: readonly MultiAgentPipelineStage[] =
  Object.freeze([
    "VALIDATION",
    "CONTEXT_BUILDING",
    "AGENT_SELECTION",
    "TASK_DISPATCH",
    "OBSERVATION",
    "PROPOSAL_GENERATION",
    "PEER_REVIEW",
    "DEBATE",
    "CONFLICT_RESOLUTION",
    "CONSENSUS_FORMATION",
    "GOVERNANCE",
    "DECISION_ASSEMBLY",
    "EXECUTION_PLANNING",
    "EXPLAINABILITY",
    "PUBLICATION",
  ]);

export const MULTI_AGENT_ROLES: readonly MultiAgentRole[] = Object.freeze([
  "MARKET_INTELLIGENCE_AGENT",
  "REGIME_ANALYSIS_AGENT",
  "VOLATILITY_AGENT",
  "LIQUIDITY_AGENT",
  "ORDER_FLOW_AGENT",
  "CORRELATION_AGENT",
  "ANOMALY_AGENT",
  "PRICE_PREDICTION_AGENT",
  "STRATEGY_SELECTION_AGENT",
  "STRATEGY_PORTFOLIO_AGENT",
  "PORTFOLIO_CONSTRUCTION_AGENT",
  "RISK_AGENT",
  "EXECUTION_AGENT",
  "ARBITRAGE_AGENT",
  "META_LEARNING_AGENT",
  "REINFORCEMENT_AGENT",
  "GOVERNANCE_AGENT",
  "EXPLAINABILITY_AGENT",
  "CONFLICT_ARBITER_AGENT",
  "CONSENSUS_COORDINATOR_AGENT",
  "SUPERVISOR_AGENT",
  "OPERATOR_PROXY_AGENT",
  "CUSTOM",
]);

const DEFAULT_MULTI_AGENT_QUORUM_REQUIRED_ROLES: readonly MultiAgentRole[] = Object.freeze([
  "MARKET_INTELLIGENCE_AGENT",
  "RISK_AGENT",
  "GOVERNANCE_AGENT",
]);

const DEFAULT_MULTI_AGENT_QUORUM_REQUIRED_CAPABILITIES: readonly MultiAgentCapability[] =
  Object.freeze([
    "PROPOSE_DECISION",
    "REVIEW_PROPOSAL",
    "VOTE",
    "FORM_CONSENSUS",
  ]);

const DEFAULT_MULTI_AGENT_SELECTION_REQUIRED_ROLES: readonly MultiAgentRole[] =
  Object.freeze([
    "MARKET_INTELLIGENCE_AGENT",
    "RISK_AGENT",
    "GOVERNANCE_AGENT",
    "CONSENSUS_COORDINATOR_AGENT",
  ]);

export const DEFAULT_MULTI_AGENT_QUORUM_POLICY: MultiAgentQuorumPolicy =
  Object.freeze({
    minimumEligibleAgents: 5,
    minimumParticipatingAgents: 4,
    minimumParticipationRatio: 0.75,
    requiredRoles: DEFAULT_MULTI_AGENT_QUORUM_REQUIRED_ROLES,
    requiredCapabilities: DEFAULT_MULTI_AGENT_QUORUM_REQUIRED_CAPABILITIES,
    requireRiskAgent: true,
    requireGovernanceAgent: true,
    requireSupervisor: false,
    allowDegradedAgents: false,
  });

export const DEFAULT_MULTI_AGENT_CONSENSUS_POLICY: MultiAgentConsensusPolicy =
  Object.freeze({
    method: "RISK_ADJUSTED",
    approvalThreshold: 0.67,
    rejectionThreshold: 0.5,
    vetoEnabled: true,
    maximumAbstentionRatio: 0.34,
    quorum: DEFAULT_MULTI_AGENT_QUORUM_POLICY,
    maximumDebateRounds: 3,
    deadlockResolution: "ARBITER",
  });

export const DEFAULT_MULTI_AGENT_SELECTION_POLICY: MultiAgentAgentSelectionPolicy =
  Object.freeze({
    enabledRoles: MULTI_AGENT_ROLES,
    requiredRoles: DEFAULT_MULTI_AGENT_SELECTION_REQUIRED_ROLES,
    minimumAgents: 5,
    maximumAgents: 16,
    minimumReadinessScore: 0.7,
    minimumReliabilityScore: 0.7,
    preferDeterministicAgents: true,
    requireCapabilityCoverage: true,
    allowDegradedAgents: false,
    diversityWeight: 0.2,
    reliabilityWeight: 0.35,
    proficiencyWeight: 0.35,
    latencyWeight: 0.1,
  });

export const DEFAULT_MULTI_AGENT_DEBATE_POLICY: MultiAgentDebatePolicy =
  Object.freeze({
    enabled: true,
    triggerOnMaterialConflict: true,
    triggerOnLowAgreement: true,
    agreementThreshold: 0.7,
    maximumRounds: 3,
    maximumStatementsPerAgentPerRound: 3,
    requireEvidenceReferences: true,
    allowProposalRevision: true,
    stopOnConvergence: true,
    convergenceThreshold: 0.8,
  });

export const DEFAULT_MULTI_AGENT_TRUST_POLICY: MultiAgentTrustPolicy =
  Object.freeze({
    enabled: true,
    initialTrust: 0.7,
    minimumVotingTrust: 0.5,
    accuracyWeight: 0.25,
    calibrationWeight: 0.15,
    reliabilityWeight: 0.15,
    evidenceQualityWeight: 0.15,
    governanceComplianceWeight: 0.1,
    collaborationWeight: 0.1,
    outcomeContributionWeight: 0.1,
    learningRate: 0.1,
    decayRate: 0.01,
    quarantineThreshold: 0.25,
  });

export const DEFAULT_MULTI_AGENT_SAFETY_POLICY: MultiAgentSafetyPolicy =
  Object.freeze({
    failClosed: true,
    minimumCollectiveConfidence: 0.65,
    minimumAgentReliability: 0.7,
    minimumEvidenceQuality: 0.65,
    maximumRiskScore: 0.75,
    maximumCapitalAtRisk: 0,
    maximumLeverage: 1,
    maximumDrawdown: 0.2,
    requireRiskAgentParticipation: true,
    requireGovernanceAgentParticipation: true,
    rejectOnCriticalAnomaly: true,
    rejectOnStaleMarketIntelligence: true,
    rejectOnUnresolvedMaterialDissent: true,
    rejectOnUnresolvedConflict: true,
    requireDeterministicFingerprint: true,
    allowOperatorOverride: false,
  });

export const DEFAULT_MULTI_AGENT_EXECUTION_POLICY: MultiAgentExecutionPolicy =
  Object.freeze({
    enabled: true,
    allowSignalOnly: true,
    allowPaperExecution: true,
    allowSemiAutomatedExecution: true,
    allowFullyAutomatedExecution: false,
    maximumActionsPerDecision: 20,
    requireDecisionIntelligenceHandoff: true,
    requireExecutionPlan: true,
    requireRollbackPlan: true,
    prohibitExecutionOnWarnings: false,
  });

export const DEFAULT_MULTI_AGENT_EXPLAINABILITY_POLICY: MultiAgentExplainabilityPolicy =
  Object.freeze({
    enabled: true,
    audience: "TRADER",
    maximumPrimaryFactors: 8,
    maximumOpposingFactors: 6,
    maximumUncertaintyFactors: 6,
    includeAgentContributions: true,
    includeDissent: true,
    includeAlternatives: true,
    includeLimitations: true,
  });

export const DEFAULT_MULTI_AGENT_CONFIGURATION: MultiAgentConfiguration =
  Object.freeze({
    schemaVersion: AI_MULTI_AGENT_SCHEMA_VERSION,
    operatingMode: "SEMI_AUTONOMOUS",
    agentSelection: DEFAULT_MULTI_AGENT_SELECTION_POLICY,
    consensus: DEFAULT_MULTI_AGENT_CONSENSUS_POLICY,
    debate: DEFAULT_MULTI_AGENT_DEBATE_POLICY,
    trust: DEFAULT_MULTI_AGENT_TRUST_POLICY,
    safety: DEFAULT_MULTI_AGENT_SAFETY_POLICY,
    execution: DEFAULT_MULTI_AGENT_EXECUTION_POLICY,
    explainability: DEFAULT_MULTI_AGENT_EXPLAINABILITY_POLICY,
    governanceRules: Object.freeze([]),
    failFast: true,
    maximumContextAgeMs: 60_000,
    maximumAgentTaskDurationMs: 30_000,
    maximumRunDurationMs: 120_000,
    requireDeterministicAgents: true,
    requireDeterministicFingerprint: true,
    publishEvents: true,
  });

/* ========================================================================== *
 * Pure type guards and deterministic helpers
 * ========================================================================== */

export function isMultiAgentNormalizedNumber(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MULTI_AGENT_NORMALIZED_MINIMUM &&
    value <= MULTI_AGENT_NORMALIZED_MAXIMUM
  );
}

export function isMultiAgentCorrelation(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MULTI_AGENT_CORRELATION_MINIMUM &&
    value <= MULTI_AGENT_CORRELATION_MAXIMUM
  );
}

export function isTerminalMultiAgentRunStatus(
  status: MultiAgentRunStatus,
): boolean {
  return (
    status === "COMPLETED" ||
    status === "COMPLETED_WITH_WARNINGS" ||
    status === "DEFERRED" ||
    status === "REJECTED" ||
    status === "FAILED" ||
    status === "CANCELLED"
  );
}

export function isExecutableMultiAgentDecision(
  decision: MultiAgentDecision,
): boolean {
  return (
    decision === "EXECUTE" ||
    decision === "EXECUTE_WITH_RESTRICTIONS"
  );
}