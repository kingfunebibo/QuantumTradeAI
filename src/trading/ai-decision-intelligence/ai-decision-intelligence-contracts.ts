/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 1:
 * src/trading/ai-decision-intelligence/ai-decision-intelligence-contracts.ts
 *
 * Foundational, deterministic, immutable contracts for decision intelligence.
 * This subsystem consumes validated portfolio, market, risk, strategy and
 * Milestone 34 meta-learning evidence and produces governed orchestration plans.
 */

import type {
  AdaptiveStrategyWeight,
  DeepReadonly,
  LearnedRegimeProfile,
  MarketRegime,
  MarketSymbol,
  MarketTimeframe,
  MetaLearningActionPlan,
  MetaLearningExecutionOutcome,
  MetaLearningId,
  MetaLearningManagerSnapshot,
  MetaLearningRunResult,
  MetaLearningTimestamp,
  PortfolioId,
  ReadonlyRecord,
  StrategyReinforcementState,
  StrategyDescriptor,
  StrategyEvolutionCandidate,
  StrategyId,
  StrategyLearningScore,
  MetaLearningLifecycleChange,
  StrategyRiskObservation,
} from "../ai-meta-learning/ai-meta-learning-contracts";

export type DecisionIntelligenceId = MetaLearningId;
export type DecisionIntelligenceTimestamp = MetaLearningTimestamp;
export type DecisionPortfolioId = PortfolioId;
export type DecisionStrategyId = StrategyId;
export type DecisionMarketSymbol = MarketSymbol;
export type DecisionMarketTimeframe = MarketTimeframe;
export type DecisionMetadata = ReadonlyRecord<string, unknown>;
export type DecisionDeepReadonly<T> = DeepReadonly<T>;

export type DecisionIntelligenceRunStatus =
  | "CREATED"
  | "VALIDATING"
  | "ASSESSING_CONTEXT"
  | "BUILDING_CANDIDATES"
  | "SCORING_CANDIDATES"
  | "RESOLVING_CONFLICTS"
  | "OPTIMIZING_PLAN"
  | "EVALUATING_GOVERNANCE"
  | "EXPLAINING"
  | "COMPLETED"
  | "DEFERRED"
  | "REJECTED"
  | "FAILED";

export type DecisionIntelligenceDecision =
  | "EXECUTE"
  | "EXECUTE_WITH_RESTRICTIONS"
  | "HOLD"
  | "DEFER"
  | "REJECT";

export type DecisionUrgency =
  | "IMMEDIATE"
  | "HIGH"
  | "NORMAL"
  | "LOW"
  | "INFORMATIONAL";

export type DecisionPriority =
  | "CRITICAL"
  | "VERY_HIGH"
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type DecisionConfidenceBand =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type DecisionEvidenceSource =
  | "MARKET_CONTEXT"
  | "PORTFOLIO_STATE"
  | "RISK_STATE"
  | "STRATEGY_STATE"
  | "SIGNAL_INTELLIGENCE"
  | "EXECUTION_INTELLIGENCE"
  | "META_LEARNING"
  | "REINFORCEMENT_FEEDBACK"
  | "GOVERNANCE_POLICY"
  | "OPERATOR_INPUT"
  | "SYSTEM_HEALTH";

export type DecisionEvidenceDirection =
  | "STRONGLY_SUPPORTIVE"
  | "SUPPORTIVE"
  | "NEUTRAL"
  | "OPPOSING"
  | "STRONGLY_OPPOSING";

export type DecisionCandidateType =
  | "ACTIVATE_STRATEGY"
  | "DEACTIVATE_STRATEGY"
  | "PAUSE_STRATEGY"
  | "RESUME_STRATEGY"
  | "REWEIGHT_STRATEGY"
  | "ROTATE_STRATEGY"
  | "PROMOTE_STRATEGY"
  | "DEMOTE_STRATEGY"
  | "RETIRE_STRATEGY"
  | "EVOLVE_STRATEGY"
  | "CHANGE_PARAMETERS"
  | "REDUCE_EXPOSURE"
  | "INCREASE_EXPOSURE"
  | "HEDGE_EXPOSURE"
  | "REBALANCE_PORTFOLIO"
  | "CHANGE_EXECUTION_MODE"
  | "CANCEL_PENDING_ACTION"
  | "NO_ACTION";

export type DecisionActionType = Exclude<DecisionCandidateType, "NO_ACTION">;

export type StrategyOperatingMode =
  | "DISABLED"
  | "OBSERVE_ONLY"
  | "SHADOW"
  | "PAPER"
  | "LIMITED_LIVE"
  | "LIVE"
  | "EMERGENCY_ONLY";

export type StrategyOrchestrationState =
  | "INACTIVE"
  | "STARTING"
  | "ACTIVE"
  | "PAUSING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "DEGRADED"
  | "QUARANTINED"
  | "FAILED";

export type DecisionConstraintType =
  | "HARD"
  | "SOFT"
  | "ADVISORY";

export type DecisionConstraintScope =
  | "GLOBAL"
  | "PORTFOLIO"
  | "STRATEGY"
  | "SYMBOL"
  | "REGIME"
  | "EXECUTION"
  | "RISK"
  | "GOVERNANCE";

export type DecisionConflictType =
  | "MUTUALLY_EXCLUSIVE_ACTIONS"
  | "COMPETING_CAPITAL"
  | "COMPETING_RISK_BUDGET"
  | "STRATEGY_DEPENDENCY"
  | "REGIME_MISMATCH"
  | "POLICY_CONFLICT"
  | "TEMPORAL_CONFLICT"
  | "EXECUTION_CONFLICT"
  | "DUPLICATE_ACTION";

