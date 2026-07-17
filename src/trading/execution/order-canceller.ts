/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 6: Live Order Canceller
 */

import {
  applyLiveOrderFailure,
  isLiveOrderTerminal,
  transitionLiveOrder,
  validateLiveOrder,
} from "./live-order";

import type {
  LiveOrder,
  LiveOrderFailure,
  LiveOrderFailureCategory,
} from "./live-order";

import type {
  CancelOrderCommand,
  ExchangeOrderCancellationRequest,
  ExchangeOrderCancellationResponse,
  OrderClock,
  OrderCommandResult,
  OrderEventPublisher,
  OrderExecutionEvent,
  OrderExecutionTransport,
  OrderIdGenerator,
  OrderRepository,
} from "./order-types";

export type OrderCancellerErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "INVALID_ORDER_STATE"
  | "ORDER_NOT_FOUND"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_TIMESTAMP"
  | "INVALID_TRANSPORT_RESPONSE"
  | "PERSISTENCE_FAILED"
  | "EVENT_PUBLICATION_FAILED"
  | "CANCELLATION_FAILED";

export class OrderCancellerError extends Error {
  public readonly code: OrderCancellerErrorCode;
  public readonly orderId?: string;
  public readonly exchangeId?: string;
  public readonly retryable: boolean;

