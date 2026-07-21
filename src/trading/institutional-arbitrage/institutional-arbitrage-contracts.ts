/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/institutional-arbitrage-contracts.ts
 *
 * Purpose:
 * Shared deterministic and immutable domain contracts for the Version 1
 * institutional arbitrage platform.
 *
 * Supported capabilities:
 * - Fully automated cross-exchange arbitrage
 * - Fully automated triangular arbitrage
 * - Fully automated funding-rate arbitrage
 * - Fully automated cash-and-carry arbitrage
 * - Safety-controlled stablecoin arbitrage
 * - Signal-only cross-DEX arbitrage
 * - Signal-only cross-chain arbitrage
 *
 * Explicit Version 1 exclusions:
 * - Flash-loan arbitrage
 * - MEV extraction
 * - Sandwich trading
 * - Liquidation hunting
 */

export type ArbitrageId = string;
export type ArbitrageTimestamp = number;
export type ArbitrageSequence = number;
export type ArbitrageVersion = number;
export type ArbitrageDecimal = number;
export type ArbitragePercentage = number;
export type ArbitrageBasisPoints = number;
export type ArbitrageScore = number;
export type ArbitrageConfidence = number;
export type ArbitrageAsset = string;
export type ArbitrageSymbol = string;
export type ArbitrageVenueId = string;
export type ArbitrageAccountId = string;
export type ArbitragePortfolioId = string;
export type ArbitrageStrategyId = string;
export type ArbitrageInstrumentId = string;
export type ArbitrageChainId = string;
export type ArbitrageWalletId = string;
export type ArbitrageBridgeId = string;
export type ArbitrageCorrelationId = string;
export type ArbitrageCausationId = string;
export type ArbitrageTraceId = string;

export type ArbitrageMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly ArbitrageMetadataValue[]
  | { readonly [key: string]: ArbitrageMetadataValue };

export type ArbitrageMetadata = Readonly<
  Record<string, ArbitrageMetadataValue>
>;

export type ArbitrageDeepReadonly<T> =
  T extends (...args: readonly never[]) => unknown
    ? T
    : T extends readonly (infer Element)[]
      ? readonly ArbitrageDeepReadonly<Element>[]
      : T extends object
        ? { readonly [Key in keyof T]: ArbitrageDeepReadonly<T[Key]> }
        : T;

export const ARBITRAGE_TYPES = [
  "CROSS_EXCHANGE",
  "TRIANGULAR",
  "FUNDING_RATE",
  "CASH_AND_CARRY",
  "STABLECOIN",
  "CROSS_DEX",
  "CROSS_CHAIN",
] as const;

export type ArbitrageType = (typeof ARBITRAGE_TYPES)[number];

export const ARBITRAGE_AUTOMATION_MODES = [
  "FULLY_AUTOMATED",
  "SEMI_AUTOMATED",
  "SIGNAL_ONLY",
] as const;

export type ArbitrageAutomationMode =
  (typeof ARBITRAGE_AUTOMATION_MODES)[number];

export const ARBITRAGE_TYPE_AUTOMATION_MODE = {
  CROSS_EXCHANGE: "FULLY_AUTOMATED",
  TRIANGULAR: "FULLY_AUTOMATED",
  FUNDING_RATE: "FULLY_AUTOMATED",
  CASH_AND_CARRY: "FULLY_AUTOMATED",
  STABLECOIN: "SEMI_AUTOMATED",
  CROSS_DEX: "SIGNAL_ONLY",
  CROSS_CHAIN: "SIGNAL_ONLY",
} as const satisfies Readonly<
  Record<ArbitrageType, ArbitrageAutomationMode>
>;

export const ARBITRAGE_VENUE_TYPES = [
  "CENTRALIZED_EXCHANGE",
  "DECENTRALIZED_EXCHANGE",
  "BLOCKCHAIN",
  "BRIDGE",
  "LIQUIDITY_POOL",
  "INTERNAL_LEDGER",
] as const;

export type ArbitrageVenueType =
  (typeof ARBITRAGE_VENUE_TYPES)[number];

export const ARBITRAGE_MARKET_TYPES = [
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "DATED_FUTURE",
  "AMM_POOL",
  "BRIDGE",
] as const;

export type ArbitrageMarketType =
  (typeof ARBITRAGE_MARKET_TYPES)[number];

export const ARBITRAGE_SIDES = [
  "BUY",
  "SELL",
  "OPEN_LONG",
  "CLOSE_LONG",
  "OPEN_SHORT",
  "CLOSE_SHORT",
  "SWAP",
  "TRANSFER",
  "BRIDGE",
  "BORROW",
  "REPAY",
] as const;

export type ArbitrageSide = (typeof ARBITRAGE_SIDES)[number];

export const ARBITRAGE_ORDER_TYPES = [
  "MARKET",
  "LIMIT",
  "POST_ONLY_LIMIT",
  "IMMEDIATE_OR_CANCEL",
  "FILL_OR_KILL",
] as const;

export type ArbitrageOrderType =
  (typeof ARBITRAGE_ORDER_TYPES)[number];

