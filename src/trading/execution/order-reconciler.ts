/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 8:
 * Live Order Reconciler
 *
 * Compares a persisted live order with the latest exchange snapshot, applies
 * unseen fills, resolves lifecycle drift, persists the reconciled order, and
 * publishes deterministic execution events.
 */

import {
  acceptLiveOrder,
  applyLiveOrderFailure,
  applyLiveOrderFill,
  isLiveOrderTerminal,
  transitionLiveOrder,
  validateLiveOrder,
} from "./live-order";

import type {
  LiveOrder,
  LiveOrderFailure,
  LiveOrderFailureCategory,
  LiveOrderFill,
  LiveOrderState,
} from "./live-order";

import type {
  ExchangeOrderSnapshot,
  OrderClock,
  OrderCommandResult,
  OrderEventPublisher,
  OrderExecutionEvent,
  OrderExecutionTransport,
  OrderIdGenerator,
  OrderRepository,
  ReconcileOrderCommand,
} from "./order-types";

export type OrderReconcilerErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "ORDER_NOT_FOUND"
  | "MISSING_EXCHANGE_ID"
  | "MISSING_EXCHANGE_ORDER_ID"
  | "INVALID_EXCHANGE_SNAPSHOT"
  | "EXCHANGE_ID_MISMATCH"
  | "EXCHANGE_ORDER_ID_MISMATCH"
  | "SYMBOL_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "INVALID_TIMESTAMP"
  | "RECONCILIATION_FAILED"
  | "PERSISTENCE_FAILED"
  | "EVENT_PUBLICATION_FAILED";

export class OrderReconcilerError extends Error {
  public readonly code: OrderReconcilerErrorCode;
  public readonly orderId?: string;
  public readonly exchangeId?: string;
  public readonly retryable: boolean;

