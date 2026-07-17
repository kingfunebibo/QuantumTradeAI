/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 1:
 * Live Order Domain Model
 *
 * Immutable live-order domain primitives, lifecycle transitions, routing,
 * exchange acceptance, fill application, fee aggregation, failure recording,
 * and invariant validation.
 */

export type LiveOrderId = string;
export type ClientOrderId = string;
export type ExchangeOrderId = string;
export type LiveOrderExchangeId = string;
export type LiveOrderSymbol = string;
export type LiveOrderAccountId = string;
export type LiveOrderStrategyId = string;
export type LiveOrderSignalId = string;
export type LiveOrderFillId = string;
export type LiveOrderAsset = string;

export type LiveOrderSide = "BUY" | "SELL";

export type LiveOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_LIMIT"
  | "TRAILING_STOP";

export type LiveOrderTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "POST_ONLY"
  | "GTD";

export type LiveOrderState =
  | "NEW"
  | "VALIDATED"
  | "ROUTING"
  | "ROUTED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "SETTLING"
  | "SETTLED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "REPLACE_PENDING"
  | "REPLACED"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED"
  | "RECOVERING"
  | "UNKNOWN";

export type LiveOrderTerminalState =
  | "SETTLED"
  | "CANCELLED"
  | "REPLACED"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED";

export type LiveOrderLiquidityRole =
  | "MAKER"
  | "TAKER"
  | "UNKNOWN";

export type LiveOrderOrigin =
  | "STRATEGY"
  | "MANUAL"
  | "RECOVERY"
  | "RECONCILIATION"
  | "SYSTEM";

export type LiveOrderFailureCategory =
  | "VALIDATION"
  | "RISK"
  | "ROUTING"
  | "CONNECTIVITY"
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "EXCHANGE_REJECTION"
  | "TIMEOUT"
  | "RECONCILIATION"
  | "INTERNAL"
  | "UNKNOWN";

export interface LiveOrderMoney {
  readonly amount: number;
  readonly asset: LiveOrderAsset;
}

export interface LiveOrderFee {
  readonly asset: LiveOrderAsset;
  readonly amount: number;
}