export const ARBITRAGE_TIME_IN_FORCE_VALUES = [
  "GTC",
  "IOC",
  "FOK",
  "POST_ONLY",
] as const;

export type ArbitrageTimeInForce =
  (typeof ARBITRAGE_TIME_IN_FORCE_VALUES)[number];

export const ARBITRAGE_OPPORTUNITY_STATUSES = [
  "DISCOVERED",
  "NORMALIZED",
  "VALIDATED",
  "RISK_ASSESSED",
  "SCORED",
  "RANKED",
  "APPROVAL_PENDING",
  "APPROVED",
  "REJECTED",
  "RESERVED",
  "EXECUTING",
  "SETTLING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type ArbitrageOpportunityStatus =
  (typeof ARBITRAGE_OPPORTUNITY_STATUSES)[number];

export const ARBITRAGE_DECISION_ACTIONS = [
  "EXECUTE",
  "REQUEST_APPROVAL",
  "PUBLISH_SIGNAL",
  "DEFER",
  "REJECT",
  "CANCEL",
] as const;

export type ArbitrageDecisionAction =
  (typeof ARBITRAGE_DECISION_ACTIONS)[number];

export const ARBITRAGE_APPROVAL_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
] as const;

export type ArbitrageApprovalStatus =
  (typeof ARBITRAGE_APPROVAL_STATUSES)[number];

export const ARBITRAGE_EXECUTION_STATUSES = [
  "NOT_STARTED",
  "PREPARING",
  "CAPITAL_RESERVED",
  "SUBMITTING",
  "PARTIALLY_FILLED",
  "FILLED",
  "HEDGING",
  "SETTLING",
  "VERIFIED",
  "COMPLETED",
  "COMPENSATING",
  "COMPENSATED",
  "CANCELLING",
  "CANCELLED",
  "FAILED",
  "TIMED_OUT",
] as const;

export type ArbitrageExecutionStatus =
  (typeof ARBITRAGE_EXECUTION_STATUSES)[number];

export const ARBITRAGE_LEG_STATUSES = [
  "PENDING",
  "READY",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
  "FILLED",
  "SETTLING",
  "SETTLED",
  "CANCEL_PENDING",
  "CANCELLED",
  "REJECTED",
  "FAILED",
  "TIMED_OUT",
  "COMPENSATING",
  "COMPENSATED",
] as const;

export type ArbitrageLegStatus =
  (typeof ARBITRAGE_LEG_STATUSES)[number];

export const ARBITRAGE_SETTLEMENT_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "IN_PROGRESS",
  "CONFIRMING",
  "VERIFIED",
  "MISMATCH",
  "FAILED",
  "TIMED_OUT",
] as const;

export type ArbitrageSettlementStatus =
  (typeof ARBITRAGE_SETTLEMENT_STATUSES)[number];

export const ARBITRAGE_RISK_LEVELS = [
  "MINIMAL",
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
] as const;

export type ArbitrageRiskLevel =
  (typeof ARBITRAGE_RISK_LEVELS)[number];

export const ARBITRAGE_RISK_FACTORS = [
  "MARKET_DATA_STALENESS",
  "PRICE_VOLATILITY",
  "EXECUTION_SLIPPAGE",
  "INSUFFICIENT_LIQUIDITY",
  "PARTIAL_FILL",
  "LEG_IMBALANCE",
  "VENUE_OUTAGE",
  "VENUE_COUNTERPARTY",
  "TRANSFER_DELAY",
  "WITHDRAWAL_DELAY",
  "SETTLEMENT_DELAY",
  "BRIDGE_FAILURE",
  "CHAIN_CONGESTION",
  "CHAIN_REORGANIZATION",
  "SMART_CONTRACT",
  "GAS_PRICE",
  "STABLECOIN_DEPEG",
  "FUNDING_RATE_REVERSAL",
  "BASIS_COMPRESSION",
  "LIQUIDATION",
  "BORROW_AVAILABILITY",
  "BORROW_RATE",
  "INVENTORY_IMBALANCE",
  "CONCENTRATION",
  "CORRELATION",
  "CAPITAL_LOCKUP",
  "MODEL_UNCERTAINTY",
] as const;

export type ArbitrageRiskFactor =
  (typeof ARBITRAGE_RISK_FACTORS)[number];

