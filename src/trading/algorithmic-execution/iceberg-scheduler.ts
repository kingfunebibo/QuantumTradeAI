import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionScheduleContext,
  type AlgorithmicExecutionScheduler,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface IcebergSchedulerOptions {
  /**
   * Portion of the remaining target quantity exposed by each slice when the
   * instruction does not provide a maximum child-order quantity.
   */
  readonly defaultVisibleQuantityRatio?: number;

  /**
   * Default interval between iceberg slices.
   */
  readonly defaultSliceIntervalMilliseconds?: number;

  /**
   * Maximum number of slices permitted in one schedule.
   */
  readonly maximumSliceCount?: number;

  /**
   * Decimal precision used for deterministic quantity distribution.
   */
  readonly quantityPrecision?: number;

  /**
   * Quantities at or below this threshold are treated as zero.
   */
  readonly quantityEpsilon?: number;
}

interface IcebergScheduleBuildInput {
  readonly instruction: AlgorithmicExecutionInstruction;

  readonly targetQuantity: number;

  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: number;

  readonly version: number;
  readonly rebuild: boolean;
}

interface IcebergSlicePlan {
  readonly sequence: number;
  readonly scheduledAt: number;
  readonly expiresAt: number | null;
  readonly quantity: number;
}

const DEFAULT_VISIBLE_QUANTITY_RATIO =
  0.1;

const DEFAULT_SLICE_INTERVAL_MILLISECONDS =
  30_000;

const DEFAULT_MAXIMUM_SLICE_COUNT =
  10_000;

const DEFAULT_QUANTITY_PRECISION =
  12;

const DEFAULT_QUANTITY_EPSILON =
  1e-12;

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

function assertNonNegativeFiniteNumber(
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

function assertNonNegativeInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertRatio(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    throw new Error(
      `${field} must be greater than 0 and less than or equal to 1.`,
    );
  }
}

function roundQuantity(
  value: number,
  precision: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor =
    10 ** precision;

  return (
    Math.round(
      value * factor,
    ) / factor
  );
}

function normalizeQuantity(
  value: number,
  precision: number,
  epsilon: number,
): number {
  const rounded =
    roundQuantity(
      value,
      precision,
    );

  if (
    Math.abs(rounded) <=
    epsilon
  ) {
    return 0;
  }

  return rounded;
}

function createScheduleId(
  executionId: string,
  version: number,
): string {
  return [
    executionId,
    "iceberg",
    "schedule",
    version,
  ].join(":");
}

function createSliceId(
  executionId: string,
  version: number,
  sequence: number,
): string {
  return [
    executionId,
    "iceberg",
    "slice",
    version,
    sequence,
  ].join(":");
}

function resolveEffectiveMinimumQuantity(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
): number | null {
  const configuredMinimum =
    instruction.minimumChildOrderQuantity;

  if (
    configuredMinimum === null ||
    configuredMinimum > targetQuantity
  ) {
    return null;
  }

  return configuredMinimum;
}

function resolveSliceInterval(
  instruction:
    AlgorithmicExecutionInstruction,
  defaultSliceIntervalMilliseconds:
    number,
): number {
  let interval =
    defaultSliceIntervalMilliseconds;

  switch (instruction.urgency) {
    case "LOW":
      interval *= 2;
      break;

    case "HIGH":
      interval /= 2;
      break;

    case "IMMEDIATE":
      interval /= 4;
      break;

    case "NORMAL":
    default:
      break;
  }

  const minimumInterval =
    instruction
      .minimumSliceIntervalMilliseconds;

  const maximumInterval =
    instruction
      .maximumSliceIntervalMilliseconds;

  if (
    minimumInterval !== null
  ) {
    interval =
      Math.max(
        interval,
        minimumInterval,
      );
  }

  if (
    maximumInterval !== null
  ) {
    interval =
      Math.min(
        interval,
        maximumInterval,
      );
  }

  return interval;
}

