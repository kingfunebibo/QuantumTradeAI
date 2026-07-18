import {
  type AlgorithmicExecutionChildOrder,
  type AlgorithmicExecutionChildOrderStatus,
  type AlgorithmicExecutionEventType,
  type AlgorithmicExecutionFill,
  type AlgorithmicExecutionIdentifierGenerator,
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionMetadata,
  type AlgorithmicExecutionSlice,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface AlgorithmicExecutionChildOrderLifecycleEvent {
  readonly executionId: string;
  readonly sliceId: string;
  readonly childOrderId: string;

  readonly type:
    AlgorithmicExecutionEventType;

  readonly occurredAt: number;

  readonly payload:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionChildOrderLifecycleResult {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly event:
    AlgorithmicExecutionChildOrderLifecycleEvent;
}

export interface CreateAlgorithmicExecutionChildOrderInput {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  readonly slice:
    AlgorithmicExecutionSlice;

  readonly exchangeId: string;
  readonly accountId?: string | null;

  readonly exchangeSymbol?: string | null;

  readonly quantity: number;
  readonly limitPrice?: number | null;

  readonly childOrderId?: string;
  readonly clientOrderId?: string;

  readonly createdAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderSubmittingInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderSubmittedInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly exchangeOrderId:
    string | null;

  readonly submittedQuantity?:
    number;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface ApplyAlgorithmicExecutionChildOrderFillInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly fill:
    AlgorithmicExecutionFill;

  readonly occurredAt?: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderCancellingInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderCancelledInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderRejectedInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkAlgorithmicExecutionChildOrderFailedInput {
  readonly childOrder:
    AlgorithmicExecutionChildOrder;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt: number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionChildOrderLifecycleManagerOptions {
  readonly identifierGenerator?:
    AlgorithmicExecutionIdentifierGenerator;

  readonly quantityTolerance?:
    number;
}

function createStatusList(
  ...statuses:
    AlgorithmicExecutionChildOrderStatus[]
): readonly AlgorithmicExecutionChildOrderStatus[] {
  return Object.freeze([
    ...statuses,
  ]);
}

const CHILD_ORDER_TRANSITIONS:
  Readonly<
    Record<
      AlgorithmicExecutionChildOrderStatus,
      readonly AlgorithmicExecutionChildOrderStatus[]
    >
  > =
  Object.freeze({
    CREATED:
      createStatusList(
        "SUBMITTING",
        "CANCELLED",
        "REJECTED",
        "FAILED",
      ),

    SUBMITTING:
      createStatusList(
        "OPEN",
        "PARTIALLY_FILLED",
        "FILLED",
        "CANCELLING",
        "CANCELLED",
        "REJECTED",
        "FAILED",
      ),

    OPEN:
      createStatusList(
        "PARTIALLY_FILLED",
        "FILLED",
        "CANCELLING",
        "CANCELLED",
        "FAILED",
      ),

    PARTIALLY_FILLED:
      createStatusList(
        "PARTIALLY_FILLED",
        "FILLED",
        "CANCELLING",
        "CANCELLED",
        "FAILED",
      ),

    FILLED:
      createStatusList(),

    CANCELLING:
      createStatusList(
        "PARTIALLY_FILLED",
        "FILLED",
        "CANCELLED",
        "FAILED",
      ),

    CANCELLED:
      createStatusList(),

    REJECTED:
      createStatusList(),

    FAILED:
      createStatusList(),
  });

function assertObject(
  value: unknown,
  field: string,
): asserts value is object {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object"
  ) {
    throw new Error(
      `${field} must be provided.`,
    );
  }
}

function assertNonEmptyString(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} must be a non-empty string.`,
    );
  }
}

function assertFiniteNonNegativeNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function assertPositiveFiniteNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive finite number.`,
    );
  }
}

function assertNullablePositiveFiniteNumber(
  value: number | null,
  field: string,
): void {
  if (
    value === null
  ) {
    return;
  }

  assertPositiveFiniteNumber(
    value,
    field,
  );
}

