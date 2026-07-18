/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic profitability calculator for cross-DEX arbitrage routes.
 *
 * Responsibilities:
 * - Calculate gross and net route profit.
 * - Aggregate DEX fees, flash-liquidity premiums, gas, slippage, price impact,
 *   and optional MEV-protection costs.
 * - Convert heterogeneous costs into the route input token through explicit,
 *   deterministic USD valuations.
 * - Calculate gross/net basis-point returns and return-on-gas.
 * - Enforce configurable profitability thresholds.
 * - Return immutable, auditable profitability results.
 *
 * The calculator performs no network, RPC, wallet, filesystem, or clock access.
 */

import {
  type ArbitrageCostBreakdown,
  type ArbitrageFundingMode,
  type ArbitrageProfitability,
  type ArbitrageRoute,
  type BasisPoints,
  type CrossDexArbitrageMetadata,
  type FlashLiquidityQuote,
  type GasCostEstimate,
  type TokenAmount,
  type TokenDescriptor,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";

export enum ProfitabilityCalculatorErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_ROUTE = "INVALID_ROUTE",
  TOKEN_MISMATCH = "TOKEN_MISMATCH",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  INCOMPLETE_VALUATION = "INCOMPLETE_VALUATION",
  INVALID_PRICE = "INVALID_PRICE",
  INVALID_COST = "INVALID_COST",
  ARITHMETIC_OVERFLOW = "ARITHMETIC_OVERFLOW",
}

export class ProfitabilityCalculatorError extends Error {
  public readonly code: ProfitabilityCalculatorErrorCode;
  public readonly routeId?: string;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: ProfitabilityCalculatorErrorCode,
    message: string,
    options: Readonly<{
      routeId?: string;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "ProfitabilityCalculatorError";
    this.code = code;
    this.routeId = options.routeId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface TokenUsdValuation {
  readonly token: TokenDescriptor;
  readonly priceUsd: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ProfitabilityThresholds {
  readonly minimumNetProfitAmount?: TokenAmount;
  readonly minimumNetProfitUsd?: number;
  readonly minimumNetProfitBasisPoints?: BasisPoints;
  readonly minimumReturnOnGas?: number;
  readonly requirePositiveGrossProfit?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ProfitabilityCalculatorOptions {
  readonly basisPointsDenominator?: number;
  readonly strictValuation?: boolean;
  readonly includeQuotedDexFees?: boolean;
  readonly includeQuotedSlippage?: boolean;
  readonly includeQuotedPriceImpact?: boolean;
  readonly defaultThresholds?: ProfitabilityThresholds;
}

export interface ProfitabilityCalculationRequest {
  readonly route: ArbitrageRoute;
  readonly fundingMode: ArbitrageFundingMode;
  readonly gasEstimate?: GasCostEstimate;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;

  /**
   * USD price of one whole route-input token.
   */
  readonly inputTokenUsdPrice?: number;

  /**
   * Optional deterministic prices for fee tokens appearing in route quotes.
   */
  readonly tokenUsdValuations?: readonly TokenUsdValuation[];

  /**
   * Explicit input-token overrides. When supplied, these values take
   * precedence over calculated route-quote costs.
   */
  readonly dexFeeAmountOverride?: TokenAmount;
  readonly slippageCostAmountOverride?: TokenAmount;
  readonly priceImpactCostAmountOverride?: TokenAmount;

  /**
   * Gas cost converted into input-token smallest units. Required when a gas
   * estimate is supplied but no input-token USD price or gas USD value exists.
   */
  readonly gasCostAmountOverride?: TokenAmount;

  /**
   * Optional MEV-protection cost. The token amount is required for inclusion in
   * net token profit; Wei/USD values are retained for audit output.
   */
  readonly mevProtectionCostAmount?: TokenAmount;
  readonly mevProtectionCostWei?: WeiAmount;
  readonly mevProtectionCostUsd?: number;

  readonly additionalCostAmount?: TokenAmount;
  readonly additionalCostUsd?: number;
  readonly thresholds?: ProfitabilityThresholds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ProfitabilityPolicyEvaluation {
  readonly profitable: boolean;
  readonly violations: readonly string[];
  readonly thresholds: ProfitabilityThresholds;
}

export interface DetailedArbitrageProfitability
  extends ArbitrageProfitability {
  readonly gasCostAmount: TokenAmount;
  readonly mevProtectionCostAmount: TokenAmount;
  readonly additionalCostAmount: TokenAmount;
  readonly policy: ProfitabilityPolicyEvaluation;
}

interface NormalizedOptions {
  readonly basisPointsDenominator: number;
  readonly strictValuation: boolean;
  readonly includeQuotedDexFees: boolean;
  readonly includeQuotedSlippage: boolean;
  readonly includeQuotedPriceImpact: boolean;
  readonly defaultThresholds: ProfitabilityThresholds;
}

interface CostResolution {
  readonly amount: TokenAmount;
  readonly usd?: number;
}

const DEFAULT_THRESHOLDS: ProfitabilityThresholds = Object.freeze({
  minimumNetProfitAmount: 1n as TokenAmount,
  minimumNetProfitBasisPoints: 0 as BasisPoints,
  minimumReturnOnGas: 0,
  requirePositiveGrossProfit: true,
});

const DEFAULT_OPTIONS = Object.freeze({
  basisPointsDenominator: 10_000,
  strictValuation: true,
  includeQuotedDexFees: true,
  includeQuotedSlippage: true,
  includeQuotedPriceImpact: true,
});

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function mergeMetadata(
  ...sources: Array<CrossDexArbitrageMetadata | undefined>
): CrossDexArbitrageMetadata | undefined {
  const present = sources.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  return present.length === 0
    ? undefined
    : Object.freeze(Object.assign({}, ...present));
}

function asTokenAmount(value: bigint): TokenAmount {
  return value as TokenAmount;
}

function asBasisPoints(value: number): BasisPoints {
  return value as BasisPoints;
}

function assertNonNegativeAmount(
  value: bigint | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (typeof value !== "bigint" || value < 0n)
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.INVALID_COST,
      `${field} must be a non-negative bigint.`,
      { details: value },
    );
  }
}

function assertPositivePrice(
  value: number | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value <= 0)
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.INVALID_PRICE,
      `${field} must be a positive finite number.`,
      { details: value },
    );
  }
}