export const ARBITRAGE_REJECTION_CODES = [
  "INVALID_REQUEST",
  "INVALID_OPPORTUNITY",
  "UNSUPPORTED_ARBITRAGE_TYPE",
  "UNSUPPORTED_AUTOMATION_MODE",
  "DUPLICATE_OPPORTUNITY",
  "OPPORTUNITY_EXPIRED",
  "MARKET_DATA_STALE",
  "INSUFFICIENT_GROSS_EDGE",
  "INSUFFICIENT_NET_PROFIT",
  "INSUFFICIENT_RETURN",
  "INSUFFICIENT_CONFIDENCE",
  "INSUFFICIENT_LIQUIDITY",
  "INSUFFICIENT_CAPITAL",
  "INSUFFICIENT_INVENTORY",
  "CAPITAL_LIMIT_EXCEEDED",
  "RISK_LIMIT_EXCEEDED",
  "EXPOSURE_LIMIT_EXCEEDED",
  "CONCENTRATION_LIMIT_EXCEEDED",
  "LEVERAGE_LIMIT_EXCEEDED",
  "SLIPPAGE_LIMIT_EXCEEDED",
  "FEE_LIMIT_EXCEEDED",
  "GAS_LIMIT_EXCEEDED",
  "LATENCY_LIMIT_EXCEEDED",
  "SETTLEMENT_LIMIT_EXCEEDED",
  "VENUE_UNAVAILABLE",
  "VENUE_HEALTH_DEGRADED",
  "CHAIN_UNAVAILABLE",
  "BRIDGE_UNAVAILABLE",
  "BORROW_UNAVAILABLE",
  "FUNDING_RATE_UNFAVORABLE",
  "BASIS_UNFAVORABLE",
  "STABLECOIN_SAFETY_RULE_FAILED",
  "MANUAL_APPROVAL_REQUIRED",
  "MANUAL_APPROVAL_REJECTED",
  "MANUAL_APPROVAL_EXPIRED",
  "STRATEGY_DISABLED",
  "PORTFOLIO_DISABLED",
  "ACCOUNT_DISABLED",
  "CIRCUIT_BREAKER_ACTIVE",
  "EMERGENCY_SHUTDOWN_ACTIVE",
  "CONFLICTING_CAPITAL_RESERVATION",
  "LOWER_RANKED_OPPORTUNITY",
  "EXECUTION_POLICY_REJECTED",
  "COMPLIANCE_POLICY_REJECTED",
  "INTERNAL_POLICY_REJECTED",
] as const;

export type ArbitrageRejectionCode =
  (typeof ARBITRAGE_REJECTION_CODES)[number];

