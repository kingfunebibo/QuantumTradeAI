import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorOrderType,
  CoordinatorSymbol,
  CoordinatorTimeInForce,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorRequestId,
} from "../multi-exchange-coordination/coordinator-contracts";

export type SmartOrderRoutingRequestId = string;
export type SmartOrderRoutingDecisionId = string;
export type SmartOrderRoutingAllocationId = string;
export type SmartOrderRoutingQuoteId = string;

export type SmartOrderRoutingStatus =
  | "PENDING"
  | "ROUTABLE"
  | "PARTIALLY_ROUTABLE"
  | "UNROUTABLE"
  | "COMPLETED"
  | "FAILED";

export type SmartOrderRoutingFailureCode =
  | "INVALID_REQUEST"
  | "NO_VENUES_AVAILABLE"
  | "INSUFFICIENT_LIQUIDITY"
  | "PRICE_LIMIT_EXCEEDED"
  | "SLIPPAGE_LIMIT_EXCEEDED"
  | "FEE_LIMIT_EXCEEDED"
  | "LATENCY_LIMIT_EXCEEDED"
  | "MINIMUM_ORDER_NOT_MET"
  | "MAXIMUM_VENUE_COUNT_EXCEEDED"
  | "ROUTING_POLICY_REJECTED"
  | "INTERNAL_ROUTING_ERROR";

export type SmartOrderRoutingPolicy =
  | "BEST_PRICE"
  | "BEST_EFFECTIVE_PRICE"
  | "LOWEST_FEES"
  | "LOWEST_SLIPPAGE"
  | "LOWEST_LATENCY"
  | "HIGHEST_LIQUIDITY"
  | "BALANCED";

export type SmartOrderRoutingLiquiditySide =
  | "BID"
  | "ASK";

export interface SmartOrderRoutingRequest {
  readonly routingRequestId: SmartOrderRoutingRequestId;
  readonly coordinatorRequestId:
    MultiExchangeCoordinatorRequestId | null;

  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;
  readonly timeInForce: CoordinatorTimeInForce | null;

  readonly quantity: number;
  readonly limitPrice: number | null;
  readonly stopPrice: number | null;

  readonly policy: SmartOrderRoutingPolicy;

  readonly allowPartialRouting: boolean;
  readonly maximumVenueCount: number | null;

  readonly maximumSlippageBps: number | null;
  readonly maximumFeeBps: number | null;
  readonly maximumLatencyMilliseconds: number | null;

  readonly minimumAllocationQuantity: number | null;