function assertNonNegativeNumber(
  value: number | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0)
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.INVALID_COST,
      `${field} must be a non-negative finite number.`,
      { details: value },
    );
  }
}

function tokenKey(token: TokenDescriptor): string {
  return `${Number(token.chainId)}:${String(token.address).toLowerCase()}`;
}

function sameToken(
  left: TokenDescriptor,
  right: TokenDescriptor,
): boolean {
  return (
    left.chainId === right.chainId &&
    String(left.address).toLowerCase() ===
      String(right.address).toLowerCase()
  );
}

function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function amountToUsd(
  amount: TokenAmount,
  token: TokenDescriptor,
  priceUsd: number,
): number {
  const whole = Number(amount) / Number(pow10(token.decimals));
  const value = whole * priceUsd;

  if (!Number.isFinite(value)) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.ARITHMETIC_OVERFLOW,
      "Token amount cannot be represented as a finite USD value.",
      {
        details: {
          amount,
          token: token.symbol,
          priceUsd,
        },
      },
    );
  }

  return value;
}

function usdToAmount(
  usd: number,
  token: TokenDescriptor,
  priceUsd: number,
): TokenAmount {
  const smallestUnits =
    (usd / priceUsd) * Number(pow10(token.decimals));

  if (
    !Number.isFinite(smallestUnits) ||
    smallestUnits < 0 ||
    smallestUnits > Number.MAX_SAFE_INTEGER
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.ARITHMETIC_OVERFLOW,
      "USD value cannot be safely converted into token smallest units.",
      {
        details: {
          usd,
          token: token.symbol,
          priceUsd,
        },
      },
    );
  }

  return asTokenAmount(BigInt(Math.ceil(smallestUnits)));
}

function basisPoints(
  numerator: bigint,
  denominator: bigint,
  basisPointsDenominator: number,
): BasisPoints {
  if (denominator <= 0n) {
    return 0 as BasisPoints;
  }

  const scaled =
    (numerator * BigInt(basisPointsDenominator)) /
    denominator;

  const numeric = Number(scaled);

  if (!Number.isSafeInteger(numeric)) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.ARITHMETIC_OVERFLOW,
      "Basis-point result exceeds the safe integer range.",
      { details: scaled },
    );
  }

  return asBasisPoints(numeric);
}

