/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 5:
 * Live Order Submitter
 *
 * Converts routed live orders into exchange-submission requests, manages the
 * SUBMITTING/SUBMITTED/ACCEPTED/REJECTED/UNKNOWN lifecycle, persists immutable
 * order snapshots, and publishes deterministic execution events.
 */

import {
  acceptLiveOrder,
  applyLiveOrderFailure,
  transitionLiveOrder,
  validateLiveOrder,
} from "./live-order";

import type {
  LiveOrder,
  LiveOrderFailure,
  LiveOrderFailureCategory,
} from "./live-order";

import type {
  ExchangeOrderSubmissionRequest,
  ExchangeOrderSubmissionResponse,
  OrderClock,
  OrderCommandResult,
  OrderEventPublisher,
  OrderExecutionEvent,
  OrderExecutionTransport,
  OrderIdGenerator,
  OrderRepository,
  SubmitOrderCommand,
} from "./order-types";

export type OrderSubmitterErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "INVALID_ORDER_STATE"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_TIMESTAMP"
  | "INVALID_TRANSPORT_RESPONSE"
  | "PERSISTENCE_FAILED"
  | "EVENT_PUBLICATION_FAILED"
  | "SUBMISSION_FAILED";

export class OrderSubmitterError extends Error {
  public readonly code: OrderSubmitterErrorCode;

  public readonly orderId?: string;

  public readonly exchangeId?: string;

  public readonly retryable: boolean;

