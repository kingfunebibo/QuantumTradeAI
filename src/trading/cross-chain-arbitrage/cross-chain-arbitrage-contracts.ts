/**
 * QuantumTradeAI
 * Milestone 26 — Cross-Chain Arbitrage & Bridge Execution
 *
 * File:
 * cross-chain-arbitrage-contracts.ts
 *
 * Purpose:
 * Defines the immutable, deterministic domain contracts used throughout the
 * cross-chain arbitrage and bridge-execution subsystem.
 */

export type CrossChainReadonlyRecord = Readonly<
  Record<string, string | number | boolean | null>
>;

export type CrossChainIdentifier = string;
export type CrossChainTimestamp = number;
export type CrossChainTransactionHash = string;
export type CrossChainAddress = string;
export type CrossChainAssetSymbol = string;
export type CrossChainBridgeId = string;
export type CrossChainNetworkId = string;
export type CrossChainRouteId = string;
export type CrossChainOpportunityId = string;
export type CrossChainExecutionPlanId = string;
export type CrossChainExecutionId = string;
export type CrossChainQuoteId = string;

export type CrossChainIntegerString = string;
export type CrossChainDecimalString = string;

export const CROSS_CHAIN_SUPPORTED_NETWORK_FAMILIES = [
  "EVM",
  "SOLANA",
  "COSMOS",
  "UTXO",
  "MOVE",
  "OTHER",
] as const;

export type CrossChainNetworkFamily =
  (typeof CROSS_CHAIN_SUPPORTED_NETWORK_FAMILIES)[number];

export const CROSS_CHAIN_NETWORK_ENVIRONMENTS = [
  "MAINNET",
  "TESTNET",
  "DEVNET",
  "LOCAL",
] as const;

export type CrossChainNetworkEnvironment =
  (typeof CROSS_CHAIN_NETWORK_ENVIRONMENTS)[number];

export const CROSS_CHAIN_BRIDGE_TYPES = [
  "LOCK_AND_MINT",
  "BURN_AND_MINT",
  "LIQUIDITY_NETWORK",
  "NATIVE_MESSAGING",
  "CANONICAL",
  "INTENT_BASED",
  "ATOMIC_SWAP",
  "OTHER",
] as const;

export type CrossChainBridgeType =
  (typeof CROSS_CHAIN_BRIDGE_TYPES)[number];

export const CROSS_CHAIN_BRIDGE_SECURITY_MODELS = [
  "NATIVE",
  "OPTIMISTIC",
  "LIGHT_CLIENT",
  "VALIDATOR_SET",
  "MULTISIG",
  "ZERO_KNOWLEDGE",
  "LIQUIDITY_PROVIDER",
  "HYBRID",
  "UNKNOWN",
] as const;

export type CrossChainBridgeSecurityModel =
  (typeof CROSS_CHAIN_BRIDGE_SECURITY_MODELS)[number];

export const CROSS_CHAIN_ASSET_TYPES = [
  "NATIVE",
  "ERC20",
  "SPL",
  "IBC",
  "WRAPPED",
  "SYNTHETIC",
  "OTHER",
] as const;

export type CrossChainAssetType =
  (typeof CROSS_CHAIN_ASSET_TYPES)[number];

export const CROSS_CHAIN_ROUTE_STEP_TYPES = [
  "SOURCE_SWAP",
  "BRIDGE_TRANSFER",
  "DESTINATION_SWAP",
  "PROTOCOL_CALL",
  "WRAP",
  "UNWRAP",
  "APPROVAL",
  "SETTLEMENT",
] as const;

export type CrossChainRouteStepType =
  (typeof CROSS_CHAIN_ROUTE_STEP_TYPES)[number];

export const CROSS_CHAIN_EXECUTION_MODES = [
  "SEQUENTIAL",
  "ATOMIC",
  "CONDITIONAL",
  "INTENT_BASED",
] as const;

export type CrossChainExecutionMode =
  (typeof CROSS_CHAIN_EXECUTION_MODES)[number];