function multiplyByBasisPoints(
  amount: TokenAmount,
  bps: BasisPoints,
  denominator: number,
): TokenAmount {
  if (bps <= 0) {
    return 0n as TokenAmount;
  }

  return asTokenAmount(
    (amount * BigInt(bps)) / BigInt(denominator),
  );
}

function normalizeThresholds(
  thresholds:
    | ProfitabilityThresholds
    | undefined,
): ProfitabilityThresholds {
  const normalized = Object.freeze({
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
    metadata: freezeMetadata(thresholds?.metadata),
  });

  assertNonNegativeAmount(
    normalized.minimumNetProfitAmount,
    "minimumNetProfitAmount",
  );
  assertNonNegativeNumber(
    normalized.minimumNetProfitUsd,
    "minimumNetProfitUsd",
  );

  if (
    normalized.minimumNetProfitBasisPoints !== undefined &&
    (!Number.isFinite(
      normalized.minimumNetProfitBasisPoints,
    ) ||
      normalized.minimumNetProfitBasisPoints < 0)
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.INVALID_OPTIONS,
      "minimumNetProfitBasisPoints must be non-negative.",
    );
  }

  assertNonNegativeNumber(
    normalized.minimumReturnOnGas,
    "minimumReturnOnGas",
  );

  return normalized;
}

function normalizeOptions(
  options: ProfitabilityCalculatorOptions,
): NormalizedOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(
      merged.basisPointsDenominator,
    ) ||
    merged.basisPointsDenominator <= 0
  ) {
    throw new ProfitabilityCalculatorError(
      ProfitabilityCalculatorErrorCode.INVALID_OPTIONS,
      "basisPointsDenominator must be a positive safe integer.",
      { details: merged.basisPointsDenominator },
    );
  }

  return Object.freeze({
    basisPointsDenominator:
      merged.basisPointsDenominator,
    strictValuation: merged.strictValuation,
    includeQuotedDexFees:
      merged.includeQuotedDexFees,
    includeQuotedSlippage:
      merged.includeQuotedSlippage,
    includeQuotedPriceImpact:
      merged.includeQuotedPriceImpact,
    defaultThresholds: normalizeThresholds(
      merged.defaultThresholds,
    ),
  });
}

export class ProfitabilityCalculator {
  private readonly options: NormalizedOptions;

