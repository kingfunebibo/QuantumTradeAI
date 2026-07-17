import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingPolicy,
  SmartOrderRoutingRequest,
  SmartOrderRoutingVenueCostEstimate,
  SmartOrderRoutingVenueScore,
} from "./smart-order-routing-contracts";

export interface SmartOrderRoutingVenueScoringInput {
  readonly request: SmartOrderRoutingRequest;
  readonly estimates:
    readonly SmartOrderRoutingVenueCostEstimate[];
  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingScoringWeights {
  readonly price: number;
  readonly liquidity: number;
  readonly fee: number;
  readonly slippage: number;
  readonly latency: number;
}

export interface SmartOrderRoutingVenueScoringEngineOptions {
  readonly balancedWeights?:
    Partial<SmartOrderRoutingScoringWeights>;
}

const DEFAULT_BALANCED_WEIGHTS:
  SmartOrderRoutingScoringWeights =
  Object.freeze({
    price: 0.35,
    liquidity: 0.25,
    fee: 0.15,
    slippage: 0.15,
    latency: 0.1,
  });

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

function normalizeWeights(
  input:
    Partial<SmartOrderRoutingScoringWeights> =
      {},
): SmartOrderRoutingScoringWeights {
  const weights = {
    price:
      input.price ??
      DEFAULT_BALANCED_WEIGHTS.price,
    liquidity:
      input.liquidity ??
      DEFAULT_BALANCED_WEIGHTS.liquidity,
    fee:
      input.fee ??
      DEFAULT_BALANCED_WEIGHTS.fee,
    slippage:
      input.slippage ??
      DEFAULT_BALANCED_WEIGHTS.slippage,
    latency:
      input.latency ??
      DEFAULT_BALANCED_WEIGHTS.latency,
  };

  assertFiniteNonNegative(
    weights.price,
    "weights.price",
  );

  assertFiniteNonNegative(
    weights.liquidity,
    "weights.liquidity",
  );

  assertFiniteNonNegative(
    weights.fee,
    "weights.fee",
  );

  assertFiniteNonNegative(
    weights.slippage,
    "weights.slippage",
  );

  assertFiniteNonNegative(
    weights.latency,
    "weights.latency",
  );

  const total =
    weights.price +
    weights.liquidity +
    weights.fee +
    weights.slippage +
    weights.latency;

  if (total <= 0) {
    throw new Error(
      "At least one scoring weight must be greater than zero.",
    );
  }

  return Object.freeze({
    price: weights.price / total,
    liquidity:
      weights.liquidity / total,
    fee: weights.fee / total,
    slippage:
      weights.slippage / total,
    latency:
      weights.latency / total,
  });
}

function normalizeHigherIsBetter(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (maximum === minimum) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(
      1,
      (value - minimum) /
        (maximum - minimum),
    ),
  );
}

function normalizeLowerIsBetter(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (maximum === minimum) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(
      1,
      (maximum - value) /
        (maximum - minimum),
    ),
  );
}

function calculatePriceScore(
  side: CoordinatorOrderSide,
  estimate:
    SmartOrderRoutingVenueCostEstimate,
  minimumEffectivePrice: number,
  maximumEffectivePrice: number,
): number {
  if (
    estimate.effectiveUnitPrice === null
  ) {
    return 0;
  }

  return side === "BUY"
    ? normalizeLowerIsBetter(
        estimate.effectiveUnitPrice,
        minimumEffectivePrice,
        maximumEffectivePrice,
      )
    : normalizeHigherIsBetter(
        estimate.effectiveUnitPrice,
        minimumEffectivePrice,
        maximumEffectivePrice,
      );
}

