/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 2:
 * Shared live-order execution contracts.
 */

import type {
  ClientOrderId,
  ExchangeOrderId,
  LiveOrder,
  LiveOrderAccountId,
  LiveOrderExchangeId,
  LiveOrderFailure,
  LiveOrderFill,
  LiveOrderId,
  LiveOrderRequest,
  LiveOrderState,
  LiveOrderSymbol,
  LiveOrderTimeInForce,
  LiveOrderType,
} from "./live-order";

export type OrderCommandId = string;
export type OrderExecutionId = string;
export type OrderRouteId = string;
export type OrderCorrelationId = string;
export type OrderCausationId = string;
export type OrderRequestId = string;

export type OrderOperation =
  | "CREATE"
  | "VALIDATE"
  | "ROUTE"
  | "SUBMIT"
  | "CANCEL"
  | "REPLACE"
  | "RECONCILE"
  | "RECOVER";

export type OrderCommandStatus =
  | "PENDING"
  | "ACCEPTED"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

export type OrderValidationSeverity =
  | "ERROR"
  | "WARNING"
  | "INFO";

export type OrderValidationCode =
  | "INVALID_ORDER"
  | "INVALID_SYMBOL"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_STOP_PRICE"
  | "INVALID_TIME_IN_FORCE"
  | "INVALID_ORDER_TYPE"
  | "INVALID_ACCOUNT"
  | "INVALID_EXCHANGE"
  | "DUPLICATE_ORDER"
  | "MARKET_UNAVAILABLE"
  | "ACCOUNT_UNAVAILABLE"
  | "TRADING_DISABLED"
  | "INSUFFICIENT_BALANCE"
  | "RISK_REJECTED"
  | "EXCHANGE_UNSUPPORTED"
  | "CAPABILITY_UNSUPPORTED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UNKNOWN";

export type OrderRoutingPreference =
  | "BEST_PRICE"
  | "LOWEST_FEE"
  | "LOWEST_LATENCY"
  | "HIGHEST_LIQUIDITY"
  | "PREFERRED_EXCHANGE"
  | "FAILOVER"
  | "DETERMINISTIC";

export type OrderSubmissionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "UNKNOWN";

export type OrderCancellationStatus =
  | "CANCELLED"
  | "PENDING"
  | "REJECTED"
  | "NOT_FOUND"
  | "ALREADY_TERMINAL"
  | "UNKNOWN";

export type OrderReplacementStatus =
  | "REPLACED"
  | "PENDING"
  | "REJECTED"
  | "NOT_FOUND"
  | "ALREADY_TERMINAL"
  | "UNKNOWN";

export type OrderQueryConsistency =
  | "LOCAL"
  | "EXCHANGE"
  | "RECONCILED";

