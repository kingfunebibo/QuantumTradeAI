import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorSymbol,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingFeeModel,
  SmartOrderRoutingMarketImpactModel,
} from "./execution-cost-models";
import {
  createSmartOrderRoutingSquareRootMarketImpactModel,
  createSmartOrderRoutingStandardFeeModel,
} from "./execution-cost-models";
import type {
  SmartOrderRoutingLatencyCostModel,
} from "./liquidity-book-analyzer";
import {
  createSmartOrderRoutingLinearLatencyCostModel,
} from "./execution-cost-models";

export interface SmartOrderRoutingExecutionCandidate {
  readonly candidateId: string;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;

  readonly quantity: number;
  readonly availableQuantity: number;

  readonly referencePrice: number;
  readonly averageExecutionPrice: number;
  readonly worstExecutionPrice: number;

  readonly makerFeeBps: number;
  readonly takerFeeBps: number;
  readonly makerEligible: boolean;

  readonly estimatedLatencyMilliseconds: number;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingExecutionCandidateCost {
  readonly candidateId: string;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly quantity: number;

  readonly grossNotional: number;

  readonly estimatedFee: number;
  readonly estimatedLatencyCost: number;
  readonly estimatedMarketImpactCost: number;

  readonly totalEstimatedCost: number;
  readonly effectiveUnitPrice: number;

  readonly feeBps: number;
  readonly naturalSlippageBps: number;
  readonly modeledImpactBps: number;
  readonly totalImpactBps: number;

  readonly participationRate: number;
  readonly estimatedLatencyMilliseconds: number;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingExecutionComparison {
  readonly side: CoordinatorOrderSide;

  readonly rankedCandidates:
    readonly SmartOrderRoutingExecutionCandidateCost[];

  readonly bestCandidate:
    SmartOrderRoutingExecutionCandidateCost | null;

  readonly worstCandidate:
    SmartOrderRoutingExecutionCandidateCost | null;

  readonly candidateCount: number;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingBestExecutionComparatorOptions {
  readonly feeModel?: SmartOrderRoutingFeeModel;
  readonly latencyCostModel?: SmartOrderRoutingLatencyCostModel;
  readonly marketImpactModel?: SmartOrderRoutingMarketImpactModel;
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

    for (
      const [key, value]
      of Object.entries(source)
    ) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `${fieldName} must not be empty.`,
    );
  }
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

function validateCandidate(
  candidate: SmartOrderRoutingExecutionCandidate,
  index: number,
): void {
  assertNonEmptyString(
    candidate.candidateId,
    `candidates[${index}].candidateId`,
  );

  assertNonEmptyString(
    candidate.exchangeId,
    `candidates[${index}].exchangeId`,
  );

  assertNonEmptyString(
    candidate.accountId,
    `candidates[${index}].accountId`,
  );

  assertNonEmptyString(
    candidate.symbol,
    `candidates[${index}].symbol`,
  );

  assertNonEmptyString(
    candidate.exchangeSymbol,
    `candidates[${index}].exchangeSymbol`,
  );

  assertFinitePositive(
    candidate.quantity,
    `candidates[${index}].quantity`,
  );

  assertFiniteNonNegative(
    candidate.availableQuantity,
    `candidates[${index}].availableQuantity`,
  );

  assertFinitePositive(
    candidate.referencePrice,
    `candidates[${index}].referencePrice`,
  );

  assertFinitePositive(
    candidate.averageExecutionPrice,
    `candidates[${index}].averageExecutionPrice`,
  );

  assertFinitePositive(
    candidate.worstExecutionPrice,
    `candidates[${index}].worstExecutionPrice`,
  );

  assertFiniteNonNegative(
    candidate.makerFeeBps,
    `candidates[${index}].makerFeeBps`,
  );

  assertFiniteNonNegative(
    candidate.takerFeeBps,
    `candidates[${index}].takerFeeBps`,
  );

  assertFiniteNonNegative(
    candidate.estimatedLatencyMilliseconds,
    `candidates[${index}].estimatedLatencyMilliseconds`,
  );

  if (
    candidate.quantity >
    candidate.availableQuantity
  ) {
    throw new Error(
      `candidates[${index}].quantity cannot exceed availableQuantity.`,
    );
  }
}

function compareCandidateCosts(
  side: CoordinatorOrderSide,
  left: SmartOrderRoutingExecutionCandidateCost,
  right: SmartOrderRoutingExecutionCandidateCost,
): number {
  const effectivePriceDifference =
    side === "BUY"
      ? left.effectiveUnitPrice -
        right.effectiveUnitPrice
      : right.effectiveUnitPrice -
        left.effectiveUnitPrice;

  if (
    effectivePriceDifference !== 0
  ) {
    return effectivePriceDifference;
  }

  const costDifference =
    left.totalEstimatedCost -
    right.totalEstimatedCost;

  if (costDifference !== 0) {
    return costDifference;
  }

  const latencyDifference =
    left.estimatedLatencyMilliseconds -
    right.estimatedLatencyMilliseconds;

  if (latencyDifference !== 0) {
    return latencyDifference;
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

  const accountComparison =
    left.accountId.localeCompare(
      right.accountId,
    );

  if (
    accountComparison !== 0
  ) {
    return accountComparison;
  }

  return left.candidateId.localeCompare(
    right.candidateId,
  );
}

export class SmartOrderRoutingBestExecutionComparator {
  private readonly feeModel:
    SmartOrderRoutingFeeModel;

  private readonly latencyCostModel:
    SmartOrderRoutingLatencyCostModel;

  private readonly marketImpactModel:
    SmartOrderRoutingMarketImpactModel;

  public constructor(
    options:
      SmartOrderRoutingBestExecutionComparatorOptions =
        {},
  ) {
    this.feeModel =
      options.feeModel ??
      createSmartOrderRoutingStandardFeeModel();

    this.latencyCostModel =
      options.latencyCostModel ??
      createSmartOrderRoutingLinearLatencyCostModel();

    this.marketImpactModel =
      options.marketImpactModel ??
      createSmartOrderRoutingSquareRootMarketImpactModel();
  }

  public evaluateCandidate(
    candidate: SmartOrderRoutingExecutionCandidate,
  ): SmartOrderRoutingExecutionCandidateCost {
    validateCandidate(
      candidate,
      0,
    );

    const feeEstimate =
      this.feeModel.estimateFee({
        side: candidate.side,

        quantity:
          candidate.quantity,

        averageExecutionPrice:
          candidate.averageExecutionPrice,

        makerFeeBps:
          candidate.makerFeeBps,

        takerFeeBps:
          candidate.takerFeeBps,

        makerEligible:
          candidate.makerEligible,

        metadata:
          candidate.metadata,
      });

    const estimatedLatencyCost =
      this.latencyCostModel.estimateLatencyCost({
        side: candidate.side,

        quantity:
          candidate.quantity,

        averageExecutionPrice:
          candidate.averageExecutionPrice,

        estimatedLatencyMilliseconds:
          candidate.estimatedLatencyMilliseconds,

        referencePrice:
          candidate.referencePrice,
      });

    const marketImpactEstimate =
      this.marketImpactModel.estimateMarketImpact({
        side: candidate.side,

        quantity:
          candidate.quantity,

        availableQuantity:
          candidate.availableQuantity,

        referencePrice:
          candidate.referencePrice,

        averageExecutionPrice:
          candidate.averageExecutionPrice,

        metadata:
          candidate.metadata,
      });

    const grossNotional =
      candidate.quantity *
      candidate.averageExecutionPrice;

    const totalEstimatedCost =
      feeEstimate.estimatedFee +
      estimatedLatencyCost +
      marketImpactEstimate.totalImpactCost;

    const effectiveUnitPrice =
      candidate.side === "BUY"
        ? (
            grossNotional +
            totalEstimatedCost
          ) / candidate.quantity
        : (
            grossNotional -
            totalEstimatedCost
          ) / candidate.quantity;

    return Object.freeze({
      candidateId:
        candidate.candidateId,

      exchangeId:
        candidate.exchangeId,

      accountId:
        candidate.accountId,

      quantity:
        candidate.quantity,

      grossNotional,

      estimatedFee:
        feeEstimate.estimatedFee,

      estimatedLatencyCost,

      estimatedMarketImpactCost:
        marketImpactEstimate.totalImpactCost,

      totalEstimatedCost,

      effectiveUnitPrice,

      feeBps:
        feeEstimate.feeBps,

      naturalSlippageBps:
        marketImpactEstimate
          .naturalSlippageBps,

      modeledImpactBps:
        marketImpactEstimate
          .modeledImpactBps,

      totalImpactBps:
        marketImpactEstimate
          .totalImpactBps,

      participationRate:
        marketImpactEstimate
          .participationRate,

      estimatedLatencyMilliseconds:
        candidate
          .estimatedLatencyMilliseconds,

      metadata: mergeMetadata(
        candidate.metadata,

        feeEstimate.metadata,

        marketImpactEstimate.metadata,

        Object.freeze({
          comparisonModel:
            "TOTAL_EXECUTION_COST",

          averageExecutionPrice:
            candidate
              .averageExecutionPrice,

          worstExecutionPrice:
            candidate
              .worstExecutionPrice,
        }),
      ),
    });
  }

  public compare(
    candidates:
      readonly SmartOrderRoutingExecutionCandidate[],
  ): SmartOrderRoutingExecutionComparison {
    if (
      candidates.length === 0
    ) {
      return Object.freeze({
        side: "BUY",

        rankedCandidates:
          Object.freeze([]),

        bestCandidate: null,
        worstCandidate: null,

        candidateCount: 0,

        metadata: Object.freeze({
          comparisonModel:
            "TOTAL_EXECUTION_COST",

          emptyComparison: true,
        }),
      });
    }

    const expectedSide =
      candidates[0]?.side;

    if (
      expectedSide === undefined
    ) {
      throw new Error(
        "Unable to determine candidate side.",
      );
    }

    const expectedSymbol =
      candidates[0]?.symbol;

    if (
      expectedSymbol === undefined
    ) {
      throw new Error(
        "Unable to determine candidate symbol.",
      );
    }

    const candidateIds =
      new Set<string>();

    const evaluatedCandidates:
      SmartOrderRoutingExecutionCandidateCost[] =
      [];

    for (
      const [index, candidate]
      of candidates.entries()
    ) {
      validateCandidate(
        candidate,
        index,
      );

      if (
        candidate.side !==
        expectedSide
      ) {
        throw new Error(
          "All execution candidates must have the same side.",
        );
      }

      if (
        candidate.symbol !==
        expectedSymbol
      ) {
        throw new Error(
          "All execution candidates must have the same symbol.",
        );
      }

      if (
        candidateIds.has(
          candidate.candidateId,
        )
      ) {
        throw new Error(
          `Duplicate candidateId: ${candidate.candidateId}.`,
        );
      }

      candidateIds.add(
        candidate.candidateId,
      );

      evaluatedCandidates.push(
        this.evaluateCandidate(
          candidate,
        ),
      );
    }

    const rankedCandidates =
      Object.freeze(
        evaluatedCandidates.sort(
          (left, right) =>
            compareCandidateCosts(
              expectedSide,
              left,
              right,
            ),
        ),
      );

    return Object.freeze({
      side:
        expectedSide,

      rankedCandidates,

      bestCandidate:
        rankedCandidates[0] ??
        null,

      worstCandidate:
        rankedCandidates[
          rankedCandidates.length - 1
        ] ?? null,

      candidateCount:
        rankedCandidates.length,

      metadata: Object.freeze({
        comparisonModel:
          "TOTAL_EXECUTION_COST",

        symbol:
          expectedSymbol,

        candidateCount:
          rankedCandidates.length,
      }),
    });
  }
}

export function createSmartOrderRoutingBestExecutionComparator(
  options:
    SmartOrderRoutingBestExecutionComparatorOptions =
      {},
): SmartOrderRoutingBestExecutionComparator {
  return new SmartOrderRoutingBestExecutionComparator(
    options,
  );
}