function resolveVisibleQuantity(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  defaultVisibleQuantityRatio: number,
  precision: number,
  epsilon: number,
): number {
  const minimumQuantity =
    resolveEffectiveMinimumQuantity(
      instruction,
      targetQuantity,
    );

  const configuredMaximum =
    instruction.maximumChildOrderQuantity;

  let visibleQuantity =
    configuredMaximum ??
    (
      targetQuantity *
      defaultVisibleQuantityRatio
    );

  if (
    minimumQuantity !== null
  ) {
    visibleQuantity =
      Math.max(
        visibleQuantity,
        minimumQuantity,
      );
  }

  if (
    configuredMaximum !== null
  ) {
    visibleQuantity =
      Math.min(
        visibleQuantity,
        configuredMaximum,
      );
  }

  visibleQuantity =
    Math.min(
      visibleQuantity,
      targetQuantity,
    );

  const normalized =
    normalizeQuantity(
      visibleQuantity,
      precision,
      epsilon,
    );

  if (
    normalized <= 0
  ) {
    throw new Error(
      "Unable to determine a positive iceberg visible quantity.",
    );
  }

  return normalized;
}

function calculateRequiredSliceCount(
  targetQuantity: number,
  visibleQuantity: number,
): number {
  return Math.max(
    1,
    Math.ceil(
      targetQuantity /
      visibleQuantity,
    ),
  );
}

function calculateMaximumSliceCountFromInterval(
  instruction:
    AlgorithmicExecutionInstruction,
  duration: number,
  configuredMaximumSliceCount:
    number,
): number {
  const minimumInterval =
    instruction
      .minimumSliceIntervalMilliseconds;

  if (
    minimumInterval === null
  ) {
    return configuredMaximumSliceCount;
  }

  return Math.min(
    configuredMaximumSliceCount,
    Math.max(
      1,
      Math.floor(
        duration /
        minimumInterval,
      ) + 1,
    ),
  );
}

function validateScheduleCapacity(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  visibleQuantity: number,
  duration: number,
  maximumSliceCount: number,
): number {
  const requiredCount =
    calculateRequiredSliceCount(
      targetQuantity,
      visibleQuantity,
    );

  const intervalMaximumCount =
    calculateMaximumSliceCountFromInterval(
      instruction,
      duration,
      maximumSliceCount,
    );

  if (
    requiredCount >
    maximumSliceCount
  ) {
    throw new Error(
      [
        "Unable to create the iceberg schedule because",
        "the required number of slices exceeds maximumSliceCount.",
      ].join(" "),
    );
  }

  if (
    requiredCount >
    intervalMaximumCount
  ) {
    throw new Error(
      [
        "Unable to create the iceberg schedule because",
        "the minimum slice interval does not permit enough",
        "slices within the execution window.",
      ].join(" "),
    );
  }

  return requiredCount;
}

function distributeQuantities(
  targetQuantity: number,
  visibleQuantity: number,
  sliceCount: number,
  minimumQuantity: number | null,
  precision: number,
  epsilon: number,
): readonly number[] {
  const quantities: number[] = [];

  let remainingQuantity =
    normalizeQuantity(
      targetQuantity,
      precision,
      epsilon,
    );

  for (
    let index = 0;
    index < sliceCount;
    index += 1
  ) {
    const remainingSliceCount =
      sliceCount - index;

    const isFinalSlice =
      remainingSliceCount === 1;

    let quantity =
      isFinalSlice
        ? remainingQuantity
        : Math.min(
            visibleQuantity,
            remainingQuantity,
          );

    if (
      !isFinalSlice &&
      minimumQuantity !== null
    ) {
      const quantityAfterSlice =
        normalizeQuantity(
          remainingQuantity -
          quantity,
          precision,
          epsilon,
        );

      if (
        quantityAfterSlice > 0 &&
        quantityAfterSlice <
          minimumQuantity
      ) {
        quantity =
          normalizeQuantity(
            remainingQuantity -
            minimumQuantity,
            precision,
            epsilon,
          );
      }
    }

    quantity =
      normalizeQuantity(
        quantity,
        precision,
        epsilon,
      );

    if (
      quantity <= 0
    ) {
      throw new Error(
        "Iceberg quantity distribution produced a non-positive slice.",
      );
    }

    if (
      minimumQuantity !== null &&
      quantity < minimumQuantity &&
      !isFinalSlice
    ) {
      throw new Error(
        "Iceberg quantity distribution violated minimumChildOrderQuantity.",
      );
    }

    quantities.push(
      quantity,
    );

    remainingQuantity =
      normalizeQuantity(
        remainingQuantity -
        quantity,
        precision,
        epsilon,
      );
  }

  if (
    remainingQuantity !== 0
  ) {
    const finalIndex =
      quantities.length - 1;

    const correctedFinalQuantity =
      normalizeQuantity(
        quantities[finalIndex] +
        remainingQuantity,
        precision,
        epsilon,
      );

    if (
      correctedFinalQuantity <= 0
    ) {
      throw new Error(
        "Iceberg final quantity correction produced an invalid slice.",
      );
    }

    quantities[finalIndex] =
      correctedFinalQuantity;
  }

  const total =
    normalizeQuantity(
      quantities.reduce(
        (
          sum,
          quantity,
        ) =>
          sum + quantity,
        0,
      ),
      precision,
      epsilon,
    );

  const normalizedTarget =
    normalizeQuantity(
      targetQuantity,
      precision,
      epsilon,
    );

  if (
    Math.abs(
      total -
      normalizedTarget,
    ) > epsilon
  ) {
    throw new Error(
      "Iceberg distributed quantity does not equal the target quantity.",
    );
  }

  return Object.freeze(
    [...quantities],
  );
}

