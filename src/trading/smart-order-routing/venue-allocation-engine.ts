import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingAllocation,
  SmartOrderRoutingRequest,
  SmartOrderRoutingVenueCostEstimate,
  SmartOrderRoutingVenueScore,
} from "./smart-order-routing-contracts";

export interface SmartOrderRoutingVenueAllocationInput {
  readonly request: SmartOrderRoutingRequest;

  readonly estimates:
    readonly SmartOrderRoutingVenueCostEstimate[];

  readonly venueScores:
    readonly SmartOrderRoutingVenueScore[];

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueAllocationResult {
  readonly requestedQuantity: number;
  readonly allocatedQuantity: number;
  readonly unallocatedQuantity: number;

  readonly allocations:
    readonly SmartOrderRoutingAllocation[];

  readonly complete: boolean;
  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueAllocationEngineOptions {
  readonly quantityPrecision?: number;
  readonly allocationIdFactory?: (
    input: {
      readonly routingRequestId: string;
      readonly exchangeId: string;
      readonly accountId: string;
      readonly rank: number;
    },
  ) => string;
}

interface RankedVenue {
  readonly estimate:
    SmartOrderRoutingVenueCostEstimate;

  readonly score:
    SmartOrderRoutingVenueScore;
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

function assertValidPrecision(
  precision: number,
): void {
  if (
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 18
  ) {
    throw new Error(
      "quantityPrecision must be an integer between 0 and 18.",
    );
  }
}

function roundQuantity(
  value: number,
  precision: number,
): number {
  const factor = 10 ** precision;

  return (
    Math.floor(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function findEstimate(
  estimates:
    readonly SmartOrderRoutingVenueCostEstimate[],
  score: SmartOrderRoutingVenueScore,
): SmartOrderRoutingVenueCostEstimate | null {
  return (
    estimates.find(
      (estimate) =>
        estimate.exchangeId ===
          score.exchangeId &&
        estimate.accountId ===
          score.accountId,
    ) ?? null
  );
}

function buildRankedVenues(
  estimates:
    readonly SmartOrderRoutingVenueCostEstimate[],
  venueScores:
    readonly SmartOrderRoutingVenueScore[],
): readonly RankedVenue[] {
  const ranked: RankedVenue[] = [];

  for (const score of venueScores) {
    if (!score.routable) {
      continue;
    }

    const estimate = findEstimate(
      estimates,
      score,
    );

    if (
      estimate === null ||
      estimate.executableQuantity <= 0
    ) {
      continue;
    }

    ranked.push(
      Object.freeze({
        estimate,
        score,
      }),
    );
  }

  ranked.sort(
    (left, right) => {
      if (
        left.score.rank !==
        right.score.rank
      ) {
        return (
          left.score.rank -
          right.score.rank
        );
      }

      if (
        right.score.totalScore !==
        left.score.totalScore
      ) {
        return (
          right.score.totalScore -
          left.score.totalScore
        );
      }

      const exchangeComparison =
        left.estimate.exchangeId.localeCompare(
          right.estimate.exchangeId,
        );

      if (
        exchangeComparison !== 0
      ) {
        return exchangeComparison;
      }

      return left.estimate.accountId.localeCompare(
        right.estimate.accountId,
      );
    },
  );

  return Object.freeze(ranked);
}

function calculatePercentage(
  quantity: number,
  requestedQuantity: number,
): number {
  if (requestedQuantity <= 0) {
    return 0;
  }

  return (
    quantity /
    requestedQuantity
  ) * 100;
}

function calculateProportionalCost(
  totalCost: number,
  allocatedQuantity: number,
  executableQuantity: number,
): number {
  if (executableQuantity <= 0) {
    return 0;
  }

  return (
    totalCost *
    (
      allocatedQuantity /
      executableQuantity
    )
  );
}

function defaultAllocationIdFactory(
  input: {
    readonly routingRequestId: string;
    readonly exchangeId: string;
    readonly accountId: string;
    readonly rank: number;
  },
): string {
  return [
    input.routingRequestId,
    input.exchangeId,
    input.accountId,
    input.rank,
  ].join(":");
}

export class SmartOrderRoutingVenueAllocationEngine {
  private readonly quantityPrecision:
    number;

  private readonly allocationIdFactory:
    NonNullable<
      SmartOrderRoutingVenueAllocationEngineOptions[
        "allocationIdFactory"
      ]
    >;

  public constructor(
    options:
      SmartOrderRoutingVenueAllocationEngineOptions =
        {},
  ) {
    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    assertValidPrecision(
      this.quantityPrecision,
    );

    this.allocationIdFactory =
      options.allocationIdFactory ??
      defaultAllocationIdFactory;
  }

  public allocate(
    input: SmartOrderRoutingVenueAllocationInput,
  ): SmartOrderRoutingVenueAllocationResult {
    assertFiniteNonNegative(
      input.request.quantity,
      "request.quantity",
    );

    const rankedVenues =
      buildRankedVenues(
        input.estimates,
        input.venueScores,
      );

    const maximumVenueCount =
      input.request.maximumVenueCount ??
      rankedVenues.length;

    const selectedVenues =
      rankedVenues.slice(
        0,
        maximumVenueCount,
      );

    const allocations:
      SmartOrderRoutingAllocation[] = [];

    let remainingQuantity =
      input.request.quantity;

    for (const venue of selectedVenues) {
      if (remainingQuantity <= 0) {
        break;
      }

      const availableQuantity =
        roundQuantity(
          venue.estimate
            .executableQuantity,
          this.quantityPrecision,
        );

      if (availableQuantity <= 0) {
        continue;
      }

      let allocationQuantity =
        roundQuantity(
          Math.min(
            remainingQuantity,
            availableQuantity,
          ),
          this.quantityPrecision,
        );

      const minimumAllocationQuantity =
        input.request
          .minimumAllocationQuantity;

      if (
        minimumAllocationQuantity !==
          null &&
        allocationQuantity <
          minimumAllocationQuantity
      ) {
        continue;
      }

      if (
        minimumAllocationQuantity !==
          null &&
        remainingQuantity >
          allocationQuantity &&
        remainingQuantity -
          allocationQuantity <
          minimumAllocationQuantity
      ) {
        const expandableQuantity =
          roundQuantity(
            Math.min(
              availableQuantity,
              remainingQuantity,
            ),
            this.quantityPrecision,
          );

        if (
          expandableQuantity >=
          remainingQuantity
        ) {
          allocationQuantity =
            remainingQuantity;
        }
      }

      allocationQuantity =
        roundQuantity(
          allocationQuantity,
          this.quantityPrecision,
        );

      if (allocationQuantity <= 0) {
        continue;
      }

      const expectedFee =
        calculateProportionalCost(
          venue.estimate.estimatedFee,
          allocationQuantity,
          venue.estimate
            .executableQuantity,
        );

      const expectedSlippageCost =
        calculateProportionalCost(
          venue.estimate
            .estimatedSlippageCost,
          allocationQuantity,
          venue.estimate
            .executableQuantity,
        );

      const expectedLatencyCost =
        calculateProportionalCost(
          venue.estimate
            .estimatedLatencyCost,
          allocationQuantity,
          venue.estimate
            .executableQuantity,
        );

      const expectedTotalCost =
        expectedFee +
        expectedSlippageCost +
        expectedLatencyCost;

      allocations.push(
        Object.freeze({
          allocationId:
            this.allocationIdFactory({
              routingRequestId:
                input.request
                  .routingRequestId,
              exchangeId:
                venue.estimate
                  .exchangeId,
              accountId:
                venue.estimate
                  .accountId,
              rank:
                venue.score.rank,
            }),

          routingRequestId:
            input.request
              .routingRequestId,

          exchangeId:
            venue.estimate.exchangeId,

          accountId:
            venue.estimate.accountId,

          symbol:
            input.request.symbol,

          exchangeSymbol:
            String(
              venue.estimate.metadata[
                "exchangeSymbol"
              ] ??
                input.request.symbol,
            ),

          quantity:
            allocationQuantity,

          percentage:
            calculatePercentage(
              allocationQuantity,
              input.request.quantity,
            ),

          orderType:
            input.request.orderType,

          timeInForce:
            input.request.timeInForce,

          limitPrice:
            input.request.limitPrice,

          stopPrice:
            input.request.stopPrice,

          expectedAveragePrice:
            venue.estimate
              .averageExecutionPrice,

          expectedWorstPrice:
            venue.estimate
              .worstExecutionPrice,

          expectedFee,

          expectedSlippageCost,

          expectedLatencyMilliseconds:
            venue.estimate
              .estimatedLatencyMilliseconds,

          expectedTotalCost,

          rank:
            venue.score.rank,

          metadata: mergeMetadata(
            venue.estimate.metadata,
            venue.score.metadata,
            input.metadata,
            Object.freeze({
              totalScore:
                venue.score.totalScore,
              allocatedFromAvailable:
                allocationQuantity /
                availableQuantity,
            }),
          ),
        }),
      );

      remainingQuantity =
        roundQuantity(
          Math.max(
            0,
            remainingQuantity -
              allocationQuantity,
          ),
          this.quantityPrecision,
        );
    }

    let allocatedQuantity =
      roundQuantity(
        allocations.reduce(
          (total, allocation) =>
            total +
            allocation.quantity,
          0,
        ),
        this.quantityPrecision,
      );

    let unallocatedQuantity =
      roundQuantity(
        Math.max(
          0,
          input.request.quantity -
            allocatedQuantity,
        ),
        this.quantityPrecision,
      );

    if (
      unallocatedQuantity > 0 &&
      !input.request
        .allowPartialRouting
    ) {
      allocatedQuantity = 0;
      unallocatedQuantity =
        input.request.quantity;

      return Object.freeze({
        requestedQuantity:
          input.request.quantity,

        allocatedQuantity,

        unallocatedQuantity,

        allocations:
          Object.freeze([]),

        complete: false,

        metadata: mergeMetadata(
          input.request.metadata,
          input.metadata,
          Object.freeze({
            rejected:
              "PARTIAL_ROUTING_DISABLED",
            candidateVenueCount:
              rankedVenues.length,
            selectedVenueCount:
              selectedVenues.length,
          }),
        ),
      });
    }

    return Object.freeze({
      requestedQuantity:
        input.request.quantity,

      allocatedQuantity,

      unallocatedQuantity,

      allocations:
        Object.freeze(
          allocations,
        ),

      complete:
        unallocatedQuantity === 0,

      metadata: mergeMetadata(
        input.request.metadata,
        input.metadata,
        Object.freeze({
          candidateVenueCount:
            rankedVenues.length,
          selectedVenueCount:
            selectedVenues.length,
          allocationCount:
            allocations.length,
          partial:
            unallocatedQuantity > 0,
        }),
      ),
    });
  }
}

export function createSmartOrderRoutingVenueAllocationEngine(
  options:
    SmartOrderRoutingVenueAllocationEngineOptions =
      {},
): SmartOrderRoutingVenueAllocationEngine {
  return new SmartOrderRoutingVenueAllocationEngine(
    options,
  );
}