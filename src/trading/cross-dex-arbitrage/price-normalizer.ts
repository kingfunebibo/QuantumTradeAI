/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic price normalization and fixed-point arithmetic.
 *
 * Responsibilities:
 * - Normalize token amounts across arbitrary ERC-20 decimal configurations.
 * - Represent prices using deterministic bigint fixed-point values.
 * - Convert execution prices, quotes, and selected pool states into a common form.
 * - Invert, compose, compare, and aggregate normalized prices.
 * - Calculate deterministic spreads, deviations, and basis-point movements.
 * - Avoid floating-point arithmetic in execution-critical calculations.
 *
 * This module performs no RPC, filesystem, timer, wallet, or background access.
 */

import {
  type BasisPoints,
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexId,
  DexLiquidityModel,
  type DexPoolState,
  type DexQuote,
  type EvmAddress,
  type PoolId,
  type TokenAmount,
  type TokenDescriptor,
  type TokenId,
  type UnixTimestampMilliseconds,
} from "./cross-dex-arbitrage-contracts";

export type NormalizedPriceValue = bigint & {
  readonly __normalizedPriceValueBrand: unique symbol;
};

export type PriceScale = bigint & {
  readonly __priceScaleBrand: unique symbol;
};

export enum PriceRoundingMode {
  DOWN = "DOWN",
  UP = "UP",
  HALF_UP = "HALF_UP",
  HALF_EVEN = "HALF_EVEN",
}

export enum NormalizedPriceSource {
  QUOTE_EXECUTION = "QUOTE_EXECUTION",
  QUOTE_REFERENCE = "QUOTE_REFERENCE",
  CONSTANT_PRODUCT_POOL = "CONSTANT_PRODUCT_POOL",
  CONCENTRATED_LIQUIDITY_POOL = "CONCENTRATED_LIQUIDITY_POOL",
  ORDER_BOOK_MID = "ORDER_BOOK_MID",
  ORDER_BOOK_BID = "ORDER_BOOK_BID",
  ORDER_BOOK_ASK = "ORDER_BOOK_ASK",
  TOKEN_USD = "TOKEN_USD",
  DERIVED = "DERIVED",
  EXTERNAL = "EXTERNAL",
}

export enum PriceNormalizerErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_TOKEN = "INVALID_TOKEN",
  INVALID_TOKEN_DECIMALS = "INVALID_TOKEN_DECIMALS",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  INVALID_PRICE = "INVALID_PRICE",
  INVALID_SCALE = "INVALID_SCALE",
  INVALID_BASIS_POINTS = "INVALID_BASIS_POINTS",
  DIVISION_BY_ZERO = "DIVISION_BY_ZERO",
  TOKEN_MISMATCH = "TOKEN_MISMATCH",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  DEX_MISMATCH = "DEX_MISMATCH",
  POOL_MISMATCH = "POOL_MISMATCH",
  UNSUPPORTED_POOL_MODEL = "UNSUPPORTED_POOL_MODEL",
  PRICE_UNAVAILABLE = "PRICE_UNAVAILABLE",
  PRICE_OVERFLOW = "PRICE_OVERFLOW",
  INVALID_SAMPLE_SET = "INVALID_SAMPLE_SET",
  STALE_PRICE = "STALE_PRICE",
  FUTURE_PRICE = "FUTURE_PRICE",
}

