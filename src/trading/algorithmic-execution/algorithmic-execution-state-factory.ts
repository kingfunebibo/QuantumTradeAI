import {
  type AlgorithmicExecutionChildOrder,
  type AlgorithmicExecutionFill,
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionMetadata,
  type AlgorithmicExecutionProgress,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionState,
  type AlgorithmicExecutionStatus,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface CreateAlgorithmicExecutionStateInput {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  /**
   * Optional state creation timestamp.
   *
   * When omitted, instruction.createdAt is used.
   */
  readonly createdAt?: number;

  /**
   * Optional initial state version.
   *
   * Defaults to 1.
   */
  readonly version?: number;

  /**
   * Optional initial state metadata.
   *
   * When omitted, instruction metadata is copied.
   */
  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface CreateAlgorithmicExecutionProgressInput {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  /**
   * Optional timestamp used for the progress snapshot.
   *
   * When omitted, instruction.createdAt is used.
   */
  readonly updatedAt?: number;

  /**
   * Optional estimated arrival price.
   */
  readonly estimatedArrivalPrice?:
    number | null;
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

function assertPositiveInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive integer.`,
    );
  }
}

function assertNullablePositiveNumber(
  value: number | null,
  field: string,
): void {
  if (
    value === null
  ) {
    return;
  }

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be null or a positive finite number.`,
    );
  }
}

function freezeStringArray(
  values: readonly string[],
): readonly string[] {
  return Object.freeze([
    ...values,
  ]);
}

