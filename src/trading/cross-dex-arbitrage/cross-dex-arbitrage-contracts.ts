/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Shared contracts for:
 * - EVM-compatible blockchain networks
 * - DEX registries and adapters
 * - Pool discovery and state monitoring
 * - Token and pair normalization
 * - Cross-DEX quote comparison
 * - Two-leg and multi-hop arbitrage
 * - Wallet-funded and flash-funded execution
 * - Profitability, gas, slippage, and price-impact analysis
 * - Transaction simulation and MEV-protected submission
 * - Execution tracking, revert analysis, and circuit breakers
 *
 * This file intentionally contains domain contracts only. It must remain
 * deterministic and must not perform network, wallet, RPC, or clock access.
 */

export type CrossDexArbitrageBrand<
  TValue,
  TBrand extends string,
> = TValue & {
  readonly __brand: TBrand;
};

export type EvmAddress = CrossDexArbitrageBrand<string, "EvmAddress">;
export type TransactionHash = CrossDexArbitrageBrand<
  string,
  "TransactionHash"
>;
export type BlockHash = CrossDexArbitrageBrand<string, "BlockHash">;
export type HexData = CrossDexArbitrageBrand<string, "HexData">;
export type ChainId = CrossDexArbitrageBrand<number, "ChainId">;
export type BlockNumber = CrossDexArbitrageBrand<bigint, "BlockNumber">;
export type UnixTimestampMilliseconds = CrossDexArbitrageBrand<
  number,
  "UnixTimestampMilliseconds"
>;
export type BasisPoints = CrossDexArbitrageBrand<number, "BasisPoints">;
export type Percentage = CrossDexArbitrageBrand<number, "Percentage">;
export type TokenAmount = CrossDexArbitrageBrand<bigint, "TokenAmount">;
export type GasAmount = CrossDexArbitrageBrand<bigint, "GasAmount">;
export type WeiAmount = CrossDexArbitrageBrand<bigint, "WeiAmount">;
export type Nonce = CrossDexArbitrageBrand<bigint, "Nonce">;
export type ArbitrageOpportunityId = CrossDexArbitrageBrand<
  string,
  "ArbitrageOpportunityId"
>;
export type ArbitrageExecutionId = CrossDexArbitrageBrand<
  string,
  "ArbitrageExecutionId"
>;
export type ArbitrageRouteId = CrossDexArbitrageBrand<
  string,
  "ArbitrageRouteId"
>;
export type DexId = CrossDexArbitrageBrand<string, "DexId">;
export type PoolId = CrossDexArbitrageBrand<string, "PoolId">;
export type TokenId = CrossDexArbitrageBrand<string, "TokenId">;
export type FlashLoanProviderId = CrossDexArbitrageBrand<
  string,
  "FlashLoanProviderId"
>;
export type SimulationId = CrossDexArbitrageBrand<string, "SimulationId">;
export type SubmissionId = CrossDexArbitrageBrand<string, "SubmissionId">;

export type CrossDexArbitrageMetadataValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | readonly string[]
  | readonly number[]
  | readonly boolean[]
  | readonly bigint[];

export type CrossDexArbitrageMetadata = Readonly<
  Record<string, CrossDexArbitrageMetadataValue>
>;

export enum EvmNetwork {
  ETHEREUM = "ETHEREUM",
  ARBITRUM = "ARBITRUM",
  OPTIMISM = "OPTIMISM",
  BASE = "BASE",
  POLYGON = "POLYGON",
  BNB_SMART_CHAIN = "BNB_SMART_CHAIN",
  AVALANCHE = "AVALANCHE",
  LINEA = "LINEA",
  SCROLL = "SCROLL",
  ZKSYNC_ERA = "ZKSYNC_ERA",
  BLAST = "BLAST",
  GNOSIS = "GNOSIS",
  FANTOM = "FANTOM",
  CUSTOM = "CUSTOM",
}

export enum EvmNativeCurrencySymbol {
  ETH = "ETH",
  MATIC = "MATIC",
  BNB = "BNB",
  AVAX = "AVAX",
  XDAI = "XDAI",
  FTM = "FTM",
  CUSTOM = "CUSTOM",
}

export enum DexProtocolFamily {
  UNISWAP_V2 = "UNISWAP_V2",
  UNISWAP_V3 = "UNISWAP_V3",
  UNISWAP_V4 = "UNISWAP_V4",
  CURVE = "CURVE",
  BALANCER = "BALANCER",
  SOLIDLY = "SOLIDLY",
  MAVERICK = "MAVERICK",
  DODO = "DODO",
  KYBER = "KYBER",
  PANCAKESWAP = "PANCAKESWAP",
  SUSHISWAP = "SUSHISWAP",
  CAMELOT = "CAMELOT",
  CUSTOM = "CUSTOM",
}

export enum DexLiquidityModel {
  CONSTANT_PRODUCT = "CONSTANT_PRODUCT",
  CONCENTRATED_LIQUIDITY = "CONCENTRATED_LIQUIDITY",
  STABLE_SWAP = "STABLE_SWAP",
  WEIGHTED_POOL = "WEIGHTED_POOL",
  HYBRID = "HYBRID",
  ORDER_BOOK = "ORDER_BOOK",
  CUSTOM = "CUSTOM",
}

export enum PoolStatus {
  DISCOVERED = "DISCOVERED",
  ACTIVE = "ACTIVE",
  STALE = "STALE",
  PAUSED = "PAUSED",
  DISABLED = "DISABLED",
  UNSUPPORTED = "UNSUPPORTED",
  ERROR = "ERROR",
}

export enum QuoteSource {
  LOCAL_POOL_STATE = "LOCAL_POOL_STATE",
  RPC_CALL = "RPC_CALL",
  DEX_QUOTER = "DEX_QUOTER",
  ROUTER_SIMULATION = "ROUTER_SIMULATION",
  EXTERNAL_AGGREGATOR = "EXTERNAL_AGGREGATOR",
}

export enum SwapDirection {
  EXACT_INPUT = "EXACT_INPUT",
  EXACT_OUTPUT = "EXACT_OUTPUT",
}

export enum ArbitrageRouteType {
  TWO_LEG = "TWO_LEG",
  TRIANGULAR = "TRIANGULAR",
  MULTI_HOP = "MULTI_HOP",
}

export enum ArbitrageFundingMode {
  WALLET = "WALLET",
  FLASH_LOAN = "FLASH_LOAN",
  FLASH_SWAP = "FLASH_SWAP",
  AUTO = "AUTO",
  PAPER = "PAPER",
}