function createSlicePlans(
  input: IcebergScheduleBuildInput,
  quantities: readonly number[],
  sliceIntervalMilliseconds: number,
): readonly IcebergSlicePlan[] {
  const plans:
    IcebergSlicePlan[] = [];

  for (
    let index = 0;
    index < quantities.length;
    index += 1
  ) {
    const sequence =
      index + 1;

    const scheduledAt =
      input.startTime +
      (
        index *
        sliceIntervalMilliseconds
      );

    const nextScheduledAt =
      input.startTime +
      (
        sequence *
        sliceIntervalMilliseconds
      );

    const expiresAt =
      sequence ===
      quantities.length
        ? input.endTime
        : Math.min(
            input.endTime,
            nextScheduledAt,
          );

    if (
      scheduledAt >
      input.endTime
    ) {
      throw new Error(
        "Iceberg slice scheduling exceeded the execution end time.",
      );
    }

    plans.push(
      Object.freeze({
        sequence,
        scheduledAt,
        expiresAt,
        quantity:
          quantities[index],
      }),
    );
  }

  return Object.freeze(
    [...plans],
  );
}

function createSlices(
  input: IcebergScheduleBuildInput,
  plans:
    readonly IcebergSlicePlan[],
  visibleQuantity: number,
): readonly AlgorithmicExecutionSlice[] {
  const minimumQuantity =
    resolveEffectiveMinimumQuantity(
      input.instruction,
      input.targetQuantity,
    );

  return Object.freeze(
    plans.map(
      (
        plan,
      ): AlgorithmicExecutionSlice =>
        Object.freeze({
          sliceId:
            createSliceId(
              input.instruction
                .executionId,
              input.version,
              plan.sequence,
            ),

          executionId:
            input.instruction
              .executionId,

          sequence:
            plan.sequence,

          scheduledAt:
            plan.scheduledAt,

          expiresAt:
            plan.expiresAt,

          targetQuantity:
            plan.quantity,

          minimumQuantity,

          maximumQuantity:
            input.instruction
              .maximumChildOrderQuantity,

          status: "PENDING",

          submittedQuantity: 0,
          filledQuantity: 0,

          remainingQuantity:
            plan.quantity,

          averageFillPrice: null,

          childOrderIds:
            Object.freeze([]),

          createdAt:
            input.createdAt,

          updatedAt:
            input.createdAt,

          metadata:
            freezeAlgorithmicExecutionMetadata({
              algorithm: "ICEBERG",
              rebuilt:
                input.rebuild,
              scheduleVersion:
                input.version,
              sequence:
                plan.sequence,
              visibleQuantity,
              isFinalSlice:
                plan.sequence ===
                plans.length,
            }),
        }),
    ),
  );
}

