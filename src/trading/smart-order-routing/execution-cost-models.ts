import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingLatencyCostModel,
} from "./liquidity-book-analyzer";

export interface SmartOrderRoutingFeeModelInput {
  readonly side: CoordinatorOrderSide;
  readonly quantity: number;
  readonly averageExecutionPrice: number;

  readonly makerFeeBps: number;
  readonly takerFeeBps: number;
  readonly makerEligible: boolean;

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingFeeEstimate {
  readonly feeBps: number;
  readonly grossNotional: number;
  readonly estimatedFee: number;
  readonly makerApplied: boolean;
  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingFeeModel {
  estimateFee(
    input: SmartOrderRoutingFeeModelInput,
  ): SmartOrderRoutingFeeEstimate;
}

export interface SmartOrderRoutingLinearLatencyCostModelOptions {
  readonly costBpsPerSecond?: number;
  readonly maximumCostBps?: number | null;
  readonly minimumLatencyMilliseconds?: number;
}

export interface SmartOrderRoutingMarketImpactModelInput {
  readonly side: CoordinatorOrderSide;

  readonly quantity: number;
  readonly availableQuantity: number;

  readonly referencePrice: number;
  readonly averageExecutionPrice: number;

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingMarketImpactEstimate {
  readonly participationRate: number;
  readonly naturalSlippageBps: number;
  readonly modeledImpactBps: number;
  readonly totalImpactBps: number;

  readonly naturalSlippageCost: number;
  readonly modeledImpactCost: number;
  readonly totalImpactCost: number;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingMarketImpactModel {
  estimateMarketImpact(
    input: SmartOrderRoutingMarketImpactModelInput,
  ): SmartOrderRoutingMarketImpactEstimate;
}

export interface SmartOrderRoutingSquareRootMarketImpactModelOptions {
  readonly impactCoefficientBps?: number;
  readonly maximumImpactBps?: number | null;
}

const DEFAULT_LATENCY_COST_BPS_PER_SECOND = 1;
const DEFAULT_MINIMUM_LATENCY_MILLISECONDS = 0;
const DEFAULT_IMPACT_COEFFICIENT_BPS = 25;

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

    for (
      const [key, value]
      of Object.entries(source)
    ) {
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

function assertFinitePositive(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} must be a finite positive number.`,
    );
  }
}

function assertOptionalFiniteNonNegative(
  value: number | null | undefined,
  fieldName: string,
): void {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  assertFiniteNonNegative(
    value,
    fieldName,
  );
}

function calculateNotional(
  quantity: number,
  price: number,
): number {
  return quantity * price;
}

function calculateBpsCost(
  notional: number,
  bps: number,
): number {
  return (
    notional *
    bps
  ) / 10_000;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

export class SmartOrderRoutingStandardFeeModel
  implements SmartOrderRoutingFeeModel
{
  public estimateFee(
    input: SmartOrderRoutingFeeModelInput,
  ): SmartOrderRoutingFeeEstimate {
    assertFiniteNonNegative(
      input.quantity,
      "quantity",
    );

    assertFiniteNonNegative(
      input.averageExecutionPrice,
      "averageExecutionPrice",
    );

    assertFiniteNonNegative(
      input.makerFeeBps,
      "makerFeeBps",
    );

    assertFiniteNonNegative(
      input.takerFeeBps,
      "takerFeeBps",
    );

    const feeBps =
      input.makerEligible
        ? input.makerFeeBps
        : input.takerFeeBps;

    const grossNotional =
      calculateNotional(
        input.quantity,
        input.averageExecutionPrice,
      );

    const estimatedFee =
      calculateBpsCost(
        grossNotional,
        feeBps,
      );

    return Object.freeze({
      feeBps,
      grossNotional,
      estimatedFee,

      makerApplied:
        input.makerEligible,

      metadata: mergeMetadata(
        input.metadata,
        Object.freeze({
          feeType:
            input.makerEligible
              ? "MAKER"
              : "TAKER",

          side: input.side,
        }),
      ),
    });
  }
}

export class SmartOrderRoutingLinearLatencyCostModel
  implements SmartOrderRoutingLatencyCostModel
{
  private readonly costBpsPerSecond:
    number;

  private readonly maximumCostBps:
    number | null;

  private readonly minimumLatencyMilliseconds:
    number;

  public constructor(
    options:
      SmartOrderRoutingLinearLatencyCostModelOptions =
        {},
  ) {
    this.costBpsPerSecond =
      options.costBpsPerSecond ??
      DEFAULT_LATENCY_COST_BPS_PER_SECOND;

    this.maximumCostBps =
      options.maximumCostBps ??
      null;

    this.minimumLatencyMilliseconds =
      options.minimumLatencyMilliseconds ??
      DEFAULT_MINIMUM_LATENCY_MILLISECONDS;

    assertFiniteNonNegative(
      this.costBpsPerSecond,
      "costBpsPerSecond",
    );

    assertOptionalFiniteNonNegative(
      this.maximumCostBps,
      "maximumCostBps",
    );

    assertFiniteNonNegative(
      this.minimumLatencyMilliseconds,
      "minimumLatencyMilliseconds",
    );
  }

  public estimateLatencyCost(
    input: {
      readonly side: CoordinatorOrderSide;
      readonly quantity: number;
      readonly averageExecutionPrice: number;
      readonly estimatedLatencyMilliseconds: number;
      readonly referencePrice: number | null;
    },
  ): number {
    assertFiniteNonNegative(
      input.quantity,
      "quantity",
    );

    assertFiniteNonNegative(
      input.averageExecutionPrice,
      "averageExecutionPrice",
    );

    assertFiniteNonNegative(
      input.estimatedLatencyMilliseconds,
      "estimatedLatencyMilliseconds",
    );

    if (
      input.referencePrice !== null
    ) {
      assertFiniteNonNegative(
        input.referencePrice,
        "referencePrice",
      );
    }

    if (
      input.quantity <= 0 ||
      input.averageExecutionPrice <= 0 ||
      input.estimatedLatencyMilliseconds <=
        this.minimumLatencyMilliseconds
    ) {
      return 0;
    }

    const chargeableLatencyMilliseconds =
      input.estimatedLatencyMilliseconds -
      this.minimumLatencyMilliseconds;

    let latencyCostBps =
      (
        chargeableLatencyMilliseconds /
        1_000
      ) *
      this.costBpsPerSecond;

    if (
      this.maximumCostBps !== null
    ) {
      latencyCostBps =
        Math.min(
          latencyCostBps,
          this.maximumCostBps,
        );
    }

    const grossNotional =
      calculateNotional(
        input.quantity,
        input.averageExecutionPrice,
      );

    return calculateBpsCost(
      grossNotional,
      latencyCostBps,
    );
  }
}

export class SmartOrderRoutingSquareRootMarketImpactModel
  implements SmartOrderRoutingMarketImpactModel
{
  private readonly impactCoefficientBps:
    number;

  private readonly maximumImpactBps:
    number | null;

  public constructor(
    options:
      SmartOrderRoutingSquareRootMarketImpactModelOptions =
        {},
  ) {
    this.impactCoefficientBps =
      options.impactCoefficientBps ??
      DEFAULT_IMPACT_COEFFICIENT_BPS;

    this.maximumImpactBps =
      options.maximumImpactBps ??
      null;

    assertFiniteNonNegative(
      this.impactCoefficientBps,
      "impactCoefficientBps",
    );

    assertOptionalFiniteNonNegative(
      this.maximumImpactBps,
      "maximumImpactBps",
    );
  }

  public estimateMarketImpact(
    input: SmartOrderRoutingMarketImpactModelInput,
  ): SmartOrderRoutingMarketImpactEstimate {
    assertFiniteNonNegative(
      input.quantity,
      "quantity",
    );

    assertFiniteNonNegative(
      input.availableQuantity,
      "availableQuantity",
    );

    assertFinitePositive(
      input.referencePrice,
      "referencePrice",
    );

    assertFinitePositive(
      input.averageExecutionPrice,
      "averageExecutionPrice",
    );

    const participationRate =
      input.availableQuantity > 0
        ? clamp(
            input.quantity /
              input.availableQuantity,
            0,
            1,
          )
        : 0;

    const directionalDifference =
      input.side === "BUY"
        ? input.averageExecutionPrice -
          input.referencePrice
        : input.referencePrice -
          input.averageExecutionPrice;

    const naturalSlippageBps =
      Math.max(
        0,
        (
          directionalDifference /
          input.referencePrice
        ) *
        10_000,
      );

    let modeledImpactBps =
      this.impactCoefficientBps *
      Math.sqrt(
        participationRate,
      );

    if (
      this.maximumImpactBps !== null
    ) {
      modeledImpactBps =
        Math.min(
          modeledImpactBps,
          this.maximumImpactBps,
        );
    }

    const totalImpactBps =
      naturalSlippageBps +
      modeledImpactBps;

    const grossNotional =
      calculateNotional(
        input.quantity,
        input.averageExecutionPrice,
      );

    const naturalSlippageCost =
      calculateBpsCost(
        grossNotional,
        naturalSlippageBps,
      );

    const modeledImpactCost =
      calculateBpsCost(
        grossNotional,
        modeledImpactBps,
      );

    const totalImpactCost =
      naturalSlippageCost +
      modeledImpactCost;

    return Object.freeze({
      participationRate,
      naturalSlippageBps,
      modeledImpactBps,
      totalImpactBps,

      naturalSlippageCost,
      modeledImpactCost,
      totalImpactCost,

      metadata: mergeMetadata(
        input.metadata,
        Object.freeze({
          side: input.side,

          impactModel:
            "SQUARE_ROOT",

          impactCoefficientBps:
            this.impactCoefficientBps,
        }),
      ),
    });
  }
}

export function createSmartOrderRoutingStandardFeeModel():
  SmartOrderRoutingStandardFeeModel {
  return new SmartOrderRoutingStandardFeeModel();
}

export function createSmartOrderRoutingLinearLatencyCostModel(
  options:
    SmartOrderRoutingLinearLatencyCostModelOptions =
      {},
): SmartOrderRoutingLinearLatencyCostModel {
  return new SmartOrderRoutingLinearLatencyCostModel(
    options,
  );
}

export function createSmartOrderRoutingSquareRootMarketImpactModel(
  options:
    SmartOrderRoutingSquareRootMarketImpactModelOptions =
      {},
): SmartOrderRoutingSquareRootMarketImpactModel {
  return new SmartOrderRoutingSquareRootMarketImpactModel(
    options,
  );
}