export enum FlashLiquidityType {
  FLASH_LOAN = "FLASH_LOAN",
  FLASH_SWAP = "FLASH_SWAP",
}

export enum FlashLoanProtocol {
  AAVE_V3 = "AAVE_V3",
  AAVE_V2 = "AAVE_V2",
  BALANCER_VAULT = "BALANCER_VAULT",
  UNISWAP_V2_FLASH_SWAP = "UNISWAP_V2_FLASH_SWAP",
  UNISWAP_V3_FLASH = "UNISWAP_V3_FLASH",
  PANCAKESWAP_FLASH_SWAP = "PANCAKESWAP_FLASH_SWAP",
  DODO_FLASH_LOAN = "DODO_FLASH_LOAN",
  CUSTOM = "CUSTOM",
}

export enum ExecutionMode {
  PAPER = "PAPER",
  LIVE = "LIVE",
}

export enum TransactionSubmissionMode {
  PUBLIC_MEMPOOL = "PUBLIC_MEMPOOL",
  PRIVATE_RELAY = "PRIVATE_RELAY",
  BUILDER_BUNDLE = "BUILDER_BUNDLE",
  RPC_PRIVATE_TRANSACTION = "RPC_PRIVATE_TRANSACTION",
  PAPER = "PAPER",
}

export enum GasPricingMode {
  LEGACY = "LEGACY",
  EIP_1559 = "EIP_1559",
  PROVIDER_MANAGED = "PROVIDER_MANAGED",
}

export enum ArbitrageOpportunityStatus {
  DETECTED = "DETECTED",
  VALIDATING = "VALIDATING",
  VALID = "VALID",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
  RESERVED = "RESERVED",
  EXECUTING = "EXECUTING",
  EXECUTED = "EXECUTED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum ArbitrageExecutionStatus {
  CREATED = "CREATED",
  VALIDATING = "VALIDATING",
  SIMULATING = "SIMULATING",
  SIMULATION_SUCCEEDED = "SIMULATION_SUCCEEDED",
  SIMULATION_FAILED = "SIMULATION_FAILED",
  SIGNING = "SIGNING",
  SUBMITTING = "SUBMITTING",
  SUBMITTED = "SUBMITTED",
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  REVERTED = "REVERTED",
  DROPPED = "DROPPED",
  REPLACED = "REPLACED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
  PAPER_EXECUTED = "PAPER_EXECUTED",
  FAILED = "FAILED",
}

export enum SimulationStatus {
  NOT_STARTED = "NOT_STARTED",
  SUCCEEDED = "SUCCEEDED",
  REVERTED = "REVERTED",
  RPC_ERROR = "RPC_ERROR",
  TIMEOUT = "TIMEOUT",
  INDETERMINATE = "INDETERMINATE",
}

export enum ValidationSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

export enum ValidationCode {
  VALID = "VALID",
  INVALID_CHAIN = "INVALID_CHAIN",
  INVALID_TOKEN = "INVALID_TOKEN",
  INVALID_PAIR = "INVALID_PAIR",
  INVALID_POOL = "INVALID_POOL",
  INVALID_ROUTE = "INVALID_ROUTE",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  ZERO_INPUT_AMOUNT = "ZERO_INPUT_AMOUNT",
  INSUFFICIENT_LIQUIDITY = "INSUFFICIENT_LIQUIDITY",
  INSUFFICIENT_WALLET_BALANCE = "INSUFFICIENT_WALLET_BALANCE",
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",
  FLASH_LIQUIDITY_UNAVAILABLE = "FLASH_LIQUIDITY_UNAVAILABLE",
  FLASH_LOAN_PREMIUM_TOO_HIGH = "FLASH_LOAN_PREMIUM_TOO_HIGH",
  STALE_POOL_STATE = "STALE_POOL_STATE",
  STALE_QUOTE = "STALE_QUOTE",
  SLIPPAGE_TOO_HIGH = "SLIPPAGE_TOO_HIGH",
  PRICE_IMPACT_TOO_HIGH = "PRICE_IMPACT_TOO_HIGH",
  GAS_COST_TOO_HIGH = "GAS_COST_TOO_HIGH",
  DEX_FEE_TOO_HIGH = "DEX_FEE_TOO_HIGH",
  NET_PROFIT_TOO_LOW = "NET_PROFIT_TOO_LOW",
  PROFIT_MARGIN_TOO_LOW = "PROFIT_MARGIN_TOO_LOW",
  SIMULATION_REQUIRED = "SIMULATION_REQUIRED",
  SIMULATION_FAILED = "SIMULATION_FAILED",
  REVERT_PREDICTED = "REVERT_PREDICTED",
  EXECUTOR_NOT_CONFIGURED = "EXECUTOR_NOT_CONFIGURED",
  PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED",
  NONCE_UNAVAILABLE = "NONCE_UNAVAILABLE",
  GAS_PRICE_UNAVAILABLE = "GAS_PRICE_UNAVAILABLE",
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
  RISK_LIMIT_EXCEEDED = "RISK_LIMIT_EXCEEDED",
  OPPORTUNITY_EXPIRED = "OPPORTUNITY_EXPIRED",
  BLOCK_NUMBER_MISMATCH = "BLOCK_NUMBER_MISMATCH",
  DUPLICATE_POOL = "DUPLICATE_POOL",
  DUPLICATE_DEX = "DUPLICATE_DEX",
  ROUTE_NOT_ATOMIC = "ROUTE_NOT_ATOMIC",
  TOKEN_TRANSFER_TAX_UNSUPPORTED = "TOKEN_TRANSFER_TAX_UNSUPPORTED",
  TOKEN_REBASE_UNSUPPORTED = "TOKEN_REBASE_UNSUPPORTED",
  TOKEN_BLACKLISTED = "TOKEN_BLACKLISTED",
  DEX_DISABLED = "DEX_DISABLED",
  POOL_DISABLED = "POOL_DISABLED",
  EXECUTION_MODE_DISABLED = "EXECUTION_MODE_DISABLED",
  PRIVATE_SUBMISSION_REQUIRED = "PRIVATE_SUBMISSION_REQUIRED",
  UNKNOWN = "UNKNOWN",
}