export type DecisionConflictResolution =
  | "SELECT_HIGHER_PRIORITY"
  | "SELECT_HIGHER_UTILITY"
  | "MERGE_ACTIONS"
  | "SEQUENCE_ACTIONS"
  | "REDUCE_SCOPE"
  | "DEFER_ALL"
  | "REJECT_ALL";

export type GovernanceApprovalRequirement =
  | "NONE"
  | "AUTOMATIC_POLICY"
  | "RISK_ENGINE"
  | "HUMAN_OPERATOR"
  | "MULTI_PARTY";

export type GovernanceDecision =
  | "APPROVED"
  | "APPROVED_WITH_RESTRICTIONS"
  | "PENDING_APPROVAL"
  | "DEFERRED"
  | "REJECTED";

export type DecisionExecutionMode =
  | "DRY_RUN"
  | "SIMULATED"
  | "SHADOW"
  | "LIVE_GUARDED"
  | "LIVE_AUTONOMOUS";

export type DecisionPlanExecutionStatus =
  | "NOT_STARTED"
  | "QUEUED"
  | "IN_PROGRESS"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "CANCELLED"
  | "ROLLED_BACK"
  | "FAILED";

export type DecisionActionExecutionStatus =
  | "PENDING"
  | "READY"
  | "BLOCKED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "SKIPPED"
  | "CANCELLED"
  | "ROLLED_BACK"
  | "FAILED";

export type DecisionFailurePolicy =
  | "STOP_PLAN"
  | "CONTINUE_INDEPENDENT_ACTIONS"
  | "ROLLBACK_PLAN"
  | "ROLLBACK_ACTION"
  | "ESCALATE";

export type DecisionExplainabilityLevel =
  | "SUMMARY"
  | "STANDARD"
  | "DETAILED"
  | "AUDIT";

export interface DecisionNumericRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface DecisionValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "ERROR" | "WARNING";
  readonly receivedValue?: unknown;
}

export interface DecisionValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DecisionValidationIssue[];
}

export interface DecisionClock {
  now(): DecisionIntelligenceTimestamp;
}

export interface DecisionIdGenerator {
  next(prefix: string): DecisionIntelligenceId;
}

export interface DecisionLogger {
  debug(message: string, context?: DecisionMetadata): void;
  info(message: string, context?: DecisionMetadata): void;
  warn(message: string, context?: DecisionMetadata): void;
  error(message: string, context?: DecisionMetadata): void;
}

export interface DecisionEvidence {
  readonly evidenceId: DecisionIntelligenceId;
  readonly source: DecisionEvidenceSource;
  readonly sourceId?: string;
  readonly observedAt: DecisionIntelligenceTimestamp;
  readonly direction: DecisionEvidenceDirection;
  readonly strength: number;
  readonly confidence: number;
  readonly freshness: number;
  readonly relevance: number;
  readonly summary: string;
  readonly attributes: ReadonlyRecord<string, number | string | boolean>;
  readonly metadata: DecisionMetadata;
}

export interface DecisionConfidenceAssessment {
  readonly score: number;
  readonly band: DecisionConfidenceBand;
  readonly evidenceCoverage: number;
  readonly evidenceConsistency: number;
  readonly modelAgreement: number;
  readonly dataQuality: number;
  readonly regimeCertainty: number;
  readonly riskCertainty: number;
  readonly uncertainty: number;
  readonly reasons: readonly string[];
}

export interface DecisionUtilityComponents {
  readonly expectedReturnUtility: number;
  readonly riskAdjustedUtility: number;
  readonly drawdownProtectionUtility: number;
  readonly diversificationUtility: number;
  readonly regimeAlignmentUtility: number;
  readonly learningUtility: number;
  readonly executionUtility: number;
  readonly operationalUtility: number;
  readonly stabilityUtility: number;
  readonly totalUtility: number;
}

export interface DecisionCostComponents {
  readonly expectedTransactionCost: number;
  readonly expectedSlippageCost: number;
  readonly expectedMarketImpactCost: number;
  readonly expectedTurnoverCost: number;
  readonly operationalCost: number;
  readonly opportunityCost: number;
  readonly modelRiskCost: number;
  readonly totalCost: number;
}

export interface DecisionRiskImpact {
  readonly currentRiskScore: number;
  readonly projectedRiskScore: number;
  readonly riskDelta: number;
  readonly concentrationRiskDelta: number;
  readonly correlationRiskDelta: number;
  readonly liquidityRiskDelta: number;
  readonly leverageRiskDelta: number;
  readonly volatilityRiskDelta: number;
  readonly drawdownRiskDelta: number;
  readonly tailRiskDelta: number;
  readonly operationalRiskDelta: number;
  readonly withinRiskBudget: boolean;
  readonly breachedLimits: readonly string[];
  readonly warnings: readonly string[];
}

export interface DecisionPortfolioPosition {
  readonly positionId: string;
  readonly symbol: DecisionMarketSymbol;
  readonly strategyId?: DecisionStrategyId;
  readonly side: "LONG" | "SHORT" | "FLAT";
  readonly quantity: number;
  readonly notionalValue: number;
  readonly portfolioWeight: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly leverage: number;
  readonly openedAt?: DecisionIntelligenceTimestamp;
  readonly updatedAt: DecisionIntelligenceTimestamp;
  readonly metadata: DecisionMetadata;
}