function freezeInstruction(
  instruction:
    AlgorithmicExecutionInstruction,
): AlgorithmicExecutionInstruction {
  const venueConstraints =
    instruction.venueConstraints.map(
      (
        venueConstraint,
      ) =>
        Object.freeze({
          ...venueConstraint,

          metadata:
            freezeAlgorithmicExecutionMetadata(
              venueConstraint.metadata,
            ),
        }),
    );

  return Object.freeze({
    ...instruction,

    executionId:
      instruction.executionId.trim(),

    symbol:
      instruction.symbol.trim(),

    exchangeSymbol:
      instruction.exchangeSymbol === null
        ? null
        : instruction.exchangeSymbol.trim(),

    priceLimit:
      Object.freeze({
        ...instruction.priceLimit,
      }),

    slippageLimit:
      Object.freeze({
        ...instruction.slippageLimit,
      }),

    participationLimit:
      Object.freeze({
        ...instruction.participationLimit,
      }),

    venueConstraints:
      Object.freeze(
        venueConstraints,
      ),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        instruction.metadata,
      ),
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

function freezeSchedule(
  schedule:
    AlgorithmicExecutionSchedule,
): AlgorithmicExecutionSchedule {
  return Object.freeze({
    ...schedule,

    slices:
      Object.freeze(
        schedule.slices.map(
          (
            slice,
          ) =>
            Object.freeze({
              ...slice,

              childOrderIds:
                freezeStringArray(
                  slice.childOrderIds,
                ),

              metadata:
                freezeAlgorithmicExecutionMetadata(
                  slice.metadata,
                ),
            }),
        ),
      ),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        schedule.metadata,
      ),
  });
}

function freezeProgress(
  progress:
    AlgorithmicExecutionProgress,
): AlgorithmicExecutionProgress {
  return Object.freeze({
    ...progress,
  });
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

  assertNonEmptyString(
    instruction.symbol,
    "instruction.symbol",
  );

  if (
    !Number.isFinite(
      instruction.totalQuantity,
    ) ||
    instruction.totalQuantity <= 0
  ) {
    throw new Error(
      "instruction.totalQuantity must be a positive finite number.",
    );
  }

  assertFiniteNonNegativeNumber(
    instruction.createdAt,
    "instruction.createdAt",
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

  assertPositiveInteger(
    instruction.maximumActiveChildOrders,
    "instruction.maximumActiveChildOrders",
  );

  if (
    !Array.isArray(
      instruction.venueConstraints,
    )
  ) {
    throw new Error(
      "instruction.venueConstraints must be an array.",
    );
  }
}

export function createInitialAlgorithmicExecutionProgress(
  input:
    CreateAlgorithmicExecutionProgressInput,
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

  const updatedAt =
    input.updatedAt ??
    input.instruction.createdAt;

  const estimatedArrivalPrice =
    input.estimatedArrivalPrice ??
    null;

  assertFiniteNonNegativeNumber(
    updatedAt,
    "input.updatedAt",
  );

  assertNullablePositiveNumber(
    estimatedArrivalPrice,
    "input.estimatedArrivalPrice",
  );

  return Object.freeze({
    executionId:
      input.instruction.executionId.trim(),

    targetQuantity:
      input.instruction.totalQuantity,

    scheduledQuantity:
      0,

    submittedQuantity:
      0,

    filledQuantity:
      0,

    remainingQuantity:
      input.instruction.totalQuantity,

    completionRatio:
      0,

    elapsedMilliseconds:
      0,

    remainingMilliseconds:
      Math.max(
        0,
        input.instruction.endTime -
          input.instruction.startTime,
      ),

    scheduledSliceCount:
      0,

    completedSliceCount:
      0,

    failedSliceCount:
      0,

    activeChildOrderCount:
      0,

    completedChildOrderCount:
      0,

    failedChildOrderCount:
      0,

    averageFillPrice:
      null,

    filledNotional:
      0,

    estimatedArrivalPrice,

    implementationShortfallBps:
      null,

    updatedAt,
  });
}

export function createInitialAlgorithmicExecutionState(
  input:
    CreateAlgorithmicExecutionStateInput,
): AlgorithmicExecutionState {
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

  const createdAt =
    input.createdAt ??
    input.instruction.createdAt;

  const version =
    input.version ??
    1;

  assertFiniteNonNegativeNumber(
    createdAt,
    "input.createdAt",
  );

  assertPositiveInteger(
    version,
    "input.version",
  );

  const frozenInstruction =
    freezeInstruction(
      input.instruction,
    );

  const progress =
    createInitialAlgorithmicExecutionProgress({
      instruction:
        frozenInstruction,

      updatedAt:
        createdAt,
    });

  return Object.freeze({
    executionId:
      frozenInstruction.executionId,

    instruction:
      frozenInstruction,

    status:
      "CREATED",

    schedule:
      null,

    childOrders:
      Object.freeze([]),

    fills:
      Object.freeze([]),

    progress,

    pauseReason:
      null,

    completionReason:
      null,

    failureCode:
      null,

    failureMessage:
      null,

    createdAt,

    startedAt:
      null,

    completedAt:
      null,

    updatedAt:
      createdAt,

    version,

    metadata:
      freezeAlgorithmicExecutionMetadata(
        input.metadata ??
          frozenInstruction.metadata,
      ),
  });
}

export function cloneAlgorithmicExecutionState(
  state:
    AlgorithmicExecutionState,
): AlgorithmicExecutionState {
  if (
    state === null ||
    state === undefined ||
    typeof state !== "object"
  ) {
    throw new Error(
      "state must be provided.",
    );
  }

  assertNonEmptyString(
    state.executionId,
    "state.executionId",
  );

  assertPositiveInteger(
    state.version,
    "state.version",
  );

  const schedule =
    state.schedule === null
      ? null
      : freezeSchedule(
          state.schedule,
        );

  const childOrders =
    Object.freeze(
      state.childOrders.map(
        freezeChildOrder,
      ),
    );

  const fills =
    Object.freeze(
      state.fills.map(
        freezeFill,
      ),
    );

  return Object.freeze({
    ...state,

    instruction:
      freezeInstruction(
        state.instruction,
      ),

    schedule,

    childOrders,

    fills,

    progress:
      freezeProgress(
        state.progress,
      ),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        state.metadata,
      ),
  });
}

export interface UpdateAlgorithmicExecutionStateInput {
  readonly state:
    AlgorithmicExecutionState;

  readonly status?:
    AlgorithmicExecutionStatus;

  readonly schedule?:
    AlgorithmicExecutionSchedule | null;

  readonly childOrders?:
    readonly AlgorithmicExecutionChildOrder[];

  readonly fills?:
    readonly AlgorithmicExecutionFill[];

  readonly progress?:
    AlgorithmicExecutionProgress;

  readonly startedAt?:
    number | null;

  readonly completedAt?:
    number | null;

  readonly updatedAt:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export function updateAlgorithmicExecutionState(
  input:
    UpdateAlgorithmicExecutionStateInput,
): AlgorithmicExecutionState {
  if (
    input === null ||
    input === undefined ||
    typeof input !== "object"
  ) {
    throw new Error(
      "input must be provided.",
    );
  }

  const currentState =
    cloneAlgorithmicExecutionState(
      input.state,
    );

  assertFiniteNonNegativeNumber(
    input.updatedAt,
    "input.updatedAt",
  );

  if (
    input.updatedAt <
    currentState.updatedAt
  ) {
    throw new Error(
      "input.updatedAt cannot be earlier than state.updatedAt.",
    );
  }

  if (
    input.startedAt !== undefined &&
    input.startedAt !== null
  ) {
    assertFiniteNonNegativeNumber(
      input.startedAt,
      "input.startedAt",
    );
  }

  if (
    input.completedAt !== undefined &&
    input.completedAt !== null
  ) {
    assertFiniteNonNegativeNumber(
      input.completedAt,
      "input.completedAt",
    );
  }

  return cloneAlgorithmicExecutionState({
    ...currentState,

    status:
      input.status ??
      currentState.status,

    schedule:
      input.schedule === undefined
        ? currentState.schedule
        : input.schedule,

    childOrders:
      input.childOrders ??
      currentState.childOrders,

    fills:
      input.fills ??
      currentState.fills,

    progress:
      input.progress ??
      currentState.progress,

    startedAt:
      input.startedAt === undefined
        ? currentState.startedAt
        : input.startedAt,

    completedAt:
      input.completedAt === undefined
        ? currentState.completedAt
        : input.completedAt,

    updatedAt:
      input.updatedAt,

    version:
      currentState.version + 1,

    metadata:
      input.metadata ??
      currentState.metadata,
  });
}

export class AlgorithmicExecutionStateFactory {
  public create(
    input:
      CreateAlgorithmicExecutionStateInput,
  ): AlgorithmicExecutionState {
    return createInitialAlgorithmicExecutionState(
      input,
    );
  }

  public clone(
    state:
      AlgorithmicExecutionState,
  ): AlgorithmicExecutionState {
    return cloneAlgorithmicExecutionState(
      state,
    );
  }

  public update(
    input:
      UpdateAlgorithmicExecutionStateInput,
  ): AlgorithmicExecutionState {
    return updateAlgorithmicExecutionState(
      input,
    );
  }
}

export function createAlgorithmicExecutionStateFactory():
  AlgorithmicExecutionStateFactory {
  return new AlgorithmicExecutionStateFactory();
}