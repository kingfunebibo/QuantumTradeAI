/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 7:
 * Live Order Replacer
 *
 * Resolves persisted live orders, validates quantity and price amendments,
 * submits deterministic exchange replacement requests, persists immutable
 * lifecycle transitions, records failures, and publishes execution events.
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
  ExchangeOrderReplacementRequest,
  ExchangeOrderReplacementResponse,
  OrderClock,
  OrderCommandResult,
  OrderEventPublisher,
  OrderExecutionEvent,
  OrderExecutionTransport,
  OrderIdGenerator,
  OrderRepository,
  ReplaceOrderCommand,
} from "./order-types";

export type OrderReplacerErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "INVALID_ORDER_STATE"
  | "ORDER_NOT_FOUND"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_REPLACEMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_TRANSPORT_RESPONSE"
  | "PERSISTENCE_FAILED"
  | "EVENT_PUBLICATION_FAILED"
  | "REPLACEMENT_FAILED";

export class OrderReplacerError extends Error {
  public readonly code:
    OrderReplacerErrorCode;

  public readonly orderId?: string;

  public readonly exchangeId?: string;

  public readonly retryable: boolean;

  public constructor(
    code: OrderReplacerErrorCode,
    message: string,
    options: Readonly<{
      orderId?: string;
      exchangeId?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "OrderReplacerError";
    this.code = code;
    this.orderId = options.orderId;
    this.exchangeId =
      options.exchangeId;
    this.retryable =
      options.retryable ?? false;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export interface LiveOrderReplacerOptions {
  /**
   * Persists the amendment request before transport execution.
   */
  readonly persistPendingState?: boolean;

  /**
   * Publishes persisted lifecycle changes.
   */
  readonly publishLifecycleEvents?: boolean;

  /**
   * Converts transport exceptions into immutable FAILED orders.
   */
  readonly captureTransportExceptions?: boolean;

  /**
   * Allows an exchange response with UNKNOWN status to complete the command as
   * UNKNOWN rather than FAILED.
   */
  readonly unknownResponseCompletesCommand?: boolean;

  /**
   * Static metadata included in requests, events, and command results.
   */
  readonly metadata?:
    Readonly<Record<string, unknown>>;
}

interface ResolvedLiveOrderReplacerOptions {
  readonly persistPendingState: boolean;
  readonly publishLifecycleEvents: boolean;
  readonly captureTransportExceptions: boolean;
  readonly unknownResponseCompletesCommand: boolean;
  readonly metadata:
    Readonly<Record<string, unknown>>;
}

export interface LiveOrderReplacementResult {
  readonly commandResult:
    OrderCommandResult<LiveOrder>;

  readonly order: LiveOrder;

  readonly request:
    ExchangeOrderReplacementRequest;

  readonly response?:
    ExchangeOrderReplacementResponse;

  readonly events:
    readonly OrderExecutionEvent[];
}

export interface LiveOrderReplacerContract {
  replace(
    command: ReplaceOrderCommand,
  ): Promise<LiveOrderReplacementResult>;
}

const EMPTY_METADATA:
  Readonly<Record<string, unknown>> =
  Object.freeze({});

const REPLACEABLE_STATES =
  new Set<LiveOrder["state"]>([
    "ACCEPTED",
    "PARTIALLY_FILLED",
  ]);

const DEFAULT_OPTIONS:
  ResolvedLiveOrderReplacerOptions =
  Object.freeze({
    persistPendingState: true,
    publishLifecycleEvents: true,
    captureTransportExceptions: true,
    unknownResponseCompletesCommand: true,
    metadata: EMPTY_METADATA,
  });

export class SystemOrderReplacerClock
  implements OrderClock
{
  public now(): number {
    return Date.now();
  }
}

export class LiveOrderReplacer
  implements LiveOrderReplacerContract
{
  private readonly transport:
    OrderExecutionTransport;

  private readonly repository:
    OrderRepository;

  private readonly idGenerator:
    OrderIdGenerator;

  private readonly clock:
    OrderClock;

  private readonly publisher?:
    OrderEventPublisher;

  private readonly options:
    ResolvedLiveOrderReplacerOptions;

  public constructor(
    transport: OrderExecutionTransport,
    repository: OrderRepository,
    idGenerator: OrderIdGenerator,
    options:
      LiveOrderReplacerOptions = {},
    dependencies: Readonly<{
      clock?: OrderClock;
      publisher?: OrderEventPublisher;
    }> = {},
  ) {
    validateTransport(transport);
    validateRepository(repository);
    validateIdGenerator(idGenerator);

    const clock =
      dependencies.clock ??
      new SystemOrderReplacerClock();

    validateClock(clock);

    if (
      dependencies.publisher !==
      undefined
    ) {
      validatePublisher(
        dependencies.publisher,
      );
    }

    this.transport = transport;
    this.repository = repository;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.publisher =
      dependencies.publisher;
    this.options =
      resolveOptions(options);
  }

  public async replace(
    command: ReplaceOrderCommand,
  ): Promise<LiveOrderReplacementResult> {
    validateReplaceCommand(command);

    let order =
      await this.resolveOrder(command);

    validateLiveOrder(order);

    if (isLiveOrderTerminal(order)) {
      throw new OrderReplacerError(
        "INVALID_ORDER_STATE",
        `Order "${order.orderId}" is terminal in state "${order.state}" and cannot be replaced.`,
        {
          orderId:
            order.orderId,
          exchangeId:
            order.exchangeId,
        },
      );
    }

    if (
      !REPLACEABLE_STATES.has(
        order.state,
      )
    ) {
      throw new OrderReplacerError(
        "INVALID_ORDER_STATE",
        `Order "${order.orderId}" cannot be replaced while in state "${order.state}".`,
        {
          orderId:
            order.orderId,
          exchangeId:
            order.exchangeId,
        },
      );
    }

    validateReplacementAgainstOrder(
      command,
      order,
    );

    const request =
      createExchangeReplacementRequest(
        command,
        order,
        this.now(),
        this.options.metadata,
      );

    const events:
      OrderExecutionEvent[] = [];

    order =
      transitionLiveOrder(
        order,
        {
          state: "REPLACE_PENDING",
          occurredAt:
            ensureMonotonicTimestamp(
              request.requestedAt,
              order.updatedAt,
            ),
          reason:
            command.reason ??
            "Order replacement requested.",
          metadata: {
            commandId:
              command.context.commandId,
            exchangeId:
              request.exchangeId,
            requestedQuantity:
              request.quantity,
            requestedLimitPrice:
              request.limitPrice,
            requestedStopPrice:
              request.stopPrice,
            requestedTimeInForce:
              request.timeInForce,
          },
        },
      );

    if (
      this.options.persistPendingState
    ) {
      await this.persist(order);

      await this.emitEvent(
        order,
        events,
        {
          phase:
            "REPLACE_PENDING",
          requestedQuantity:
            request.quantity,
          requestedLimitPrice:
            request.limitPrice,
          requestedStopPrice:
            request.stopPrice,
          requestedTimeInForce:
            request.timeInForce,
        },
      );
    }

    let response:
      ExchangeOrderReplacementResponse;

    try {
      response =
        await this.transport.replace(
          request,
        );
    } catch (cause: unknown) {
      if (
        !this.options
          .captureTransportExceptions
      ) {
        throw new OrderReplacerError(
          "REPLACEMENT_FAILED",
          `Order "${order.orderId}" could not be replaced on exchange "${request.exchangeId}".`,
          {
            orderId:
              order.orderId,
            exchangeId:
              request.exchangeId,
            retryable: true,
            cause,
          },
        );
      }

      const failure =
        normalizeReplacementFailure(
          cause,
          this.now(),
          request.exchangeId,
        );

      order =
        applyLiveOrderFailure(
          order,
          {
            failure,
            transitionToFailed: true,
          },
        );

      await this.persist(order);

      await this.emitEvent(
        order,
        events,
        {
          phase:
            "TRANSPORT_FAILURE",
          failureCode:
            failure.code,
        },
        failure,
      );

      return freezeReplacementResult({
        commandResult:
          createCommandResult(
            command,
            order,
            "FAILED",
            order.updatedAt,
            {
              replacementStatus:
                "UNKNOWN",
              failureCode:
                failure.code,
            },
            failure,
          ),
        order,
        request,
        events:
          Object.freeze(events),
      });
    }

    validateReplacementResponse(
      response,
      request,
    );

    const outcome =
      applyReplacementResponse(
        order,
        request,
        response,
      );

    order = outcome.order;

    await this.persist(order);

    await this.emitEvent(
      order,
      events,
      {
        phase:
          response.status,
        replacementStatus:
          response.status,
        replacementClientOrderId:
          response.replacementClientOrderId,
      },
      outcome.failure,
    );

    return freezeReplacementResult({
      commandResult:
        createCommandResult(
          command,
          order,
          mapReplacementCommandStatus(
            response.status,
            this.options,
          ),
          order.updatedAt,
          {
            replacementStatus:
              response.status,
            exchangeId:
              response.exchangeId,
            replacementExchangeOrderId:
              response.replacementExchangeOrderId,
            replacementClientOrderId:
              response.replacementClientOrderId,
          },
          outcome.failure,
        ),
      order,
      request,
      response,
      events:
        Object.freeze(events),
    });
  }

  private async resolveOrder(
    command: ReplaceOrderCommand,
  ): Promise<LiveOrder> {
    let order =
      await this.repository
        .findByOrderId(
          command.orderId,
        );

    if (
      order === undefined &&
      command.clientOrderId !==
        undefined
    ) {
      order =
        await this.repository
          .findByClientOrderId(
            command.clientOrderId,
          );
    }

    if (
      order === undefined &&
      command.exchangeId !==
        undefined &&
      command.exchangeOrderId !==
        undefined
    ) {
      order =
        await this.repository
          .findByExchangeOrderId(
            normalizeExchangeId(
              command.exchangeId,
            ),
            normalizeIdentifier(
              command.exchangeOrderId,
              "command.exchangeOrderId",
            ),
          );
    }

    if (order === undefined) {
      throw new OrderReplacerError(
        "ORDER_NOT_FOUND",
        `Order "${command.orderId}" was not found.`,
        {
          orderId:
            command.orderId,
          exchangeId:
            command.exchangeId,
        },
      );
    }

    if (
      order.orderId !==
      command.orderId
    ) {
      throw new OrderReplacerError(
        "INVALID_COMMAND",
        `Resolved order "${order.orderId}" does not match command orderId "${command.orderId}".`,
        {
          orderId:
            command.orderId,
          exchangeId:
            order.exchangeId,
        },
      );
    }

    validateCommandOrderIdentity(
      command,
      order,
    );

    return order;
  }

  private async persist(
    order: LiveOrder,
  ): Promise<void> {
    try {
      await this.repository.save(
        order,
      );
    } catch (cause: unknown) {
      throw new OrderReplacerError(
        "PERSISTENCE_FAILED",
        `Failed to persist order "${order.orderId}" in state "${order.state}".`,
        {
          orderId:
            order.orderId,
          exchangeId:
            order.exchangeId,
          retryable: true,
          cause,
        },
      );
    }
  }

  private async emitEvent(
    order: LiveOrder,
    events:
      OrderExecutionEvent[],
    metadata:
      Readonly<Record<string, unknown>>,
    failure?:
      LiveOrderFailure,
  ): Promise<void> {
    if (
      !this.options
        .publishLifecycleEvents ||
      this.publisher === undefined
    ) {
      return;
    }

    const event =
      createExecutionEvent(
        order,
        this.idGenerator,
        metadata,
        failure,
      );

    try {
      await this.publisher.publish(
        event,
      );
    } catch (cause: unknown) {
      throw new OrderReplacerError(
        "EVENT_PUBLICATION_FAILED",
        `Failed to publish replacement event for order "${order.orderId}".`,
        {
          orderId:
            order.orderId,
          exchangeId:
            order.exchangeId,
          retryable: true,
          cause,
        },
      );
    }

    events.push(event);
  }

  private now(): number {
    return normalizeTimestamp(
      this.clock.now(),
      "orderReplacer.clock.now()",
    );
  }
}

export function createExchangeReplacementRequest(
  command: ReplaceOrderCommand,
  order: LiveOrder,
  requestedAt: number,
  metadata:
    Readonly<Record<string, unknown>> =
      EMPTY_METADATA,
): ExchangeOrderReplacementRequest {
  validateReplaceCommand(command);
  validateLiveOrder(order);
  validateCommandOrderIdentity(
    command,
    order,
  );
  validateReplacementAgainstOrder(
    command,
    order,
  );

  const exchangeId =
    normalizeExchangeId(
      command.exchangeId ??
      order.exchangeId,
    );

  const exchangeOrderId =
    command.exchangeOrderId ??
    order.exchangeOrderId;

  const clientOrderId =
    command.clientOrderId ??
    order.clientOrderId;

  const quantity =
    command.quantity ??
    order.requestedQuantity;

  return Object.freeze({
    orderId:
      order.orderId,
    clientOrderId:
      normalizeIdentifier(
        clientOrderId,
        "clientOrderId",
      ),
    exchangeId,
    ...(exchangeOrderId ===
    undefined
      ? {}
      : {
          exchangeOrderId:
            normalizeIdentifier(
              exchangeOrderId,
              "exchangeOrderId",
            ),
        }),
    ...(order.accountId ===
    undefined
      ? {}
      : {
          accountId:
            order.accountId,
        }),
    symbol:
      order.symbol,
    quantity:
      normalizePositiveNumber(
        quantity,
        "quantity",
      ),
    ...(command.limitPrice ===
    undefined
      ? {}
      : {
          limitPrice:
            normalizePositiveNumber(
              command.limitPrice,
              "limitPrice",
            ),
        }),
    ...(command.stopPrice ===
    undefined
      ? {}
      : {
          stopPrice:
            normalizePositiveNumber(
              command.stopPrice,
              "stopPrice",
            ),
        }),
    ...(command.timeInForce ===
    undefined
      ? {}
      : {
          timeInForce:
            command.timeInForce,
        }),
    requestedAt:
      normalizeTimestamp(
        requestedAt,
        "requestedAt",
      ),
    ...(command.reason ===
    undefined
      ? {}
      : {
          reason:
            normalizeText(
              command.reason,
              "command.reason",
            ),
        }),
    metadata:
      freezeRecord({
        ...metadata,
        ...command.context.metadata,
        commandId:
          command.context.commandId,
        correlationId:
          command.context.correlationId,
        causationId:
          command.context.causationId,
        requestId:
          command.context.requestId,
        orderVersion:
          order.version,
        orderState:
          order.state,
        originalQuantity:
          order.requestedQuantity,
        originalLimitPrice:
          order.limitPrice,
        originalStopPrice:
          order.stopPrice,
      }),
  });
}

function applyReplacementResponse(
  order: LiveOrder,
  request:
    ExchangeOrderReplacementRequest,
  response:
    ExchangeOrderReplacementResponse,
): Readonly<{
  order: LiveOrder;
  failure?: LiveOrderFailure;
}> {
  const occurredAt =
    ensureMonotonicTimestamp(
      response.replacedAt ??
      response.receivedAt,
      order.updatedAt,
    );

  switch (response.status) {
    case "REPLACED": {
      const replacementMetadata:
        Readonly<Record<string, unknown>> =
        freezeRecord({
          exchangeId:
            response.exchangeId,
          replacementExchangeOrderId:
            response.replacementExchangeOrderId,
          replacementClientOrderId:
            response.replacementClientOrderId,
          replacementStatus:
            response.status,
          requestedQuantity:
            request.quantity,
          requestedLimitPrice:
            request.limitPrice,
          requestedStopPrice:
            request.stopPrice,
          requestedTimeInForce:
            request.timeInForce,
          ...response.metadata,
        });

      return Object.freeze({
        order:
          transitionLiveOrder(
            order,
            {
              state: "REPLACED",
              occurredAt,
              reason:
                response.message ??
                "Order replaced by exchange.",
              metadata:
                replacementMetadata,
            },
          ),
      });
    }

    case "PENDING":
      return Object.freeze({
        order,
      });

    case "REJECTED": {
      const failure =
        response.failure ??
        createReplacementFailure({
          category:
            "EXCHANGE_REJECTION",
          code:
            "ORDER_REPLACEMENT_REJECTED",
          message:
            response.message ??
            "Order replacement rejected by exchange.",
          occurredAt,
          retryable: false,
          metadata: {
            exchangeId:
              response.exchangeId,
            replacementExchangeOrderId:
              response.replacementExchangeOrderId,
            replacementClientOrderId:
              response.replacementClientOrderId,
          },
        });

      const failed =
        applyLiveOrderFailure(
          order,
          {
            failure,
            transitionToFailed: false,
          },
        );

      return Object.freeze({
        order:
          transitionLiveOrder(
            failed,
            {
              state: "UNKNOWN",
              occurredAt:
                ensureMonotonicTimestamp(
                  failure.occurredAt,
                  failed.updatedAt,
                ),
              reason:
                failure.message,
              metadata: {
                replacementStatus:
                  response.status,
                failureCode:
                  failure.code,
              },
            },
          ),
        failure,
      });
    }

    case "NOT_FOUND":
    case "ALREADY_TERMINAL":
    case "UNKNOWN": {
      const failure =
        response.failure ??
        createReplacementFailure({
          category:
            "RECONCILIATION",
          code:
            `ORDER_REPLACEMENT_${response.status}`,
          message:
            response.message ??
            `Exchange returned replacement status "${response.status}".`,
          occurredAt,
          retryable:
            response.status !==
            "ALREADY_TERMINAL",
          metadata: {
            exchangeId:
              response.exchangeId,
            replacementExchangeOrderId:
              response.replacementExchangeOrderId,
            replacementClientOrderId:
              response.replacementClientOrderId,
            replacementStatus:
              response.status,
          },
        });

      const failed =
        applyLiveOrderFailure(
          order,
          {
            failure,
            transitionToFailed: false,
          },
        );

      return Object.freeze({
        order:
          transitionLiveOrder(
            failed,
            {
              state: "UNKNOWN",
              occurredAt:
                ensureMonotonicTimestamp(
                  failure.occurredAt,
                  failed.updatedAt,
                ),
              reason:
                failure.message,
              metadata: {
                replacementStatus:
                  response.status,
                failureCode:
                  failure.code,
              },
            },
          ),
        failure,
      });
    }

    default: {
      const exhaustiveCheck:
        never = response.status;

      return exhaustiveCheck;
    }
  }
}

function validateReplaceCommand(
  command: ReplaceOrderCommand,
): void {
  if (!isRecord(command)) {
    throw new OrderReplacerError(
      "INVALID_COMMAND",
      "Replace-order command must be a record object.",
    );
  }

  if (
    command.operation !== "REPLACE"
  ) {
    throw new OrderReplacerError(
      "INVALID_COMMAND",
      `Expected REPLACE operation but received "${String(
        command.operation,
      )}".`,
    );
  }

  normalizeIdentifier(
    command.orderId,
    "command.orderId",
  );

  normalizeIdentifier(
    command.context.commandId,
    "command.context.commandId",
  );

  normalizeIdentifier(
    command.context.correlationId,
    "command.context.correlationId",
  );

  normalizeTimestamp(
    command.context.initiatedAt,
    "command.context.initiatedAt",
  );

  if (
    command.clientOrderId !==
    undefined
  ) {
    normalizeIdentifier(
      command.clientOrderId,
      "command.clientOrderId",
    );
  }

  if (
    command.exchangeId !==
    undefined
  ) {
    normalizeExchangeId(
      command.exchangeId,
    );
  }

  if (
    command.exchangeOrderId !==
    undefined
  ) {
    normalizeIdentifier(
      command.exchangeOrderId,
      "command.exchangeOrderId",
    );
  }

  if (
    command.quantity !== undefined
  ) {
    normalizePositiveNumber(
      command.quantity,
      "command.quantity",
    );
  }

  if (
    command.limitPrice !==
    undefined
  ) {
    normalizePositiveNumber(
      command.limitPrice,
      "command.limitPrice",
    );
  }

  if (
    command.stopPrice !==
    undefined
  ) {
    normalizePositiveNumber(
      command.stopPrice,
      "command.stopPrice",
    );
  }


  if (
    command.reason !== undefined
  ) {
    normalizeText(
      command.reason,
      "command.reason",
    );
  }

  const hasReplacement =
    command.quantity !== undefined ||
    command.limitPrice !== undefined ||
    command.stopPrice !== undefined ||
    command.timeInForce !== undefined;

  if (!hasReplacement) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      "Replace-order command must change at least one replaceable field.",
      {
        orderId:
          command.orderId,
        exchangeId:
          command.exchangeId,
      },
    );
  }
}

function validateReplacementAgainstOrder(
  command: ReplaceOrderCommand,
  order: LiveOrder,
): void {
  const replacementQuantity =
    command.quantity ??
    order.requestedQuantity;

  if (
    replacementQuantity <
    order.filledQuantity
  ) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      `Replacement quantity ${replacementQuantity} cannot be below filled quantity ${order.filledQuantity}.`,
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }

  if (
    replacementQuantity ===
    order.filledQuantity
  ) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      "Replacement quantity must leave a positive remaining quantity.",
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }

  if (
    command.limitPrice !==
      undefined &&
    order.type === "MARKET"
  ) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      "A market order cannot be replaced with a limit price.",
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }

  if (
    command.stopPrice !==
      undefined &&
    order.type !== "STOP" &&
    order.type !== "STOP_LIMIT"
  ) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      `Order type "${order.type}" does not support stopPrice replacement.`,
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }

}

function validateCommandOrderIdentity(
  command: ReplaceOrderCommand,
  order: LiveOrder,
): void {
  if (
    command.clientOrderId !==
      undefined &&
    command.clientOrderId !==
      order.clientOrderId
  ) {
    throw new OrderReplacerError(
      "INVALID_COMMAND",
      "Replace command clientOrderId does not match the persisted order.",
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }

  if (
    command.exchangeId !==
      undefined &&
    normalizeExchangeId(
      command.exchangeId,
    ) !==
      normalizeExchangeId(
        order.exchangeId,
      )
  ) {
    throw new OrderReplacerError(
      "INVALID_EXCHANGE_ID",
      "Replace command exchangeId does not match the persisted order.",
      {
        orderId:
          order.orderId,
        exchangeId:
          command.exchangeId,
      },
    );
  }

  if (
    command.exchangeOrderId !==
      undefined &&
    order.exchangeOrderId !==
      undefined &&
    command.exchangeOrderId !==
      order.exchangeOrderId
  ) {
    throw new OrderReplacerError(
      "INVALID_COMMAND",
      "Replace command exchangeOrderId does not match the persisted order.",
      {
        orderId:
          order.orderId,
        exchangeId:
          order.exchangeId,
      },
    );
  }
}

function validateReplacementResponse(
  response:
    ExchangeOrderReplacementResponse,
  request:
    ExchangeOrderReplacementRequest,
): void {
  if (!isRecord(response)) {
    throw new OrderReplacerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange replacement response must be a record object.",
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }

  if (
    response.orderId !==
      request.orderId
  ) {
    throw new OrderReplacerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange replacement response orderId does not match the request.",
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }

  if (
    normalizeExchangeId(
      response.exchangeId,
    ) !==
    normalizeExchangeId(
      request.exchangeId,
    )
  ) {
    throw new OrderReplacerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange replacement response exchangeId does not match the request.",
      {
        orderId:
          request.orderId,
        exchangeId:
          response.exchangeId,
      },
    );
  }

  const statuses =
    new Set([
      "REPLACED",
      "PENDING",
      "REJECTED",
      "NOT_FOUND",
      "ALREADY_TERMINAL",
      "UNKNOWN",
    ]);

  if (
    !statuses.has(
      response.status,
    )
  ) {
    throw new OrderReplacerError(
      "INVALID_TRANSPORT_RESPONSE",
      `Unsupported replacement status "${String(
        response.status,
      )}".`,
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }

  normalizeTimestamp(
    response.receivedAt,
    "response.receivedAt",
  );

  if (
    response.replacedAt !==
    undefined
  ) {
    normalizeTimestamp(
      response.replacedAt,
      "response.replacedAt",
    );
  }

  if (
    response.status ===
      "REPLACED" &&
    response.replacedAt ===
      undefined
  ) {
    throw new OrderReplacerError(
      "INVALID_TRANSPORT_RESPONSE",
      "Replaced response must contain replacedAt.",
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }
}

function mapReplacementCommandStatus(
  status:
    ExchangeOrderReplacementResponse["status"],
  options:
    ResolvedLiveOrderReplacerOptions,
): OrderCommandResult["status"] {
  switch (status) {
    case "REPLACED":
      return "COMPLETED";

    case "PENDING":
      return "PENDING";

    case "REJECTED":
      return "REJECTED";

    case "NOT_FOUND":
    case "ALREADY_TERMINAL":
      return "UNKNOWN";

    case "UNKNOWN":
      return options
        .unknownResponseCompletesCommand
        ? "UNKNOWN"
        : "FAILED";

    default: {
      const exhaustiveCheck:
        never = status;

      return exhaustiveCheck;
    }
  }
}

function createExecutionEvent(
  order: LiveOrder,
  idGenerator:
    OrderIdGenerator,
  metadata:
    Readonly<Record<string, unknown>>,
  failure?:
    LiveOrderFailure,
): OrderExecutionEvent {
  const latest =
    order.transitions[
      order.transitions.length - 1
    ];

  return Object.freeze({
    eventId:
      normalizeIdentifier(
        idGenerator.nextEventId(),
        "eventId",
      ),
    orderId:
      order.orderId,
    ...(order.exchangeId ===
    undefined
      ? {}
      : {
          exchangeId:
            order.exchangeId,
        }),
    ...(order.exchangeOrderId ===
    undefined
      ? {}
      : {
          exchangeOrderId:
            order.exchangeOrderId,
        }),
    state:
      order.state,
    occurredAt:
      latest?.occurredAt ??
      order.updatedAt,
    sequence:
      order.version,
    ...(failure === undefined
      ? {}
      : {
          failure,
        }),
    metadata:
      freezeRecord({
        ...metadata,
        orderVersion:
          order.version,
        transitionId:
          latest?.transitionId,
      }),
  });
}

function createCommandResult(
  command: ReplaceOrderCommand,
  order: LiveOrder,
  status:
    OrderCommandResult["status"],
  completedAt: number,
  metadata:
    Readonly<Record<string, unknown>>,
  failure?:
    LiveOrderFailure,
): OrderCommandResult<LiveOrder> {
  return Object.freeze({
    commandId:
      command.context.commandId,
    operation: "REPLACE",
    status,
    result: order,
    ...(failure === undefined
      ? {}
      : {
          failure,
        }),
    completedAt:
      normalizeTimestamp(
        completedAt,
        "completedAt",
      ),
    metadata:
      freezeRecord({
        ...metadata,
        orderId:
          order.orderId,
        orderState:
          order.state,
        orderVersion:
          order.version,
      }),
  });
}

function normalizeReplacementFailure(
  cause: unknown,
  occurredAt: number,
  exchangeId: string,
): LiveOrderFailure {
  if (isRecord(cause)) {
    return createReplacementFailure({
      category:
        inferFailureCategory(
          cause,
        ),
      code:
        readString(
          cause,
          "code",
        ) ??
        "ORDER_REPLACEMENT_FAILED",
      message:
        readString(
          cause,
          "message",
        ) ??
        "Order replacement failed.",
      occurredAt:
        normalizeTimestamp(
          occurredAt,
          "failure.occurredAt",
        ),
      retryable:
        readBoolean(
          cause,
          "retryable",
        ) ??
        true,
      metadata: {
        exchangeId,
        causeName:
          readString(
            cause,
            "name",
          ),
      },
    });
  }

  return createReplacementFailure({
    category: "UNKNOWN",
    code:
      "ORDER_REPLACEMENT_FAILED",
    message:
      cause instanceof Error
        ? cause.message
        : "Unknown order replacement failure.",
    occurredAt:
      normalizeTimestamp(
        occurredAt,
        "failure.occurredAt",
      ),
    retryable: true,
    metadata: {
      exchangeId,
    },
  });
}

function inferFailureCategory(
  cause:
    Readonly<Record<string, unknown>>,
): LiveOrderFailureCategory {
  const code =
    (
      readString(
        cause,
        "code",
      ) ?? ""
    ).toUpperCase();

  if (
    code.includes("AUTH") ||
    code.includes("SIGNATURE") ||
    code.includes("API_KEY")
  ) {
    return "AUTHENTICATION";
  }

  if (
    code.includes("RATE") ||
    code.includes("LIMIT")
  ) {
    return "RATE_LIMIT";
  }

  if (
    code.includes("TIMEOUT")
  ) {
    return "TIMEOUT";
  }

  if (
    code.includes("NETWORK") ||
    code.includes("TRANSPORT") ||
    code.includes("CONNECT")
  ) {
    return "CONNECTIVITY";
  }

  if (
    code.includes("REJECT")
  ) {
    return "EXCHANGE_REJECTION";
  }

  return "UNKNOWN";
}

function createReplacementFailure(
  input: Readonly<{
    category:
      LiveOrderFailureCategory;
    code: string;
    message: string;
    occurredAt: number;
    retryable: boolean;
    metadata:
      Readonly<Record<string, unknown>>;
  }>,
): LiveOrderFailure {
  return Object.freeze({
    category:
      input.category,
    code:
      normalizeIdentifier(
        input.code,
        "failure.code",
      ),
    message:
      normalizeText(
        input.message,
        "failure.message",
      ),
    occurredAt:
      normalizeTimestamp(
        input.occurredAt,
        "failure.occurredAt",
      ),
    retryable:
      input.retryable,
    metadata:
      freezeRecord(
        input.metadata,
      ),
  });
}

function resolveOptions(
  options:
    LiveOrderReplacerOptions,
): ResolvedLiveOrderReplacerOptions {
  return Object.freeze({
    persistPendingState:
      options.persistPendingState ??
      DEFAULT_OPTIONS
        .persistPendingState,
    publishLifecycleEvents:
      options.publishLifecycleEvents ??
      DEFAULT_OPTIONS
        .publishLifecycleEvents,
    captureTransportExceptions:
      options
        .captureTransportExceptions ??
      DEFAULT_OPTIONS
        .captureTransportExceptions,
    unknownResponseCompletesCommand:
      options
        .unknownResponseCompletesCommand ??
      DEFAULT_OPTIONS
        .unknownResponseCompletesCommand,
    metadata:
      freezeRecord(
        options.metadata ??
        EMPTY_METADATA,
      ),
  });
}

function freezeReplacementResult(
  result:
    LiveOrderReplacementResult,
): LiveOrderReplacementResult {
  return Object.freeze({
    commandResult:
      result.commandResult,
    order:
      result.order,
    request:
      result.request,
    ...(result.response ===
    undefined
      ? {}
      : {
          response:
            result.response,
        }),
    events:
      Object.freeze([
        ...result.events,
      ]),
  });
}

function normalizeExchangeId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderReplacerError(
      "INVALID_EXCHANGE_ID",
      "Exchange identifier must be a non-empty string.",
    );
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeIdentifier(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderReplacerError(
      "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeText(
  value: unknown,
  field: string,
): string {
  return normalizeIdentifier(
    value,
    field,
  );
}

function normalizePositiveNumber(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new OrderReplacerError(
      "INVALID_REPLACEMENT",
      `${field} must be a finite number greater than zero.`,
    );
  }

  return value;
}

function normalizeTimestamp(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new OrderReplacerError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }

  return value;
}

function ensureMonotonicTimestamp(
  candidate: number,
  minimum: number,
): number {
  return Math.max(
    normalizeTimestamp(
      candidate,
      "timestamp",
    ),
    normalizeTimestamp(
      minimum,
      "minimumTimestamp",
    ),
  );
}

function validateTransport(
  value: unknown,
): asserts value is
  OrderExecutionTransport {
  if (
    !isRecord(value) ||
    typeof value.submit !==
      "function" ||
    typeof value.cancel !==
      "function" ||
    typeof value.replace !==
      "function" ||
    typeof value.fetchOrder !==
      "function"
  ) {
    throw new OrderReplacerError(
      "INVALID_DEPENDENCY",
      "Order execution transport must provide submit(), cancel(), replace(), and fetchOrder().",
    );
  }
}

function validateRepository(
  value: unknown,
): asserts value is
  OrderRepository {
  if (
    !isRecord(value) ||
    typeof value.save !==
      "function" ||
    typeof value.findByOrderId !==
      "function" ||
    typeof value.findByClientOrderId !==
      "function" ||
    typeof value.findByExchangeOrderId !==
      "function" ||
    typeof value.query !==
      "function"
  ) {
    throw new OrderReplacerError(
      "INVALID_DEPENDENCY",
      "Order repository must provide the complete OrderRepository contract.",
    );
  }
}

function validateIdGenerator(
  value: unknown,
): asserts value is
  OrderIdGenerator {
  if (
    !isRecord(value) ||
    typeof value.nextEventId !==
      "function"
  ) {
    throw new OrderReplacerError(
      "INVALID_DEPENDENCY",
      "Order ID generator must provide nextEventId().",
    );
  }
}

function validateClock(
  value: unknown,
): asserts value is OrderClock {
  if (
    !isRecord(value) ||
    typeof value.now !==
      "function"
  ) {
    throw new OrderReplacerError(
      "INVALID_DEPENDENCY",
      "Order replacer clock must provide now().",
    );
  }
}

function validatePublisher(
  value: unknown,
): asserts value is
  OrderEventPublisher {
  if (
    !isRecord(value) ||
    typeof value.publish !==
      "function"
  ) {
    throw new OrderReplacerError(
      "INVALID_DEPENDENCY",
      "Order event publisher must provide publish().",
    );
  }
}

function readString(
  source:
    Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value =
    source[key];

  if (
    typeof value !== "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  return normalized.length === 0
    ? undefined
    : normalized;
}

function readBoolean(
  source:
    Readonly<Record<string, unknown>>,
  key: string,
): boolean | undefined {
  const value =
    source[key];

  return typeof value === "boolean"
    ? value
    : undefined;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function freezeRecord(
  source:
    Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result:
    Record<string, unknown> = {};

  for (
    const key
    of Object.keys(source).sort()
  ) {
    const value =
      source[key];

    if (value !== undefined) {
      result[key] =
        freezeUnknown(value);
    }
  }

  return Object.freeze(result);
}

function freezeUnknown(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(
        freezeUnknown,
      ),
    );
  }

  if (isRecord(value)) {
    return freezeRecord(value);
  }

  return value;
}