  public constructor(
    code: OrderCancellerErrorCode,
    message: string,
    options: Readonly<{
      orderId?: string;
      exchangeId?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "OrderCancellerError";
    this.code = code;
    this.orderId = options.orderId;
    this.exchangeId = options.exchangeId;
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface LiveOrderCancellerOptions {
  readonly persistPendingState?: boolean;
  readonly publishLifecycleEvents?: boolean;
  readonly allowTerminalNoop?: boolean;
  readonly captureTransportExceptions?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedLiveOrderCancellerOptions {
  readonly persistPendingState: boolean;
  readonly publishLifecycleEvents: boolean;
  readonly allowTerminalNoop: boolean;
  readonly captureTransportExceptions: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderCancellationResult {
  readonly commandResult: OrderCommandResult<LiveOrder>;
  readonly order: LiveOrder;
  readonly request?: ExchangeOrderCancellationRequest;
  readonly response?: ExchangeOrderCancellationResponse;
  readonly events: readonly OrderExecutionEvent[];
}

export interface LiveOrderCancellerContract {
  cancel(command: CancelOrderCommand): Promise<LiveOrderCancellationResult>;
}

const EMPTY_METADATA: Readonly<Record<string, unknown>> = Object.freeze({});

const CANCELLABLE_STATES = new Set<LiveOrder["state"]>([
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
  "UNKNOWN",
  "RECOVERING",
]);

const DEFAULT_OPTIONS: ResolvedLiveOrderCancellerOptions = Object.freeze({
  persistPendingState: true,
  publishLifecycleEvents: true,
  allowTerminalNoop: true,
  captureTransportExceptions: true,
  metadata: EMPTY_METADATA,
});

export class SystemOrderCancellerClock implements OrderClock {
  public now(): number {
    return Date.now();
  }
}

export class LiveOrderCanceller implements LiveOrderCancellerContract {
  private readonly transport: OrderExecutionTransport;
  private readonly repository: OrderRepository;
  private readonly idGenerator: OrderIdGenerator;
  private readonly clock: OrderClock;
  private readonly publisher?: OrderEventPublisher;
  private readonly options: ResolvedLiveOrderCancellerOptions;

  public constructor(
    transport: OrderExecutionTransport,
    repository: OrderRepository,
    idGenerator: OrderIdGenerator,
    options: LiveOrderCancellerOptions = {},
    dependencies: Readonly<{
      clock?: OrderClock;
      publisher?: OrderEventPublisher;
    }> = {},
  ) {
    validateTransport(transport);
    validateRepository(repository);
    validateIdGenerator(idGenerator);

    const clock = dependencies.clock ?? new SystemOrderCancellerClock();
    validateClock(clock);

    if (dependencies.publisher !== undefined) {
      validatePublisher(dependencies.publisher);
    }

    this.transport = transport;
    this.repository = repository;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.publisher = dependencies.publisher;
    this.options = resolveOptions(options);
  }

  public async cancel(
    command: CancelOrderCommand,
  ): Promise<LiveOrderCancellationResult> {
    validateCancelCommand(command);

    const current = await this.resolveOrder(command);
    validateLiveOrder(current);

    const events: OrderExecutionEvent[] = [];

    if (isLiveOrderTerminal(current)) {
      if (!this.options.allowTerminalNoop) {
        throw new OrderCancellerError(
          "INVALID_ORDER_STATE",
          `Order "${current.orderId}" is already terminal in state "${current.state}".`,
          {
            orderId: current.orderId,
            exchangeId: current.exchangeId,
          },
        );
      }

      return freezeCancellationResult({
        commandResult: createCommandResult(
          command,
          current,
          "COMPLETED",
          this.now(),
          {
            cancellationStatus: "ALREADY_TERMINAL",
            terminalState: current.state,
          },
        ),
        order: current,
        events: Object.freeze(events),
      });
    }

    if (!CANCELLABLE_STATES.has(current.state)) {
      throw new OrderCancellerError(
        "INVALID_ORDER_STATE",
        `Order "${current.orderId}" cannot be cancelled while in state "${current.state}".`,
        {
          orderId: current.orderId,
          exchangeId: current.exchangeId,
        },
      );
    }

    const request = createExchangeCancellationRequest(
      command,
      current,
      this.now(),
      this.options.metadata,
    );

    let order = current;

    if (order.state !== "CANCEL_PENDING") {
      order = transitionLiveOrder(order, {
        state: "CANCEL_PENDING",
        occurredAt: ensureMonotonicTimestamp(
          request.requestedAt,
          order.updatedAt,
        ),
        reason: command.reason ?? "Order cancellation requested.",
        metadata: {
          commandId: command.context.commandId,
          exchangeId: request.exchangeId,
        },
      });

      if (this.options.persistPendingState) {
        await this.persist(order);
        await this.emitEvent(order, events, { phase: "CANCEL_PENDING" });
      }
    }

    let response: ExchangeOrderCancellationResponse;

    try {
      response = await this.transport.cancel(request);
    } catch (cause: unknown) {
      if (!this.options.captureTransportExceptions) {
        throw new OrderCancellerError(
          "CANCELLATION_FAILED",
          `Order "${order.orderId}" could not be cancelled on exchange "${request.exchangeId}".`,
          {
            orderId: order.orderId,
            exchangeId: request.exchangeId,
            retryable: true,
            cause,
          },
        );
      }

      const failure = normalizeCancellationFailure(
        cause,
        this.now(),
        request.exchangeId,
      );

      order = applyLiveOrderFailure(order, {
        failure,
        transitionToFailed: true,
      });

      await this.persist(order);
      await this.emitEvent(
        order,
        events,
        {
          phase: "TRANSPORT_FAILURE",
          failureCode: failure.code,
        },
        failure,
      );

      return freezeCancellationResult({
        commandResult: createCommandResult(
          command,
          order,
          "FAILED",
          order.updatedAt,
          {
            cancellationStatus: "UNKNOWN",
            failureCode: failure.code,
          },
          failure,
        ),
        order,
        request,
        events: Object.freeze(events),
      });
    }

    validateCancellationResponse(response, request);

    const outcome = applyCancellationResponse(order, response);
    order = outcome.order;

    await this.persist(order);
    await this.emitEvent(
      order,
      events,
      {
        phase: response.status,
        cancellationStatus: response.status,
      },
      outcome.failure,
    );

    return freezeCancellationResult({
      commandResult: createCommandResult(
        command,
        order,
        mapCancellationCommandStatus(response.status),
        order.updatedAt,
        {
          cancellationStatus: response.status,
          exchangeId: response.exchangeId,
          exchangeOrderId: response.exchangeOrderId,
        },
        outcome.failure,
      ),
      order,
      request,
      response,
      events: Object.freeze(events),
    });
  }

  private async resolveOrder(command: CancelOrderCommand): Promise<LiveOrder> {
    let order = await this.repository.findByOrderId(command.orderId);

    if (order === undefined && command.clientOrderId !== undefined) {
      order = await this.repository.findByClientOrderId(command.clientOrderId);
    }

    if (
      order === undefined &&
      command.exchangeId !== undefined &&
      command.exchangeOrderId !== undefined
    ) {
      order = await this.repository.findByExchangeOrderId(
        normalizeExchangeId(command.exchangeId),
        normalizeIdentifier(
          command.exchangeOrderId,
          "command.exchangeOrderId",
        ),
      );
    }

    if (order === undefined) {
      throw new OrderCancellerError(
        "ORDER_NOT_FOUND",
        `Order "${command.orderId}" was not found.`,
        {
          orderId: command.orderId,
          exchangeId: command.exchangeId,
        },
      );
    }

    if (order.orderId !== command.orderId) {
      throw new OrderCancellerError(
        "INVALID_COMMAND",
        `Resolved order "${order.orderId}" does not match command orderId "${command.orderId}".`,
        {
          orderId: command.orderId,
          exchangeId: order.exchangeId,
        },
      );
    }

    validateCommandOrderIdentity(command, order);
    return order;
  }

  private async persist(order: LiveOrder): Promise<void> {
    try {
      await this.repository.save(order);
    } catch (cause: unknown) {
      throw new OrderCancellerError(
        "PERSISTENCE_FAILED",
        `Failed to persist order "${order.orderId}" in state "${order.state}".`,
        {
          orderId: order.orderId,
          exchangeId: order.exchangeId,
          retryable: true,
          cause,
        },
      );
    }
  }

  private async emitEvent(
    order: LiveOrder,
    events: OrderExecutionEvent[],
    metadata: Readonly<Record<string, unknown>>,
    failure?: LiveOrderFailure,
  ): Promise<void> {
    if (!this.options.publishLifecycleEvents || this.publisher === undefined) {
      return;
    }

    const event = createExecutionEvent(
      order,
      this.idGenerator,
      metadata,
      failure,
    );

    try {
      await this.publisher.publish(event);
    } catch (cause: unknown) {
      throw new OrderCancellerError(
        "EVENT_PUBLICATION_FAILED",
        `Failed to publish cancellation event for order "${order.orderId}".`,
        {
          orderId: order.orderId,
          exchangeId: order.exchangeId,
          retryable: true,
          cause,
        },
      );
    }

    events.push(event);
  }

  private now(): number {
    return normalizeTimestamp(this.clock.now(), "orderCanceller.clock.now()");
  }
}

export function createExchangeCancellationRequest(
  command: CancelOrderCommand,
  order: LiveOrder,
  requestedAt: number,
  metadata: Readonly<Record<string, unknown>> = EMPTY_METADATA,
): ExchangeOrderCancellationRequest {
  validateCancelCommand(command);
  validateLiveOrder(order);
  validateCommandOrderIdentity(command, order);

  const exchangeId = normalizeExchangeId(
    command.exchangeId ?? order.exchangeId,
  );

  const exchangeOrderId = command.exchangeOrderId ?? order.exchangeOrderId;
  const clientOrderId = command.clientOrderId ?? order.clientOrderId;
  const accountId = command.accountId ?? order.accountId;
  const symbol = command.symbol ?? order.symbol;

  return Object.freeze({
    orderId: order.orderId,
    clientOrderId: normalizeIdentifier(clientOrderId, "clientOrderId"),
    exchangeId,
    ...(exchangeOrderId === undefined
      ? {}
      : {
          exchangeOrderId: normalizeIdentifier(
            exchangeOrderId,
            "exchangeOrderId",
          ),
        }),
    ...(accountId === undefined
      ? {}
      : { accountId: normalizeIdentifier(accountId, "accountId") }),
    symbol: normalizeIdentifier(symbol, "symbol").toUpperCase(),
    requestedAt: normalizeTimestamp(requestedAt, "requestedAt"),
    ...(command.reason === undefined
      ? {}
      : { reason: normalizeText(command.reason, "command.reason") }),
    metadata: freezeRecord({
      ...metadata,
      ...command.context.metadata,
      commandId: command.context.commandId,
      correlationId: command.context.correlationId,
      causationId: command.context.causationId,
      requestId: command.context.requestId,
      orderVersion: order.version,
      orderState: order.state,
    }),
  });
}

function applyCancellationResponse(
  order: LiveOrder,
  response: ExchangeOrderCancellationResponse,
): Readonly<{ order: LiveOrder; failure?: LiveOrderFailure }> {
  const occurredAt = ensureMonotonicTimestamp(
    response.cancelledAt ?? response.receivedAt,
    order.updatedAt,
  );

  switch (response.status) {
    case "CANCELLED":
      return Object.freeze({
        order: transitionLiveOrder(order, {
          state: "CANCELLED",
          occurredAt,
          reason: response.message ?? "Order cancelled by exchange.",
          metadata: {
            exchangeId: response.exchangeId,
            exchangeOrderId: response.exchangeOrderId,
            cancellationStatus: response.status,
            ...response.metadata,
          },
        }),
      });

    case "PENDING":
      return Object.freeze({ order });

    case "REJECTED": {
      const failure =
        response.failure ??
        createCancellationFailure({
          category: "EXCHANGE_REJECTION",
          code: "ORDER_CANCELLATION_REJECTED",
          message:
            response.message ?? "Order cancellation rejected by exchange.",
          occurredAt,
          retryable: false,
          metadata: {
            exchangeId: response.exchangeId,
            exchangeOrderId: response.exchangeOrderId,
          },
        });

      const failed = applyLiveOrderFailure(order, {
        failure,
        transitionToFailed: false,
      });

      return Object.freeze({
        order: transitionLiveOrder(failed, {
          state: "UNKNOWN",
          occurredAt: ensureMonotonicTimestamp(
            failure.occurredAt,
            failed.updatedAt,
          ),
          reason: failure.message,
          metadata: {
            cancellationStatus: response.status,
            failureCode: failure.code,
          },
        }),
        failure,
      });
    }

    case "NOT_FOUND":
    case "UNKNOWN":
    case "ALREADY_TERMINAL": {
      const failure =
        response.failure ??
        createCancellationFailure({
          category: "RECONCILIATION",
          code: `ORDER_CANCELLATION_${response.status}`,
          message:
            response.message ??
            `Exchange returned cancellation status "${response.status}".`,
          occurredAt,
          retryable: response.status !== "ALREADY_TERMINAL",
          metadata: {
            exchangeId: response.exchangeId,
            exchangeOrderId: response.exchangeOrderId,
            cancellationStatus: response.status,
          },
        });

      const failed = applyLiveOrderFailure(order, {
        failure,
        transitionToFailed: false,
      });

      return Object.freeze({
        order: transitionLiveOrder(failed, {
          state: "UNKNOWN",
          occurredAt: ensureMonotonicTimestamp(
            failure.occurredAt,
            failed.updatedAt,
          ),
          reason: failure.message,
          metadata: {
            cancellationStatus: response.status,
            failureCode: failure.code,
          },
        }),
        failure,
      });
    }

    default: {
      const exhaustiveCheck: never = response.status;
      return exhaustiveCheck;
    }
  }
}

function validateCancelCommand(command: CancelOrderCommand): void {
  if (!isRecord(command)) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      "Cancel-order command must be a record object.",
    );
  }

  if (command.operation !== "CANCEL") {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      `Expected CANCEL operation but received "${String(command.operation)}".`,
    );
  }

  normalizeIdentifier(command.orderId, "command.orderId");
  normalizeIdentifier(command.context.commandId, "command.context.commandId");
  normalizeIdentifier(
    command.context.correlationId,
    "command.context.correlationId",
  );
  normalizeTimestamp(command.context.initiatedAt, "command.context.initiatedAt");

  if (command.clientOrderId !== undefined) {
    normalizeIdentifier(command.clientOrderId, "command.clientOrderId");
  }
  if (command.exchangeId !== undefined) {
    normalizeExchangeId(command.exchangeId);
  }
  if (command.exchangeOrderId !== undefined) {
    normalizeIdentifier(command.exchangeOrderId, "command.exchangeOrderId");
  }
  if (command.accountId !== undefined) {
    normalizeIdentifier(command.accountId, "command.accountId");
  }
  if (command.symbol !== undefined) {
    normalizeIdentifier(command.symbol, "command.symbol");
  }
  if (command.reason !== undefined) {
    normalizeText(command.reason, "command.reason");
  }
}

function validateCommandOrderIdentity(
  command: CancelOrderCommand,
  order: LiveOrder,
): void {
  if (
    command.clientOrderId !== undefined &&
    command.clientOrderId !== order.clientOrderId
  ) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      "Cancel command clientOrderId does not match the persisted order.",
      { orderId: order.orderId, exchangeId: order.exchangeId },
    );
  }