export class PriceNormalizerError extends Error {
  public readonly code: PriceNormalizerErrorCode;
  public readonly chainId?: ChainId;
  public readonly dexId?: DexId;
  public readonly poolId?: PoolId;
  public readonly tokenId?: TokenId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: PriceNormalizerErrorCode,
    message: string,
    options: Readonly<{
      chainId?: ChainId;
      dexId?: DexId;
      poolId?: PoolId;
      tokenId?: TokenId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "PriceNormalizerError";
    this.code = code;
    this.chainId = options.chainId;
    this.dexId = options.dexId;
    this.poolId = options.poolId;
    this.tokenId = options.tokenId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PriceNormalizerOptions {
  readonly priceScaleDecimals?: number;
  readonly roundingMode?: PriceRoundingMode;
  readonly maximumTokenDecimals?: number;
  readonly maximumExponent?: number;
  readonly maximumAbsoluteValue?: bigint;
  readonly allowZeroPrice?: boolean;
  readonly requireSameChain?: boolean;
}

export interface NormalizedPrice {
  readonly chainId: ChainId;
  readonly baseToken: TokenDescriptor;
  readonly quoteToken: TokenDescriptor;
  readonly value: NormalizedPriceValue;
  readonly scale: PriceScale;
  readonly scaleDecimals: number;
  readonly source: NormalizedPriceSource;
  readonly blockNumber?: BlockNumber;
  readonly observedAtMilliseconds?: UnixTimestampMilliseconds;
  readonly dexId?: DexId;
  readonly poolId?: PoolId;
  readonly confidenceBasisPoints?: BasisPoints;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PriceFreshnessPolicy {
  readonly nowMilliseconds: UnixTimestampMilliseconds;
  readonly maximumAgeMilliseconds: number;
  readonly allowFutureObservations?: boolean;
}

export interface PriceComparison {
  readonly left: NormalizedPrice;
  readonly right: NormalizedPrice;
  readonly absoluteDifference: NormalizedPriceValue;
  readonly signedDifference: bigint;
  readonly deviationBasisPoints: BasisPoints;
  readonly leftGreaterThanRight: boolean;
  readonly equal: boolean;
}

export interface NormalizedAmountConversion {
  readonly inputAmount: TokenAmount;
  readonly outputAmount: TokenAmount;
  readonly price: NormalizedPrice;
  readonly roundingMode: PriceRoundingMode;
}

export interface WeightedPriceSample {
  readonly price: NormalizedPrice;
  readonly weight: bigint;
}

export interface PriceAggregate {
  readonly price: NormalizedPrice;
  readonly sampleCount: number;
  readonly totalWeight: bigint;
  readonly minimum: NormalizedPrice;
  readonly maximum: NormalizedPrice;
  readonly median: NormalizedPrice;
  readonly spreadBasisPoints: BasisPoints;
}

export interface QuotePriceNormalizationOptions {
  readonly useReferencePrice?: boolean;
  readonly source?: NormalizedPriceSource;
  readonly confidenceBasisPoints?: BasisPoints;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PoolStatePriceNormalizationOptions {
  readonly direction?: "TOKEN0_TO_TOKEN1" | "TOKEN1_TO_TOKEN0";
  readonly orderBookSide?: "MID" | "BID" | "ASK";
  readonly confidenceBasisPoints?: BasisPoints;
  readonly metadata?: CrossDexArbitrageMetadata;
}

const BASIS_POINTS_DENOMINATOR = 10_000n;
const Q192 = 1n << 192n;

const DEFAULT_OPTIONS: Required<PriceNormalizerOptions> =
  Object.freeze({
    priceScaleDecimals: 18,
    roundingMode: PriceRoundingMode.HALF_UP,
    maximumTokenDecimals: 255,
    maximumExponent: 255,
    maximumAbsoluteValue:
      (1n << 255n) - 1n,
    allowZeroPrice: false,
    requireSameChain: true,
  });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function normalizeOptions(
  options: PriceNormalizerOptions,
): Required<PriceNormalizerOptions> {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(merged.priceScaleDecimals) ||
    merged.priceScaleDecimals < 0 ||
    merged.priceScaleDecimals > merged.maximumExponent
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_OPTIONS,
      "priceScaleDecimals must be a non-negative safe integer within maximumExponent.",
      { details: merged.priceScaleDecimals },
    );
  }

  if (
    !Number.isSafeInteger(merged.maximumTokenDecimals) ||
    merged.maximumTokenDecimals < 0
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_OPTIONS,
      "maximumTokenDecimals must be a non-negative safe integer.",
      { details: merged.maximumTokenDecimals },
    );
  }

  if (
    !Number.isSafeInteger(merged.maximumExponent) ||
    merged.maximumExponent < 0
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_OPTIONS,
      "maximumExponent must be a non-negative safe integer.",
      { details: merged.maximumExponent },
    );
  }

  if (merged.maximumAbsoluteValue <= 0n) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_OPTIONS,
      "maximumAbsoluteValue must be positive.",
      { details: merged.maximumAbsoluteValue },
    );
  }

  if (
    !Object.values(PriceRoundingMode).includes(
      merged.roundingMode,
    )
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_OPTIONS,
      "roundingMode is invalid.",
      { details: merged.roundingMode },
    );
  }

  return Object.freeze(merged);
}

function pow10(
  exponent: number,
  maximumExponent: number,
): bigint {
  if (
    !Number.isSafeInteger(exponent) ||
    exponent < 0 ||
    exponent > maximumExponent
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_SCALE,
      `Decimal exponent must be between 0 and ${maximumExponent}.`,
      { details: exponent },
    );
  }

  return 10n ** BigInt(exponent);
}

function normalizeToken(
  token: TokenDescriptor,
  maximumTokenDecimals: number,
): TokenDescriptor {
  if (token === null || typeof token !== "object") {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_TOKEN,
      "Token descriptor must be an object.",
      { details: token },
    );
  }

  if (
    !Number.isSafeInteger(token.chainId) ||
    Number(token.chainId) <= 0
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_TOKEN,
      "Token chainId must be a positive safe integer.",
      { tokenId: token.id, details: token.chainId },
    );
  }

  if (
    !Number.isSafeInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > maximumTokenDecimals
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_TOKEN_DECIMALS,
      `Token decimals must be between 0 and ${maximumTokenDecimals}.`,
      {
        chainId: token.chainId,
        tokenId: token.id,
        details: token.decimals,
      },
    );
  }

  if (
    typeof token.address !== "string" ||
    token.address.trim().length === 0
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_TOKEN,
      "Token address must be a non-empty string.",
      { chainId: token.chainId, tokenId: token.id },
    );
  }

  return Object.freeze({
    ...token,
    address:
      token.address.trim().toLowerCase() as EvmAddress,
    symbol: token.symbol.trim(),
    name: token.name.trim(),
    canonicalSymbol: token.canonicalSymbol?.trim(),
    coingeckoId: token.coingeckoId?.trim(),
    metadata: freezeMetadata(token.metadata),
  });
}

function assertTokenPair(
  baseToken: TokenDescriptor,
  quoteToken: TokenDescriptor,
  requireSameChain: boolean,
): void {
  if (
    requireSameChain &&
    baseToken.chainId !== quoteToken.chainId
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.CHAIN_MISMATCH,
      "Base and quote tokens must belong to the same chain.",
      {
        chainId: baseToken.chainId,
        tokenId: baseToken.id,
        details: {
          baseChainId: baseToken.chainId,
          quoteChainId: quoteToken.chainId,
        },
      },
    );
  }

  if (
    baseToken.chainId === quoteToken.chainId &&
    baseToken.address.toLowerCase() ===
      quoteToken.address.toLowerCase()
  ) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.TOKEN_MISMATCH,
      "Base and quote tokens must be distinct.",
      {
        chainId: baseToken.chainId,
        tokenId: baseToken.id,
      },
    );
  }
}

