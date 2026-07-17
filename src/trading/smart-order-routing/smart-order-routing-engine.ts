import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorTimestamp,
} from "../multi-exchange-coordination/coordinator-contracts";
import {
  createSmartOrderRoutingDecision,
  type SmartOrderRoutingDecision,
  type SmartOrderRoutingFailure,
  type SmartOrderRoutingFailureCode,
  type SmartOrderRoutingLiquiditySnapshot,
  type SmartOrderRoutingRequest,
  type SmartOrderRoutingStatus,
  type SmartOrderRoutingVenueCostEstimate,
  type SmartOrderRoutingVenueQuote,
  type SmartOrderRoutingVenueScore,
} from "./smart-order-routing-contracts";
import {
  SmartOrderRoutingLiquidityBookAnalyzer,
  type SmartOrderRoutingLiquidityBookAnalyzerOptions,
} from "./liquidity-book-analyzer";
import {
  SmartOrderRoutingVenueScoringEngine,
  type SmartOrderRoutingVenueScoringEngineOptions,
} from "./venue-scoring-engine";
import {
  SmartOrderRoutingVenueAllocationEngine,
  type SmartOrderRoutingVenueAllocationEngineOptions,
  type SmartOrderRoutingVenueAllocationResult,
} from "./venue-allocation-engine";