  public constructor(
    code: OrderReconcilerErrorCode,
    message: string,
    options: Readonly<{
      orderId?: string;
      exchangeId?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, { cause: options.cause });

    this.name = "OrderReconcilerError";
    this.code = code;
    this.orderId = options.orderId;
    this.exchangeId = options.exchangeId;
    this.retryable = options.retryable ?? false;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface LiveOrderReconcilerOptions {
  /**
   * Publishes lifecycle and fill events after successful persistence.
   */
  readonly publishLifecycleEvents?: boolean;

  /**
   * Records transport exceptions as immutable reconciliation failures.
   */
  readonly captureTransportExceptions?: boolean;

  /**
   * Marks a missing exchange order as UNKNOWN.
   */
  readonly markMissingExchangeOrderUnknown?: boolean;

  /**
   * Leaves locally terminal orders unchanged.
   */
  readonly preserveTerminalOrders?: boolean;

  /**
   * Rejects exchange snapshots whose requested quantity differs from local
   * requestedQuantity.
   */
  readonly strictQuantityMatch?: boolean;

  /**
   * Additional metadata included in reconciliation results and events.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedLiveOrderReconcilerOptions {
  readonly publishLifecycleEvents: boolean;
  readonly captureTransportExceptions: boolean;
  readonly markMissingExchangeOrderUnknown: boolean;
  readonly preserveTerminalOrders: boolean;
  readonly strictQuantityMatch: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LiveOrderReconciliationResult {
  readonly commandResult: OrderCommandResult<LiveOrder>;
  readonly previousOrder: LiveOrder;
  readonly order: LiveOrder;
  readonly snapshot?: ExchangeOrderSnapshot;
  readonly changed: boolean;
  readonly appliedFills: readonly LiveOrderFill[];
  readonly events: readonly OrderExecutionEvent[];
}

export interface LiveOrderReconcilerContract {
  reconcile(
    command: ReconcileOrderCommand,
  ): Promise<LiveOrderReconciliationResult>;
}

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const DEFAULT_OPTIONS: ResolvedLiveOrderReconcilerOptions =
  Object.freeze({
    publishLifecycleEvents: true,
    captureTransportExceptions: true,
    markMissingExchangeOrderUnknown: true,
    preserveTerminalOrders: true,
    strictQuantityMatch: true,
    metadata: EMPTY_METADATA,
  });

const EXCHANGE_STATE_MAP: Readonly<Record<string, LiveOrderState>> =
  Object.freeze({
    NEW: "ACCEPTED",
    OPEN: "ACCEPTED",
    ACTIVE: "ACCEPTED",
    WORKING: "ACCEPTED",
    ACCEPTED: "ACCEPTED",
    SUBMITTED: "SUBMITTED",
    PARTIALLY_FILLED: "PARTIALLY_FILLED",
    PARTIAL_FILL: "PARTIALLY_FILLED",
    PARTIALLYFILLED: "PARTIALLY_FILLED",
    FILLED: "FILLED",
    COMPLETED: "FILLED",
    DONE: "FILLED",
    CANCEL_PENDING: "CANCEL_PENDING",
    PENDING_CANCEL: "CANCEL_PENDING",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
    REPLACE_PENDING: "REPLACE_PENDING",
    PENDING_REPLACE: "REPLACE_PENDING",
    REPLACED: "REPLACED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED",
    UNKNOWN: "UNKNOWN",
  });

export class SystemOrderReconcilerClock implements OrderClock {
  public now(): number {
    return Date.now();
  }
}

export class LiveOrderReconciler
  implements LiveOrderReconcilerContract
{
  private readonly transport: OrderExecutionTransport;
  private readonly repository: OrderRepository;
  private readonly idGenerator: OrderIdGenerator;
  private readonly clock: OrderClock;
  private readonly publisher?: OrderEventPublisher;
  private readonly options: ResolvedLiveOrderReconcilerOptions;

  public constructor(
    transport: OrderExecutionTransport,
    repository: OrderRepository,
    idGenerator: OrderIdGenerator,
    options: LiveOrderReconcilerOptions = {},
    dependencies: Readonly<{
      clock?: OrderClock;
      publisher?: OrderEventPublisher;
    }> = {},
  ) {
    validateTransport(transport);
    validateRepository(repository);
    validateIdGenerator(idGenerator);

    const clock =
      dependencies.clock ?? new SystemOrderReconcilerClock();

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

  public async reconcile(
    command: ReconcileOrderCommand,
  ): Promise<LiveOrderReconciliationResult> {
    validateReconcileCommand(command);

    const previousOrder =
      await this.resolveOrder(command);

    validateLiveOrder(previousOrder);

    if (
      isLiveOrderTerminal(previousOrder) &&
      this.options.preserveTerminalOrders
    ) {
      return freezeResult({
        commandResult: createCommandResult(
          command,
          previousOrder,
          "COMPLETED",
          this.now(),
          {
            changed: false,
            reason: "LOCAL_ORDER_TERMINAL",
          },
        ),
        previousOrder,
        order: previousOrder,
        changed: false,
        appliedFills: Object.freeze([]),
        events: Object.freeze([]),
      });
    }

    const exchangeId = normalizeExchangeId(
      command.exchangeId ?? previousOrder.exchangeId,
      previousOrder.orderId,
    );

    const exchangeOrderId = normalizeIdentifier(
      command.exchangeOrderId ??
        previousOrder.exchangeOrderId,
      "exchangeOrderId",
      previousOrder.orderId,
    );

    let snapshot: ExchangeOrderSnapshot | undefined;

    try {
      snapshot = await this.transport.fetchOrder(
        exchangeId,
        exchangeOrderId,
        previousOrder.symbol,
        previousOrder.accountId,
      );
    } catch (cause: unknown) {
      if (!this.options.captureTransportExceptions) {
        throw new OrderReconcilerError(
          "RECONCILIATION_FAILED",
          `Failed to fetch exchange order "${exchangeOrderId}" from "${exchangeId}".`,
          {
            orderId: previousOrder.orderId,
            exchangeId,
            retryable: true,
            cause,
          },
        );
      }

      const failure = normalizeReconciliationFailure(
        cause,
        this.now(),
        exchangeId,
        exchangeOrderId,
      );

      const failedOrder = applyLiveOrderFailure(
        previousOrder,
        {
          failure,
          transitionToFailed: false,
        },
      );

      const recoverableOrder = transitionIfAllowed(
        failedOrder,
        "UNKNOWN",
        failure.occurredAt,
        failure.message,
        {
          failureCode: failure.code,
          exchangeId,
          exchangeOrderId,
        },
      );

      await this.persist(recoverableOrder);

      const events: OrderExecutionEvent[] = [];
      await this.emitEvent(
        recoverableOrder,
        events,
        {
          phase: "RECONCILIATION_FAILURE",
          failureCode: failure.code,
        },
        failure,
      );

      return freezeResult({
        commandResult: createCommandResult(
          command,
          recoverableOrder,
          "FAILED",
          recoverableOrder.updatedAt,
          {
            changed:
              recoverableOrder.version !== previousOrder.version,
            exchangeId,
            exchangeOrderId,
          },
          failure,
        ),
        previousOrder,
        order: recoverableOrder,
        changed:
          recoverableOrder.version !== previousOrder.version,
        appliedFills: Object.freeze([]),
        events: Object.freeze(events),
      });
    }

    if (snapshot === undefined) {
      return this.handleMissingSnapshot(
        command,
        previousOrder,
        exchangeId,
        exchangeOrderId,
      );
    }

    validateSnapshot(
      snapshot,
      previousOrder,
      exchangeId,
      exchangeOrderId,
      this.options,
    );

    const appliedFills: LiveOrderFill[] = [];
    const events: OrderExecutionEvent[] = [];

    let order = previousOrder;

    /*
     * Some exchanges first expose an accepted snapshot before websocket order
     * events arrive. Attach the exchange order identity through the canonical
     * domain acceptance helper when the current state permits it.
     */
    if (
      shouldApplyAcceptance(order, snapshot)
    ) {
      order = acceptLiveOrder(order, {
        exchangeId: snapshot.exchangeId,
        exchangeOrderId: snapshot.exchangeOrderId,
        acceptedAt: ensureMonotonicTimestamp(
          snapshot.createdAt ??
            snapshot.updatedAt,
          order.updatedAt,
        ),
        metadata: freezeRecord({
          source: "RECONCILIATION",
          exchangeState: snapshot.state,
          ...snapshot.metadata,
        }),
      });
    }

    const knownFillIds = new Set(
      order.fills.map((fill) => fill.fillId),
    );

    const unseenFills = [...snapshot.fills]
      .filter((fill) => !knownFillIds.has(fill.fillId))
      .sort(compareFills);

    for (const fill of unseenFills) {
      order = applyLiveOrderFill(order, {
        fill,
        occurredAt: ensureMonotonicTimestamp(
          fill.receivedAt,
          order.updatedAt,
        ),
      });

      appliedFills.push(fill);

      await this.emitEvent(
        order,
        events,
        {
          phase: "FILL_RECONCILED",
          exchangeState: snapshot.state,
        },
        undefined,
        fill,
      );
    }

    const targetState = mapExchangeState(snapshot.state);

    order = reconcileState(
      order,
      targetState,
      snapshot,
    );

    const changed =
      order.version !== previousOrder.version;

    if (changed) {
      await this.persist(order);

      await this.emitEvent(
        order,
        events,
        {
          phase: "STATE_RECONCILED",
          exchangeState: snapshot.state,
          targetState,
          appliedFillCount: appliedFills.length,
        },
      );
    }

    return freezeResult({
      commandResult: createCommandResult(
        command,
        order,
        "COMPLETED",
        Math.max(order.updatedAt, this.now()),
        {
          changed,
          exchangeId,
          exchangeOrderId,
          exchangeState: snapshot.state,
          targetState,
          appliedFillCount: appliedFills.length,
          localFilledQuantity: order.filledQuantity,
          exchangeFilledQuantity: snapshot.filledQuantity,
          ...this.options.metadata,
        },
      ),
      previousOrder,
      order,
      snapshot,
      changed,
      appliedFills: Object.freeze(appliedFills),
      events: Object.freeze(events),
    });
  }

  private async handleMissingSnapshot(
    command: ReconcileOrderCommand,
    previousOrder: LiveOrder,
    exchangeId: string,
    exchangeOrderId: string,
  ): Promise<LiveOrderReconciliationResult> {
    if (!this.options.markMissingExchangeOrderUnknown) {
      return freezeResult({
        commandResult: createCommandResult(
          command,
          previousOrder,
          "UNKNOWN",
          this.now(),
          {
            changed: false,
            exchangeId,
            exchangeOrderId,
            reason: "EXCHANGE_ORDER_NOT_FOUND",
          },
        ),
        previousOrder,
        order: previousOrder,
        changed: false,
        appliedFills: Object.freeze([]),
        events: Object.freeze([]),
      });
    }

    const occurredAt = ensureMonotonicTimestamp(
      this.now(),
      previousOrder.updatedAt,
    );

    const failure = createReconciliationFailure({
      category: "RECONCILIATION",
      code: "EXCHANGE_ORDER_NOT_FOUND",
      message:
        `Exchange order "${exchangeOrderId}" was not found on "${exchangeId}".`,
      occurredAt,
      retryable: true,
      metadata: {
        exchangeId,
        exchangeOrderId,
      },
    });

    let order = applyLiveOrderFailure(
      previousOrder,
      {
        failure,
        transitionToFailed: false,
      },
    );

    order = transitionIfAllowed(
      order,
      "UNKNOWN",
      occurredAt,
      failure.message,
      {
        failureCode: failure.code,
        exchangeId,
        exchangeOrderId,
      },
    );

    await this.persist(order);

    const events: OrderExecutionEvent[] = [];

    await this.emitEvent(
      order,
      events,
      {
        phase: "EXCHANGE_ORDER_NOT_FOUND",
      },
      failure,
    );

    return freezeResult({
      commandResult: createCommandResult(
        command,
        order,
        "UNKNOWN",
        order.updatedAt,
        {
          changed: true,
          exchangeId,
          exchangeOrderId,
          reason: failure.code,
        },
        failure,
      ),
      previousOrder,
      order,
      changed: true,
      appliedFills: Object.freeze([]),
      events: Object.freeze(events),
    });
  }

  private async resolveOrder(
    command: ReconcileOrderCommand,
  ): Promise<LiveOrder> {
    let order =
      await this.repository.findByOrderId(command.orderId);

    if (
      order === undefined &&
      command.exchangeId !== undefined &&
      command.exchangeOrderId !== undefined
    ) {
      order =
        await this.repository.findByExchangeOrderId(
          normalizeExchangeId(
            command.exchangeId,
            command.orderId,
          ),
          normalizeIdentifier(
            command.exchangeOrderId,
            "command.exchangeOrderId",
            command.orderId,
          ),
        );
    }

    if (order === undefined) {
      throw new OrderReconcilerError(
        "ORDER_NOT_FOUND",
        `Order "${command.orderId}" was not found.`,
        {
          orderId: command.orderId,
          exchangeId: command.exchangeId,
        },
      );
    }

    if (order.orderId !== command.orderId) {
      throw new OrderReconcilerError(
        "INVALID_COMMAND",
        `Resolved order "${order.orderId}" does not match command orderId "${command.orderId}".`,
        {
          orderId: command.orderId,
          exchangeId: order.exchangeId,
        },
      );
    }

    return order;
  }

  private async persist(order: LiveOrder): Promise<void> {
    try {
      await this.repository.save(order);
    } catch (cause: unknown) {
      throw new OrderReconcilerError(
        "PERSISTENCE_FAILED",
        `Failed to persist reconciled order "${order.orderId}".`,
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
    fill?: LiveOrderFill,
  ): Promise<void> {
    if (
      !this.options.publishLifecycleEvents ||
      this.publisher === undefined
    ) {
      return;
    }

    const event = createExecutionEvent(
      order,
      this.idGenerator,
      metadata,
      failure,
      fill,
    );

    try {
      await this.publisher.publish(event);
    } catch (cause: unknown) {
      throw new OrderReconcilerError(
        "EVENT_PUBLICATION_FAILED",
        `Failed to publish reconciliation event for order "${order.orderId}".`,
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
    return normalizeTimestamp(
      this.clock.now(),
      "orderReconciler.clock.now()",
    );
  }
}

function reconcileState(
  order: LiveOrder,
  targetState: LiveOrderState,
  snapshot: ExchangeOrderSnapshot,
): LiveOrder {
  if (order.state === targetState) {
    return order;
  }

  /*
   * Fills are authoritative. Never downgrade a locally filled order because an
   * exchange snapshot arrived out of order.
   */
  if (
    order.state === "FILLED" &&
    targetState !== "FILLED"
  ) {
    return order;
  }

  if (
    targetState === "PARTIALLY_FILLED" &&
    order.filledQuantity === 0
  ) {
    return transitionIfAllowed(
      order,
      "UNKNOWN",
      ensureMonotonicTimestamp(
        snapshot.updatedAt,
        order.updatedAt,
      ),
      "Exchange reported a partial fill without new fill records.",
      {
        exchangeState: snapshot.state,
        exchangeFilledQuantity:
          snapshot.filledQuantity,
      },
    );
  }

  if (
    targetState === "FILLED" &&
    order.filledQuantity !==
      order.requestedQuantity
  ) {
    return transitionIfAllowed(
      order,
      "UNKNOWN",
      ensureMonotonicTimestamp(
        snapshot.updatedAt,
        order.updatedAt,
      ),
      "Exchange reported FILLED but local fill records are incomplete.",
      {
        exchangeState: snapshot.state,
        localFilledQuantity:
          order.filledQuantity,
        exchangeFilledQuantity:
          snapshot.filledQuantity,
      },
    );
  }

  return transitionIfAllowed(
    order,
    targetState,
    ensureMonotonicTimestamp(
      snapshot.updatedAt,
      order.updatedAt,
    ),
    `Order state reconciled from exchange state "${snapshot.state}".`,
    {
      exchangeState: snapshot.state,
      exchangeFilledQuantity:
        snapshot.filledQuantity,
      exchangeRemainingQuantity:
        snapshot.remainingQuantity,
      ...snapshot.metadata,
    },
  );
}

function transitionIfAllowed(
  order: LiveOrder,
  state: LiveOrderState,
  occurredAt: number,
  reason: string,
  metadata: Readonly<Record<string, unknown>>,
): LiveOrder {
  if (order.state === state) {
    return order;
  }

  try {
    return transitionLiveOrder(order, {
      state,
      occurredAt: ensureMonotonicTimestamp(
        occurredAt,
        order.updatedAt,
      ),
      reason,
      metadata,
    });
  } catch {
    if (
      state !== "UNKNOWN" &&
      !isLiveOrderTerminal(order)
    ) {
      try {
        return transitionLiveOrder(order, {
          state: "UNKNOWN",
          occurredAt: ensureMonotonicTimestamp(
            occurredAt,
            order.updatedAt,
          ),
          reason:
            `Unable to reconcile local state "${order.state}" directly to "${state}".`,
          metadata: {
            ...metadata,
            requestedTargetState: state,
          },
        });
      } catch {
        return order;
      }
    }

    return order;
  }
}

function shouldApplyAcceptance(
  order: LiveOrder,
  snapshot: ExchangeOrderSnapshot,
): boolean {
  if (order.exchangeOrderId !== undefined) {
    return false;
  }

  return (
    order.state === "SUBMITTING" ||
    order.state === "SUBMITTED" ||
    order.state === "RECOVERING" ||
    order.state === "UNKNOWN"
  ) && mapExchangeState(snapshot.state) === "ACCEPTED";
}

function mapExchangeState(value: string): LiveOrderState {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return EXCHANGE_STATE_MAP[normalized] ?? "UNKNOWN";
}

function validateReconcileCommand(
  command: ReconcileOrderCommand,
): void {
  if (!isRecord(command)) {
    throw new OrderReconcilerError(
      "INVALID_COMMAND",
      "Reconcile-order command must be a record object.",
    );
  }

  if (command.operation !== "RECONCILE") {
    throw new OrderReconcilerError(
      "INVALID_COMMAND",
      `Expected RECONCILE operation but received "${String(
        command.operation,
      )}".`,
    );
  }

  normalizeIdentifier(
    command.orderId,
    "command.orderId",
    command.orderId,
  );

  normalizeIdentifier(
    command.context.commandId,
    "command.context.commandId",
    command.orderId,
  );

  normalizeIdentifier(
    command.context.correlationId,
    "command.context.correlationId",
    command.orderId,
  );

  normalizeTimestamp(
    command.context.initiatedAt,
    "command.context.initiatedAt",
  );

  if (command.exchangeId !== undefined) {
    normalizeExchangeId(
      command.exchangeId,
      command.orderId,
    );
  }

  if (command.exchangeOrderId !== undefined) {
    normalizeIdentifier(
      command.exchangeOrderId,
      "command.exchangeOrderId",
      command.orderId,
    );
  }

  if (
    command.forceExchangeRead !== undefined &&
    typeof command.forceExchangeRead !== "boolean"
  ) {
    throw new OrderReconcilerError(
      "INVALID_COMMAND",
      "command.forceExchangeRead must be boolean when provided.",
      {
        orderId: command.orderId,
      },
    );
  }
}

function validateSnapshot(
  snapshot: ExchangeOrderSnapshot,
  order: LiveOrder,
  exchangeId: string,
  exchangeOrderId: string,
  options: ResolvedLiveOrderReconcilerOptions,
): void {
  if (!isRecord(snapshot)) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      "Exchange order snapshot must be a record object.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  if (
    normalizeExchangeId(
      snapshot.exchangeId,
      order.orderId,
    ) !== exchangeId
  ) {
    throw new OrderReconcilerError(
      "EXCHANGE_ID_MISMATCH",
      "Exchange snapshot exchangeId does not match the reconciliation request.",
      {
        orderId: order.orderId,
        exchangeId: snapshot.exchangeId,
      },
    );
  }

  if (snapshot.exchangeOrderId !== exchangeOrderId) {
    throw new OrderReconcilerError(
      "EXCHANGE_ORDER_ID_MISMATCH",
      "Exchange snapshot exchangeOrderId does not match the reconciliation request.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  if (
    snapshot.orderId !== undefined &&
    snapshot.orderId !== order.orderId
  ) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      "Exchange snapshot orderId does not match the local order.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  if (
    snapshot.clientOrderId !== undefined &&
    snapshot.clientOrderId !== order.clientOrderId
  ) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      "Exchange snapshot clientOrderId does not match the local order.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  if (
    snapshot.symbol.trim().toUpperCase() !==
    order.symbol.trim().toUpperCase()
  ) {
    throw new OrderReconcilerError(
      "SYMBOL_MISMATCH",
      "Exchange snapshot symbol does not match the local order.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  validatePositiveNumber(
    snapshot.quantity,
    "snapshot.quantity",
    order.orderId,
  );

  validateNonNegativeNumber(
    snapshot.filledQuantity,
    "snapshot.filledQuantity",
    order.orderId,
  );

  validateNonNegativeNumber(
    snapshot.remainingQuantity,
    "snapshot.remainingQuantity",
    order.orderId,
  );

  if (
    options.strictQuantityMatch &&
    !numbersEqual(
      snapshot.quantity,
      order.requestedQuantity,
    )
  ) {
    throw new OrderReconcilerError(
      "QUANTITY_MISMATCH",
      `Exchange quantity ${snapshot.quantity} does not match local requested quantity ${order.requestedQuantity}.`,
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  if (
    !numbersEqual(
      snapshot.quantity,
      snapshot.filledQuantity +
        snapshot.remainingQuantity,
    )
  ) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      "Exchange snapshot quantity invariant is invalid.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }

  normalizeIdentifier(
    snapshot.state,
    "snapshot.state",
    order.orderId,
  );

  normalizeTimestamp(
    snapshot.updatedAt,
    "snapshot.updatedAt",
  );

  if (!Array.isArray(snapshot.fills)) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      "snapshot.fills must be an array.",
      {
        orderId: order.orderId,
        exchangeId,
      },
    );
  }
}

function createExecutionEvent(
  order: LiveOrder,
  idGenerator: OrderIdGenerator,
  metadata: Readonly<Record<string, unknown>>,
  failure?: LiveOrderFailure,
  fill?: LiveOrderFill,
): OrderExecutionEvent {
  const latest =
    order.transitions[order.transitions.length - 1];

  return Object.freeze({
    eventId: normalizeIdentifier(
      idGenerator.nextEventId(),
      "eventId",
      order.orderId,
    ),
    orderId: order.orderId,
    ...(order.exchangeId === undefined
      ? {}
      : { exchangeId: order.exchangeId }),
    ...(order.exchangeOrderId === undefined
      ? {}
      : { exchangeOrderId: order.exchangeOrderId }),
    state: order.state,
    occurredAt:
      fill?.receivedAt ??
      latest?.occurredAt ??
      order.updatedAt,
    sequence: order.version,
    ...(fill === undefined ? {} : { fill }),
    ...(failure === undefined ? {} : { failure }),
    metadata: freezeRecord({
      ...metadata,
      orderVersion: order.version,
      transitionId: latest?.transitionId,
    }),
  });
}

function createCommandResult(
  command: ReconcileOrderCommand,
  order: LiveOrder,
  status: OrderCommandResult["status"],
  completedAt: number,
  metadata: Readonly<Record<string, unknown>>,
  failure?: LiveOrderFailure,
): OrderCommandResult<LiveOrder> {
  return Object.freeze({
    commandId: command.context.commandId,
    operation: "RECONCILE",
    status,
    result: order,
    ...(failure === undefined ? {} : { failure }),
    completedAt: normalizeTimestamp(
      completedAt,
      "completedAt",
    ),
    metadata: freezeRecord({
      ...metadata,
      orderId: order.orderId,
      orderState: order.state,
      orderVersion: order.version,
    }),
  });
}

function normalizeReconciliationFailure(
  cause: unknown,
  occurredAt: number,
  exchangeId: string,
  exchangeOrderId: string,
): LiveOrderFailure {
  if (isRecord(cause)) {
    return createReconciliationFailure({
      category: inferFailureCategory(cause),
      code:
        readString(cause, "code") ??
        "ORDER_RECONCILIATION_FAILED",
      message:
        readString(cause, "message") ??
        "Order reconciliation failed.",
      occurredAt,
      retryable:
        readBoolean(cause, "retryable") ?? true,
      metadata: {
        exchangeId,
        exchangeOrderId,
        causeName: readString(cause, "name"),
      },
    });
  }

  return createReconciliationFailure({
    category: "UNKNOWN",
    code: "ORDER_RECONCILIATION_FAILED",
    message:
      cause instanceof Error
        ? cause.message
        : "Unknown order reconciliation failure.",
    occurredAt,
    retryable: true,
    metadata: {
      exchangeId,
      exchangeOrderId,
    },
  });
}

function inferFailureCategory(
  cause: Readonly<Record<string, unknown>>,
): LiveOrderFailureCategory {
  const code =
    (readString(cause, "code") ?? "").toUpperCase();

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

  return "RECONCILIATION";
}

function createReconciliationFailure(
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
    code: normalizeIdentifier(
      input.code,
      "failure.code",
    ),
    message: normalizeIdentifier(
      input.message,
      "failure.message",
    ),
    occurredAt: normalizeTimestamp(
      input.occurredAt,
      "failure.occurredAt",
    ),
    retryable: input.retryable,
    metadata: freezeRecord(input.metadata),
  });
}

function resolveOptions(
  options: LiveOrderReconcilerOptions,
): ResolvedLiveOrderReconcilerOptions {
  return Object.freeze({
    publishLifecycleEvents:
      options.publishLifecycleEvents ??
      DEFAULT_OPTIONS.publishLifecycleEvents,
    captureTransportExceptions:
      options.captureTransportExceptions ??
      DEFAULT_OPTIONS.captureTransportExceptions,
    markMissingExchangeOrderUnknown:
      options.markMissingExchangeOrderUnknown ??
      DEFAULT_OPTIONS.markMissingExchangeOrderUnknown,
    preserveTerminalOrders:
      options.preserveTerminalOrders ??
      DEFAULT_OPTIONS.preserveTerminalOrders,
    strictQuantityMatch:
      options.strictQuantityMatch ??
      DEFAULT_OPTIONS.strictQuantityMatch,
    metadata: freezeRecord(
      options.metadata ?? EMPTY_METADATA,
    ),
  });
}

function freezeResult(
  result: LiveOrderReconciliationResult,
): LiveOrderReconciliationResult {
  return Object.freeze({
    commandResult: result.commandResult,
    previousOrder: result.previousOrder,
    order: result.order,
    ...(result.snapshot === undefined
      ? {}
      : { snapshot: result.snapshot }),
    changed: result.changed,
    appliedFills: Object.freeze([
      ...result.appliedFills,
    ]),
    events: Object.freeze([...result.events]),
  });
}

function compareFills(
  left: LiveOrderFill,
  right: LiveOrderFill,
): number {
  if (left.executedAt !== right.executedAt) {
    return left.executedAt - right.executedAt;
  }

  if (
    left.sequence !== undefined &&
    right.sequence !== undefined &&
    left.sequence !== right.sequence
  ) {
    return left.sequence - right.sequence;
  }

  return left.fillId.localeCompare(right.fillId);
}

function numbersEqual(
  left: number,
  right: number,
): boolean {
  return Math.abs(left - right) <= 1e-10;
}

function ensureMonotonicTimestamp(
  candidate: number,
  minimum: number,
): number {
  return Math.max(
    normalizeTimestamp(candidate, "timestamp"),
    normalizeTimestamp(
      minimum,
      "minimumTimestamp",
    ),
  );
}

function normalizeExchangeId(
  value: unknown,
  orderId?: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderReconcilerError(
      "MISSING_EXCHANGE_ID",
      "Exchange identifier must be a non-empty string.",
      { orderId },
    );
  }

  return value.trim().toLowerCase();
}

function normalizeIdentifier(
  value: unknown,
  field: string,
  orderId?: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderReconcilerError(
      field.includes("exchangeOrderId")
        ? "MISSING_EXCHANGE_ORDER_ID"
        : "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
      { orderId },
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
    throw new OrderReconcilerError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }

  return value;
}

function validatePositiveNumber(
  value: unknown,
  field: string,
  orderId?: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      `${field} must be greater than zero.`,
      { orderId },
    );
  }

  return value;
}