export enum RevertClassification {
  NONE = "NONE",
  SLIPPAGE = "SLIPPAGE",
  INSUFFICIENT_OUTPUT = "INSUFFICIENT_OUTPUT",
  INSUFFICIENT_INPUT = "INSUFFICIENT_INPUT",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",
  EXPIRED_DEADLINE = "EXPIRED_DEADLINE",
  POOL_LIQUIDITY_CHANGED = "POOL_LIQUIDITY_CHANGED",
  FLASH_LOAN_REPAYMENT_FAILED = "FLASH_LOAN_REPAYMENT_FAILED",
  FLASH_LOAN_CALLBACK_FAILED = "FLASH_LOAN_CALLBACK_FAILED",
  UNAUTHORIZED_EXECUTOR = "UNAUTHORIZED_EXECUTOR",
  INVALID_ROUTE = "INVALID_ROUTE",
  INVALID_CALLDATA = "INVALID_CALLDATA",
  GAS_EXHAUSTED = "GAS_EXHAUSTED",
  NONCE_CONFLICT = "NONCE_CONFLICT",
  MEV_INTERFERENCE = "MEV_INTERFERENCE",
  TOKEN_TRANSFER_FAILED = "TOKEN_TRANSFER_FAILED",
  CONTRACT_PAUSED = "CONTRACT_PAUSED",
  RPC_FAILURE = "RPC_FAILURE",
  UNKNOWN_CONTRACT_REVERT = "UNKNOWN_CONTRACT_REVERT",
  UNKNOWN = "UNKNOWN",
}

export enum CircuitBreakerType {
  GLOBAL_EXECUTION = "GLOBAL_EXECUTION",
  CHAIN_EXECUTION = "CHAIN_EXECUTION",
  DEX_EXECUTION = "DEX_EXECUTION",
  TOKEN_EXECUTION = "TOKEN_EXECUTION",
  POOL_EXECUTION = "POOL_EXECUTION",
  FLASH_LOAN_EXECUTION = "FLASH_LOAN_EXECUTION",
  PUBLIC_MEMPOOL_EXECUTION = "PUBLIC_MEMPOOL_EXECUTION",
}

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export enum RiskLimitScope {
  GLOBAL = "GLOBAL",
  CHAIN = "CHAIN",
  DEX = "DEX",
  TOKEN = "TOKEN",
  POOL = "POOL",
  ROUTE = "ROUTE",
  FUNDING_PROVIDER = "FUNDING_PROVIDER",
}

export enum OptimizationObjective {
  MAXIMIZE_NET_PROFIT = "MAXIMIZE_NET_PROFIT",
  MAXIMIZE_PROFIT_BPS = "MAXIMIZE_PROFIT_BPS",
  MAXIMIZE_RETURN_ON_GAS = "MAXIMIZE_RETURN_ON_GAS",
  MINIMIZE_PRICE_IMPACT = "MINIMIZE_PRICE_IMPACT",
  MINIMIZE_EXECUTION_RISK = "MINIMIZE_EXECUTION_RISK",
}