export interface ArbitrageVenueReference {
  readonly venueId: ArbitrageVenueId;
  readonly venueType: ArbitrageVenueType;
  readonly displayName: string;
  readonly accountId?: ArbitrageAccountId;
  readonly walletId?: ArbitrageWalletId;
  readonly chainId?: ArbitrageChainId;
  readonly enabled: boolean;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageInstrumentReference {
  readonly instrumentId: ArbitrageInstrumentId;
  readonly symbol: ArbitrageSymbol;
  readonly baseAsset: ArbitrageAsset;
  readonly quoteAsset: ArbitrageAsset;
  readonly settlementAsset?: ArbitrageAsset;
  readonly marketType: ArbitrageMarketType;
  readonly contractSize?: ArbitrageDecimal;
  readonly expiryTimestamp?: ArbitrageTimestamp;
  readonly inverse: boolean;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageMarketSnapshot {
  readonly venue: ArbitrageVenueReference;
  readonly instrument: ArbitrageInstrumentReference;
  readonly bidPrice?: ArbitrageDecimal;
  readonly askPrice?: ArbitrageDecimal;
  readonly lastPrice?: ArbitrageDecimal;
  readonly markPrice?: ArbitrageDecimal;
  readonly indexPrice?: ArbitrageDecimal;
  readonly midPrice?: ArbitrageDecimal;
  readonly bidQuantity?: ArbitrageDecimal;
  readonly askQuantity?: ArbitrageDecimal;
  readonly fundingRate?: ArbitrageDecimal;
  readonly nextFundingTimestamp?: ArbitrageTimestamp;
  readonly openInterest?: ArbitrageDecimal;
  readonly volume24h?: ArbitrageDecimal;
  readonly blockNumber?: number;
  readonly sourceTimestamp: ArbitrageTimestamp;
  readonly observedAt: ArbitrageTimestamp;
  readonly sequence: ArbitrageSequence;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageVenueHealth {
  readonly venueId: ArbitrageVenueId;
  readonly available: boolean;
  readonly authenticated: boolean;
  readonly marketDataHealthy: boolean;
  readonly tradingHealthy: boolean;
  readonly depositHealthy: boolean;
  readonly withdrawalHealthy: boolean;
  readonly latencyMs: number;
  readonly errorRatePercentage: ArbitragePercentage;
  readonly observedAt: ArbitrageTimestamp;
  readonly lastSuccessfulInteractionAt?: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageFeeBreakdown {
  readonly tradingFee: ArbitrageDecimal;
  readonly fundingFee: ArbitrageDecimal;
  readonly borrowingFee: ArbitrageDecimal;
  readonly withdrawalFee: ArbitrageDecimal;
  readonly depositFee: ArbitrageDecimal;
  readonly networkFee: ArbitrageDecimal;
  readonly bridgeFee: ArbitrageDecimal;
  readonly gasFee: ArbitrageDecimal;
  readonly protocolFee: ArbitrageDecimal;
  readonly otherFee: ArbitrageDecimal;
  readonly totalFee: ArbitrageDecimal;
  readonly reportingAsset: ArbitrageAsset;
}

export interface ArbitrageSlippageEstimate {
  readonly expectedSlippageBps: ArbitrageBasisPoints;
  readonly stressedSlippageBps: ArbitrageBasisPoints;
  readonly maximumSlippageBps: ArbitrageBasisPoints;
  readonly expectedSlippageValue: ArbitrageDecimal;
  readonly stressedSlippageValue: ArbitrageDecimal;
  readonly reportingAsset: ArbitrageAsset;
}

export interface ArbitrageLiquidityAssessment {
  readonly requestedQuantity: ArbitrageDecimal;
  readonly executableQuantity: ArbitrageDecimal;
  readonly requestedNotional: ArbitrageDecimal;
  readonly executableNotional: ArbitrageDecimal;
  readonly liquidityUtilizationPercentage: ArbitragePercentage;
  readonly depthLevelsConsumed: number;
  readonly sufficient: boolean;
}

export interface ArbitrageLatencyEstimate {
  readonly marketDataAgeMs: number;
  readonly expectedSubmissionLatencyMs: number;
  readonly expectedExecutionLatencyMs: number;
  readonly expectedTransferLatencyMs: number;
  readonly expectedSettlementLatencyMs: number;
  readonly expectedTotalLatencyMs: number;
  readonly maximumPermittedLatencyMs: number;
}

export interface ArbitrageProfitEstimate {
  readonly grossProfit: ArbitrageDecimal;
  readonly totalFees: ArbitrageDecimal;
  readonly expectedSlippageCost: ArbitrageDecimal;
  readonly expectedFinancingCost: ArbitrageDecimal;
  readonly expectedGasCost: ArbitrageDecimal;
  readonly expectedBridgeCost: ArbitrageDecimal;
  readonly expectedNetProfit: ArbitrageDecimal;
  readonly stressedNetProfit: ArbitrageDecimal;
  readonly grossReturnPercentage: ArbitragePercentage;
  readonly netReturnPercentage: ArbitragePercentage;
  readonly annualizedReturnPercentage?: ArbitragePercentage;
  readonly breakEvenPriceMovementBps: ArbitrageBasisPoints;
  readonly reportingAsset: ArbitrageAsset;
}

export interface ArbitrageLeg {
  readonly legId: ArbitrageId;
  readonly sequence: ArbitrageSequence;
  readonly side: ArbitrageSide;
  readonly venue: ArbitrageVenueReference;
  readonly instrument?: ArbitrageInstrumentReference;
  readonly inputAsset: ArbitrageAsset;
  readonly outputAsset: ArbitrageAsset;
  readonly inputQuantity: ArbitrageDecimal;
  readonly expectedOutputQuantity: ArbitrageDecimal;
  readonly expectedPrice?: ArbitrageDecimal;
  readonly limitPrice?: ArbitrageDecimal;
  readonly minimumOutputQuantity?: ArbitrageDecimal;
  readonly orderType?: ArbitrageOrderType;
  readonly timeInForce?: ArbitrageTimeInForce;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly requiresTransfer: boolean;
  readonly requiresBorrowing: boolean;
  readonly feeEstimate: ArbitrageFeeBreakdown;
  readonly slippageEstimate: ArbitrageSlippageEstimate;
  readonly liquidity: ArbitrageLiquidityAssessment;
  readonly latency: ArbitrageLatencyEstimate;
  readonly dependencyLegIds: readonly ArbitrageId[];
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageTransferRequirement {
  readonly transferId: ArbitrageId;
  readonly sequence: ArbitrageSequence;
  readonly asset: ArbitrageAsset;
  readonly quantity: ArbitrageDecimal;
  readonly sourceVenue: ArbitrageVenueReference;
  readonly destinationVenue: ArbitrageVenueReference;
  readonly sourceChainId?: ArbitrageChainId;
  readonly destinationChainId?: ArbitrageChainId;
  readonly bridgeId?: ArbitrageBridgeId;
  readonly expectedFee: ArbitrageDecimal;
  readonly expectedDurationMs: number;
  readonly maximumDurationMs: number;
  readonly confirmationsRequired?: number;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageOpportunityBase {
  readonly opportunityId: ArbitrageId;
  readonly type: ArbitrageType;
  readonly automationMode: ArbitrageAutomationMode;
  readonly status: ArbitrageOpportunityStatus;
  readonly strategyId: ArbitrageStrategyId;
  readonly portfolioId: ArbitragePortfolioId;
  readonly accountIds: readonly ArbitrageAccountId[];
  readonly reportingAsset: ArbitrageAsset;
  readonly requestedCapital: ArbitrageDecimal;
  readonly maximumCapital: ArbitrageDecimal;
  readonly profitEstimate: ArbitrageProfitEstimate;
  readonly legs: readonly ArbitrageLeg[];
  readonly transfers: readonly ArbitrageTransferRequirement[];
  readonly discoveredAt: ArbitrageTimestamp;
  readonly validFrom: ArbitrageTimestamp;
  readonly expiresAt: ArbitrageTimestamp;
  readonly sourceSequence: ArbitrageSequence;
  readonly confidence: ArbitrageConfidence;
  readonly correlationId: ArbitrageCorrelationId;
  readonly causationId?: ArbitrageCausationId;
  readonly traceId: ArbitrageTraceId;
  readonly version: ArbitrageVersion;
  readonly metadata: ArbitrageMetadata;
}

export interface CrossExchangeArbitrageDetails {
  readonly buyVenue: ArbitrageVenueReference;
  readonly sellVenue: ArbitrageVenueReference;
  readonly instrument: ArbitrageInstrumentReference;
  readonly buyPrice: ArbitrageDecimal;
  readonly sellPrice: ArbitrageDecimal;
  readonly grossSpread: ArbitrageDecimal;
  readonly grossSpreadBps: ArbitrageBasisPoints;
  readonly executableQuantity: ArbitrageDecimal;
  readonly inventoryPrepositioned: boolean;
  readonly settlementVerificationRequired: boolean;
}

export interface CrossExchangeArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "CROSS_EXCHANGE";
  readonly automationMode: "FULLY_AUTOMATED";
  readonly details: CrossExchangeArbitrageDetails;
}

export interface TriangularRouteNode {
  readonly sequence: ArbitrageSequence;
  readonly asset: ArbitrageAsset;
  readonly venueId: ArbitrageVenueId;
}

export interface TriangularArbitrageDetails {
  readonly venue: ArbitrageVenueReference;
  readonly startAsset: ArbitrageAsset;
  readonly endAsset: ArbitrageAsset;
  readonly routeNodes: readonly TriangularRouteNode[];
  readonly cycleLength: number;
  readonly startingQuantity: ArbitrageDecimal;
  readonly expectedEndingQuantity: ArbitrageDecimal;
  readonly cycleReturnPercentage: ArbitragePercentage;
  readonly routeHash: string;
}

export interface TriangularArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "TRIANGULAR";
  readonly automationMode: "FULLY_AUTOMATED";
  readonly details: TriangularArbitrageDetails;
}

export interface FundingRateArbitrageDetails {
  readonly spotVenue: ArbitrageVenueReference;
  readonly derivativesVenue: ArbitrageVenueReference;
  readonly spotInstrument: ArbitrageInstrumentReference;
  readonly derivativesInstrument: ArbitrageInstrumentReference;
  readonly spotSide: "BUY" | "SELL";
  readonly derivativesSide: "OPEN_LONG" | "OPEN_SHORT";
  readonly fundingRate: ArbitrageDecimal;
  readonly fundingIntervalHours: number;
  readonly nextFundingTimestamp: ArbitrageTimestamp;
  readonly expectedHoldingPeriods: number;
  readonly expectedFundingIncome: ArbitrageDecimal;
  readonly hedgeRatio: ArbitrageDecimal;
  readonly deltaNeutral: boolean;
}

export interface FundingRateArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "FUNDING_RATE";
  readonly automationMode: "FULLY_AUTOMATED";
  readonly details: FundingRateArbitrageDetails;
}

export interface CashAndCarryArbitrageDetails {
  readonly spotVenue: ArbitrageVenueReference;
  readonly futuresVenue: ArbitrageVenueReference;
  readonly spotInstrument: ArbitrageInstrumentReference;
  readonly futuresInstrument: ArbitrageInstrumentReference;
  readonly spotPrice: ArbitrageDecimal;
  readonly futuresPrice: ArbitrageDecimal;
  readonly absoluteBasis: ArbitrageDecimal;
  readonly basisPercentage: ArbitragePercentage;
  readonly annualizedBasisPercentage: ArbitragePercentage;
  readonly futuresExpiryTimestamp: ArbitrageTimestamp;
  readonly holdingPeriodDays: number;
  readonly hedgeRatio: ArbitrageDecimal;
  readonly expectedCarryIncome: ArbitrageDecimal;
  readonly exitBeforeExpiry: boolean;
}

export interface CashAndCarryArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "CASH_AND_CARRY";
  readonly automationMode: "FULLY_AUTOMATED";
  readonly details: CashAndCarryArbitrageDetails;
}

export interface StablecoinSafetyAssessment {
  readonly reserveRiskScore: ArbitrageScore;
  readonly liquidityRiskScore: ArbitrageScore;
  readonly issuerRiskScore: ArbitrageScore;
  readonly redemptionRiskScore: ArbitrageScore;
  readonly chainRiskScore: ArbitrageScore;
  readonly maximumPermittedDepegPercentage: ArbitragePercentage;
  readonly safetyRulesPassed: boolean;
  readonly failedRuleIds: readonly string[];
}

export interface StablecoinArbitrageDetails {
  readonly stablecoin: ArbitrageAsset;
  readonly referenceAsset: ArbitrageAsset;
  readonly sourceVenue: ArbitrageVenueReference;
  readonly destinationVenue: ArbitrageVenueReference;
  readonly sourcePrice: ArbitrageDecimal;
  readonly destinationPrice: ArbitrageDecimal;
  readonly referencePrice: ArbitrageDecimal;
  readonly sourceDepegPercentage: ArbitragePercentage;
  readonly destinationDepegPercentage: ArbitragePercentage;
  readonly redemptionAvailable: boolean;
  readonly safetyAssessment: StablecoinSafetyAssessment;
}

export interface StablecoinArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "STABLECOIN";
  readonly automationMode: "SEMI_AUTOMATED";
  readonly details: StablecoinArbitrageDetails;
}

export interface CrossDexArbitrageDetails {
  readonly sourceDex: ArbitrageVenueReference;
  readonly destinationDex: ArbitrageVenueReference;
  readonly chainId: ArbitrageChainId;
  readonly inputAsset: ArbitrageAsset;
  readonly outputAsset: ArbitrageAsset;
  readonly sourceQuote: ArbitrageDecimal;
  readonly destinationQuote: ArbitrageDecimal;
  readonly expectedGasCost: ArbitrageDecimal;
  readonly expectedSlippageCost: ArbitrageDecimal;
  readonly availableLiquidity: ArbitrageDecimal;
  readonly priceImpactBps: ArbitrageBasisPoints;
  readonly blockNumber: number;
  readonly manualApprovalRequired: true;
}

export interface CrossDexArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "CROSS_DEX";
  readonly automationMode: "SIGNAL_ONLY";
  readonly details: CrossDexArbitrageDetails;
}