export interface DecisionPortfolioSnapshot {
  readonly portfolioId: DecisionPortfolioId;
  readonly capturedAt: DecisionIntelligenceTimestamp;
  readonly baseCurrency: string;
  readonly totalEquity: number;
  readonly availableCapital: number;
  readonly deployedCapital: number;
  readonly reservedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly leverage: number;
  readonly currentDrawdown: number;
  readonly maximumDrawdown: number;
  readonly dailyReturn: number;
  readonly cumulativeReturn: number;
  readonly portfolioRiskScore: number;
  readonly remainingRiskBudget: number;
  readonly positions: readonly DecisionPortfolioPosition[];
  readonly strategyWeights: ReadonlyRecord<DecisionStrategyId, number>;
  readonly metadata: DecisionMetadata;
}

export interface DecisionMarketContext {
  readonly contextId: DecisionIntelligenceId;
  readonly capturedAt: DecisionIntelligenceTimestamp;
  readonly symbol?: DecisionMarketSymbol;
  readonly timeframe?: DecisionMarketTimeframe;
  readonly regime: MarketRegime;
  readonly regimeConfidence: number;
  readonly trendStrength: number;
  readonly volatilityScore: number;
  readonly liquidityScore: number;
  readonly momentumScore: number;
  readonly meanReversionScore: number;
  readonly stressScore: number;
  readonly correlationStressScore: number;
  readonly executionQualityScore: number;
  readonly dataQualityScore: number;
  readonly features: ReadonlyRecord<string, number>;
  readonly metadata: DecisionMetadata;
}

export interface StrategyDecisionState {
  readonly strategy: StrategyDescriptor;
  readonly orchestrationState: StrategyOrchestrationState;
  readonly operatingMode: StrategyOperatingMode;
  readonly currentWeight: number;
  readonly targetWeight?: number;
  readonly allocatedCapital: number;
  readonly consumedRiskBudget: number;
  readonly healthScore: number;
  readonly performanceScore: number;
  readonly stabilityScore: number;
  readonly regimeAlignmentScore: number;
  readonly executionQualityScore: number;
  readonly confidence: number;
  readonly activeSymbols: readonly DecisionMarketSymbol[];
  readonly activeTimeframes: readonly DecisionMarketTimeframe[];
  readonly dependencies: readonly DecisionStrategyId[];
  readonly conflictsWith: readonly DecisionStrategyId[];
  readonly lastDecisionAt?: DecisionIntelligenceTimestamp;
  readonly lastTransitionAt?: DecisionIntelligenceTimestamp;
  readonly metadata: DecisionMetadata;
}

export interface DecisionSystemHealthSnapshot {
  readonly capturedAt: DecisionIntelligenceTimestamp;
  readonly overallHealthScore: number;
  readonly marketDataHealthy: boolean;
  readonly riskEngineHealthy: boolean;
  readonly executionEngineHealthy: boolean;
  readonly persistenceHealthy: boolean;
  readonly metaLearningHealthy: boolean;
  readonly degradedComponents: readonly string[];
  readonly unavailableComponents: readonly string[];
  readonly warnings: readonly string[];
}

export interface MetaLearningDecisionInput {
  readonly outcome?: MetaLearningExecutionOutcome;
  readonly completedResult?: MetaLearningRunResult;
  readonly actionPlan?: MetaLearningActionPlan;
  readonly managerSnapshot?: MetaLearningManagerSnapshot;
  readonly strategyLearningScores: readonly StrategyLearningScore[];
  readonly adaptiveWeights: readonly AdaptiveStrategyWeight[];
  readonly learnedRegimeProfiles: readonly LearnedRegimeProfile[];
  readonly reinforcementStates: readonly StrategyReinforcementState[];
  readonly evolutionCandidates: readonly StrategyEvolutionCandidate[];
  readonly lifecycleChanges: readonly MetaLearningLifecycleChange[];
  readonly generatedAt?: DecisionIntelligenceTimestamp;
  readonly warnings: readonly string[];
}

export interface DecisionConstraint {
  readonly constraintId: DecisionIntelligenceId;
  readonly type: DecisionConstraintType;
  readonly scope: DecisionConstraintScope;
  readonly name: string;
  readonly description: string;
  readonly strategyId?: DecisionStrategyId;
  readonly symbol?: DecisionMarketSymbol;
  readonly regime?: MarketRegime;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly expectedValue?: number | string | boolean;
  readonly priority: DecisionPriority;
  readonly enabled: boolean;
  readonly metadata: DecisionMetadata;
}