  if (
    command.exchangeId !== undefined &&
    normalizeExchangeId(command.exchangeId) !==
      normalizeExchangeId(order.exchangeId)
  ) {
    throw new OrderCancellerError(
      "INVALID_EXCHANGE_ID",
      "Cancel command exchangeId does not match the persisted order.",
      { orderId: order.orderId, exchangeId: command.exchangeId },
    );
  }

  if (
    command.exchangeOrderId !== undefined &&
    order.exchangeOrderId !== undefined &&
    command.exchangeOrderId !== order.exchangeOrderId
  ) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      "Cancel command exchangeOrderId does not match the persisted order.",
      { orderId: order.orderId, exchangeId: order.exchangeId },
    );
  }

  if (
    command.accountId !== undefined &&
    order.accountId !== undefined &&
    command.accountId !== order.accountId
  ) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      "Cancel command accountId does not match the persisted order.",
      { orderId: order.orderId, exchangeId: order.exchangeId },
    );
  }

  if (
    command.symbol !== undefined &&
    command.symbol.trim().toUpperCase() !== order.symbol.trim().toUpperCase()
  ) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      "Cancel command symbol does not match the persisted order.",
      { orderId: order.orderId, exchangeId: order.exchangeId },
    );
  }
}

function validateCancellationResponse(
  response: ExchangeOrderCancellationResponse,
  request: ExchangeOrderCancellationRequest,
): void {
  if (!isRecord(response)) {
    throw new OrderCancellerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange cancellation response must be a record object.",
      { orderId: request.orderId, exchangeId: request.exchangeId },
    );
  }

  if (response.orderId !== request.orderId) {
    throw new OrderCancellerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange cancellation response orderId does not match the request.",
      { orderId: request.orderId, exchangeId: request.exchangeId },
    );
  }

  if (
    normalizeExchangeId(response.exchangeId) !==
    normalizeExchangeId(request.exchangeId)
  ) {
    throw new OrderCancellerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange cancellation response exchangeId does not match the request.",
      { orderId: request.orderId, exchangeId: response.exchangeId },
    );
  }

  const statuses = new Set([
    "CANCELLED",
    "PENDING",
    "REJECTED",
    "NOT_FOUND",
    "ALREADY_TERMINAL",
    "UNKNOWN",
  ]);

  if (!statuses.has(response.status)) {
    throw new OrderCancellerError(
      "INVALID_TRANSPORT_RESPONSE",
      `Unsupported cancellation status "${String(response.status)}".`,
      { orderId: request.orderId, exchangeId: request.exchangeId },
    );
  }

  normalizeTimestamp(response.receivedAt, "response.receivedAt");

  if (response.cancelledAt !== undefined) {
    normalizeTimestamp(response.cancelledAt, "response.cancelledAt");
  }

  if (response.status === "CANCELLED" && response.cancelledAt === undefined) {
    throw new OrderCancellerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Cancelled response must contain cancelledAt.",
      { orderId: request.orderId, exchangeId: request.exchangeId },
    );
  }
}