export const CROSS_CHAIN_EXECUTION_STATUSES = [
  "CREATED",
  "VALIDATED",
  "PLANNED",
  "SUBMITTING",
  "SOURCE_PENDING",
  "SOURCE_CONFIRMED",
  "BRIDGE_PENDING",
  "DESTINATION_PENDING",
  "SETTLING",
  "COMPLETED",
  "RECOVERY_PENDING",
  "RECOVERED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type CrossChainExecutionStatus =
  (typeof CROSS_CHAIN_EXECUTION_STATUSES)[number];

export const CROSS_CHAIN_TRANSACTION_STATUSES = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "MEMPOOL",
  "CONFIRMED",
  "FINALIZED",
  "REVERTED",
  "DROPPED",
  "REPLACED",
  "FAILED",
  "UNKNOWN",
] as const;

export type CrossChainTransactionStatus =
  (typeof CROSS_CHAIN_TRANSACTION_STATUSES)[number];

export const CROSS_CHAIN_SETTLEMENT_STATUSES = [
  "PENDING",
  "SOURCE_SETTLED",
  "BRIDGE_ATTESTED",
  "DESTINATION_SETTLED",
  "VERIFIED",
  "MISMATCH",
  "FAILED",
] as const;

export type CrossChainSettlementStatus =
  (typeof CROSS_CHAIN_SETTLEMENT_STATUSES)[number];

export const CROSS_CHAIN_FAILURE_CATEGORIES = [
  "VALIDATION",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_LIQUIDITY",
  "ALLOWANCE",
  "SOURCE_TRANSACTION",
  "BRIDGE_SUBMISSION",
  "BRIDGE_TIMEOUT",
  "BRIDGE_REJECTION",
  "DESTINATION_TRANSACTION",
  "SETTLEMENT_MISMATCH",
  "SLIPPAGE",
  "PRICE_MOVEMENT",
  "FEE_INCREASE",
  "CHAIN_REORGANIZATION",
  "RPC_UNAVAILABLE",
  "NONCE_CONFLICT",
  "EXPIRED",
  "CANCELLED",
  "UNKNOWN",
] as const;

export type CrossChainFailureCategory =
  (typeof CROSS_CHAIN_FAILURE_CATEGORIES)[number];

export const CROSS_CHAIN_RECOVERY_ACTIONS = [
  "NONE",
  "RETRY_SOURCE_TRANSACTION",
  "REPLACE_SOURCE_TRANSACTION",
  "RETRY_BRIDGE_SUBMISSION",
  "WAIT_FOR_BRIDGE",
  "CLAIM_DESTINATION_FUNDS",
  "RETRY_DESTINATION_TRANSACTION",
  "REFUND_SOURCE_FUNDS",
  "REVERSE_DESTINATION_SWAP",
  "MANUAL_REVIEW",
  "ABORT",
] as const;

export type CrossChainRecoveryAction =
  (typeof CROSS_CHAIN_RECOVERY_ACTIONS)[number];

export const CROSS_CHAIN_OPPORTUNITY_STATUSES = [
  "DISCOVERED",
  "VALIDATED",
  "PROFITABLE",
  "UNPROFITABLE",
  "EXPIRED",
  "PLANNED",
  "EXECUTING",
  "COMPLETED",
  "REJECTED",
  "FAILED",
] as const;

export type CrossChainOpportunityStatus =
  (typeof CROSS_CHAIN_OPPORTUNITY_STATUSES)[number];

export const CROSS_CHAIN_QUOTE_STATUSES = [
  "VALID",
  "EXPIRED",
  "UNAVAILABLE",
  "REJECTED",
] as const;

export type CrossChainQuoteStatus =
  (typeof CROSS_CHAIN_QUOTE_STATUSES)[number];

export interface CrossChainNetworkReference {
  readonly networkId: CrossChainNetworkId;
  readonly chainId: string;
  readonly name: string;
  readonly family: CrossChainNetworkFamily;
  readonly environment: CrossChainNetworkEnvironment;
  readonly nativeAssetSymbol: CrossChainAssetSymbol;
}

export interface CrossChainAssetReference {
  readonly networkId: CrossChainNetworkId;
  readonly assetId: CrossChainIdentifier;
  readonly symbol: CrossChainAssetSymbol;
  readonly name: string;
  readonly type: CrossChainAssetType;
  readonly decimals: number;
  readonly contractAddress: CrossChainAddress | null;
  readonly canonicalAssetId: CrossChainIdentifier | null;
}

export interface CrossChainAmount {
  readonly asset: CrossChainAssetReference;
  readonly atomicAmount: CrossChainIntegerString;
  readonly decimalAmount: CrossChainDecimalString;
}

