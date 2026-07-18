import {
  type AlgorithmicExecutionChildOrder,
  type AlgorithmicExecutionFill,
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionProgress,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  clampAlgorithmicExecutionRatio,
} from "./algorithmic-execution-contracts";

export interface CalculateAlgorithmicExecutionProgressInput {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  readonly schedule:
    AlgorithmicExecutionSchedule | null;

  readonly childOrders:
    readonly AlgorithmicExecutionChildOrder[];

  readonly fills:
    readonly AlgorithmicExecutionFill[];

  readonly currentTime: number;

  /**
   * Optional arrival price used to calculate implementation shortfall.
   *
   * When omitted, the calculator preserves the previous progress value.
   */
  readonly estimatedArrivalPrice?:
    number | null;

  /**
   * Optional previous progress snapshot.
   *
   * This is used to preserve arrival-price information when no new
   * arrival price is supplied.
   */
  readonly previousProgress?:
    AlgorithmicExecutionProgress | null;
}

export interface AlgorithmicExecutionProgressCalculatorOptions {
  /**
   * Numerical tolerance used when comparing quantities.
   *
   * Defaults to 1e-12.
   */
  readonly quantityTolerance?: number;
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

function sumNumbers(
  values: readonly number[],
): number {
  let total = 0;

  for (
    const value of
    values
  ) {
    if (
      Number.isFinite(
        value,
      )
    ) {
      total += value;
    }
  }

  return total;
}

function calculateWeightedAveragePrice(
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

function calculateFilledNotional(
  fills:
    readonly AlgorithmicExecutionFill[],
): number {
  let totalNotional = 0;

  for (
    const fill of
    fills
  ) {
    if (
      Number.isFinite(
        fill.notional,
      ) &&
      fill.notional >= 0
    ) {
      totalNotional +=
        fill.notional;

      continue;
    }

    if (
      Number.isFinite(
        fill.quantity,
      ) &&
      fill.quantity > 0 &&
      Number.isFinite(
        fill.price,
      ) &&
      fill.price > 0
    ) {
      totalNotional +=
        fill.quantity *
        fill.price;
    }
  }

  return totalNotional;
}

function isCompletedSlice(
  slice:
    AlgorithmicExecutionSlice,
): boolean {
  return (
    slice.status ===
      "FILLED" ||
    slice.status ===
      "CANCELLED" ||
    slice.status ===
      "SKIPPED"
  );
}

function isFailedSlice(
  slice:
    AlgorithmicExecutionSlice,
): boolean {
  return (
    slice.status ===
    "FAILED"
  );
}

function isActiveChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
): boolean {
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

function isCompletedChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
): boolean {
  return (
    childOrder.status ===
      "FILLED" ||
    childOrder.status ===
      "CANCELLED"
  );
}

function isFailedChildOrder(
  childOrder:
    AlgorithmicExecutionChildOrder,
): boolean {
  return (
    childOrder.status ===
      "REJECTED" ||
    childOrder.status ===
      "FAILED"
  );
}

function calculateImplementationShortfallBps(
  side: "BUY" | "SELL",
  averageFillPrice: number | null,
  estimatedArrivalPrice: number | null,
): number | null {
  if (
    averageFillPrice === null ||
    estimatedArrivalPrice === null ||
    estimatedArrivalPrice <= 0
  ) {
    return null;
  }

  const priceDifference =
    side === "BUY"
      ? averageFillPrice -
        estimatedArrivalPrice
      : estimatedArrivalPrice -
        averageFillPrice;

  return (
    priceDifference /
    estimatedArrivalPrice
  ) * 10_000;
}

function normalizeQuantity(
  value: number,
  tolerance: number,
): number {
  if (
    !Number.isFinite(
      value,
    ) ||
    value <= tolerance
  ) {
    return 0;
  }

  return value;
}

function validateInstruction(
  instruction:
    AlgorithmicExecutionInstruction,
): void {
  if (
    instruction === null ||
    instruction === undefined ||
    typeof instruction !== "object"
  ) {
    throw new Error(
      "instruction must be provided.",
    );
  }

  assertNonEmptyString(
    instruction.executionId,
    "instruction.executionId",
  );

  assertPositiveFiniteNumber(
    instruction.totalQuantity,
    "instruction.totalQuantity",
  );

  assertFiniteNonNegativeNumber(
    instruction.startTime,
    "instruction.startTime",
  );

  assertFiniteNonNegativeNumber(
    instruction.endTime,
    "instruction.endTime",
  );

  if (
    instruction.endTime <
    instruction.startTime
  ) {
    throw new Error(
      "instruction.endTime cannot be earlier than instruction.startTime.",
    );
  }
}

function validateSchedule(
  schedule:
    AlgorithmicExecutionSchedule | null,
  executionId: string,
): void {
  if (
    schedule === null
  ) {
    return;
  }

  if (
    schedule.executionId !==
    executionId
  ) {
    throw new Error(
      [
        "schedule.executionId must match",
        "instruction.executionId.",
      ].join(" "),
    );
  }

  if (
    !Array.isArray(
      schedule.slices,
    )
  ) {
    throw new Error(
      "schedule.slices must be an array.",
    );
  }
}

function validateChildOrders(
  childOrders:
    readonly AlgorithmicExecutionChildOrder[],
  executionId: string,
): void {
  if (
    !Array.isArray(
      childOrders,
    )
  ) {
    throw new Error(
      "childOrders must be an array.",
    );
  }

  for (
    const childOrder of
    childOrders
  ) {
    if (
      childOrder.executionId !==
      executionId
    ) {
      throw new Error(
        [
          "Every child order must belong",
          `to execution ${executionId}.`,
        ].join(" "),
      );
    }
  }
}

function validateFills(
  fills:
    readonly AlgorithmicExecutionFill[],
  executionId: string,
): void {
  if (
    !Array.isArray(
      fills,
    )
  ) {
    throw new Error(
      "fills must be an array.",
    );
  }

  for (
    const fill of
    fills
  ) {
    if (
      fill.executionId !==
      executionId
    ) {
      throw new Error(
        [
          "Every fill must belong",
          `to execution ${executionId}.`,
        ].join(" "),
      );
    }
  }
}

export class AlgorithmicExecutionProgressCalculator {
  private readonly quantityTolerance:
    number;

