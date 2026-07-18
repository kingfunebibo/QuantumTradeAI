/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic validation for engine configuration, arbitrage opportunities,
 * execution requests, wallet funding, flash liquidity, risk limits, and
 * circuit-breaker state.
 */

import {
  ArbitrageExecutionRequest,
  ArbitrageFundingMode,
  ArbitrageOpportunity,
  ArbitrageRiskLimits,
  ArbitrageRoute,
  BasisPoints,
  ChainId,
  CircuitBreaker,
  CircuitBreakerState,
  CrossDexArbitrageEngineConfiguration,
  DexDescriptor,
  DexPoolDescriptor,
  DexPoolState,
  ExecutionMode,
  FlashLiquidityQuote,
  PoolStatus,
  RiskLimitScope,
  TokenAmount,
  TokenDescriptor,
  TransactionSubmissionMode,
  ValidationCode,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
  WalletFundingValidation,
  CROSS_DEX_ARBITRAGE_DEFAULTS,
} from "./cross-dex-arbitrage-contracts";

export interface CrossDexArbitrageValidationContext {
  readonly nowMilliseconds: number;
  readonly currentBlockNumber?: bigint;
  readonly poolStates?: readonly DexPoolState[];
  readonly walletFunding?: WalletFundingValidation;
  readonly circuitBreakers?: readonly CircuitBreaker[];
  readonly riskLimits?: readonly ArbitrageRiskLimits[];
}

export interface CrossDexArbitrageValidatorOptions {
  readonly rejectWarnings?: boolean;
  readonly requireKnownPoolStates?: boolean;
  readonly enforceCurrentBlockMatch?: boolean;
}

const DEFAULT_OPTIONS: Readonly<Required<CrossDexArbitrageValidatorOptions>> =
  Object.freeze({
    rejectWarnings: false,
    requireKnownPoolStates: true,
    enforceCurrentBlockMatch: false,
  });

function issue(
  code: ValidationCode,
  severity: ValidationSeverity,
  message: string,
  extras: Omit<ValidationIssue, "code" | "severity" | "message"> = {},
): ValidationIssue {
  return Object.freeze({ code, severity, message, ...extras });
}

function result(
  issues: readonly ValidationIssue[],
  rejectWarnings: boolean,
): ValidationResult {
  const frozenIssues = Object.freeze([...issues]);
  const invalidSeverities = rejectWarnings
    ? new Set<ValidationSeverity>([
        ValidationSeverity.WARNING,
        ValidationSeverity.ERROR,
        ValidationSeverity.FATAL,
      ])
    : new Set<ValidationSeverity>([
        ValidationSeverity.ERROR,
        ValidationSeverity.FATAL,
      ]);

  return Object.freeze({
    valid: !frozenIssues.some((entry) => invalidSeverities.has(entry.severity)),
    issues: frozenIssues,
  });
}