export interface OrderCommandContext {
  readonly commandId: OrderCommandId;
  readonly correlationId: OrderCorrelationId;
  readonly causationId?: OrderCausationId;
  readonly requestId?: OrderRequestId;
  readonly initiatedAt: number;
  readonly actor?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CreateOrderCommand {
  readonly operation: "CREATE";
  readonly context: OrderCommandContext;
  readonly request: LiveOrderRequest;
}

export interface ValidateOrderCommand {
  readonly operation: "VALIDATE";
  readonly context: OrderCommandContext;
  readonly order: LiveOrder;
}

export interface RouteOrderCommand {
  readonly operation: "ROUTE";
  readonly context: OrderCommandContext;
  readonly order: LiveOrder;
  readonly preferences: readonly OrderRoutingPreference[];
  readonly preferredExchangeId?: LiveOrderExchangeId;
  readonly excludedExchangeIds: readonly LiveOrderExchangeId[];
}

export interface SubmitOrderCommand {
  readonly operation: "SUBMIT";
  readonly context: OrderCommandContext;
  readonly order: LiveOrder;
  readonly exchangeId: LiveOrderExchangeId;
  readonly routeId?: OrderRouteId;
}

export interface CancelOrderCommand {
  readonly operation: "CANCEL";
  readonly context: OrderCommandContext;
  readonly orderId: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol?: LiveOrderSymbol;
  readonly reason?: string;
}

export interface ReplaceOrderCommand {
  readonly operation: "REPLACE";
  readonly context: OrderCommandContext;
  readonly orderId: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol?: LiveOrderSymbol;
  readonly quantity?: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce?: LiveOrderTimeInForce;
  readonly reason?: string;
}

export interface ReconcileOrderCommand {
  readonly operation: "RECONCILE";
  readonly context: OrderCommandContext;
  readonly orderId: LiveOrderId;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly forceExchangeRead?: boolean;
}

export interface RecoverOrderCommand {
  readonly operation: "RECOVER";
  readonly context: OrderCommandContext;
  readonly orderId: LiveOrderId;
  readonly reason: string;
}

export type OrderCommand =
  | CreateOrderCommand
  | ValidateOrderCommand
  | RouteOrderCommand
  | SubmitOrderCommand
  | CancelOrderCommand
  | ReplaceOrderCommand
  | ReconcileOrderCommand
  | RecoverOrderCommand;

export interface OrderValidationIssue {
  readonly code: OrderValidationCode;
  readonly severity: OrderValidationSeverity;
  readonly field?: string;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderValidationResult {
  readonly valid: boolean;
  readonly issues: readonly OrderValidationIssue[];
  readonly validatedAt: number;
}

export interface OrderRouteCandidate {
  readonly exchangeId: LiveOrderExchangeId;
  readonly connectionId?: string;
  readonly supported: boolean;
  readonly healthy: boolean;
  readonly available: boolean;
  readonly score: number;
  readonly estimatedPrice?: number;
  readonly estimatedFee?: number;
  readonly estimatedLatencyMs?: number;
  readonly availableQuantity?: number;
  readonly rejectionReasons: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderRouteSelection {
  readonly routeId: OrderRouteId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly connectionId?: string;
  readonly score: number;
  readonly selectedAt: number;
  readonly preference: OrderRoutingPreference;
  readonly reason: string;
  readonly candidates: readonly OrderRouteCandidate[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderSubmissionRequest {
  readonly executionId: OrderExecutionId;
  readonly orderId: LiveOrderId;
  readonly clientOrderId: ClientOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol: LiveOrderSymbol;
  readonly side: LiveOrder["side"];
  readonly type: LiveOrderType;
  readonly timeInForce?: LiveOrderTimeInForce;
  readonly quantity: number;
  readonly quoteOrderQuantity?: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly trailingOffset?: number;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly closePosition: boolean;
  readonly expiresAt?: number;
  readonly idempotencyKey: string;
  readonly submittedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderSubmissionResponse {
  readonly executionId: OrderExecutionId;
  readonly orderId: LiveOrderId;
  readonly clientOrderId: ClientOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly status: OrderSubmissionStatus;
  readonly exchangeState?: string;
  readonly acceptedAt?: number;
  readonly receivedAt: number;
  readonly message?: string;
  readonly failure?: LiveOrderFailure;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderCancellationRequest {
  readonly orderId: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol?: LiveOrderSymbol;
  readonly requestedAt: number;
  readonly reason?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderCancellationResponse {
  readonly orderId: LiveOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly status: OrderCancellationStatus;
  readonly cancelledAt?: number;
  readonly receivedAt: number;
  readonly message?: string;
  readonly failure?: LiveOrderFailure;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderReplacementRequest {
  readonly orderId: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol?: LiveOrderSymbol;
  readonly quantity?: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce?: LiveOrderTimeInForce;
  readonly requestedAt: number;
  readonly reason?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderReplacementResponse {
  readonly orderId: LiveOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly previousExchangeOrderId?: ExchangeOrderId;
  readonly replacementExchangeOrderId?: ExchangeOrderId;
  readonly replacementClientOrderId?: ClientOrderId;
  readonly status: OrderReplacementStatus;
  readonly replacedAt?: number;
  readonly receivedAt: number;
  readonly message?: string;
  readonly failure?: LiveOrderFailure;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExchangeOrderSnapshot {
  readonly orderId?: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId: LiveOrderExchangeId;
  readonly exchangeOrderId: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol: LiveOrderSymbol;
  readonly state: string;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice?: number;
  readonly cumulativeQuoteQuantity?: number;
  readonly fills: readonly LiveOrderFill[];
  readonly createdAt?: number;
  readonly updatedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderQuery {
  readonly orderId?: LiveOrderId;
  readonly clientOrderId?: ClientOrderId;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly accountId?: LiveOrderAccountId;
  readonly symbol?: LiveOrderSymbol;
  readonly states?: readonly LiveOrderState[];
  readonly createdFrom?: number;
  readonly createdTo?: number;
  readonly limit?: number;
  readonly consistency?: OrderQueryConsistency;
}

export interface OrderQueryResult {
  readonly orders: readonly LiveOrder[];
  readonly consistency: OrderQueryConsistency;
  readonly queriedAt: number;
  readonly nextCursor?: string;
}

export interface OrderCommandResult<T = LiveOrder> {
  readonly commandId: OrderCommandId;
  readonly operation: OrderOperation;
  readonly status: OrderCommandStatus;
  readonly result?: T;
  readonly failure?: LiveOrderFailure;
  readonly completedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderExecutionEvent {
  readonly eventId: string;
  readonly orderId: LiveOrderId;
  readonly exchangeId?: LiveOrderExchangeId;
  readonly exchangeOrderId?: ExchangeOrderId;
  readonly state: LiveOrderState;
  readonly occurredAt: number;
  readonly sequence: number;
  readonly fill?: LiveOrderFill;
  readonly failure?: LiveOrderFailure;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderClock {
  now(): number;
}

export interface OrderIdGenerator {
  nextOrderId(): LiveOrderId;
  nextCommandId(): OrderCommandId;
  nextExecutionId(): OrderExecutionId;
  nextRouteId(): OrderRouteId;
  nextEventId(): string;
}

export interface OrderRepository {
  save(order: LiveOrder): Promise<void>;
  findByOrderId(
    orderId: LiveOrderId,
  ): Promise<LiveOrder | undefined>;
  findByClientOrderId(
    clientOrderId: ClientOrderId,
  ): Promise<LiveOrder | undefined>;
  findByExchangeOrderId(
    exchangeId: LiveOrderExchangeId,
    exchangeOrderId: ExchangeOrderId,
  ): Promise<LiveOrder | undefined>;
  query(query: OrderQuery): Promise<OrderQueryResult>;
}

export interface OrderExecutionTransport {
  submit(
    request: ExchangeOrderSubmissionRequest,
  ): Promise<ExchangeOrderSubmissionResponse>;

  cancel(
    request: ExchangeOrderCancellationRequest,
  ): Promise<ExchangeOrderCancellationResponse>;

  replace(
    request: ExchangeOrderReplacementRequest,
  ): Promise<ExchangeOrderReplacementResponse>;

  fetchOrder(
    exchangeId: LiveOrderExchangeId,
    exchangeOrderId: ExchangeOrderId,
    symbol?: LiveOrderSymbol,
    accountId?: LiveOrderAccountId,
  ): Promise<ExchangeOrderSnapshot | undefined>;
}

export interface OrderEventPublisher {
  publish(event: OrderExecutionEvent): Promise<void>;
}

export interface OrderValidatorContract {
  validate(
    order: LiveOrder,
  ): Promise<OrderValidationResult>;
}

export interface SmartOrderRouterContract {
  selectRoute(
    command: RouteOrderCommand,
  ): Promise<OrderRouteSelection>;
}