function validateNonNegativeNumber(
  value: unknown,
  field: string,
  orderId?: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new OrderReconcilerError(
      "INVALID_EXCHANGE_SNAPSHOT",
      `${field} must be non-negative.`,
      { orderId },
    );
  }

  return value;
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
    throw new OrderReconcilerError(
      "INVALID_DEPENDENCY",
      "Order execution transport must provide submit(), cancel(), replace(), and fetchOrder().",
    );
  }
}

function validateRepository(
  value: unknown,
): asserts value is OrderRepository {
  if (
    !isRecord(value) ||
    typeof value.save !== "function" ||
    typeof value.findByOrderId !== "function" ||
    typeof value.findByClientOrderId !== "function" ||
    typeof value.findByExchangeOrderId !== "function" ||
    typeof value.query !== "function"
  ) {
    throw new OrderReconcilerError(
      "INVALID_DEPENDENCY",
      "Order repository must provide the complete OrderRepository contract.",
    );
  }
}

function validateIdGenerator(
  value: unknown,
): asserts value is OrderIdGenerator {
  if (
    !isRecord(value) ||
    typeof value.nextEventId !== "function"
  ) {
    throw new OrderReconcilerError(
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
    typeof value.now !== "function"
  ) {
    throw new OrderReconcilerError(
      "INVALID_DEPENDENCY",
      "Order reconciler clock must provide now().",
    );
  }
}

function validatePublisher(
  value: unknown,
): asserts value is OrderEventPublisher {
  if (
    !isRecord(value) ||
    typeof value.publish !== "function"
  ) {
    throw new OrderReconcilerError(
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

  return normalized.length === 0
    ? undefined
    : normalized;
}

function readBoolean(
  source: Readonly<Record<string, unknown>>,
  key: string,
): boolean | undefined {
  const value = source[key];

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