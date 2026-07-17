import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorSymbol,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingExecutionCandidate,
  SmartOrderRoutingExecutionCandidateCost,
} from "./best-execution-comparator";
import {
  createSmartOrderRoutingBestExecutionComparator,
  type SmartOrderRoutingBestExecutionComparator,
  type SmartOrderRoutingBestExecutionComparatorOptions,
} from "./best-execution-comparator";
import {
  createSmartOrderRoutingVenueCapacityModel,
  type SmartOrderRoutingVenueCapacity,
  type SmartOrderRoutingVenueCapacityInput,
  type SmartOrderRoutingVenueCapacityModel,
  type SmartOrderRoutingVenueCapacityModelOptions,
} from "./venue-capacity-model";

export type SmartOrderRoutingOptimizedAllocationStatus =
  | "COMPLETED"
  | "PARTIALLY_ALLOCATED"
  | "UNALLOCATABLE";

export interface SmartOrderRoutingOptimizedVenueInput {
  readonly candidate:
    SmartOrderRoutingExecutionCandidate;

  readonly maximumParticipationRate?:
    number | null;

  readonly maximumVenueQuantity?:
    number | null;

  readonly minimumAllocationQuantity?:
    number | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingOptimizedAllocation {
  readonly allocationId: string;

  readonly candidateId: string;

  readonly exchangeId:
    CoordinatorExchangeId;

  readonly accountId:
    CoordinatorAccountId;

  readonly symbol:
    CoordinatorSymbol;

  readonly exchangeSymbol: string;

  readonly side:
    CoordinatorOrderSide;

  readonly quantity: number;

  readonly expectedAveragePrice: number;

  readonly expectedNotional: number;

  readonly expectedFee: number;

  readonly expectedLatencyCost: number;

  readonly expectedMarketImpactCost: number;

  readonly totalExpectedCost: number;

  readonly effectiveUnitPrice: number;

  readonly venueCapacity:
    SmartOrderRoutingVenueCapacity;

  readonly candidateCost:
    SmartOrderRoutingExecutionCandidateCost;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingOptimizedAllocationRequest {
  readonly allocationRequestId: string;

  readonly symbol:
    CoordinatorSymbol;

  readonly side:
    CoordinatorOrderSide;

  readonly requestedQuantity: number;

  readonly allowPartialAllocation: boolean;

  readonly maximumVenueCount?:
    number | null;

  readonly minimumAllocationQuantity?:
    number | null;

  readonly venues:
    readonly SmartOrderRoutingOptimizedVenueInput[];

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingOptimizedAllocationResult {
  readonly allocationRequestId: string;

  readonly symbol:
    CoordinatorSymbol;

  readonly side:
    CoordinatorOrderSide;

  readonly status:
    SmartOrderRoutingOptimizedAllocationStatus;

  readonly requestedQuantity: number;

  readonly allocatedQuantity: number;

  readonly unallocatedQuantity: number;

  readonly allocations:
    readonly SmartOrderRoutingOptimizedAllocation[];

  readonly rankedCandidateCosts:
    readonly SmartOrderRoutingExecutionCandidateCost[];

  readonly venueCapacities:
    readonly SmartOrderRoutingVenueCapacity[];

  readonly expectedAveragePrice:
    number | null;

  readonly expectedTotalNotional: number;

  readonly expectedTotalFee: number;

  readonly expectedTotalLatencyCost: number;

  readonly expectedTotalMarketImpactCost: number;

  readonly expectedTotalExecutionCost: number;

  readonly expectedEffectiveUnitPrice:
    number | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingOptimizedSplitAllocationEngineOptions {
  readonly comparator?:
    SmartOrderRoutingBestExecutionComparator;

  readonly capacityModel?:
    SmartOrderRoutingVenueCapacityModel;

  readonly comparatorOptions?:
    SmartOrderRoutingBestExecutionComparatorOptions;

  readonly capacityModelOptions?:
    SmartOrderRoutingVenueCapacityModelOptions;

  readonly quantityPrecision?: number;
}

interface EvaluatedVenue {
  readonly input:
    SmartOrderRoutingOptimizedVenueInput;

  readonly cost:
    SmartOrderRoutingExecutionCandidateCost;

  readonly capacity:
    SmartOrderRoutingVenueCapacity;
}

const DEFAULT_QUANTITY_PRECISION = 12;

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

function assertOptionalPositiveInteger(
  value: number | null | undefined,
  fieldName: string,
): void {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertPrecision(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 18
  ) {
    throw new Error(
      `${fieldName} must be an integer between 0 and 18.`,
    );
  }
}

function roundValue(
  value: number,
  precision: number,
): number {
  const factor =
    10 ** precision;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function createAllocationId(
  allocationRequestId: string,
  index: number,
  candidateId: string,
): string {
  return [
    allocationRequestId,
    String(index + 1),
    candidateId,
  ].join(":");
}

export class SmartOrderRoutingOptimizedSplitAllocationEngine {
  private readonly comparator:
    SmartOrderRoutingBestExecutionComparator;

  private readonly capacityModel:
    SmartOrderRoutingVenueCapacityModel;

  private readonly quantityPrecision:
    number;

  public constructor(
    options:
      SmartOrderRoutingOptimizedSplitAllocationEngineOptions =
        {},
  ) {
    this.comparator =
      options.comparator ??
      createSmartOrderRoutingBestExecutionComparator(
        options.comparatorOptions,
      );

    this.capacityModel =
      options.capacityModel ??
      createSmartOrderRoutingVenueCapacityModel(
        options.capacityModelOptions,
      );

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    assertPrecision(
      this.quantityPrecision,
      "quantityPrecision",
    );
  }

  public allocate(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,
  ): SmartOrderRoutingOptimizedAllocationResult {
    this.validateRequest(
      request,
    );

    if (
      request.venues.length === 0
    ) {
      return this.createEmptyResult(
        request,
      );
    }

    const comparison =
      this.comparator.compare(
        request.venues.map(
          (venue) =>
            venue.candidate,
        ),
      );

    const venuesByCandidateId =
      new Map(
        request.venues.map(
          (venue) => [
            venue.candidate.candidateId,
            venue,
          ],
        ),
      );

    const evaluatedVenues:
      EvaluatedVenue[] = [];

    for (
      const cost
      of comparison.rankedCandidates
    ) {
      const venue =
        venuesByCandidateId.get(
          cost.candidateId,
        );

      if (venue === undefined) {
        throw new Error(
          `Unable to resolve venue for candidate ${cost.candidateId}.`,
        );
      }

      const capacityInput:
        SmartOrderRoutingVenueCapacityInput =
        {
          exchangeId:
            venue.candidate.exchangeId,

          accountId:
            venue.candidate.accountId,

          symbol:
            venue.candidate.symbol,

          exchangeSymbol:
            venue.candidate.exchangeSymbol,

          side:
            venue.candidate.side,

          requestedQuantity:
            request.requestedQuantity,

          availableQuantity:
            venue.candidate.availableQuantity,

          maximumParticipationRate:
            venue.maximumParticipationRate,

          maximumVenueQuantity:
            venue.maximumVenueQuantity,

          minimumAllocationQuantity:
            venue.minimumAllocationQuantity ??
            request.minimumAllocationQuantity,

          metadata: mergeMetadata(
            venue.candidate.metadata,
            venue.metadata,
          ),
        };

      evaluatedVenues.push({
        input: venue,
        cost,

        capacity:
          this.capacityModel
            .calculateCapacity(
              capacityInput,
            ),
      });
    }

    const maximumVenueCount =
      request.maximumVenueCount ??
      evaluatedVenues.length;

    const minimumAllocationQuantity =
      request.minimumAllocationQuantity ??
      0;

    let remainingQuantity =
      request.requestedQuantity;

    const provisionalAllocations:
      SmartOrderRoutingOptimizedAllocation[] =
      [];

    for (
      const evaluatedVenue
      of evaluatedVenues
    ) {
      if (
        provisionalAllocations.length >=
        maximumVenueCount
      ) {
        break;
      }

      if (
        remainingQuantity <= 0
      ) {
        break;
      }

      const candidate =
        evaluatedVenue
          .input
          .candidate;

      let allocationQuantity =
        roundValue(
          Math.min(
            remainingQuantity,
            evaluatedVenue
              .capacity
              .routableQuantity,
          ),
          this.quantityPrecision,
        );

      if (
        allocationQuantity <
        minimumAllocationQuantity
      ) {
        continue;
      }

      if (
        allocationQuantity <= 0
      ) {
        continue;
      }

      const allocation =
        this.createAllocation(
          request,
          evaluatedVenue,
          allocationQuantity,
          provisionalAllocations.length,
        );

      provisionalAllocations.push(
        allocation,
      );

      remainingQuantity =
        roundValue(
          remainingQuantity -
            allocationQuantity,
          this.quantityPrecision,
        );
    }

    const allocatedQuantity =
      roundValue(
        provisionalAllocations.reduce(
          (
            total,
            allocation,
          ) =>
            total +
            allocation.quantity,
          0,
        ),
        this.quantityPrecision,
      );

    const unallocatedQuantity =
      roundValue(
        Math.max(
          0,
          request.requestedQuantity -
            allocatedQuantity,
        ),
        this.quantityPrecision,
      );

    if (
      unallocatedQuantity > 0 &&
      !request.allowPartialAllocation
    ) {
      return this.createUnallocatableResult(
        request,
        comparison.rankedCandidates,
        evaluatedVenues.map(
          (venue) =>
            venue.capacity,
        ),
      );
    }

    const status:
      SmartOrderRoutingOptimizedAllocationStatus =
      allocatedQuantity <= 0
        ? "UNALLOCATABLE"
        : unallocatedQuantity > 0
          ? "PARTIALLY_ALLOCATED"
          : "COMPLETED";

    return this.createResult(
      request,
      status,
      provisionalAllocations,
      comparison.rankedCandidates,
      evaluatedVenues.map(
        (venue) =>
          venue.capacity,
      ),
    );
  }

  private createAllocation(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,

    evaluatedVenue:
      EvaluatedVenue,

    quantity: number,

    index: number,
  ): SmartOrderRoutingOptimizedAllocation {
    const candidate =
      evaluatedVenue.input.candidate;

    const proportionalRatio =
      quantity /
      candidate.quantity;

    const expectedNotional =
      quantity *
      candidate.averageExecutionPrice;

    const expectedFee =
      evaluatedVenue.cost.estimatedFee *
      proportionalRatio;

    const expectedLatencyCost =
      evaluatedVenue
        .cost
        .estimatedLatencyCost *
      proportionalRatio;

    const expectedMarketImpactCost =
      evaluatedVenue
        .cost
        .estimatedMarketImpactCost *
      proportionalRatio;

    const totalExpectedCost =
      expectedFee +
      expectedLatencyCost +
      expectedMarketImpactCost;

    const effectiveUnitPrice =
      candidate.side === "BUY"
        ? (
            expectedNotional +
            totalExpectedCost
          ) / quantity
        : (
            expectedNotional -
            totalExpectedCost
          ) / quantity;

    return Object.freeze({
      allocationId:
        createAllocationId(
          request.allocationRequestId,
          index,
          candidate.candidateId,
        ),

      candidateId:
        candidate.candidateId,

      exchangeId:
        candidate.exchangeId,

      accountId:
        candidate.accountId,

      symbol:
        candidate.symbol,

      exchangeSymbol:
        candidate.exchangeSymbol,

      side:
        candidate.side,

      quantity,

      expectedAveragePrice:
        candidate.averageExecutionPrice,

      expectedNotional,

      expectedFee,

      expectedLatencyCost,

      expectedMarketImpactCost,

      totalExpectedCost,

      effectiveUnitPrice,

      venueCapacity:
        evaluatedVenue.capacity,

      candidateCost:
        evaluatedVenue.cost,

      metadata: mergeMetadata(
        candidate.metadata,
        evaluatedVenue.input.metadata,

        Object.freeze({
          allocationRank:
            index + 1,

          allocationModel:
            "OPTIMIZED_TOTAL_EXECUTION_COST",
        }),
      ),
    });
  }

  private createResult(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,

    status:
      SmartOrderRoutingOptimizedAllocationStatus,

    allocations:
      readonly SmartOrderRoutingOptimizedAllocation[],

    rankedCandidateCosts:
      readonly SmartOrderRoutingExecutionCandidateCost[],

    venueCapacities:
      readonly SmartOrderRoutingVenueCapacity[],
  ): SmartOrderRoutingOptimizedAllocationResult {
    const allocatedQuantity =
      roundValue(
        allocations.reduce(
          (
            total,
            allocation,
          ) =>
            total +
            allocation.quantity,
          0,
        ),
        this.quantityPrecision,
      );

    const unallocatedQuantity =
      roundValue(
        Math.max(
          0,
          request.requestedQuantity -
            allocatedQuantity,
        ),
        this.quantityPrecision,
      );

    const expectedTotalNotional =
      allocations.reduce(
        (
          total,
          allocation,
        ) =>
          total +
          allocation.expectedNotional,
        0,
      );

    const expectedTotalFee =
      allocations.reduce(
        (
          total,
          allocation,
        ) =>
          total +
          allocation.expectedFee,
        0,
      );

    const expectedTotalLatencyCost =
      allocations.reduce(
        (
          total,
          allocation,
        ) =>
          total +
          allocation.expectedLatencyCost,
        0,
      );

    const expectedTotalMarketImpactCost =
      allocations.reduce(
        (
          total,
          allocation,
        ) =>
          total +
          allocation.expectedMarketImpactCost,
        0,
      );

    const expectedTotalExecutionCost =
      expectedTotalFee +
      expectedTotalLatencyCost +
      expectedTotalMarketImpactCost;

    const expectedAveragePrice =
      allocatedQuantity > 0
        ? expectedTotalNotional /
          allocatedQuantity
        : null;

    const expectedEffectiveUnitPrice =
      allocatedQuantity > 0
        ? request.side === "BUY"
          ? (
              expectedTotalNotional +
              expectedTotalExecutionCost
            ) / allocatedQuantity
          : (
              expectedTotalNotional -
              expectedTotalExecutionCost
            ) / allocatedQuantity
        : null;

    return Object.freeze({
      allocationRequestId:
        request.allocationRequestId,

      symbol:
        request.symbol,

      side:
        request.side,

      status,

      requestedQuantity:
        request.requestedQuantity,

      allocatedQuantity,

      unallocatedQuantity,

      allocations:
        Object.freeze(
          [...allocations],
        ),

      rankedCandidateCosts:
        Object.freeze(
          [...rankedCandidateCosts],
        ),

      venueCapacities:
        Object.freeze(
          [...venueCapacities],
        ),

      expectedAveragePrice,

      expectedTotalNotional,

      expectedTotalFee,

      expectedTotalLatencyCost,

      expectedTotalMarketImpactCost,

      expectedTotalExecutionCost,

      expectedEffectiveUnitPrice,

      metadata: mergeMetadata(
        request.metadata,

        Object.freeze({
          allocationModel:
            "OPTIMIZED_TOTAL_EXECUTION_COST",

          allocationCount:
            allocations.length,

          candidateCount:
            rankedCandidateCosts.length,

          capacityCount:
            venueCapacities.length,

          partialAllocation:
            unallocatedQuantity > 0,

          quantityPrecision:
            this.quantityPrecision,
        }),
      ),
    });
  }

  private createEmptyResult(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,
  ): SmartOrderRoutingOptimizedAllocationResult {
    return this.createResult(
      request,
      "UNALLOCATABLE",
      [],
      [],
      [],
    );
  }

  private createUnallocatableResult(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,

    rankedCandidateCosts:
      readonly SmartOrderRoutingExecutionCandidateCost[],

    venueCapacities:
      readonly SmartOrderRoutingVenueCapacity[],
  ): SmartOrderRoutingOptimizedAllocationResult {
    return this.createResult(
      request,
      "UNALLOCATABLE",
      [],
      rankedCandidateCosts,
      venueCapacities,
    );
  }

  private validateRequest(
    request:
      SmartOrderRoutingOptimizedAllocationRequest,
  ): void {
    assertNonEmptyString(
      request.allocationRequestId,
      "allocationRequestId",
    );

    assertNonEmptyString(
      request.symbol,
      "symbol",
    );

    assertFinitePositive(
      request.requestedQuantity,
      "requestedQuantity",
    );

    assertOptionalPositiveInteger(
      request.maximumVenueCount,
      "maximumVenueCount",
    );

    assertOptionalFiniteNonNegative(
      request.minimumAllocationQuantity,
      "minimumAllocationQuantity",
    );

    const candidateIds =
      new Set<string>();

    for (
      const [index, venue]
      of request.venues.entries()
    ) {
      const candidate =
        venue.candidate;

      if (
        candidate.symbol !==
        request.symbol
      ) {
        throw new Error(
          `venues[${index}].candidate.symbol must match the request symbol.`,
        );
      }

      if (
        candidate.side !==
        request.side
      ) {
        throw new Error(
          `venues[${index}].candidate.side must match the request side.`,
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

      assertOptionalFiniteNonNegative(
        venue.maximumVenueQuantity,
        `venues[${index}].maximumVenueQuantity`,
      );

      assertOptionalFiniteNonNegative(
        venue.minimumAllocationQuantity,
        `venues[${index}].minimumAllocationQuantity`,
      );
    }
  }
}

export function createSmartOrderRoutingOptimizedSplitAllocationEngine(
  options:
    SmartOrderRoutingOptimizedSplitAllocationEngineOptions =
      {},
): SmartOrderRoutingOptimizedSplitAllocationEngine {
  return new SmartOrderRoutingOptimizedSplitAllocationEngine(
    options,
  );
}