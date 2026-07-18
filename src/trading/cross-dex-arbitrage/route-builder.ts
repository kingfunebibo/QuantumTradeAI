/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic arbitrage route builder.
 *
 * Responsibilities:
 * - Convert validated DEX quotes into immutable arbitrage legs.
 * - Enforce token, chain, amount, block, expiry, and route continuity.
 * - Infer and validate two-leg, triangular, and multi-hop route types.
 * - Resolve wallet, flash-loan, flash-swap, paper, and automatic funding.
 * - Clamp execution deadlines to quote and funding-liquidity validity.
 * - Produce execution-ready routes with deterministic identifiers.
 *
 * This module performs no RPC, wallet, filesystem, timer, or background access.
 */

import {
  type ArbitrageFundingMode,
  ArbitrageFundingMode as FundingMode,
  type ArbitrageLeg,
  type ArbitrageRoute,
  type ArbitrageRouteId,
  ArbitrageRouteType,
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexQuote,
  type EvmAddress,
  type EvmBlockReference,
  type FlashLiquidityQuote,
  type HexData,
  type PoolId,
  SwapDirection,
  type TokenAmount,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
  type WalletBalanceSnapshot,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as EvmAddress;
const EMPTY_CALLDATA = "0x" as HexData;
const ZERO_WEI = 0n as WeiAmount;

export enum RouteBuilderErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_QUOTE = "INVALID_QUOTE",
  EMPTY_QUOTE_SET = "EMPTY_QUOTE_SET",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  TOKEN_MISMATCH = "TOKEN_MISMATCH",
  AMOUNT_MISMATCH = "AMOUNT_MISMATCH",
  BLOCK_MISMATCH = "BLOCK_MISMATCH",
  QUOTE_EXPIRED = "QUOTE_EXPIRED",
  ROUTE_TYPE_MISMATCH = "ROUTE_TYPE_MISMATCH",
  ROUTE_NOT_CYCLIC = "ROUTE_NOT_CYCLIC",
  TOO_MANY_LEGS = "TOO_MANY_LEGS",
  TARGET_UNAVAILABLE = "TARGET_UNAVAILABLE",
  CALLDATA_UNAVAILABLE = "CALLDATA_UNAVAILABLE",
  FUNDING_UNAVAILABLE = "FUNDING_UNAVAILABLE",
  FLASH_LIQUIDITY_INVALID = "FLASH_LIQUIDITY_INVALID",
  WALLET_BALANCE_INSUFFICIENT = "WALLET_BALANCE_INSUFFICIENT",
  DEADLINE_INVALID = "DEADLINE_INVALID",
  IDENTIFIER_INVALID = "IDENTIFIER_INVALID",
}