function mergeMetadata(
  base:
    AlgorithmicExecutionMetadata,
  additional?:
    AlgorithmicExecutionMetadata,
): AlgorithmicExecutionMetadata {
  return freezeAlgorithmicExecutionMetadata({
    ...base,
    ...(additional ?? {}),
  });
}

function freezeFill(
  fill:
    AlgorithmicExecutionFill,
): AlgorithmicExecutionFill {
  return Object.freeze({
    ...fill,

    metadata:
      freezeAlgorithmicExecutionMetadata(
        fill.metadata,
      ),
  });
}

function freezeChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
): AlgorithmicExecutionChildOrder {
  return Object.freeze({
    ...childOrder,

    fills:
      Object.freeze(
        childOrder.fills.map(
          freezeFill,
        ),
      ),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        childOrder.metadata,
      ),
  });
}

function createLifecycleEvent(
  childOrder:
    AlgorithmicExecutionChildOrder,
  type:
    AlgorithmicExecutionEventType,
  occurredAt: number,
  payload:
    AlgorithmicExecutionMetadata,
): AlgorithmicExecutionChildOrderLifecycleEvent {
  return Object.freeze({
    executionId:
      childOrder.executionId,

    sliceId:
      childOrder.sliceId,

    childOrderId:
      childOrder.childOrderId,

    type,

    occurredAt,

    payload:
      freezeAlgorithmicExecutionMetadata(
        payload,
      ),
  });
}

function calculateWeightedAverageFillPrice(
  fills:
    readonly AlgorithmicExecutionFill[],
): number | null {
  let totalQuantity = 0;
  let totalNotional = 0;

  for (
    const fill of
    fills
  ) {
    if (
      !Number.isFinite(
        fill.quantity,
      ) ||
      fill.quantity <= 0 ||
      !Number.isFinite(
        fill.price,
      ) ||
      fill.price <= 0
    ) {
      continue;
    }

    totalQuantity +=
      fill.quantity;

    totalNotional +=
      fill.quantity *
      fill.price;
  }

  if (
    totalQuantity <= 0
  ) {
    return null;
  }

  return (
    totalNotional /
    totalQuantity
  );
}

function ensureTransitionAllowed(
  currentStatus:
    AlgorithmicExecutionChildOrderStatus,
  nextStatus:
    AlgorithmicExecutionChildOrderStatus,
): void {
  if (
    currentStatus ===
    nextStatus &&
    nextStatus ===
    "PARTIALLY_FILLED"
  ) {
    return;
  }

  const allowedTransitions =
    CHILD_ORDER_TRANSITIONS[
      currentStatus
    ];

  if (
    !allowedTransitions.includes(
      nextStatus,
    )
  ) {
    throw new Error(
      [
        "Invalid algorithmic execution child-order transition:",
        `${currentStatus} -> ${nextStatus}.`,
      ].join(" "),
    );
  }
}

function validateChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
): void {
  assertObject(
    childOrder,
    "childOrder",
  );

  assertNonEmptyString(
    childOrder.childOrderId,
    "childOrder.childOrderId",
  );

  assertNonEmptyString(
    childOrder.executionId,
    "childOrder.executionId",
  );

  assertNonEmptyString(
    childOrder.sliceId,
    "childOrder.sliceId",
  );

  assertNonEmptyString(
    childOrder.clientOrderId,
    "childOrder.clientOrderId",
  );

  assertNonEmptyString(
    childOrder.exchangeId,
    "childOrder.exchangeId",
  );

  assertNonEmptyString(
    childOrder.symbol,
    "childOrder.symbol",
  );

  assertPositiveFiniteNumber(
    childOrder.quantity,
    "childOrder.quantity",
  );

  assertFiniteNonNegativeNumber(
    childOrder.submittedQuantity,
    "childOrder.submittedQuantity",
  );

  assertFiniteNonNegativeNumber(
    childOrder.filledQuantity,
    "childOrder.filledQuantity",
  );

  assertFiniteNonNegativeNumber(
    childOrder.remainingQuantity,
    "childOrder.remainingQuantity",
  );

  assertNullablePositiveFiniteNumber(
    childOrder.limitPrice,
    "childOrder.limitPrice",
  );

  assertNullablePositiveFiniteNumber(
    childOrder.averageFillPrice,
    "childOrder.averageFillPrice",
  );

  if (
    !Array.isArray(
      childOrder.fills,
    )
  ) {
    throw new Error(
      "childOrder.fills must be an array.",
    );
  }
}