  public constructor(
    options:
      AlgorithmicExecutionProgressCalculatorOptions = {},
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

    this.quantityTolerance =
      quantityTolerance;
  }

  public calculate(
    input:
      CalculateAlgorithmicExecutionProgressInput,
  ): AlgorithmicExecutionProgress {
    if (
      input === null ||
      input === undefined ||
      typeof input !== "object"
    ) {
      throw new Error(
        "input must be provided.",
      );
    }

    validateInstruction(
      input.instruction,
    );

    assertFiniteNonNegativeNumber(
      input.currentTime,
      "input.currentTime",
    );

    const executionId =
      input.instruction.executionId;

    validateSchedule(
      input.schedule,
      executionId,
    );

    validateChildOrders(
      input.childOrders,
      executionId,
    );

    validateFills(
      input.fills,
      executionId,
    );

    const targetQuantity =
      input.instruction.totalQuantity;

    const scheduledQuantity =
      normalizeQuantity(
        input.schedule === null
          ? 0
          : input.schedule
              .totalScheduledQuantity,
        this.quantityTolerance,
      );

    const submittedQuantity =
      normalizeQuantity(
        sumNumbers(
          input.childOrders.map(
            (
              childOrder,
            ) =>
              childOrder
                .submittedQuantity,
          ),
        ),
        this.quantityTolerance,
      );

    const rawFilledQuantity =
      sumNumbers(
        input.fills.map(
          (
            fill,
          ) =>
            Math.max(
              0,
              fill.quantity,
            ),
        ),
      );

    const filledQuantity =
      normalizeQuantity(
        Math.min(
          targetQuantity,
          rawFilledQuantity,
        ),
        this.quantityTolerance,
      );

    const remainingQuantity =
      normalizeQuantity(
        Math.max(
          0,
          targetQuantity -
            filledQuantity,
        ),
        this.quantityTolerance,
      );

    const completionRatio =
      clampAlgorithmicExecutionRatio(
        targetQuantity <=
          this.quantityTolerance
          ? 1
          : filledQuantity /
              targetQuantity,
      );

    const effectiveCurrentTime =
      Math.max(
        input.currentTime,
        input.instruction.startTime,
      );

    const elapsedMilliseconds =
      Math.max(
        0,
        Math.min(
          effectiveCurrentTime,
          input.instruction.endTime,
        ) -
          input.instruction
            .startTime,
      );

    const remainingMilliseconds =
      Math.max(
        0,
        input.instruction.endTime -
          effectiveCurrentTime,
      );

    const slices =
      input.schedule?.slices ??
      [];

    const completedSliceCount =
      slices.filter(
        isCompletedSlice,
      ).length;

    const failedSliceCount =
      slices.filter(
        isFailedSlice,
      ).length;

    const activeChildOrderCount =
      input.childOrders.filter(
        isActiveChildOrder,
      ).length;

    const completedChildOrderCount =
      input.childOrders.filter(
        isCompletedChildOrder,
      ).length;

    const failedChildOrderCount =
      input.childOrders.filter(
        isFailedChildOrder,
      ).length;

    const averageFillPrice =
      calculateWeightedAveragePrice(
        input.fills,
      );

    const filledNotional =
      calculateFilledNotional(
        input.fills,
      );

    const estimatedArrivalPrice =
      input.estimatedArrivalPrice !==
      undefined
        ? input.estimatedArrivalPrice
        : input.previousProgress
            ?.estimatedArrivalPrice ??
          null;

    assertNullablePositiveFiniteNumber(
      estimatedArrivalPrice,
      "input.estimatedArrivalPrice",
    );

    const implementationShortfallBps =
      calculateImplementationShortfallBps(
        input.instruction.side,
        averageFillPrice,
        estimatedArrivalPrice,
      );

    return Object.freeze({
      executionId,

      targetQuantity,

      scheduledQuantity,

      submittedQuantity,

      filledQuantity,

      remainingQuantity,

      completionRatio,

      elapsedMilliseconds,

      remainingMilliseconds,

      scheduledSliceCount:
        slices.length,

      completedSliceCount,

      failedSliceCount,

      activeChildOrderCount,

      completedChildOrderCount,

      failedChildOrderCount,

      averageFillPrice,

      filledNotional,

      estimatedArrivalPrice,

      implementationShortfallBps,

      updatedAt:
        input.currentTime,
    });
  }

