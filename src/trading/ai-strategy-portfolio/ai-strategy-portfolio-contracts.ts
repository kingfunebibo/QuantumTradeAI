/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/ai-strategy-portfolio-contracts.ts
 *
 * Purpose:
 * Defines the immutable contracts used to score, rank, diversify, select,
 * allocate, rotate, ensemble, explain, and autonomously manage portfolios of
 * deterministic, arbitrage, AI-assisted, and AI-native trading strategies.
 */

import type {
  StrategyCapability,
  StrategyConfiguration,
  StrategyEnvironment,
  StrategyId,
  StrategyInstanceId,
  StrategyManifest,
  StrategyMarketType,
  StrategyMetadata,
  StrategyPerformanceSnapshot,
  StrategyRiskSnapshot,
  StrategyTradingMode,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

/* ========================================================================== *
 * Primitive aliases
 * ========================================================================== */

export type AiStrategyPortfolioId = string;
export type AiStrategyPortfolioRunId = string;
export type AiStrategyPortfolioDecisionId = string;
export type AiStrategyPortfolioCorrelationId = string;
export type AiStrategyCandidateId = string;
export type AiStrategyScoreId = string;
export type AiStrategyRankingId = string;
export type AiStrategyAllocationId = string;
export type AiStrategyRotationId = string;
export type AiStrategyEnsembleId = string;
export type AiStrategyExplanationId = string;
export type AiStrategyRegimeId = string;
export type AiStrategyRiskBudgetId = string;
export type AiStrategyAttributionId = string;
export type AiStrategyModelId = string;
export type AiStrategyProviderId = string;

/* ========================================================================== *
 * Constants
 * ========================================================================== */

export const AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM = 0;
export const AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM = 1;
export const AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM = 0;
export const AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM = 1;
export const AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM = 0;
export const AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM = 1;
export const AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM = -1;
export const AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM = 1;
export const AI_STRATEGY_PORTFOLIO_BASIS_POINTS_PER_UNIT = 10_000;

/* ========================================================================== *
 * Core enumerations
 * ========================================================================== */

export type AiStrategyPortfolioOperatingMode =
  | "MANUAL"
  | "RULE_BASED_ONLY"
  | "AI_ADVISORY"
  | "SEMI_AUTONOMOUS"
  | "FULLY_AUTONOMOUS";

export type AiStrategyFamily =
  | "TREND_FOLLOWING"
  | "MOMENTUM"
  | "MEAN_REVERSION"
  | "BREAKOUT"
  | "VOLUME_BASED"
  | "GRID_TRADING"
  | "MARKET_MAKING"
  | "STATISTICAL_ARBITRAGE"
  | "CROSS_EXCHANGE_ARBITRAGE"
  | "TRIANGULAR_ARBITRAGE"
  | "FUNDING_RATE_ARBITRAGE"
  | "CASH_AND_CARRY"
  | "STABLECOIN_ARBITRAGE"
  | "CROSS_DEX_ARBITRAGE"
  | "CROSS_CHAIN_ARBITRAGE"
  | "OPTIONS_AND_DERIVATIVES"
  | "EXECUTION_ALGORITHM"
  | "AI_NATIVE"
  | "COMPOSITE"
  | "CUSTOM";

export type AiStrategyIntelligenceType =
  | "DETERMINISTIC_RULE_BASED"
  | "DETERMINISTIC_ARBITRAGE"
  | "AI_ASSISTED"
  | "AI_NATIVE"
  | "HYBRID";

export type AiStrategyAutomationLevel =
  | "MANUAL"
  | "SIGNAL_BASED"
  | "SEMI_AUTOMATED"
  | "FULLY_AUTOMATED";

export type AiStrategyCandidateStatus =
  | "DISCOVERED"
  | "ELIGIBLE"
  | "INELIGIBLE"
  | "SELECTED"
  | "RESERVE"
  | "SUSPENDED"
  | "DISABLED";

export type AiStrategyLifecycleAction =
  | "NO_CHANGE"
  | "ENABLE"
  | "START"
  | "PAUSE"
  | "RESUME"
  | "STOP"
  | "DISABLE"
  | "QUARANTINE";

export type AiStrategyScoreDimension =
  | "RETURN"
  | "RISK_ADJUSTED_RETURN"
  | "DRAWDOWN"
  | "CONSISTENCY"
  | "WIN_RATE"
  | "PROFIT_FACTOR"
  | "CAPACITY"
  | "LIQUIDITY_FIT"
  | "REGIME_FIT"
  | "DIVERSIFICATION"
  | "EXECUTION_QUALITY"
  | "ROBUSTNESS"
  | "RECENCY"
  | "CONFIDENCE"
  | "OPERATIONAL_HEALTH";

export type AiStrategyRankingMethod =
  | "WEIGHTED_SCORE"
  | "PARETO_FRONTIER"
  | "RISK_ADJUSTED"
  | "REGIME_WEIGHTED"
  | "ENSEMBLE_CONSENSUS"
  | "HYBRID";

export type AiStrategyAllocationMethod =
  | "EQUAL_WEIGHT"
  | "SCORE_PROPORTIONAL"
  | "RISK_PARITY"
  | "VOLATILITY_TARGET"
  | "MAXIMUM_DIVERSIFICATION"
  | "REGIME_WEIGHTED"
  | "CONSTRAINED_OPTIMIZATION"
  | "HYBRID";

export type AiStrategyRotationReason =
  | "REGIME_CHANGE"
  | "PERFORMANCE_DECAY"
  | "RISK_LIMIT"
  | "DRAWDOWN_LIMIT"
  | "CORRELATION_SPIKE"
  | "CAPACITY_LIMIT"
  | "OPERATIONAL_FAILURE"
  | "MODEL_CONFIDENCE_CHANGE"
  | "SCHEDULED_REBALANCE"
  | "MANUAL_OVERRIDE"
  | "NEW_STRATEGY_PROMOTION";

export type AiStrategyMarketRegime =
  | "STRONG_BULL_TREND"
  | "WEAK_BULL_TREND"
  | "STRONG_BEAR_TREND"
  | "WEAK_BEAR_TREND"
  | "SIDEWAYS_LOW_VOLATILITY"
  | "SIDEWAYS_HIGH_VOLATILITY"
  | "BREAKOUT_EXPANSION"
  | "MEAN_REVERTING"
  | "LIQUIDITY_STRESSED"
  | "FUNDING_DISLOCATION"
  | "BASIS_DISLOCATION"
  | "EVENT_DRIVEN"
  | "UNKNOWN";

export type AiStrategyRiskLevel =
  | "VERY_LOW"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH";

export type AiStrategyDecisionStatus =
  | "PROPOSED"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "DEFERRED"
  | "EXECUTED"
  | "FAILED";

export type AiStrategyExplanationSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type AiStrategyValidationSeverity =
  | "ERROR"
  | "WARNING";

/* ========================================================================== *
 * Strategy identity and classification
 * ========================================================================== */

export interface AiStrategyIdentity {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly strategyVersion: StrategyVersion;
}

export interface AiStrategyClassification {
  readonly family: AiStrategyFamily;
  readonly intelligenceType: AiStrategyIntelligenceType;
  readonly automationLevel: AiStrategyAutomationLevel;
  readonly riskLevel: AiStrategyRiskLevel;
  readonly tags: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyCompatibilityProfile {
  readonly supportedEnvironments: readonly StrategyEnvironment[];
  readonly supportedTradingModes: readonly StrategyTradingMode[];
  readonly supportedMarketTypes: readonly StrategyMarketType[];
  readonly requiredCapabilities: readonly StrategyCapability[];
  readonly supportedRegimes: readonly AiStrategyMarketRegime[];
  readonly excludedRegimes: readonly AiStrategyMarketRegime[];
  readonly minimumCapital?: number;
  readonly maximumCapital?: number;
  readonly minimumEvaluationHistory?: number;
  readonly maximumConcurrentInstances?: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyCandidate {
  readonly identity: AiStrategyIdentity;
  readonly manifest: StrategyManifest;
  readonly configuration: StrategyConfiguration;
  readonly classification: AiStrategyClassification;
  readonly compatibility: AiStrategyCompatibilityProfile;
  readonly performance: StrategyPerformanceSnapshot;
  readonly status: AiStrategyCandidateStatus;
  readonly discoveredAt: UnixTimestampMilliseconds;
  readonly lastEvaluatedAt?: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Market regime contracts
 * ========================================================================== */

export interface AiStrategyRegimeProbability {
  readonly regime: AiStrategyMarketRegime;
  readonly probability: number;
}

export interface AiStrategyRegimeSnapshot {
  readonly regimeId: AiStrategyRegimeId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly primaryRegime: AiStrategyMarketRegime;
  readonly confidence: number;
  readonly probabilities: readonly AiStrategyRegimeProbability[];
  readonly volatilityScore: number;
  readonly trendScore: number;
  readonly liquidityScore: number;
  readonly stressScore: number;
  readonly expectedDurationMilliseconds?: number;
  readonly source: string;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRegimeFitness {
  readonly candidateId: AiStrategyCandidateId;
  readonly regime: AiStrategyMarketRegime;
  readonly fitnessScore: number;
  readonly confidence: number;
  readonly historicalSampleSize: number;
  readonly expectedReturn?: number;
  readonly expectedVolatility?: number;
  readonly expectedDrawdown?: number;
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Scoring contracts
 * ========================================================================== */

export interface AiStrategyScoreWeight {
  readonly dimension: AiStrategyScoreDimension;
  readonly weight: number;
  readonly enabled: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyScoreComponent {
  readonly dimension: AiStrategyScoreDimension;
  readonly rawValue?: number;
  readonly normalizedScore: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly confidence: number;
  readonly explanation: string;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyScorePolicy {
  readonly weights: readonly AiStrategyScoreWeight[];
  readonly minimumCompositeScore: number;
  readonly minimumConfidence: number;
  readonly minimumTradeCount?: number;
  readonly maximumDrawdown?: number;
  readonly minimumProfitFactor?: number;
  readonly minimumSharpeRatio?: number;
  readonly requirePositiveRealizedPnl: boolean;
  readonly penalizeMissingMetrics: boolean;
  readonly missingMetricPenalty: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyScore {
  readonly scoreId: AiStrategyScoreId;
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly compositeScore: number;
  readonly confidence: number;
  readonly eligible: boolean;
  readonly components: readonly AiStrategyScoreComponent[];
  readonly rejectionReasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyScoreRequest {
  readonly runId: AiStrategyPortfolioRunId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly candidates: readonly AiStrategyCandidate[];
  readonly regime: AiStrategyRegimeSnapshot;
  readonly risk: StrategyRiskSnapshot;
  readonly policy: AiStrategyScorePolicy;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyScoreResult {
  readonly runId: AiStrategyPortfolioRunId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly scores: readonly AiStrategyScore[];
  readonly eligibleCandidateIds: readonly AiStrategyCandidateId[];
  readonly rejectedCandidateIds: readonly AiStrategyCandidateId[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Ranking contracts
 * ========================================================================== */

export interface AiStrategyRankingEntry {
  readonly rank: number;
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly compositeScore: number;
  readonly adjustedScore: number;
  readonly confidence: number;
  readonly selected: boolean;
  readonly reserve: boolean;
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRankingPolicy {
  readonly method: AiStrategyRankingMethod;
  readonly maximumSelectedStrategies: number;
  readonly maximumReserveStrategies: number;
  readonly minimumAdjustedScore: number;
  readonly minimumConfidence: number;
  readonly preferDeterministicFallbacks: boolean;
  readonly requireFamilyDiversification: boolean;
  readonly maximumStrategiesPerFamily?: number;
  readonly tieBreakerDimensions: readonly AiStrategyScoreDimension[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRankingResult {
  readonly rankingId: AiStrategyRankingId;
  readonly runId: AiStrategyPortfolioRunId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly method: AiStrategyRankingMethod;
  readonly entries: readonly AiStrategyRankingEntry[];
  readonly selectedCandidateIds: readonly AiStrategyCandidateId[];
  readonly reserveCandidateIds: readonly AiStrategyCandidateId[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Diversification and correlation contracts
 * ========================================================================== */

export interface AiStrategyReturnObservation {
  readonly candidateId: AiStrategyCandidateId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly returnValue: number;
}

export interface AiStrategyPairCorrelation {
  readonly leftCandidateId: AiStrategyCandidateId;
  readonly rightCandidateId: AiStrategyCandidateId;
  readonly correlation: number;
  readonly sampleSize: number;
  readonly confidence: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyCorrelationMatrix {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly candidateIds: readonly AiStrategyCandidateId[];
  readonly values: readonly (readonly number[])[];
  readonly pairs: readonly AiStrategyPairCorrelation[];
  readonly lookbackObservations: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyDiversificationPolicy {
  readonly maximumPairwiseCorrelation: number;
  readonly maximumAverageCorrelation: number;
  readonly minimumFamilyCount: number;
  readonly maximumFamilyWeight: number;
  readonly minimumIntelligenceTypeCount: number;
  readonly requireDeterministicFallback: boolean;
  readonly correlationPenaltyWeight: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyDiversificationAssessment {
  readonly candidateId: AiStrategyCandidateId;
  readonly diversificationScore: number;
  readonly averageCorrelation: number;
  readonly maximumCorrelation: number;
  readonly compatible: boolean;
  readonly conflictsWith: readonly AiStrategyCandidateId[];
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyDiversificationResult {
  readonly timestamp: UnixTimestampMilliseconds;
  readonly selectedCandidateIds: readonly AiStrategyCandidateId[];
  readonly excludedCandidateIds: readonly AiStrategyCandidateId[];
  readonly assessments: readonly AiStrategyDiversificationAssessment[];
  readonly portfolioDiversificationScore: number;
  readonly averagePairwiseCorrelation: number;
  readonly familyCount: number;
  readonly intelligenceTypeCount: number;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Risk-budget contracts
 * ========================================================================== */

export interface AiStrategyRiskBudgetConstraint {
  readonly maximumStrategyWeight: number;
  readonly maximumFamilyWeight: number;
  readonly maximumIntelligenceTypeWeight: number;
  readonly maximumHighRiskWeight: number;
  readonly minimumCashReserveWeight: number;
  readonly maximumPortfolioDrawdown?: number;
  readonly volatilityTarget?: number;
  readonly maximumTurnover?: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRiskBudget {
  readonly riskBudgetId: AiStrategyRiskBudgetId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly totalCapital: number;
  readonly deployableCapital: number;
  readonly reservedCapital: number;
  readonly constraints: AiStrategyRiskBudgetConstraint;
  readonly risk: StrategyRiskSnapshot;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRiskContribution {
  readonly candidateId: AiStrategyCandidateId;
  readonly allocatedWeight: number;
  readonly marginalRiskContribution: number;
  readonly totalRiskContribution: number;
  readonly volatilityContribution?: number;
  readonly drawdownContribution?: number;
  readonly concentrationContribution?: number;
  readonly withinBudget: boolean;
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Capital-allocation contracts
 * ========================================================================== */

export interface AiStrategyAllocationConstraint {
  readonly candidateId: AiStrategyCandidateId;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly minimumCapital?: number;
  readonly maximumCapital?: number;
  readonly lockedWeight?: number;
  readonly enabled: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyAllocationPolicy {
  readonly method: AiStrategyAllocationMethod;
  readonly fullyInvested: boolean;
  readonly allowCashReserve: boolean;
  readonly rebalanceThresholdBps: number;
  readonly minimumAllocationWeight: number;
  readonly maximumAllocationWeight: number;
  readonly scoreExponent: number;
  readonly confidenceWeight: number;
  readonly regimeFitnessWeight: number;
  readonly diversificationWeight: number;
  readonly turnoverPenaltyWeight: number;
  readonly constraints: readonly AiStrategyAllocationConstraint[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyCurrentAllocation {
  readonly candidateId: AiStrategyCandidateId;
  readonly weight: number;
  readonly capital: number;
  readonly active: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyTargetAllocation {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly targetWeight: number;
  readonly targetCapital: number;
  readonly currentWeight: number;
  readonly currentCapital: number;
  readonly weightChange: number;
  readonly capitalChange: number;
  readonly score: number;
  readonly confidence: number;
  readonly riskContribution?: number;
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyAllocationRequest {
  readonly allocationId: AiStrategyAllocationId;
  readonly runId: AiStrategyPortfolioRunId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly totalCapital: number;
  readonly candidates: readonly AiStrategyCandidate[];
  readonly scores: readonly AiStrategyScore[];
  readonly ranking: AiStrategyRankingResult;
  readonly diversification: AiStrategyDiversificationResult;
  readonly regimeFitness: readonly AiStrategyRegimeFitness[];
  readonly currentAllocations: readonly AiStrategyCurrentAllocation[];
  readonly riskBudget: AiStrategyRiskBudget;
  readonly policy: AiStrategyAllocationPolicy;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyAllocationResult {
  readonly allocationId: AiStrategyAllocationId;
  readonly runId: AiStrategyPortfolioRunId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly method: AiStrategyAllocationMethod;
  readonly allocations: readonly AiStrategyTargetAllocation[];
  readonly cashReserveWeight: number;
  readonly cashReserveCapital: number;
  readonly totalAllocatedWeight: number;
  readonly totalAllocatedCapital: number;
  readonly expectedTurnover: number;
  readonly expectedPortfolioVolatility?: number;
  readonly expectedPortfolioDrawdown?: number;
  readonly riskContributions: readonly AiStrategyRiskContribution[];
  readonly warnings: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Rotation contracts
 * ========================================================================== */

export interface AiStrategyRotationInstruction {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly action: AiStrategyLifecycleAction;
  readonly fromWeight: number;
  readonly toWeight: number;
  readonly capitalDelta: number;
  readonly priority: number;
  readonly reason: AiStrategyRotationReason;
  readonly explanation: string;
  readonly effectiveAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRotationPolicy {
  readonly minimumTimeBetweenRotationsMilliseconds: number;
  readonly minimumWeightChangeBps: number;
  readonly maximumRotationTurnover: number;
  readonly maximumInstructionsPerRun: number;
  readonly allowImmediateRiskReduction: boolean;
  readonly requireConfirmationForNewStrategies: boolean;
  readonly preserveDeterministicFallback: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyRotationPlan {
  readonly rotationId: AiStrategyRotationId;
  readonly runId: AiStrategyPortfolioRunId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly createdAt: UnixTimestampMilliseconds;
  readonly effectiveAt: UnixTimestampMilliseconds;
  readonly reason: AiStrategyRotationReason;
  readonly instructions: readonly AiStrategyRotationInstruction[];
  readonly expectedTurnover: number;
  readonly requiresApproval: boolean;
  readonly warnings: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Ensemble contracts
 * ========================================================================== */

export type AiStrategyEnsembleVotingMethod =
  | "WEIGHTED_MAJORITY"
  | "CONFIDENCE_WEIGHTED"
  | "RISK_ADJUSTED"
  | "STACKED_MODEL"
  | "UNANIMOUS"
  | "CUSTOM";

export interface AiStrategyEnsembleMember {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly weight: number;
  readonly votingPower: number;
  readonly priority: number;
  readonly enabled: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyEnsembleDefinition {
  readonly ensembleId: AiStrategyEnsembleId;
  readonly name: string;
  readonly votingMethod: AiStrategyEnsembleVotingMethod;
  readonly members: readonly AiStrategyEnsembleMember[];
  readonly minimumParticipationWeight: number;
  readonly minimumConsensus: number;
  readonly conflictResultsInHold: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyEnsembleAssessment {
  readonly ensembleId: AiStrategyEnsembleId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly diversificationScore: number;
  readonly expectedConfidence: number;
  readonly expectedVolatility?: number;
  readonly expectedDrawdown?: number;
  readonly averageCorrelation: number;
  readonly regimeFitness: number;
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Performance attribution contracts
 * ========================================================================== */

export interface AiStrategyPerformanceAttributionEntry {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly allocatedWeight: number;
  readonly grossPnl: number;
  readonly fees: number;
  readonly netPnl: number;
  readonly returnContribution: number;
  readonly riskContribution: number;
  readonly drawdownContribution: number;
  readonly turnoverContribution: number;
  readonly attributionConfidence: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPerformanceAttribution {
  readonly attributionId: AiStrategyAttributionId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly periodStart: UnixTimestampMilliseconds;
  readonly periodEnd: UnixTimestampMilliseconds;
  readonly portfolioGrossPnl: number;
  readonly portfolioFees: number;
  readonly portfolioNetPnl: number;
  readonly entries: readonly AiStrategyPerformanceAttributionEntry[];
  readonly unexplainedPnl: number;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Explainability contracts
 * ========================================================================== */

export interface AiStrategyExplanationFactor {
  readonly name: string;
  readonly category: string;
  readonly contribution: number;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyExplanationWarning {
  readonly code: string;
  readonly severity: AiStrategyExplanationSeverity;
  readonly message: string;
  readonly candidateIds: readonly AiStrategyCandidateId[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPortfolioExplanation {
  readonly explanationId: AiStrategyExplanationId;
  readonly decisionId: AiStrategyPortfolioDecisionId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly createdAt: UnixTimestampMilliseconds;
  readonly summary: string;
  readonly rationale: readonly string[];
  readonly factors: readonly AiStrategyExplanationFactor[];
  readonly warnings: readonly AiStrategyExplanationWarning[];
  readonly selectedCandidateIds: readonly AiStrategyCandidateId[];
  readonly rejectedCandidateIds: readonly AiStrategyCandidateId[];
  readonly deterministicFallbackCandidateIds: readonly AiStrategyCandidateId[];
  readonly modelProviderId?: AiStrategyProviderId;
  readonly modelId?: AiStrategyModelId;
  readonly confidence: number;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Portfolio configuration and state
 * ========================================================================== */

export interface AiStrategyPortfolioSafetyPolicy {
  readonly requireRiskApproval: boolean;
  readonly prohibitAiRiskOverride: boolean;
  readonly prohibitKillSwitchOverride: boolean;
  readonly prohibitCircuitBreakerOverride: boolean;
  readonly requireDeterministicFallback: boolean;
  readonly maximumAiNativeWeight: number;
  readonly maximumAiAssistedWeight: number;
  readonly maximumNonDeterministicWeight: number;
  readonly suspendOnStalePerformance: boolean;
  readonly maximumPerformanceAgeMilliseconds: number;
  readonly suspendOnOperationalFailure: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPortfolioConfiguration {
  readonly portfolioId: AiStrategyPortfolioId;
  readonly name: string;
  readonly enabled: boolean;
  readonly environment: StrategyEnvironment;
  readonly operatingMode: AiStrategyPortfolioOperatingMode;
  readonly totalCapital: number;
  readonly reportingCurrency: string;
  readonly allowedFamilies: readonly AiStrategyFamily[];
  readonly allowedIntelligenceTypes: readonly AiStrategyIntelligenceType[];
  readonly allowedAutomationLevels: readonly AiStrategyAutomationLevel[];
  readonly allowedMarketTypes: readonly StrategyMarketType[];
  readonly scorePolicy: AiStrategyScorePolicy;
  readonly rankingPolicy: AiStrategyRankingPolicy;
  readonly diversificationPolicy: AiStrategyDiversificationPolicy;
  readonly allocationPolicy: AiStrategyAllocationPolicy;
  readonly rotationPolicy: AiStrategyRotationPolicy;
  readonly safetyPolicy: AiStrategyPortfolioSafetyPolicy;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPortfolioState {
  readonly portfolioId: AiStrategyPortfolioId;
  readonly version: number;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly activeCandidateIds: readonly AiStrategyCandidateId[];
  readonly reserveCandidateIds: readonly AiStrategyCandidateId[];
  readonly suspendedCandidateIds: readonly AiStrategyCandidateId[];
  readonly allocations: readonly AiStrategyCurrentAllocation[];
  readonly lastRunId?: AiStrategyPortfolioRunId;
  readonly lastDecisionId?: AiStrategyPortfolioDecisionId;
  readonly lastRotationAt?: UnixTimestampMilliseconds;
  readonly lastRegime?: AiStrategyMarketRegime;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Autonomous manager contracts
 * ========================================================================== */

export interface AiStrategyPortfolioRunRequest {
  readonly runId: AiStrategyPortfolioRunId;
  readonly correlationId: AiStrategyPortfolioCorrelationId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly configuration: AiStrategyPortfolioConfiguration;
  readonly state: AiStrategyPortfolioState;
  readonly candidates: readonly AiStrategyCandidate[];
  readonly regime: AiStrategyRegimeSnapshot;
  readonly risk: StrategyRiskSnapshot;
  readonly returnObservations: readonly AiStrategyReturnObservation[];
  readonly performanceAttribution?: AiStrategyPerformanceAttribution;
  readonly forceRebalance?: boolean;
  readonly dryRun?: boolean;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPortfolioDecision {
  readonly decisionId: AiStrategyPortfolioDecisionId;
  readonly runId: AiStrategyPortfolioRunId;
  readonly correlationId: AiStrategyPortfolioCorrelationId;
  readonly portfolioId: AiStrategyPortfolioId;
  readonly status: AiStrategyDecisionStatus;
  readonly operatingMode: AiStrategyPortfolioOperatingMode;
  readonly startedAt: UnixTimestampMilliseconds;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly regime: AiStrategyRegimeSnapshot;
  readonly scoring: AiStrategyScoreResult;
  readonly ranking: AiStrategyRankingResult;
  readonly correlationMatrix: AiStrategyCorrelationMatrix;
  readonly diversification: AiStrategyDiversificationResult;
  readonly allocation: AiStrategyAllocationResult;
  readonly rotationPlan: AiStrategyRotationPlan;
  readonly ensembles: readonly AiStrategyEnsembleDefinition[];
  readonly ensembleAssessments: readonly AiStrategyEnsembleAssessment[];
  readonly explanation: AiStrategyPortfolioExplanation;
  readonly nextState: AiStrategyPortfolioState;
  readonly approvalRequired: boolean;
  readonly executable: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyAutonomousManagerPolicy {
  readonly enabled: boolean;
  readonly minimumRunIntervalMilliseconds: number;
  readonly maximumRunDurationMilliseconds: number;
  readonly continueOnCandidateFailure: boolean;
  readonly continueOnExplainabilityFailure: boolean;
  readonly rejectConcurrentRuns: boolean;
  readonly maximumDecisionHistory: number;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyAutonomousManagerSnapshot {
  readonly activeRunIds: readonly AiStrategyPortfolioRunId[];
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly rejectedRuns: number;
  readonly failedRuns: number;
  readonly latestDecision?: AiStrategyPortfolioDecision;
  readonly decisionHistory: readonly AiStrategyPortfolioDecision[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Validation contracts
 * ========================================================================== */

export interface AiStrategyPortfolioValidationIssue {
  readonly severity: AiStrategyValidationSeverity;
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly candidateId?: AiStrategyCandidateId;
  readonly metadata: StrategyMetadata;
}

export interface AiStrategyPortfolioValidationReport {
  readonly valid: boolean;
  readonly validatedAt: UnixTimestampMilliseconds;
  readonly issues: readonly AiStrategyPortfolioValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Component ports
 * ========================================================================== */

export interface AiStrategyScoreEnginePort {
  score(request: AiStrategyScoreRequest): AiStrategyScoreResult;
}

export interface AiStrategyRankingEnginePort {
  rank(
    runId: AiStrategyPortfolioRunId,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    scores: readonly AiStrategyScore[],
    regimeFitness: readonly AiStrategyRegimeFitness[],
    policy: AiStrategyRankingPolicy,
  ): AiStrategyRankingResult;
}

export interface AiStrategyDiversificationEnginePort {
  analyze(
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    ranking: AiStrategyRankingResult,
    returnObservations: readonly AiStrategyReturnObservation[],
    policy: AiStrategyDiversificationPolicy,
  ): {
    readonly correlationMatrix: AiStrategyCorrelationMatrix;
    readonly diversification: AiStrategyDiversificationResult;
  };
}

export interface AiStrategyRegimeSelectorPort {
  assess(
    candidates: readonly AiStrategyCandidate[],
    regime: AiStrategyRegimeSnapshot,
    timestamp: UnixTimestampMilliseconds,
  ): readonly AiStrategyRegimeFitness[];
}

export interface AiStrategyCapitalAllocationEnginePort {
  allocate(request: AiStrategyAllocationRequest): AiStrategyAllocationResult;
}

export interface AiStrategyRotationEnginePort {
  plan(
    runId: AiStrategyPortfolioRunId,
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    allocation: AiStrategyAllocationResult,
    candidates: readonly AiStrategyCandidate[],
    policy: AiStrategyRotationPolicy,
    forceRebalance: boolean,
  ): AiStrategyRotationPlan;
}

export interface AiStrategyRiskBalancerPort {
  balance(
    allocation: AiStrategyAllocationResult,
    candidates: readonly AiStrategyCandidate[],
    correlationMatrix: AiStrategyCorrelationMatrix,
    riskBudget: AiStrategyRiskBudget,
  ): AiStrategyAllocationResult;
}

export interface AiStrategyPerformanceAttributionPort {
  attribute(
    portfolioId: AiStrategyPortfolioId,
    periodStart: UnixTimestampMilliseconds,
    periodEnd: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    allocations: readonly AiStrategyCurrentAllocation[],
  ): AiStrategyPerformanceAttribution;
}

export interface AiStrategyEnsembleManagerPort {
  build(
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    allocation: AiStrategyAllocationResult,
    correlationMatrix: AiStrategyCorrelationMatrix,
    regime: AiStrategyRegimeSnapshot,
  ): {
    readonly ensembles: readonly AiStrategyEnsembleDefinition[];
    readonly assessments: readonly AiStrategyEnsembleAssessment[];
  };
}

export interface AiStrategyPortfolioExplainabilityPort {
  explain(
    decisionId: AiStrategyPortfolioDecisionId,
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    scoring: AiStrategyScoreResult,
    ranking: AiStrategyRankingResult,
    allocation: AiStrategyAllocationResult,
    rotationPlan: AiStrategyRotationPlan,
  ): AiStrategyPortfolioExplanation;
}

export interface AiStrategyPortfolioValidatorPort {
  validateRunRequest(
    request: AiStrategyPortfolioRunRequest,
  ): AiStrategyPortfolioValidationReport;
}

export interface AiStrategyPortfolioManagerPort {
  run(
    request: AiStrategyPortfolioRunRequest,
  ): Promise<AiStrategyPortfolioDecision>;

  snapshot(): AiStrategyAutonomousManagerSnapshot;
}