export interface CrossChainArbitrageDetails {
  readonly sourceChainId: ArbitrageChainId;
  readonly destinationChainId: ArbitrageChainId;
  readonly sourceVenue: ArbitrageVenueReference;
  readonly destinationVenue: ArbitrageVenueReference;
  readonly bridgeId: ArbitrageBridgeId;
  readonly asset: ArbitrageAsset;
  readonly quantity: ArbitrageDecimal;
  readonly sourcePrice: ArbitrageDecimal;
  readonly destinationPrice: ArbitrageDecimal;
  readonly expectedBridgeFee: ArbitrageDecimal;
  readonly expectedSettlementTimeMs: number;
  readonly maximumSettlementTimeMs: number;
  readonly sourceChainRiskScore: ArbitrageScore;
  readonly destinationChainRiskScore: ArbitrageScore;
  readonly bridgeRiskScore: ArbitrageScore;
  readonly manualApprovalRequired: true;
}

export interface CrossChainArbitrageOpportunity
  extends ArbitrageOpportunityBase {
  readonly type: "CROSS_CHAIN";
  readonly automationMode: "SIGNAL_ONLY";
  readonly details: CrossChainArbitrageDetails;
}

export type InstitutionalArbitrageOpportunity =
  | CrossExchangeArbitrageOpportunity
  | TriangularArbitrageOpportunity
  | FundingRateArbitrageOpportunity
  | CashAndCarryArbitrageOpportunity
  | StablecoinArbitrageOpportunity
  | CrossDexArbitrageOpportunity
  | CrossChainArbitrageOpportunity;