export class RouteBuilderError extends Error {
  public readonly code: RouteBuilderErrorCode;
  public readonly chainId?: ChainId;
  public readonly legIndex?: number;
  public readonly poolId?: PoolId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: RouteBuilderErrorCode,
    message: string,
    options: Readonly<{
      chainId?: ChainId;
      legIndex?: number;
      poolId?: PoolId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "RouteBuilderError";
    this.code = code;
    this.chainId = options.chainId;
    this.legIndex = options.legIndex;
    this.poolId = options.poolId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface RouteBuilderClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface RouteBuilderLegEncoder {
  encode(
    quote: DexQuote,
    context: Readonly<{
      legIndex: number;
      recipient: EvmAddress;
      deadlineMilliseconds: UnixTimestampMilliseconds;
    }>,
  ): Promise<
    Readonly<{
      target: EvmAddress;
      calldata: HexData;
      value?: WeiAmount;
      metadata?: CrossDexArbitrageMetadata;
    }>
  >;
}

export interface RouteBuilderIdFactory {
  createRouteId(
    context: Readonly<{
      chainId: ChainId;
      routeType: ArbitrageRouteType;
      fundingMode: ArbitrageFundingMode;
      quotes: readonly DexQuote[];
      inputAmount: TokenAmount;
      sequence: number;
    }>,
  ): ArbitrageRouteId;
}

export interface RouteBuilderDependencies {
  readonly clock: RouteBuilderClock;
  readonly legEncoder?: RouteBuilderLegEncoder;
  readonly idFactory?: RouteBuilderIdFactory;
}

export interface RouteBuilderOptions {
  readonly maximumRouteLegs?: number;
  readonly defaultLifetimeMilliseconds?: number;
  readonly requireAtomicExecution?: boolean;
  readonly requireEncodedLegs?: boolean;
  readonly requireExactInputQuotes?: boolean;
  readonly requireSameBlockNumber?: boolean;
  readonly allowAmountPropagationTolerance?: boolean;
  readonly amountPropagationTolerance?: TokenAmount;
  readonly recipient?: EvmAddress;
  readonly clampDeadlineToQuoteExpiry?: boolean;
  readonly clampDeadlineToFundingExpiry?: boolean;
  readonly rejectFutureQuotes?: boolean;
  readonly allowOpenRoutes?: boolean;
}

export interface RouteBuilderRequest {
  readonly chainId: ChainId;
  readonly quotes: readonly DexQuote[];
  readonly fundingMode: ArbitrageFundingMode;
  readonly routeType?: ArbitrageRouteType;
  readonly routeId?: ArbitrageRouteId;
  readonly sequence?: number;
  readonly recipient?: EvmAddress;
  readonly deadlineMilliseconds?: UnixTimestampMilliseconds;
  readonly sourceBlockReference?: EvmBlockReference;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly walletBalance?: WalletBalanceSnapshot;
  readonly requireAtomicExecution?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface RouteFundingResolution {
  readonly requestedMode: ArbitrageFundingMode;
  readonly resolvedMode: ArbitrageFundingMode;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly walletBalance?: WalletBalanceSnapshot;
  readonly fundedAmount: TokenAmount;
  readonly repaymentAmount?: TokenAmount;
  readonly fundingExpiresAtMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface RouteBuilderResult {
  readonly route: ArbitrageRoute;
  readonly funding: RouteFundingResolution;
  readonly quoteCount: number;
  readonly encodedLegCount: number;
  readonly routeTypeInferred: boolean;
  readonly builtAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

interface NormalizedRouteBuilderOptions {
  readonly maximumRouteLegs: number;
  readonly defaultLifetimeMilliseconds: number;
  readonly requireAtomicExecution: boolean;
  readonly requireEncodedLegs: boolean;
  readonly requireExactInputQuotes: boolean;
  readonly requireSameBlockNumber: boolean;
  readonly allowAmountPropagationTolerance: boolean;
  readonly amountPropagationTolerance: TokenAmount;
  readonly recipient: EvmAddress;
  readonly clampDeadlineToQuoteExpiry: boolean;
  readonly clampDeadlineToFundingExpiry: boolean;
  readonly rejectFutureQuotes: boolean;
  readonly allowOpenRoutes: boolean;
}

const DEFAULT_OPTIONS: NormalizedRouteBuilderOptions =
  Object.freeze({
    maximumRouteLegs: 4,
    defaultLifetimeMilliseconds: 10_000,
    requireAtomicExecution: true,
    requireEncodedLegs: true,
    requireExactInputQuotes: true,
    requireSameBlockNumber: true,
    allowAmountPropagationTolerance: false,
    amountPropagationTolerance: 0n as TokenAmount,
    recipient: ZERO_ADDRESS,
    clampDeadlineToQuoteExpiry: true,
    clampDeadlineToFundingExpiry: true,
    rejectFutureQuotes: true,
    allowOpenRoutes: false,
  });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
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

function normalizeOptions(
  options: RouteBuilderOptions,
): NormalizedRouteBuilderOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(merged.maximumRouteLegs) ||
    merged.maximumRouteLegs < 2
  ) {
    throw new RouteBuilderError(
      RouteBuilderErrorCode.INVALID_OPTIONS,
      "maximumRouteLegs must be a safe integer of at least 2.",
      { details: merged.maximumRouteLegs },
    );
  }

  if (
    !Number.isSafeInteger(
      merged.defaultLifetimeMilliseconds,
    ) ||
    merged.defaultLifetimeMilliseconds <= 0
  ) {
    throw new RouteBuilderError(
      RouteBuilderErrorCode.INVALID_OPTIONS,
      "defaultLifetimeMilliseconds must be positive.",
      {
        details:
          merged.defaultLifetimeMilliseconds,
      },
    );
  }

  if (
    typeof merged.amountPropagationTolerance !==
      "bigint" ||
    merged.amountPropagationTolerance < 0n
  ) {
    throw new RouteBuilderError(
      RouteBuilderErrorCode.INVALID_OPTIONS,
      "amountPropagationTolerance must be a non-negative bigint.",
      {
        details:
          merged.amountPropagationTolerance,
      },
    );
  }

  if (
    typeof merged.recipient !== "string" ||
    merged.recipient.trim().length === 0
  ) {
    throw new RouteBuilderError(
      RouteBuilderErrorCode.INVALID_OPTIONS,
      "recipient must be a non-empty address string.",
      { details: merged.recipient },
    );
  }

  return Object.freeze({
    ...merged,
    recipient:
      merged.recipient.trim().toLowerCase() as EvmAddress,
  });
}

function tokenKey(token: TokenDescriptor): string {
  return `${Number(token.chainId)}:${String(
    token.address,
  ).toLowerCase()}`;
}

function sameToken(
  left: TokenDescriptor,
  right: TokenDescriptor,
): boolean {
  return tokenKey(left) === tokenKey(right);
}

function absoluteDifference(
  left: bigint,
  right: bigint,
): bigint {
  return left >= right
    ? left - right
    : right - left;
}

function compareQuotes(
  left: DexQuote,
  right: DexQuote,
): number {
  const blockComparison =
    left.blockReference.blockNumber <
    right.blockReference.blockNumber
      ? -1
      : left.blockReference.blockNumber >
          right.blockReference.blockNumber
        ? 1
        : 0;

  if (blockComparison !== 0) {
    return blockComparison;
  }

  if (
    left.quotedAtMilliseconds !==
    right.quotedAtMilliseconds
  ) {
    return (
      left.quotedAtMilliseconds -
      right.quotedAtMilliseconds
    );
  }

  return left.quoteId.localeCompare(
    right.quoteId,
  );
}

function createDefaultIdFactory(): RouteBuilderIdFactory {
  return Object.freeze({
    createRouteId(
      context: Readonly<{
        chainId: ChainId;
        routeType: ArbitrageRouteType;
        fundingMode: ArbitrageFundingMode;
        quotes: readonly DexQuote[];
        inputAmount: TokenAmount;
        sequence: number;
      }>,
    ): ArbitrageRouteId {
      const quoteKey = context.quotes
        .map((quote: DexQuote) => quote.quoteId)
        .join(":");

      return [
        "route",
        Number(context.chainId),
        context.routeType,
        context.fundingMode,
        context.inputAmount.toString(),
        context.sequence,
        quoteKey,
      ].join(":") as ArbitrageRouteId;
    },
  });
}

function assertNonNegativeTimestamp(
  value: number,
  field: string,
): UnixTimestampMilliseconds {
  if (!Number.isFinite(value) || value < 0) {
    throw new RouteBuilderError(
      RouteBuilderErrorCode.INVALID_REQUEST,
      `${field} must be a non-negative finite timestamp.`,
      { details: value },
    );
  }

  return value as UnixTimestampMilliseconds;
}

export class CrossDexArbitrageRouteBuilder {
  private readonly dependencies: RouteBuilderDependencies;
  private readonly options: NormalizedRouteBuilderOptions;
  private readonly idFactory: RouteBuilderIdFactory;

  public constructor(
    dependencies: RouteBuilderDependencies,
    options: RouteBuilderOptions = {},
  ) {
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      dependencies.clock === undefined ||
      typeof dependencies.clock.nowMilliseconds !==
        "function"
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.INVALID_OPTIONS,
        "A route-builder clock is required.",
      );
    }

    this.dependencies = dependencies;
    this.options = normalizeOptions(options);
    this.idFactory =
      dependencies.idFactory ??
      createDefaultIdFactory();
  }

  public async build(
    request: RouteBuilderRequest,
  ): Promise<RouteBuilderResult> {
    const builtAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    this.validateRequest(
      request,
      builtAtMilliseconds,
    );

    const quotes = Object.freeze([
      ...request.quotes,
    ]);

    this.validateQuoteSequence(
      request.chainId,
      quotes,
      builtAtMilliseconds,
    );

    const routeType =
      request.routeType ??
      this.inferRouteType(quotes);
    const routeTypeInferred =
      request.routeType === undefined;

    this.validateRouteType(
      routeType,
      quotes,
    );

    const funding = this.resolveFunding(
      request,
      quotes[0].amountIn,
      builtAtMilliseconds,
    );

    const deadlineMilliseconds =
      this.resolveDeadline(
        request,
        quotes,
        funding,
        builtAtMilliseconds,
      );

    const sourceBlockReference =
      this.resolveBlockReference(
        request,
        quotes,
        builtAtMilliseconds,
      );

    const recipient =
      (request.recipient ??
        this.options.recipient)
        .trim()
        .toLowerCase() as EvmAddress;

    const legs: ArbitrageLeg[] = [];
    let encodedLegCount = 0;

    for (
      let legIndex = 0;
      legIndex < quotes.length;
      legIndex += 1
    ) {
      const leg = await this.buildLeg(
        quotes[legIndex],
        legIndex,
        recipient,
        deadlineMilliseconds,
      );

      if (
        leg.target !== ZERO_ADDRESS &&
        leg.calldata !== EMPTY_CALLDATA
      ) {
        encodedLegCount += 1;
      }

      legs.push(leg);
    }

    const requireAtomicExecution =
      request.requireAtomicExecution ??
      this.options.requireAtomicExecution;

    if (
      requireAtomicExecution &&
      !this.areLegsExecutionReady(legs)
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.CALLDATA_UNAVAILABLE,
        "Atomic execution requires every leg to have a target and calldata.",
        { chainId: request.chainId },
      );
    }

    const routeId =
      request.routeId ??
      this.idFactory.createRouteId({
        chainId: request.chainId,
        routeType,
        fundingMode:
          funding.resolvedMode,
        quotes,
        inputAmount: quotes[0].amountIn,
        sequence: request.sequence ?? 0,
      });

    if (
      typeof routeId !== "string" ||
      routeId.trim().length === 0
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.IDENTIFIER_INVALID,
        "Route identifier must be a non-empty string.",
        { chainId: request.chainId },
      );
    }