export interface EvmNetworkDescriptor {
  readonly network: EvmNetwork;
  readonly chainId: ChainId;
  readonly name: string;
  readonly nativeCurrencySymbol: EvmNativeCurrencySymbol;
  readonly nativeCurrencyDecimals: number;
  readonly wrappedNativeTokenAddress: EvmAddress;
  readonly blockExplorerBaseUrl?: string;
  readonly supportsEip1559: boolean;
  readonly supportsPrivateTransactions: boolean;
  readonly averageBlockTimeMilliseconds: number;
  readonly confirmationBlocks: number;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface EvmBlockReference {
  readonly chainId: ChainId;
  readonly blockNumber: BlockNumber;
  readonly blockHash?: BlockHash;
  readonly timestampMilliseconds: UnixTimestampMilliseconds;
}

export interface TokenDescriptor {
  readonly id: TokenId;
  readonly chainId: ChainId;
  readonly address: EvmAddress;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly isNative: boolean;
  readonly wrappedTokenAddress?: EvmAddress;
  readonly canonicalSymbol?: string;
  readonly coingeckoId?: string;
  readonly transferTaxBasisPoints?: BasisPoints;
  readonly isRebasing?: boolean;
  readonly isBlacklisted?: boolean;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface NormalizedTokenPair {
  readonly chainId: ChainId;
  readonly token0: TokenDescriptor;
  readonly token1: TokenDescriptor;
  readonly pairKey: string;
}

export interface DexDescriptor {
  readonly id: DexId;
  readonly chainId: ChainId;
  readonly name: string;
  readonly protocolFamily: DexProtocolFamily;
  readonly liquidityModel: DexLiquidityModel;
  readonly factoryAddress?: EvmAddress;
  readonly routerAddress?: EvmAddress;
  readonly quoterAddress?: EvmAddress;
  readonly positionManagerAddress?: EvmAddress;
  readonly vaultAddress?: EvmAddress;
  readonly feeCollectorAddress?: EvmAddress;
  readonly supportedFeeTiersBasisPoints: readonly BasisPoints[];
  readonly supportsExactInput: boolean;
  readonly supportsExactOutput: boolean;
  readonly supportsMultiHop: boolean;
  readonly supportsFlashSwap: boolean;
  readonly supportsFeeOnTransferTokens: boolean;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DexPoolDescriptor {
  readonly id: PoolId;
  readonly chainId: ChainId;
  readonly dexId: DexId;
  readonly address: EvmAddress;
  readonly token0: TokenDescriptor;
  readonly token1: TokenDescriptor;
  readonly liquidityModel: DexLiquidityModel;
  readonly feeBasisPoints: BasisPoints;
  readonly tickSpacing?: number;
  readonly poolVersion?: string;
  readonly createdBlockNumber?: BlockNumber;
  readonly status: PoolStatus;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ConstantProductPoolState {
  readonly model: DexLiquidityModel.CONSTANT_PRODUCT;
  readonly reserve0: TokenAmount;
  readonly reserve1: TokenAmount;
  readonly invariant: bigint;
}

export interface ConcentratedLiquidityPoolState {
  readonly model: DexLiquidityModel.CONCENTRATED_LIQUIDITY;
  readonly sqrtPriceX96: bigint;
  readonly liquidity: bigint;
  readonly tick: number;
  readonly observationIndex?: number;
  readonly observationCardinality?: number;
  readonly observationCardinalityNext?: number;
  readonly feeProtocol?: number;
}

export interface StableSwapPoolState {
  readonly model: DexLiquidityModel.STABLE_SWAP;
  readonly balances: readonly TokenAmount[];
  readonly amplificationCoefficient: bigint;
  readonly virtualPrice?: bigint;
}

export interface WeightedPoolState {
  readonly model: DexLiquidityModel.WEIGHTED_POOL;
  readonly balances: readonly TokenAmount[];
  readonly normalizedWeights: readonly bigint[];
  readonly swapFeePercentage?: bigint;
}

export interface HybridPoolState {
  readonly model: DexLiquidityModel.HYBRID;
  readonly balances: readonly TokenAmount[];
  readonly stateData: CrossDexArbitrageMetadata;
}

export interface OrderBookPoolState {
  readonly model: DexLiquidityModel.ORDER_BOOK;
  readonly bestBidPrice: bigint;
  readonly bestAskPrice: bigint;
  readonly bestBidQuantity: TokenAmount;
  readonly bestAskQuantity: TokenAmount;
}

export interface CustomPoolState {
  readonly model: DexLiquidityModel.CUSTOM;
  readonly stateData: CrossDexArbitrageMetadata;
}

export type DexPoolModelState =
  | ConstantProductPoolState
  | ConcentratedLiquidityPoolState
  | StableSwapPoolState
  | WeightedPoolState
  | HybridPoolState
  | OrderBookPoolState
  | CustomPoolState;

export interface DexPoolState {
  readonly pool: DexPoolDescriptor;
  readonly blockReference: EvmBlockReference;
  readonly modelState: DexPoolModelState;
  readonly totalValueLockedUsd?: number;
  readonly token0PriceUsd?: number;
  readonly token1PriceUsd?: number;
  readonly stateVersion: string;
  readonly observedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PoolDiscoveryRequest {
  readonly chainId: ChainId;
  readonly dexIds?: readonly DexId[];
  readonly tokenAddresses?: readonly EvmAddress[];
  readonly fromBlockNumber?: BlockNumber;
  readonly toBlockNumber?: BlockNumber;
  readonly includeDisabledPools?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PoolDiscoveryResult {
  readonly chainId: ChainId;
  readonly pools: readonly DexPoolDescriptor[];
  readonly scannedFromBlockNumber?: BlockNumber;
  readonly scannedToBlockNumber?: BlockNumber;
  readonly discoveredAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DexQuoteRequest {
  readonly chainId: ChainId;
  readonly dexId: DexId;
  readonly poolId?: PoolId;
  readonly tokenIn: TokenDescriptor;
  readonly tokenOut: TokenDescriptor;
  readonly direction: SwapDirection;
  readonly amount: TokenAmount;
  readonly recipient?: EvmAddress;
  readonly blockNumber?: BlockNumber;
  readonly maxSlippageBasisPoints?: BasisPoints;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DexFeeBreakdown {
  readonly feeToken: TokenDescriptor;
  readonly feeAmount: TokenAmount;
  readonly feeBasisPoints: BasisPoints;
  readonly feeAmountUsd?: number;
}

export interface DexQuote {
  readonly quoteId: string;
  readonly chainId: ChainId;
  readonly dexId: DexId;
  readonly poolId?: PoolId;
  readonly source: QuoteSource;
  readonly direction: SwapDirection;
  readonly tokenIn: TokenDescriptor;
  readonly tokenOut: TokenDescriptor;
  readonly amountIn: TokenAmount;
  readonly amountOut: TokenAmount;
  readonly minimumAmountOut: TokenAmount;
  readonly maximumAmountIn?: TokenAmount;
  readonly executionPrice: bigint;
  readonly referencePrice?: bigint;
  readonly priceImpactBasisPoints: BasisPoints;
  readonly estimatedSlippageBasisPoints: BasisPoints;
  readonly dexFee: DexFeeBreakdown;
  readonly gasEstimate?: GasAmount;
  readonly routeCalldata?: HexData;
  readonly routeTarget?: EvmAddress;
  readonly blockReference: EvmBlockReference;
  readonly quotedAtMilliseconds: UnixTimestampMilliseconds;
  readonly expiresAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageLeg {
  readonly legIndex: number;
  readonly chainId: ChainId;
  readonly dexId: DexId;
  readonly poolId?: PoolId;
  readonly tokenIn: TokenDescriptor;
  readonly tokenOut: TokenDescriptor;
  readonly amountIn: TokenAmount;
  readonly expectedAmountOut: TokenAmount;
  readonly minimumAmountOut: TokenAmount;
  readonly quote: DexQuote;
  readonly target: EvmAddress;
  readonly calldata: HexData;
  readonly value: WeiAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageRoute {
  readonly id: ArbitrageRouteId;
  readonly chainId: ChainId;
  readonly type: ArbitrageRouteType;
  readonly startToken: TokenDescriptor;
  readonly endToken: TokenDescriptor;
  readonly inputAmount: TokenAmount;
  readonly expectedFinalAmount: TokenAmount;
  readonly minimumFinalAmount: TokenAmount;
  readonly legs: readonly ArbitrageLeg[];
  readonly isAtomic: boolean;
  readonly blockReference: EvmBlockReference;
  readonly createdAtMilliseconds: UnixTimestampMilliseconds;
  readonly expiresAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface CrossDexQuoteComparison {
  readonly chainId: ChainId;
  readonly tokenIn: TokenDescriptor;
  readonly tokenOut: TokenDescriptor;
  readonly amountIn: TokenAmount;
  readonly quotes: readonly DexQuote[];
  readonly bestBuyQuote?: DexQuote;
  readonly bestSellQuote?: DexQuote;
  readonly grossSpreadBasisPoints?: BasisPoints;
  readonly comparedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface GasPriceQuote {
  readonly chainId: ChainId;
  readonly mode: GasPricingMode;
  readonly gasPriceWei?: WeiAmount;
  readonly maxFeePerGasWei?: WeiAmount;
  readonly maxPriorityFeePerGasWei?: WeiAmount;
  readonly baseFeePerGasWei?: WeiAmount;
  readonly quotedAtMilliseconds: UnixTimestampMilliseconds;
  readonly validUntilMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface GasCostEstimate {
  readonly chainId: ChainId;
  readonly gasLimit: GasAmount;
  readonly pricing: GasPriceQuote;
  readonly estimatedCostWei: WeiAmount;
  readonly estimatedCostNative: number;
  readonly estimatedCostUsd?: number;
  readonly safetyMultiplier: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLoanProviderDescriptor {
  readonly id: FlashLoanProviderId;
  readonly chainId: ChainId;
  readonly name: string;
  readonly protocol: FlashLoanProtocol;
  readonly liquidityType: FlashLiquidityType;
  readonly providerAddress: EvmAddress;
  readonly callbackSelector?: HexData;
  readonly supportedTokenAddresses?: readonly EvmAddress[];
  readonly premiumBasisPoints: BasisPoints;
  readonly supportsMultiAsset: boolean;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityRequest {
  readonly providerId: FlashLoanProviderId;
  readonly chainId: ChainId;
  readonly liquidityType: FlashLiquidityType;
  readonly borrowerAddress: EvmAddress;
  readonly asset: TokenDescriptor;
  readonly amount: TokenAmount;
  readonly callbackData: HexData;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityQuote {
  readonly provider: FlashLoanProviderDescriptor;
  readonly asset: TokenDescriptor;
  readonly requestedAmount: TokenAmount;
  readonly availableAmount: TokenAmount;
  readonly premiumAmount: TokenAmount;
  readonly premiumBasisPoints: BasisPoints;
  readonly totalRepaymentAmount: TokenAmount;
  readonly premiumAmountUsd?: number;
  readonly blockReference: EvmBlockReference;
  readonly quotedAtMilliseconds: UnixTimestampMilliseconds;
  readonly expiresAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface WalletBalanceSnapshot {
  readonly chainId: ChainId;
  readonly walletAddress: EvmAddress;
  readonly token: TokenDescriptor;
  readonly balance: TokenAmount;
  readonly blockReference: EvmBlockReference;
  readonly observedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TokenAllowanceSnapshot {
  readonly chainId: ChainId;
  readonly ownerAddress: EvmAddress;
  readonly spenderAddress: EvmAddress;
  readonly token: TokenDescriptor;
  readonly allowance: TokenAmount;
  readonly blockReference: EvmBlockReference;
  readonly observedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface WalletFundingValidation {
  readonly walletAddress: EvmAddress;
  readonly token: TokenDescriptor;
  readonly requiredAmount: TokenAmount;
  readonly balance: TokenAmount;
  readonly allowanceRequired: boolean;
  readonly spenderAddress?: EvmAddress;
  readonly allowance?: TokenAmount;
  readonly hasSufficientBalance: boolean;
  readonly hasSufficientAllowance: boolean;
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface ArbitrageCostBreakdown {
  readonly inputToken: TokenDescriptor;
  readonly inputAmount: TokenAmount;
  readonly totalDexFeeAmount: TokenAmount;
  readonly totalDexFeeUsd?: number;
  readonly flashLoanPremiumAmount: TokenAmount;
  readonly flashLoanPremiumUsd?: number;
  readonly gasCostWei: WeiAmount;
  readonly gasCostUsd?: number;
  readonly slippageCostAmount: TokenAmount;
  readonly slippageCostUsd?: number;
  readonly priceImpactCostAmount: TokenAmount;
  readonly priceImpactCostUsd?: number;
  readonly mevProtectionCostWei?: WeiAmount;
  readonly mevProtectionCostUsd?: number;
  readonly totalEstimatedCostAmount: TokenAmount;
  readonly totalEstimatedCostUsd?: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageProfitability {
  readonly inputToken: TokenDescriptor;
  readonly inputAmount: TokenAmount;
  readonly grossOutputAmount: TokenAmount;
  readonly grossProfitAmount: TokenAmount;
  readonly grossProfitUsd?: number;
  readonly costs: ArbitrageCostBreakdown;
  readonly netOutputAmount: TokenAmount;
  readonly netProfitAmount: TokenAmount;
  readonly netProfitUsd?: number;
  readonly grossProfitBasisPoints: BasisPoints;
  readonly netProfitBasisPoints: BasisPoints;
  readonly returnOnGas?: number;
  readonly profitable: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TradeSizeOptimizationBounds {
  readonly minimumInputAmount: TokenAmount;
  readonly maximumInputAmount: TokenAmount;
  readonly stepAmount?: TokenAmount;
  readonly maximumIterations: number;
  readonly convergenceToleranceBasisPoints: BasisPoints;
}

export interface TradeSizeOptimizationRequest {
  readonly routeTemplate: ArbitrageRoute;
  readonly objective: OptimizationObjective;
  readonly bounds: TradeSizeOptimizationBounds;
  readonly maximumPriceImpactBasisPoints: BasisPoints;
  readonly maximumSlippageBasisPoints: BasisPoints;
  readonly minimumNetProfitAmount: TokenAmount;
  readonly minimumNetProfitBasisPoints: BasisPoints;
  readonly gasPrice: GasPriceQuote;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TradeSizeOptimizationSample {
  readonly iteration: number;
  readonly inputAmount: TokenAmount;
  readonly expectedOutputAmount: TokenAmount;
  readonly grossProfitAmount: TokenAmount;
  readonly netProfitAmount: TokenAmount;
  readonly netProfitBasisPoints: BasisPoints;
  readonly priceImpactBasisPoints: BasisPoints;
  readonly slippageBasisPoints: BasisPoints;
  readonly gasCostWei: WeiAmount;
  readonly feasible: boolean;
  readonly rejectionReason?: string;
}

export interface TradeSizeOptimizationResult {
  readonly request: TradeSizeOptimizationRequest;
  readonly optimalInputAmount?: TokenAmount;
  readonly optimalRoute?: ArbitrageRoute;
  readonly optimalProfitability?: ArbitrageProfitability;
  readonly samples: readonly TradeSizeOptimizationSample[];
  readonly converged: boolean;
  readonly iterations: number;
  readonly reason?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageOpportunity {
  readonly id: ArbitrageOpportunityId;
  readonly chainId: ChainId;
  readonly route: ArbitrageRoute;
  readonly fundingMode: ArbitrageFundingMode;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly profitability: ArbitrageProfitability;
  readonly status: ArbitrageOpportunityStatus;
  readonly confidence: number;
  readonly sourceBlockReference: EvmBlockReference;
  readonly detectedAtMilliseconds: UnixTimestampMilliseconds;
  readonly expiresAtMilliseconds: UnixTimestampMilliseconds;
  readonly validationIssues: readonly ValidationIssue[];
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageDetectionRequest {
  readonly chainId: ChainId;
  readonly baseTokens: readonly TokenDescriptor[];
  readonly dexIds: readonly DexId[];
  readonly poolStates: readonly DexPoolState[];
  readonly routeTypes: readonly ArbitrageRouteType[];
  readonly fundingModes: readonly ArbitrageFundingMode[];
  readonly minimumInputAmount: TokenAmount;
  readonly maximumInputAmount: TokenAmount;
  readonly minimumNetProfitAmount: TokenAmount;
  readonly minimumNetProfitBasisPoints: BasisPoints;
  readonly maximumRouteLegs: number;
  readonly maximumSlippageBasisPoints: BasisPoints;
  readonly maximumPriceImpactBasisPoints: BasisPoints;
  readonly maximumQuoteAgeMilliseconds: number;
  readonly requireAtomicExecution: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageDetectionResult {
  readonly chainId: ChainId;
  readonly evaluatedRouteCount: number;
  readonly rejectedRouteCount: number;
  readonly opportunities: readonly ArbitrageOpportunity[];
  readonly blockReference: EvmBlockReference;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly severity: ValidationSeverity;
  readonly message: string;
  readonly field?: string;
  readonly legIndex?: number;
  readonly dexId?: DexId;
  readonly poolId?: PoolId;
  readonly tokenAddress?: EvmAddress;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface ArbitrageRiskLimits {
  readonly scope: RiskLimitScope;
  readonly scopeId?: string;
  readonly maximumInputAmount?: TokenAmount;
  readonly maximumInputValueUsd?: number;
  readonly minimumNetProfitAmount?: TokenAmount;
  readonly minimumNetProfitUsd?: number;
  readonly minimumNetProfitBasisPoints: BasisPoints;
  readonly maximumGasCostWei?: WeiAmount;
  readonly maximumGasCostUsd?: number;
  readonly maximumDexFeeBasisPoints: BasisPoints;
  readonly maximumFlashLoanPremiumBasisPoints: BasisPoints;
  readonly maximumSlippageBasisPoints: BasisPoints;
  readonly maximumPriceImpactBasisPoints: BasisPoints;
  readonly maximumRouteLegs: number;
  readonly maximumPendingExecutions: number;
  readonly maximumExecutionsPerBlock: number;
  readonly maximumExecutionsPerMinute: number;
  readonly maximumConsecutiveFailures: number;
  readonly requireSimulation: boolean;
  readonly requirePrivateSubmission: boolean;
  readonly walletFundingEnabled: boolean;
  readonly flashLoanFundingEnabled: boolean;
  readonly flashSwapFundingEnabled: boolean;
  readonly liveExecutionEnabled: boolean;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface CircuitBreaker {
  readonly id: string;
  readonly type: CircuitBreakerType;
  readonly scopeId?: string;
  readonly state: CircuitBreakerState;
  readonly failureCount: number;
  readonly successCount: number;
  readonly openedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly lastFailureAtMilliseconds?: UnixTimestampMilliseconds;
  readonly lastSuccessAtMilliseconds?: UnixTimestampMilliseconds;
  readonly halfOpenAtMilliseconds?: UnixTimestampMilliseconds;
  readonly cooldownMilliseconds: number;
  readonly reason?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageExecutionRequest {
  readonly executionId: ArbitrageExecutionId;
  readonly opportunity: ArbitrageOpportunity;
  readonly executionMode: ExecutionMode;
  readonly fundingMode: ArbitrageFundingMode;
  readonly executorContractAddress: EvmAddress;
  readonly senderAddress: EvmAddress;
  readonly beneficiaryAddress: EvmAddress;
  readonly submissionMode: TransactionSubmissionMode;
  readonly gasPricing: GasPriceQuote;
  readonly gasLimit?: GasAmount;
  readonly nonce?: Nonce;
  readonly deadlineMilliseconds: UnixTimestampMilliseconds;
  readonly simulateBeforeSubmission: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface AtomicArbitrageExecutionPayload {
  readonly executionId: ArbitrageExecutionId;
  readonly chainId: ChainId;
  readonly executorContractAddress: EvmAddress;
  readonly senderAddress: EvmAddress;
  readonly beneficiaryAddress: EvmAddress;
  readonly fundingMode: ArbitrageFundingMode;
  readonly fundingAsset: TokenDescriptor;
  readonly fundingAmount: TokenAmount;
  readonly flashLoanProvider?: FlashLoanProviderDescriptor;
  readonly expectedFinalAmount: TokenAmount;
  readonly minimumFinalAmount: TokenAmount;
  readonly minimumProfitAmount: TokenAmount;
  readonly deadlineSeconds: bigint;
  readonly legs: readonly ArbitrageLeg[];
  readonly encodedCalldata: HexData;
  readonly value: WeiAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSimulationRequest {
  readonly simulationId: SimulationId;
  readonly chainId: ChainId;
  readonly from: EvmAddress;
  readonly to: EvmAddress;
  readonly data: HexData;
  readonly value: WeiAmount;
  readonly gasLimit?: GasAmount;
  readonly gasPricing?: GasPriceQuote;
  readonly nonce?: Nonce;
  readonly blockNumber?: BlockNumber;
  readonly stateOverrides?: Readonly<
    Record<EvmAddress, CrossDexArbitrageMetadata>
  >;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TokenBalanceChange {
  readonly token: TokenDescriptor;
  readonly account: EvmAddress;
  readonly amountBefore: TokenAmount;
  readonly amountAfter: TokenAmount;
  readonly signedDelta: bigint;
}

export interface SimulationLog {
  readonly address: EvmAddress;
  readonly topics: readonly HexData[];
  readonly data: HexData;
  readonly logIndex?: number;
}

export interface RevertAnalysis {
  readonly classification: RevertClassification;
  readonly reason?: string;
  readonly selector?: HexData;
  readonly rawData?: HexData;
  readonly failingLegIndex?: number;
  readonly failingTarget?: EvmAddress;
  readonly retryable: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSimulationResult {
  readonly simulationId: SimulationId;
  readonly status: SimulationStatus;
  readonly succeeded: boolean;
  readonly gasUsed?: GasAmount;
  readonly returnData?: HexData;
  readonly logs: readonly SimulationLog[];
  readonly balanceChanges: readonly TokenBalanceChange[];
  readonly expectedProfitAmount?: TokenAmount;
  readonly revertAnalysis?: RevertAnalysis;
  readonly blockReference?: EvmBlockReference;
  readonly simulatedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface UnsignedEvmTransaction {
  readonly chainId: ChainId;
  readonly from: EvmAddress;
  readonly to: EvmAddress;
  readonly nonce: Nonce;
  readonly value: WeiAmount;
  readonly data: HexData;
  readonly gasLimit: GasAmount;
  readonly gasPricing: GasPriceQuote;
  readonly transactionType?: number;
  readonly accessList?: readonly EvmAccessListEntry[];
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface EvmAccessListEntry {
  readonly address: EvmAddress;
  readonly storageKeys: readonly HexData[];
}

export interface SignedEvmTransaction {
  readonly transaction: UnsignedEvmTransaction;
  readonly rawTransaction: HexData;
  readonly transactionHash: TransactionHash;
  readonly signedAtMilliseconds: UnixTimestampMilliseconds;
}

export interface PrivateTransactionPreferences {
  readonly maximumBlockNumber?: BlockNumber;
  readonly minimumTimestampSeconds?: bigint;
  readonly maximumTimestampSeconds?: bigint;
  readonly allowReverts: boolean;
  readonly replacementUuid?: string;
  readonly builderNames?: readonly string[];
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSubmissionRequest {
  readonly submissionId: SubmissionId;
  readonly mode: TransactionSubmissionMode;
  readonly signedTransaction: SignedEvmTransaction;
  readonly privatePreferences?: PrivateTransactionPreferences;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSubmissionResult {
  readonly submissionId: SubmissionId;
  readonly mode: TransactionSubmissionMode;
  readonly accepted: boolean;
  readonly transactionHash?: TransactionHash;
  readonly relayBundleHash?: string;
  readonly providerRequestId?: string;
  readonly submittedAtMilliseconds: UnixTimestampMilliseconds;
  readonly targetBlockNumber?: BlockNumber;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface EvmTransactionReceipt {
  readonly chainId: ChainId;
  readonly transactionHash: TransactionHash;
  readonly blockNumber: BlockNumber;
  readonly blockHash: BlockHash;
  readonly from: EvmAddress;
  readonly to?: EvmAddress;
  readonly contractAddress?: EvmAddress;
  readonly transactionIndex: number;
  readonly status: boolean;
  readonly gasUsed: GasAmount;
  readonly effectiveGasPriceWei: WeiAmount;
  readonly cumulativeGasUsed?: GasAmount;
  readonly logs: readonly SimulationLog[];
  readonly revertAnalysis?: RevertAnalysis;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ArbitrageExecutionFinancialResult {
  readonly fundingToken: TokenDescriptor;
  readonly fundingAmount: TokenAmount;
  readonly finalAmount: TokenAmount;
  readonly grossProfitAmount: TokenAmount;
  readonly flashLoanPremiumAmount: TokenAmount;
  readonly gasCostWei: WeiAmount;
  readonly gasCostInFundingToken?: TokenAmount;
  readonly netProfitAmount: TokenAmount;
  readonly netProfitUsd?: number;
  readonly netProfitBasisPoints: BasisPoints;
  readonly profitable: boolean;
}

export interface ArbitrageExecution {
  readonly id: ArbitrageExecutionId;
  readonly opportunityId: ArbitrageOpportunityId;
  readonly chainId: ChainId;
  readonly request: ArbitrageExecutionRequest;
  readonly status: ArbitrageExecutionStatus;
  readonly payload?: AtomicArbitrageExecutionPayload;
  readonly simulation?: TransactionSimulationResult;
  readonly unsignedTransaction?: UnsignedEvmTransaction;
  readonly signedTransaction?: SignedEvmTransaction;
  readonly submission?: TransactionSubmissionResult;
  readonly receipt?: EvmTransactionReceipt;
  readonly financialResult?: ArbitrageExecutionFinancialResult;
  readonly revertAnalysis?: RevertAnalysis;
  readonly validationIssues: readonly ValidationIssue[];
  readonly createdAtMilliseconds: UnixTimestampMilliseconds;
  readonly updatedAtMilliseconds: UnixTimestampMilliseconds;
  readonly submittedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly confirmedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly failedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface NonceReservation {
  readonly chainId: ChainId;
  readonly address: EvmAddress;
  readonly nonce: Nonce;
  readonly executionId: ArbitrageExecutionId;
  readonly reservedAtMilliseconds: UnixTimestampMilliseconds;
  readonly expiresAtMilliseconds: UnixTimestampMilliseconds;
}

export interface GasManagementPolicy {
  readonly chainId: ChainId;
  readonly pricingMode: GasPricingMode;
  readonly gasLimitSafetyMultiplier: number;
  readonly feeSafetyMultiplier: number;
  readonly minimumPriorityFeeWei?: WeiAmount;
  readonly maximumPriorityFeeWei?: WeiAmount;
  readonly maximumFeePerGasWei?: WeiAmount;
  readonly maximumGasCostWei?: WeiAmount;
  readonly replacementBumpBasisPoints: BasisPoints;
  readonly maximumReplacementAttempts: number;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionTrackingSnapshot {
  readonly executionId: ArbitrageExecutionId;
  readonly status: ArbitrageExecutionStatus;
  readonly transactionHash?: TransactionHash;
  readonly currentBlockNumber?: BlockNumber;
  readonly submissionBlockNumber?: BlockNumber;
  readonly confirmationCount: number;
  readonly replacementCount: number;
  readonly lastCheckedAtMilliseconds: UnixTimestampMilliseconds;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PaperArbitrageExecutionResult {
  readonly executionId: ArbitrageExecutionId;
  readonly opportunityId: ArbitrageOpportunityId;
  readonly status: ArbitrageExecutionStatus.PAPER_EXECUTED;
  readonly simulatedBlockReference: EvmBlockReference;
  readonly inputAmount: TokenAmount;
  readonly finalAmount: TokenAmount;
  readonly grossProfitAmount: TokenAmount;
  readonly estimatedCosts: ArbitrageCostBreakdown;
  readonly netProfitAmount: TokenAmount;
  readonly netProfitBasisPoints: BasisPoints;
  readonly executedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface CrossDexArbitrageEngineConfiguration {
  readonly executionMode: ExecutionMode;
  readonly supportedNetworks: readonly EvmNetworkDescriptor[];
  readonly dexes: readonly DexDescriptor[];
  readonly flashLoanProviders: readonly FlashLoanProviderDescriptor[];
  readonly executorContracts: Readonly<Record<number, EvmAddress>>;
  readonly riskLimits: readonly ArbitrageRiskLimits[];
  readonly gasPolicies: readonly GasManagementPolicy[];
  readonly maximumPoolStateAgeMilliseconds: number;
  readonly maximumQuoteAgeMilliseconds: number;
  readonly maximumOpportunityAgeMilliseconds: number;
  readonly defaultSlippageBasisPoints: BasisPoints;
  readonly defaultPriceImpactLimitBasisPoints: BasisPoints;
  readonly requireSimulation: boolean;
  readonly preferPrivateSubmission: boolean;
  readonly rejectTaxTokens: boolean;
  readonly rejectRebasingTokens: boolean;
  readonly enabled: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DexAdapter {
  readonly descriptor: DexDescriptor;

  discoverPools(
    request: PoolDiscoveryRequest,
  ): Promise<PoolDiscoveryResult>;

  readPoolState(
    pool: DexPoolDescriptor,
    blockNumber?: BlockNumber,
  ): Promise<DexPoolState>;

  quote(
    request: DexQuoteRequest,
  ): Promise<DexQuote>;

  encodeSwap(
    quote: DexQuote,
    recipient: EvmAddress,
    deadlineMilliseconds: UnixTimestampMilliseconds,
  ): Promise<ArbitrageLeg>;
}

export interface FlashLiquidityProvider {
  readonly descriptor: FlashLoanProviderDescriptor;

  quote(
    request: FlashLiquidityRequest,
  ): Promise<FlashLiquidityQuote>;

  encodeFundingCall(
    request: FlashLiquidityRequest,
  ): Promise<HexData>;

  validateAvailability(
    request: FlashLiquidityRequest,
  ): Promise<ValidationResult>;
}

export interface TransactionSimulator {
  simulate(
    request: TransactionSimulationRequest,
  ): Promise<TransactionSimulationResult>;
}

export interface TransactionSigner {
  sign(
    transaction: UnsignedEvmTransaction,
  ): Promise<SignedEvmTransaction>;
}

export interface TransactionSubmitter {
  submit(
    request: TransactionSubmissionRequest,
  ): Promise<TransactionSubmissionResult>;
}

export interface ExecutionTracker {
  track(
    execution: ArbitrageExecution,
  ): Promise<ExecutionTrackingSnapshot>;
}

export const CROSS_DEX_ARBITRAGE_DEFAULTS = Object.freeze({
  basisPointsDenominator: 10_000,
  percentageDenominator: 100,
  defaultTokenDecimals: 18,
  defaultMaximumRouteLegs: 4,
  defaultMaximumSlippageBasisPoints: 50,
  defaultMaximumPriceImpactBasisPoints: 100,
  defaultMinimumNetProfitBasisPoints: 10,
  defaultMaximumQuoteAgeMilliseconds: 5_000,
  defaultMaximumPoolStateAgeMilliseconds: 12_000,
  defaultMaximumOpportunityAgeMilliseconds: 10_000,
  defaultGasLimitSafetyMultiplier: 1.2,
  defaultFeeSafetyMultiplier: 1.15,
  defaultReplacementBumpBasisPoints: 1_250,
  defaultMaximumReplacementAttempts: 3,
  defaultConfirmationBlocks: 1,
  zeroAddress: "0x0000000000000000000000000000000000000000",
} as const);

export const CROSS_DEX_ARBITRAGE_TERMINAL_EXECUTION_STATUSES:
  ReadonlySet<ArbitrageExecutionStatus> =
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.CONFIRMED,
      ArbitrageExecutionStatus.REVERTED,
      ArbitrageExecutionStatus.DROPPED,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.EXPIRED,
      ArbitrageExecutionStatus.PAPER_EXECUTED,
      ArbitrageExecutionStatus.FAILED,
    ]);

export const CROSS_DEX_ARBITRAGE_TERMINAL_OPPORTUNITY_STATUSES:
  ReadonlySet<ArbitrageOpportunityStatus> =
    new Set<ArbitrageOpportunityStatus>([
      ArbitrageOpportunityStatus.REJECTED,
      ArbitrageOpportunityStatus.EXPIRED,
      ArbitrageOpportunityStatus.EXECUTED,
      ArbitrageOpportunityStatus.FAILED,
      ArbitrageOpportunityStatus.CANCELLED,
    ]);

export const CROSS_DEX_ARBITRAGE_EXECUTION_TRANSITIONS: Readonly<
  Record<
    ArbitrageExecutionStatus,
    ReadonlySet<ArbitrageExecutionStatus>
  >
> = Object.freeze({
  [ArbitrageExecutionStatus.CREATED]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.VALIDATING,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.VALIDATING]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SIMULATING,
      ArbitrageExecutionStatus.SIGNING,
      ArbitrageExecutionStatus.PAPER_EXECUTED,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SIMULATING]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SIMULATION_SUCCEEDED,
      ArbitrageExecutionStatus.SIMULATION_FAILED,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SIMULATION_SUCCEEDED]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SIGNING,
      ArbitrageExecutionStatus.PAPER_EXECUTED,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SIMULATION_FAILED]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SIMULATING,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SIGNING]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SUBMITTING,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SUBMITTING]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SUBMITTED,
      ArbitrageExecutionStatus.CANCELLED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.SUBMITTED]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.PENDING,
      ArbitrageExecutionStatus.CONFIRMED,
      ArbitrageExecutionStatus.REVERTED,
      ArbitrageExecutionStatus.DROPPED,
      ArbitrageExecutionStatus.REPLACED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.PENDING]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.CONFIRMED,
      ArbitrageExecutionStatus.REVERTED,
      ArbitrageExecutionStatus.DROPPED,
      ArbitrageExecutionStatus.REPLACED,
      ArbitrageExecutionStatus.EXPIRED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.REPLACED]:
    new Set<ArbitrageExecutionStatus>([
      ArbitrageExecutionStatus.SUBMITTED,
      ArbitrageExecutionStatus.PENDING,
      ArbitrageExecutionStatus.CONFIRMED,
      ArbitrageExecutionStatus.REVERTED,
      ArbitrageExecutionStatus.DROPPED,
      ArbitrageExecutionStatus.EXPIRED,
      ArbitrageExecutionStatus.FAILED,
    ]),

  [ArbitrageExecutionStatus.CONFIRMED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.REVERTED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.DROPPED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.CANCELLED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.EXPIRED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.PAPER_EXECUTED]:
    new Set<ArbitrageExecutionStatus>(),

  [ArbitrageExecutionStatus.FAILED]:
    new Set<ArbitrageExecutionStatus>(),
});