export interface ArbitrageRiskFinding {
  readonly findingId: ArbitrageId;
  readonly factor: ArbitrageRiskFactor;
  readonly level: ArbitrageRiskLevel;
  readonly score: ArbitrageScore;
  readonly message: string;
  readonly blocking: boolean;
  readonly affectedLegIds: readonly ArbitrageId[];
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageRiskAssessment {
  readonly opportunityId: ArbitrageId;
  readonly assessedAt: ArbitrageTimestamp;
  readonly overallRiskLevel: ArbitrageRiskLevel;
  readonly overallRiskScore: ArbitrageScore;
  readonly approved: boolean;
  readonly findings: readonly ArbitrageRiskFinding[];
  readonly rejectionCodes: readonly ArbitrageRejectionCode[];
  readonly maximumApprovedCapital: ArbitrageDecimal;
  readonly maximumApprovedLeverage: ArbitrageDecimal;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageOpportunityScoreBreakdown {
  readonly profitabilityScore: ArbitrageScore;
  readonly confidenceScore: ArbitrageScore;
  readonly liquidityScore: ArbitrageScore;
  readonly executionScore: ArbitrageScore;
  readonly latencyScore: ArbitrageScore;
  readonly settlementScore: ArbitrageScore;
  readonly capitalEfficiencyScore: ArbitrageScore;
  readonly diversificationScore: ArbitrageScore;
  readonly riskAdjustedScore: ArbitrageScore;
  readonly finalScore: ArbitrageScore;
}

export interface ArbitrageRankedOpportunity {
  readonly rank: number;
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly score: ArbitrageOpportunityScoreBreakdown;
  readonly riskAssessment: ArbitrageRiskAssessment;
  readonly rankReason: string;
  readonly rankedAt: ArbitrageTimestamp;
}

export interface ArbitrageCapitalAllocation {
  readonly allocationId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly portfolioId: ArbitragePortfolioId;
  readonly requestedCapital: ArbitrageDecimal;
  readonly approvedCapital: ArbitrageDecimal;
  readonly reservedCapital: ArbitrageDecimal;
  readonly reportingAsset: ArbitrageAsset;
  readonly allocationPercentage: ArbitragePercentage;
  readonly reservationExpiresAt: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageManualApproval {
  readonly approvalId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly status: ArbitrageApprovalStatus;
  readonly requestedAt: ArbitrageTimestamp;
  readonly expiresAt: ArbitrageTimestamp;
  readonly decidedAt?: ArbitrageTimestamp;
  readonly decidedBy?: string;
  readonly reason?: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageDecision {
  readonly decisionId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly action: ArbitrageDecisionAction;
  readonly automationMode: ArbitrageAutomationMode;
  readonly decidedAt: ArbitrageTimestamp;
  readonly score: ArbitrageOpportunityScoreBreakdown;
  readonly riskAssessment: ArbitrageRiskAssessment;
  readonly capitalAllocation?: ArbitrageCapitalAllocation;
  readonly approval?: ArbitrageManualApproval;
  readonly rejectionCodes: readonly ArbitrageRejectionCode[];
  readonly reason: string;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageExecutionLegResult {
  readonly legId: ArbitrageId;
  readonly status: ArbitrageLegStatus;
  readonly submittedQuantity: ArbitrageDecimal;
  readonly filledQuantity: ArbitrageDecimal;
  readonly averageFillPrice?: ArbitrageDecimal;
  readonly actualOutputQuantity?: ArbitrageDecimal;
  readonly actualFees: ArbitrageDecimal;
  readonly submittedAt?: ArbitrageTimestamp;
  readonly completedAt?: ArbitrageTimestamp;
  readonly externalOrderIds: readonly string[];
  readonly externalTransactionIds: readonly string[];
  readonly failureReason?: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageExecutionPlan {
  readonly planId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly decisionId: ArbitrageId;
  readonly status: ArbitrageExecutionStatus;
  readonly legs: readonly ArbitrageLeg[];
  readonly transfers: readonly ArbitrageTransferRequirement[];
  readonly capitalAllocation: ArbitrageCapitalAllocation;
  readonly createdAt: ArbitrageTimestamp;
  readonly expiresAt: ArbitrageTimestamp;
  readonly maximumExecutionDurationMs: number;
  readonly rollbackRequiredOnPartialFailure: boolean;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageSettlementVerification {
  readonly verificationId: ArbitrageId;
  readonly executionId: ArbitrageId;
  readonly status: ArbitrageSettlementStatus;
  readonly expectedAssets: Readonly<Record<string, ArbitrageDecimal>>;
  readonly actualAssets: Readonly<Record<string, ArbitrageDecimal>>;
  readonly discrepancies: Readonly<Record<string, ArbitrageDecimal>>;
  readonly expectedProfit: ArbitrageDecimal;
  readonly realizedProfit: ArbitrageDecimal;
  readonly reportingAsset: ArbitrageAsset;
  readonly verifiedAt: ArbitrageTimestamp;
  readonly notes: readonly string[];
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageExecutionResult {
  readonly executionId: ArbitrageId;
  readonly planId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly status: ArbitrageExecutionStatus;
  readonly legResults: readonly ArbitrageExecutionLegResult[];
  readonly settlementVerification?: ArbitrageSettlementVerification;
  readonly startedAt: ArbitrageTimestamp;
  readonly completedAt?: ArbitrageTimestamp;
  readonly grossProfit: ArbitrageDecimal;
  readonly totalFees: ArbitrageDecimal;
  readonly realizedNetProfit: ArbitrageDecimal;
  readonly reportingAsset: ArbitrageAsset;
  readonly failureReason?: string;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageScanContext {
  readonly portfolioId: ArbitragePortfolioId;
  readonly strategyIds: readonly ArbitrageStrategyId[];
  readonly enabledTypes: readonly ArbitrageType[];
  readonly venueIds: readonly ArbitrageVenueId[];
  readonly accountIds: readonly ArbitrageAccountId[];
  readonly reportingAsset: ArbitrageAsset;
  readonly availableCapital: ArbitrageDecimal;
  readonly scanTimestamp: ArbitrageTimestamp;
  readonly sourceSequence: ArbitrageSequence;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageEvaluationPolicy {
  readonly minimumGrossProfit: ArbitrageDecimal;
  readonly minimumNetProfit: ArbitrageDecimal;
  readonly minimumNetReturnPercentage: ArbitragePercentage;
  readonly minimumConfidence: ArbitrageConfidence;
  readonly maximumRiskScore: ArbitrageScore;
  readonly maximumSlippageBps: ArbitrageBasisPoints;
  readonly maximumFeePercentage: ArbitragePercentage;
  readonly maximumMarketDataAgeMs: number;
  readonly maximumExecutionLatencyMs: number;
  readonly maximumSettlementLatencyMs: number;
  readonly maximumCapitalPerOpportunity: ArbitrageDecimal;
  readonly maximumPortfolioAllocationPercentage: ArbitragePercentage;
  readonly maximumConcurrentExecutions: number;
  readonly requirePrepositionedInventoryForCrossExchange: boolean;
  readonly requireManualApprovalForStablecoin: boolean;
  readonly publishRejectedSignals: boolean;
}

export interface InstitutionalArbitrageConfiguration {
  readonly enabled: boolean;
  readonly enabledTypes: readonly ArbitrageType[];
  readonly evaluationPolicy: ArbitrageEvaluationPolicy;
  readonly emergencyShutdownActive: boolean;
  readonly circuitBreakerActive: boolean;
  readonly deterministicSeed: string;
  readonly configurationVersion: ArbitrageVersion;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageScanResult {
  readonly scanId: ArbitrageId;
  readonly context: ArbitrageScanContext;
  readonly opportunities: readonly InstitutionalArbitrageOpportunity[];
  readonly startedAt: ArbitrageTimestamp;
  readonly completedAt: ArbitrageTimestamp;
  readonly marketSnapshotsProcessed: number;
  readonly rejectedCandidateCount: number;
  readonly diagnostics: readonly string[];
}

export interface ArbitrageEvaluationResult {
  readonly evaluationId: ArbitrageId;
  readonly rankedOpportunities: readonly ArbitrageRankedOpportunity[];
  readonly decisions: readonly ArbitrageDecision[];
  readonly evaluatedAt: ArbitrageTimestamp;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly diagnostics: readonly string[];
}

export interface ArbitrageSignal {
  readonly signalId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly type: "CROSS_DEX" | "CROSS_CHAIN";
  readonly expectedProfit: ArbitrageDecimal;
  readonly expectedNetReturnPercentage: ArbitragePercentage;
  readonly gasCost: ArbitrageDecimal;
  readonly bridgeFee: ArbitrageDecimal;
  readonly slippageCost: ArbitrageDecimal;
  readonly liquidity: ArbitrageDecimal;
  readonly confidence: ArbitrageConfidence;
  readonly chainRiskScore?: ArbitrageScore;
  readonly bridgeRiskScore?: ArbitrageScore;
  readonly expectedSettlementTimeMs?: number;
  readonly manualApprovalRequired: true;
  readonly generatedAt: ArbitrageTimestamp;
  readonly expiresAt: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export interface InstitutionalArbitrageClock {
  now(): ArbitrageTimestamp;
}

export interface InstitutionalArbitrageIdFactory {
  createId(
    namespace: string,
    components: readonly (
      | string
      | number
      | boolean
      | null
      | undefined
    )[],
  ): ArbitrageId;
}

export interface InstitutionalArbitrageOpportunitySource {
  readonly type: ArbitrageType;

  scan(
    context: ArbitrageScanContext,
    marketSnapshots: readonly ArbitrageMarketSnapshot[],
  ):
    | readonly InstitutionalArbitrageOpportunity[]
    | Promise<readonly InstitutionalArbitrageOpportunity[]>;
}

export interface InstitutionalArbitrageRiskEvaluator {
  assess(
    opportunity: InstitutionalArbitrageOpportunity,
    policy: ArbitrageEvaluationPolicy,
    assessedAt: ArbitrageTimestamp,
  ): ArbitrageRiskAssessment;
}

export interface InstitutionalArbitrageOpportunityRanker {
  rank(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    riskAssessments: ReadonlyMap<ArbitrageId, ArbitrageRiskAssessment>,
    rankedAt: ArbitrageTimestamp,
  ): readonly ArbitrageRankedOpportunity[];
}

export interface InstitutionalArbitrageCapitalAllocator {
  allocate(
    opportunities: readonly ArbitrageRankedOpportunity[],
    context: ArbitrageScanContext,
    policy: ArbitrageEvaluationPolicy,
    allocatedAt: ArbitrageTimestamp,
  ): readonly ArbitrageCapitalAllocation[];
}

export interface InstitutionalArbitrageDecisionEngine {
  decide(
    rankedOpportunities: readonly ArbitrageRankedOpportunity[],
    allocations: readonly ArbitrageCapitalAllocation[],
    policy: ArbitrageEvaluationPolicy,
    decidedAt: ArbitrageTimestamp,
  ): readonly ArbitrageDecision[];
}

export interface InstitutionalArbitrageExecutionPlanner {
  createPlan(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    allocation: ArbitrageCapitalAllocation,
    createdAt: ArbitrageTimestamp,
  ): ArbitrageExecutionPlan;
}

export interface InstitutionalArbitrageExecutor {
  execute(
    plan: ArbitrageExecutionPlan,
  ): Promise<ArbitrageExecutionResult>;
}

export interface InstitutionalArbitrageSettlementVerifier {
  verify(
    executionResult: ArbitrageExecutionResult,
    verifiedAt: ArbitrageTimestamp,
  ):
    | ArbitrageSettlementVerification
    | Promise<ArbitrageSettlementVerification>;
}

export interface InstitutionalArbitrageOrchestratorRequest {
  readonly context: ArbitrageScanContext;
  readonly configuration: InstitutionalArbitrageConfiguration;
  readonly marketSnapshots: readonly ArbitrageMarketSnapshot[];
  readonly venueHealth: readonly ArbitrageVenueHealth[];
}

export interface InstitutionalArbitrageOrchestratorResult {
  readonly scanResult: ArbitrageScanResult;
  readonly evaluationResult: ArbitrageEvaluationResult;
  readonly executionPlans: readonly ArbitrageExecutionPlan[];
  readonly publishedSignals: readonly ArbitrageSignal[];
  readonly completedAt: ArbitrageTimestamp;
  readonly correlationId: ArbitrageCorrelationId;
  readonly traceId: ArbitrageTraceId;
  readonly diagnostics: readonly string[];
}