    const lastQuote =
      quotes[quotes.length - 1];

    const route: ArbitrageRoute =
      Object.freeze({
        id: routeId,
        chainId: request.chainId,
        type: routeType,
        startToken: quotes[0].tokenIn,
        endToken: lastQuote.tokenOut,
        inputAmount: quotes[0].amountIn,
        expectedFinalAmount:
          lastQuote.amountOut,
        minimumFinalAmount:
          lastQuote.minimumAmountOut,
        legs: Object.freeze(legs),
        isAtomic:
          requireAtomicExecution &&
          this.areLegsExecutionReady(legs),
        blockReference:
          sourceBlockReference,
        createdAtMilliseconds:
          builtAtMilliseconds,
        expiresAtMilliseconds:
          deadlineMilliseconds,
        metadata: mergeMetadata(
          request.metadata,
          Object.freeze({
            routeBuilder:
              "cross-dex-arbitrage",
            fundingMode:
              funding.resolvedMode,
            quoteCount: quotes.length,
            routeTypeInferred,
          }),
        ),
      });

    return Object.freeze({
      route,
      funding,
      quoteCount: quotes.length,
      encodedLegCount,
      routeTypeInferred,
      builtAtMilliseconds,
      metadata: freezeMetadata(
        request.metadata,
      ),
    });
  }

  public inferRouteType(
    quotes: readonly DexQuote[],
  ): ArbitrageRouteType {
    if (!Array.isArray(quotes) || quotes.length < 2) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.EMPTY_QUOTE_SET,
        "At least two quotes are required to infer a route type.",
      );
    }

    if (quotes.length === 2) {
      return ArbitrageRouteType.TWO_LEG;
    }

    if (quotes.length === 3) {
      return ArbitrageRouteType.TRIANGULAR;
    }

    return ArbitrageRouteType.MULTI_HOP;
  }

  public validateRoute(
    route: ArbitrageRoute,
    nowMilliseconds:
      UnixTimestampMilliseconds =
        this.dependencies.clock.nowMilliseconds(),
  ): void {
    if (
      route === null ||
      typeof route !== "object" ||
      !Array.isArray(route.legs)
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.INVALID_REQUEST,
        "Route must be an object with a legs array.",
        { details: route },
      );
    }

    if (
      route.legs.length < 2 ||
      route.legs.length >
        this.options.maximumRouteLegs
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.TOO_MANY_LEGS,
        "Route leg count is outside permitted bounds.",
        {
          chainId: route.chainId,
          details: route.legs.length,
        },
      );
    }

    if (
      route.expiresAtMilliseconds <=
      nowMilliseconds
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.QUOTE_EXPIRED,
        "Route has expired.",
        { chainId: route.chainId },
      );
    }

    for (
      let index = 0;
      index < route.legs.length;
      index += 1
    ) {
      const leg = route.legs[index];

      if (leg.legIndex !== index) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.INVALID_REQUEST,
          "Route leg indexes must be contiguous and zero-based.",
          {
            chainId: route.chainId,
            legIndex: index,
          },
        );
      }

      if (leg.chainId !== route.chainId) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.CHAIN_MISMATCH,
          "Route leg chain does not match route chain.",
          {
            chainId: route.chainId,
            legIndex: index,
          },
        );
      }

      if (index > 0) {
        const previous =
          route.legs[index - 1];

        if (
          !sameToken(
            previous.tokenOut,
            leg.tokenIn,
          )
        ) {
          throw new RouteBuilderError(
            RouteBuilderErrorCode.TOKEN_MISMATCH,
            "Route legs are not token-contiguous.",
            {
              chainId: route.chainId,
              legIndex: index,
            },
          );
        }
      }
    }

    if (
      !sameToken(
        route.startToken,
        route.legs[0].tokenIn,
      ) ||
      !sameToken(
        route.endToken,
        route.legs[
          route.legs.length - 1
        ].tokenOut,
      )
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.TOKEN_MISMATCH,
        "Route endpoint tokens do not match the first and final legs.",
        { chainId: route.chainId },
      );
    }
  }

  private validateRequest(
    request: RouteBuilderRequest,
    nowMilliseconds: UnixTimestampMilliseconds,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.INVALID_REQUEST,
        "Route-builder request must be an object.",
        { details: request },
      );
    }

    if (
      !Number.isSafeInteger(request.chainId) ||
      Number(request.chainId) <= 0
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.INVALID_REQUEST,
        "request.chainId must be a positive safe integer.",
        { details: request.chainId },
      );
    }

    if (
      !Array.isArray(request.quotes) ||
      request.quotes.length === 0
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.EMPTY_QUOTE_SET,
        "At least one quote is required.",
        { chainId: request.chainId },
      );
    }

    if (request.quotes.length < 2) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.EMPTY_QUOTE_SET,
        "An arbitrage route requires at least two quotes.",
        { chainId: request.chainId },
      );
    }

    if (
      request.quotes.length >
      this.options.maximumRouteLegs
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.TOO_MANY_LEGS,
        "Quote count exceeds maximumRouteLegs.",
        {
          chainId: request.chainId,
          details: request.quotes.length,
        },
      );
    }

    if (
      request.deadlineMilliseconds !==
        undefined &&
      request.deadlineMilliseconds <=
        nowMilliseconds
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.DEADLINE_INVALID,
        "Requested route deadline must be in the future.",
        {
          chainId: request.chainId,
          details:
            request.deadlineMilliseconds,
        },
      );
    }

    if (
      request.sequence !== undefined &&
      (!Number.isSafeInteger(request.sequence) ||
        request.sequence < 0)
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.INVALID_REQUEST,
        "request.sequence must be a non-negative safe integer.",
        {
          chainId: request.chainId,
          details: request.sequence,
        },
      );
    }
  }

  private validateQuoteSequence(
    chainId: ChainId,
    quotes: readonly DexQuote[],
    nowMilliseconds: UnixTimestampMilliseconds,
  ): void {
    const referenceBlock =
      quotes[0].blockReference.blockNumber;

    for (
      let index = 0;
      index < quotes.length;
      index += 1
    ) {
      const quote = quotes[index];

      if (
        quote === null ||
        typeof quote !== "object"
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.INVALID_QUOTE,
          "Every route quote must be an object.",
          {
            chainId,
            legIndex: index,
            details: quote,
          },
        );
      }

      if (
        quote.chainId !== chainId ||
        quote.blockReference.chainId !==
          chainId
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.CHAIN_MISMATCH,
          "Quote chain does not match the route chain.",
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      if (
        this.options.requireExactInputQuotes &&
        quote.direction !==
          SwapDirection.EXACT_INPUT
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.INVALID_QUOTE,
          "Route builder requires exact-input quotes.",
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      if (
        quote.amountIn <= 0n ||
        quote.amountOut <= 0n ||
        quote.minimumAmountOut <= 0n ||
        quote.minimumAmountOut >
          quote.amountOut
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.INVALID_QUOTE,
          "Quote contains invalid amounts.",
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      if (
        quote.expiresAtMilliseconds <=
        nowMilliseconds
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.QUOTE_EXPIRED,
          `Quote at leg ${index} has expired.`,
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      if (
        this.options.rejectFutureQuotes &&
        quote.quotedAtMilliseconds >
          nowMilliseconds
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.INVALID_QUOTE,
          `Quote at leg ${index} is timestamped in the future.`,
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      if (
        this.options.requireSameBlockNumber &&
        quote.blockReference.blockNumber !==
          referenceBlock
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.BLOCK_MISMATCH,
          "All route quotes must reference the same block.",
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
            details: {
              expectedBlockNumber:
                referenceBlock,
              actualBlockNumber:
                quote.blockReference.blockNumber,
            },
          },
        );
      }

      if (index === 0) {
        continue;
      }

      const previous = quotes[index - 1];

      if (
        !sameToken(
          previous.tokenOut,
          quote.tokenIn,
        )
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.TOKEN_MISMATCH,
          `Quote token continuity failed between legs ${index - 1} and ${index}.`,
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
          },
        );
      }

      const amountDifference =
        absoluteDifference(
          previous.amountOut,
          quote.amountIn,
        );

      const amountMatches =
        previous.amountOut === quote.amountIn ||
        (this.options
          .allowAmountPropagationTolerance &&
          amountDifference <=
            this.options
              .amountPropagationTolerance);

      if (!amountMatches) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.AMOUNT_MISMATCH,
          `Quote amount continuity failed between legs ${index - 1} and ${index}.`,
          {
            chainId,
            legIndex: index,
            poolId: quote.poolId,
            details: {
              previousAmountOut:
                previous.amountOut,
              currentAmountIn:
                quote.amountIn,
              difference:
                amountDifference,
            },
          },
        );
      }
    }

    if (
      !this.options.allowOpenRoutes &&
      !sameToken(
        quotes[0].tokenIn,
        quotes[quotes.length - 1].tokenOut,
      )
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.ROUTE_NOT_CYCLIC,
        "Arbitrage route must return to its starting token.",
        { chainId },
      );
    }
  }

  private validateRouteType(
    routeType: ArbitrageRouteType,
    quotes: readonly DexQuote[],
  ): void {
    const expected =
      quotes.length === 2
        ? ArbitrageRouteType.TWO_LEG
        : quotes.length === 3
          ? ArbitrageRouteType.TRIANGULAR
          : ArbitrageRouteType.MULTI_HOP;

    if (routeType !== expected) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.ROUTE_TYPE_MISMATCH,
        `Route type "${routeType}" does not match ${quotes.length} quote legs; expected "${expected}".`,
        {
          chainId: quotes[0].chainId,
          details: {
            routeType,
            expected,
            quoteCount: quotes.length,
          },
        },
      );
    }
  }

  private resolveFunding(
    request: RouteBuilderRequest,
    inputAmount: TokenAmount,
    nowMilliseconds: UnixTimestampMilliseconds,
  ): RouteFundingResolution {
    let resolvedMode = request.fundingMode;

    if (request.fundingMode === FundingMode.AUTO) {
      if (
        request.walletBalance !== undefined &&
        request.walletBalance.balance >=
          inputAmount
      ) {
        resolvedMode = FundingMode.WALLET;
      } else if (
        request.flashLiquidityQuote !==
          undefined
      ) {
        resolvedMode =
          request.flashLiquidityQuote
            .provider.liquidityType ===
          "FLASH_SWAP"
            ? FundingMode.FLASH_SWAP
            : FundingMode.FLASH_LOAN;
      } else {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FUNDING_UNAVAILABLE,
          "AUTO funding could not resolve wallet or flash liquidity.",
          { chainId: request.chainId },
        );
      }
    }

    if (resolvedMode === FundingMode.WALLET) {
      const balance = request.walletBalance;

      if (balance === undefined) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FUNDING_UNAVAILABLE,
          "Wallet funding requires a wallet balance snapshot.",
          { chainId: request.chainId },
        );
      }

      if (
        balance.chainId !== request.chainId ||
        !sameToken(
          balance.token,
          request.quotes[0].tokenIn,
        )
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.TOKEN_MISMATCH,
          "Wallet balance snapshot does not match route input token and chain.",
          { chainId: request.chainId },
        );
      }

      if (balance.balance < inputAmount) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.WALLET_BALANCE_INSUFFICIENT,
          "Wallet balance is insufficient for route input amount.",
          {
            chainId: request.chainId,
            details: {
              balance: balance.balance,
              required: inputAmount,
            },
          },
        );
      }

      return Object.freeze({
        requestedMode: request.fundingMode,
        resolvedMode,
        walletBalance: balance,
        fundedAmount: inputAmount,
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    }

    if (
      resolvedMode === FundingMode.FLASH_LOAN ||
      resolvedMode === FundingMode.FLASH_SWAP
    ) {
      const quote =
        request.flashLiquidityQuote;

      if (quote === undefined) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FUNDING_UNAVAILABLE,
          "Flash funding requires a flash-liquidity quote.",
          { chainId: request.chainId },
        );
      }

      if (
        quote.provider.chainId !==
          request.chainId ||
        quote.blockReference.chainId !==
          request.chainId ||
        !sameToken(
          quote.asset,
          request.quotes[0].tokenIn,
        )
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FLASH_LIQUIDITY_INVALID,
          "Flash-liquidity quote does not match route chain or input token.",
          { chainId: request.chainId },
        );
      }

      if (
        quote.requestedAmount !==
          inputAmount ||
        quote.availableAmount <
          inputAmount ||
        quote.totalRepaymentAmount <
          inputAmount
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FLASH_LIQUIDITY_INVALID,
          "Flash-liquidity amount or repayment data is invalid.",
          {
            chainId: request.chainId,
            details: {
              requestedAmount:
                quote.requestedAmount,
              availableAmount:
                quote.availableAmount,
              inputAmount,
              repaymentAmount:
                quote.totalRepaymentAmount,
            },
          },
        );
      }

      if (
        quote.expiresAtMilliseconds <=
        nowMilliseconds
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.FLASH_LIQUIDITY_INVALID,
          "Flash-liquidity quote has expired.",
          { chainId: request.chainId },
        );
      }

      return Object.freeze({
        requestedMode: request.fundingMode,
        resolvedMode,
        flashLiquidityQuote: quote,
        fundedAmount: inputAmount,
        repaymentAmount:
          quote.totalRepaymentAmount,
        fundingExpiresAtMilliseconds:
          quote.expiresAtMilliseconds,
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    }

    if (resolvedMode === FundingMode.PAPER) {
      return Object.freeze({
        requestedMode: request.fundingMode,
        resolvedMode,
        fundedAmount: inputAmount,
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    }

    throw new RouteBuilderError(
      RouteBuilderErrorCode.FUNDING_UNAVAILABLE,
      `Funding mode "${resolvedMode}" is unsupported.`,
      { chainId: request.chainId },
    );
  }

  private resolveDeadline(
    request: RouteBuilderRequest,
    quotes: readonly DexQuote[],
    funding: RouteFundingResolution,
    nowMilliseconds: UnixTimestampMilliseconds,
  ): UnixTimestampMilliseconds {
    let deadline =
      request.deadlineMilliseconds ??
      (nowMilliseconds +
        this.options
          .defaultLifetimeMilliseconds);

    if (
      this.options
        .clampDeadlineToQuoteExpiry
    ) {
      for (const quote of quotes) {
        deadline = Math.min(
          deadline,
          quote.expiresAtMilliseconds,
        ) as UnixTimestampMilliseconds;
      }
    }

    if (
      this.options
        .clampDeadlineToFundingExpiry &&
      funding
        .fundingExpiresAtMilliseconds !==
        undefined
    ) {
      deadline = Math.min(
        deadline,
        funding
          .fundingExpiresAtMilliseconds,
      ) as UnixTimestampMilliseconds;
    }

    if (deadline <= nowMilliseconds) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.DEADLINE_INVALID,
        "Resolved route deadline must be in the future.",
        {
          chainId: request.chainId,
          details: deadline,
        },
      );
    }

    return assertNonNegativeTimestamp(
      deadline,
      "resolvedDeadline",
    );
  }

  private resolveBlockReference(
    request: RouteBuilderRequest,
    quotes: readonly DexQuote[],
    builtAtMilliseconds: UnixTimestampMilliseconds,
  ): EvmBlockReference {
    if (
      request.sourceBlockReference !==
        undefined
    ) {
      if (
        request.sourceBlockReference.chainId !==
        request.chainId
      ) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.CHAIN_MISMATCH,
          "Source block reference chain does not match request chain.",
          { chainId: request.chainId },
        );
      }

      return Object.freeze({
        ...request.sourceBlockReference,
      });
    }

    const selected = [...quotes].sort(
      compareQuotes,
    )[0];

    const minimumBlockNumber =
      quotes.reduce(
        (minimum, quote) =>
          quote.blockReference.blockNumber <
          minimum
            ? quote.blockReference.blockNumber
            : minimum,
        selected.blockReference.blockNumber,
      );

    const matching = quotes.find(
      (quote) =>
        quote.blockReference.blockNumber ===
        minimumBlockNumber,
    );

    return Object.freeze({
      chainId: request.chainId,
      blockNumber: minimumBlockNumber,
      blockHash:
        matching?.blockReference.blockHash,
      timestampMilliseconds:
        matching?.blockReference
          .timestampMilliseconds ??
        builtAtMilliseconds,
    });
  }

  private async buildLeg(
    quote: DexQuote,
    legIndex: number,
    recipient: EvmAddress,
    deadlineMilliseconds: UnixTimestampMilliseconds,
  ): Promise<ArbitrageLeg> {
    let target = quote.routeTarget;
    let calldata = quote.routeCalldata;
    let value = ZERO_WEI;
    let metadata =
      quote.metadata;

    if (
      this.dependencies.legEncoder !==
      undefined
    ) {
      try {
        const encoded =
          await this.dependencies.legEncoder.encode(
            quote,
            {
              legIndex,
              recipient,
              deadlineMilliseconds,
            },
          );

        target = encoded.target;
        calldata = encoded.calldata;
        value = encoded.value ?? ZERO_WEI;
        metadata = mergeMetadata(
          metadata,
          encoded.metadata,
        );
      } catch (cause) {
        throw new RouteBuilderError(
          RouteBuilderErrorCode.CALLDATA_UNAVAILABLE,
          `Unable to encode route leg ${legIndex}.`,
          {
            chainId: quote.chainId,
            legIndex,
            poolId: quote.poolId,
            cause,
          },
        );
      }
    }

    if (
      this.options.requireEncodedLegs &&
      target === undefined
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.TARGET_UNAVAILABLE,
        `Route leg ${legIndex} has no execution target.`,
        {
          chainId: quote.chainId,
          legIndex,
          poolId: quote.poolId,
        },
      );
    }

    if (
      this.options.requireEncodedLegs &&
      calldata === undefined
    ) {
      throw new RouteBuilderError(
        RouteBuilderErrorCode.CALLDATA_UNAVAILABLE,
        `Route leg ${legIndex} has no calldata.`,
        {
          chainId: quote.chainId,
          legIndex,
          poolId: quote.poolId,
        },
      );
    }

    return Object.freeze({
      legIndex,
      chainId: quote.chainId,
      dexId: quote.dexId,
      poolId: quote.poolId,
      tokenIn: quote.tokenIn,
      tokenOut: quote.tokenOut,
      amountIn: quote.amountIn,
      expectedAmountOut:
        quote.amountOut,
      minimumAmountOut:
        quote.minimumAmountOut,
      quote,
      target: target ?? ZERO_ADDRESS,
      calldata: calldata ?? EMPTY_CALLDATA,
      value,
      metadata: freezeMetadata(metadata),
    });
  }

  private areLegsExecutionReady(
    legs: readonly ArbitrageLeg[],
  ): boolean {
    return legs.every(
      (leg) =>
        leg.target !== ZERO_ADDRESS &&
        leg.calldata !== EMPTY_CALLDATA,
    );
  }
}