function validateFill(
  fill:
    AlgorithmicExecutionFill,
  childOrder:
    AlgorithmicExecutionChildOrder,
): void {
  assertObject(
    fill,
    "fill",
  );

  assertNonEmptyString(
    fill.fillId,
    "fill.fillId",
  );

  assertPositiveFiniteNumber(
    fill.quantity,
    "fill.quantity",
  );

  assertPositiveFiniteNumber(
    fill.price,
    "fill.price",
  );

  assertFiniteNonNegativeNumber(
    fill.notional,
    "fill.notional",
  );

  assertFiniteNonNegativeNumber(
    fill.fee,
    "fill.fee",
  );

  assertFiniteNonNegativeNumber(
    fill.occurredAt,
    "fill.occurredAt",
  );

  assertFiniteNonNegativeNumber(
    fill.receivedAt,
    "fill.receivedAt",
  );

  if (
    fill.executionId !==
    childOrder.executionId
  ) {
    throw new Error(
      "fill.executionId must match childOrder.executionId.",
    );
  }

  if (
    fill.sliceId !==
    childOrder.sliceId
  ) {
    throw new Error(
      "fill.sliceId must match childOrder.sliceId.",
    );
  }

  if (
    fill.childOrderId !==
    childOrder.childOrderId
  ) {
    throw new Error(
      "fill.childOrderId must match childOrder.childOrderId.",
    );
  }
}

function updateChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
  status:
    AlgorithmicExecutionChildOrderStatus,
  occurredAt: number,
  updates:
    Partial<
      Omit<
        AlgorithmicExecutionChildOrder,
        | "childOrderId"
        | "executionId"
        | "sliceId"
        | "clientOrderId"
        | "exchangeId"
        | "accountId"
        | "symbol"
        | "exchangeSymbol"
        | "side"
        | "orderType"
        | "timeInForce"
        | "quantity"
        | "createdAt"
      >
    >,
): AlgorithmicExecutionChildOrder {
  validateChildOrder(
    childOrder,
  );

  assertFiniteNonNegativeNumber(
    occurredAt,
    "occurredAt",
  );

  if (
    occurredAt <
    childOrder.updatedAt
  ) {
    throw new Error(
      "occurredAt cannot be earlier than childOrder.updatedAt.",
    );
  }

  ensureTransitionAllowed(
    childOrder.status,
    status,
  );

  return freezeChildOrder({
    ...childOrder,
    ...updates,

    status,

    updatedAt:
      occurredAt,
  });
}

export class AlgorithmicExecutionChildOrderLifecycleManager {
  private readonly identifierGenerator:
    AlgorithmicExecutionIdentifierGenerator | null;

  private readonly quantityTolerance:
    number;

  private fallbackIdentifierSequence:
    number;

  public constructor(
    options:
      AlgorithmicExecutionChildOrderLifecycleManagerOptions = {},
  ) {
    const quantityTolerance =
      options.quantityTolerance ??
      1e-12;

    if (
      !Number.isFinite(
        quantityTolerance,
      ) ||
      quantityTolerance < 0
    ) {
      throw new Error(
        [
          "options.quantityTolerance must be",
          "a non-negative finite number.",
        ].join(" "),
      );
    }

    this.identifierGenerator =
      options.identifierGenerator ??
      null;

    this.quantityTolerance =
      quantityTolerance;

    this.fallbackIdentifierSequence =
      0;
  }

