import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionScheduleContext,
  type AlgorithmicExecutionScheduler,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface TwapSchedulerOptions {
  /**
   * Preferred duration between TWAP slices when the instruction does not
   * specify a narrower interval range.
   */
  readonly defaultSliceIntervalMilliseconds?: number;

  /**
   * Maximum number of slices that may be generated for one schedule.
   */
  readonly maximumSliceCount?: number;

  /**
   * Decimal precision used when distributing quantities between slices.
   */
  readonly quantityPrecision?: number;

  /**
   * Quantities at or below this value are treated as zero.
   */
  readonly quantityEpsilon?: number;
}

interface TwapScheduleBuildInput {
  readonly instruction: AlgorithmicExecutionInstruction;
  readonly targetQuantity: number;

  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: number;

  readonly version: number;
  readonly rebuild: boolean;
}

interface TwapSliceCountConstraints {
  readonly minimumCount: number;
  readonly maximumCount: number;
}

const DEFAULT_SLICE_INTERVAL_MILLISECONDS =
  60_000;

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

function clampInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(value),
    ),
  );
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

function calculateCeilingRatio(
  numerator: number,
  denominator: number,
): number {
  return Math.ceil(
    numerator / denominator,
  );
}

function calculateFloorRatio(
  numerator: number,
  denominator: number,
): number {
  return Math.floor(
    numerator / denominator,
  );
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
    configuredMinimum >
      targetQuantity
  ) {
    return null;
  }

  return configuredMinimum;
}

function calculateSliceCountConstraints(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  duration: number,
  maximumSliceCount: number,
): TwapSliceCountConstraints {
  let minimumCount = 1;
  let maximumCount =
    maximumSliceCount;

  const maximumChildOrderQuantity =
    instruction.maximumChildOrderQuantity;

  if (
    maximumChildOrderQuantity !== null
  ) {
    minimumCount =
      Math.max(
        minimumCount,
        calculateCeilingRatio(
          targetQuantity,
          maximumChildOrderQuantity,
        ),
      );
  }

  const effectiveMinimumQuantity =
    resolveEffectiveMinimumQuantity(
      instruction,
      targetQuantity,
    );

  if (
    effectiveMinimumQuantity !== null
  ) {
    maximumCount =
      Math.min(
        maximumCount,
        Math.max(
          1,
          calculateFloorRatio(
            targetQuantity,
            effectiveMinimumQuantity,
          ),
        ),
      );
  }

  const maximumSliceInterval =
    instruction
      .maximumSliceIntervalMilliseconds;

  if (
    maximumSliceInterval !== null
  ) {
    minimumCount =
      Math.max(
        minimumCount,
        calculateCeilingRatio(
          duration,
          maximumSliceInterval,
        ),
      );
  }

  const minimumSliceInterval =
    instruction
      .minimumSliceIntervalMilliseconds;

  if (
    minimumSliceInterval !== null
  ) {
    maximumCount =
      Math.min(
        maximumCount,
        Math.max(
          1,
          calculateFloorRatio(
            duration,
            minimumSliceInterval,
          ),
        ),
      );
  }

  if (
    minimumCount >
    maximumCount
  ) {
    throw new Error(
      [
        "Unable to create a TWAP schedule because the configured",
        "quantity and interval constraints cannot be satisfied",
        "within the execution window.",
      ].join(" "),
    );
  }

  return Object.freeze({
    minimumCount,
    maximumCount,
  });
}

function resolvePreferredSliceInterval(
  instruction:
    AlgorithmicExecutionInstruction,
  defaultSliceIntervalMilliseconds:
    number,
): number {
  const minimumInterval =
    instruction
      .minimumSliceIntervalMilliseconds;

  const maximumInterval =
    instruction
      .maximumSliceIntervalMilliseconds;

  let preferredInterval =
    defaultSliceIntervalMilliseconds;

  switch (instruction.urgency) {
    case "LOW":
      preferredInterval *= 2;
      break;

    case "HIGH":
      preferredInterval /= 2;
      break;

    case "IMMEDIATE":
      preferredInterval /= 4;
      break;

    case "NORMAL":
    default:
      break;
  }

  if (
    minimumInterval !== null
  ) {
    preferredInterval =
      Math.max(
        preferredInterval,
        minimumInterval,
      );
  }

  if (
    maximumInterval !== null
  ) {
    preferredInterval =
      Math.min(
        preferredInterval,
        maximumInterval,
      );
  }

  return preferredInterval;
}