function validateUnsigned(
  value: bigint,
  field: string,
): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.INVALID_AMOUNT,
      `${field} must be a non-negative bigint.`,
      { details: value },
    );
  }

  return value;
}

function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: PriceRoundingMode,
): bigint {
  if (denominator === 0n) {
    throw new PriceNormalizerError(
      PriceNormalizerErrorCode.DIVISION_BY_ZERO,
      "Cannot divide by zero.",
    );
  }

  const negative =
    (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator =
    numerator < 0n ? -numerator : numerator;
  const absoluteDenominator =
    denominator < 0n ? -denominator : denominator;

  const quotient =
    absoluteNumerator / absoluteDenominator;
  const remainder =
    absoluteNumerator % absoluteDenominator;

  let rounded = quotient;

  if (remainder !== 0n) {
    switch (mode) {
      case PriceRoundingMode.DOWN:
        break;

      case PriceRoundingMode.UP:
        rounded += 1n;
        break;

      case PriceRoundingMode.HALF_UP:
        if (remainder * 2n >= absoluteDenominator) {
          rounded += 1n;
        }
        break;

      case PriceRoundingMode.HALF_EVEN: {
        const doubled = remainder * 2n;

        if (
          doubled > absoluteDenominator ||
          (doubled === absoluteDenominator &&
            quotient % 2n !== 0n)
        ) {
          rounded += 1n;
        }
        break;
      }

      default:
        throw new PriceNormalizerError(
          PriceNormalizerErrorCode.INVALID_OPTIONS,
          "Unsupported rounding mode.",
          { details: mode },
        );
    }
  }

  return negative ? -rounded : rounded;
}

function compareTokenIdentity(
  left: TokenDescriptor,
  right: TokenDescriptor,
): boolean {
  return (
    left.chainId === right.chainId &&
    left.address.toLowerCase() ===
      right.address.toLowerCase()
  );
}

function mergeMetadata(
  ...values: readonly (
    | CrossDexArbitrageMetadata
    | undefined
  )[]
): CrossDexArbitrageMetadata | undefined {
  const defined = values.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  if (defined.length === 0) {
    return undefined;
  }

  return Object.freeze(
    Object.assign({}, ...defined),
  );
}

export class CrossDexArbitragePriceNormalizer {
  private readonly options: Required<PriceNormalizerOptions>;
  private readonly scale: PriceScale;

  public constructor(
    options: PriceNormalizerOptions = {},
  ) {
    this.options = normalizeOptions(options);
    this.scale = pow10(
      this.options.priceScaleDecimals,
      this.options.maximumExponent,
    ) as PriceScale;
  }

  public getScale(): PriceScale {
    return this.scale;
  }

  public getScaleDecimals(): number {
    return this.options.priceScaleDecimals;
  }

  public normalizeRatio(
    baseTokenInput: TokenDescriptor,
    quoteTokenInput: TokenDescriptor,
    baseAmountInput: TokenAmount | bigint,
    quoteAmountInput: TokenAmount | bigint,
    context: Readonly<{
      source?: NormalizedPriceSource;
      blockNumber?: BlockNumber;
      observedAtMilliseconds?: UnixTimestampMilliseconds;
      dexId?: DexId;
      poolId?: PoolId;
      confidenceBasisPoints?: BasisPoints;
      metadata?: CrossDexArbitrageMetadata;
    }> = {},
  ): NormalizedPrice {
    const baseToken = normalizeToken(
      baseTokenInput,
      this.options.maximumTokenDecimals,
    );
    const quoteToken = normalizeToken(
      quoteTokenInput,
      this.options.maximumTokenDecimals,
    );

    assertTokenPair(
      baseToken,
      quoteToken,
      this.options.requireSameChain,
    );

    const baseAmount = validateUnsigned(
      baseAmountInput,
      "baseAmount",
    );
    const quoteAmount = validateUnsigned(
      quoteAmountInput,
      "quoteAmount",
    );

    if (baseAmount === 0n) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.DIVISION_BY_ZERO,
        "Base amount cannot be zero when calculating a price.",
        {
          chainId: baseToken.chainId,
          tokenId: baseToken.id,
        },
      );
    }

    const decimalNumerator =
      pow10(
        baseToken.decimals,
        this.options.maximumExponent,
      ) * this.scale;
    const decimalDenominator = pow10(
      quoteToken.decimals,
      this.options.maximumExponent,
    );

    const numerator =
      quoteAmount * decimalNumerator;
    const denominator =
      baseAmount * decimalDenominator;

    const value = divideRounded(
      numerator,
      denominator,
      this.options.roundingMode,
    );

    return this.createPrice(
      baseToken,
      quoteToken,
      value,
      {
        source:
          context.source ??
          NormalizedPriceSource.DERIVED,
        ...context,
      },
    );
  }

  public normalizeRawPrice(
    baseTokenInput: TokenDescriptor,
    quoteTokenInput: TokenDescriptor,
    rawValue: bigint,
    rawScaleDecimals: number,
    context: Readonly<{
      source?: NormalizedPriceSource;
      blockNumber?: BlockNumber;
      observedAtMilliseconds?: UnixTimestampMilliseconds;
      dexId?: DexId;
      poolId?: PoolId;
      confidenceBasisPoints?: BasisPoints;
      metadata?: CrossDexArbitrageMetadata;
    }> = {},
  ): NormalizedPrice {
    const baseToken = normalizeToken(
      baseTokenInput,
      this.options.maximumTokenDecimals,
    );
    const quoteToken = normalizeToken(
      quoteTokenInput,
      this.options.maximumTokenDecimals,
    );

    assertTokenPair(
      baseToken,
      quoteToken,
      this.options.requireSameChain,
    );

    validateUnsigned(rawValue, "rawValue");

    const rawScale = pow10(
      rawScaleDecimals,
      this.options.maximumExponent,
    );
    const value = divideRounded(
      rawValue * this.scale,
      rawScale,
      this.options.roundingMode,
    );

    return this.createPrice(
      baseToken,
      quoteToken,
      value,
      {
        source:
          context.source ??
          NormalizedPriceSource.EXTERNAL,
        ...context,
      },
    );
  }

  public normalizeQuote(
    quote: DexQuote,
    options: QuotePriceNormalizationOptions = {},
  ): NormalizedPrice {
    if (quote === null || typeof quote !== "object") {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        "DEX quote must be an object.",
        { details: quote },
      );
    }

    const source =
      options.source ??
      (options.useReferencePrice
        ? NormalizedPriceSource.QUOTE_REFERENCE
        : NormalizedPriceSource.QUOTE_EXECUTION);

    if (
      options.useReferencePrice &&
      quote.referencePrice !== undefined
    ) {
      return this.normalizeRawPrice(
        quote.tokenIn,
        quote.tokenOut,
        quote.referencePrice,
        this.options.priceScaleDecimals,
        {
          source,
          blockNumber:
            quote.blockReference.blockNumber,
          observedAtMilliseconds:
            quote.quotedAtMilliseconds,
          dexId: quote.dexId,
          poolId: quote.poolId,
          confidenceBasisPoints:
            options.confidenceBasisPoints,
          metadata: mergeMetadata(
            quote.metadata,
            options.metadata,
          ),
        },
      );
    }

    if (
      quote.amountIn > 0n &&
      quote.amountOut >= 0n
    ) {
      return this.normalizeRatio(
        quote.tokenIn,
        quote.tokenOut,
        quote.amountIn,
        quote.amountOut,
        {
          source,
          blockNumber:
            quote.blockReference.blockNumber,
          observedAtMilliseconds:
            quote.quotedAtMilliseconds,
          dexId: quote.dexId,
          poolId: quote.poolId,
          confidenceBasisPoints:
            options.confidenceBasisPoints,
          metadata: mergeMetadata(
            quote.metadata,
            options.metadata,
          ),
        },
      );
    }

    return this.normalizeRawPrice(
      quote.tokenIn,
      quote.tokenOut,
      quote.executionPrice,
      this.options.priceScaleDecimals,
      {
        source,
        blockNumber:
          quote.blockReference.blockNumber,
        observedAtMilliseconds:
          quote.quotedAtMilliseconds,
        dexId: quote.dexId,
        poolId: quote.poolId,
        confidenceBasisPoints:
          options.confidenceBasisPoints,
        metadata: mergeMetadata(
          quote.metadata,
          options.metadata,
        ),
      },
    );
  }

  public normalizePoolState(
    state: DexPoolState,
    options: PoolStatePriceNormalizationOptions = {},
  ): NormalizedPrice {
    if (state === null || typeof state !== "object") {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        "Pool state must be an object.",
        { details: state },
      );
    }

    const direction =
      options.direction ?? "TOKEN0_TO_TOKEN1";
    const token0ToToken1 =
      direction === "TOKEN0_TO_TOKEN1";
    const pool = state.pool;
    const context = {
      blockNumber:
        state.blockReference.blockNumber,
      observedAtMilliseconds:
        state.observedAtMilliseconds,
      dexId: pool.dexId,
      poolId: pool.id,
      confidenceBasisPoints:
        options.confidenceBasisPoints,
      metadata: mergeMetadata(
        state.metadata,
        options.metadata,
      ),
    } as const;

    let price: NormalizedPrice;

    switch (state.modelState.model) {
      case DexLiquidityModel.CONSTANT_PRODUCT: {
        const model = state.modelState;

        price = this.normalizeRatio(
          pool.token0,
          pool.token1,
          model.reserve0,
          model.reserve1,
          {
            source:
              NormalizedPriceSource.CONSTANT_PRODUCT_POOL,
            ...context,
          },
        );
        break;
      }

      case DexLiquidityModel.CONCENTRATED_LIQUIDITY: {
        const model = state.modelState;

        if (model.sqrtPriceX96 <= 0n) {
          throw new PriceNormalizerError(
            PriceNormalizerErrorCode.PRICE_UNAVAILABLE,
            `Pool "${pool.id}" has a non-positive sqrtPriceX96.`,
            {
              chainId: pool.chainId,
              dexId: pool.dexId,
              poolId: pool.id,
            },
          );
        }

        const numerator =
          model.sqrtPriceX96 *
          model.sqrtPriceX96 *
          pow10(
            pool.token0.decimals,
            this.options.maximumExponent,
          ) *
          this.scale;

        const denominator =
          Q192 *
          pow10(
            pool.token1.decimals,
            this.options.maximumExponent,
          );

        const value = divideRounded(
          numerator,
          denominator,
          this.options.roundingMode,
        );

        price = this.createPrice(
          normalizeToken(
            pool.token0,
            this.options.maximumTokenDecimals,
          ),
          normalizeToken(
            pool.token1,
            this.options.maximumTokenDecimals,
          ),
          value,
          {
            source:
              NormalizedPriceSource.CONCENTRATED_LIQUIDITY_POOL,
            ...context,
          },
        );
        break;
      }

      case DexLiquidityModel.ORDER_BOOK: {
        const model = state.modelState;
        const side = options.orderBookSide ?? "MID";
        let rawPrice: bigint;
        let source: NormalizedPriceSource;

        if (side === "BID") {
          rawPrice = model.bestBidPrice;
          source =
            NormalizedPriceSource.ORDER_BOOK_BID;
        } else if (side === "ASK") {
          rawPrice = model.bestAskPrice;
          source =
            NormalizedPriceSource.ORDER_BOOK_ASK;
        } else {
          rawPrice = divideRounded(
            model.bestBidPrice +
              model.bestAskPrice,
            2n,
            this.options.roundingMode,
          );
          source =
            NormalizedPriceSource.ORDER_BOOK_MID;
        }

        price = this.normalizeRawPrice(
          pool.token0,
          pool.token1,
          rawPrice,
          this.options.priceScaleDecimals,
          {
            source,
            ...context,
          },
        );
        break;
      }

      default:
        throw new PriceNormalizerError(
          PriceNormalizerErrorCode.UNSUPPORTED_POOL_MODEL,
          `Pool model "${state.modelState.model}" does not expose a deterministic spot-price formula in this normalizer.`,
          {
            chainId: pool.chainId,
            dexId: pool.dexId,
            poolId: pool.id,
            details: state.modelState.model,
          },
        );
    }

    return token0ToToken1
      ? price
      : this.invert(price);
  }

  public invert(
    price: NormalizedPrice,
  ): NormalizedPrice {
    this.validatePrice(price);

    if (price.value === 0n) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.DIVISION_BY_ZERO,
        "Cannot invert a zero price.",
        {
          chainId: price.chainId,
          dexId: price.dexId,
          poolId: price.poolId,
        },
      );
    }

    const value = divideRounded(
      this.scale * this.scale,
      price.value,
      this.options.roundingMode,
    );

    return this.createPrice(
      price.quoteToken,
      price.baseToken,
      value,
      {
        source: NormalizedPriceSource.DERIVED,
        blockNumber: price.blockNumber,
        observedAtMilliseconds:
          price.observedAtMilliseconds,
        dexId: price.dexId,
        poolId: price.poolId,
        confidenceBasisPoints:
          price.confidenceBasisPoints,
        metadata: mergeMetadata(
          price.metadata,
          Object.freeze({
            derivedOperation: "INVERT",
          }),
        ),
      },
    );
  }

  public compose(
    first: NormalizedPrice,
    second: NormalizedPrice,
  ): NormalizedPrice {
    this.validatePrice(first);
    this.validatePrice(second);

    if (
      !compareTokenIdentity(
        first.quoteToken,
        second.baseToken,
      )
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.TOKEN_MISMATCH,
        "The first quote token must equal the second base token.",
        {
          chainId: first.chainId,
          details: {
            firstQuoteToken:
              first.quoteToken.address,
            secondBaseToken:
              second.baseToken.address,
          },
        },
      );
    }

    const value = divideRounded(
      first.value * second.value,
      this.scale,
      this.options.roundingMode,
    );

    const blockNumber =
      first.blockNumber === undefined
        ? second.blockNumber
        : second.blockNumber === undefined
          ? first.blockNumber
          : first.blockNumber < second.blockNumber
            ? first.blockNumber
            : second.blockNumber;

    const observedAtMilliseconds =
      first.observedAtMilliseconds === undefined
        ? second.observedAtMilliseconds
        : second.observedAtMilliseconds === undefined
          ? first.observedAtMilliseconds
          : Math.min(
              first.observedAtMilliseconds,
              second.observedAtMilliseconds,
            ) as UnixTimestampMilliseconds;

    return this.createPrice(
      first.baseToken,
      second.quoteToken,
      value,
      {
        source: NormalizedPriceSource.DERIVED,
        blockNumber,
        observedAtMilliseconds,
        confidenceBasisPoints:
          this.minimumOptionalBasisPoints(
            first.confidenceBasisPoints,
            second.confidenceBasisPoints,
          ),
        metadata: Object.freeze({
          derivedOperation: "COMPOSE",
          firstSource: first.source,
          secondSource: second.source,
        }),
      },
    );
  }

  public convertBaseToQuote(
    amount: TokenAmount | bigint,
    price: NormalizedPrice,
    roundingMode: PriceRoundingMode =
      this.options.roundingMode,
  ): NormalizedAmountConversion {
    this.validatePrice(price);
    const input = validateUnsigned(
      amount,
      "amount",
    );

    const numerator =
      input *
      price.value *
      pow10(
        price.quoteToken.decimals,
        this.options.maximumExponent,
      );

    const denominator =
      this.scale *
      pow10(
        price.baseToken.decimals,
        this.options.maximumExponent,
      );

    const output = divideRounded(
      numerator,
      denominator,
      roundingMode,
    ) as TokenAmount;

    return Object.freeze({
      inputAmount: input as TokenAmount,
      outputAmount: output,
      price,
      roundingMode,
    });
  }

  public convertQuoteToBase(
    amount: TokenAmount | bigint,
    price: NormalizedPrice,
    roundingMode: PriceRoundingMode =
      this.options.roundingMode,
  ): NormalizedAmountConversion {
    return this.convertBaseToQuote(
      amount,
      this.invert(price),
      roundingMode,
    );
  }

  public compare(
    left: NormalizedPrice,
    right: NormalizedPrice,
  ): PriceComparison {
    this.assertComparable(left, right);

    const signedDifference =
      left.value - right.value;
    const absoluteDifference =
      (signedDifference < 0n
        ? -signedDifference
        : signedDifference) as NormalizedPriceValue;

    const deviationBasisPoints =
      right.value === 0n
        ? (left.value === 0n
            ? 0
            : Number.MAX_SAFE_INTEGER)
        : Number(
            divideRounded(
              absoluteDifference *
                BASIS_POINTS_DENOMINATOR,
              right.value,
              PriceRoundingMode.HALF_UP,
            ),
          );

    if (!Number.isSafeInteger(deviationBasisPoints)) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.PRICE_OVERFLOW,
        "Price deviation exceeds safe basis-point representation.",
        { details: deviationBasisPoints },
      );
    }

    return Object.freeze({
      left,
      right,
      absoluteDifference,
      signedDifference,
      deviationBasisPoints:
        deviationBasisPoints as BasisPoints,
      leftGreaterThanRight:
        signedDifference > 0n,
      equal: signedDifference === 0n,
    });
  }

  public calculateSignedChangeBasisPoints(
    previous: NormalizedPrice,
    current: NormalizedPrice,
  ): number {
    this.assertComparable(previous, current);

    if (previous.value === 0n) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.DIVISION_BY_ZERO,
        "Cannot calculate a change from a zero previous price.",
      );
    }

    const value = divideRounded(
      (current.value - previous.value) *
        BASIS_POINTS_DENOMINATOR,
      previous.value,
      PriceRoundingMode.HALF_UP,
    );

    const numeric = Number(value);

    if (!Number.isSafeInteger(numeric)) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.PRICE_OVERFLOW,
        "Signed price change exceeds safe numeric range.",
        { details: value },
      );
    }

    return numeric;
  }

  public applyBasisPoints(
    price: NormalizedPrice,
    basisPoints: BasisPoints | number,
    direction: "INCREASE" | "DECREASE",
  ): NormalizedPrice {
    this.validatePrice(price);

    if (
      !Number.isSafeInteger(basisPoints) ||
      basisPoints < 0
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_BASIS_POINTS,
        "basisPoints must be a non-negative safe integer.",
        { details: basisPoints },
      );
    }

    if (
      direction === "DECREASE" &&
      BigInt(basisPoints) >
        BASIS_POINTS_DENOMINATOR
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_BASIS_POINTS,
        "A price decrease cannot exceed 10,000 basis points.",
        { details: basisPoints },
      );
    }

    const multiplier =
      direction === "INCREASE"
        ? BASIS_POINTS_DENOMINATOR +
          BigInt(basisPoints)
        : BASIS_POINTS_DENOMINATOR -
          BigInt(basisPoints);

    const value = divideRounded(
      price.value * multiplier,
      BASIS_POINTS_DENOMINATOR,
      this.options.roundingMode,
    );

    return this.createPrice(
      price.baseToken,
      price.quoteToken,
      value,
      {
        source: NormalizedPriceSource.DERIVED,
        blockNumber: price.blockNumber,
        observedAtMilliseconds:
          price.observedAtMilliseconds,
        dexId: price.dexId,
        poolId: price.poolId,
        confidenceBasisPoints:
          price.confidenceBasisPoints,
        metadata: mergeMetadata(
          price.metadata,
          Object.freeze({
            derivedOperation:
              "APPLY_BASIS_POINTS",
            basisPoints,
            direction,
          }),
        ),
      },
    );
  }

  public weightedAverage(
    samples: readonly WeightedPriceSample[],
    metadata?: CrossDexArbitrageMetadata,
  ): PriceAggregate {
    if (!Array.isArray(samples) || samples.length === 0) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_SAMPLE_SET,
        "At least one weighted price sample is required.",
      );
    }

    const first = samples[0].price;
    this.validatePrice(first);

    let weightedValue = 0n;
    let totalWeight = 0n;

    for (const sample of samples) {
      this.assertComparable(first, sample.price);

      if (
        typeof sample.weight !== "bigint" ||
        sample.weight <= 0n
      ) {
        throw new PriceNormalizerError(
          PriceNormalizerErrorCode.INVALID_SAMPLE_SET,
          "Every sample weight must be a positive bigint.",
          { details: sample.weight },
        );
      }

      weightedValue +=
        BigInt(sample.price.value) * sample.weight;
      totalWeight += sample.weight;
    }

    const value = divideRounded(
      weightedValue,
      totalWeight,
      this.options.roundingMode,
    );

    const sorted = [...samples].sort(
      (left, right) =>
        left.price.value < right.price.value
          ? -1
          : left.price.value > right.price.value
            ? 1
            : 0,
    );

    const median =
      this.weightedMedian(sorted, totalWeight);
    const minimum = sorted[0].price;
    const maximum =
      sorted[sorted.length - 1].price;
    const average = this.createPrice(
      first.baseToken,
      first.quoteToken,
      value,
      {
        source: NormalizedPriceSource.DERIVED,
        observedAtMilliseconds:
          this.oldestObservation(
            samples.map(
              (sample) =>
                sample.price
                  .observedAtMilliseconds,
            ),
          ),
        blockNumber: this.minimumBlock(
          samples.map(
            (sample) =>
              sample.price.blockNumber,
          ),
        ),
        confidenceBasisPoints:
          this.minimumConfidence(
            samples.map(
              (sample) =>
                sample.price
                  .confidenceBasisPoints,
            ),
          ),
        metadata: mergeMetadata(
          Object.freeze({
            derivedOperation:
              "WEIGHTED_AVERAGE",
            sampleCount: samples.length,
          }),
          metadata,
        ),
      },
    );

    const spreadBasisPoints =
      minimum.value === 0n
        ? (maximum.value === 0n
            ? 0
            : Number.MAX_SAFE_INTEGER)
        : Number(
            divideRounded(
              (BigInt(maximum.value) -
                BigInt(minimum.value)) *
                BASIS_POINTS_DENOMINATOR,
              minimum.value,
              PriceRoundingMode.HALF_UP,
            ),
          );

    if (!Number.isSafeInteger(spreadBasisPoints)) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.PRICE_OVERFLOW,
        "Aggregate spread exceeds safe basis-point representation.",
      );
    }

    return Object.freeze({
      price: average,
      sampleCount: samples.length,
      totalWeight,
      minimum,
      maximum,
      median,
      spreadBasisPoints:
        spreadBasisPoints as BasisPoints,
    });
  }

  public median(
    prices: readonly NormalizedPrice[],
    metadata?: CrossDexArbitrageMetadata,
  ): NormalizedPrice {
    return this.weightedAverage(
      prices.map((price) =>
        Object.freeze({
          price,
          weight: 1n,
        }),
      ),
      metadata,
    ).median;
  }

  public assertFresh(
    price: NormalizedPrice,
    policy: PriceFreshnessPolicy,
  ): void {
    this.validatePrice(price);

    if (
      !Number.isFinite(policy.nowMilliseconds) ||
      policy.nowMilliseconds < 0 ||
      !Number.isFinite(policy.maximumAgeMilliseconds) ||
      policy.maximumAgeMilliseconds < 0
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_OPTIONS,
        "Price freshness policy values must be non-negative and finite.",
        { details: policy },
      );
    }

    if (price.observedAtMilliseconds === undefined) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.PRICE_UNAVAILABLE,
        "Price does not contain an observation timestamp.",
      );
    }

    const age =
      policy.nowMilliseconds -
      price.observedAtMilliseconds;

    if (
      age < 0 &&
      policy.allowFutureObservations !== true
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.FUTURE_PRICE,
        "Price observation is in the future.",
        { details: { ageMilliseconds: age } },
      );
    }

    if (age > policy.maximumAgeMilliseconds) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.STALE_PRICE,
        "Price exceeds the maximum permitted age.",
        { details: { ageMilliseconds: age } },
      );
    }
  }

  public format(
    price: NormalizedPrice,
    displayDecimals = 8,
    trimTrailingZeros = true,
  ): string {
    this.validatePrice(price);

    if (
      !Number.isSafeInteger(displayDecimals) ||
      displayDecimals < 0 ||
      displayDecimals >
        this.options.maximumExponent
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_SCALE,
        "displayDecimals is invalid.",
        { details: displayDecimals },
      );
    }

    const displayScale = pow10(
      displayDecimals,
      this.options.maximumExponent,
    );
    const displayValue = divideRounded(
      price.value * displayScale,
      this.scale,
      this.options.roundingMode,
    );

    const integerPart =
      displayValue / displayScale;

    if (displayDecimals === 0) {
      return integerPart.toString();
    }

    let fractionalPart = (
      displayValue % displayScale
    )
      .toString()
      .padStart(displayDecimals, "0");

    if (trimTrailingZeros) {
      fractionalPart = fractionalPart.replace(
        /0+$/,
        "",
      );
    }

    return fractionalPart.length === 0
      ? integerPart.toString()
      : `${integerPart}.${fractionalPart}`;
  }

  public parse(
    baseToken: TokenDescriptor,
    quoteToken: TokenDescriptor,
    decimalPrice: string,
    context: Readonly<{
      source?: NormalizedPriceSource;
      blockNumber?: BlockNumber;
      observedAtMilliseconds?: UnixTimestampMilliseconds;
      dexId?: DexId;
      poolId?: PoolId;
      confidenceBasisPoints?: BasisPoints;
      metadata?: CrossDexArbitrageMetadata;
    }> = {},
  ): NormalizedPrice {
    if (
      typeof decimalPrice !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(
        decimalPrice.trim(),
      )
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        "decimalPrice must be a non-negative base-10 decimal string.",
        { details: decimalPrice },
      );
    }

    const [integerPart, fraction = ""] =
      decimalPrice.trim().split(".");
    const inputScaleDecimals = fraction.length;

    if (
      inputScaleDecimals >
      this.options.maximumExponent
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_SCALE,
        "decimalPrice contains too many fractional digits.",
        { details: inputScaleDecimals },
      );
    }

    const rawValue = BigInt(
      `${integerPart}${fraction}`,
    );

    return this.normalizeRawPrice(
      baseToken,
      quoteToken,
      rawValue,
      inputScaleDecimals,
      context,
    );
  }

  private createPrice(
    baseToken: TokenDescriptor,
    quoteToken: TokenDescriptor,
    valueInput: bigint,
    context: Readonly<{
      source: NormalizedPriceSource;
      blockNumber?: BlockNumber;
      observedAtMilliseconds?: UnixTimestampMilliseconds;
      dexId?: DexId;
      poolId?: PoolId;
      confidenceBasisPoints?: BasisPoints;
      metadata?: CrossDexArbitrageMetadata;
    }>,
  ): NormalizedPrice {
    if (
      valueInput < 0n ||
      (!this.options.allowZeroPrice &&
        valueInput === 0n)
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        this.options.allowZeroPrice
          ? "Price cannot be negative."
          : "Price must be positive.",
        {
          chainId: baseToken.chainId,
          dexId: context.dexId,
          poolId: context.poolId,
          tokenId: baseToken.id,
          details: valueInput,
        },
      );
    }

    if (
      valueInput >
      this.options.maximumAbsoluteValue
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.PRICE_OVERFLOW,
        "Normalized price exceeds maximumAbsoluteValue.",
        {
          chainId: baseToken.chainId,
          dexId: context.dexId,
          poolId: context.poolId,
          details: valueInput,
        },
      );
    }

    if (
      context.confidenceBasisPoints !== undefined &&
      (!Number.isSafeInteger(
        context.confidenceBasisPoints,
      ) ||
        context.confidenceBasisPoints < 0 ||
        context.confidenceBasisPoints > 10_000)
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_BASIS_POINTS,
        "confidenceBasisPoints must be between 0 and 10,000.",
        { details: context.confidenceBasisPoints },
      );
    }

    return Object.freeze({
      chainId: baseToken.chainId,
      baseToken,
      quoteToken,
      value:
        valueInput as NormalizedPriceValue,
      scale: this.scale,
      scaleDecimals:
        this.options.priceScaleDecimals,
      source: context.source,
      blockNumber: context.blockNumber,
      observedAtMilliseconds:
        context.observedAtMilliseconds,
      dexId: context.dexId,
      poolId: context.poolId,
      confidenceBasisPoints:
        context.confidenceBasisPoints,
      metadata: freezeMetadata(
        context.metadata,
      ),
    });
  }

  private validatePrice(
    price: NormalizedPrice,
  ): void {
    if (price === null || typeof price !== "object") {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        "Normalized price must be an object.",
        { details: price },
      );
    }

    if (
      price.scale !== this.scale ||
      price.scaleDecimals !==
        this.options.priceScaleDecimals
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_SCALE,
        "Normalized price uses a different scale.",
        {
          details: {
            expectedScale: this.scale,
            actualScale: price.scale,
            expectedScaleDecimals:
              this.options.priceScaleDecimals,
            actualScaleDecimals:
              price.scaleDecimals,
          },
        },
      );
    }

    if (
      typeof price.value !== "bigint" ||
      price.value < 0n ||
      (!this.options.allowZeroPrice &&
        price.value === 0n)
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.INVALID_PRICE,
        "Normalized price value is invalid.",
        { details: price.value },
      );
    }
  }

  private assertComparable(
    left: NormalizedPrice,
    right: NormalizedPrice,
  ): void {
    this.validatePrice(left);
    this.validatePrice(right);

    if (
      !compareTokenIdentity(
        left.baseToken,
        right.baseToken,
      ) ||
      !compareTokenIdentity(
        left.quoteToken,
        right.quoteToken,
      )
    ) {
      throw new PriceNormalizerError(
        PriceNormalizerErrorCode.TOKEN_MISMATCH,
        "Prices must use the same base and quote tokens.",
        {
          chainId: left.chainId,
          details: {
            leftBase: left.baseToken.address,
            rightBase: right.baseToken.address,
            leftQuote: left.quoteToken.address,
            rightQuote: right.quoteToken.address,
          },
        },
      );
    }
  }

  private weightedMedian(
    sortedSamples: readonly WeightedPriceSample[],
    totalWeight: bigint,
  ): NormalizedPrice {
    const threshold =
      divideRounded(
        totalWeight,
        2n,
        PriceRoundingMode.UP,
      );
    let cumulative = 0n;

    for (const sample of sortedSamples) {
      cumulative += sample.weight;

      if (cumulative >= threshold) {
        return sample.price;
      }
    }

    return sortedSamples[
      sortedSamples.length - 1
    ].price;
  }

  private oldestObservation(
    values: readonly (
      | UnixTimestampMilliseconds
      | undefined
    )[],
  ): UnixTimestampMilliseconds | undefined {
    const defined = values.filter(
      (
        value,
      ): value is UnixTimestampMilliseconds =>
        value !== undefined,
    );

    return defined.length === 0
      ? undefined
      : (Math.min(...defined) as UnixTimestampMilliseconds);
  }

  private minimumBlock(
    values: readonly (
      | BlockNumber
      | undefined
    )[],
  ): BlockNumber | undefined {
    const defined = values.filter(
      (
        value,
      ): value is BlockNumber =>
        value !== undefined,
    );

    return defined.length === 0
      ? undefined
      : defined.reduce((minimum, current) =>
          current < minimum
            ? current
            : minimum,
        );
  }

  private minimumConfidence(
    values: readonly (
      | BasisPoints
      | undefined
    )[],
  ): BasisPoints | undefined {
    const defined = values.filter(
      (
        value,
      ): value is BasisPoints =>
        value !== undefined,
    );

    return defined.length === 0
      ? undefined
      : (Math.min(...defined) as BasisPoints);
  }

  private minimumOptionalBasisPoints(
    left: BasisPoints | undefined,
    right: BasisPoints | undefined,
  ): BasisPoints | undefined {
    if (left === undefined) {
      return right;
    }

    if (right === undefined) {
      return left;
    }

    return Math.min(left, right) as BasisPoints;
  }
}

export function createPriceNormalizer(
  options: PriceNormalizerOptions = {},
): CrossDexArbitragePriceNormalizer {
  return new CrossDexArbitragePriceNormalizer(
    options,
  );
}

export function normalizedPricePairKey(
  price: NormalizedPrice,
): string {
  return [
    price.chainId,
    price.baseToken.address.toLowerCase(),
    price.quoteToken.address.toLowerCase(),
  ].join(":");
}

export function compareNormalizedPriceOrder(
  left: NormalizedPrice,
  right: NormalizedPrice,
): number {
  const leftKey = normalizedPricePairKey(left);
  const rightKey = normalizedPricePairKey(right);
  const pairComparison =
    leftKey.localeCompare(rightKey);

  if (pairComparison !== 0) {
    return pairComparison;
  }

  if (left.value !== right.value) {
    return left.value < right.value ? -1 : 1;
  }

  const leftObserved =
    left.observedAtMilliseconds ?? 0;
  const rightObserved =
    right.observedAtMilliseconds ?? 0;

  if (leftObserved !== rightObserved) {
    return leftObserved - rightObserved;
  }

  return String(left.poolId ?? "").localeCompare(
    String(right.poolId ?? ""),
  );
}