export function createRouteBuilder(
  dependencies: RouteBuilderDependencies,
  options: RouteBuilderOptions = {},
): CrossDexArbitrageRouteBuilder {
  return new CrossDexArbitrageRouteBuilder(
    dependencies,
    options,
  );
}

export function compareArbitrageRoutes(
  left: ArbitrageRoute,
  right: ArbitrageRoute,
): number {
  if (left.chainId !== right.chainId) {
    return (
      Number(left.chainId) -
      Number(right.chainId)
    );
  }

  if (
    left.expectedFinalAmount !==
    right.expectedFinalAmount
  ) {
    return left.expectedFinalAmount >
      right.expectedFinalAmount
      ? -1
      : 1;
  }

  if (
    left.minimumFinalAmount !==
    right.minimumFinalAmount
  ) {
    return left.minimumFinalAmount >
      right.minimumFinalAmount
      ? -1
      : 1;
  }

  if (
    left.legs.length !==
    right.legs.length
  ) {
    return left.legs.length -
      right.legs.length;
  }

  if (
    left.expiresAtMilliseconds !==
    right.expiresAtMilliseconds
  ) {
    return (
      left.expiresAtMilliseconds -
      right.expiresAtMilliseconds
    );
  }

  return String(left.id).localeCompare(
    String(right.id),
  );
}