function calculateSliceCount(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  duration: number,
  defaultSliceIntervalMilliseconds:
    number,
  maximumSliceCount: number,
): number {
  const constraints =
    calculateSliceCountConstraints(
      instruction,
      targetQuantity,
      duration,
      maximumSliceCount,
    );

  const preferredInterval =
    resolvePreferredSliceInterval(
      instruction,
      defaultSliceIntervalMilliseconds,
    );

  const preferredCount =
    Math.max(
      1,
      calculateCeilingRatio(
        duration,
        preferredInterval,
      ),
    );

  return clampInteger(
    preferredCount,
    constraints.minimumCount,
    constraints.maximumCount,
  );
}

function distributeQuantity(
  targetQuantity: number,
  sliceCount: number,
  precision: number,
  epsilon: number,
): readonly number[] {
  assertPositiveFiniteNumber(
    targetQuantity,
    "targetQuantity",
  );

  assertPositiveInteger(
    sliceCount,
    "sliceCount",
  );

  const quantities: number[] = [];

  const equalQuantity =
    targetQuantity /
    sliceCount;

  let allocatedQuantity = 0;

  for (
    let index = 0;
    index < sliceCount;
    index += 1
  ) {
    const isFinalSlice =
      index ===
      sliceCount - 1;

    const quantity =
      isFinalSlice
        ? normalizeQuantity(
            targetQuantity -
              allocatedQuantity,
            precision,
            epsilon,
          )
        : normalizeQuantity(
            equalQuantity,
            precision,
            epsilon,
          );

    if (quantity <= 0) {
      throw new Error(
        "TWAP quantity distribution produced a non-positive slice quantity.",
      );
    }

    quantities.push(
      quantity,
    );

    allocatedQuantity =
      normalizeQuantity(
        allocatedQuantity +
          quantity,
        precision,
        epsilon,
      );
  }

  const distributedTotal =
    quantities.reduce(
      (
        total,
        quantity,
      ) =>
        total +
        quantity,
      0,
    );

  const difference =
    normalizeQuantity(
      targetQuantity -
        distributedTotal,
      precision,
      epsilon,
    );

  if (
    difference !== 0
  ) {
    const finalIndex =
      quantities.length - 1;

    const correctedQuantity =
      normalizeQuantity(
        quantities[finalIndex] +
          difference,
        precision,
        epsilon,
      );

    if (
      correctedQuantity <= 0
    ) {
      throw new Error(
        "TWAP quantity correction produced a non-positive final slice.",
      );
    }

    quantities[finalIndex] =
      correctedQuantity;
  }

  return Object.freeze(
    [...quantities],
  );
}

function createScheduleId(
  executionId: string,
  version: number,
): string {
  return [
    executionId,
    "twap",
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
    "twap",
    "slice",
    version,
    sequence,
  ].join(":");
}

function createSlices(
  input: TwapScheduleBuildInput,
  quantities: readonly number[],
): readonly AlgorithmicExecutionSlice[] {
  const duration =
    input.endTime -
    input.startTime;

  const sliceCount =
    quantities.length;

  const effectiveMinimumQuantity =
    resolveEffectiveMinimumQuantity(
      input.instruction,
      input.targetQuantity,
    );

  const slices =
    quantities.map(
      (
        quantity,
        index,
      ): AlgorithmicExecutionSlice => {
        const sequence =
          index + 1;

        const scheduledAt =
          input.startTime +
          (
            duration *
            index
          ) /
            sliceCount;

        const expiresAt =
          input.startTime +
          (
            duration *
            sequence
          ) /
            sliceCount;

        const sliceMetadata =
          freezeAlgorithmicExecutionMetadata({
            algorithm: "TWAP",
            scheduleVersion:
              input.version,
            rebuilt:
              input.rebuild,
            sliceCount,
            sequence,
          });

        return Object.freeze({
          sliceId:
            createSliceId(
              input.instruction
                .executionId,
              input.version,
              sequence,
            ),

          executionId:
            input.instruction
              .executionId,

          sequence,

          scheduledAt,
          expiresAt,

          targetQuantity:
            quantity,

          minimumQuantity:
            effectiveMinimumQuantity,

          maximumQuantity:
            input.instruction
              .maximumChildOrderQuantity,

          status: "PENDING",

          submittedQuantity: 0,
          filledQuantity: 0,
          remainingQuantity:
            quantity,

          averageFillPrice: null,

          childOrderIds:
            Object.freeze([]),

          createdAt:
            input.createdAt,

          updatedAt:
            input.createdAt,

          metadata:
            sliceMetadata,
        });
      },
    );

  return Object.freeze(
    [...slices],
  );
}