export class IcebergScheduler
implements AlgorithmicExecutionScheduler {
  private readonly defaultVisibleQuantityRatio:
    number;

  private readonly defaultSliceIntervalMilliseconds:
    number;

  private readonly maximumSliceCount:
    number;

  private readonly quantityPrecision:
    number;

  private readonly quantityEpsilon:
    number;

  public constructor(
    options:
      IcebergSchedulerOptions = {},
  ) {
    this.defaultVisibleQuantityRatio =
      options
        .defaultVisibleQuantityRatio ??
      DEFAULT_VISIBLE_QUANTITY_RATIO;

    this.defaultSliceIntervalMilliseconds =
      options
        .defaultSliceIntervalMilliseconds ??
      DEFAULT_SLICE_INTERVAL_MILLISECONDS;

    this.maximumSliceCount =
      options.maximumSliceCount ??
      DEFAULT_MAXIMUM_SLICE_COUNT;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    this.quantityEpsilon =
      options.quantityEpsilon ??
      DEFAULT_QUANTITY_EPSILON;

    assertRatio(
      this.defaultVisibleQuantityRatio,
      "defaultVisibleQuantityRatio",
    );

    assertPositiveFiniteNumber(
      this.defaultSliceIntervalMilliseconds,
      "defaultSliceIntervalMilliseconds",
    );

    assertPositiveInteger(
      this.maximumSliceCount,
      "maximumSliceCount",
    );

    assertNonNegativeInteger(
      this.quantityPrecision,
      "quantityPrecision",
    );

    if (
      this.quantityPrecision > 15
    ) {
      throw new Error(
        "quantityPrecision cannot exceed 15.",
      );
    }

    assertPositiveFiniteNumber(
      this.quantityEpsilon,
      "quantityEpsilon",
    );
  }

  public createSchedule(
    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule {
    this.assertIcebergInstruction(
      context.instruction,
    );

    assertNonNegativeFiniteNumber(
      context.currentTime,
      "context.currentTime",
    );

    return this.buildSchedule({
      instruction:
        context.instruction,

      targetQuantity:
        context.instruction
          .totalQuantity,

      startTime:
        Math.max(
          context.instruction
            .startTime,
          context.currentTime,
        ),

      endTime:
        context.instruction
          .endTime,

      createdAt:
        context.currentTime,

      version: 1,
      rebuild: false,
    });
  }

  public rebuildSchedule(
    state:
      AlgorithmicExecutionState,
    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule {
    this.assertIcebergInstruction(
      context.instruction,
    );

    if (
      state.executionId !==
      context.instruction.executionId
    ) {
      throw new Error(
        "state.executionId must match context.instruction.executionId.",
      );
    }

    if (
      state.instruction.executionId !==
      context.instruction.executionId
    ) {
      throw new Error(
        "state.instruction does not belong to the requested execution.",
      );
    }

    assertNonNegativeFiniteNumber(
      context.currentTime,
      "context.currentTime",
    );

    const version =
      (
        state.schedule?.version ??
        0
      ) + 1;

    const remainingQuantity =
      normalizeQuantity(
        Math.min(
          context.instruction
            .totalQuantity,
          Math.max(
            0,
            state.progress
              .remainingQuantity,
          ),
        ),
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const startTime =
      Math.max(
        context.instruction
          .startTime,
        context.currentTime,
      );

    if (
      remainingQuantity === 0
    ) {
      return this.createEmptySchedule(
        context.instruction,
        startTime,
        Math.max(
          startTime,
          context.instruction
            .endTime,
        ),
        context.currentTime,
        version,
      );
    }

    return this.buildSchedule({
      instruction:
        context.instruction,

      targetQuantity:
        remainingQuantity,

      startTime,

      endTime:
        context.instruction
          .endTime,

      createdAt:
        context.currentTime,

      version,
      rebuild: true,
    });
  }

  private buildSchedule(
    input: IcebergScheduleBuildInput,
  ): AlgorithmicExecutionSchedule {
    assertPositiveFiniteNumber(
      input.targetQuantity,
      "targetQuantity",
    );

    assertNonNegativeFiniteNumber(
      input.startTime,
      "startTime",
    );

    assertNonNegativeFiniteNumber(
      input.endTime,
      "endTime",
    );

    assertNonNegativeFiniteNumber(
      input.createdAt,
      "createdAt",
    );

    assertPositiveInteger(
      input.version,
      "version",
    );

    if (
      input.endTime <=
      input.startTime
    ) {
      throw new Error(
        "An iceberg schedule requires endTime to be greater than startTime.",
      );
    }

    const duration =
      input.endTime -
      input.startTime;

    const visibleQuantity =
      resolveVisibleQuantity(
        input.instruction,
        input.targetQuantity,
        this.defaultVisibleQuantityRatio,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const sliceCount =
      validateScheduleCapacity(
        input.instruction,
        input.targetQuantity,
        visibleQuantity,
        duration,
        this.maximumSliceCount,
      );

    let sliceIntervalMilliseconds =
      resolveSliceInterval(
        input.instruction,
        this
          .defaultSliceIntervalMilliseconds,
      );

    if (
      sliceCount > 1
    ) {
      const maximumAvailableInterval =
        duration /
        (
          sliceCount - 1
        );

      sliceIntervalMilliseconds =
        Math.min(
          sliceIntervalMilliseconds,
          maximumAvailableInterval,
        );
    }

    const minimumInterval =
      input.instruction
        .minimumSliceIntervalMilliseconds;

    if (
      minimumInterval !== null &&
      sliceIntervalMilliseconds <
        minimumInterval
    ) {
      throw new Error(
        [
          "Unable to create the iceberg schedule because",
          "minimumSliceIntervalMilliseconds cannot be",
          "satisfied inside the execution window.",
        ].join(" "),
      );
    }

    const minimumQuantity =
      resolveEffectiveMinimumQuantity(
        input.instruction,
        input.targetQuantity,
      );

    const quantities =
      distributeQuantities(
        input.targetQuantity,
        visibleQuantity,
        sliceCount,
        minimumQuantity,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const plans =
      createSlicePlans(
        input,
        quantities,
        sliceIntervalMilliseconds,
      );

    const slices =
      createSlices(
        input,
        plans,
        visibleQuantity,
      );

    const totalScheduledQuantity =
      normalizeQuantity(
        slices.reduce(
          (
            total,
            slice,
          ) =>
            total +
            slice.targetQuantity,
          0,
        ),
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const targetQuantity =
      normalizeQuantity(
        input.targetQuantity,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    if (
      Math.abs(
        totalScheduledQuantity -
        targetQuantity,
      ) > this.quantityEpsilon
    ) {
      throw new Error(
        "Iceberg schedule quantity does not equal its target quantity.",
      );
    }

    return Object.freeze({
      scheduleId:
        createScheduleId(
          input.instruction
            .executionId,
          input.version,
        ),

      executionId:
        input.instruction
          .executionId,

      algorithm: "ICEBERG",

      startTime:
        input.startTime,

      endTime:
        input.endTime,

      targetQuantity,

      slices,

      totalScheduledQuantity,

      createdAt:
        input.createdAt,

      version:
        input.version,

      metadata:
        freezeAlgorithmicExecutionMetadata({
          algorithm: "ICEBERG",
          rebuilt:
            input.rebuild,
          scheduleVersion:
            input.version,
          sliceCount:
            slices.length,
          visibleQuantity,
          visibleQuantityRatio:
            visibleQuantity /
            targetQuantity,
          sliceIntervalMilliseconds,
          quantityPrecision:
            this.quantityPrecision,
        }),
    });
  }

  private createEmptySchedule(
    instruction:
      AlgorithmicExecutionInstruction,
    startTime: number,
    endTime: number,
    createdAt: number,
    version: number,
  ): AlgorithmicExecutionSchedule {
    return Object.freeze({
      scheduleId:
        createScheduleId(
          instruction.executionId,
          version,
        ),

      executionId:
        instruction.executionId,

      algorithm: "ICEBERG",

      startTime,
      endTime,

      targetQuantity: 0,

      slices:
        Object.freeze([]),

      totalScheduledQuantity: 0,

      createdAt,
      version,

      metadata:
        freezeAlgorithmicExecutionMetadata({
          algorithm: "ICEBERG",
          rebuilt: true,
          scheduleVersion:
            version,
          sliceCount: 0,
          noRemainingQuantity: true,
        }),
    });
  }

  private assertIcebergInstruction(
    instruction:
      AlgorithmicExecutionInstruction,
  ): void {
    if (
      instruction.algorithm !==
      "ICEBERG"
    ) {
      throw new Error(
        [
          "IcebergScheduler only supports",
          "instructions whose algorithm is ICEBERG.",
        ].join(" "),
      );
    }
  }
}

export function createIcebergScheduler(
  options:
    IcebergSchedulerOptions = {},
): AlgorithmicExecutionScheduler {
  return new IcebergScheduler(
    options,
  );
}