function asNumber(value: bigint): number {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : Number.MAX_VALUE;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function positiveBigInt(value: bigint): boolean {
  return value > 0n;
}

function validBasisPoints(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10_000;
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function tokenMatches(left: TokenDescriptor, right: TokenDescriptor): boolean {
  return (
    left.chainId === right.chainId &&
    normalizeAddress(left.address) === normalizeAddress(right.address)
  );
}

function findPoolState(
  states: readonly DexPoolState[],
  poolId: string,
): DexPoolState | undefined {
  return states.find((state) => state.pool.id === poolId);
}

export class CrossDexArbitrageValidator {
  private readonly options: Readonly<
    Required<CrossDexArbitrageValidatorOptions>
  >;

  public constructor(options: CrossDexArbitrageValidatorOptions = {}) {
    this.options = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
  }

  public validateConfiguration(
    configuration: CrossDexArbitrageEngineConfiguration,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configuration.enabled) {
      issues.push(
        issue(
          ValidationCode.EXECUTION_MODE_DISABLED,
          ValidationSeverity.WARNING,
          "Cross-DEX arbitrage engine configuration is disabled.",
        ),
      );
    }

    if (configuration.supportedNetworks.length === 0) {
      issues.push(
        issue(
          ValidationCode.INVALID_CHAIN,
          ValidationSeverity.FATAL,
          "At least one supported EVM network is required.",
        ),
      );
    }

    const chainIds = configuration.supportedNetworks.map((network) =>
      Number(network.chainId),
    );
    if (!unique(chainIds)) {
      issues.push(
        issue(
          ValidationCode.INVALID_CHAIN,
          ValidationSeverity.ERROR,
          "Supported network chain IDs must be unique.",
        ),
      );
    }

    for (const network of configuration.supportedNetworks) {
      if (!Number.isInteger(Number(network.chainId)) || Number(network.chainId) <= 0) {
        issues.push(
          issue(
            ValidationCode.INVALID_CHAIN,
            ValidationSeverity.ERROR,
            `Network ${network.name} has an invalid chain ID.`,
          ),
        );
      }
      if (!isAddressLike(network.wrappedNativeTokenAddress)) {
        issues.push(
          issue(
            ValidationCode.INVALID_TOKEN,
            ValidationSeverity.ERROR,
            `Network ${network.name} has an invalid wrapped native token address.`,
          ),
        );
      }
      if (!Number.isInteger(network.nativeCurrencyDecimals) || network.nativeCurrencyDecimals < 0) {
        issues.push(
          issue(
            ValidationCode.INVALID_TOKEN,
            ValidationSeverity.ERROR,
            `Network ${network.name} has invalid native currency decimals.`,
          ),
        );
      }
    }

    const dexIds = configuration.dexes.map((dex) => dex.id);
    if (!unique(dexIds)) {
      issues.push(
        issue(
          ValidationCode.DUPLICATE_DEX,
          ValidationSeverity.ERROR,
          "DEX identifiers must be unique.",
        ),
      );
    }

    for (const dex of configuration.dexes) {
      issues.push(...this.validateDex(dex, chainIds).issues);
    }

    const providerIds = configuration.flashLoanProviders.map(
      (provider) => provider.id,
    );
    if (!unique(providerIds)) {
      issues.push(
        issue(
          ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
          ValidationSeverity.ERROR,
          "Flash-liquidity provider identifiers must be unique.",
        ),
      );
    }

    for (const provider of configuration.flashLoanProviders) {
      if (!chainIds.includes(Number(provider.chainId))) {
        issues.push(
          issue(
            ValidationCode.INVALID_CHAIN,
            ValidationSeverity.ERROR,
            `Flash-liquidity provider ${provider.name} references an unsupported chain.`,
          ),
        );
      }
      if (!isAddressLike(provider.providerAddress)) {
        issues.push(
          issue(
            ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
            ValidationSeverity.ERROR,
            `Flash-liquidity provider ${provider.name} has an invalid address.`,
          ),
        );
      }
      if (!validBasisPoints(Number(provider.premiumBasisPoints))) {
        issues.push(
          issue(
            ValidationCode.FLASH_LOAN_PREMIUM_TOO_HIGH,
            ValidationSeverity.ERROR,
            `Flash-liquidity provider ${provider.name} has invalid premium basis points.`,
          ),
        );
      }
    }

    if (!validBasisPoints(Number(configuration.defaultSlippageBasisPoints))) {
      issues.push(
        issue(
          ValidationCode.SLIPPAGE_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Default slippage basis points must be between 0 and 10,000.",
        ),
      );
    }

    if (
      !validBasisPoints(
        Number(configuration.defaultPriceImpactLimitBasisPoints),
      )
    ) {
      issues.push(
        issue(
          ValidationCode.PRICE_IMPACT_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Default price-impact basis points must be between 0 and 10,000.",
        ),
      );
    }

    for (const [chainId, address] of Object.entries(
      configuration.executorContracts,
    )) {
      if (!chainIds.includes(Number(chainId))) {
        issues.push(
          issue(
            ValidationCode.EXECUTOR_NOT_CONFIGURED,
            ValidationSeverity.ERROR,
            `Executor contract references unsupported chain ${chainId}.`,
          ),
        );
      }
      if (!isAddressLike(address)) {
        issues.push(
          issue(
            ValidationCode.EXECUTOR_NOT_CONFIGURED,
            ValidationSeverity.ERROR,
            `Executor contract for chain ${chainId} has an invalid address.`,
          ),
        );
      }
    }

    for (const limits of configuration.riskLimits) {
      issues.push(...this.validateRiskLimits(limits).issues);
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateOpportunity(
    opportunity: ArbitrageOpportunity,
    configuration: CrossDexArbitrageEngineConfiguration,
    context: CrossDexArbitrageValidationContext,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configuration.enabled) {
      issues.push(
        issue(
          ValidationCode.EXECUTION_MODE_DISABLED,
          ValidationSeverity.FATAL,
          "Cross-DEX arbitrage execution is disabled.",
        ),
      );
    }

    const network = configuration.supportedNetworks.find(
      (entry) => entry.chainId === opportunity.chainId,
    );
    if (!network || !network.enabled) {
      issues.push(
        issue(
          ValidationCode.INVALID_CHAIN,
          ValidationSeverity.FATAL,
          "Opportunity chain is unsupported or disabled.",
        ),
      );
    }

    if (context.nowMilliseconds >= Number(opportunity.expiresAtMilliseconds)) {
      issues.push(
        issue(
          ValidationCode.OPPORTUNITY_EXPIRED,
          ValidationSeverity.ERROR,
          "Arbitrage opportunity has expired.",
        ),
      );
    }

    if (
      context.nowMilliseconds - Number(opportunity.detectedAtMilliseconds) >
      configuration.maximumOpportunityAgeMilliseconds
    ) {
      issues.push(
        issue(
          ValidationCode.OPPORTUNITY_EXPIRED,
          ValidationSeverity.ERROR,
          "Arbitrage opportunity exceeds the configured maximum age.",
        ),
      );
    }

    issues.push(
      ...this.validateRoute(opportunity.route, configuration, context).issues,
    );

    if (!opportunity.profitability.profitable) {
      issues.push(
        issue(
          ValidationCode.NET_PROFIT_TOO_LOW,
          ValidationSeverity.ERROR,
          "Opportunity is not profitable after estimated costs.",
        ),
      );
    }

    if (opportunity.profitability.netProfitAmount <= 0n) {
      issues.push(
        issue(
          ValidationCode.NET_PROFIT_TOO_LOW,
          ValidationSeverity.ERROR,
          "Net profit amount must be positive.",
        ),
      );
    }

    if (
      opportunity.fundingMode === ArbitrageFundingMode.FLASH_LOAN ||
      opportunity.fundingMode === ArbitrageFundingMode.FLASH_SWAP
    ) {
      if (!opportunity.flashLiquidityQuote) {
        issues.push(
          issue(
            ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
            ValidationSeverity.ERROR,
            "Flash-funded opportunity requires a flash-liquidity quote.",
          ),
        );
      } else {
        issues.push(
          ...this.validateFlashLiquidityQuote(
            opportunity.flashLiquidityQuote,
            opportunity.route.inputAmount,
            context.nowMilliseconds,
          ).issues,
        );
      }
    }

    if (opportunity.fundingMode === ArbitrageFundingMode.WALLET) {
      if (!context.walletFunding) {
        issues.push(
          issue(
            ValidationCode.INSUFFICIENT_WALLET_BALANCE,
            ValidationSeverity.ERROR,
            "Wallet-funded opportunity requires wallet funding validation.",
          ),
        );
      } else {
        issues.push(...this.validateWalletFunding(context.walletFunding).issues);
      }
    }

    const limits = context.riskLimits ?? configuration.riskLimits;
    for (const riskLimit of this.applicableRiskLimits(opportunity, limits)) {
      issues.push(...this.enforceRiskLimits(opportunity, riskLimit).issues);
    }

    for (const breaker of context.circuitBreakers ?? []) {
      if (this.breakerApplies(opportunity, breaker) && breaker.state !== CircuitBreakerState.CLOSED) {
        issues.push(
          issue(
            ValidationCode.CIRCUIT_BREAKER_OPEN,
            breaker.state === CircuitBreakerState.OPEN
              ? ValidationSeverity.FATAL
              : ValidationSeverity.WARNING,
            `Circuit breaker ${breaker.id} is ${breaker.state}.`,
          ),
        );
      }
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateExecutionRequest(
    request: ArbitrageExecutionRequest,
    configuration: CrossDexArbitrageEngineConfiguration,
    context: CrossDexArbitrageValidationContext,
  ): ValidationResult {
    const issues = [
      ...this.validateOpportunity(request.opportunity, configuration, context)
        .issues,
    ];

    if (request.executionMode === ExecutionMode.LIVE && !configuration.enabled) {
      issues.push(
        issue(
          ValidationCode.EXECUTION_MODE_DISABLED,
          ValidationSeverity.FATAL,
          "Live execution cannot run while the engine is disabled.",
        ),
      );
    }

    if (
      request.executionMode === ExecutionMode.LIVE &&
      !isAddressLike(request.executorContractAddress)
    ) {
      issues.push(
        issue(
          ValidationCode.EXECUTOR_NOT_CONFIGURED,
          ValidationSeverity.FATAL,
          "Live execution requires a valid executor contract address.",
        ),
      );
    }

    for (const [label, address] of [
      ["sender", request.senderAddress],
      ["beneficiary", request.beneficiaryAddress],
    ] as const) {
      if (!isAddressLike(address)) {
        issues.push(
          issue(
            ValidationCode.INVALID_TOKEN,
            ValidationSeverity.ERROR,
            `Execution ${label} address is invalid.`,
          ),
        );
      }
    }

    if (context.nowMilliseconds >= Number(request.deadlineMilliseconds)) {
      issues.push(
        issue(
          ValidationCode.OPPORTUNITY_EXPIRED,
          ValidationSeverity.ERROR,
          "Execution deadline has expired.",
        ),
      );
    }

    if (
      configuration.requireSimulation &&
      request.executionMode === ExecutionMode.LIVE &&
      !request.simulateBeforeSubmission
    ) {
      issues.push(
        issue(
          ValidationCode.SIMULATION_REQUIRED,
          ValidationSeverity.ERROR,
          "Configuration requires simulation before live submission.",
        ),
      );
    }

    const privateSubmissionRequired = this.applicableRiskLimits(
      request.opportunity,
      context.riskLimits ?? configuration.riskLimits,
    ).some((limits) => limits.requirePrivateSubmission);

    if (
      privateSubmissionRequired &&
      request.submissionMode === TransactionSubmissionMode.PUBLIC_MEMPOOL
    ) {
      issues.push(
        issue(
          ValidationCode.PRIVATE_SUBMISSION_REQUIRED,
          ValidationSeverity.ERROR,
          "Applicable risk policy requires private transaction submission.",
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateRoute(
    route: ArbitrageRoute,
    configuration: CrossDexArbitrageEngineConfiguration,
    context: CrossDexArbitrageValidationContext,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (route.legs.length < 2) {
      issues.push(
        issue(
          ValidationCode.INVALID_ROUTE,
          ValidationSeverity.ERROR,
          "Arbitrage route must contain at least two legs.",
        ),
      );
    }

    if (!route.isAtomic) {
      issues.push(
        issue(
          ValidationCode.ROUTE_NOT_ATOMIC,
          ValidationSeverity.ERROR,
          "Cross-DEX arbitrage route must be atomic.",
        ),
      );
    }

    if (route.chainId !== route.startToken.chainId || route.chainId !== route.endToken.chainId) {
      issues.push(
        issue(
          ValidationCode.INVALID_CHAIN,
          ValidationSeverity.ERROR,
          "Route tokens must belong to the route chain.",
        ),
      );
    }

    if (!tokenMatches(route.startToken, route.endToken)) {
      issues.push(
        issue(
          ValidationCode.INVALID_ROUTE,
          ValidationSeverity.ERROR,
          "Atomic arbitrage route must end in the same token it starts with.",
        ),
      );
    }

    if (!positiveBigInt(route.inputAmount)) {
      issues.push(
        issue(
          ValidationCode.ZERO_INPUT_AMOUNT,
          ValidationSeverity.ERROR,
          "Route input amount must be greater than zero.",
        ),
      );
    }

    if (route.expectedFinalAmount <= route.inputAmount) {
      issues.push(
        issue(
          ValidationCode.NET_PROFIT_TOO_LOW,
          ValidationSeverity.ERROR,
          "Expected final amount must exceed the route input amount.",
        ),
      );
    }

    if (route.minimumFinalAmount > route.expectedFinalAmount) {
      issues.push(
        issue(
          ValidationCode.INVALID_AMOUNT,
          ValidationSeverity.ERROR,
          "Minimum final amount cannot exceed expected final amount.",
        ),
      );
    }

    if (context.nowMilliseconds >= Number(route.expiresAtMilliseconds)) {
      issues.push(
        issue(
          ValidationCode.STALE_QUOTE,
          ValidationSeverity.ERROR,
          "Arbitrage route has expired.",
        ),
      );
    }

    const poolIds = route.legs
      .map((leg) => leg.poolId)
      .filter((poolId): poolId is NonNullable<typeof poolId> => poolId !== undefined);
    if (!unique(poolIds)) {
      issues.push(
        issue(
          ValidationCode.DUPLICATE_POOL,
          ValidationSeverity.WARNING,
          "Arbitrage route reuses a pool.",
        ),
      );
    }

    for (let index = 0; index < route.legs.length; index += 1) {
      const leg = route.legs[index];
      if (!leg) continue;

      if (leg.legIndex !== index) {
        issues.push(
          issue(
            ValidationCode.INVALID_ROUTE,
            ValidationSeverity.ERROR,
            `Route leg index ${leg.legIndex} does not match position ${index}.`,
            { legIndex: index },
          ),
        );
      }

      if (leg.chainId !== route.chainId) {
        issues.push(
          issue(
            ValidationCode.INVALID_CHAIN,
            ValidationSeverity.ERROR,
            "All route legs must use the route chain.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      const dex = configuration.dexes.find((entry) => entry.id === leg.dexId);
      if (!dex || !dex.enabled) {
        issues.push(
          issue(
            ValidationCode.DEX_DISABLED,
            ValidationSeverity.ERROR,
            `Route leg ${index} references an unavailable DEX.`,
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      issues.push(...this.validateToken(leg.tokenIn, configuration).issues);
      issues.push(...this.validateToken(leg.tokenOut, configuration).issues);

      if (!positiveBigInt(leg.amountIn) || !positiveBigInt(leg.expectedAmountOut)) {
        issues.push(
          issue(
            ValidationCode.INVALID_AMOUNT,
            ValidationSeverity.ERROR,
            "Route leg amounts must be greater than zero.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      if (leg.minimumAmountOut > leg.expectedAmountOut) {
        issues.push(
          issue(
            ValidationCode.INVALID_AMOUNT,
            ValidationSeverity.ERROR,
            "Leg minimum output cannot exceed expected output.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      if (context.nowMilliseconds >= Number(leg.quote.expiresAtMilliseconds)) {
        issues.push(
          issue(
            ValidationCode.STALE_QUOTE,
            ValidationSeverity.ERROR,
            "Route leg quote has expired.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      if (
        context.nowMilliseconds - Number(leg.quote.quotedAtMilliseconds) >
        configuration.maximumQuoteAgeMilliseconds
      ) {
        issues.push(
          issue(
            ValidationCode.STALE_QUOTE,
            ValidationSeverity.ERROR,
            "Route leg quote exceeds the maximum configured age.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      const next = route.legs[index + 1];
      if (next && !tokenMatches(leg.tokenOut, next.tokenIn)) {
        issues.push(
          issue(
            ValidationCode.INVALID_ROUTE,
            ValidationSeverity.ERROR,
            "Output token of a route leg must match the next leg input token.",
            { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }

      if (leg.poolId) {
        const state = findPoolState(context.poolStates ?? [], leg.poolId);
        if (!state && this.options.requireKnownPoolStates) {
          issues.push(
            issue(
              ValidationCode.INVALID_POOL,
              ValidationSeverity.ERROR,
              "Route leg pool state is unavailable.",
              { legIndex: index, dexId: leg.dexId, poolId: leg.poolId },
            ),
          );
        }
        if (state) {
          issues.push(
            ...this.validatePoolState(
              state,
              configuration.maximumPoolStateAgeMilliseconds,
              context,
            ).issues.map((entry) => ({ ...entry, legIndex: index })),
          );
        }
      }
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateToken(
    token: TokenDescriptor,
    configuration: CrossDexArbitrageEngineConfiguration,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!token.enabled) {
      issues.push(
        issue(
          ValidationCode.INVALID_TOKEN,
          ValidationSeverity.ERROR,
          `Token ${token.symbol} is disabled.`,
          { tokenAddress: token.address },
        ),
      );
    }

    if (!isAddressLike(token.address)) {
      issues.push(
        issue(
          ValidationCode.INVALID_TOKEN,
          ValidationSeverity.ERROR,
          `Token ${token.symbol} has an invalid address.`,
          { tokenAddress: token.address },
        ),
      );
    }

    if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) {
      issues.push(
        issue(
          ValidationCode.INVALID_TOKEN,
          ValidationSeverity.ERROR,
          `Token ${token.symbol} has invalid decimals.`,
          { tokenAddress: token.address },
        ),
      );
    }

    if (token.isBlacklisted) {
      issues.push(
        issue(
          ValidationCode.TOKEN_BLACKLISTED,
          ValidationSeverity.FATAL,
          `Token ${token.symbol} is blacklisted.`,
          { tokenAddress: token.address },
        ),
      );
    }

    if (configuration.rejectRebasingTokens && token.isRebasing) {
      issues.push(
        issue(
          ValidationCode.TOKEN_REBASE_UNSUPPORTED,
          ValidationSeverity.ERROR,
          `Rebasing token ${token.symbol} is not supported.`,
          { tokenAddress: token.address },
        ),
      );
    }

    if (
      configuration.rejectTaxTokens &&
      Number(token.transferTaxBasisPoints ?? 0) > 0
    ) {
      issues.push(
        issue(
          ValidationCode.TOKEN_TRANSFER_TAX_UNSUPPORTED,
          ValidationSeverity.ERROR,
          `Transfer-tax token ${token.symbol} is not supported.`,
          { tokenAddress: token.address },
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validatePoolDescriptor(pool: DexPoolDescriptor): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isAddressLike(pool.address)) {
      issues.push(
        issue(
          ValidationCode.INVALID_POOL,
          ValidationSeverity.ERROR,
          "Pool address is invalid.",
          { dexId: pool.dexId, poolId: pool.id },
        ),
      );
    }

    if (pool.status !== PoolStatus.ACTIVE && pool.status !== PoolStatus.DISCOVERED) {
      issues.push(
        issue(
          ValidationCode.POOL_DISABLED,
          ValidationSeverity.ERROR,
          `Pool is not active: ${pool.status}.`,
          { dexId: pool.dexId, poolId: pool.id },
        ),
      );
    }

    if (tokenMatches(pool.token0, pool.token1)) {
      issues.push(
        issue(
          ValidationCode.INVALID_PAIR,
          ValidationSeverity.ERROR,
          "Pool token pair must contain two distinct tokens.",
          { dexId: pool.dexId, poolId: pool.id },
        ),
      );
    }

    if (!validBasisPoints(Number(pool.feeBasisPoints))) {
      issues.push(
        issue(
          ValidationCode.DEX_FEE_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Pool fee basis points are invalid.",
          { dexId: pool.dexId, poolId: pool.id },
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validatePoolState(
    state: DexPoolState,
    maximumAgeMilliseconds: number,
    context: CrossDexArbitrageValidationContext,
  ): ValidationResult {
    const issues = [...this.validatePoolDescriptor(state.pool).issues];

    if (
      context.nowMilliseconds - Number(state.observedAtMilliseconds) >
      maximumAgeMilliseconds
    ) {
      issues.push(
        issue(
          ValidationCode.STALE_POOL_STATE,
          ValidationSeverity.ERROR,
          "Pool state exceeds the maximum permitted age.",
          { dexId: state.pool.dexId, poolId: state.pool.id },
        ),
      );
    }

    if (
      this.options.enforceCurrentBlockMatch &&
      context.currentBlockNumber !== undefined &&
      state.blockReference.blockNumber !== context.currentBlockNumber
    ) {
      issues.push(
        issue(
          ValidationCode.BLOCK_NUMBER_MISMATCH,
          ValidationSeverity.ERROR,
          "Pool state block does not match the requested current block.",
          { dexId: state.pool.dexId, poolId: state.pool.id },
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateWalletFunding(
    funding: WalletFundingValidation,
  ): ValidationResult {
    const issues: ValidationIssue[] = [...funding.issues];

    if (!isAddressLike(funding.walletAddress)) {
      issues.push(
        issue(
          ValidationCode.INSUFFICIENT_WALLET_BALANCE,
          ValidationSeverity.ERROR,
          "Wallet funding address is invalid.",
        ),
      );
    }

    if (funding.requiredAmount <= 0n) {
      issues.push(
        issue(
          ValidationCode.INVALID_AMOUNT,
          ValidationSeverity.ERROR,
          "Wallet funding required amount must be positive.",
        ),
      );
    }

    if (!funding.hasSufficientBalance || funding.balance < funding.requiredAmount) {
      issues.push(
        issue(
          ValidationCode.INSUFFICIENT_WALLET_BALANCE,
          ValidationSeverity.ERROR,
          "Wallet balance is insufficient for the requested trade.",
        ),
      );
    }

    if (
      funding.allowanceRequired &&
      (!funding.hasSufficientAllowance ||
        funding.allowance === undefined ||
        funding.allowance < funding.requiredAmount)
    ) {
      issues.push(
        issue(
          ValidationCode.INSUFFICIENT_ALLOWANCE,
          ValidationSeverity.ERROR,
          "Token allowance is insufficient for the requested trade.",
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateFlashLiquidityQuote(
    quote: FlashLiquidityQuote,
    requiredAmount: TokenAmount,
    nowMilliseconds: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!quote.provider.enabled) {
      issues.push(
        issue(
          ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
          ValidationSeverity.ERROR,
          "Flash-liquidity provider is disabled.",
        ),
      );
    }

    if (quote.availableAmount < requiredAmount) {
      issues.push(
        issue(
          ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
          ValidationSeverity.ERROR,
          "Available flash liquidity is below the required amount.",
        ),
      );
    }

    if (quote.requestedAmount !== requiredAmount) {
      issues.push(
        issue(
          ValidationCode.INVALID_AMOUNT,
          ValidationSeverity.WARNING,
          "Flash-liquidity quote amount differs from the route input amount.",
        ),
      );
    }

    if (quote.totalRepaymentAmount !== quote.requestedAmount + quote.premiumAmount) {
      issues.push(
        issue(
          ValidationCode.FLASH_LOAN_PREMIUM_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Flash-liquidity repayment amount is internally inconsistent.",
        ),
      );
    }

    if (nowMilliseconds >= Number(quote.expiresAtMilliseconds)) {
      issues.push(
        issue(
          ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
          ValidationSeverity.ERROR,
          "Flash-liquidity quote has expired.",
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  public validateRiskLimits(limits: ArbitrageRiskLimits): ValidationResult {
    const issues: ValidationIssue[] = [];

    for (const [name, value] of [
      ["minimumNetProfitBasisPoints", limits.minimumNetProfitBasisPoints],
      ["maximumDexFeeBasisPoints", limits.maximumDexFeeBasisPoints],
      ["maximumFlashLoanPremiumBasisPoints", limits.maximumFlashLoanPremiumBasisPoints],
      ["maximumSlippageBasisPoints", limits.maximumSlippageBasisPoints],
      ["maximumPriceImpactBasisPoints", limits.maximumPriceImpactBasisPoints],
    ] as const) {
      if (!validBasisPoints(Number(value))) {
        issues.push(
          issue(
            ValidationCode.RISK_LIMIT_EXCEEDED,
            ValidationSeverity.ERROR,
            `${name} must be between 0 and 10,000.`,
          ),
        );
      }
    }

    for (const [name, value] of [
      ["maximumRouteLegs", limits.maximumRouteLegs],
      ["maximumPendingExecutions", limits.maximumPendingExecutions],
      ["maximumExecutionsPerBlock", limits.maximumExecutionsPerBlock],
      ["maximumExecutionsPerMinute", limits.maximumExecutionsPerMinute],
      ["maximumConsecutiveFailures", limits.maximumConsecutiveFailures],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        issues.push(
          issue(
            ValidationCode.RISK_LIMIT_EXCEEDED,
            ValidationSeverity.ERROR,
            `${name} must be a non-negative integer.`,
          ),
        );
      }
    }

    return result(issues, this.options.rejectWarnings);
  }

  private validateDex(
    dex: DexDescriptor,
    supportedChainIds: readonly number[],
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!dex.id || !dex.name.trim()) {
      issues.push(
        issue(
          ValidationCode.DEX_DISABLED,
          ValidationSeverity.ERROR,
          "DEX identifier and name are required.",
          { dexId: dex.id },
        ),
      );
    }

    if (!supportedChainIds.includes(Number(dex.chainId))) {
      issues.push(
        issue(
          ValidationCode.INVALID_CHAIN,
          ValidationSeverity.ERROR,
          `DEX ${dex.name} references an unsupported chain.`,
          { dexId: dex.id },
        ),
      );
    }

    for (const [label, address] of [
      ["factory", dex.factoryAddress],
      ["router", dex.routerAddress],
      ["quoter", dex.quoterAddress],
      ["position manager", dex.positionManagerAddress],
      ["vault", dex.vaultAddress],
      ["fee collector", dex.feeCollectorAddress],
    ] as const) {
      if (address !== undefined && !isAddressLike(address)) {
        issues.push(
          issue(
            ValidationCode.DEX_DISABLED,
            ValidationSeverity.ERROR,
            `DEX ${dex.name} has an invalid ${label} address.`,
            { dexId: dex.id },
          ),
        );
      }
    }

    if (!unique(dex.supportedFeeTiersBasisPoints.map(Number))) {
      issues.push(
        issue(
          ValidationCode.DEX_FEE_TOO_HIGH,
          ValidationSeverity.WARNING,
          `DEX ${dex.name} contains duplicate fee tiers.`,
          { dexId: dex.id },
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  private enforceRiskLimits(
    opportunity: ArbitrageOpportunity,
    limits: ArbitrageRiskLimits,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (!limits.enabled) return result(issues, this.options.rejectWarnings);

    const route = opportunity.route;
    const profitability = opportunity.profitability;

    if (limits.maximumInputAmount !== undefined && route.inputAmount > limits.maximumInputAmount) {
      issues.push(this.riskIssue("Input amount exceeds the configured maximum."));
    }
    if (
      limits.minimumNetProfitAmount !== undefined &&
      profitability.netProfitAmount < limits.minimumNetProfitAmount
    ) {
      issues.push(this.riskIssue("Net profit amount is below the configured minimum."));
    }
    if (
      Number(profitability.netProfitBasisPoints) <
      Number(limits.minimumNetProfitBasisPoints)
    ) {
      issues.push(this.riskIssue("Net profit basis points are below the configured minimum."));
    }
    if (route.legs.length > limits.maximumRouteLegs) {
      issues.push(this.riskIssue("Route leg count exceeds the configured maximum."));
    }
    if (
      Number(profitability.costs.gasCostWei) >
      asNumber(limits.maximumGasCostWei ?? (2n ** 255n))
    ) {
      issues.push(
        issue(
          ValidationCode.GAS_COST_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Estimated gas cost exceeds the configured maximum.",
        ),
      );
    }
    if (
      Number(profitability.costs.inputToken.transferTaxBasisPoints ?? 0) > 0
    ) {
      issues.push(
        issue(
          ValidationCode.TOKEN_TRANSFER_TAX_UNSUPPORTED,
          ValidationSeverity.ERROR,
          "Applicable risk policy rejects taxed funding tokens.",
        ),
      );
    }
    if (
      opportunity.fundingMode === ArbitrageFundingMode.WALLET &&
      !limits.walletFundingEnabled
    ) {
      issues.push(this.riskIssue("Wallet-funded arbitrage is disabled by risk policy."));
    }
    if (
      opportunity.fundingMode === ArbitrageFundingMode.FLASH_LOAN &&
      !limits.flashLoanFundingEnabled
    ) {
      issues.push(this.riskIssue("Flash-loan arbitrage is disabled by risk policy."));
    }
    if (
      opportunity.fundingMode === ArbitrageFundingMode.FLASH_SWAP &&
      !limits.flashSwapFundingEnabled
    ) {
      issues.push(this.riskIssue("Flash-swap arbitrage is disabled by risk policy."));
    }

    for (const leg of route.legs) {
      if (
        Number(leg.quote.estimatedSlippageBasisPoints) >
        Number(limits.maximumSlippageBasisPoints)
      ) {
        issues.push(
          issue(
            ValidationCode.SLIPPAGE_TOO_HIGH,
            ValidationSeverity.ERROR,
            "A route leg exceeds the maximum slippage limit.",
            { legIndex: leg.legIndex, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }
      if (
        Number(leg.quote.priceImpactBasisPoints) >
        Number(limits.maximumPriceImpactBasisPoints)
      ) {
        issues.push(
          issue(
            ValidationCode.PRICE_IMPACT_TOO_HIGH,
            ValidationSeverity.ERROR,
            "A route leg exceeds the maximum price-impact limit.",
            { legIndex: leg.legIndex, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }
      if (
        Number(leg.quote.dexFee.feeBasisPoints) >
        Number(limits.maximumDexFeeBasisPoints)
      ) {
        issues.push(
          issue(
            ValidationCode.DEX_FEE_TOO_HIGH,
            ValidationSeverity.ERROR,
            "A route leg exceeds the maximum DEX fee limit.",
            { legIndex: leg.legIndex, dexId: leg.dexId, poolId: leg.poolId },
          ),
        );
      }
    }

    if (
      opportunity.flashLiquidityQuote &&
      Number(opportunity.flashLiquidityQuote.premiumBasisPoints) >
        Number(limits.maximumFlashLoanPremiumBasisPoints)
    ) {
      issues.push(
        issue(
          ValidationCode.FLASH_LOAN_PREMIUM_TOO_HIGH,
          ValidationSeverity.ERROR,
          "Flash-liquidity premium exceeds the configured maximum.",
        ),
      );
    }

    return result(issues, this.options.rejectWarnings);
  }

  private applicableRiskLimits(
    opportunity: ArbitrageOpportunity,
    limits: readonly ArbitrageRiskLimits[],
  ): readonly ArbitrageRiskLimits[] {
    const routeDexIds = new Set(opportunity.route.legs.map((leg) => leg.dexId));
    const routePoolIds = new Set(
      opportunity.route.legs
        .map((leg) => leg.poolId)
        .filter((value): value is NonNullable<typeof value> => value !== undefined),
    );
    const routeTokenAddresses = new Set(
      opportunity.route.legs.flatMap((leg) => [
        normalizeAddress(leg.tokenIn.address),
        normalizeAddress(leg.tokenOut.address),
      ]),
    );

    return limits.filter((entry) => {
      switch (entry.scope) {
        case RiskLimitScope.GLOBAL:
          return true;
        case RiskLimitScope.CHAIN:
          return entry.scopeId === String(opportunity.chainId);
        case RiskLimitScope.DEX:
          return entry.scopeId !== undefined && routeDexIds.has(entry.scopeId as never);
        case RiskLimitScope.POOL:
          return entry.scopeId !== undefined && routePoolIds.has(entry.scopeId as never);
        case RiskLimitScope.TOKEN:
          return (
            entry.scopeId !== undefined &&
            routeTokenAddresses.has(normalizeAddress(entry.scopeId))
          );
        case RiskLimitScope.ROUTE:
          return entry.scopeId === opportunity.route.id;
        case RiskLimitScope.FUNDING_PROVIDER:
          return entry.scopeId === opportunity.flashLiquidityQuote?.provider.id;
        default:
          return false;
      }
    });
  }

  private breakerApplies(
    opportunity: ArbitrageOpportunity,
    breaker: CircuitBreaker,
  ): boolean {
    if (!breaker.scopeId) return true;

    const route = opportunity.route;
    return (
      breaker.scopeId === String(opportunity.chainId) ||
      breaker.scopeId === route.id ||
      breaker.scopeId === opportunity.flashLiquidityQuote?.provider.id ||
      route.legs.some(
        (leg) =>
          breaker.scopeId === leg.dexId ||
          breaker.scopeId === leg.poolId ||
          normalizeAddress(breaker.scopeId ?? "") ===
            normalizeAddress(leg.tokenIn.address) ||
          normalizeAddress(breaker.scopeId ?? "") ===
            normalizeAddress(leg.tokenOut.address),
      )
    );
  }

  private riskIssue(message: string): ValidationIssue {
    return issue(
      ValidationCode.RISK_LIMIT_EXCEEDED,
      ValidationSeverity.ERROR,
      message,
    );
  }
}

export function createCrossDexArbitrageValidator(
  options: CrossDexArbitrageValidatorOptions = {},
): CrossDexArbitrageValidator {
  return new CrossDexArbitrageValidator(options);
}

export const DEFAULT_CROSS_DEX_ARBITRAGE_VALIDATOR_OPTIONS = DEFAULT_OPTIONS;

export function basisPoints(value: number): BasisPoints {
  if (!validBasisPoints(value)) {
    throw new Error("Basis points must be an integer between 0 and 10,000.");
  }
  return value as BasisPoints;
}

export function chainId(value: number): ChainId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Chain ID must be a positive integer.");
  }
  return value as ChainId;
}

export function tokenAmount(value: bigint): TokenAmount {
  if (value < 0n) {
    throw new Error("Token amount cannot be negative.");
  }
  return value as TokenAmount;
}

export const CROSS_DEX_ARBITRAGE_VALIDATION_LIMITS = Object.freeze({
  maximumBasisPoints: CROSS_DEX_ARBITRAGE_DEFAULTS.basisPointsDenominator,
  maximumTokenDecimals: 255,
  minimumRouteLegs: 2,
} as const);