  public create(
    input:
      CreateAlgorithmicExecutionChildOrderInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    assertObject(
      input.instruction,
      "input.instruction",
    );

    assertObject(
      input.slice,
      "input.slice",
    );

    assertNonEmptyString(
      input.instruction.executionId,
      "input.instruction.executionId",
    );

    assertNonEmptyString(
      input.slice.sliceId,
      "input.slice.sliceId",
    );

    assertNonEmptyString(
      input.exchangeId,
      "input.exchangeId",
    );

    assertPositiveFiniteNumber(
      input.quantity,
      "input.quantity",
    );

    assertFiniteNonNegativeNumber(
      input.createdAt,
      "input.createdAt",
    );

    const limitPrice =
      input.limitPrice ??
      input.instruction.limitPrice;

    assertNullablePositiveFiniteNumber(
      limitPrice,
      "input.limitPrice",
    );

    if (
      input.slice.executionId !==
      input.instruction.executionId
    ) {
      throw new Error(
        [
          "input.slice.executionId must match",
          "input.instruction.executionId.",
        ].join(" "),
      );
    }

    if (
      input.quantity >
      input.slice.remainingQuantity +
        this.quantityTolerance
    ) {
      throw new Error(
        [
          "input.quantity cannot exceed",
          "input.slice.remainingQuantity.",
        ].join(" "),
      );
    }

    const childOrderId =
      input.childOrderId ??
      this.nextIdentifier(
        "algo-child-order",
      );

    const clientOrderId =
      input.clientOrderId ??
      this.nextIdentifier(
        "algo-client-order",
      );

    assertNonEmptyString(
      childOrderId,
      "childOrderId",
    );

    assertNonEmptyString(
      clientOrderId,
      "clientOrderId",
    );

    const metadata =
      mergeMetadata(
        input.instruction.metadata,
        input.metadata,
      );

    const childOrder =
      freezeChildOrder({
        childOrderId:
          childOrderId.trim(),

        executionId:
          input.instruction
            .executionId,

        sliceId:
          input.slice.sliceId,

        clientOrderId:
          clientOrderId.trim(),

        exchangeId:
          input.exchangeId.trim(),

        accountId:
          input.accountId ??
          null,

        exchangeOrderId:
          null,

        symbol:
          input.instruction.symbol,

        exchangeSymbol:
          input.exchangeSymbol ??
          input.instruction
            .exchangeSymbol,

        side:
          input.instruction.side,

        orderType:
          input.instruction.orderType,

        timeInForce:
          input.instruction.timeInForce,

        quantity:
          input.quantity,

        limitPrice,

        status:
          "CREATED",

        submittedQuantity:
          0,

        filledQuantity:
          0,

        remainingQuantity:
          input.quantity,

        averageFillPrice:
          null,

        createdAt:
          input.createdAt,

        submittedAt:
          null,

        completedAt:
          null,

        updatedAt:
          input.createdAt,

        failureCode:
          null,

        failureMessage:
          null,

        fills:
          Object.freeze([]),

        metadata,
      });

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_CREATED",
          input.createdAt,
          {
            exchangeId:
              childOrder.exchangeId,

            quantity:
              childOrder.quantity,

            limitPrice:
              childOrder.limitPrice,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markSubmitting(
    input:
      MarkAlgorithmicExecutionChildOrderSubmittingInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        "SUBMITTING",
        input.occurredAt,
        {
          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_SUBMITTED",
          input.occurredAt,
          {
            phase:
              "SUBMITTING",

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markSubmitted(
    input:
      MarkAlgorithmicExecutionChildOrderSubmittedInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    const submittedQuantity =
      input.submittedQuantity ??
      input.childOrder.quantity;

    assertPositiveFiniteNumber(
      submittedQuantity,
      "input.submittedQuantity",
    );

    if (
      submittedQuantity >
      input.childOrder.quantity +
        this.quantityTolerance
    ) {
      throw new Error(
        [
          "input.submittedQuantity cannot exceed",
          "childOrder.quantity.",
        ].join(" "),
      );
    }

    if (
      input.exchangeOrderId !==
      null
    ) {
      assertNonEmptyString(
        input.exchangeOrderId,
        "input.exchangeOrderId",
      );
    }

    const remainingQuantity =
      Math.max(
        0,
        input.childOrder.quantity -
          input.childOrder
            .filledQuantity,
      );

    const nextStatus:
      AlgorithmicExecutionChildOrderStatus =
      remainingQuantity <=
      this.quantityTolerance
        ? "FILLED"
        : input.childOrder
              .filledQuantity >
            this.quantityTolerance
          ? "PARTIALLY_FILLED"
          : "OPEN";

    const childOrder =
      updateChildOrder(
        input.childOrder,
        nextStatus,
        input.occurredAt,
        {
          exchangeOrderId:
            input.exchangeOrderId,

          submittedQuantity,

          remainingQuantity,

          submittedAt:
            input.childOrder
              .submittedAt ??
            input.occurredAt,

          completedAt:
            nextStatus ===
            "FILLED"
              ? input.occurredAt
              : null,

          failureCode:
            null,

          failureMessage:
            null,

          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_SUBMITTED",
          input.occurredAt,
          {
            exchangeOrderId:
              childOrder.exchangeOrderId,

            submittedQuantity:
              childOrder
                .submittedQuantity,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public applyFill(
    input:
      ApplyAlgorithmicExecutionChildOrderFillInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    validateChildOrder(
      input.childOrder,
    );

    validateFill(
      input.fill,
      input.childOrder,
    );

    if (
      input.childOrder.status ===
        "FILLED" ||
      input.childOrder.status ===
        "CANCELLED" ||
      input.childOrder.status ===
        "REJECTED" ||
      input.childOrder.status ===
        "FAILED"
    ) {
      throw new Error(
        [
          "Cannot apply a fill to child order",
          `in ${input.childOrder.status} status.`,
        ].join(" "),
      );
    }

    const duplicateFill =
      input.childOrder.fills.some(
        (
          existingFill,
        ) =>
          existingFill.fillId ===
          input.fill.fillId,
      );

    if (
      duplicateFill
    ) {
      throw new Error(
        [
          "Duplicate child-order fill:",
          `${input.fill.fillId}.`,
        ].join(" "),
      );
    }

    const occurredAt =
      input.occurredAt ??
      input.fill.receivedAt;

    assertFiniteNonNegativeNumber(
      occurredAt,
      "occurredAt",
    );

    const fills =
      Object.freeze([
        ...input.childOrder.fills,
        freezeFill(
          input.fill,
        ),
      ]);

    const rawFilledQuantity =
      fills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.quantity,
        0,
      );

    if (
      rawFilledQuantity >
      input.childOrder.quantity +
        this.quantityTolerance
    ) {
      throw new Error(
        [
          "Applying the fill would cause",
          "childOrder.filledQuantity to exceed",
          "childOrder.quantity.",
        ].join(" "),
      );
    }

    const filledQuantity =
      Math.min(
        input.childOrder.quantity,
        rawFilledQuantity,
      );

    const remainingQuantity =
      Math.max(
        0,
        input.childOrder.quantity -
          filledQuantity,
      );

    const completed =
      remainingQuantity <=
      this.quantityTolerance;

    const nextStatus:
      AlgorithmicExecutionChildOrderStatus =
      completed
        ? "FILLED"
        : "PARTIALLY_FILLED";

    const averageFillPrice =
      calculateWeightedAverageFillPrice(
        fills,
      );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        nextStatus,
        occurredAt,
        {
          submittedQuantity:
            Math.max(
              input.childOrder
                .submittedQuantity,
              filledQuantity,
            ),

          filledQuantity,

          remainingQuantity,

          averageFillPrice,

          submittedAt:
            input.childOrder
              .submittedAt ??
            occurredAt,

          completedAt:
            completed
              ? occurredAt
              : null,

          failureCode:
            null,

          failureMessage:
            null,

          fills,

          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          completed
            ? "CHILD_ORDER_FILLED"
            : "CHILD_ORDER_PARTIALLY_FILLED",
          occurredAt,
          {
            fillId:
              input.fill.fillId,

            fillQuantity:
              input.fill.quantity,

            fillPrice:
              input.fill.price,

            filledQuantity:
              childOrder.filledQuantity,

            remainingQuantity:
              childOrder.remainingQuantity,

            averageFillPrice:
              childOrder.averageFillPrice,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markCancelling(
    input:
      MarkAlgorithmicExecutionChildOrderCancellingInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        "CANCELLING",
        input.occurredAt,
        {
          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_CANCELLED",
          input.occurredAt,
          {
            phase:
              "CANCELLING",

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markCancelled(
    input:
      MarkAlgorithmicExecutionChildOrderCancelledInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        "CANCELLED",
        input.occurredAt,
        {
          completedAt:
            input.occurredAt,

          failureCode:
            null,

          failureMessage:
            null,

          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_CANCELLED",
          input.occurredAt,
          {
            filledQuantity:
              childOrder.filledQuantity,

            remainingQuantity:
              childOrder.remainingQuantity,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markRejected(
    input:
      MarkAlgorithmicExecutionChildOrderRejectedInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    assertNonEmptyString(
      input.failureCode,
      "input.failureCode",
    );

    assertNonEmptyString(
      input.failureMessage,
      "input.failureMessage",
    );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        "REJECTED",
        input.occurredAt,
        {
          completedAt:
            input.occurredAt,

          failureCode:
            input.failureCode.trim(),

          failureMessage:
            input.failureMessage.trim(),

          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_REJECTED",
          input.occurredAt,
          {
            failureCode:
              childOrder.failureCode,

            failureMessage:
              childOrder.failureMessage,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public markFailed(
    input:
      MarkAlgorithmicExecutionChildOrderFailedInput,
  ): AlgorithmicExecutionChildOrderLifecycleResult {
    assertObject(
      input,
      "input",
    );

    assertNonEmptyString(
      input.failureCode,
      "input.failureCode",
    );

    assertNonEmptyString(
      input.failureMessage,
      "input.failureMessage",
    );

    const childOrder =
      updateChildOrder(
        input.childOrder,
        "FAILED",
        input.occurredAt,
        {
          completedAt:
            input.occurredAt,

          failureCode:
            input.failureCode.trim(),

          failureMessage:
            input.failureMessage.trim(),

          metadata:
            mergeMetadata(
              input.childOrder.metadata,
              input.metadata,
            ),
        },
      );

    return Object.freeze({
      childOrder,

      event:
        createLifecycleEvent(
          childOrder,
          "CHILD_ORDER_FAILED",
          input.occurredAt,
          {
            failureCode:
              childOrder.failureCode,

            failureMessage:
              childOrder.failureMessage,

            status:
              childOrder.status,
          },
        ),
    });
  }

  public canTransition(
    currentStatus:
      AlgorithmicExecutionChildOrderStatus,
    nextStatus:
      AlgorithmicExecutionChildOrderStatus,
  ): boolean {
    if (
      currentStatus ===
      nextStatus
    ) {
      return (
        nextStatus ===
        "PARTIALLY_FILLED"
      );
    }

    return CHILD_ORDER_TRANSITIONS[
      currentStatus
    ].includes(
      nextStatus,
    );
  }

  public isTerminal(
    childOrder:
      AlgorithmicExecutionChildOrder,
  ): boolean {
    validateChildOrder(
      childOrder,
    );

    return (
      childOrder.status ===
        "FILLED" ||
      childOrder.status ===
        "CANCELLED" ||
      childOrder.status ===
        "REJECTED" ||
      childOrder.status ===
        "FAILED"
    );
  }

  public isActive(
    childOrder:
      AlgorithmicExecutionChildOrder,
  ): boolean {
    validateChildOrder(
      childOrder,
    );

    return (
      childOrder.status ===
        "CREATED" ||
      childOrder.status ===
        "SUBMITTING" ||
      childOrder.status ===
        "OPEN" ||
      childOrder.status ===
        "PARTIALLY_FILLED" ||
      childOrder.status ===
        "CANCELLING"
    );
  }

  private nextIdentifier(
    prefix: string,
  ): string {
    if (
      this.identifierGenerator !==
      null
    ) {
      return this.identifierGenerator
        .nextId(
          prefix,
        );
    }

    this.fallbackIdentifierSequence +=
      1;

    return [
      prefix,
      this.fallbackIdentifierSequence
        .toString()
        .padStart(
          8,
          "0",
        ),
    ].join("-");
  }
}

export function createAlgorithmicExecutionChildOrderLifecycleManager(
  options:
    AlgorithmicExecutionChildOrderLifecycleManagerOptions = {},
): AlgorithmicExecutionChildOrderLifecycleManager {
  return new AlgorithmicExecutionChildOrderLifecycleManager(
    options,
  );
}