function mapCancellationCommandStatus(
  status: ExchangeOrderCancellationResponse["status"],
): OrderCommandResult["status"] {
  switch (status) {
    case "CANCELLED":
    case "ALREADY_TERMINAL":
      return "COMPLETED";
    case "PENDING":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    case "NOT_FOUND":
    case "UNKNOWN":
      return "UNKNOWN";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

function createExecutionEvent(
  order: LiveOrder,
  idGenerator: OrderIdGenerator,
  metadata: Readonly<Record<string, unknown>>,
  failure?: LiveOrderFailure,
): OrderExecutionEvent {
  const latest = order.transitions[order.transitions.length - 1];

  return Object.freeze({
    eventId: normalizeIdentifier(idGenerator.nextEventId(), "eventId"),
    orderId: order.orderId,
    ...(order.exchangeId === undefined ? {} : { exchangeId: order.exchangeId }),
    ...(order.exchangeOrderId === undefined
      ? {}
      : { exchangeOrderId: order.exchangeOrderId }),
    state: order.state,
    occurredAt: latest?.occurredAt ?? order.updatedAt,
    sequence: order.version,
    ...(failure === undefined ? {} : { failure }),
    metadata: freezeRecord({
      ...metadata,
      orderVersion: order.version,
      transitionId: latest?.transitionId,
    }),
  });
}

function createCommandResult(
  command: CancelOrderCommand,
  order: LiveOrder,
  status: OrderCommandResult["status"],
  completedAt: number,
  metadata: Readonly<Record<string, unknown>>,
  failure?: LiveOrderFailure,
): OrderCommandResult<LiveOrder> {
  return Object.freeze({
    commandId: command.context.commandId,
    operation: "CANCEL",
    status,
    result: order,
    ...(failure === undefined ? {} : { failure }),
    completedAt: normalizeTimestamp(completedAt, "completedAt"),
    metadata: freezeRecord({
      ...metadata,
      orderId: order.orderId,
      orderState: order.state,
      orderVersion: order.version,
    }),
  });
}

function normalizeCancellationFailure(
  cause: unknown,
  occurredAt: number,
  exchangeId: string,
): LiveOrderFailure {
  if (isRecord(cause)) {
    return createCancellationFailure({
      category: inferFailureCategory(cause),
      code: readString(cause, "code") ?? "ORDER_CANCELLATION_FAILED",
      message: readString(cause, "message") ?? "Order cancellation failed.",
      occurredAt: normalizeTimestamp(occurredAt, "failure.occurredAt"),
      retryable: readBoolean(cause, "retryable") ?? true,
      metadata: {
        exchangeId,
        causeName: readString(cause, "name"),
      },
    });
  }

  return createCancellationFailure({
    category: "UNKNOWN",
    code: "ORDER_CANCELLATION_FAILED",
    message:
      cause instanceof Error ? cause.message : "Unknown order cancellation failure.",
    occurredAt: normalizeTimestamp(occurredAt, "failure.occurredAt"),
    retryable: true,
    metadata: { exchangeId },
  });
}

function inferFailureCategory(
  cause: Readonly<Record<string, unknown>>,
): LiveOrderFailureCategory {
  const code = (readString(cause, "code") ?? "").toUpperCase();

  if (code.includes("AUTH") || code.includes("SIGNATURE") || code.includes("API_KEY")) {
    return "AUTHENTICATION";
  }
  if (code.includes("RATE") || code.includes("LIMIT")) {
    return "RATE_LIMIT";
  }
  if (code.includes("TIMEOUT")) {
    return "TIMEOUT";
  }
  if (
    code.includes("NETWORK") ||
    code.includes("TRANSPORT") ||
    code.includes("CONNECT")
  ) {
    return "CONNECTIVITY";
  }
  if (code.includes("REJECT")) {
    return "EXCHANGE_REJECTION";
  }

  return "UNKNOWN";
}

function createCancellationFailure(
  input: Readonly<{
    category: LiveOrderFailureCategory;
    code: string;
    message: string;
    occurredAt: number;
    retryable: boolean;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): LiveOrderFailure {
  return Object.freeze({
    category: input.category,
    code: normalizeIdentifier(input.code, "failure.code"),
    message: normalizeText(input.message, "failure.message"),
    occurredAt: normalizeTimestamp(input.occurredAt, "failure.occurredAt"),
    retryable: input.retryable,
    metadata: freezeRecord(input.metadata),
  });
}

function resolveOptions(
  options: LiveOrderCancellerOptions,
): ResolvedLiveOrderCancellerOptions {
  const resolved: ResolvedLiveOrderCancellerOptions = {
    persistPendingState:
      options.persistPendingState ?? DEFAULT_OPTIONS.persistPendingState,
    publishLifecycleEvents:
      options.publishLifecycleEvents ?? DEFAULT_OPTIONS.publishLifecycleEvents,
    allowTerminalNoop:
      options.allowTerminalNoop ?? DEFAULT_OPTIONS.allowTerminalNoop,
    captureTransportExceptions:
      options.captureTransportExceptions ??
      DEFAULT_OPTIONS.captureTransportExceptions,
    metadata: freezeRecord(options.metadata ?? EMPTY_METADATA),
  };

  return Object.freeze(resolved);
}

function freezeCancellationResult(
  result: LiveOrderCancellationResult,
): LiveOrderCancellationResult {
  return Object.freeze({
    commandResult: result.commandResult,
    order: result.order,
    ...(result.request === undefined ? {} : { request: result.request }),
    ...(result.response === undefined ? {} : { response: result.response }),
    events: Object.freeze([...result.events]),
  });
}

function normalizeExchangeId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OrderCancellerError(
      "INVALID_EXCHANGE_ID",
      "Exchange identifier must be a non-empty string.",
    );
  }
  return value.trim().toLowerCase();
}

function normalizeIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OrderCancellerError(
      "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function normalizeText(value: unknown, field: string): string {
  return normalizeIdentifier(value, field);
}

function normalizeTimestamp(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new OrderCancellerError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }
  return value;
}