export interface CrossChainGasEstimate {
  readonly networkId: CrossChainNetworkId;
  readonly gasLimit: CrossChainIntegerString;
  readonly maxFeePerGasAtomic: CrossChainIntegerString | null;
  readonly maxPriorityFeePerGasAtomic: CrossChainIntegerString | null;
  readonly legacyGasPriceAtomic: CrossChainIntegerString | null;
  readonly estimatedNativeFeeAtomic: CrossChainIntegerString;
  readonly estimatedNativeFeeDecimal: CrossChainDecimalString;
  readonly estimatedUsdFee: CrossChainDecimalString | null;
}

export interface CrossChainFeeComponent {
  readonly code: string;
  readonly description: string;
  readonly amount: CrossChainAmount;
  readonly usdValue: CrossChainDecimalString | null;
}

export interface CrossChainFeeEstimate {
  readonly sourceNetworkFee: CrossChainGasEstimate | null;
  readonly destinationNetworkFee: CrossChainGasEstimate | null;
  readonly bridgeFees: readonly CrossChainFeeComponent[];
  readonly protocolFees: readonly CrossChainFeeComponent[];
  readonly liquidityProviderFees: readonly CrossChainFeeComponent[];
  readonly totalFeeUsd: CrossChainDecimalString | null;
  readonly calculatedAt: CrossChainTimestamp;
}

export interface CrossChainLatencyEstimate {
  readonly minimumMilliseconds: number;
  readonly expectedMilliseconds: number;
  readonly maximumMilliseconds: number;
  readonly sourceConfirmationMilliseconds: number;
  readonly bridgeProcessingMilliseconds: number;
  readonly destinationConfirmationMilliseconds: number;
  readonly confidence: number;
  readonly calculatedAt: CrossChainTimestamp;
}

export interface CrossChainBridgeNetworkPair {
  readonly sourceNetworkId: CrossChainNetworkId;
  readonly destinationNetworkId: CrossChainNetworkId;
  readonly bidirectional: boolean;
}

export interface CrossChainBridgeAssetSupport {
  readonly sourceAsset: CrossChainAssetReference;
  readonly destinationAsset: CrossChainAssetReference;
  readonly minimumAmountAtomic: CrossChainIntegerString | null;
  readonly maximumAmountAtomic: CrossChainIntegerString | null;
  readonly dailyLimitAtomic: CrossChainIntegerString | null;
  readonly requiresDestinationClaim: boolean;
}

export interface CrossChainBridgeCapabilities {
  readonly supportsAtomicExecution: boolean;
  readonly supportsContractCalls: boolean;
  readonly supportsNativeAssets: boolean;
  readonly supportsTokenAssets: boolean;
  readonly supportsGasDrop: boolean;
  readonly supportsRefunds: boolean;
  readonly supportsDestinationClaims: boolean;
  readonly supportsTransactionReplacement: boolean;
  readonly supportsStatusPolling: boolean;
  readonly supportsWebhooks: boolean;
  readonly supportsFinalityProofs: boolean;
  readonly maximumRouteHops: number;
}

