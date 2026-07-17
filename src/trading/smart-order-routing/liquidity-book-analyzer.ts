import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingLiquidityLevel,
  SmartOrderRoutingLiquiditySnapshot,
  SmartOrderRoutingRequest,
  SmartOrderRoutingVenueCostEstimate,
  SmartOrderRoutingVenueQuote,
} from "./smart-order-routing-contracts";

export interface SmartOrderRoutingLatencyCostModel {
  estimateLatencyCost(input: {
    readonly side: CoordinatorOrderSide;
    readonly quantity: number;
    readonly averageExecutionPrice: number;
    readonly estimatedLatencyMilliseconds: number;
    readonly referencePrice: number | null;
  }): number;
}

export interface SmartOrderRoutingLiquidityAnalysisInput {
  readonly request: SmartOrderRoutingRequest;
  readonly quote: SmartOrderRoutingVenueQuote;
  readonly liquidity:
    SmartOrderRoutingLiquiditySnapshot | null;
  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingLiquidityBookAnalyzerOptions {
  readonly latencyCostModel?:
    SmartOrderRoutingLatencyCostModel;
}

export class ZeroSmartOrderRoutingLatencyCostModel
  implements SmartOrderRoutingLatencyCostModel
{
  public estimateLatencyCost(): number {
    return 0;
  }
}

function mergeMetadata(
  ...sources: readonly (
    | CoordinatorMetadata
    | undefined
  )[]
): CoordinatorMetadata {
  const merged: Record<
    string,
    CoordinatorMetadataValue
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

function assertMatchingMarket(
  request: SmartOrderRoutingRequest,
  quote: SmartOrderRoutingVenueQuote,
  liquidity:
    SmartOrderRoutingLiquiditySnapshot | null,
): void {
  if (
    request.symbol !== quote.symbol
  ) {
    throw new Error(
      `Quote symbol ${quote.symbol} does not match request symbol ${request.symbol}.`,
    );
  }

  if (
    request.side !== quote.side
  ) {
    throw new Error(
      `Quote side ${quote.side} does not match request side ${request.side}.`,
    );
  }

  if (liquidity === null) {
    return;
  }

  if (
    liquidity.exchangeId !==
    quote.exchangeId
  ) {
    throw new Error(
      "Liquidity snapshot exchangeId does not match quote exchangeId.",
    );
  }

  if (
    liquidity.accountId !==
    quote.accountId
  ) {
    throw new Error(
      "Liquidity snapshot accountId does not match quote accountId.",
    );
  }

  if (
    liquidity.symbol !==
    quote.symbol
  ) {
    throw new Error(
      "Liquidity snapshot symbol does not match quote symbol.",
    );
  }

  if (
    liquidity.exchangeSymbol !==
    quote.exchangeSymbol
  ) {
    throw new Error(
      "Liquidity snapshot exchangeSymbol does not match quote exchangeSymbol.",
    );
  }

  const expectedLiquiditySide =
    request.side === "BUY"
      ? "ASK"
      : "BID";

  if (
    liquidity.side !==
    expectedLiquiditySide
  ) {
    throw new Error(
      `Liquidity side ${liquidity.side} does not match expected ${expectedLiquiditySide} side.`,
    );
  }
}

function isExpired(
  expiresAt: number | null,
  now: number,
): boolean {
  return (
    expiresAt !== null &&
    expiresAt < now
  );
}

function getTopOfBookPrice(
  request: SmartOrderRoutingRequest,
  quote: SmartOrderRoutingVenueQuote,
): number | null {
  return request.side === "BUY"
    ? quote.bestAskPrice
    : quote.bestBidPrice;
}

function getTopOfBookQuantity(
  request: SmartOrderRoutingRequest,
  quote: SmartOrderRoutingVenueQuote,
): number {
  return request.side === "BUY"
    ? quote.bestAskQuantity
    : quote.bestBidQuantity;
}

function getApplicableFeeBps(
  request: SmartOrderRoutingRequest,
  quote: SmartOrderRoutingVenueQuote,
): number {
  const makerEligible =
    request.orderType === "LIMIT" &&
    quote.metadata["makerEligible"] === true;

  return makerEligible
    ? quote.makerFeeBps
    : quote.takerFeeBps;
}

function priceWithinLimit(
  side: CoordinatorOrderSide,
  price: number,
  limitPrice: number | null,
): boolean {
  if (limitPrice === null) {
    return true;
  }

  return side === "BUY"
    ? price <= limitPrice
    : price >= limitPrice;
}

function consumeLevels(
  side: CoordinatorOrderSide,
  requestedQuantity: number,
  limitPrice: number | null,
  levels:
    readonly SmartOrderRoutingLiquidityLevel[],
): {
  readonly executableQuantity: number;
  readonly grossNotional: number;
  readonly averageExecutionPrice: number | null;
  readonly worstExecutionPrice: number | null;
} {
  let remainingQuantity =
    requestedQuantity;

  let executableQuantity = 0;
  let grossNotional = 0;
  let worstExecutionPrice:
    number | null = null;

  for (const level of levels) {
    if (
      remainingQuantity <= 0
    ) {
      break;
    }

    if (
      !priceWithinLimit(
        side,
        level.price,
        limitPrice,
      )
    ) {
      break;
    }

    const consumedQuantity =
      Math.min(
        remainingQuantity,
        level.quantity,
      );

    executableQuantity +=
      consumedQuantity;

    grossNotional +=
      consumedQuantity *
      level.price;

    remainingQuantity -=
      consumedQuantity;

    worstExecutionPrice =
      level.price;
  }

  const averageExecutionPrice =
    executableQuantity > 0
      ? grossNotional /
        executableQuantity
      : null;

  return Object.freeze({
    executableQuantity,
    grossNotional,
    averageExecutionPrice,
    worstExecutionPrice,
  });
}

function consumeTopOfBook(
  side: CoordinatorOrderSide,
  requestedQuantity: number,
  limitPrice: number | null,
  price: number | null,
  availableQuantity: number,
): {
  readonly executableQuantity: number;
  readonly grossNotional: number;
  readonly averageExecutionPrice: number | null;
  readonly worstExecutionPrice: number | null;
} {
  if (
    price === null ||
    availableQuantity <= 0 ||
    !priceWithinLimit(
      side,
      price,
      limitPrice,
    )
  ) {
    return Object.freeze({
      executableQuantity: 0,
      grossNotional: 0,
      averageExecutionPrice: null,
      worstExecutionPrice: null,
    });
  }

  const executableQuantity =
    Math.min(
      requestedQuantity,
      availableQuantity,
    );

  return Object.freeze({
    executableQuantity,
    grossNotional:
      executableQuantity * price,
    averageExecutionPrice: price,
    worstExecutionPrice: price,
  });
}

function calculateSlippageBps(
  side: CoordinatorOrderSide,
  averageExecutionPrice: number | null,
  referencePrice: number | null,
): number {
  if (
    averageExecutionPrice === null ||
    referencePrice === null ||
    referencePrice <= 0
  ) {
    return 0;
  }

  const priceDifference =
    side === "BUY"
      ? averageExecutionPrice -
        referencePrice
      : referencePrice -
        averageExecutionPrice;

  return Math.max(
    0,
    (
      priceDifference /
      referencePrice
    ) * 10_000,
  );
}

function calculateSlippageCost(
  slippageBps: number,
  grossNotional: number,
): number {
  return (
    grossNotional *
    slippageBps
  ) / 10_000;
}

function calculateEffectiveUnitPrice(
  side: CoordinatorOrderSide,
  grossNotional: number,
  totalEstimatedCost: number,
  executableQuantity: number,
): number | null {
  if (executableQuantity <= 0) {
    return null;
  }

  const effectiveNotional =
    side === "BUY"
      ? grossNotional +
        totalEstimatedCost
      : grossNotional -
        totalEstimatedCost;

  return (
    effectiveNotional /
    executableQuantity
  );
}

export class SmartOrderRoutingLiquidityBookAnalyzer {
  private readonly latencyCostModel:
    SmartOrderRoutingLatencyCostModel;

  public constructor(
    options:
      SmartOrderRoutingLiquidityBookAnalyzerOptions = {},
  ) {
    this.latencyCostModel =
      options.latencyCostModel ??
      new ZeroSmartOrderRoutingLatencyCostModel();
  }

  public analyze(
    input: SmartOrderRoutingLiquidityAnalysisInput,
    now: number = input.request.createdAt,
  ): SmartOrderRoutingVenueCostEstimate {
    assertFiniteNonNegative(
      now,
      "now",
    );

    assertMatchingMarket(
      input.request,
      input.quote,
      input.liquidity,
    );

    if (
      isExpired(
        input.quote.expiresAt,
        now,
      )
    ) {
      throw new Error(
        `Quote ${input.quote.quoteId} has expired.`,
      );
    }

    if (
      input.liquidity !== null &&
      isExpired(
        input.liquidity.expiresAt,
        now,
      )
    ) {
      throw new Error(
        `Liquidity snapshot for ${input.quote.exchangeId} has expired.`,
      );
    }

    const consumption =
      input.liquidity === null
        ? consumeTopOfBook(
            input.request.side,
            input.request.quantity,
            input.request.limitPrice,
            getTopOfBookPrice(
              input.request,
              input.quote,
            ),
            getTopOfBookQuantity(
              input.request,
              input.quote,
            ),
          )
        : consumeLevels(
            input.request.side,
            input.request.quantity,
            input.request.limitPrice,
            input.liquidity.levels,
          );

    const feeBps =
      getApplicableFeeBps(
        input.request,
        input.quote,
      );

    const estimatedFee =
      (
        consumption.grossNotional *
        feeBps
      ) / 10_000;

    const slippageBps =
      calculateSlippageBps(
        input.request.side,
        consumption.averageExecutionPrice,
        input.quote.referencePrice ??
          getTopOfBookPrice(
            input.request,
            input.quote,
          ),
      );

    const estimatedSlippageCost =
      calculateSlippageCost(
        slippageBps,
        consumption.grossNotional,
      );

    const estimatedLatencyCost =
      consumption.averageExecutionPrice ===
        null
        ? 0
        : this.latencyCostModel
            .estimateLatencyCost({
              side: input.request.side,
              quantity:
                consumption.executableQuantity,
              averageExecutionPrice:
                consumption.averageExecutionPrice,
              estimatedLatencyMilliseconds:
                input.quote
                  .estimatedLatencyMilliseconds,
              referencePrice:
                input.quote.referencePrice,
            });

    assertFiniteNonNegative(
      estimatedLatencyCost,
      "estimatedLatencyCost",
    );

    const totalEstimatedCost =
      estimatedFee +
      estimatedSlippageCost +
      estimatedLatencyCost;

    return Object.freeze({
      exchangeId:
        input.quote.exchangeId,

      accountId:
        input.quote.accountId,

      requestedQuantity:
        input.request.quantity,

      executableQuantity:
        consumption.executableQuantity,

      averageExecutionPrice:
        consumption.averageExecutionPrice,

      worstExecutionPrice:
        consumption.worstExecutionPrice,

      grossNotional:
        consumption.grossNotional,

      feeBps,
      estimatedFee,

      slippageBps,
      estimatedSlippageCost,

      estimatedLatencyMilliseconds:
        input.quote
          .estimatedLatencyMilliseconds,

      estimatedLatencyCost,

      totalEstimatedCost,

      effectiveUnitPrice:
        calculateEffectiveUnitPrice(
          input.request.side,
          consumption.grossNotional,
          totalEstimatedCost,
          consumption.executableQuantity,
        ),

      metadata: mergeMetadata(
        input.quote.metadata,
        input.liquidity?.metadata,
        input.metadata,
        Object.freeze({
          liquiditySource:
            input.liquidity === null
              ? "TOP_OF_BOOK"
              : "ORDER_BOOK",
          completeFill:
            consumption.executableQuantity >=
            input.request.quantity,
        }),
      ),
    });
  }

  public analyzeMany(
    input: {
      readonly request:
        SmartOrderRoutingRequest;
      readonly venues: readonly {
        readonly quote:
          SmartOrderRoutingVenueQuote;
        readonly liquidity:
          SmartOrderRoutingLiquiditySnapshot | null;
        readonly metadata?:
          CoordinatorMetadata;
      }[];
    },
    now: number = input.request.createdAt,
  ): readonly SmartOrderRoutingVenueCostEstimate[] {
    return Object.freeze(
      input.venues.map(
        (venue) =>
          this.analyze(
            {
              request:
                input.request,
              quote:
                venue.quote,
              liquidity:
                venue.liquidity,
              metadata:
                venue.metadata,
            },
            now,
          ),
      ),
    );
  }
}

export function createSmartOrderRoutingLiquidityBookAnalyzer(
  options:
    SmartOrderRoutingLiquidityBookAnalyzerOptions = {},
): SmartOrderRoutingLiquidityBookAnalyzer {
  return new SmartOrderRoutingLiquidityBookAnalyzer(
    options,
  );
}