function getPolicyWeights(
  policy: SmartOrderRoutingPolicy,
  balancedWeights:
    SmartOrderRoutingScoringWeights,
): SmartOrderRoutingScoringWeights {
  switch (policy) {
    case "BEST_PRICE":
    case "BEST_EFFECTIVE_PRICE":
      return Object.freeze({
        price: 1,
        liquidity: 0,
        fee: 0,
        slippage: 0,
        latency: 0,
      });

    case "LOWEST_FEES":
      return Object.freeze({
        price: 0,
        liquidity: 0,
        fee: 1,
        slippage: 0,
        latency: 0,
      });

    case "LOWEST_SLIPPAGE":
      return Object.freeze({
        price: 0,
        liquidity: 0,
        fee: 0,
        slippage: 1,
        latency: 0,
      });

    case "LOWEST_LATENCY":
      return Object.freeze({
        price: 0,
        liquidity: 0,
        fee: 0,
        slippage: 0,
        latency: 1,
      });

    case "HIGHEST_LIQUIDITY":
      return Object.freeze({
        price: 0,
        liquidity: 1,
        fee: 0,
        slippage: 0,
        latency: 0,
      });

    case "BALANCED":
      return balancedWeights;
  }
}

function determineRejectionReasons(
  request: SmartOrderRoutingRequest,
  estimate:
    SmartOrderRoutingVenueCostEstimate,
): readonly string[] {
  const reasons: string[] = [];

  if (
    estimate.executableQuantity <= 0
  ) {
    reasons.push(
      "NO_EXECUTABLE_LIQUIDITY",
    );
  }

  if (
    request.minimumAllocationQuantity !==
      null &&
    estimate.executableQuantity <
      request.minimumAllocationQuantity
  ) {
    reasons.push(
      "MINIMUM_ALLOCATION_NOT_MET",
    );
  }

  if (
    request.maximumSlippageBps !== null &&
    estimate.slippageBps >
      request.maximumSlippageBps
  ) {
    reasons.push(
      "MAXIMUM_SLIPPAGE_EXCEEDED",
    );
  }

  if (
    request.maximumFeeBps !== null &&
    estimate.feeBps >
      request.maximumFeeBps
  ) {
    reasons.push(
      "MAXIMUM_FEE_EXCEEDED",
    );
  }

  if (
    request.maximumLatencyMilliseconds !==
      null &&
    estimate.estimatedLatencyMilliseconds >
      request.maximumLatencyMilliseconds
  ) {
    reasons.push(
      "MAXIMUM_LATENCY_EXCEEDED",
    );
  }

  if (
    request.limitPrice !== null &&
    estimate.worstExecutionPrice !== null
  ) {
    const outsideLimit =
      request.side === "BUY"
        ? estimate.worstExecutionPrice >
          request.limitPrice
        : estimate.worstExecutionPrice <
          request.limitPrice;

    if (outsideLimit) {
      reasons.push(
        "LIMIT_PRICE_EXCEEDED",
      );
    }
  }

  return Object.freeze(reasons);
}

export class SmartOrderRoutingVenueScoringEngine {
  private readonly balancedWeights:
    SmartOrderRoutingScoringWeights;

  public constructor(
    options:
      SmartOrderRoutingVenueScoringEngineOptions =
        {},
  ) {
    this.balancedWeights =
      normalizeWeights(
        options.balancedWeights,
      );
  }