function calculateScheduledQuantity(
  slices:
    readonly AlgorithmicExecutionSlice[],
  precision: number,
  epsilon: number,
): number {
  const total =
    slices.reduce(
      (
        sum,
        slice,
      ) =>
        sum +
        slice.targetQuantity,
      0,
    );

  return normalizeQuantity(
    total,
    precision,
    epsilon,
  );
}

export class TwapScheduler
implements AlgorithmicExecutionScheduler {
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
      TwapSchedulerOptions = {},
  ) {
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
    this.assertTwapInstruction(
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
    this.assertTwapInstruction(
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

    const previousVersion =
      state.schedule?.version ??
      0;

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
      return this.createEmptySchedule({
        instruction:
          context.instruction,

        startTime,

        endTime:
          Math.max(
            startTime,
            context.instruction
              .endTime,
          ),

        createdAt:
          context.currentTime,

        version:
          previousVersion + 1,

        rebuild: true,
      });
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

      version:
        previousVersion + 1,

      rebuild: true,
    });
  }

  private buildSchedule(
    input: TwapScheduleBuildInput,
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
        "A TWAP schedule requires endTime to be greater than startTime.",
      );
    }

    const duration =
      input.endTime -
      input.startTime;

    const sliceCount =
      calculateSliceCount(
        input.instruction,
        input.targetQuantity,
        duration,
        this
          .defaultSliceIntervalMilliseconds,
        this.maximumSliceCount,
      );

    const quantities =
      distributeQuantity(
        input.targetQuantity,
        sliceCount,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const slices =
      createSlices(
        input,
        quantities,
      );

    const totalScheduledQuantity =
      calculateScheduledQuantity(
        slices,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const expectedTargetQuantity =
      normalizeQuantity(
        input.targetQuantity,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    if (
      Math.abs(
        totalScheduledQuantity -
          expectedTargetQuantity,
      ) >
      this.quantityEpsilon
    ) {
      throw new Error(
        "TWAP schedule quantity does not equal its target quantity.",
      );
    }

    const metadata =
      freezeAlgorithmicExecutionMetadata({
        algorithm: "TWAP",
        rebuilt:
          input.rebuild,
        sliceCount:
          slices.length,
        scheduleVersion:
          input.version,
        quantityPrecision:
          this.quantityPrecision,
      });

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

      algorithm: "TWAP",

      startTime:
        input.startTime,

      endTime:
        input.endTime,

      targetQuantity:
        expectedTargetQuantity,

      slices,

      totalScheduledQuantity,

      createdAt:
        input.createdAt,

      version:
        input.version,

      metadata,
    });
  }

  private createEmptySchedule(
    input: Omit<
      TwapScheduleBuildInput,
      "targetQuantity"
    >,
  ): AlgorithmicExecutionSchedule {
    const metadata =
      freezeAlgorithmicExecutionMetadata({
        algorithm: "TWAP",
        rebuilt:
          input.rebuild,
        sliceCount: 0,
        scheduleVersion:
          input.version,
        noRemainingQuantity: true,
      });

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

      algorithm: "TWAP",

      startTime:
        input.startTime,

      endTime:
        input.endTime,

      targetQuantity: 0,

      slices:
        Object.freeze([]),

      totalScheduledQuantity: 0,

      createdAt:
        input.createdAt,

      version:
        input.version,

      metadata,
    });
  }

  private assertTwapInstruction(
    instruction:
      AlgorithmicExecutionInstruction,
  ): void {
    if (
      instruction.algorithm !==
      "TWAP"
    ) {
      throw new Error(
        [
          "TwapScheduler only supports",
          "instructions whose algorithm is TWAP.",
        ].join(" "),
      );
    }
  }
}

export function createTwapScheduler(
  options:
    TwapSchedulerOptions = {},
): AlgorithmicExecutionScheduler {
  return new TwapScheduler(
    options,
  );
}