export interface SmartOrderRoutingVenueInput {
  readonly quote: SmartOrderRoutingVenueQuote;
  readonly liquidity:
    SmartOrderRoutingLiquiditySnapshot | null;
  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingEngineInput {
  readonly request: SmartOrderRoutingRequest;
  readonly venues:
    readonly SmartOrderRoutingVenueInput[];

  readonly completedAt?: CoordinatorTimestamp;
  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingEngineOptions {
  readonly liquidityAnalyzer?:
    SmartOrderRoutingLiquidityBookAnalyzer;

  readonly venueScoringEngine?:
    SmartOrderRoutingVenueScoringEngine;

  readonly venueAllocationEngine?:
    SmartOrderRoutingVenueAllocationEngine;

  readonly liquidityAnalyzerOptions?:
    SmartOrderRoutingLiquidityBookAnalyzerOptions;

  readonly venueScoringEngineOptions?:
    SmartOrderRoutingVenueScoringEngineOptions;

  readonly venueAllocationEngineOptions?:
    SmartOrderRoutingVenueAllocationEngineOptions;

  readonly decisionIdFactory?: (
    input: {
      readonly routingRequestId: string;
      readonly createdAt: CoordinatorTimestamp;
      readonly completedAt: CoordinatorTimestamp;
    },
  ) => string;
}

interface VenueAnalysisResult {
  readonly estimates:
    readonly SmartOrderRoutingVenueCostEstimate[];

  readonly rejectedVenueCount: number;
  readonly errors: readonly string[];
}

const DEFAULT_DECISION_ID_SUFFIX =
  "decision";

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

function defaultDecisionIdFactory(
  input: {
    readonly routingRequestId: string;
    readonly createdAt: CoordinatorTimestamp;
    readonly completedAt: CoordinatorTimestamp;
  },
): string {
  return [
    input.routingRequestId,
    DEFAULT_DECISION_ID_SUFFIX,
    input.createdAt,
    input.completedAt,
  ].join(":");
}

function createFailure(
  code: SmartOrderRoutingFailureCode,
  message: string,
  occurredAt: CoordinatorTimestamp,
  retryable: boolean,
  cause: unknown,
  metadata?: CoordinatorMetadata,
): SmartOrderRoutingFailure {
  return Object.freeze({
    code,
    message,
    retryable,
    occurredAt,
    cause,
    metadata: mergeMetadata(
      metadata,
    ),
  });
}

function determineStatus(
  allocation:
    SmartOrderRoutingVenueAllocationResult,
): SmartOrderRoutingStatus {
  if (
    allocation.allocatedQuantity <= 0
  ) {
    return "UNROUTABLE";
  }

  if (
    allocation.complete
  ) {
    return "COMPLETED";
  }

  return "PARTIALLY_ROUTABLE";
}

function calculateExpectedAveragePrice(
  allocation:
    SmartOrderRoutingVenueAllocationResult,
): number | null {
  let totalQuantity = 0;
  let totalNotional = 0;

  for (
    const item
    of allocation.allocations
  ) {
    if (
      item.expectedAveragePrice === null ||
      item.quantity <= 0
    ) {
      continue;
    }

    totalQuantity += item.quantity;
    totalNotional +=
      item.expectedAveragePrice *
      item.quantity;
  }

  if (totalQuantity <= 0) {
    return null;
  }

  return (
    totalNotional /
    totalQuantity
  );
}

function calculateExpectedWorstPrice(
  request: SmartOrderRoutingRequest,
  allocation:
    SmartOrderRoutingVenueAllocationResult,
): number | null {
  const prices =
    allocation.allocations
      .map(
        (item) =>
          item.expectedWorstPrice,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null &&
          Number.isFinite(value),
      );

  if (prices.length === 0) {
    return null;
  }

  return request.side === "BUY"
    ? Math.max(...prices)
    : Math.min(...prices);
}

function calculateExpectedGrossNotional(
  allocation:
    SmartOrderRoutingVenueAllocationResult,
): number {
  return allocation.allocations.reduce(
    (total, item) => {
      if (
        item.expectedAveragePrice === null
      ) {
        return total;
      }

      return (
        total +
        item.expectedAveragePrice *
          item.quantity
      );
    },
    0,
  );
}

function calculateAllocationTotals(
  allocation:
    SmartOrderRoutingVenueAllocationResult,
): {
  readonly expectedFees: number;
  readonly expectedSlippageCost: number;
  readonly expectedLatencyCost: number;
  readonly expectedTotalCost: number;
} {
  let expectedFees = 0;
  let expectedSlippageCost = 0;
  let expectedLatencyCost = 0;
  let expectedTotalCost = 0;

  for (
    const item
    of allocation.allocations
  ) {
    expectedFees +=
      item.expectedFee;

    expectedSlippageCost +=
      item.expectedSlippageCost;

    expectedTotalCost +=
      item.expectedTotalCost;

    expectedLatencyCost +=
      Math.max(
        0,
        item.expectedTotalCost -
          item.expectedFee -
          item.expectedSlippageCost,
      );
  }

  return Object.freeze({
    expectedFees,
    expectedSlippageCost,
    expectedLatencyCost,
    expectedTotalCost,
  });
}

function hasExpired(
  request: SmartOrderRoutingRequest,
  completedAt: CoordinatorTimestamp,
): boolean {
  return (
    request.expiresAt !== null &&
    completedAt >
      request.expiresAt
  );
}

function determineUnroutableFailure(
  request: SmartOrderRoutingRequest,
  venueScores:
    readonly SmartOrderRoutingVenueScore[],
  allocation:
    SmartOrderRoutingVenueAllocationResult,
  completedAt: CoordinatorTimestamp,
): SmartOrderRoutingFailure {
  if (
    venueScores.length === 0
  ) {
    return createFailure(
      "NO_VENUES_AVAILABLE",
      "No venue estimates were available for smart order routing.",
      completedAt,
      true,
      null,
      Object.freeze({
        routingRequestId:
          request.routingRequestId,
      }),
    );
  }

  const routableScores =
    venueScores.filter(
      (score) =>
        score.routable,
    );

  if (
    routableScores.length === 0
  ) {
    const rejectionReasons =
      venueScores.flatMap(
        (score) =>
          score.rejectionReasons,
      );

    const uniqueReasons =
      Object.freeze(
        [
          ...new Set(
            rejectionReasons,
          ),
        ],
      );

    const failureCode:
      SmartOrderRoutingFailureCode =
      uniqueReasons.includes(
        "MAXIMUM_SLIPPAGE_EXCEEDED",
      )
        ? "SLIPPAGE_LIMIT_EXCEEDED"
        : uniqueReasons.includes(
              "MAXIMUM_FEE_EXCEEDED",
            )
          ? "FEE_LIMIT_EXCEEDED"
          : uniqueReasons.includes(
                "MAXIMUM_LATENCY_EXCEEDED",
              )
            ? "LATENCY_LIMIT_EXCEEDED"
            : uniqueReasons.includes(
                  "LIMIT_PRICE_EXCEEDED",
                )
              ? "PRICE_LIMIT_EXCEEDED"
              : uniqueReasons.includes(
                    "MINIMUM_ALLOCATION_NOT_MET",
                  )
                ? "MINIMUM_ORDER_NOT_MET"
                : "INSUFFICIENT_LIQUIDITY";

    return createFailure(
      failureCode,
      "Every candidate venue was rejected by the routing constraints.",
      completedAt,
      false,
      uniqueReasons,
      Object.freeze({
        rejectionReasonCount:
          uniqueReasons.length,
      }),
    );
  }

  if (
    allocation.allocatedQuantity <= 0 &&
    !request.allowPartialRouting
  ) {
    return createFailure(
      "INSUFFICIENT_LIQUIDITY",
      "Available venue liquidity could not satisfy the complete order and partial routing is disabled.",
      completedAt,
      false,
      null,
      allocation.metadata,
    );
  }

  return createFailure(
    "INSUFFICIENT_LIQUIDITY",
    "The requested quantity could not be allocated to the available venues.",
    completedAt,
    true,
    null,
    allocation.metadata,
  );
}

export class SmartOrderRoutingEngine {
  private readonly liquidityAnalyzer:
    SmartOrderRoutingLiquidityBookAnalyzer;

  private readonly venueScoringEngine:
    SmartOrderRoutingVenueScoringEngine;

  private readonly venueAllocationEngine:
    SmartOrderRoutingVenueAllocationEngine;

  private readonly decisionIdFactory:
    NonNullable<
      SmartOrderRoutingEngineOptions[
        "decisionIdFactory"
      ]
    >;

  public constructor(
    options:
      SmartOrderRoutingEngineOptions =
        {},
  ) {
    this.liquidityAnalyzer =
      options.liquidityAnalyzer ??
      new SmartOrderRoutingLiquidityBookAnalyzer(
        options.liquidityAnalyzerOptions,
      );

    this.venueScoringEngine =
      options.venueScoringEngine ??
      new SmartOrderRoutingVenueScoringEngine(
        options.venueScoringEngineOptions,
      );

    this.venueAllocationEngine =
      options.venueAllocationEngine ??
      new SmartOrderRoutingVenueAllocationEngine(
        options.venueAllocationEngineOptions,
      );

    this.decisionIdFactory =
      options.decisionIdFactory ??
      defaultDecisionIdFactory;
  }

  public route(
    input: SmartOrderRoutingEngineInput,
  ): SmartOrderRoutingDecision {
    const completedAt =
      input.completedAt ??
      input.request.createdAt;

    assertFiniteNonNegative(
      completedAt,
      "completedAt",
    );

    if (
      completedAt <
      input.request.createdAt
    ) {
      throw new Error(
        "completedAt cannot be earlier than the routing request createdAt timestamp.",
      );
    }

    const decisionId =
      this.decisionIdFactory({
        routingRequestId:
          input.request
            .routingRequestId,
        createdAt:
          input.request.createdAt,
        completedAt,
      });

    if (
      hasExpired(
        input.request,
        completedAt,
      )
    ) {
      return createSmartOrderRoutingDecision({
        decisionId,

        routingRequestId:
          input.request
            .routingRequestId,

        status: "FAILED",
        policy:
          input.request.policy,

        requestedQuantity:
          input.request.quantity,

        routedQuantity: 0,

        createdAt:
          input.request.createdAt,

        completedAt,

        failure: createFailure(
          "INVALID_REQUEST",
          "The smart order routing request has expired.",
          completedAt,
          false,
          null,
          Object.freeze({
            expiresAt:
              input.request.expiresAt,
          }),
        ),

        metadata: mergeMetadata(
          input.request.metadata,
          input.metadata,
          Object.freeze({
            venueCount:
              input.venues.length,
            expired: true,
          }),
        ),
      });
    }

    if (
      input.venues.length === 0
    ) {
      return createSmartOrderRoutingDecision({
        decisionId,

        routingRequestId:
          input.request
            .routingRequestId,

        status: "UNROUTABLE",
        policy:
          input.request.policy,

        requestedQuantity:
          input.request.quantity,

        routedQuantity: 0,

        createdAt:
          input.request.createdAt,

        completedAt,

        failure: createFailure(
          "NO_VENUES_AVAILABLE",
          "No venues were provided for smart order routing.",
          completedAt,
          true,
          null,
        ),

        metadata: mergeMetadata(
          input.request.metadata,
          input.metadata,
          Object.freeze({
            venueCount: 0,
          }),
        ),
      });
    }

    try {
      const analysis =
        this.analyzeVenues(
          input.request,
          input.venues,
          completedAt,
        );

      const venueScores =
        this.venueScoringEngine.score({
          request:
            input.request,

          estimates:
            analysis.estimates,

          metadata:
            input.metadata,
        });

      const allocation =
        this.venueAllocationEngine.allocate({
          request:
            input.request,

          estimates:
            analysis.estimates,

          venueScores,

          metadata:
            input.metadata,
        });

      const status =
        determineStatus(
          allocation,
        );

      const totals =
        calculateAllocationTotals(
          allocation,
        );

      const failure =
        status === "UNROUTABLE"
          ? determineUnroutableFailure(
              input.request,
              venueScores,
              allocation,
              completedAt,
            )
          : null;

      return createSmartOrderRoutingDecision({
        decisionId,

        routingRequestId:
          input.request
            .routingRequestId,

        status,
        policy:
          input.request.policy,

        requestedQuantity:
          input.request.quantity,

        routedQuantity:
          allocation.allocatedQuantity,

        expectedAveragePrice:
          calculateExpectedAveragePrice(
            allocation,
          ),

        expectedWorstPrice:
          calculateExpectedWorstPrice(
            input.request,
            allocation,
          ),

        expectedGrossNotional:
          calculateExpectedGrossNotional(
            allocation,
          ),

        expectedFees:
          totals.expectedFees,

        expectedSlippageCost:
          totals.expectedSlippageCost,

        expectedLatencyCost:
          totals.expectedLatencyCost,

        expectedTotalCost:
          totals.expectedTotalCost,

        allocations:
          allocation.allocations,

        venueScores,

        createdAt:
          input.request.createdAt,

        completedAt,

        failure,

        metadata: mergeMetadata(
          input.request.metadata,
          allocation.metadata,
          input.metadata,
          Object.freeze({
            suppliedVenueCount:
              input.venues.length,

            analyzedVenueCount:
              analysis.estimates.length,

            rejectedDuringAnalysis:
              analysis.rejectedVenueCount,

            analysisErrorCount:
              analysis.errors.length,

            allocationCount:
              allocation.allocations
                .length,

            complete:
              allocation.complete,
          }),
        ),
      });
    } catch (error) {
      return createSmartOrderRoutingDecision({
        decisionId,

        routingRequestId:
          input.request
            .routingRequestId,

        status: "FAILED",
        policy:
          input.request.policy,

        requestedQuantity:
          input.request.quantity,

        routedQuantity: 0,

        createdAt:
          input.request.createdAt,

        completedAt,

        failure: createFailure(
          "INTERNAL_ROUTING_ERROR",
          error instanceof Error
            ? error.message
            : "An unknown smart order routing error occurred.",
          completedAt,
          false,
          error,
        ),

        metadata: mergeMetadata(
          input.request.metadata,
          input.metadata,
          Object.freeze({
            suppliedVenueCount:
              input.venues.length,
          }),
        ),
      });
    }
  }

  private analyzeVenues(
    request: SmartOrderRoutingRequest,
    venues:
      readonly SmartOrderRoutingVenueInput[],
    now: CoordinatorTimestamp,
  ): VenueAnalysisResult {
    const estimates:
      SmartOrderRoutingVenueCostEstimate[] =
      [];

    const errors: string[] = [];

    let rejectedVenueCount = 0;

    for (
      const venue of venues
    ) {
      try {
        const estimate =
          this.liquidityAnalyzer.analyze(
            {
              request,
              quote:
                venue.quote,
              liquidity:
                venue.liquidity,
              metadata:
                venue.metadata,
            },
            now,
          );

        estimates.push(
          estimate,
        );
      } catch (error) {
        rejectedVenueCount += 1;

        errors.push(
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    }

    return Object.freeze({
      estimates:
        Object.freeze(
          estimates,
        ),

      rejectedVenueCount,

      errors:
        Object.freeze(
          errors,
        ),
    });
  }
}

export function createSmartOrderRoutingEngine(
  options:
    SmartOrderRoutingEngineOptions =
      {},
): SmartOrderRoutingEngine {
  return new SmartOrderRoutingEngine(
    options,
  );
}