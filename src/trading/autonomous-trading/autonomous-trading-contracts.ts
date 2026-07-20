/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 1: Autonomous trading contracts.
 *
 * Responsibilities:
 * - define autonomous strategy lifecycle contracts
 * - define orchestration commands and decisions
 * - define capital allocation and portfolio constraints
 * - define signal arbitration and consensus contracts
 * - define risk-aware trade approval contracts
 * - define adaptive position sizing contracts
 * - define recovery, monitoring, learning, and explainability contracts
 */

export type AutonomousTradingTimestamp = number;

export type AutonomousTradingMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly (string | number | boolean | null)[];

export type AutonomousTradingMetadata = Readonly<
  Record<string, AutonomousTradingMetadataValue>
>;

export const EMPTY_AUTONOMOUS_TRADING_METADATA: AutonomousTradingMetadata =
  Object.freeze({});

export type AutonomousTradingMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURES"
  | "OPTIONS";

export type AutonomousTradingTimeframe =
  | "1s"
  | "5s"
  | "15s"
  | "30s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export interface AutonomousTradingInstrument {
  readonly exchangeId: string;
  readonly symbol: string;
  readonly normalizedSymbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly marketType: AutonomousTradingMarketType;
  readonly settlementAsset?: string;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousStrategyLifecycleState =
  | "DRAFT"
  | "VALIDATING"
  | "READY"
  | "SCHEDULED"
  | "STARTING"
  | "RUNNING"
  | "PAUSING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "DEGRADED"
  | "RECOVERING"
  | "FAILED"
  | "ARCHIVED";

export type AutonomousStrategyHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export type AutonomousStrategyControlMode =
  | "MANUAL"
  | "SUPERVISED"
  | "AUTONOMOUS";

export type AutonomousStrategyPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