  readonly createdAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueQuote {
  readonly quoteId: SmartOrderRoutingQuoteId;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;

  readonly bestBidPrice: number | null;
  readonly bestBidQuantity: number;

  readonly bestAskPrice: number | null;
  readonly bestAskQuantity: number;

  readonly referencePrice: number | null;

  readonly makerFeeBps: number;
  readonly takerFeeBps: number;

  readonly estimatedLatencyMilliseconds: number;

  readonly receivedAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingLiquidityLevel {
  readonly price: number;
  readonly quantity: number;
  readonly cumulativeQuantity: number;
  readonly cumulativeNotional: number;
}

export interface SmartOrderRoutingLiquiditySnapshot {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: SmartOrderRoutingLiquiditySide;

  readonly levels:
    readonly SmartOrderRoutingLiquidityLevel[];

  readonly totalQuantity: number;
  readonly totalNotional: number;

  readonly capturedAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueCostEstimate {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly requestedQuantity: number;
  readonly executableQuantity: number;

  readonly averageExecutionPrice: number | null;
  readonly worstExecutionPrice: number | null;

  readonly grossNotional: number;

  readonly feeBps: number;
  readonly estimatedFee: number;

  readonly slippageBps: number;
  readonly estimatedSlippageCost: number;

  readonly estimatedLatencyMilliseconds: number;
  readonly estimatedLatencyCost: number;

  readonly totalEstimatedCost: number;
  readonly effectiveUnitPrice: number | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueScore {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly priceScore: number;
  readonly liquidityScore: number;
  readonly feeScore: number;
  readonly slippageScore: number;
  readonly latencyScore: number;

  readonly totalScore: number;
  readonly rank: number;

  readonly routable: boolean;
  readonly rejectionReasons: readonly string[];

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingAllocation {
  readonly allocationId:
    SmartOrderRoutingAllocationId;

  readonly routingRequestId:
    SmartOrderRoutingRequestId;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly quantity: number;
  readonly percentage: number;

  readonly orderType: CoordinatorOrderType;
  readonly timeInForce: CoordinatorTimeInForce | null;

  readonly limitPrice: number | null;
  readonly stopPrice: number | null;

  readonly expectedAveragePrice: number | null;
  readonly expectedWorstPrice: number | null;

  readonly expectedFee: number;
  readonly expectedSlippageCost: number;
  readonly expectedLatencyMilliseconds: number;
  readonly expectedTotalCost: number;

  readonly rank: number;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingFailure {
  readonly code: SmartOrderRoutingFailureCode;
  readonly message: string;
  readonly retryable: boolean;

  readonly occurredAt: CoordinatorTimestamp;
  readonly cause: unknown;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingDecision {
  readonly decisionId:
    SmartOrderRoutingDecisionId;

  readonly routingRequestId:
    SmartOrderRoutingRequestId;

  readonly status: SmartOrderRoutingStatus;
  readonly policy: SmartOrderRoutingPolicy;

  readonly requestedQuantity: number;
  readonly routedQuantity: number;
  readonly unroutedQuantity: number;

  readonly expectedAveragePrice: number | null;
  readonly expectedWorstPrice: number | null;

  readonly expectedGrossNotional: number;
  readonly expectedFees: number;
  readonly expectedSlippageCost: number;
  readonly expectedLatencyCost: number;
  readonly expectedTotalCost: number;

  readonly allocations:
    readonly SmartOrderRoutingAllocation[];

  readonly venueScores:
    readonly SmartOrderRoutingVenueScore[];

  readonly createdAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;

  readonly failure: SmartOrderRoutingFailure | null;
  readonly metadata: CoordinatorMetadata;
}

export interface CreateSmartOrderRoutingRequestInput {
  readonly routingRequestId: SmartOrderRoutingRequestId;
  readonly coordinatorRequestId?:
    MultiExchangeCoordinatorRequestId | null;

  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;
  readonly timeInForce?: CoordinatorTimeInForce | null;

  readonly quantity: number;
  readonly limitPrice?: number | null;
  readonly stopPrice?: number | null;

  readonly policy?: SmartOrderRoutingPolicy;

  readonly allowPartialRouting?: boolean;
  readonly maximumVenueCount?: number | null;

  readonly maximumSlippageBps?: number | null;
  readonly maximumFeeBps?: number | null;
  readonly maximumLatencyMilliseconds?: number | null;

  readonly minimumAllocationQuantity?: number | null;

  readonly createdAt: CoordinatorTimestamp;
  readonly expiresAt?: CoordinatorTimestamp | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface CreateSmartOrderRoutingVenueQuoteInput {
  readonly quoteId: SmartOrderRoutingQuoteId;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;

  readonly bestBidPrice?: number | null;
  readonly bestBidQuantity?: number;

  readonly bestAskPrice?: number | null;
  readonly bestAskQuantity?: number;

  readonly referencePrice?: number | null;

  readonly makerFeeBps?: number;
  readonly takerFeeBps?: number;

  readonly estimatedLatencyMilliseconds?: number;

  readonly receivedAt: CoordinatorTimestamp;
  readonly expiresAt?: CoordinatorTimestamp | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface CreateSmartOrderRoutingLiquiditySnapshotInput {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: SmartOrderRoutingLiquiditySide;

  readonly levels:
    readonly SmartOrderRoutingLiquidityLevel[];

  readonly capturedAt: CoordinatorTimestamp;
  readonly expiresAt?: CoordinatorTimestamp | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface CreateSmartOrderRoutingDecisionInput {
  readonly decisionId:
    SmartOrderRoutingDecisionId;

  readonly routingRequestId:
    SmartOrderRoutingRequestId;

  readonly status: SmartOrderRoutingStatus;
  readonly policy: SmartOrderRoutingPolicy;

  readonly requestedQuantity: number;
  readonly routedQuantity: number;

  readonly expectedAveragePrice?: number | null;
  readonly expectedWorstPrice?: number | null;

  readonly expectedGrossNotional?: number;
  readonly expectedFees?: number;
  readonly expectedSlippageCost?: number;
  readonly expectedLatencyCost?: number;
  readonly expectedTotalCost?: number;

  readonly allocations?:
    readonly SmartOrderRoutingAllocation[];

  readonly venueScores?:
    readonly SmartOrderRoutingVenueScore[];

  readonly createdAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;

  readonly failure?: SmartOrderRoutingFailure | null;
  readonly metadata?: CoordinatorMetadata;
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

function assertFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${fieldName} must be finite.`,
    );
  }
}

function assertNonNegativeNumber(
  value: number,
  fieldName: string,
): void {
  assertFiniteNumber(value, fieldName);

  if (value < 0) {
    throw new Error(
      `${fieldName} must not be negative.`,
    );
  }
}

function assertPositiveNumber(
  value: number,
  fieldName: string,
): void {
  assertFiniteNumber(value, fieldName);

  if (value <= 0) {
    throw new Error(
      `${fieldName} must be greater than zero.`,
    );
  }
}

function assertOptionalNonNegativeNumber(
  value: number | null | undefined,
  fieldName: string,
): void {
  if (value === null || value === undefined) {
    return;
  }

  assertNonNegativeNumber(
    value,
    fieldName,
  );
}

function assertTimestampRange(
  start: CoordinatorTimestamp,
  end: CoordinatorTimestamp | null,
  startFieldName: string,
  endFieldName: string,
): void {
  assertNonNegativeNumber(
    start,
    startFieldName,
  );

  if (end === null) {
    return;
  }

  assertNonNegativeNumber(
    end,
    endFieldName,
  );

  if (end < start) {
    throw new Error(
      `${endFieldName} cannot be earlier than ${startFieldName}.`,
    );
  }
}

function cloneMetadata(
  metadata:
    | CoordinatorMetadata
    | undefined,
): CoordinatorMetadata {
  const clone: Record<
    string,
    CoordinatorMetadataValue
  > = {};

  if (metadata !== undefined) {
    for (
      const [key, value]
      of Object.entries(metadata)
    ) {
      clone[key] = value;
    }
  }

  return Object.freeze(clone);
}

function freezeStringArray(
  values: readonly string[],
): readonly string[] {
  return Object.freeze([
    ...values,
  ]);
}

function freezeAllocations(
  allocations:
    readonly SmartOrderRoutingAllocation[],
): readonly SmartOrderRoutingAllocation[] {
  return Object.freeze(
    allocations.map(
      (allocation) =>
        Object.freeze({
          ...allocation,
          metadata: cloneMetadata(
            allocation.metadata,
          ),
        }),
    ),
  );
}

function freezeVenueScores(
  venueScores:
    readonly SmartOrderRoutingVenueScore[],
): readonly SmartOrderRoutingVenueScore[] {
  return Object.freeze(
    venueScores.map(
      (score) =>
        Object.freeze({
          ...score,
          rejectionReasons:
            freezeStringArray(
              score.rejectionReasons,
            ),
          metadata: cloneMetadata(
            score.metadata,
          ),
        }),
    ),
  );
}

export function createSmartOrderRoutingRequest(
  input: CreateSmartOrderRoutingRequestInput,
): SmartOrderRoutingRequest {
  assertNonEmptyString(
    input.routingRequestId,
    "routingRequestId",
  );

  assertNonEmptyString(
    input.symbol,
    "symbol",
  );

  assertPositiveNumber(
    input.quantity,
    "quantity",
  );

  assertOptionalNonNegativeNumber(
    input.limitPrice,
    "limitPrice",
  );

  assertOptionalNonNegativeNumber(
    input.stopPrice,
    "stopPrice",
  );

  assertOptionalNonNegativeNumber(
    input.maximumSlippageBps,
    "maximumSlippageBps",
  );

  assertOptionalNonNegativeNumber(
    input.maximumFeeBps,
    "maximumFeeBps",
  );

  assertOptionalNonNegativeNumber(
    input.maximumLatencyMilliseconds,
    "maximumLatencyMilliseconds",
  );

  assertOptionalNonNegativeNumber(
    input.minimumAllocationQuantity,
    "minimumAllocationQuantity",
  );

  if (
    input.maximumVenueCount !== null &&
    input.maximumVenueCount !== undefined
  ) {
    if (
      !Number.isInteger(
        input.maximumVenueCount,
      ) ||
      input.maximumVenueCount <= 0
    ) {
      throw new Error(
        "maximumVenueCount must be a positive integer.",
      );
    }
  }

  assertTimestampRange(
    input.createdAt,
    input.expiresAt ?? null,
    "createdAt",
    "expiresAt",
  );

  return Object.freeze({
    routingRequestId:
      input.routingRequestId,

    coordinatorRequestId:
      input.coordinatorRequestId ??
      null,

    symbol: input.symbol,
    side: input.side,
    orderType: input.orderType,
    timeInForce:
      input.timeInForce ?? null,

    quantity: input.quantity,
    limitPrice:
      input.limitPrice ?? null,
    stopPrice:
      input.stopPrice ?? null,

    policy:
      input.policy ?? "BALANCED",

    allowPartialRouting:
      input.allowPartialRouting ??
      false,

    maximumVenueCount:
      input.maximumVenueCount ??
      null,

    maximumSlippageBps:
      input.maximumSlippageBps ??
      null,

    maximumFeeBps:
      input.maximumFeeBps ??
      null,

    maximumLatencyMilliseconds:
      input.maximumLatencyMilliseconds ??
      null,

    minimumAllocationQuantity:
      input.minimumAllocationQuantity ??
      null,

    createdAt: input.createdAt,
    expiresAt:
      input.expiresAt ?? null,

    metadata: cloneMetadata(
      input.metadata,
    ),
  });
}

export function createSmartOrderRoutingVenueQuote(
  input: CreateSmartOrderRoutingVenueQuoteInput,
): SmartOrderRoutingVenueQuote {
  assertNonEmptyString(
    input.quoteId,
    "quoteId",
  );

  assertNonEmptyString(
    input.exchangeId,
    "exchangeId",
  );

  assertNonEmptyString(
    input.accountId,
    "accountId",
  );

  assertNonEmptyString(
    input.symbol,
    "symbol",
  );

  assertNonEmptyString(
    input.exchangeSymbol,
    "exchangeSymbol",
  );

  assertOptionalNonNegativeNumber(
    input.bestBidPrice,
    "bestBidPrice",
  );

  assertOptionalNonNegativeNumber(
    input.bestAskPrice,
    "bestAskPrice",
  );

  assertOptionalNonNegativeNumber(
    input.referencePrice,
    "referencePrice",
  );

  assertNonNegativeNumber(
    input.bestBidQuantity ?? 0,
    "bestBidQuantity",
  );

  assertNonNegativeNumber(
    input.bestAskQuantity ?? 0,
    "bestAskQuantity",
  );

  assertNonNegativeNumber(
    input.makerFeeBps ?? 0,
    "makerFeeBps",
  );

  assertNonNegativeNumber(
    input.takerFeeBps ?? 0,
    "takerFeeBps",
  );

  assertNonNegativeNumber(
    input.estimatedLatencyMilliseconds ??
      0,
    "estimatedLatencyMilliseconds",
  );

  assertTimestampRange(
    input.receivedAt,
    input.expiresAt ?? null,
    "receivedAt",
    "expiresAt",
  );

  return Object.freeze({
    quoteId: input.quoteId,

    exchangeId: input.exchangeId,
    accountId: input.accountId,

    symbol: input.symbol,
    exchangeSymbol:
      input.exchangeSymbol,

    side: input.side,

    bestBidPrice:
      input.bestBidPrice ?? null,

    bestBidQuantity:
      input.bestBidQuantity ?? 0,

    bestAskPrice:
      input.bestAskPrice ?? null,

    bestAskQuantity:
      input.bestAskQuantity ?? 0,

    referencePrice:
      input.referencePrice ?? null,

    makerFeeBps:
      input.makerFeeBps ?? 0,

    takerFeeBps:
      input.takerFeeBps ?? 0,

    estimatedLatencyMilliseconds:
      input.estimatedLatencyMilliseconds ??
      0,

    receivedAt: input.receivedAt,
    expiresAt:
      input.expiresAt ?? null,

    metadata: cloneMetadata(
      input.metadata,
    ),
  });
}

export function createSmartOrderRoutingLiquiditySnapshot(
  input: CreateSmartOrderRoutingLiquiditySnapshotInput,
): SmartOrderRoutingLiquiditySnapshot {
  assertNonEmptyString(
    input.exchangeId,
    "exchangeId",
  );

  assertNonEmptyString(
    input.accountId,
    "accountId",
  );

  assertNonEmptyString(
    input.symbol,
    "symbol",
  );

  assertNonEmptyString(
    input.exchangeSymbol,
    "exchangeSymbol",
  );

  assertTimestampRange(
    input.capturedAt,
    input.expiresAt ?? null,
    "capturedAt",
    "expiresAt",
  );

  let cumulativeQuantity = 0;
  let cumulativeNotional = 0;

  const levels =
    input.levels.map(
      (level, index) => {
        assertPositiveNumber(
          level.price,
          `levels[${index}].price`,
        );

        assertPositiveNumber(
          level.quantity,
          `levels[${index}].quantity`,
        );

        cumulativeQuantity +=
          level.quantity;

        cumulativeNotional +=
          level.price *
          level.quantity;

        return Object.freeze({
          price: level.price,
          quantity: level.quantity,
          cumulativeQuantity,
          cumulativeNotional,
        });
      },
    );

  return Object.freeze({
    exchangeId: input.exchangeId,
    accountId: input.accountId,

    symbol: input.symbol,
    exchangeSymbol:
      input.exchangeSymbol,

    side: input.side,

    levels: Object.freeze(levels),

    totalQuantity:
      cumulativeQuantity,

    totalNotional:
      cumulativeNotional,

    capturedAt: input.capturedAt,
    expiresAt:
      input.expiresAt ?? null,

    metadata: cloneMetadata(
      input.metadata,
    ),
  });
}

export function createSmartOrderRoutingDecision(
  input: CreateSmartOrderRoutingDecisionInput,
): SmartOrderRoutingDecision {
  assertNonEmptyString(
    input.decisionId,
    "decisionId",
  );

  assertNonEmptyString(
    input.routingRequestId,
    "routingRequestId",
  );

  assertNonNegativeNumber(
    input.requestedQuantity,
    "requestedQuantity",
  );

  assertNonNegativeNumber(
    input.routedQuantity,
    "routedQuantity",
  );

  if (
    input.routedQuantity >
    input.requestedQuantity
  ) {
    throw new Error(
      "routedQuantity cannot exceed requestedQuantity.",
    );
  }

  assertOptionalNonNegativeNumber(
    input.expectedAveragePrice,
    "expectedAveragePrice",
  );

  assertOptionalNonNegativeNumber(
    input.expectedWorstPrice,
    "expectedWorstPrice",
  );

  assertNonNegativeNumber(
    input.expectedGrossNotional ?? 0,
    "expectedGrossNotional",
  );

  assertNonNegativeNumber(
    input.expectedFees ?? 0,
    "expectedFees",
  );

  assertNonNegativeNumber(
    input.expectedSlippageCost ?? 0,
    "expectedSlippageCost",
  );

  assertNonNegativeNumber(
    input.expectedLatencyCost ?? 0,
    "expectedLatencyCost",
  );

  assertNonNegativeNumber(
    input.expectedTotalCost ?? 0,
    "expectedTotalCost",
  );

  if (
    input.completedAt <
    input.createdAt
  ) {
    throw new Error(
      "completedAt cannot be earlier than createdAt.",
    );
  }

  return Object.freeze({
    decisionId: input.decisionId,
    routingRequestId:
      input.routingRequestId,

    status: input.status,
    policy: input.policy,

    requestedQuantity:
      input.requestedQuantity,

    routedQuantity:
      input.routedQuantity,

    unroutedQuantity: Math.max(
      0,
      input.requestedQuantity -
        input.routedQuantity,
    ),

    expectedAveragePrice:
      input.expectedAveragePrice ??
      null,

    expectedWorstPrice:
      input.expectedWorstPrice ??
      null,

    expectedGrossNotional:
      input.expectedGrossNotional ??
      0,

    expectedFees:
      input.expectedFees ?? 0,

    expectedSlippageCost:
      input.expectedSlippageCost ??
      0,

    expectedLatencyCost:
      input.expectedLatencyCost ??
      0,

    expectedTotalCost:
      input.expectedTotalCost ??
      0,

    allocations:
      freezeAllocations(
        input.allocations ?? [],
      ),

    venueScores:
      freezeVenueScores(
        input.venueScores ?? [],
      ),

    createdAt: input.createdAt,
    completedAt:
      input.completedAt,

    failure:
      input.failure === null ||
      input.failure === undefined
        ? null
        : Object.freeze({
            ...input.failure,
            metadata: cloneMetadata(
              input.failure.metadata,
            ),
          }),

    metadata: cloneMetadata(
      input.metadata,
    ),
  });
}