  public constructor(
    code: OrderSubmitterErrorCode,
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

    this.name = "OrderSubmitterError";
    this.code = code;
    this.orderId = options.orderId;
    this.exchangeId = options.exchangeId;
    this.retryable =
      options.retryable ?? false;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export interface LiveOrderSubmitterOptions {
  /**
   * Persists the SUBMITTING state before transport execution.
   */
  readonly persistSubmittingState?: boolean;

  /**
   * Publishes every persisted state change.
   */
  readonly publishLifecycleEvents?: boolean;

  /**
   * Treats UNKNOWN exchange responses as command completion rather than
   * command failure. The order itself still transitions to UNKNOWN.
   */
  readonly unknownResponseCompletesCommand?: boolean;

  /**
   * Converts unexpected transport exceptions into immutable FAILED orders.
   */
  readonly captureTransportExceptions?: boolean;

  /**
   * Static metadata added to submission requests, results, and events.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedLiveOrderSubmitterOptions {
  readonly persistSubmittingState: boolean;
  readonly publishLifecycleEvents: boolean;
  readonly unknownResponseCompletesCommand: boolean;
  readonly captureTransportExceptions: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderSubmissionResult {
  readonly commandResult:
    OrderCommandResult<LiveOrder>;

  readonly order: LiveOrder;

  readonly request:
    ExchangeOrderSubmissionRequest;

  readonly response?:
    ExchangeOrderSubmissionResponse;

  readonly events:
    readonly OrderExecutionEvent[];
}

export interface LiveOrderSubmitterContract {
  submit(
    command: SubmitOrderCommand,
  ): Promise<LiveOrderSubmissionResult>;
}

const EMPTY_METADATA:
  Readonly<Record<string, unknown>> =
  Object.freeze({});

const SUBMITTABLE_STATES =
  new Set<LiveOrder["state"]>([
    "ROUTED",
    "RECOVERING",
  ]);

const DEFAULT_OPTIONS:
  ResolvedLiveOrderSubmitterOptions =
  Object.freeze({
    persistSubmittingState: true,
    publishLifecycleEvents: true,
    unknownResponseCompletesCommand: true,
    captureTransportExceptions: true,
    metadata: EMPTY_METADATA,
  });

export class SystemOrderSubmitterClock
  implements OrderClock
{
  public now(): number {
    return Date.now();
  }
}

export class LiveOrderSubmitter
  implements LiveOrderSubmitterContract
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
    ResolvedLiveOrderSubmitterOptions;

  public constructor(
    transport: OrderExecutionTransport,
    repository: OrderRepository,
    idGenerator: OrderIdGenerator,
    options:
      LiveOrderSubmitterOptions = {},
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
      new SystemOrderSubmitterClock();

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

  public async submit(
    command: SubmitOrderCommand,
  ): Promise<LiveOrderSubmissionResult> {
    validateSubmitCommand(command);

    const executionId =
      normalizeIdentifier(
        this.idGenerator
          .nextExecutionId(),
        "executionId",
      );

    const requestTimestamp =
      this.now();

    const request =
      createExchangeSubmissionRequest(
        command,
        executionId,
        requestTimestamp,
        this.options.metadata,
      );

    const events:
      OrderExecutionEvent[] = [];

    let currentOrder =
      command.order;

    currentOrder =
      transitionLiveOrder(
        currentOrder,
        {
          state: "SUBMITTING",
          occurredAt:
            ensureMonotonicTimestamp(
              requestTimestamp,
              currentOrder.updatedAt,
            ),
          reason:
            `Submitting order to exchange "${request.exchangeId}".`,
          metadata: {
            executionId,
            routeId:
              command.routeId,
          },
        },
      );

    if (
      this.options
        .persistSubmittingState
    ) {
      await this.persist(
        currentOrder,
      );

      await this.emitLifecycleEvent(
        currentOrder,
        events,
        {
          executionId,
          phase: "SUBMITTING",
        },
      );
    }

    let response:
      ExchangeOrderSubmissionResponse;

    try {
      response =
        await this.transport.submit(
          request,
        );
    } catch (cause: unknown) {
      if (
        !this.options
          .captureTransportExceptions
      ) {
        throw new OrderSubmitterError(
          "SUBMISSION_FAILED",
          `Order "${currentOrder.orderId}" could not be submitted to exchange "${request.exchangeId}".`,
          {
            orderId:
              currentOrder.orderId,
            exchangeId:
              request.exchangeId,
            retryable: true,
            cause,
          },
        );
      }

      const failure =
        normalizeSubmissionFailure(
          cause,
          this.now(),
          request.exchangeId,
        );

      currentOrder =
        applyLiveOrderFailure(
          currentOrder,
          {
            failure,
            transitionToFailed: true,
          },
        );

      await this.persist(
        currentOrder,
      );

      await this.emitLifecycleEvent(
        currentOrder,
        events,
        {
          executionId,
          phase: "TRANSPORT_FAILURE",
          failureCode:
            failure.code,
        },
        failure,
      );

      return freezeSubmissionResult({
        commandResult:
          createCommandResult(
            command,
            currentOrder,
            "FAILED",
            currentOrder.updatedAt,
            {
              executionId,
              exchangeId:
                request.exchangeId,
              failureCode:
                failure.code,
            },
            failure,
          ),
        order:
          currentOrder,
        request,
        events:
          Object.freeze(events),
      });
    }

    validateSubmissionResponse(
      response,
      request,
    );

    const submittedAt =
      ensureMonotonicTimestamp(
        response.receivedAt,
        currentOrder.updatedAt,
      );

    currentOrder =
      transitionLiveOrder(
        currentOrder,
        {
          state: "SUBMITTED",
          occurredAt: submittedAt,
          reason:
            "Exchange submission response received.",
          metadata: {
            executionId,
            exchangeId:
              response.exchangeId,
            exchangeState:
              response.exchangeState,
            submissionStatus:
              response.status,
          },
        },
      );

    await this.persist(
      currentOrder,
    );

    await this.emitLifecycleEvent(
      currentOrder,
      events,
      {
        executionId,
        phase: "SUBMITTED",
        submissionStatus:
          response.status,
      },
    );

    switch (response.status) {
      case "ACCEPTED":
        currentOrder =
          this.applyAcceptedResponse(
            currentOrder,
            response,
          );

        break;

      case "REJECTED":
        currentOrder =
          this.applyRejectedResponse(
            currentOrder,
            response,
          );

        break;

      case "UNKNOWN":
        currentOrder =
          this.applyUnknownResponse(
            currentOrder,
            response,
          );

        break;

      default: {
        const exhaustiveCheck:
          never = response.status;

        return exhaustiveCheck;
      }
    }

    await this.persist(
      currentOrder,
    );

    await this.emitLifecycleEvent(
      currentOrder,
      events,
      {
        executionId,
        phase:
          response.status,
        submissionStatus:
          response.status,
      },
      response.failure,
    );

    const commandStatus =
      mapResponseToCommandStatus(
        response,
        this.options,
      );

    return freezeSubmissionResult({
      commandResult:
        createCommandResult(
          command,
          currentOrder,
          commandStatus,
          currentOrder.updatedAt,
          {
            executionId,
            exchangeId:
              response.exchangeId,
            exchangeOrderId:
              response.exchangeOrderId,
            submissionStatus:
              response.status,
          },
          response.failure,
        ),
      order:
        currentOrder,
      request,
      response,
      events:
        Object.freeze(events),
    });
  }

  private applyAcceptedResponse(
    order: LiveOrder,
    response:
      ExchangeOrderSubmissionResponse,
  ): LiveOrder {
    const exchangeOrderId =
      normalizeRequiredExchangeOrderId(
        response.exchangeOrderId,
        response.exchangeId,
        response.orderId,
      );

    const acceptedAt =
      ensureMonotonicTimestamp(
        response.acceptedAt ??
          response.receivedAt,
        order.updatedAt,
      );

    return acceptLiveOrder(
      order,
      {
        exchangeId:
          response.exchangeId,
        exchangeOrderId,
        acceptedAt,
        metadata: {
          ...response.metadata,
          executionId:
            response.executionId,
          exchangeState:
            response.exchangeState,
          message:
            response.message,
        },
      },
    );
  }

  private applyRejectedResponse(
    order: LiveOrder,
    response:
      ExchangeOrderSubmissionResponse,
  ): LiveOrder {
    const failure =
      response.failure ??
      createSubmissionFailure({
        category:
          "EXCHANGE_REJECTION",
        code:
          "ORDER_REJECTED",
        message:
          response.message ??
          "Order rejected by exchange.",
        occurredAt:
          ensureMonotonicTimestamp(
            response.receivedAt,
            order.updatedAt,
          ),
        retryable: false,
        metadata: {
          exchangeId:
            response.exchangeId,
          exchangeState:
            response.exchangeState,
          executionId:
            response.executionId,
        },
      });

    const failedOrder =
      applyLiveOrderFailure(
        order,
        {
          failure,
          transitionToFailed: false,
        },
      );

    return transitionLiveOrder(
      failedOrder,
      {
        state: "REJECTED",
        occurredAt:
          ensureMonotonicTimestamp(
            failure.occurredAt,
            failedOrder.updatedAt,
          ),
        reason:
          failure.message,
        metadata: {
          failureCode:
            failure.code,
          exchangeId:
            response.exchangeId,
          executionId:
            response.executionId,
        },
      },
    );
  }

  private applyUnknownResponse(
    order: LiveOrder,
    response:
      ExchangeOrderSubmissionResponse,
  ): LiveOrder {
    const failure =
      response.failure ??
      createSubmissionFailure({
        category: "UNKNOWN",
        code:
          "UNKNOWN_SUBMISSION_STATUS",
        message:
          response.message ??
          "Exchange submission status is unknown.",
        occurredAt:
          ensureMonotonicTimestamp(
            response.receivedAt,
            order.updatedAt,
          ),
        retryable: true,
        metadata: {
          exchangeId:
            response.exchangeId,
          exchangeState:
            response.exchangeState,
          executionId:
            response.executionId,
        },
      });

    const failedOrder =
      applyLiveOrderFailure(
        order,
        {
          failure,
          transitionToFailed: false,
        },
      );

    return transitionLiveOrder(
      failedOrder,
      {
        state: "UNKNOWN",
        occurredAt:
          ensureMonotonicTimestamp(
            failure.occurredAt,
            failedOrder.updatedAt,
          ),
        reason:
          failure.message,
        metadata: {
          failureCode:
            failure.code,
          retryable:
            failure.retryable,
          exchangeId:
            response.exchangeId,
          executionId:
            response.executionId,
        },
      },
    );
  }

  private async persist(
    order: LiveOrder,
  ): Promise<void> {
    try {
      await this.repository.save(
        order,
      );
    } catch (cause: unknown) {
      throw new OrderSubmitterError(
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

  private async emitLifecycleEvent(
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
      throw new OrderSubmitterError(
        "EVENT_PUBLICATION_FAILED",
        `Failed to publish execution event for order "${order.orderId}".`,
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
      "orderSubmitter.clock.now()",
    );
  }
}

export function createExchangeSubmissionRequest(
  command: SubmitOrderCommand,
  executionId: string,
  submittedAt: number,
  metadata:
    Readonly<Record<string, unknown>> =
      EMPTY_METADATA,
): ExchangeOrderSubmissionRequest {
  validateSubmitCommand(command);

  const order =
    command.order;

  return Object.freeze({
    executionId:
      normalizeIdentifier(
        executionId,
        "executionId",
      ),
    orderId:
      order.orderId,
    clientOrderId:
      order.clientOrderId,
    exchangeId:
      normalizeExchangeId(
        command.exchangeId,
      ),
    ...(order.accountId ===
    undefined
      ? {}
      : {
          accountId:
            order.accountId,
        }),
    symbol:
      order.symbol,
    side:
      order.side,
    type:
      order.type,
    ...(order.timeInForce ===
    undefined
      ? {}
      : {
          timeInForce:
            order.timeInForce,
        }),
    quantity:
      order.remainingQuantity,
    ...(order.quoteOrderQuantity ===
    undefined
      ? {}
      : {
          quoteOrderQuantity:
            order.quoteOrderQuantity,
        }),
    ...(order.limitPrice ===
    undefined
      ? {}
      : {
          limitPrice:
            order.limitPrice,
        }),
    ...(order.stopPrice ===
    undefined
      ? {}
      : {
          stopPrice:
            order.stopPrice,
        }),
    ...(order.trailingOffset ===
    undefined
      ? {}
      : {
          trailingOffset:
            order.trailingOffset,
        }),
    reduceOnly:
      order.reduceOnly,
    postOnly:
      order.postOnly,
    closePosition:
      order.closePosition,
    ...(order.expiresAt ===
    undefined
      ? {}
      : {
          expiresAt:
            order.expiresAt,
        }),
    idempotencyKey:
      order.idempotencyKey,
    submittedAt:
      normalizeTimestamp(
        submittedAt,
        "submittedAt",
      ),
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
        routeId:
          command.routeId,
        orderVersion:
          order.version,
      }),
  });
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
  const latestTransition =
    order.transitions[
      order.transitions.length - 1
    ];

  const eventId =
    normalizeIdentifier(
      idGenerator.nextEventId(),
      "eventId",
    );

  return Object.freeze({
    eventId,
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
      latestTransition
        ?.occurredAt ??
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
          latestTransition
            ?.transitionId,
      }),
  });
}

function createCommandResult(
  command: SubmitOrderCommand,
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
    operation:
      "SUBMIT",
    status,
    result:
      order,
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

function mapResponseToCommandStatus(
  response:
    ExchangeOrderSubmissionResponse,
  options:
    ResolvedLiveOrderSubmitterOptions,
): OrderCommandResult["status"] {
  switch (response.status) {
    case "ACCEPTED":
      return "COMPLETED";

    case "REJECTED":
      return "REJECTED";

    case "UNKNOWN":
      return options
        .unknownResponseCompletesCommand
        ? "UNKNOWN"
        : "FAILED";

    default: {
      const exhaustiveCheck:
        never = response.status;

      return exhaustiveCheck;
    }
  }
}

function validateSubmitCommand(
  command:
    SubmitOrderCommand,
): void {
  if (!isRecord(command)) {
    throw new OrderSubmitterError(
      "INVALID_COMMAND",
      "Submit-order command must be a record object.",
    );
  }

  if (
    command.operation !== "SUBMIT"
  ) {
    throw new OrderSubmitterError(
      "INVALID_COMMAND",
      `Expected SUBMIT operation but received "${String(
        command.operation,
      )}".`,
    );
  }

  validateLiveOrder(
    command.order,
  );

  if (
    !SUBMITTABLE_STATES.has(
      command.order.state,
    )
  ) {
    throw new OrderSubmitterError(
      "INVALID_ORDER_STATE",
      `Order "${command.order.orderId}" cannot be submitted while in state "${command.order.state}".`,
      {
        orderId:
          command.order.orderId,
        exchangeId:
          command.exchangeId,
      },
    );
  }

  const exchangeId =
    normalizeExchangeId(
      command.exchangeId,
    );

  if (
    command.order.exchangeId !==
      undefined &&
    normalizeExchangeId(
      command.order.exchangeId,
    ) !== exchangeId
  ) {
    throw new OrderSubmitterError(
      "INVALID_EXCHANGE_ID",
      `Order "${command.order.orderId}" is routed to "${command.order.exchangeId}", not "${exchangeId}".`,
      {
        orderId:
          command.order.orderId,
        exchangeId,
      },
    );
  }

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
    command.routeId !== undefined
  ) {
    normalizeIdentifier(
      command.routeId,
      "command.routeId",
    );
  }
}

function validateSubmissionResponse(
  response:
    ExchangeOrderSubmissionResponse,
  request:
    ExchangeOrderSubmissionRequest,
): void {
  if (!isRecord(response)) {
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange submission response must be a record object.",
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }

  if (
    response.executionId !==
      request.executionId ||
    response.orderId !==
      request.orderId ||
    response.clientOrderId !==
      request.clientOrderId
  ) {
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange submission response identifiers do not match the request.",
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
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      "Exchange submission response exchange does not match the request.",
      {
        orderId:
          request.orderId,
        exchangeId:
          response.exchangeId,
      },
    );
  }

  if (
    response.status !== "ACCEPTED" &&
    response.status !== "REJECTED" &&
    response.status !== "UNKNOWN"
  ) {
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      `Unsupported submission status "${String(
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
    response.acceptedAt !== undefined
  ) {
    normalizeTimestamp(
      response.acceptedAt,
      "response.acceptedAt",
    );
  }

  if (
    response.status === "ACCEPTED" &&
    response.exchangeOrderId ===
      undefined
  ) {
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      "Accepted submission response must contain exchangeOrderId.",
      {
        orderId:
          request.orderId,
        exchangeId:
          request.exchangeId,
      },
    );
  }
}

function normalizeSubmissionFailure(
  cause: unknown,
  occurredAt: number,
  exchangeId: string,
): LiveOrderFailure {
  if (
    isRecord(cause) &&
    typeof cause.message ===
      "string"
  ) {
    return createSubmissionFailure({
      category:
        inferFailureCategory(
          cause,
        ),
      code:
        readNonEmptyString(
          cause,
          "code",
        ) ??
        "ORDER_SUBMISSION_FAILED",
      message:
        cause.message,
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
          readNonEmptyString(
            cause,
            "name",
          ),
      },
    });
  }

  return createSubmissionFailure({
    category: "UNKNOWN",
    code:
      "ORDER_SUBMISSION_FAILED",
    message:
      cause instanceof Error
        ? cause.message
        : "Unknown order submission failure.",
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
      readNonEmptyString(
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

function createSubmissionFailure(
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
      normalizeIdentifier(
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
    LiveOrderSubmitterOptions,
): ResolvedLiveOrderSubmitterOptions {
  const resolved:
    ResolvedLiveOrderSubmitterOptions = {
      persistSubmittingState:
        options.persistSubmittingState ??
        DEFAULT_OPTIONS
          .persistSubmittingState,
      publishLifecycleEvents:
        options.publishLifecycleEvents ??
        DEFAULT_OPTIONS
          .publishLifecycleEvents,
      unknownResponseCompletesCommand:
        options
          .unknownResponseCompletesCommand ??
        DEFAULT_OPTIONS
          .unknownResponseCompletesCommand,
      captureTransportExceptions:
        options
          .captureTransportExceptions ??
        DEFAULT_OPTIONS
          .captureTransportExceptions,
      metadata:
        freezeRecord(
          options.metadata ??
          EMPTY_METADATA,
        ),
  };

  return Object.freeze(
    resolved,
  );
}

function normalizeRequiredExchangeOrderId(
  value: unknown,
  exchangeId: string,
  orderId: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderSubmitterError(
      "INVALID_TRANSPORT_RESPONSE",
      `Accepted response for order "${orderId}" from exchange "${exchangeId}" does not contain a valid exchangeOrderId.`,
      {
        orderId,
        exchangeId,
      },
    );
  }

  return value.trim();
}

function normalizeExchangeId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderSubmitterError(
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
    throw new OrderSubmitterError(
      "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
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
    throw new OrderSubmitterError(
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
  const normalizedCandidate =
    normalizeTimestamp(
      candidate,
      "timestamp",
    );

  const normalizedMinimum =
    normalizeTimestamp(
      minimum,
      "minimumTimestamp",
    );

  return Math.max(
    normalizedCandidate,
    normalizedMinimum,
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
    throw new OrderSubmitterError(
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
    throw new OrderSubmitterError(
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
    typeof value.nextExecutionId !==
      "function" ||
    typeof value.nextEventId !==
      "function"
  ) {
    throw new OrderSubmitterError(
      "INVALID_DEPENDENCY",
      "Order ID generator must provide nextExecutionId() and nextEventId().",
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
    throw new OrderSubmitterError(
      "INVALID_DEPENDENCY",
      "Order submitter clock must provide now().",
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
    throw new OrderSubmitterError(
      "INVALID_DEPENDENCY",
      "Order event publisher must provide publish().",
    );
  }
}

function readNonEmptyString(
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

function freezeSubmissionResult(
  result:
    LiveOrderSubmissionResult,
): LiveOrderSubmissionResult {
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

    if (
      value !== undefined
    ) {
      result[key] =
        freezeUnknown(value);
    }
  }

  return Object.freeze(
    result,
  );
}

function freezeUnknown(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return Object.freeze(
      value.map(
        freezeUnknown,
      ),
    );
  }

  if (
    isRecord(value)
  ) {
    return freezeRecord(
      value,
    );
  }

  return value;
}