  public constructor(
    options: ProfitabilityCalculatorOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public calculate(
    request: ProfitabilityCalculationRequest,
  ): DetailedArbitrageProfitability {
    this.validateRequest(request);

    const route = request.route;
    const inputToken = route.startToken;
    const valuations =
      this.buildValuationMap(request);

    const grossOutputAmount =
      route.expectedFinalAmount;
    const grossProfitAmount = asTokenAmount(
      grossOutputAmount - route.inputAmount,
    );

    const grossProfitUsd =
      request.inputTokenUsdPrice === undefined
        ? undefined
        : amountToUsd(
            grossProfitAmount,
            inputToken,
            request.inputTokenUsdPrice,
          );

    const dexFees = this.resolveDexFees(
      request,
      valuations,
    );
    const flashPremium =
      this.resolveFlashPremium(request);
    const gas = this.resolveGasCost(request);
    const slippage =
      this.resolveSlippageCost(request);
    const priceImpact =
      this.resolvePriceImpactCost(request);
    const mev = this.resolveMevCost(request);
    const additional =
      this.resolveAdditionalCost(request);

    const totalEstimatedCostAmount =
      asTokenAmount(
        dexFees.amount +
          flashPremium.amount +
          gas.amount +
          slippage.amount +
          priceImpact.amount +
          mev.amount +
          additional.amount,
      );

    const totalEstimatedCostUsd =
      this.sumOptionalUsd([
        dexFees.usd,
        flashPremium.usd,
        gas.usd,
        slippage.usd,
        priceImpact.usd,
        mev.usd,
        additional.usd,
      ]);

    const netOutputAmount =
      grossOutputAmount >= totalEstimatedCostAmount
        ? asTokenAmount(
            grossOutputAmount -
              totalEstimatedCostAmount,
          )
        : 0n as TokenAmount;

    const netProfitAmount = asTokenAmount(
      grossProfitAmount -
        totalEstimatedCostAmount,
    );

    const netProfitUsd =
      grossProfitUsd !== undefined &&
      totalEstimatedCostUsd !== undefined
        ? grossProfitUsd -
          totalEstimatedCostUsd
        : request.inputTokenUsdPrice !== undefined
          ? amountToUsd(
              netProfitAmount,
              inputToken,
              request.inputTokenUsdPrice,
            )
          : undefined;

    const grossProfitBasisPoints =
      basisPoints(
        grossProfitAmount,
        route.inputAmount,
        this.options.basisPointsDenominator,
      );
    const netProfitBasisPoints =
      basisPoints(
        netProfitAmount,
        route.inputAmount,
        this.options.basisPointsDenominator,
      );

    const returnOnGas = this.calculateReturnOnGas(
      netProfitAmount,
      netProfitUsd,
      gas,
      request.inputTokenUsdPrice,
      inputToken,
    );

    const thresholds = normalizeThresholds({
      ...this.options.defaultThresholds,
      ...request.thresholds,
      metadata: mergeMetadata(
        this.options.defaultThresholds.metadata,
        request.thresholds?.metadata,
      ),
    });

    const violations = this.evaluateThresholds({
      grossProfitAmount,
      netProfitAmount,
      netProfitUsd,
      netProfitBasisPoints,
      returnOnGas,
      thresholds,
    });

    const policy: ProfitabilityPolicyEvaluation =
      Object.freeze({
        profitable: violations.length === 0,
        violations: Object.freeze(violations),
        thresholds,
      });

    const costs: ArbitrageCostBreakdown =
      Object.freeze({
        inputToken,
        inputAmount: route.inputAmount,
        totalDexFeeAmount: dexFees.amount,
        totalDexFeeUsd: dexFees.usd,
        flashLoanPremiumAmount:
          flashPremium.amount,
        flashLoanPremiumUsd:
          flashPremium.usd,
        gasCostWei:
          request.gasEstimate
            ?.estimatedCostWei ??
          (0n as WeiAmount),
        gasCostUsd: gas.usd,
        slippageCostAmount: slippage.amount,
        slippageCostUsd: slippage.usd,
        priceImpactCostAmount:
          priceImpact.amount,
        priceImpactCostUsd:
          priceImpact.usd,
        mevProtectionCostWei:
          request.mevProtectionCostWei,
        mevProtectionCostUsd: mev.usd,
        totalEstimatedCostAmount,
        totalEstimatedCostUsd,
        metadata: mergeMetadata(
          request.metadata,
          Object.freeze({
            calculator:
              "profitability-calculator",
            fundingMode:
              request.fundingMode,
          }),
        ),
      });

    return Object.freeze({
      inputToken,
      inputAmount: route.inputAmount,
      grossOutputAmount,
      grossProfitAmount,
      grossProfitUsd,
      costs,
      netOutputAmount,
      netProfitAmount,
      netProfitUsd,
      grossProfitBasisPoints,
      netProfitBasisPoints,
      returnOnGas,
      profitable: policy.profitable,
      metadata: mergeMetadata(
        route.metadata,
        request.metadata,
        Object.freeze({
          policyViolationCount:
            violations.length,
        }),
      ),
      gasCostAmount: gas.amount,
      mevProtectionCostAmount: mev.amount,
      additionalCostAmount:
        additional.amount,
      policy,
    });
  }

  public requireProfitable(
    request: ProfitabilityCalculationRequest,
  ): DetailedArbitrageProfitability {
    const result = this.calculate(request);

    if (!result.profitable) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INVALID_COST,
        "Arbitrage route does not satisfy profitability thresholds.",
        {
          routeId: String(request.route.id),
          details: result.policy.violations,
        },
      );
    }