export interface LiveOrderFill {
  readonly fillId: LiveOrderFillId;
  readonly exchangeTradeId?: string;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly quantity: number;
  readonly price: number;
  readonly quoteQuantity: number;
  readonly liquidityRole: LiveOrderLiquidityRole;
  readonly fees: readonly LiveOrderFee[];
  readonly executedAt: number;
  readonly receivedAt: number;
  readonly sequence?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderFailure {
  readonly category: LiveOrderFailureCategory;
  readonly code: string;
  readonly message: string;
  readonly occurredAt: number;
  readonly retryable: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderStateTransition {
  readonly transitionId: number;
  readonly from: LiveOrderState;
  readonly to: LiveOrderState;
  readonly occurredAt: number;
  readonly reason?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderRoutingDecision {
  readonly exchangeId: LiveOrderExchangeId;
  readonly connectionId?: string;
  readonly routeId?: string;
  readonly selectedAt: number;
  readonly score?: number;
  readonly reason?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderRequest {
  readonly orderId: LiveOrderId;
  readonly clientOrderId: ClientOrderId;
  readonly idempotencyKey: string;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly accountId?: LiveOrderAccountId;
  readonly strategyId?: LiveOrderStrategyId;
  readonly signalId?: LiveOrderSignalId;
  readonly symbol: LiveOrderSymbol;
  readonly side: LiveOrderSide;
  readonly type: LiveOrderType;
  readonly timeInForce?: LiveOrderTimeInForce;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly trailingOffset?: number;
  readonly quoteOrderQuantity?: number;
  readonly reduceOnly?: boolean;
  readonly postOnly?: boolean;
  readonly closePosition?: boolean;
  readonly expiresAt?: number;
  readonly origin?: LiveOrderOrigin;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LiveOrder {
  readonly orderId: LiveOrderId;
  readonly clientOrderId: ClientOrderId;
  readonly idempotencyKey: string;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly strategyId?: LiveOrderStrategyId;
  readonly signalId?: LiveOrderSignalId;
  readonly symbol: LiveOrderSymbol;
  readonly side: LiveOrderSide;
  readonly type: LiveOrderType;
  readonly timeInForce?: LiveOrderTimeInForce;
  readonly origin: LiveOrderOrigin;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly quoteOrderQuantity?: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly trailingOffset?: number;
  readonly averageFillPrice?: number;
  readonly cumulativeQuoteQuantity: number;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly closePosition: boolean;
  readonly state: LiveOrderState;
  readonly version: number;
  readonly fills: readonly LiveOrderFill[];
  readonly fees: readonly LiveOrderFee[];
  readonly failures: readonly LiveOrderFailure[];
  readonly transitions: readonly LiveOrderStateTransition[];
  readonly routingDecision?: LiveOrderRoutingDecision;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly validatedAt?: number;
  readonly routedAt?: number;
  readonly submittedAt?: number;
  readonly acceptedAt?: number;
  readonly firstFillAt?: number;
  readonly lastFillAt?: number;
  readonly filledAt?: number;
  readonly settledAt?: number;
  readonly cancelledAt?: number;
  readonly rejectedAt?: number;
  readonly expiredAt?: number;
  readonly failedAt?: number;
  readonly recoveryStartedAt?: number;
  readonly expiresAt?: number;
  readonly lastReason?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderTransitionRequest {
  readonly state: LiveOrderState;
  readonly occurredAt: number;
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LiveOrderExchangeAcceptance {
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId: ExchangeOrderId;
  readonly acceptedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LiveOrderFillApplication {
  readonly fill: LiveOrderFill;
  readonly occurredAt?: number;
}

export interface LiveOrderFailureApplication {
  readonly failure: LiveOrderFailure;
  readonly transitionToFailed?: boolean;
}

export interface LiveOrderRoutingApplication {
  readonly decision: LiveOrderRoutingDecision;
}

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const TERMINAL_STATES: ReadonlySet<LiveOrderState> =
  new Set<LiveOrderState>([
    "SETTLED",
    "CANCELLED",
    "REPLACED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
  ]);

function transitionStates(
  ...states: readonly LiveOrderState[]
): readonly LiveOrderState[] {
  return Object.freeze([...states]);
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<
    LiveOrderState,
    readonly LiveOrderState[]
  >
> = Object.freeze({
  NEW: transitionStates(
    "VALIDATED",
    "REJECTED",
    "FAILED",
  ),

  VALIDATED: transitionStates(
    "ROUTING",
    "ROUTED",
    "REJECTED",
    "FAILED",
  ),

  ROUTING: transitionStates(
    "ROUTED",
    "REJECTED",
    "FAILED",
    "RECOVERING",
  ),

  ROUTED: transitionStates(
    "SUBMITTING",
    "SUBMITTED",
    "REJECTED",
    "FAILED",
    "RECOVERING",
  ),

  SUBMITTING: transitionStates(
    "SUBMITTED",
    "ACCEPTED",
    "REJECTED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  SUBMITTED: transitionStates(
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "REJECTED",
    "EXPIRED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  ACCEPTED: transitionStates(
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "REPLACE_PENDING",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  PARTIALLY_FILLED: transitionStates(
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "REPLACE_PENDING",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  FILLED: transitionStates(
    "SETTLING",
    "SETTLED",
    "FAILED",
    "RECOVERING",
  ),

  SETTLING: transitionStates(
    "SETTLED",
    "FAILED",
    "RECOVERING",
  ),

  SETTLED: transitionStates(),

  CANCEL_PENDING: transitionStates(
    "CANCELLED",
    "PARTIALLY_FILLED",
    "FILLED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  CANCELLED: transitionStates(),

  REPLACE_PENDING: transitionStates(
    "REPLACED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "FAILED",
    "UNKNOWN",
    "RECOVERING",
  ),

  REPLACED: transitionStates(),

  REJECTED: transitionStates(),

  EXPIRED: transitionStates(),

  FAILED: transitionStates(
    "RECOVERING",
  ),

  RECOVERING: transitionStates(
    "ROUTED",
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
    "UNKNOWN",
  ),

  UNKNOWN: transitionStates(
    "RECOVERING",
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
  ),
});

export class LiveOrderError extends Error {
  public readonly code: string;
  public readonly orderId?: LiveOrderId;
  public readonly state?: LiveOrderState;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly orderId?: LiveOrderId;
      readonly state?: LiveOrderState;
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: context?.cause });
    this.name = "LiveOrderError";
    this.code = code;
    this.orderId = context?.orderId;
    this.state = context?.state;
  }
}

export function createLiveOrder(
  request: LiveOrderRequest,
): LiveOrder {
  validateLiveOrderRequest(request);

  const createdAt = validateTimestamp(
    request.createdAt,
    "request.createdAt",
  );

  return freezeLiveOrder({
    orderId: normalizeIdentifier(
      request.orderId,
      "request.orderId",
    ),
    clientOrderId: normalizeIdentifier(
      request.clientOrderId,
      "request.clientOrderId",
    ),
    idempotencyKey: normalizeIdentifier(
      request.idempotencyKey,
      "request.idempotencyKey",
    ),
    exchangeId:
      request.exchangeId === undefined
        ? undefined
        : normalizeExchangeId(request.exchangeId),
    accountId:
      request.accountId === undefined
        ? undefined
        : normalizeIdentifier(
            request.accountId,
            "request.accountId",
          ),
    strategyId:
      request.strategyId === undefined
        ? undefined
        : normalizeIdentifier(
            request.strategyId,
            "request.strategyId",
          ),
    signalId:
      request.signalId === undefined
        ? undefined
        : normalizeIdentifier(
            request.signalId,
            "request.signalId",
          ),
    symbol: normalizeSymbol(request.symbol),
    side: request.side,
    type: request.type,
    timeInForce: request.timeInForce,
    origin: request.origin ?? "SYSTEM",
    requestedQuantity: request.quantity,
    filledQuantity: 0,
    remainingQuantity: request.quantity,
    quoteOrderQuantity: request.quoteOrderQuantity,
    limitPrice: request.limitPrice,
    stopPrice: request.stopPrice,
    trailingOffset: request.trailingOffset,
    cumulativeQuoteQuantity: 0,
    reduceOnly: request.reduceOnly ?? false,
    postOnly: request.postOnly ?? false,
    closePosition: request.closePosition ?? false,
    state: "NEW",
    version: 1,
    fills: Object.freeze([]),
    fees: Object.freeze([]),
    failures: Object.freeze([]),
    transitions: Object.freeze([
      Object.freeze({
        transitionId: 1,
        from: "NEW",
        to: "NEW",
        occurredAt: createdAt,
        reason: "Live order created.",
        metadata: EMPTY_METADATA,
      }),
    ]),
    createdAt,
    updatedAt: createdAt,
    expiresAt: request.expiresAt,
    lastReason: "Live order created.",
    metadata:
      request.metadata === undefined
        ? EMPTY_METADATA
        : freezeRecord(request.metadata),
  });
}

export function isLiveOrderTerminal(
  order: LiveOrder,
): boolean {
  validateLiveOrder(order);
  return TERMINAL_STATES.has(order.state);
}

export function hasLiveOrderFills(
  order: LiveOrder,
): boolean {
  validateLiveOrder(order);
  return order.filledQuantity > 0;
}

export function isLiveOrderFullyFilled(
  order: LiveOrder,
): boolean {
  validateLiveOrder(order);
  return (
    order.filledQuantity >= order.requestedQuantity
  );
}

export function transitionLiveOrder(
  order: LiveOrder,
  request: LiveOrderTransitionRequest,
): LiveOrder {
  validateLiveOrder(order);
  validateTransitionRequest(request);

  const occurredAt = validateMonotonicTimestamp(
    request.occurredAt,
    order.updatedAt,
    "request.occurredAt",
    order.orderId,
  );

  if (request.state === order.state) {
    if (request.state !== "PARTIALLY_FILLED") {
      throw new LiveOrderError(
        "REDUNDANT_ORDER_TRANSITION",
        `Order "${order.orderId}" is already in state "${request.state}".`,
        {
          orderId: order.orderId,
          state: order.state,
        },
      );
    }
  } else if (
    !ALLOWED_TRANSITIONS[order.state].includes(
      request.state,
    )
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_TRANSITION",
      `Order "${order.orderId}" cannot transition from "${order.state}" to "${request.state}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  validateStateQuantityConsistency(
    request.state,
    order.filledQuantity,
    order.requestedQuantity,
    order.orderId,
  );

  const reason = normalizeOptionalText(request.reason);

  return freezeLiveOrder({
    ...order,
    ...deriveStateTimestampFields(
      request.state,
      occurredAt,
    ),
    state: request.state,
    version: order.version + 1,
    updatedAt: occurredAt,
    lastReason: reason,
    transitions: Object.freeze([
      ...order.transitions,
      Object.freeze({
        transitionId: order.transitions.length + 1,
        from: order.state,
        to: request.state,
        occurredAt,
        reason,
        metadata:
          request.metadata === undefined
            ? EMPTY_METADATA
            : freezeRecord(request.metadata),
      }),
    ]),
  });
}

export function applyLiveOrderRouting(
  order: LiveOrder,
  application: LiveOrderRoutingApplication,
): LiveOrder {
  validateLiveOrder(order);
  validateRoutingDecision(application.decision);

  if (
    order.state !== "VALIDATED" &&
    order.state !== "ROUTING" &&
    order.state !== "RECOVERING"
  ) {
    throw new LiveOrderError(
      "ORDER_NOT_ROUTABLE",
      `Order "${order.orderId}" cannot receive a routing decision while in state "${order.state}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const decision =
    freezeRoutingDecision(application.decision);

  const updated = freezeLiveOrder({
    ...order,
    exchangeId: decision.exchangeId,
    routingDecision: decision,
    version: order.version + 1,
    updatedAt: validateMonotonicTimestamp(
      decision.selectedAt,
      order.updatedAt,
      "decision.selectedAt",
      order.orderId,
    ),
  });

  return transitionLiveOrder(updated, {
    state: "ROUTED",
    occurredAt: decision.selectedAt,
    reason:
      decision.reason ??
      `Order routed to ${decision.exchangeId}.`,
    metadata: decision.metadata,
  });
}

export function acceptLiveOrder(
  order: LiveOrder,
  acceptance: LiveOrderExchangeAcceptance,
): LiveOrder {
  validateLiveOrder(order);
  validateExchangeAcceptance(acceptance);

  if (
    order.state !== "SUBMITTING" &&
    order.state !== "SUBMITTED" &&
    order.state !== "RECOVERING" &&
    order.state !== "UNKNOWN"
  ) {
    throw new LiveOrderError(
      "ORDER_NOT_ACCEPTABLE",
      `Order "${order.orderId}" cannot be accepted while in state "${order.state}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const exchangeId =
    normalizeExchangeId(acceptance.exchangeId);

  if (
    order.exchangeId !== undefined &&
    order.exchangeId !== exchangeId
  ) {
    throw new LiveOrderError(
      "EXCHANGE_ACCEPTANCE_MISMATCH",
      `Order "${order.orderId}" is routed to "${order.exchangeId}" but was accepted by "${exchangeId}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const acceptedAt = validateMonotonicTimestamp(
    acceptance.acceptedAt,
    order.updatedAt,
    "acceptance.acceptedAt",
    order.orderId,
  );

  const updated = freezeLiveOrder({
    ...order,
    exchangeId,
    exchangeOrderId: normalizeIdentifier(
      acceptance.exchangeOrderId,
      "acceptance.exchangeOrderId",
    ),
    version: order.version + 1,
    updatedAt: acceptedAt,
  });

  return transitionLiveOrder(updated, {
    state: "ACCEPTED",
    occurredAt: acceptedAt,
    reason: "Order accepted by exchange.",
    metadata: acceptance.metadata,
  });
}

export function applyLiveOrderFill(
  order: LiveOrder,
  application: LiveOrderFillApplication,
): LiveOrder {
  validateLiveOrder(order);
  validateLiveOrderFill(application.fill);

  if (isLiveOrderTerminal(order)) {
    throw new LiveOrderError(
      "TERMINAL_ORDER_CANNOT_RECEIVE_FILL",
      `Terminal order "${order.orderId}" cannot receive additional fills.`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const fill = freezeFill(application.fill);

  if (
    order.fills.some(
      (existing) =>
        existing.fillId === fill.fillId,
    )
  ) {
    throw new LiveOrderError(
      "DUPLICATE_ORDER_FILL",
      `Fill "${fill.fillId}" has already been applied to order "${order.orderId}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  if (
    fill.exchangeOrderId !== undefined &&
    order.exchangeOrderId !== undefined &&
    fill.exchangeOrderId !== order.exchangeOrderId
  ) {
    throw new LiveOrderError(
      "FILL_EXCHANGE_ORDER_MISMATCH",
      `Fill "${fill.fillId}" belongs to exchange order "${fill.exchangeOrderId}", not "${order.exchangeOrderId}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const nextFilledQuantity =
    normalizeFloatingPoint(
      order.filledQuantity + fill.quantity,
    );

  if (
    nextFilledQuantity > order.requestedQuantity
  ) {
    throw new LiveOrderError(
      "ORDER_OVERFILL",
      `Applying fill "${fill.fillId}" would overfill order "${order.orderId}".`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  const nextCumulativeQuote =
    normalizeFloatingPoint(
      order.cumulativeQuoteQuantity +
        fill.quoteQuantity,
    );

  const nextRemainingQuantity =
    normalizeFloatingPoint(
      order.requestedQuantity -
        nextFilledQuantity,
    );

  const nextState: LiveOrderState =
    nextRemainingQuantity === 0
      ? "FILLED"
      : "PARTIALLY_FILLED";

  const occurredAt =
    application.occurredAt ?? fill.receivedAt;

  validateMonotonicTimestamp(
    occurredAt,
    order.updatedAt,
    "application.occurredAt",
    order.orderId,
  );

  const updated = freezeLiveOrder({
    ...order,
    filledQuantity: nextFilledQuantity,
    remainingQuantity: nextRemainingQuantity,
    cumulativeQuoteQuantity:
      nextCumulativeQuote,
    averageFillPrice:
      nextFilledQuantity === 0
        ? undefined
        : normalizeFloatingPoint(
            nextCumulativeQuote /
              nextFilledQuantity,
          ),
    fills: Object.freeze([
      ...order.fills,
      fill,
    ]),
    fees: aggregateFees([
      ...order.fees,
      ...fill.fees,
    ]),
    firstFillAt:
      order.firstFillAt ?? fill.executedAt,
    lastFillAt: fill.executedAt,
    filledAt:
      nextState === "FILLED"
        ? fill.executedAt
        : order.filledAt,
    version: order.version + 1,
    updatedAt: occurredAt,
  });

  return transitionLiveOrder(updated, {
    state: nextState,
    occurredAt,
    reason:
      nextState === "FILLED"
        ? "Order fully filled."
        : "Order partially filled.",
    metadata: {
      fillId: fill.fillId,
      fillQuantity: fill.quantity,
      fillPrice: fill.price,
    },
  });
}

export function applyLiveOrderFailure(
  order: LiveOrder,
  application: LiveOrderFailureApplication,
): LiveOrder {
  validateLiveOrder(order);
  validateLiveOrderFailure(application.failure);

  const failure = freezeFailure(
    application.failure,
  );

  const occurredAt = validateMonotonicTimestamp(
    failure.occurredAt,
    order.updatedAt,
    "failure.occurredAt",
    order.orderId,
  );

  const updated = freezeLiveOrder({
    ...order,
    failures: Object.freeze([
      ...order.failures,
      failure,
    ]),
    version: order.version + 1,
    updatedAt: occurredAt,
    lastReason: failure.message,
  });

  if (
    (application.transitionToFailed ?? true) &&
    updated.state !== "FAILED" &&
    !isLiveOrderTerminal(updated)
  ) {
    return transitionLiveOrder(updated, {
      state: "FAILED",
      occurredAt,
      reason: failure.message,
      metadata: {
        failureCode: failure.code,
        failureCategory: failure.category,
        retryable: failure.retryable,
      },
    });
  }

  return updated;
}

export function snapshotLiveOrder(
  order: LiveOrder,
): LiveOrder {
  validateLiveOrder(order);
  return freezeLiveOrder(order);
}

export function validateLiveOrder(
  order: LiveOrder,
): void {
  if (
    order === null ||
    typeof order !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_LIVE_ORDER",
      "Live order must be an object.",
    );
  }

  normalizeIdentifier(order.orderId, "order.orderId");
  normalizeIdentifier(
    order.clientOrderId,
    "order.clientOrderId",
  );
  normalizeIdentifier(
    order.idempotencyKey,
    "order.idempotencyKey",
  );
  normalizeSymbol(order.symbol);
  validateLiveOrderSide(order.side);
  validateLiveOrderType(order.type);
  validateLiveOrderState(order.state);

  if (order.timeInForce !== undefined) {
    validateTimeInForce(order.timeInForce);
  }

  validatePositiveNumber(
    order.requestedQuantity,
    "order.requestedQuantity",
  );
  validateNonNegativeNumber(
    order.filledQuantity,
    "order.filledQuantity",
  );
  validateNonNegativeNumber(
    order.remainingQuantity,
    "order.remainingQuantity",
  );

  if (
    normalizeFloatingPoint(
      order.requestedQuantity -
        order.filledQuantity,
    ) !==
    normalizeFloatingPoint(
      order.remainingQuantity,
    )
  ) {
    throw new LiveOrderError(
      "ORDER_QUANTITY_INVARIANT_VIOLATION",
      `Order "${order.orderId}" has inconsistent filled and remaining quantities.`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  if (
    order.filledQuantity > order.requestedQuantity
  ) {
    throw new LiveOrderError(
      "ORDER_OVERFILLED",
      `Order "${order.orderId}" is overfilled.`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  validateNonNegativeNumber(
    order.cumulativeQuoteQuantity,
    "order.cumulativeQuoteQuantity",
  );

  if (order.averageFillPrice !== undefined) {
    validatePositiveNumber(
      order.averageFillPrice,
      "order.averageFillPrice",
    );
  }

  validatePositiveSafeInteger(
    order.version,
    "order.version",
  );
  validateTimestamp(
    order.createdAt,
    "order.createdAt",
  );
  validateTimestamp(
    order.updatedAt,
    "order.updatedAt",
  );

  if (order.updatedAt < order.createdAt) {
    throw new LiveOrderError(
      "INVALID_ORDER_TIMELINE",
      `Order "${order.orderId}" was updated before it was created.`,
      {
        orderId: order.orderId,
        state: order.state,
      },
    );
  }

  validateStateQuantityConsistency(
    order.state,
    order.filledQuantity,
    order.requestedQuantity,
    order.orderId,
  );

  const seenFillIds = new Set<string>();

  for (const fill of order.fills) {
    validateLiveOrderFill(fill);

    if (seenFillIds.has(fill.fillId)) {
      throw new LiveOrderError(
        "DUPLICATE_ORDER_FILL",
        `Order "${order.orderId}" contains duplicate fill "${fill.fillId}".`,
        {
          orderId: order.orderId,
          state: order.state,
        },
      );
    }

    seenFillIds.add(fill.fillId);
  }

  for (const fee of order.fees) {
    validateLiveOrderFee(fee);
  }

  for (const failure of order.failures) {
    validateLiveOrderFailure(failure);
  }

  for (const transition of order.transitions) {
    validateStateTransition(transition);
  }

  validateOptionalRecord(
    order.metadata,
    "order.metadata",
  );
}

function validateLiveOrderRequest(
  request: LiveOrderRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_LIVE_ORDER_REQUEST",
      "Live order request must be an object.",
    );
  }

  normalizeIdentifier(
    request.orderId,
    "request.orderId",
  );
  normalizeIdentifier(
    request.clientOrderId,
    "request.clientOrderId",
  );
  normalizeIdentifier(
    request.idempotencyKey,
    "request.idempotencyKey",
  );
  normalizeSymbol(request.symbol);
  validateLiveOrderSide(request.side);
  validateLiveOrderType(request.type);
  validatePositiveNumber(
    request.quantity,
    "request.quantity",
  );
  validateTimestamp(
    request.createdAt,
    "request.createdAt",
  );

  if (request.timeInForce !== undefined) {
    validateTimeInForce(request.timeInForce);
  }

  if (request.limitPrice !== undefined) {
    validatePositiveNumber(
      request.limitPrice,
      "request.limitPrice",
    );
  }

  if (request.stopPrice !== undefined) {
    validatePositiveNumber(
      request.stopPrice,
      "request.stopPrice",
    );
  }

  if (request.trailingOffset !== undefined) {
    validatePositiveNumber(
      request.trailingOffset,
      "request.trailingOffset",
    );
  }

  if (
    request.quoteOrderQuantity !== undefined
  ) {
    validatePositiveNumber(
      request.quoteOrderQuantity,
      "request.quoteOrderQuantity",
    );
  }

  if (request.expiresAt !== undefined) {
    validateTimestamp(
      request.expiresAt,
      "request.expiresAt",
    );

    if (request.expiresAt <= request.createdAt) {
      throw new LiveOrderError(
        "INVALID_ORDER_EXPIRY",
        "Order expiry must be later than creation time.",
      );
    }
  }

  validateOrderTypeRequirements(request);
  validateBooleanOption(
    request.reduceOnly,
    "request.reduceOnly",
  );
  validateBooleanOption(
    request.postOnly,
    "request.postOnly",
  );
  validateBooleanOption(
    request.closePosition,
    "request.closePosition",
  );
  validateOptionalRecord(
    request.metadata,
    "request.metadata",
  );
}

function validateOrderTypeRequirements(
  request: LiveOrderRequest,
): void {
  const requiresLimitPrice =
    request.type === "LIMIT" ||
    request.type === "STOP_LIMIT" ||
    request.type === "TAKE_PROFIT_LIMIT";

  const requiresStopPrice =
    request.type === "STOP" ||
    request.type === "STOP_LIMIT" ||
    request.type === "TAKE_PROFIT" ||
    request.type === "TAKE_PROFIT_LIMIT";

  if (
    requiresLimitPrice &&
    request.limitPrice === undefined
  ) {
    throw new LiveOrderError(
      "LIMIT_PRICE_REQUIRED",
      `Order type "${request.type}" requires limitPrice.`,
    );
  }

  if (
    requiresStopPrice &&
    request.stopPrice === undefined
  ) {
    throw new LiveOrderError(
      "STOP_PRICE_REQUIRED",
      `Order type "${request.type}" requires stopPrice.`,
    );
  }

  if (
    request.type === "TRAILING_STOP" &&
    request.trailingOffset === undefined
  ) {
    throw new LiveOrderError(
      "TRAILING_OFFSET_REQUIRED",
      "TRAILING_STOP orders require trailingOffset.",
    );
  }

  if (
    request.postOnly === true &&
    request.type !== "LIMIT" &&
    request.type !== "TAKE_PROFIT_LIMIT"
  ) {
    throw new LiveOrderError(
      "POST_ONLY_REQUIRES_LIMIT_ORDER",
      "postOnly is only valid for limit-based orders.",
    );
  }

  if (
    request.postOnly === true &&
    request.timeInForce !== undefined &&
    request.timeInForce !== "POST_ONLY" &&
    request.timeInForce !== "GTC"
  ) {
    throw new LiveOrderError(
      "INVALID_POST_ONLY_TIME_IN_FORCE",
      "postOnly orders must use POST_ONLY or GTC time in force.",
    );
  }
}

function validateTransitionRequest(
  request: LiveOrderTransitionRequest,
): void {
  if (
    request === null ||
    typeof request !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_TRANSITION_REQUEST",
      "Live order transition request must be an object.",
    );
  }

  validateLiveOrderState(request.state);
  validateTimestamp(
    request.occurredAt,
    "request.occurredAt",
  );
  normalizeOptionalText(request.reason);
  validateOptionalRecord(
    request.metadata,
    "request.metadata",
  );
}

function validateExchangeAcceptance(
  acceptance: LiveOrderExchangeAcceptance,
): void {
  if (
    acceptance === null ||
    typeof acceptance !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_EXCHANGE_ACCEPTANCE",
      "Exchange acceptance must be an object.",
    );
  }

  normalizeExchangeId(acceptance.exchangeId);
  normalizeIdentifier(
    acceptance.exchangeOrderId,
    "acceptance.exchangeOrderId",
  );
  validateTimestamp(
    acceptance.acceptedAt,
    "acceptance.acceptedAt",
  );
  validateOptionalRecord(
    acceptance.metadata,
    "acceptance.metadata",
  );
}

function validateRoutingDecision(
  decision: LiveOrderRoutingDecision,
): void {
  if (
    decision === null ||
    typeof decision !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_ROUTING_DECISION",
      "Routing decision must be an object.",
    );
  }

  normalizeExchangeId(decision.exchangeId);
  validateTimestamp(
    decision.selectedAt,
    "decision.selectedAt",
  );

  if (
    decision.score !== undefined &&
    !Number.isFinite(decision.score)
  ) {
    throw new LiveOrderError(
      "INVALID_ROUTING_SCORE",
      "Routing score must be finite.",
    );
  }

  normalizeOptionalText(decision.reason);
  validateOptionalRecord(
    decision.metadata,
    "decision.metadata",
  );
}

function validateLiveOrderFill(
  fill: LiveOrderFill,
): void {
  if (
    fill === null ||
    typeof fill !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_FILL",
      "Live order fill must be an object.",
    );
  }

  normalizeIdentifier(fill.fillId, "fill.fillId");
  validatePositiveNumber(
    fill.quantity,
    "fill.quantity",
  );
  validatePositiveNumber(
    fill.price,
    "fill.price",
  );
  validatePositiveNumber(
    fill.quoteQuantity,
    "fill.quoteQuantity",
  );

  const derivedQuote = normalizeFloatingPoint(
    fill.quantity * fill.price,
  );
  const suppliedQuote = normalizeFloatingPoint(
    fill.quoteQuantity,
  );
  const tolerance = Math.max(
    1e-8,
    Math.abs(derivedQuote) * 1e-8,
  );

  if (
    Math.abs(derivedQuote - suppliedQuote) >
    tolerance
  ) {
    throw new LiveOrderError(
      "FILL_QUOTE_QUANTITY_MISMATCH",
      `Fill "${fill.fillId}" quote quantity does not match quantity multiplied by price.`,
    );
  }

  validateLiquidityRole(fill.liquidityRole);
  validateTimestamp(
    fill.executedAt,
    "fill.executedAt",
  );
  validateTimestamp(
    fill.receivedAt,
    "fill.receivedAt",
  );

  if (fill.receivedAt < fill.executedAt) {
    throw new LiveOrderError(
      "INVALID_FILL_TIMELINE",
      `Fill "${fill.fillId}" was received before it was executed.`,
    );
  }

  if (fill.sequence !== undefined) {
    validateNonNegativeSafeInteger(
      fill.sequence,
      "fill.sequence",
    );
  }

  for (const fee of fill.fees) {
    validateLiveOrderFee(fee);
  }

  validateOptionalRecord(
    fill.metadata,
    "fill.metadata",
  );
}

function validateLiveOrderFee(
  fee: LiveOrderFee,
): void {
  if (
    fee === null ||
    typeof fee !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_FEE",
      "Live order fee must be an object.",
    );
  }

  normalizeAsset(fee.asset);
  validateNonNegativeNumber(
    fee.amount,
    "fee.amount",
  );
}

function validateLiveOrderFailure(
  failure: LiveOrderFailure,
): void {
  if (
    failure === null ||
    typeof failure !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_FAILURE",
      "Live order failure must be an object.",
    );
  }

  validateFailureCategory(failure.category);
  normalizeIdentifier(
    failure.code,
    "failure.code",
  );
  normalizeIdentifier(
    failure.message,
    "failure.message",
  );
  validateTimestamp(
    failure.occurredAt,
    "failure.occurredAt",
  );

  if (
    typeof failure.retryable !== "boolean"
  ) {
    throw new LiveOrderError(
      "INVALID_FAILURE_RETRYABLE_FLAG",
      "failure.retryable must be boolean.",
    );
  }

  validateOptionalRecord(
    failure.metadata,
    "failure.metadata",
  );
}

function validateStateTransition(
  transition: LiveOrderStateTransition,
): void {
  if (
    transition === null ||
    typeof transition !== "object"
  ) {
    throw new LiveOrderError(
      "INVALID_STATE_TRANSITION",
      "Order state transition must be an object.",
    );
  }

  validatePositiveSafeInteger(
    transition.transitionId,
    "transition.transitionId",
  );
  validateLiveOrderState(transition.from);
  validateLiveOrderState(transition.to);
  validateTimestamp(
    transition.occurredAt,
    "transition.occurredAt",
  );
  normalizeOptionalText(transition.reason);
  validateOptionalRecord(
    transition.metadata,
    "transition.metadata",
  );
}

function validateStateQuantityConsistency(
  state: LiveOrderState,
  filledQuantity: number,
  requestedQuantity: number,
  orderId: LiveOrderId,
): void {
  if (
    state === "PARTIALLY_FILLED" &&
    !(
      filledQuantity > 0 &&
      filledQuantity < requestedQuantity
    )
  ) {
    throw new LiveOrderError(
      "INVALID_PARTIAL_FILL_STATE",
      `Order "${orderId}" cannot be PARTIALLY_FILLED with filled quantity ${filledQuantity}.`,
      { orderId, state },
    );
  }

  if (
    (
      state === "FILLED" ||
      state === "SETTLING" ||
      state === "SETTLED"
    ) &&
    filledQuantity !== requestedQuantity
  ) {
    throw new LiveOrderError(
      "INVALID_FILLED_STATE",
      `Order "${orderId}" cannot be "${state}" until its requested quantity is fully filled.`,
      { orderId, state },
    );
  }
}

function deriveStateTimestampFields(
  state: LiveOrderState,
  occurredAt: number,
): Partial<LiveOrder> {
  switch (state) {
    case "VALIDATED":
      return { validatedAt: occurredAt };
    case "ROUTED":
      return { routedAt: occurredAt };
    case "SUBMITTED":
      return { submittedAt: occurredAt };
    case "ACCEPTED":
      return { acceptedAt: occurredAt };
    case "FILLED":
      return { filledAt: occurredAt };
    case "SETTLED":
      return { settledAt: occurredAt };
    case "CANCELLED":
      return { cancelledAt: occurredAt };
    case "REJECTED":
      return { rejectedAt: occurredAt };
    case "EXPIRED":
      return { expiredAt: occurredAt };
    case "FAILED":
      return { failedAt: occurredAt };
    case "RECOVERING":
      return {
        recoveryStartedAt: occurredAt,
      };
    case "NEW":
    case "ROUTING":
    case "SUBMITTING":
    case "PARTIALLY_FILLED":
    case "SETTLING":
    case "CANCEL_PENDING":
    case "REPLACE_PENDING":
    case "REPLACED":
    case "UNKNOWN":
      return {};
    default:
      return assertNever(state);
  }
}

function freezeLiveOrder(
  order: LiveOrder,
): LiveOrder {
  return Object.freeze({
    ...order,
    fills: Object.freeze(
      order.fills.map(freezeFill),
    ),
    fees: Object.freeze(
      order.fees.map((fee) =>
        Object.freeze({
          asset: normalizeAsset(fee.asset),
          amount: fee.amount,
        }),
      ),
    ),
    failures: Object.freeze(
      order.failures.map(freezeFailure),
    ),
    transitions: Object.freeze(
      order.transitions.map((transition) =>
        Object.freeze({
          ...transition,
          metadata: freezeRecord(
            transition.metadata,
          ),
        }),
      ),
    ),
    routingDecision:
      order.routingDecision === undefined
        ? undefined
        : freezeRoutingDecision(
            order.routingDecision,
          ),
    metadata: freezeRecord(order.metadata),
  });
}

function freezeFill(
  fill: LiveOrderFill,
): LiveOrderFill {
  return Object.freeze({
    ...fill,
    fees: Object.freeze(
      fill.fees.map((fee) =>
        Object.freeze({
          asset: normalizeAsset(fee.asset),
          amount: fee.amount,
        }),
      ),
    ),
    metadata: freezeRecord(fill.metadata),
  });
}

function freezeFailure(
  failure: LiveOrderFailure,
): LiveOrderFailure {
  return Object.freeze({
    ...failure,
    metadata: freezeRecord(failure.metadata),
  });
}

function freezeRoutingDecision(
  decision: LiveOrderRoutingDecision,
): LiveOrderRoutingDecision {
  return Object.freeze({
    ...decision,
    exchangeId: normalizeExchangeId(
      decision.exchangeId,
    ),
    metadata: freezeRecord(decision.metadata),
  });
}

function aggregateFees(
  fees: readonly LiveOrderFee[],
): readonly LiveOrderFee[] {
  const totals =
    new Map<LiveOrderAsset, number>();

  for (const fee of fees) {
    validateLiveOrderFee(fee);

    const asset = normalizeAsset(fee.asset);

    totals.set(
      asset,
      normalizeFloatingPoint(
        (totals.get(asset) ?? 0) +
          fee.amount,
      ),
    );
  }

  return Object.freeze(
    [...totals.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right),
      )
      .map(([asset, amount]) =>
        Object.freeze({
          asset,
          amount,
        }),
      ),
  );
}

function normalizeFloatingPoint(
  value: number,
): number {
  return Number(value.toPrecision(15));
}

function normalizeIdentifier(
  value: string,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new LiveOrderError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeExchangeId(
  exchangeId: LiveOrderExchangeId,
): LiveOrderExchangeId {
  return normalizeIdentifier(
    exchangeId,
    "exchangeId",
  ).toUpperCase();
}

function normalizeSymbol(
  symbol: LiveOrderSymbol,
): LiveOrderSymbol {
  return normalizeIdentifier(
    symbol,
    "symbol",
  ).toUpperCase();
}

function normalizeAsset(
  asset: LiveOrderAsset,
): LiveOrderAsset {
  return normalizeIdentifier(
    asset,
    "asset",
  ).toUpperCase();
}

function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  return value === undefined
    ? undefined
    : normalizeIdentifier(value, "text");
}

function validateTimestamp(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new LiveOrderError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function validateMonotonicTimestamp(
  value: number,
  previous: number,
  field: string,
  orderId: LiveOrderId,
): number {
  validateTimestamp(value, field);

  if (value < previous) {
    throw new LiveOrderError(
      "NON_MONOTONIC_ORDER_TIMESTAMP",
      `${field} cannot be earlier than the previous order update timestamp.`,
      { orderId },
    );
  }

  return value;
}

function validatePositiveNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new LiveOrderError(
      "INVALID_POSITIVE_NUMBER",
      `${field} must be a finite positive number.`,
    );
  }

  return value;
}

function validateNonNegativeNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new LiveOrderError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new LiveOrderError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateNonNegativeSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new LiveOrderError(
      "INVALID_NON_NEGATIVE_INTEGER",
      `${field} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateBooleanOption(
  value: boolean | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    typeof value !== "boolean"
  ) {
    throw new LiveOrderError(
      "INVALID_BOOLEAN",
      `${field} must be boolean when provided.`,
    );
  }
}

function validateOptionalRecord(
  value:
    | Readonly<Record<string, unknown>>
    | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
  ) {
    throw new LiveOrderError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function freezeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...value });
}

function validateLiveOrderSide(
  side: LiveOrderSide,
): void {
  if (side !== "BUY" && side !== "SELL") {
    throw new LiveOrderError(
      "INVALID_ORDER_SIDE",
      `Unsupported order side "${String(side)}".`,
    );
  }
}

function validateLiveOrderType(
  type: LiveOrderType,
): void {
  if (
    type !== "MARKET" &&
    type !== "LIMIT" &&
    type !== "STOP" &&
    type !== "STOP_LIMIT" &&
    type !== "TAKE_PROFIT" &&
    type !== "TAKE_PROFIT_LIMIT" &&
    type !== "TRAILING_STOP"
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_TYPE",
      `Unsupported order type "${String(type)}".`,
    );
  }
}

function validateTimeInForce(
  timeInForce: LiveOrderTimeInForce,
): void {
  if (
    timeInForce !== "GTC" &&
    timeInForce !== "IOC" &&
    timeInForce !== "FOK" &&
    timeInForce !== "POST_ONLY" &&
    timeInForce !== "GTD"
  ) {
    throw new LiveOrderError(
      "INVALID_TIME_IN_FORCE",
      `Unsupported time in force "${String(
        timeInForce,
      )}".`,
    );
  }
}

function validateLiveOrderState(
  state: LiveOrderState,
): void {
  if (
    !Object.prototype.hasOwnProperty.call(
      ALLOWED_TRANSITIONS,
      state,
    )
  ) {
    throw new LiveOrderError(
      "INVALID_ORDER_STATE",
      `Unsupported live order state "${String(state)}".`,
    );
  }
}

function validateLiquidityRole(
  role: LiveOrderLiquidityRole,
): void {
  if (
    role !== "MAKER" &&
    role !== "TAKER" &&
    role !== "UNKNOWN"
  ) {
    throw new LiveOrderError(
      "INVALID_LIQUIDITY_ROLE",
      `Unsupported liquidity role "${String(role)}".`,
    );
  }
}

function validateFailureCategory(
  category: LiveOrderFailureCategory,
): void {
  if (
    category !== "VALIDATION" &&
    category !== "RISK" &&
    category !== "ROUTING" &&
    category !== "CONNECTIVITY" &&
    category !== "AUTHENTICATION" &&
    category !== "RATE_LIMIT" &&
    category !== "EXCHANGE_REJECTION" &&
    category !== "TIMEOUT" &&
    category !== "RECONCILIATION" &&
    category !== "INTERNAL" &&
    category !== "UNKNOWN"
  ) {
    throw new LiveOrderError(
      "INVALID_FAILURE_CATEGORY",
      `Unsupported failure category "${String(
        category,
      )}".`,
    );
  }
}

function assertNever(value: never): never {
  throw new LiveOrderError(
    "UNSUPPORTED_VALUE",
    `Unsupported value "${String(value)}".`,
  );
}