  public calculateFromState(
    state:
      AlgorithmicExecutionState,
    currentTime: number,
    estimatedArrivalPrice?:
      number | null,
  ): AlgorithmicExecutionProgress {
    if (
      state === null ||
      state === undefined ||
      typeof state !== "object"
    ) {
      throw new Error(
        "state must be provided.",
      );
    }

    return this.calculate({
      instruction:
        state.instruction,

      schedule:
        state.schedule,

      childOrders:
        state.childOrders,

      fills:
        state.fills,

      currentTime,

      estimatedArrivalPrice,

      previousProgress:
        state.progress,
    });
  }

  public isTargetQuantityFilled(
    progress:
      AlgorithmicExecutionProgress,
  ): boolean {
    if (
      progress === null ||
      progress === undefined ||
      typeof progress !== "object"
    ) {
      throw new Error(
        "progress must be provided.",
      );
    }

    return (
      progress.remainingQuantity <=
        this.quantityTolerance ||
      progress.completionRatio >=
        1
    );
  }

  public hasActiveChildOrders(
    progress:
      AlgorithmicExecutionProgress,
  ): boolean {
    if (
      progress === null ||
      progress === undefined ||
      typeof progress !== "object"
    ) {
      throw new Error(
        "progress must be provided.",
      );
    }

    return (
      progress.activeChildOrderCount >
      0
    );
  }

  public hasRemainingQuantity(
    progress:
      AlgorithmicExecutionProgress,
  ): boolean {
    if (
      progress === null ||
      progress === undefined ||
      typeof progress !== "object"
    ) {
      throw new Error(
        "progress must be provided.",
      );
    }

    return (
      progress.remainingQuantity >
      this.quantityTolerance
    );
  }

  public hasExecutionWindowEnded(
    state:
      AlgorithmicExecutionState,
    currentTime: number,
  ): boolean {
    if (
      state === null ||
      state === undefined ||
      typeof state !== "object"
    ) {
      throw new Error(
        "state must be provided.",
      );
    }

    assertFiniteNonNegativeNumber(
      currentTime,
      "currentTime",
    );

    return (
      currentTime >=
      state.instruction.endTime
    );
  }
}

export function createAlgorithmicExecutionProgressCalculator(
  options:
    AlgorithmicExecutionProgressCalculatorOptions = {},
): AlgorithmicExecutionProgressCalculator {
  return new AlgorithmicExecutionProgressCalculator(
    options,
  );
}

export function calculateAlgorithmicExecutionProgress(
  input:
    CalculateAlgorithmicExecutionProgressInput,
  options:
    AlgorithmicExecutionProgressCalculatorOptions = {},
): AlgorithmicExecutionProgress {
  return createAlgorithmicExecutionProgressCalculator(
    options,
  ).calculate(
    input,
  );
}