export interface DecisionCandidate {
  readonly candidateId: DecisionIntelligenceId;
  readonly type: DecisionCandidateType;
  readonly portfolioId: DecisionPortfolioId;
  readonly strategyId?: DecisionStrategyId;
  readonly replacementStrategyId?: DecisionStrategyId;
  readonly symbol?: DecisionMarketSymbol;
  readonly timeframe?: DecisionMarketTimeframe;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly urgency: DecisionUrgency;
  readonly priority: DecisionPriority;
  readonly proposedWeight?: number;
  readonly proposedCapital?: number;
  readonly proposedRiskBudget?: number;
  readonly proposedOperatingMode?: StrategyOperatingMode;
  readonly proposedParameters?: ReadonlyRecord<string, number | string | boolean>;
  readonly utility: DecisionUtilityComponents;
  readonly costs: DecisionCostComponents;
  readonly riskImpact: DecisionRiskImpact;
  readonly confidence: DecisionConfidenceAssessment;
  readonly evidence: readonly DecisionEvidence[];
  readonly constraints: readonly DecisionConstraint[];
  readonly prerequisites: readonly DecisionIntelligenceId[];
  readonly mutuallyExclusiveWith: readonly DecisionIntelligenceId[];
  readonly expiresAt?: DecisionIntelligenceTimestamp;
  readonly rationale: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface ScoredDecisionCandidate extends DecisionCandidate {
  readonly grossScore: number;
  readonly penaltyScore: number;
  readonly finalScore: number;
  readonly rank: number;
  readonly eligible: boolean;
  readonly rejectionReasons: readonly string[];
}

export interface DecisionConflict {
  readonly conflictId: DecisionIntelligenceId;
  readonly type: DecisionConflictType;
  readonly candidateIds: readonly DecisionIntelligenceId[];
  readonly severity: DecisionPriority;
  readonly description: string;
  readonly recommendedResolution: DecisionConflictResolution;
  readonly metadata: DecisionMetadata;
}

export interface ResolvedDecisionConflict extends DecisionConflict {
  readonly resolution: DecisionConflictResolution;
  readonly selectedCandidateIds: readonly DecisionIntelligenceId[];
  readonly rejectedCandidateIds: readonly DecisionIntelligenceId[];
  readonly sequencedCandidateIds: readonly DecisionIntelligenceId[];
  readonly rationale: readonly string[];
}

export interface DecisionActionRollback {
  readonly supported: boolean;
  readonly actionType?: DecisionActionType;
  readonly targetWeight?: number;
  readonly targetOperatingMode?: StrategyOperatingMode;
  readonly targetParameters?: ReadonlyRecord<string, number | string | boolean>;
  readonly instructions: readonly string[];
}

export interface DecisionAction {
  readonly actionId: DecisionIntelligenceId;
  readonly candidateId: DecisionIntelligenceId;
  readonly type: DecisionActionType;
  readonly sequence: number;
  readonly portfolioId: DecisionPortfolioId;
  readonly strategyId?: DecisionStrategyId;
  readonly replacementStrategyId?: DecisionStrategyId;
  readonly symbol?: DecisionMarketSymbol;
  readonly timeframe?: DecisionMarketTimeframe;
  readonly targetWeight?: number;
  readonly targetCapital?: number;
  readonly targetRiskBudget?: number;
  readonly targetOperatingMode?: StrategyOperatingMode;
  readonly targetParameters?: ReadonlyRecord<string, number | string | boolean>;
  readonly dependsOnActionIds: readonly DecisionIntelligenceId[];
  readonly blocksActionIds: readonly DecisionIntelligenceId[];
  readonly earliestExecutionAt?: DecisionIntelligenceTimestamp;
  readonly expiresAt?: DecisionIntelligenceTimestamp;
  readonly timeoutMs: number;
  readonly maximumAttempts: number;
  readonly failurePolicy: DecisionFailurePolicy;
  readonly rollback: DecisionActionRollback;
  readonly expectedUtility: number;
  readonly expectedRiskDelta: number;
  readonly confidence: number;
  readonly rationale: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface DecisionPlanMetrics {
  readonly candidateCount: number;
  readonly selectedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly actionCount: number;
  readonly expectedGrossUtility: number;
  readonly expectedNetUtility: number;
  readonly expectedCost: number;
  readonly expectedRiskDelta: number;
  readonly expectedTurnover: number;
  readonly expectedCapitalChange: number;
  readonly expectedReserveWeight: number;
  readonly diversificationScore: number;
  readonly regimeAlignmentScore: number;
  readonly stabilityScore: number;
  readonly confidence: number;
}

export interface DecisionExecutionPlan {
  readonly planId: DecisionIntelligenceId;
  readonly runId: DecisionIntelligenceId;
  readonly requestId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly createdAt: DecisionIntelligenceTimestamp;
  readonly validUntil?: DecisionIntelligenceTimestamp;
  readonly executionMode: DecisionExecutionMode;
  readonly decision: DecisionIntelligenceDecision;
  readonly actions: readonly DecisionAction[];
  readonly targetStrategyWeights: ReadonlyRecord<DecisionStrategyId, number>;
  readonly targetOperatingModes: ReadonlyRecord<DecisionStrategyId, StrategyOperatingMode>;
  readonly metrics: DecisionPlanMetrics;
  readonly conflicts: readonly ResolvedDecisionConflict[];
  readonly safeguards: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface GovernanceRuleEvaluation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly passed: boolean;
  readonly blocking: boolean;
  readonly message: string;
  readonly evaluatedValue?: number | string | boolean;
  readonly expectedValue?: number | string | boolean;
}

export interface DecisionGovernanceAssessment {
  readonly assessmentId: DecisionIntelligenceId;
  readonly evaluatedAt: DecisionIntelligenceTimestamp;
  readonly decision: GovernanceDecision;
  readonly approvalRequirement: GovernanceApprovalRequirement;
  readonly approvedActionIds: readonly DecisionIntelligenceId[];
  readonly restrictedActionIds: readonly DecisionIntelligenceId[];
  readonly rejectedActionIds: readonly DecisionIntelligenceId[];
  readonly requiredApproverRoles: readonly string[];
  readonly ruleEvaluations: readonly GovernanceRuleEvaluation[];
  readonly restrictions: readonly string[];
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

export interface DecisionExplanationFactor {
  readonly name: string;
  readonly category: DecisionEvidenceSource | "UTILITY" | "COST" | "RISK";
  readonly contribution: number;
  readonly direction: DecisionEvidenceDirection;
  readonly confidence: number;
  readonly description: string;
}

export interface StrategyDecisionExplanation {
  readonly strategyId: DecisionStrategyId;
  readonly decision: DecisionCandidateType;
  readonly summary: string;
  readonly previousWeight: number;
  readonly proposedWeight: number;
  readonly confidence: number;
  readonly primaryFactors: readonly DecisionExplanationFactor[];
  readonly supportingEvidenceIds: readonly DecisionIntelligenceId[];
  readonly rejectedAlternatives: readonly string[];
  readonly risks: readonly string[];
  readonly safeguards: readonly string[];
}

export interface DecisionExplainabilityResult {
  readonly explanationId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly level: DecisionExplainabilityLevel;
  readonly decision: DecisionIntelligenceDecision;
  readonly summary: string;
  readonly portfolioNarrative: string;
  readonly strategyExplanations: readonly StrategyDecisionExplanation[];
  readonly primaryFactors: readonly DecisionExplanationFactor[];
  readonly conflictsResolved: readonly string[];
  readonly governanceNarrative: string;
  readonly uncertaintyNarrative: string;
  readonly alternativesConsidered: readonly string[];
  readonly safeguards: readonly string[];
  readonly confidence: number;
  readonly warnings: readonly string[];
}

export interface DecisionSafetyPolicy {
  readonly enabled: boolean;
  readonly dryRun: boolean;
  readonly minimumDecisionConfidence: number;
  readonly minimumDataQualityScore: number;
  readonly maximumAllowedRiskIncrease: number;
  readonly maximumPortfolioTurnover: number;
  readonly maximumStrategiesChangedPerRun: number;
  readonly maximumCapitalReallocatedPerRun: number;
  readonly preserveAtLeastOneActiveStrategy: boolean;
  readonly blockOnUnhealthyRiskEngine: boolean;
  readonly blockOnUnhealthyExecutionEngine: boolean;
  readonly blockOnStaleMarketContext: boolean;
  readonly maximumMarketContextAgeMs: number;
  readonly rejectOnValidationWarning: boolean;
  readonly requireRollbackForLiveActions: boolean;
  readonly requireHumanApprovalForLiveAutonomousMode: boolean;
  readonly requireHumanApprovalForPromotion: boolean;
  readonly requireHumanApprovalForRetirement: boolean;
  readonly requireHumanApprovalForRiskIncrease: boolean;
}

export interface DecisionCandidateScoringWeights {
  readonly expectedReturn: number;
  readonly riskAdjustedReturn: number;
  readonly drawdownProtection: number;
  readonly diversification: number;
  readonly regimeAlignment: number;
  readonly learningValue: number;
  readonly executionQuality: number;
  readonly operationalStability: number;
  readonly confidence: number;
  readonly costPenalty: number;
  readonly riskPenalty: number;
  readonly uncertaintyPenalty: number;
}

export interface DecisionOptimizationConstraints {
  readonly minimumStrategyWeight: number;
  readonly maximumStrategyWeight: number;
  readonly minimumReserveWeight: number;
  readonly maximumPortfolioTurnover: number;
  readonly maximumWeightChangePerStrategy: number;
  readonly maximumSelectedCandidates: number;
  readonly maximumConcurrentActions: number;
  readonly maximumGrossExposure: number;
  readonly maximumNetExposure: number;
  readonly maximumLeverage: number;
  readonly maximumRiskScore: number;
  readonly normalizeWeightsToOne: boolean;
}

export interface DecisionGovernancePolicy {
  readonly enabled: boolean;
  readonly autonomousExecutionAllowed: boolean;
  readonly defaultApprovalRequirement: GovernanceApprovalRequirement;
  readonly minimumAutonomousConfidence: number;
  readonly maximumAutonomousRiskIncrease: number;
  readonly maximumAutonomousTurnover: number;
  readonly restrictedActionTypes: readonly DecisionActionType[];
  readonly prohibitedActionTypes: readonly DecisionActionType[];
  readonly humanApprovalActionTypes: readonly DecisionActionType[];
  readonly requiredApproverRoles: readonly string[];
  readonly approvalTimeoutMs: number;
}

export interface DecisionIntelligenceConfiguration {
  readonly executionMode: DecisionExecutionMode;
  readonly explainabilityLevel: DecisionExplainabilityLevel;
  readonly scoringWeights: DecisionCandidateScoringWeights;
  readonly optimizationConstraints: DecisionOptimizationConstraints;
  readonly safetyPolicy: DecisionSafetyPolicy;
  readonly governancePolicy: DecisionGovernancePolicy;
  readonly minimumCandidateScore: number;
  readonly conflictResolutionTolerance: number;
  readonly evidenceFreshnessHalfLifeMs: number;
  readonly includeNoActionCandidate: boolean;
  readonly preferStablePlans: boolean;
  readonly deterministicSeed?: string;
}

export interface DecisionIntelligenceRunRequest {
  readonly requestId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly requestedAt: DecisionIntelligenceTimestamp;
  readonly correlationId?: string;
  readonly portfolio: DecisionPortfolioSnapshot;
  readonly marketContexts: readonly DecisionMarketContext[];
  readonly strategyStates: readonly StrategyDecisionState[];
  readonly riskObservations: readonly StrategyRiskObservation[];
  readonly systemHealth: DecisionSystemHealthSnapshot;
  readonly metaLearning?: MetaLearningDecisionInput;
  readonly constraints: readonly DecisionConstraint[];
  readonly configuration: DecisionIntelligenceConfiguration;
  readonly operatorDirectives: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface DecisionContextAssessment {
  readonly assessmentId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly portfolioHealthScore: number;
  readonly marketOpportunityScore: number;
  readonly marketRiskScore: number;
  readonly regimeConfidence: number;
  readonly strategyHealthScore: number;
  readonly executionReadinessScore: number;
  readonly systemReadinessScore: number;
  readonly evidenceQualityScore: number;
  readonly activeRegime: MarketRegime;
  readonly eligibleStrategyIds: readonly DecisionStrategyId[];
  readonly ineligibleStrategyIds: readonly DecisionStrategyId[];
  readonly blockingConditions: readonly string[];
  readonly warnings: readonly string[];
}

export interface DecisionIntelligenceRunResult {
  readonly runId: DecisionIntelligenceId;
  readonly requestId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly correlationId?: string;
  readonly status: "COMPLETED" | "DEFERRED";
  readonly decision: DecisionIntelligenceDecision;
  readonly requestedAt: DecisionIntelligenceTimestamp;
  readonly startedAt: DecisionIntelligenceTimestamp;
  readonly completedAt: DecisionIntelligenceTimestamp;
  readonly contextAssessment: DecisionContextAssessment;
  readonly candidates: readonly ScoredDecisionCandidate[];
  readonly selectedCandidateIds: readonly DecisionIntelligenceId[];
  readonly executionPlan: DecisionExecutionPlan;
  readonly governance: DecisionGovernanceAssessment;
  readonly explanation: DecisionExplainabilityResult;
  readonly confidence: DecisionConfidenceAssessment;
  readonly warnings: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface DecisionIntelligenceRunFailure {
  readonly runId: DecisionIntelligenceId;
  readonly requestId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly correlationId?: string;
  readonly status: "REJECTED" | "FAILED";
  readonly stage: DecisionIntelligenceRunStatus;
  readonly requestedAt: DecisionIntelligenceTimestamp;
  readonly startedAt: DecisionIntelligenceTimestamp;
  readonly completedAt: DecisionIntelligenceTimestamp;
  readonly errorCode: string;
  readonly message: string;
  readonly validation?: DecisionValidationResult;
  readonly retryable: boolean;
  readonly warnings: readonly string[];
  readonly metadata: DecisionMetadata;
}

export type DecisionIntelligenceExecutionOutcome =
  | DecisionIntelligenceRunResult
  | DecisionIntelligenceRunFailure;

export interface DecisionActionExecutionResult {
  readonly actionId: DecisionIntelligenceId;
  readonly status: DecisionActionExecutionStatus;
  readonly attempt: number;
  readonly startedAt?: DecisionIntelligenceTimestamp;
  readonly completedAt?: DecisionIntelligenceTimestamp;
  readonly externalReferenceId?: string;
  readonly previousState?: DecisionMetadata;
  readonly resultingState?: DecisionMetadata;
  readonly message: string;
  readonly retryable: boolean;
  readonly errorCode?: string;
  readonly warnings: readonly string[];
}

export interface DecisionPlanExecutionResult {
  readonly executionId: DecisionIntelligenceId;
  readonly planId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly status: DecisionPlanExecutionStatus;
  readonly startedAt: DecisionIntelligenceTimestamp;
  readonly completedAt?: DecisionIntelligenceTimestamp;
  readonly actionResults: readonly DecisionActionExecutionResult[];
  readonly completedActionIds: readonly DecisionIntelligenceId[];
  readonly failedActionIds: readonly DecisionIntelligenceId[];
  readonly skippedActionIds: readonly DecisionIntelligenceId[];
  readonly rolledBackActionIds: readonly DecisionIntelligenceId[];
  readonly warnings: readonly string[];
  readonly metadata: DecisionMetadata;
}

export interface DecisionIntelligenceManagerSnapshot {
  readonly snapshotId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly deferredRuns: number;
  readonly rejectedRuns: number;
  readonly failedRuns: number;
  readonly executeDecisions: number;
  readonly restrictedExecuteDecisions: number;
  readonly holdDecisions: number;
  readonly averageConfidence: number;
  readonly averageCandidateCount: number;
  readonly averageSelectedCandidateCount: number;
  readonly averageExpectedTurnover: number;
  readonly lastRunAt?: DecisionIntelligenceTimestamp;
  readonly lastCompletedRunAt?: DecisionIntelligenceTimestamp;
  readonly lastDecision?: DecisionIntelligenceDecision;
  readonly lastPlanId?: DecisionIntelligenceId;
}

export interface DecisionContextAssessorPort {
  assess(request: DecisionIntelligenceRunRequest): DecisionContextAssessment;
}

export interface DecisionCandidateBuilderRequest {
  readonly request: DecisionIntelligenceRunRequest;
  readonly context: DecisionContextAssessment;
  readonly generatedAt: DecisionIntelligenceTimestamp;
}

export interface DecisionCandidateBuilderResult {
  readonly requestId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly candidates: readonly DecisionCandidate[];
  readonly rejectedCandidateCount: number;
  readonly warnings: readonly string[];
}

export interface DecisionCandidateBuilderPort {
  build(request: DecisionCandidateBuilderRequest): DecisionCandidateBuilderResult;
}

export interface DecisionCandidateScoringRequest {
  readonly requestId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly candidates: readonly DecisionCandidate[];
  readonly weights: DecisionCandidateScoringWeights;
  readonly minimumCandidateScore: number;
}

export interface DecisionCandidateScoringResult {
  readonly requestId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly candidates: readonly ScoredDecisionCandidate[];
  readonly eligibleCandidateIds: readonly DecisionIntelligenceId[];
  readonly rejectedCandidateIds: readonly DecisionIntelligenceId[];
  readonly warnings: readonly string[];
}

export interface DecisionCandidateScoringEnginePort {
  score(request: DecisionCandidateScoringRequest): DecisionCandidateScoringResult;
}

export interface DecisionConflictResolutionRequest {
  readonly requestId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly candidates: readonly ScoredDecisionCandidate[];
  readonly tolerance: number;
}

export interface DecisionConflictResolutionResult {
  readonly requestId: DecisionIntelligenceId;
  readonly generatedAt: DecisionIntelligenceTimestamp;
  readonly conflicts: readonly ResolvedDecisionConflict[];
  readonly remainingCandidates: readonly ScoredDecisionCandidate[];
  readonly rejectedCandidateIds: readonly DecisionIntelligenceId[];
  readonly warnings: readonly string[];
}

export interface DecisionConflictResolverPort {
  resolve(request: DecisionConflictResolutionRequest): DecisionConflictResolutionResult;
}

export interface DecisionPlanOptimizationRequest {
  readonly runId: DecisionIntelligenceId;
  readonly request: DecisionIntelligenceRunRequest;
  readonly context: DecisionContextAssessment;
  readonly candidates: readonly ScoredDecisionCandidate[];
  readonly conflicts: readonly ResolvedDecisionConflict[];
  readonly generatedAt: DecisionIntelligenceTimestamp;
}

export interface DecisionPlanOptimizerPort {
  optimize(request: DecisionPlanOptimizationRequest): DecisionExecutionPlan;
}

export interface DecisionGovernanceRequest {
  readonly request: DecisionIntelligenceRunRequest;
  readonly context: DecisionContextAssessment;
  readonly plan: DecisionExecutionPlan;
  readonly generatedAt: DecisionIntelligenceTimestamp;
}

export interface DecisionGovernanceEnginePort {
  evaluate(request: DecisionGovernanceRequest): DecisionGovernanceAssessment;
}

export interface DecisionExplainabilityRequest {
  readonly request: DecisionIntelligenceRunRequest;
  readonly context: DecisionContextAssessment;
  readonly candidates: readonly ScoredDecisionCandidate[];
  readonly plan: DecisionExecutionPlan;
  readonly governance: DecisionGovernanceAssessment;
  readonly generatedAt: DecisionIntelligenceTimestamp;
}

export interface DecisionExplainabilityEnginePort {
  explain(request: DecisionExplainabilityRequest): DecisionExplainabilityResult;
}

export interface DecisionIntelligenceValidatorPort {
  validateRequest(request: DecisionIntelligenceRunRequest): DecisionValidationResult;
  validateResult(result: DecisionIntelligenceRunResult): DecisionValidationResult;
  validatePlan(plan: DecisionExecutionPlan): DecisionValidationResult;
}

export interface DecisionPlanExecutorPort {
  execute(plan: DecisionExecutionPlan): DecisionPlanExecutionResult;
}

export interface AiDecisionIntelligenceManagerPort {
  execute(request: DecisionIntelligenceRunRequest): DecisionIntelligenceExecutionOutcome;
  snapshot(): DecisionIntelligenceManagerSnapshot;
}

export interface DecisionIntelligenceEvent {
  readonly eventId: DecisionIntelligenceId;
  readonly runId: DecisionIntelligenceId;
  readonly requestId: DecisionIntelligenceId;
  readonly portfolioId: DecisionPortfolioId;
  readonly timestamp: DecisionIntelligenceTimestamp;
  readonly type:
    | "RUN_STARTED"
    | "REQUEST_VALIDATED"
    | "CONTEXT_ASSESSED"
    | "CANDIDATES_BUILT"
    | "CANDIDATES_SCORED"
    | "CONFLICTS_RESOLVED"
    | "PLAN_OPTIMIZED"
    | "GOVERNANCE_EVALUATED"
    | "EXPLANATION_GENERATED"
    | "RUN_COMPLETED"
    | "RUN_DEFERRED"
    | "RUN_REJECTED"
    | "RUN_FAILED"
    | "PLAN_EXECUTION_STARTED"
    | "PLAN_EXECUTION_COMPLETED"
    | "PLAN_EXECUTION_FAILED";
  readonly payload: DecisionMetadata;
}

export interface DecisionIntelligenceEventPublisher {
  publish(event: DecisionIntelligenceEvent): void;
}

export interface DecisionIntelligencePersistencePort {
  saveOutcome(outcome: DecisionIntelligenceExecutionOutcome): void;
  saveSnapshot(snapshot: DecisionIntelligenceManagerSnapshot): void;
  saveExecutionResult?(result: DecisionPlanExecutionResult): void;
}

export interface DecisionIntelligenceManagerDependencies {
  readonly clock: DecisionClock;
  readonly idGenerator: DecisionIdGenerator;
  readonly validator: DecisionIntelligenceValidatorPort;
  readonly contextAssessor: DecisionContextAssessorPort;
  readonly candidateBuilder: DecisionCandidateBuilderPort;
  readonly candidateScoringEngine: DecisionCandidateScoringEnginePort;
  readonly conflictResolver: DecisionConflictResolverPort;
  readonly planOptimizer: DecisionPlanOptimizerPort;
  readonly governanceEngine: DecisionGovernanceEnginePort;
  readonly explainabilityEngine: DecisionExplainabilityEnginePort;
  readonly planExecutor?: DecisionPlanExecutorPort;
  readonly eventPublisher?: DecisionIntelligenceEventPublisher;
  readonly persistence?: DecisionIntelligencePersistencePort;
  readonly logger?: DecisionLogger;
}

export const DEFAULT_DECISION_CANDIDATE_SCORING_WEIGHTS: DecisionCandidateScoringWeights =
  Object.freeze({
    expectedReturn: 0.14,
    riskAdjustedReturn: 0.17,
    drawdownProtection: 0.11,
    diversification: 0.08,
    regimeAlignment: 0.12,
    learningValue: 0.08,
    executionQuality: 0.08,
    operationalStability: 0.07,
    confidence: 0.15,
    costPenalty: 0.1,
    riskPenalty: 0.15,
    uncertaintyPenalty: 0.1,
  });

export const DEFAULT_DECISION_OPTIMIZATION_CONSTRAINTS: DecisionOptimizationConstraints =
  Object.freeze({
    minimumStrategyWeight: 0,
    maximumStrategyWeight: 0.35,
    minimumReserveWeight: 0.05,
    maximumPortfolioTurnover: 0.25,
    maximumWeightChangePerStrategy: 0.1,
    maximumSelectedCandidates: 10,
    maximumConcurrentActions: 3,
    maximumGrossExposure: 1.5,
    maximumNetExposure: 1,
    maximumLeverage: 2,
    maximumRiskScore: 0.7,
    normalizeWeightsToOne: true,
  });

export const DEFAULT_DECISION_SAFETY_POLICY: DecisionSafetyPolicy = Object.freeze({
  enabled: true,
  dryRun: true,
  minimumDecisionConfidence: 0.7,
  minimumDataQualityScore: 0.7,
  maximumAllowedRiskIncrease: 0.05,
  maximumPortfolioTurnover: 0.25,
  maximumStrategiesChangedPerRun: 5,
  maximumCapitalReallocatedPerRun: 0.25,
  preserveAtLeastOneActiveStrategy: true,
  blockOnUnhealthyRiskEngine: true,
  blockOnUnhealthyExecutionEngine: true,
  blockOnStaleMarketContext: true,
  maximumMarketContextAgeMs: 300_000,
  rejectOnValidationWarning: false,
  requireRollbackForLiveActions: true,
  requireHumanApprovalForLiveAutonomousMode: true,
  requireHumanApprovalForPromotion: true,
  requireHumanApprovalForRetirement: true,
  requireHumanApprovalForRiskIncrease: true,
});

export const DEFAULT_DECISION_GOVERNANCE_POLICY: DecisionGovernancePolicy =
  Object.freeze({
    enabled: true,
    autonomousExecutionAllowed: false,
    defaultApprovalRequirement: "AUTOMATIC_POLICY",
    minimumAutonomousConfidence: 0.85,
    maximumAutonomousRiskIncrease: 0,
    maximumAutonomousTurnover: 0.1,
    restrictedActionTypes: Object.freeze<DecisionActionType[]>([
      "INCREASE_EXPOSURE",
      "CHANGE_EXECUTION_MODE",
      "EVOLVE_STRATEGY",
    ]),
    prohibitedActionTypes: Object.freeze<DecisionActionType[]>([]),
    humanApprovalActionTypes: Object.freeze<DecisionActionType[]>([
      "PROMOTE_STRATEGY",
      "RETIRE_STRATEGY",
    ]),
    requiredApproverRoles: Object.freeze(["RISK_MANAGER"]),
    approvalTimeoutMs: 3_600_000,
  });

export const DEFAULT_DECISION_INTELLIGENCE_CONFIGURATION: DecisionIntelligenceConfiguration =
  Object.freeze({
    executionMode: "DRY_RUN",
    explainabilityLevel: "DETAILED",
    scoringWeights: DEFAULT_DECISION_CANDIDATE_SCORING_WEIGHTS,
    optimizationConstraints: DEFAULT_DECISION_OPTIMIZATION_CONSTRAINTS,
    safetyPolicy: DEFAULT_DECISION_SAFETY_POLICY,
    governancePolicy: DEFAULT_DECISION_GOVERNANCE_POLICY,
    minimumCandidateScore: 0.55,
    conflictResolutionTolerance: 1e-9,
    evidenceFreshnessHalfLifeMs: 3_600_000,
    includeNoActionCandidate: true,
    preferStablePlans: true,
  });

export const DECISION_INTELLIGENCE_RUN_STATUSES: readonly DecisionIntelligenceRunStatus[] =
  Object.freeze([
    "CREATED",
    "VALIDATING",
    "ASSESSING_CONTEXT",
    "BUILDING_CANDIDATES",
    "SCORING_CANDIDATES",
    "RESOLVING_CONFLICTS",
    "OPTIMIZING_PLAN",
    "EVALUATING_GOVERNANCE",
    "EXPLAINING",
    "COMPLETED",
    "DEFERRED",
    "REJECTED",
    "FAILED",
  ]);

export const DECISION_CANDIDATE_TYPES: readonly DecisionCandidateType[] =
  Object.freeze([
    "ACTIVATE_STRATEGY",
    "DEACTIVATE_STRATEGY",
    "PAUSE_STRATEGY",
    "RESUME_STRATEGY",
    "REWEIGHT_STRATEGY",
    "ROTATE_STRATEGY",
    "PROMOTE_STRATEGY",
    "DEMOTE_STRATEGY",
    "RETIRE_STRATEGY",
    "EVOLVE_STRATEGY",
    "CHANGE_PARAMETERS",
    "REDUCE_EXPOSURE",
    "INCREASE_EXPOSURE",
    "HEDGE_EXPOSURE",
    "REBALANCE_PORTFOLIO",
    "CHANGE_EXECUTION_MODE",
    "CANCEL_PENDING_ACTION",
    "NO_ACTION",
  ]);

export const STRATEGY_OPERATING_MODES: readonly StrategyOperatingMode[] =
  Object.freeze([
    "DISABLED",
    "OBSERVE_ONLY",
    "SHADOW",
    "PAPER",
    "LIMITED_LIVE",
    "LIVE",
    "EMERGENCY_ONLY",
  ]);