function ensureMonotonicTimestamp(candidate: number, minimum: number): number {
  return Math.max(
    normalizeTimestamp(candidate, "timestamp"),
    normalizeTimestamp(minimum, "minimumTimestamp"),
  );
}

function validateTransport(
  value: unknown,
): asserts value is OrderExecutionTransport {
  if (
    !isRecord(value) ||
    typeof value.submit !== "function" ||
    typeof value.cancel !== "function" ||
    typeof value.replace !== "function" ||
    typeof value.fetchOrder !== "function"
  ) {
    throw new OrderCancellerError(
      "INVALID_DEPENDENCY",
      "Order execution transport must provide submit(), cancel(), replace(), and fetchOrder().",
    );
  }
}

function validateRepository(value: unknown): asserts value is OrderRepository {
  if (
    !isRecord(value) ||
    typeof value.save !== "function" ||
    typeof value.findByOrderId !== "function" ||
    typeof value.findByClientOrderId !== "function" ||
    typeof value.findByExchangeOrderId !== "function" ||
    typeof value.query !== "function"
  ) {
    throw new OrderCancellerError(
      "INVALID_DEPENDENCY",
      "Order repository must provide the complete OrderRepository contract.",
    );
  }
}

function validateIdGenerator(value: unknown): asserts value is OrderIdGenerator {
  if (!isRecord(value) || typeof value.nextEventId !== "function") {
    throw new OrderCancellerError(
      "INVALID_DEPENDENCY",
      "Order ID generator must provide nextEventId().",
    );
  }
}

function validateClock(value: unknown): asserts value is OrderClock {
  if (!isRecord(value) || typeof value.now !== "function") {
    throw new OrderCancellerError(
      "INVALID_DEPENDENCY",
      "Order canceller clock must provide now().",
    );
  }
}

function validatePublisher(
  value: unknown,
): asserts value is OrderEventPublisher {
  if (!isRecord(value) || typeof value.publish !== "function") {
    throw new OrderCancellerError(
      "INVALID_DEPENDENCY",
      "Order event publisher must provide publish().",
    );
  }
}

function readString(
  source: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function readBoolean(
  source: Readonly<Record<string, unknown>>,
  key: string,
): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeRecord(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(source).sort()) {
    const value = source[key];
    if (value !== undefined) {
      result[key] = freezeUnknown(value);
    }
  }

  return Object.freeze(result);
}

function freezeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeUnknown));
  }
  if (isRecord(value)) {
    return freezeRecord(value);
  }
  return value;
}