    return result;
  }

  private buildValuationMap(
    request: ProfitabilityCalculationRequest,
  ): ReadonlyMap<string, number> {
    const valuations = new Map<string, number>();

    if (request.inputTokenUsdPrice !== undefined) {
      valuations.set(
        tokenKey(request.route.startToken),
        request.inputTokenUsdPrice,
      );
    }

    for (
      const valuation of
      request.tokenUsdValuations ?? []
    ) {
      assertPositivePrice(
        valuation.priceUsd,
        "tokenUsdValuations.priceUsd",
      );

      if (
        valuation.token.chainId !==
        request.route.chainId
      ) {
        throw new ProfitabilityCalculatorError(
          ProfitabilityCalculatorErrorCode.CHAIN_MISMATCH,
          "Token valuation chain does not match route chain.",
          {
            routeId: String(request.route.id),
            details: valuation.token,
          },
        );
      }

      valuations.set(
        tokenKey(valuation.token),
        valuation.priceUsd,
      );
    }

    return valuations;
  }

  private resolveDexFees(
    request: ProfitabilityCalculationRequest,
    valuations: ReadonlyMap<string, number>,
  ): CostResolution {
    if (
      request.dexFeeAmountOverride !== undefined
    ) {
      return this.resolveInputTokenCost(
        request.dexFeeAmountOverride,
        request.inputTokenUsdPrice,
        request.route.startToken,
      );
    }

    if (!this.options.includeQuotedDexFees) {
      return Object.freeze({
        amount: 0n as TokenAmount,
        usd: request.inputTokenUsdPrice ===
          undefined
          ? undefined
          : 0,
      });
    }

    let amount = 0n;
    let usdTotal = 0;
    let allUsdKnown = true;

    for (const leg of request.route.legs) {
      const fee = leg.quote.dexFee;

      if (
        sameToken(
          fee.feeToken,
          request.route.startToken,
        )
      ) {
        amount += fee.feeAmount;
      }

      if (fee.feeAmountUsd !== undefined) {
        usdTotal += fee.feeAmountUsd;
        continue;
      }

      const price = valuations.get(
        tokenKey(fee.feeToken),
      );

      if (price === undefined) {
        allUsdKnown = false;
        continue;
      }

      usdTotal += amountToUsd(
        fee.feeAmount,
        fee.feeToken,
        price,
      );
    }

    if (
      request.inputTokenUsdPrice !== undefined &&
      allUsdKnown
    ) {
      amount = usdToAmount(
        usdTotal,
        request.route.startToken,
        request.inputTokenUsdPrice,
      );
    } else if (
      this.options.strictValuation &&
      request.route.legs.some(
        (leg) =>
          !sameToken(
            leg.quote.dexFee.feeToken,
            request.route.startToken,
          ),
      )
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INCOMPLETE_VALUATION,
        "DEX fees use non-input tokens and cannot be converted deterministically.",
        { routeId: String(request.route.id) },
      );
    }

    return Object.freeze({
      amount: asTokenAmount(amount),
      usd: allUsdKnown ? usdTotal : undefined,
    });
  }

  private resolveFlashPremium(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const quote = request.flashLiquidityQuote;

    if (quote === undefined) {
      return Object.freeze({
        amount: 0n as TokenAmount,
        usd: request.inputTokenUsdPrice ===
          undefined
          ? undefined
          : 0,
      });
    }

    if (
      !sameToken(
        quote.asset,
        request.route.startToken,
      )
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.TOKEN_MISMATCH,
        "Flash-liquidity asset must match route input token.",
        { routeId: String(request.route.id) },
      );
    }

    return Object.freeze({
      amount: quote.premiumAmount,
      usd:
        quote.premiumAmountUsd ??
        (request.inputTokenUsdPrice === undefined
          ? undefined
          : amountToUsd(
              quote.premiumAmount,
              quote.asset,
              request.inputTokenUsdPrice,
            )),
    });
  }

  private resolveGasCost(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const estimate = request.gasEstimate;

    if (estimate === undefined) {
      return Object.freeze({
        amount: 0n as TokenAmount,
        usd: request.inputTokenUsdPrice ===
          undefined
          ? undefined
          : 0,
      });
    }

    if (
      estimate.chainId !== request.route.chainId
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.CHAIN_MISMATCH,
        "Gas estimate chain does not match route chain.",
        { routeId: String(request.route.id) },
      );
    }

    if (
      request.gasCostAmountOverride !== undefined
    ) {
      return Object.freeze({
        amount: request.gasCostAmountOverride,
        usd:
          estimate.estimatedCostUsd ??
          (request.inputTokenUsdPrice ===
          undefined
            ? undefined
            : amountToUsd(
                request.gasCostAmountOverride,
                request.route.startToken,
                request.inputTokenUsdPrice,
              )),
      });
    }

    if (
      estimate.estimatedCostUsd !== undefined &&
      request.inputTokenUsdPrice !== undefined
    ) {
      return Object.freeze({
        amount: usdToAmount(
          estimate.estimatedCostUsd,
          request.route.startToken,
          request.inputTokenUsdPrice,
        ),
        usd: estimate.estimatedCostUsd,
      });
    }

    if (this.options.strictValuation) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INCOMPLETE_VALUATION,
        "Gas cost cannot be converted into the route input token. Supply gasCostAmountOverride or USD valuations.",
        { routeId: String(request.route.id) },
      );
    }

    return Object.freeze({
      amount: 0n as TokenAmount,
      usd: estimate.estimatedCostUsd,
    });
  }

  private resolveSlippageCost(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const amount =
      request.slippageCostAmountOverride ??
      (this.options.includeQuotedSlippage
        ? request.route.legs.reduce<bigint>(
            (total, leg) =>
              total +
              multiplyByBasisPoints(
                leg.amountIn,
                leg.quote
                  .estimatedSlippageBasisPoints,
                this.options
                  .basisPointsDenominator,
              ),
            0n,
          )
        : 0n as TokenAmount);

    return this.resolveInputTokenCost(
      asTokenAmount(amount),
      request.inputTokenUsdPrice,
      request.route.startToken,
    );
  }

  private resolvePriceImpactCost(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const amount =
      request.priceImpactCostAmountOverride ??
      (this.options.includeQuotedPriceImpact
        ? request.route.legs.reduce<bigint>(
            (total, leg) =>
              total +
              multiplyByBasisPoints(
                leg.amountIn,
                leg.quote
                  .priceImpactBasisPoints,
                this.options
                  .basisPointsDenominator,
              ),
            0n,
          )
        : 0n as TokenAmount);

    return this.resolveInputTokenCost(
      asTokenAmount(amount),
      request.inputTokenUsdPrice,
      request.route.startToken,
    );
  }

  private resolveMevCost(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const amount =
      request.mevProtectionCostAmount ??
      (0n as TokenAmount);

    return Object.freeze({
      amount,
      usd:
        request.mevProtectionCostUsd ??
        (request.inputTokenUsdPrice === undefined
          ? undefined
          : amountToUsd(
              amount,
              request.route.startToken,
              request.inputTokenUsdPrice,
            )),
    });
  }

  private resolveAdditionalCost(
    request: ProfitabilityCalculationRequest,
  ): CostResolution {
    const amount =
      request.additionalCostAmount ??
      (0n as TokenAmount);

    return Object.freeze({
      amount,
      usd:
        request.additionalCostUsd ??
        (request.inputTokenUsdPrice === undefined
          ? undefined
          : amountToUsd(
              amount,
              request.route.startToken,
              request.inputTokenUsdPrice,
            )),
    });
  }

  private resolveInputTokenCost(
    amount: TokenAmount,
    inputTokenUsdPrice: number | undefined,
    token: TokenDescriptor,
  ): CostResolution {
    return Object.freeze({
      amount,
      usd:
        inputTokenUsdPrice === undefined
          ? undefined
          : amountToUsd(
              amount,
              token,
              inputTokenUsdPrice,
            ),
    });
  }

  private sumOptionalUsd(
    values: readonly (number | undefined)[],
  ): number | undefined {
    if (values.some((value) => value === undefined)) {
      return undefined;
    }

    return values.reduce<number>(
      (total, value) => total + (value ?? 0),
      0,
    );
  }

  private calculateReturnOnGas(
    netProfitAmount: TokenAmount,
    netProfitUsd: number | undefined,
    gas: CostResolution,
    inputTokenUsdPrice: number | undefined,
    inputToken: TokenDescriptor,
  ): number | undefined {
    if (gas.amount > 0n) {
      return Number(netProfitAmount) /
        Number(gas.amount);
    }

    if (
      gas.usd !== undefined &&
      gas.usd > 0 &&
      netProfitUsd !== undefined
    ) {
      return netProfitUsd / gas.usd;
    }

    if (
      inputTokenUsdPrice !== undefined &&
      gas.usd !== undefined &&
      gas.usd > 0
    ) {
      return (
        amountToUsd(
          netProfitAmount,
          inputToken,
          inputTokenUsdPrice,
        ) / gas.usd
      );
    }

    return undefined;
  }

  private evaluateThresholds(
    input: Readonly<{
      grossProfitAmount: TokenAmount;
      netProfitAmount: TokenAmount;
      netProfitUsd?: number;
      netProfitBasisPoints: BasisPoints;
      returnOnGas?: number;
      thresholds: ProfitabilityThresholds;
    }>,
  ): string[] {
    const violations: string[] = [];

    if (
      input.thresholds.requirePositiveGrossProfit &&
      input.grossProfitAmount <= 0n
    ) {
      violations.push(
        "Gross profit must be positive.",
      );
    }

    if (
      input.thresholds.minimumNetProfitAmount !==
        undefined &&
      input.netProfitAmount <
        input.thresholds.minimumNetProfitAmount
    ) {
      violations.push(
        "Net profit amount is below the configured minimum.",
      );
    }

    if (
      input.thresholds.minimumNetProfitUsd !==
        undefined &&
      (input.netProfitUsd === undefined ||
        input.netProfitUsd <
          input.thresholds.minimumNetProfitUsd)
    ) {
      violations.push(
        "Net profit USD value is unavailable or below the configured minimum.",
      );
    }

    if (
      input.thresholds
        .minimumNetProfitBasisPoints !==
        undefined &&
      input.netProfitBasisPoints <
        input.thresholds
          .minimumNetProfitBasisPoints
    ) {
      violations.push(
        "Net profit basis points are below the configured minimum.",
      );
    }

    if (
      input.thresholds.minimumReturnOnGas !==
        undefined &&
      input.thresholds.minimumReturnOnGas > 0 &&
      (input.returnOnGas === undefined ||
        input.returnOnGas <
          input.thresholds.minimumReturnOnGas)
    ) {
      violations.push(
        "Return on gas is unavailable or below the configured minimum.",
      );
    }

    return violations;
  }

  private validateRequest(
    request: ProfitabilityCalculationRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object" ||
      request.route === undefined
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INVALID_REQUEST,
        "A route is required.",
        { details: request },
      );
    }

    const route = request.route;

    if (
      route.legs.length < 2 ||
      route.inputAmount <= 0n ||
      route.expectedFinalAmount <= 0n
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INVALID_ROUTE,
        "Route must contain at least two legs and positive amounts.",
        { routeId: String(route.id) },
      );
    }

    if (!route.isAtomic) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INVALID_ROUTE,
        "Profitability calculation requires an atomic arbitrage route.",
        { routeId: String(route.id) },
      );
    }

    if (
      !sameToken(
        route.startToken,
        route.endToken,
      )
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.TOKEN_MISMATCH,
        "Arbitrage route must end in its input token.",
        { routeId: String(route.id) },
      );
    }

    if (
      route.expectedFinalAmount <
      route.inputAmount
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.INVALID_ROUTE,
        "Expected final amount cannot be less than input amount.",
        { routeId: String(route.id) },
      );
    }

    assertPositivePrice(
      request.inputTokenUsdPrice,
      "inputTokenUsdPrice",
    );

    assertNonNegativeAmount(
      request.dexFeeAmountOverride,
      "dexFeeAmountOverride",
    );
    assertNonNegativeAmount(
      request.slippageCostAmountOverride,
      "slippageCostAmountOverride",
    );
    assertNonNegativeAmount(
      request.priceImpactCostAmountOverride,
      "priceImpactCostAmountOverride",
    );
    assertNonNegativeAmount(
      request.gasCostAmountOverride,
      "gasCostAmountOverride",
    );
    assertNonNegativeAmount(
      request.mevProtectionCostAmount,
      "mevProtectionCostAmount",
    );
    assertNonNegativeAmount(
      request.mevProtectionCostWei,
      "mevProtectionCostWei",
    );
    assertNonNegativeAmount(
      request.additionalCostAmount,
      "additionalCostAmount",
    );

    assertNonNegativeNumber(
      request.mevProtectionCostUsd,
      "mevProtectionCostUsd",
    );
    assertNonNegativeNumber(
      request.additionalCostUsd,
      "additionalCostUsd",
    );

    if (
      request.flashLiquidityQuote !== undefined &&
      request.flashLiquidityQuote.provider.chainId !==
        route.chainId
    ) {
      throw new ProfitabilityCalculatorError(
        ProfitabilityCalculatorErrorCode.CHAIN_MISMATCH,
        "Flash-liquidity quote chain does not match route chain.",
        { routeId: String(route.id) },
      );
    }
  }
}

export function createProfitabilityCalculator(
  options: ProfitabilityCalculatorOptions = {},
): ProfitabilityCalculator {
  return new ProfitabilityCalculator(options);
}