export interface CrossChainBridgeDefinition {
  readonly bridgeId: CrossChainBridgeId;
  readonly name: string;
  readonly type: CrossChainBridgeType;
  readonly securityModel: CrossChainBridgeSecurityModel;
  readonly enabled: boolean;
  readonly networkPairs: readonly CrossChainBridgeNetworkPair[];
  readonly supportedAssets: readonly CrossChainBridgeAssetSupport[];
  readonly capabilities: CrossChainBridgeCapabilities;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainLiquidityNode {
  readonly nodeId: CrossChainIdentifier;
  readonly network: CrossChainNetworkReference;
  readonly asset: CrossChainAssetReference;
  readonly availableLiquidityAtomic: CrossChainIntegerString;
  readonly availableLiquidityDecimal: CrossChainDecimalString;
  readonly usdValue: CrossChainDecimalString | null;
  readonly observedAt: CrossChainTimestamp;
}

export interface CrossChainLiquidityEdge {
  readonly edgeId: CrossChainIdentifier;
  readonly sourceNodeId: CrossChainIdentifier;
  readonly destinationNodeId: CrossChainIdentifier;
  readonly bridgeId: CrossChainBridgeId | null;
  readonly venueId: CrossChainIdentifier | null;
  readonly capacityAtomic: CrossChainIntegerString;
  readonly estimatedFeeUsd: CrossChainDecimalString | null;
  readonly estimatedLatencyMilliseconds: number;
  readonly enabled: boolean;
  readonly observedAt: CrossChainTimestamp;
}

export interface CrossChainLiquidityGraph {
  readonly graphId: CrossChainIdentifier;
  readonly version: number;
  readonly nodes: readonly CrossChainLiquidityNode[];
  readonly edges: readonly CrossChainLiquidityEdge[];
  readonly generatedAt: CrossChainTimestamp;
}

export interface CrossChainBridgeQuoteRequest {
  readonly requestId: CrossChainIdentifier;
  readonly bridgeId: CrossChainBridgeId;
  readonly sourceNetwork: CrossChainNetworkReference;
  readonly destinationNetwork: CrossChainNetworkReference;
  readonly sourceAmount: CrossChainAmount;
  readonly destinationAsset: CrossChainAssetReference;
  readonly senderAddress: CrossChainAddress;
  readonly recipientAddress: CrossChainAddress;
  readonly maximumSlippageBps: number;
  readonly requestedAt: CrossChainTimestamp;
  readonly deadline: CrossChainTimestamp;
}

export interface CrossChainBridgeQuote {
  readonly quoteId: CrossChainQuoteId;
  readonly requestId: CrossChainIdentifier;
  readonly bridgeId: CrossChainBridgeId;
  readonly status: CrossChainQuoteStatus;
  readonly sourceAmount: CrossChainAmount;
  readonly estimatedDestinationAmount: CrossChainAmount;
  readonly minimumDestinationAmount: CrossChainAmount;
  readonly feeEstimate: CrossChainFeeEstimate;
  readonly latencyEstimate: CrossChainLatencyEstimate;
  readonly validFrom: CrossChainTimestamp;
  readonly expiresAt: CrossChainTimestamp;
  readonly providerReference: string | null;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainPriceObservation {
  readonly networkId: CrossChainNetworkId;
  readonly venueId: CrossChainIdentifier;
  readonly baseAsset: CrossChainAssetReference;
  readonly quoteAsset: CrossChainAssetReference;
  readonly bidPrice: CrossChainDecimalString;
  readonly askPrice: CrossChainDecimalString;
  readonly midPrice: CrossChainDecimalString;
  readonly availableBaseLiquidityAtomic: CrossChainIntegerString;
  readonly availableQuoteLiquidityAtomic: CrossChainIntegerString;
  readonly observedAt: CrossChainTimestamp;
}

export interface CrossChainOpportunityLeg {
  readonly legId: CrossChainIdentifier;
  readonly sequence: number;
  readonly type: CrossChainRouteStepType;
  readonly sourceNetworkId: CrossChainNetworkId;
  readonly destinationNetworkId: CrossChainNetworkId;
  readonly venueId: CrossChainIdentifier | null;
  readonly bridgeId: CrossChainBridgeId | null;
  readonly inputAmount: CrossChainAmount;
  readonly expectedOutputAmount: CrossChainAmount;
  readonly minimumOutputAmount: CrossChainAmount;
  readonly expectedFeeUsd: CrossChainDecimalString | null;
  readonly expectedLatencyMilliseconds: number;
}

export interface CrossChainProfitabilityBreakdown {
  readonly initialCapitalUsd: CrossChainDecimalString;
  readonly grossProceedsUsd: CrossChainDecimalString;
  readonly grossProfitUsd: CrossChainDecimalString;
  readonly sourceTradingFeesUsd: CrossChainDecimalString;
  readonly bridgeFeesUsd: CrossChainDecimalString;
  readonly destinationTradingFeesUsd: CrossChainDecimalString;
  readonly networkFeesUsd: CrossChainDecimalString;
  readonly slippageCostUsd: CrossChainDecimalString;
  readonly riskBufferUsd: CrossChainDecimalString;
  readonly netProfitUsd: CrossChainDecimalString;
  readonly returnOnCapitalBps: number;
  readonly annualizedReturnBps: number | null;
  readonly profitable: boolean;
  readonly calculatedAt: CrossChainTimestamp;
}

export interface CrossChainArbitrageOpportunity {
  readonly opportunityId: CrossChainOpportunityId;
  readonly status: CrossChainOpportunityStatus;
  readonly sourceNetwork: CrossChainNetworkReference;
  readonly destinationNetwork: CrossChainNetworkReference;
  readonly inputAmount: CrossChainAmount;
  readonly expectedFinalAmount: CrossChainAmount;
  readonly legs: readonly CrossChainOpportunityLeg[];
  readonly bridgeQuotes: readonly CrossChainBridgeQuote[];
  readonly profitability: CrossChainProfitabilityBreakdown;
  readonly confidence: number;
  readonly discoveredAt: CrossChainTimestamp;
  readonly expiresAt: CrossChainTimestamp;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainRouteConstraint {
  readonly allowedBridgeIds: readonly CrossChainBridgeId[];
  readonly deniedBridgeIds: readonly CrossChainBridgeId[];
  readonly allowedNetworkIds: readonly CrossChainNetworkId[];
  readonly maximumBridgeHops: number;
  readonly maximumTotalLatencyMilliseconds: number;
  readonly maximumTotalFeeUsd: CrossChainDecimalString | null;
  readonly minimumNetProfitUsd: CrossChainDecimalString;
  readonly minimumReturnOnCapitalBps: number;
  readonly requireAtomicExecution: boolean;
  readonly requireRefundSupport: boolean;
  readonly requireFinalityProofs: boolean;
}

export interface CrossChainRouteOptimizationRequest {
  readonly requestId: CrossChainIdentifier;
  readonly opportunity: CrossChainArbitrageOpportunity;
  readonly liquidityGraph: CrossChainLiquidityGraph;
  readonly constraints: CrossChainRouteConstraint;
  readonly requestedAt: CrossChainTimestamp;
}

export interface CrossChainOptimizedRoute {
  readonly routeId: CrossChainRouteId;
  readonly opportunityId: CrossChainOpportunityId;
  readonly executionMode: CrossChainExecutionMode;
  readonly legs: readonly CrossChainOpportunityLeg[];
  readonly selectedQuotes: readonly CrossChainBridgeQuote[];
  readonly profitability: CrossChainProfitabilityBreakdown;
  readonly totalExpectedLatencyMilliseconds: number;
  readonly atomicExecutionAvailable: boolean;
  readonly optimizationScore: number;
  readonly createdAt: CrossChainTimestamp;
  readonly expiresAt: CrossChainTimestamp;
}

export interface CrossChainTransactionInstruction {
  readonly instructionId: CrossChainIdentifier;
  readonly sequence: number;
  readonly networkId: CrossChainNetworkId;
  readonly type: CrossChainRouteStepType;
  readonly fromAddress: CrossChainAddress;
  readonly toAddress: CrossChainAddress;
  readonly valueAtomic: CrossChainIntegerString;
  readonly data: string | null;
  readonly gasEstimate: CrossChainGasEstimate | null;
  readonly dependsOnInstructionIds: readonly CrossChainIdentifier[];
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainExecutionCondition {
  readonly conditionId: CrossChainIdentifier;
  readonly description: string;
  readonly required: boolean;
  readonly checkType:
    | "BALANCE"
    | "ALLOWANCE"
    | "PRICE"
    | "LIQUIDITY"
    | "BRIDGE_AVAILABILITY"
    | "PROFITABILITY"
    | "FINALITY"
    | "DEADLINE";
  readonly parameters: CrossChainReadonlyRecord;
}

export interface CrossChainExecutionPlan {
  readonly planId: CrossChainExecutionPlanId;
  readonly opportunityId: CrossChainOpportunityId;
  readonly routeId: CrossChainRouteId;
  readonly executionMode: CrossChainExecutionMode;
  readonly instructions: readonly CrossChainTransactionInstruction[];
  readonly preconditions: readonly CrossChainExecutionCondition[];
  readonly profitability: CrossChainProfitabilityBreakdown;
  readonly senderAddresses: Readonly<
    Record<CrossChainNetworkId, CrossChainAddress>
  >;
  readonly recipientAddresses: Readonly<
    Record<CrossChainNetworkId, CrossChainAddress>
  >;
  readonly createdAt: CrossChainTimestamp;
  readonly expiresAt: CrossChainTimestamp;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainTransactionReference {
  readonly instructionId: CrossChainIdentifier;
  readonly networkId: CrossChainNetworkId;
  readonly transactionHash: CrossChainTransactionHash;
  readonly nonce: CrossChainIntegerString | null;
  readonly status: CrossChainTransactionStatus;
  readonly submittedAt: CrossChainTimestamp;
  readonly confirmedAt: CrossChainTimestamp | null;
  readonly finalizedAt: CrossChainTimestamp | null;
  readonly blockNumber: CrossChainIntegerString | null;
  readonly blockHash: string | null;
  readonly failureReason: string | null;
}

export interface CrossChainBridgeTransferReference {
  readonly bridgeId: CrossChainBridgeId;
  readonly quoteId: CrossChainQuoteId;
  readonly providerTransferId: string | null;
  readonly sourceTransactionHash: CrossChainTransactionHash;
  readonly destinationTransactionHash: CrossChainTransactionHash | null;
  readonly sourceNetworkId: CrossChainNetworkId;
  readonly destinationNetworkId: CrossChainNetworkId;
  readonly sourceAmount: CrossChainAmount;
  readonly expectedDestinationAmount: CrossChainAmount;
  readonly receivedDestinationAmount: CrossChainAmount | null;
  readonly initiatedAt: CrossChainTimestamp;
  readonly completedAt: CrossChainTimestamp | null;
}

export interface CrossChainSettlementVerification {
  readonly verificationId: CrossChainIdentifier;
  readonly executionId: CrossChainExecutionId;
  readonly status: CrossChainSettlementStatus;
  readonly expectedFinalAmount: CrossChainAmount;
  readonly actualFinalAmount: CrossChainAmount | null;
  readonly amountDifferenceAtomic: CrossChainIntegerString | null;
  readonly sourceTransactionsFinalized: boolean;
  readonly destinationTransactionsFinalized: boolean;
  readonly bridgeTransferVerified: boolean;
  readonly finalityProofVerified: boolean | null;
  readonly verifiedAt: CrossChainTimestamp;
  readonly failureReason: string | null;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainExecutionFailure {
  readonly failureId: CrossChainIdentifier;
  readonly category: CrossChainFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly failedInstructionId: CrossChainIdentifier | null;
  readonly networkId: CrossChainNetworkId | null;
  readonly bridgeId: CrossChainBridgeId | null;
  readonly transactionHash: CrossChainTransactionHash | null;
  readonly occurredAt: CrossChainTimestamp;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainRecoveryPlan {
  readonly recoveryPlanId: CrossChainIdentifier;
  readonly executionId: CrossChainExecutionId;
  readonly action: CrossChainRecoveryAction;
  readonly failure: CrossChainExecutionFailure;
  readonly instructions: readonly CrossChainTransactionInstruction[];
  readonly automaticExecutionAllowed: boolean;
  readonly maximumAttempts: number;
  readonly retryDelayMilliseconds: number;
  readonly createdAt: CrossChainTimestamp;
  readonly expiresAt: CrossChainTimestamp | null;
}

export interface CrossChainExecutionRecord {
  readonly executionId: CrossChainExecutionId;
  readonly plan: CrossChainExecutionPlan;
  readonly status: CrossChainExecutionStatus;
  readonly transactions: readonly CrossChainTransactionReference[];
  readonly bridgeTransfers: readonly CrossChainBridgeTransferReference[];
  readonly settlement: CrossChainSettlementVerification | null;
  readonly failure: CrossChainExecutionFailure | null;
  readonly recoveryPlan: CrossChainRecoveryPlan | null;
  readonly startedAt: CrossChainTimestamp;
  readonly updatedAt: CrossChainTimestamp;
  readonly completedAt: CrossChainTimestamp | null;
  readonly version: number;
  readonly metadata: CrossChainReadonlyRecord;
}

export interface CrossChainOpportunityDiscoveryRequest {
  readonly requestId: CrossChainIdentifier;
  readonly sourceNetworks: readonly CrossChainNetworkReference[];
  readonly destinationNetworks: readonly CrossChainNetworkReference[];
  readonly candidateAssets: readonly CrossChainAssetReference[];
  readonly capitalAmount: CrossChainAmount;
  readonly constraints: CrossChainRouteConstraint;
  readonly requestedAt: CrossChainTimestamp;
}

export interface CrossChainOpportunityDiscoveryResult {
  readonly requestId: CrossChainIdentifier;
  readonly opportunities: readonly CrossChainArbitrageOpportunity[];
  readonly evaluatedRouteCount: number;
  readonly rejectedRouteCount: number;
  readonly generatedAt: CrossChainTimestamp;
}

export interface CrossChainExecutionPlannerRequest {
  readonly requestId: CrossChainIdentifier;
  readonly route: CrossChainOptimizedRoute;
  readonly senderAddresses: Readonly<
    Record<CrossChainNetworkId, CrossChainAddress>
  >;
  readonly recipientAddresses: Readonly<
    Record<CrossChainNetworkId, CrossChainAddress>
  >;
  readonly requestedAt: CrossChainTimestamp;
}

export interface CrossChainExecutionSubmission {
  readonly executionId: CrossChainExecutionId;
  readonly planId: CrossChainExecutionPlanId;
  readonly idempotencyKey: string;
  readonly submittedAt: CrossChainTimestamp;
}

export interface CrossChainMonitoringSnapshot {
  readonly executionId: CrossChainExecutionId;
  readonly status: CrossChainExecutionStatus;
  readonly transactions: readonly CrossChainTransactionReference[];
  readonly bridgeTransfers: readonly CrossChainBridgeTransferReference[];
  readonly settlementStatus: CrossChainSettlementStatus | null;
  readonly observedAt: CrossChainTimestamp;
}

export interface CrossChainDeterministicContext {
  readonly now: () => CrossChainTimestamp;
  readonly createId: (
    namespace: string,
    components: readonly (
      | string
      | number
      | boolean
      | null
      | undefined
    )[],
  ) => string;
}

export interface CrossChainOpportunityDiscoverer {
  discover(
    request: CrossChainOpportunityDiscoveryRequest,
  ): Promise<CrossChainOpportunityDiscoveryResult>;
}

export interface CrossChainLiquidityGraphProvider {
  getLiquidityGraph(
    networkIds: readonly CrossChainNetworkId[],
    observedAt: CrossChainTimestamp,
  ): Promise<CrossChainLiquidityGraph>;
}

export interface CrossChainBridgeRegistry {
  getBridge(
    bridgeId: CrossChainBridgeId,
  ): CrossChainBridgeDefinition | undefined;

  listBridges(): readonly CrossChainBridgeDefinition[];

  listEnabledBridges(): readonly CrossChainBridgeDefinition[];

  findBridgesForRoute(
    sourceNetworkId: CrossChainNetworkId,
    destinationNetworkId: CrossChainNetworkId,
    sourceAssetId?: CrossChainIdentifier,
    destinationAssetId?: CrossChainIdentifier,
  ): readonly CrossChainBridgeDefinition[];
}

export interface CrossChainBridgeQuoteProvider {
  getQuote(
    request: CrossChainBridgeQuoteRequest,
  ): Promise<CrossChainBridgeQuote>;
}

export interface CrossChainFeeEstimator {
  estimateFees(
    request: CrossChainBridgeQuoteRequest,
    bridge: CrossChainBridgeDefinition,
  ): Promise<CrossChainFeeEstimate>;
}

export interface CrossChainLatencyEstimator {
  estimateLatency(
    request: CrossChainBridgeQuoteRequest,
    bridge: CrossChainBridgeDefinition,
  ): Promise<CrossChainLatencyEstimate>;
}

export interface CrossChainRouteOptimizer {
  optimize(
    request: CrossChainRouteOptimizationRequest,
  ): Promise<CrossChainOptimizedRoute>;
}

export interface CrossChainExecutionPlanner {
  createPlan(
    request: CrossChainExecutionPlannerRequest,
  ): Promise<CrossChainExecutionPlan>;
}

export interface CrossChainExecutionCoordinator {
  execute(
    submission: CrossChainExecutionSubmission,
    plan: CrossChainExecutionPlan,
  ): Promise<CrossChainExecutionRecord>;
}

export interface CrossChainTransactionMonitor {
  monitor(
    execution: CrossChainExecutionRecord,
  ): Promise<CrossChainMonitoringSnapshot>;
}

export interface CrossChainSettlementVerifier {
  verify(
    execution: CrossChainExecutionRecord,
  ): Promise<CrossChainSettlementVerification>;
}

export interface CrossChainFailureRecoveryEngine {
  createRecoveryPlan(
    execution: CrossChainExecutionRecord,
    failure: CrossChainExecutionFailure,
  ): Promise<CrossChainRecoveryPlan>;
}

export interface CrossChainProfitabilityEngine {
  calculate(
    inputAmount: CrossChainAmount,
    finalAmount: CrossChainAmount,
    fees: CrossChainFeeEstimate,
    expectedLatencyMilliseconds: number,
    calculatedAt: CrossChainTimestamp,
  ): CrossChainProfitabilityBreakdown;
}