  public score(
    input: SmartOrderRoutingVenueScoringInput,
  ): readonly SmartOrderRoutingVenueScore[] {
    if (input.estimates.length === 0) {
      return Object.freeze([]);
    }

    const effectivePrices =
      input.estimates
        .map(
          (estimate) =>
            estimate.effectiveUnitPrice,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !== null &&
            Number.isFinite(value),
        );

    const executableQuantities =
      input.estimates.map(
        (estimate) =>
          estimate.executableQuantity,
      );

    const feeBpsValues =
      input.estimates.map(
        (estimate) =>
          estimate.feeBps,
      );

    const slippageBpsValues =
      input.estimates.map(
        (estimate) =>
          estimate.slippageBps,
      );

    const latencyValues =
      input.estimates.map(
        (estimate) =>
          estimate
            .estimatedLatencyMilliseconds,
      );

    const minimumEffectivePrice =
      effectivePrices.length > 0
        ? Math.min(
            ...effectivePrices,
          )
        : 0;

    const maximumEffectivePrice =
      effectivePrices.length > 0
        ? Math.max(
            ...effectivePrices,
          )
        : 0;

    const minimumLiquidity =
      Math.min(
        ...executableQuantities,
      );

    const maximumLiquidity =
      Math.max(
        ...executableQuantities,
      );

    const minimumFee =
      Math.min(...feeBpsValues);

    const maximumFee =
      Math.max(...feeBpsValues);

    const minimumSlippage =
      Math.min(
        ...slippageBpsValues,
      );

    const maximumSlippage =
      Math.max(
        ...slippageBpsValues,
      );

    const minimumLatency =
      Math.min(...latencyValues);

    const maximumLatency =
      Math.max(...latencyValues);

    const weights =
      getPolicyWeights(
        input.request.policy,
        this.balancedWeights,
      );

    const provisional =
      input.estimates.map(
        (estimate) => {
          const rejectionReasons =
            determineRejectionReasons(
              input.request,
              estimate,
            );

          const routable =
            rejectionReasons.length === 0;

          const priceScore =
            calculatePriceScore(
              input.request.side,
              estimate,
              minimumEffectivePrice,
              maximumEffectivePrice,
            );

          const liquidityScore =
            normalizeHigherIsBetter(
              estimate.executableQuantity,
              minimumLiquidity,
              maximumLiquidity,
            );

          const feeScore =
            normalizeLowerIsBetter(
              estimate.feeBps,
              minimumFee,
              maximumFee,
            );

          const slippageScore =
            normalizeLowerIsBetter(
              estimate.slippageBps,
              minimumSlippage,
              maximumSlippage,
            );

          const latencyScore =
            normalizeLowerIsBetter(
              estimate
                .estimatedLatencyMilliseconds,
              minimumLatency,
              maximumLatency,
            );

          const totalScore =
            routable
              ? (
                  priceScore *
                    weights.price +
                  liquidityScore *
                    weights.liquidity +
                  feeScore *
                    weights.fee +
                  slippageScore *
                    weights.slippage +
                  latencyScore *
                    weights.latency
                )
              : 0;

          return {
            exchangeId:
              estimate.exchangeId,

            accountId:
              estimate.accountId,

            priceScore,
            liquidityScore,
            feeScore,
            slippageScore,
            latencyScore,

            totalScore,
            rank: 0,

            routable,
            rejectionReasons,

            metadata: mergeMetadata(
              estimate.metadata,
              input.metadata,
              Object.freeze({
                policy:
                  input.request.policy,
              }),
            ),
          };
        },
      );

    const sorted =
      [...provisional].sort(
        (left, right) => {
          if (
            right.totalScore !==
            left.totalScore
          ) {
            return (
              right.totalScore -
              left.totalScore
            );
          }

          if (
            right.liquidityScore !==
            left.liquidityScore
          ) {
            return (
              right.liquidityScore -
              left.liquidityScore
            );
          }

          const exchangeComparison =
            left.exchangeId.localeCompare(
              right.exchangeId,
            );

          if (
            exchangeComparison !== 0
          ) {
            return exchangeComparison;
          }

          return left.accountId.localeCompare(
            right.accountId,
          );
        },
      );

    return Object.freeze(
      sorted.map(
        (score, index) =>
          Object.freeze({
            ...score,
            rank: index + 1,
          }),
      ),
    );
  }
}

export function createSmartOrderRoutingVenueScoringEngine(
  options:
    SmartOrderRoutingVenueScoringEngineOptions =
      {},
): SmartOrderRoutingVenueScoringEngine {
  return new SmartOrderRoutingVenueScoringEngine(
    options,
  );
}