export interface AutonomousStrategyIdentity {
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly displayName: string;
  readonly description?: string;
  readonly ownerId?: string;
  readonly tags: readonly string[];
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategySchedule {
  readonly enabled: boolean;
  readonly startAt?: AutonomousTradingTimestamp;
  readonly stopAt?: AutonomousTradingTimestamp;
  readonly activeDaysOfWeek?: readonly number[];
  readonly activeStartMinuteUtc?: number;
  readonly activeEndMinuteUtc?: number;
  readonly maximumRuntimeMs?: number;
  readonly cooldownMs: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyUniverse {
  readonly instruments: readonly AutonomousTradingInstrument[];
  readonly timeframes: readonly AutonomousTradingTimeframe[];
  readonly includeExchanges?: readonly string[];
  readonly excludeExchanges?: readonly string[];
  readonly includeMarketTypes?: readonly AutonomousTradingMarketType[];
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyRiskLimits {
  readonly maximumGrossExposure: number;
  readonly maximumNetExposure: number;
  readonly maximumPositionNotional: number;
  readonly maximumOpenPositions: number;
  readonly maximumDailyLoss: number;
  readonly maximumDrawdown: number;
  readonly maximumLeverage: number;
  readonly maximumOrderNotional: number;
  readonly minimumLiquidityScore: number;
  readonly minimumSignalConfidence: number;
  readonly maximumSignalAgeMs: number;
  readonly maximumConsecutiveLosses: number;
  readonly stopTradingOnBreach: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyCapitalPolicy {
  readonly minimumCapital: number;
  readonly maximumCapital: number;
  readonly targetCapital: number;
  readonly minimumAllocationWeight: number;
  readonly maximumAllocationWeight: number;
  readonly rebalanceThreshold: number;
  readonly reserveRatio: number;
  readonly allowBorrowedCapital: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyConfiguration {
  readonly identity: AutonomousStrategyIdentity;
  readonly lifecycleState: AutonomousStrategyLifecycleState;
  readonly controlMode: AutonomousStrategyControlMode;
  readonly priority: AutonomousStrategyPriority;
  readonly universe: AutonomousStrategyUniverse;
  readonly schedule: AutonomousStrategySchedule;
  readonly riskLimits: AutonomousStrategyRiskLimits;
  readonly capitalPolicy: AutonomousStrategyCapitalPolicy;
  readonly enabled: boolean;
  readonly createdAt: AutonomousTradingTimestamp;
  readonly updatedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyRuntimeState {
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly lifecycleState: AutonomousStrategyLifecycleState;
  readonly healthStatus: AutonomousStrategyHealthStatus;
  readonly startedAt?: AutonomousTradingTimestamp;
  readonly stoppedAt?: AutonomousTradingTimestamp;
  readonly lastHeartbeatAt?: AutonomousTradingTimestamp;
  readonly lastDecisionAt?: AutonomousTradingTimestamp;
  readonly lastSignalAt?: AutonomousTradingTimestamp;
  readonly consecutiveFailureCount: number;
  readonly consecutiveLossCount: number;
  readonly activePositionCount: number;
  readonly allocatedCapital: number;
  readonly usedCapital: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly drawdown: number;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousStrategyLifecycleAction =
  | "REGISTER"
  | "VALIDATE"
  | "SCHEDULE"
  | "START"
  | "PAUSE"
  | "RESUME"
  | "STOP"
  | "RECOVER"
  | "FAIL"
  | "ARCHIVE";

export interface AutonomousStrategyLifecycleCommand {
  readonly commandId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly action: AutonomousStrategyLifecycleAction;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly requestedBy: string;
  readonly reason?: string;
  readonly expectedState?: AutonomousStrategyLifecycleState;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyLifecycleTransition {
  readonly transitionId: string;
  readonly commandId: string;
  readonly strategyId: string;
  readonly fromState: AutonomousStrategyLifecycleState;
  readonly toState: AutonomousStrategyLifecycleState;
  readonly action: AutonomousStrategyLifecycleAction;
  readonly accepted: boolean;
  readonly reason: string;
  readonly transitionedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousTradingSignalAction =
  | "BUY"
  | "SELL"
  | "HOLD"
  | "CLOSE"
  | "REDUCE"
  | "INCREASE";

export type AutonomousTradingSignalDirection =
  | "LONG"
  | "SHORT"
  | "FLAT";

export interface AutonomousTradingSignal {
  readonly signalId: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly instrument: AutonomousTradingInstrument;
  readonly timeframe: AutonomousTradingTimeframe;
  readonly action: AutonomousTradingSignalAction;
  readonly direction: AutonomousTradingSignalDirection;
  readonly confidence: number;
  readonly strength: number;
  readonly generatedAt: AutonomousTradingTimestamp;
  readonly expiresAt?: AutonomousTradingTimestamp;
  readonly referencePrice?: number;
  readonly targetPrice?: number;
  readonly stopPrice?: number;
  readonly takeProfitPrice?: number;
  readonly rationale: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousSignalCandidate {
  readonly candidateId: string;
  readonly signal: AutonomousTradingSignal;
  readonly strategyPriority: AutonomousStrategyPriority;
  readonly strategyHealth: AutonomousStrategyHealthStatus;
  readonly historicalReliability: number;
  readonly regimeCompatibility: number;
  readonly portfolioCompatibility: number;
  readonly riskCompatibility: number;
  readonly liquidityCompatibility: number;
  readonly latencyPenalty: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousSignalArbitrationWeights {
  readonly confidence: number;
  readonly strength: number;
  readonly strategyPriority: number;
  readonly strategyHealth: number;
  readonly historicalReliability: number;
  readonly regimeCompatibility: number;
  readonly portfolioCompatibility: number;
  readonly riskCompatibility: number;
  readonly liquidityCompatibility: number;
  readonly latencyPenalty: number;
}

export interface AutonomousSignalArbitrationRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly instrument: AutonomousTradingInstrument;
  readonly candidates: readonly AutonomousSignalCandidate[];
  readonly weights: AutonomousSignalArbitrationWeights;
  readonly minimumWinningScore: number;
  readonly minimumScoreSeparation: number;
  readonly maximumCandidateAgeMs: number;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousSignalCandidateScore {
  readonly candidateId: string;
  readonly signalId: string;
  readonly strategyId: string;
  readonly rawScore: number;
  readonly normalizedScore: number;
  readonly accepted: boolean;
  readonly rejectionReasons: readonly string[];
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousSignalArbitrationOutcome =
  | "SELECTED"
  | "NO_ELIGIBLE_SIGNAL"
  | "CONFLICT"
  | "INSUFFICIENT_SEPARATION"
  | "BELOW_THRESHOLD";

export interface AutonomousSignalArbitrationDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly instrument: AutonomousTradingInstrument;
  readonly outcome: AutonomousSignalArbitrationOutcome;
  readonly selectedSignal?: AutonomousTradingSignal;
  readonly candidateScores: readonly AutonomousSignalCandidateScore[];
  readonly reason: string;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousConsensusPolicy =
  | "WEIGHTED_MAJORITY"
  | "UNANIMOUS"
  | "QUORUM"
  | "HIGHEST_CONFIDENCE"
  | "RISK_ADJUSTED";

export interface AutonomousConsensusParticipant {
  readonly participantId: string;
  readonly participantType:
    | "STRATEGY"
    | "MODEL"
    | "RISK_ENGINE"
    | "PORTFOLIO_ENGINE"
    | "REGIME_ENGINE";
  readonly vote: "APPROVE" | "REJECT" | "ABSTAIN";
  readonly confidence: number;
  readonly weight: number;
  readonly rationale: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousConsensusRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly signal: AutonomousTradingSignal;
  readonly policy: AutonomousConsensusPolicy;
  readonly participants: readonly AutonomousConsensusParticipant[];
  readonly requiredApprovalRatio: number;
  readonly requiredQuorum: number;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousConsensusDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly approved: boolean;
  readonly approvalRatio: number;
  readonly participationRatio: number;
  readonly weightedApprovalScore: number;
  readonly weightedRejectionScore: number;
  readonly reason: string;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly participants: readonly AutonomousConsensusParticipant[];
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPortfolioSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly totalEquity: number;
  readonly availableCapital: number;
  readonly reservedCapital: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly drawdown: number;
  readonly openPositionCount: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyPerformanceSnapshot {
  readonly strategyId: string;
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly totalReturn: number;
  readonly annualizedReturn?: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly volatility: number;
  readonly downsideVolatility: number;
  readonly sharpeRatio: number;
  readonly sortinoRatio: number;
  readonly maximumDrawdown: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly tradeCount: number;
  readonly averageTradeDurationMs: number;
  readonly recentPerformanceScore: number;
  readonly stabilityScore: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousCapitalAllocationCandidate {
  readonly strategyId: string;
  readonly requestedCapital: number;
  readonly minimumCapital: number;
  readonly maximumCapital: number;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  readonly priority: AutonomousStrategyPriority;
  readonly lifecycleState: AutonomousStrategyLifecycleState;
  readonly healthStatus: AutonomousStrategyHealthStatus;
  readonly riskScore: number;
  readonly performance: AutonomousStrategyPerformanceSnapshot;
  readonly currentAllocation: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousCapitalAllocationConstraints {
  readonly totalCapital: number;
  readonly reserveCapital: number;
  readonly maximumAllocatedCapital: number;
  readonly maximumStrategyConcentration: number;
  readonly maximumCorrelatedExposure: number;
  readonly minimumCashBuffer: number;
  readonly allowPartialAllocation: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousCapitalAllocationRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly candidates: readonly AutonomousCapitalAllocationCandidate[];
  readonly constraints: AutonomousCapitalAllocationConstraints;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyAllocation {
  readonly strategyId: string;
  readonly requestedCapital: number;
  readonly allocatedCapital: number;
  readonly allocationWeight: number;
  readonly previousAllocation: number;
  readonly allocationChange: number;
  readonly approved: boolean;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousCapitalAllocationDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly allocations: readonly AutonomousStrategyAllocation[];
  readonly totalAllocatedCapital: number;
  readonly reserveCapital: number;
  readonly unallocatedCapital: number;
  readonly concentration: number;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRiskContext {
  readonly portfolio: AutonomousPortfolioSnapshot;
  readonly strategy: AutonomousStrategyRuntimeState;
  readonly strategyLimits: AutonomousStrategyRiskLimits;
  readonly currentPositionNotional: number;
  readonly projectedPositionNotional: number;
  readonly currentInstrumentExposure: number;
  readonly projectedInstrumentExposure: number;
  readonly estimatedOrderNotional: number;
  readonly estimatedLeverage: number;
  readonly estimatedSlippageBps: number;
  readonly liquidityScore: number;
  readonly marketVolatility: number;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousTradeApprovalStatus =
  | "APPROVED"
  | "REJECTED"
  | "REDUCED"
  | "DEFERRED";

export interface AutonomousTradeApprovalRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly signal: AutonomousTradingSignal;
  readonly consensus: AutonomousConsensusDecision;
  readonly riskContext: AutonomousRiskContext;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousTradeApprovalDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly status: AutonomousTradeApprovalStatus;
  readonly approvedNotional: number;
  readonly maximumPermittedNotional: number;
  readonly requiredRiskReduction?: number;
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
  readonly reason: string;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousPositionSizingMethod =
  | "FIXED_NOTIONAL"
  | "FIXED_FRACTION"
  | "VOLATILITY_TARGET"
  | "RISK_PARITY"
  | "KELLY_FRACTION"
  | "CONFIDENCE_WEIGHTED"
  | "DRAWDOWN_ADJUSTED"
  | "HYBRID";

export interface AutonomousPositionSizingConstraints {
  readonly minimumNotional: number;
  readonly maximumNotional: number;
  readonly maximumPortfolioFraction: number;
  readonly maximumRiskPerTrade: number;
  readonly maximumLeverage: number;
  readonly lotSize: number;
  readonly quantityStep: number;
  readonly minimumQuantity: number;
  readonly maximumQuantity: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPositionSizingRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly signal: AutonomousTradingSignal;
  readonly approval: AutonomousTradeApprovalDecision;
  readonly method: AutonomousPositionSizingMethod;
  readonly portfolioEquity: number;
  readonly availableCapital: number;
  readonly allocatedStrategyCapital: number;
  readonly currentPrice: number;
  readonly stopPrice?: number;
  readonly volatility: number;
  readonly confidence: number;
  readonly historicalWinRate: number;
  readonly historicalPayoffRatio: number;
  readonly drawdown: number;
  readonly constraints: AutonomousPositionSizingConstraints;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPositionSizingDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: AutonomousPositionSizingMethod;
  readonly quantity: number;
  readonly notional: number;
  readonly capitalFraction: number;
  readonly estimatedRiskAmount: number;
  readonly estimatedRiskFraction: number;
  readonly leverage: number;
  readonly confidenceAdjustment: number;
  readonly volatilityAdjustment: number;
  readonly drawdownAdjustment: number;
  readonly constrained: boolean;
  readonly constraintsApplied: readonly string[];
  readonly reason: string;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousOrderIntentType =
  | "OPEN"
  | "CLOSE"
  | "INCREASE"
  | "REDUCE"
  | "REVERSE";

export type AutonomousOrderSide = "BUY" | "SELL";

export type AutonomousOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT";

export type AutonomousTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "POST_ONLY";

export interface AutonomousOrderIntent {
  readonly intentId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly signalId: string;
  readonly instrument: AutonomousTradingInstrument;
  readonly intentType: AutonomousOrderIntentType;
  readonly side: AutonomousOrderSide;
  readonly orderType: AutonomousOrderType;
  readonly timeInForce: AutonomousTimeInForce;
  readonly quantity: number;
  readonly notional: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly createdAt: AutonomousTradingTimestamp;
  readonly expiresAt?: AutonomousTradingTimestamp;
  readonly rationale: string;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousOrchestrationStage =
  | "RECEIVED"
  | "VALIDATED"
  | "ARBITRATED"
  | "CONSENSUS"
  | "RISK_APPROVED"
  | "SIZED"
  | "ORDER_INTENT_CREATED"
  | "SUBMITTED"
  | "REJECTED"
  | "FAILED";

export interface AutonomousOrchestrationRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly signals: readonly AutonomousTradingSignal[];
  readonly portfolio: AutonomousPortfolioSnapshot;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousOrchestrationResult {
  readonly orchestrationId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly stage: AutonomousOrchestrationStage;
  readonly arbitration?: AutonomousSignalArbitrationDecision;
  readonly consensus?: AutonomousConsensusDecision;
  readonly approval?: AutonomousTradeApprovalDecision;
  readonly sizing?: AutonomousPositionSizingDecision;
  readonly orderIntent?: AutonomousOrderIntent;
  readonly reason: string;
  readonly startedAt: AutonomousTradingTimestamp;
  readonly completedAt: AutonomousTradingTimestamp;
  readonly latencyMs: number;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousRecoveryTrigger =
  | "HEARTBEAT_TIMEOUT"
  | "PROVIDER_FAILURE"
  | "EXCHANGE_FAILURE"
  | "EXECUTION_FAILURE"
  | "RISK_BREACH"
  | "DATA_STALENESS"
  | "MODEL_FAILURE"
  | "MANUAL";

export type AutonomousRecoveryAction =
  | "RETRY"
  | "RESTART_STRATEGY"
  | "SWITCH_PROVIDER"
  | "SWITCH_EXCHANGE"
  | "PAUSE_STRATEGY"
  | "STOP_STRATEGY"
  | "REDUCE_EXPOSURE"
  | "CLOSE_POSITIONS"
  | "ESCALATE";

export interface AutonomousRecoveryPolicy {
  readonly maximumRetryAttempts: number;
  readonly initialBackoffMs: number;
  readonly maximumBackoffMs: number;
  readonly backoffMultiplier: number;
  readonly heartbeatTimeoutMs: number;
  readonly recoveryTimeoutMs: number;
  readonly failClosed: boolean;
  readonly actions: readonly AutonomousRecoveryAction[];
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly trigger: AutonomousRecoveryTrigger;
  readonly failureCode: string;
  readonly failureMessage: string;
  readonly attempt: number;
  readonly policy: AutonomousRecoveryPolicy;
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly selectedAction: AutonomousRecoveryAction;
  readonly shouldRetry: boolean;
  readonly nextRetryAt?: AutonomousTradingTimestamp;
  readonly terminal: boolean;
  readonly reason: string;
  readonly decidedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousPerformanceAlertSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export interface AutonomousPerformanceAlert {
  readonly alertId: string;
  readonly strategyId: string;
  readonly severity: AutonomousPerformanceAlertSeverity;
  readonly code: string;
  readonly message: string;
  readonly observedValue?: number;
  readonly thresholdValue?: number;
  readonly createdAt: AutonomousTradingTimestamp;
  readonly acknowledged: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPerformanceMonitoringSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly portfolio: AutonomousPortfolioSnapshot;
  readonly strategyPerformance: readonly AutonomousStrategyPerformanceSnapshot[];
  readonly alerts: readonly AutonomousPerformanceAlert[];
  readonly healthyStrategyCount: number;
  readonly degradedStrategyCount: number;
  readonly unhealthyStrategyCount: number;
  readonly runningStrategyCount: number;
  readonly pausedStrategyCount: number;
  readonly failedStrategyCount: number;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousLearningEventType =
  | "SIGNAL_OUTCOME"
  | "TRADE_OUTCOME"
  | "MODEL_DRIFT"
  | "REGIME_CHANGE"
  | "RISK_BREACH"
  | "STRATEGY_DEGRADATION"
  | "ALLOCATION_CHANGE"
  | "MANUAL_FEEDBACK";

export interface AutonomousLearningEvent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly strategyId?: string;
  readonly modelId?: string;
  readonly eventType: AutonomousLearningEventType;
  readonly occurredAt: AutonomousTradingTimestamp;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly labels: readonly string[];
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningHook {
  readonly hookId: string;
  readonly eventTypes: readonly AutonomousLearningEventType[];
  readonly enabled: boolean;
  readonly process: (
    event: AutonomousLearningEvent,
  ) => Promise<void> | void;
  readonly metadata: AutonomousTradingMetadata;
}

export type AutonomousDecisionExplanationType =
  | "SIGNAL"
  | "ARBITRATION"
  | "CONSENSUS"
  | "RISK"
  | "POSITION_SIZING"
  | "CAPITAL_ALLOCATION"
  | "RECOVERY"
  | "ORDER_INTENT"
  | "ORCHESTRATION";

export interface AutonomousDecisionFactor {
  readonly factorId: string;
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly weight?: number;
  readonly contribution?: number;
  readonly description?: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousDecisionExplanation {
  readonly explanationId: string;
  readonly correlationId: string;
  readonly decisionId: string;
  readonly decisionType: AutonomousDecisionExplanationType;
  readonly summary: string;
  readonly rationale: readonly string[];
  readonly factors: readonly AutonomousDecisionFactor[];
  readonly warnings: readonly string[];
  readonly createdAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousAuditRecord {
  readonly recordId: string;
  readonly correlationId: string;
  readonly entityType:
    | "STRATEGY"
    | "SIGNAL"
    | "DECISION"
    | "ORDER_INTENT"
    | "RECOVERY"
    | "ALLOCATION";
  readonly entityId: string;
  readonly action: string;
  readonly actor: string;
  readonly occurredAt: AutonomousTradingTimestamp;
  readonly previousState?: Readonly<Record<string, unknown>>;
  readonly currentState?: Readonly<Record<string, unknown>>;
  readonly explanation?: AutonomousDecisionExplanation;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousTradingEngineMetrics {
  readonly orchestrationRequestCount: number;
  readonly completedOrchestrationCount: number;
  readonly rejectedOrchestrationCount: number;
  readonly failedOrchestrationCount: number;
  readonly generatedOrderIntentCount: number;
  readonly lifecycleTransitionCount: number;
  readonly recoveryAttemptCount: number;
  readonly successfulRecoveryCount: number;
  readonly activeStrategyCount: number;
  readonly averageOrchestrationLatencyMs: number;
  readonly maximumOrchestrationLatencyMs: number;
}

export interface AutonomousTradingEngineSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly strategies: readonly AutonomousStrategyConfiguration[];
  readonly runtimeStates: readonly AutonomousStrategyRuntimeState[];
  readonly allocations: readonly AutonomousStrategyAllocation[];
  readonly recentOrchestrations: readonly AutonomousOrchestrationResult[];
  readonly recentRecoveries: readonly AutonomousRecoveryDecision[];
  readonly performance: AutonomousPerformanceMonitoringSnapshot;
  readonly metrics: AutonomousTradingEngineMetrics;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousTradingClock {
  now(): AutonomousTradingTimestamp;
}

export interface AutonomousTradingIdFactory {
  create(
    prefix: string,
    timestamp: AutonomousTradingTimestamp,
    sequence: number,
  ): string;
}