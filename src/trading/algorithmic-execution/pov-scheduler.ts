import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionMarketSnapshot,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionScheduleContext,
  type AlgorithmicExecutionScheduler,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface PovSchedulerOptions {
  /**
   * Default participation rate when the instruction does not specify one.
   *
   * A value of 0.1 represents ten percent of observed market volume.
   */
  readonly defaultParticipationRate?: number;

  /**
   * Default interval between participation slices.
   */
  readonly defaultSliceIntervalMilliseconds?: number;

  /**
   * Estimated market volume used when no usable market snapshot exists.
   */
  readonly fallbackMarketVolumePerInterval?: number;

  /**
   * Maximum number of slices permitted in a schedule.
   */
  readonly maximumSliceCount?: number;

  /**
   * Decimal precision used for deterministic quantity calculations.
   */
  readonly quantityPrecision?: number;

  /**
   * Quantities at or below this value are treated as zero.
   */
  readonly quantityEpsilon?: number;

  /**
   * When enabled, scheduling fails if no current market snapshot is supplied.
   */
  readonly requireMarketSnapshot?: boolean;
}

interface PovScheduleBuildInput {
  readonly instruction: AlgorithmicExecutionInstruction;

  readonly marketSnapshot:
    AlgorithmicExecutionMarketSnapshot | null;

  readonly targetQuantity: number;

  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: number;

  readonly version: number;
  readonly rebuild: boolean;
}

interface PovSlicePlan {
  readonly sequence: number;

  readonly scheduledAt: number;
  readonly expiresAt: number;

  readonly expectedMarketVolume: number;
  readonly participationRate: number;

  readonly quantity: number;
}

const DEFAULT_PARTICIPATION_RATE =
  0.1;

const DEFAULT_SLICE_INTERVAL_MILLISECONDS =
  30_000;

const DEFAULT_FALLBACK_MARKET_VOLUME_PER_INTERVAL =
  1;

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

function assertParticipationRate(
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
    "pov",
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
    "pov",
    "slice",
    version,
    sequence,
  ].join(":");
}

function resolveParticipationRate(
  instruction:
    AlgorithmicExecutionInstruction,
  defaultParticipationRate: number,
): number {
  const configuredTarget =
    instruction
      .participationLimit
      .targetParticipationRate;

  const configuredMinimum =
    instruction
      .participationLimit
      .minimumParticipationRate;

  const configuredMaximum =
    instruction
      .participationLimit
      .maximumParticipationRate;

  let participationRate =
    configuredTarget ??
    defaultParticipationRate;

  if (
    configuredMinimum !== null
  ) {
    participationRate =
      Math.max(
        participationRate,
        configuredMinimum,
      );
  }

  if (
    configuredMaximum !== null
  ) {
    participationRate =
      Math.min(
        participationRate,
        configuredMaximum,
      );
  }

  assertParticipationRate(
    participationRate,
    "participationRate",
  );

  return participationRate;
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

function resolveMarketVolume(
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
  fallbackMarketVolumePerInterval:
    number,
): number {
  if (
    snapshot === null ||
    !Number.isFinite(
      snapshot.recentMarketVolume,
    ) ||
    snapshot.recentMarketVolume <= 0
  ) {
    return fallbackMarketVolumePerInterval;
  }

  return snapshot.recentMarketVolume;
}

function resolveSideSpecificMarketVolume(
  instruction:
    AlgorithmicExecutionInstruction,
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
  fallbackMarketVolumePerInterval:
    number,
): number {
  if (snapshot === null) {
    return fallbackMarketVolumePerInterval;
  }

  const sideSpecificVolume =
    instruction.side === "BUY"
      ? snapshot.recentMarketSellVolume
      : snapshot.recentMarketBuyVolume;

  if (
    Number.isFinite(
      sideSpecificVolume,
    ) &&
    sideSpecificVolume > 0
  ) {
    return sideSpecificVolume;
  }

  return resolveMarketVolume(
    snapshot,
    fallbackMarketVolumePerInterval,
  );
}

function calculateRequestedSliceCount(
  duration: number,
  interval: number,
): number {
  return Math.max(
    1,
    Math.ceil(
      duration /
      interval,
    ),
  );
}

function calculateMinimumRequiredSliceCount(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  duration: number,
): number {
  let minimumCount = 1;

  const maximumQuantity =
    instruction.maximumChildOrderQuantity;

  if (
    maximumQuantity !== null
  ) {
    minimumCount =
      Math.max(
        minimumCount,
        Math.ceil(
          targetQuantity /
          maximumQuantity,
        ),
      );
  }

  const maximumInterval =
    instruction
      .maximumSliceIntervalMilliseconds;

  if (
    maximumInterval !== null
  ) {
    minimumCount =
      Math.max(
        minimumCount,
        Math.ceil(
          duration /
          maximumInterval,
        ),
      );
  }

  return minimumCount;
}

function calculateMaximumAllowedSliceCount(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  duration: number,
  configuredMaximumSliceCount: number,
): number {
  let maximumCount =
    configuredMaximumSliceCount;

  const minimumQuantity =
    instruction.minimumChildOrderQuantity;

  if (
    minimumQuantity !== null &&
    minimumQuantity <= targetQuantity
  ) {
    maximumCount =
      Math.min(
        maximumCount,
        Math.max(
          1,
          Math.floor(
            targetQuantity /
            minimumQuantity,
          ),
        ),
      );
  }

  const minimumInterval =
    instruction
      .minimumSliceIntervalMilliseconds;

  if (
    minimumInterval !== null
  ) {
    maximumCount =
      Math.min(
        maximumCount,
        Math.max(
          1,
          Math.floor(
            duration /
            minimumInterval,
          ),
        ),
      );
  }

  return Math.max(
    1,
    maximumCount,
  );
}

function calculateSliceCount(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  duration: number,
  interval: number,
  maximumSliceCount: number,
): number {
  const requestedCount =
    calculateRequestedSliceCount(
      duration,
      interval,
    );

  const minimumCount =
    calculateMinimumRequiredSliceCount(
      instruction,
      targetQuantity,
      duration,
    );

  const maximumCount =
    calculateMaximumAllowedSliceCount(
      instruction,
      targetQuantity,
      duration,
      maximumSliceCount,
    );

  if (
    minimumCount >
    maximumCount
  ) {
    throw new Error(
      [
        "Unable to create a POV schedule because",
        "the configured quantity and interval constraints",
        "cannot be satisfied.",
      ].join(" "),
    );
  }

  return Math.min(
    maximumCount,
    Math.max(
      minimumCount,
      requestedCount,
    ),
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
    configuredMinimum > targetQuantity
  ) {
    return null;
  }

  return configuredMinimum;
}

function calculateRawParticipationQuantity(
  expectedMarketVolume: number,
  participationRate: number,
): number {
  return (
    expectedMarketVolume *
    participationRate
  );
}

function clampSliceQuantity(
  instruction:
    AlgorithmicExecutionInstruction,
  quantity: number,
  remainingQuantity: number,
  remainingSliceCount: number,
  precision: number,
  epsilon: number,
): number {
  const minimumQuantity =
    resolveEffectiveMinimumQuantity(
      instruction,
      remainingQuantity,
    );

  const maximumQuantity =
    instruction.maximumChildOrderQuantity;

  let clampedQuantity =
    quantity;

  if (
    minimumQuantity !== null
  ) {
    clampedQuantity =
      Math.max(
        clampedQuantity,
        minimumQuantity,
      );
  }

  if (
    maximumQuantity !== null
  ) {
    clampedQuantity =
      Math.min(
        clampedQuantity,
        maximumQuantity,
      );
  }

  clampedQuantity =
    Math.min(
      clampedQuantity,
      remainingQuantity,
    );

  if (
    remainingSliceCount > 1 &&
    minimumQuantity !== null
  ) {
    const minimumReservedQuantity =
      minimumQuantity *
      (
        remainingSliceCount - 1
      );

    const maximumCurrentQuantity =
      Math.max(
        0,
        remainingQuantity -
        minimumReservedQuantity,
      );

    if (
      maximumCurrentQuantity > 0
    ) {
      clampedQuantity =
        Math.min(
          clampedQuantity,
          maximumCurrentQuantity,
        );
    }
  }

  return normalizeQuantity(
    clampedQuantity,
    precision,
    epsilon,
  );
}

function distributePovQuantities(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  sliceCount: number,
  expectedMarketVolumePerSlice: number,
  participationRate: number,
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
        : calculateRawParticipationQuantity(
            expectedMarketVolumePerSlice,
            participationRate,
          );

    quantity =
      clampSliceQuantity(
        instruction,
        quantity,
        remainingQuantity,
        remainingSliceCount,
        precision,
        epsilon,
      );

    if (
      quantity <= 0
    ) {
      const equalRemainingQuantity =
        normalizeQuantity(
          remainingQuantity /
          remainingSliceCount,
          precision,
          epsilon,
        );

      quantity =
        clampSliceQuantity(
          instruction,
          equalRemainingQuantity,
          remainingQuantity,
          remainingSliceCount,
          precision,
          epsilon,
        );
    }

    if (
      quantity <= 0
    ) {
      throw new Error(
        "POV quantity distribution produced a non-positive slice.",
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

    const correctedQuantity =
      normalizeQuantity(
        quantities[finalIndex] +
        remainingQuantity,
        precision,
        epsilon,
      );

    if (
      correctedQuantity <= 0
    ) {
      throw new Error(
        "POV final quantity correction produced an invalid slice.",
      );
    }

    quantities[finalIndex] =
      correctedQuantity;
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
      "POV distributed quantity does not equal its target quantity.",
    );
  }

  return Object.freeze(
    [...quantities],
  );
}

function createSlicePlans(
  input: PovScheduleBuildInput,
  quantities: readonly number[],
  expectedMarketVolumePerSlice: number,
  participationRate: number,
): readonly PovSlicePlan[] {
  const duration =
    input.endTime -
    input.startTime;

  const sliceCount =
    quantities.length;

  const plans =
    quantities.map(
      (
        quantity,
        index,
      ): PovSlicePlan => {
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

        return Object.freeze({
          sequence,

          scheduledAt,
          expiresAt,

          expectedMarketVolume:
            expectedMarketVolumePerSlice,

          participationRate,

          quantity,
        });
      },
    );

  return Object.freeze(
    [...plans],
  );
}

function createSlices(
  input: PovScheduleBuildInput,
  plans: readonly PovSlicePlan[],
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
            Object.freeze(
              [] as string[],
            ),

          createdAt:
            input.createdAt,

          updatedAt:
            input.createdAt,

          metadata:
            freezeAlgorithmicExecutionMetadata({
              algorithm: "POV",
              rebuilt:
                input.rebuild,
              scheduleVersion:
                input.version,
              sequence:
                plan.sequence,
              participationRate:
                plan.participationRate,
              expectedMarketVolume:
                plan.expectedMarketVolume,
              expectedParticipationQuantity:
                plan.quantity,
            }),
        }),
    ),
  );
}

export class PovScheduler
implements AlgorithmicExecutionScheduler {
  private readonly defaultParticipationRate:
    number;

  private readonly defaultSliceIntervalMilliseconds:
    number;

  private readonly fallbackMarketVolumePerInterval:
    number;

  private readonly maximumSliceCount:
    number;

  private readonly quantityPrecision:
    number;

  private readonly quantityEpsilon:
    number;

  private readonly requireMarketSnapshot:
    boolean;

  public constructor(
    options:
      PovSchedulerOptions = {},
  ) {
    this.defaultParticipationRate =
      options.defaultParticipationRate ??
      DEFAULT_PARTICIPATION_RATE;

    this.defaultSliceIntervalMilliseconds =
      options
        .defaultSliceIntervalMilliseconds ??
      DEFAULT_SLICE_INTERVAL_MILLISECONDS;

    this.fallbackMarketVolumePerInterval =
      options
        .fallbackMarketVolumePerInterval ??
      DEFAULT_FALLBACK_MARKET_VOLUME_PER_INTERVAL;

    this.maximumSliceCount =
      options.maximumSliceCount ??
      DEFAULT_MAXIMUM_SLICE_COUNT;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    this.quantityEpsilon =
      options.quantityEpsilon ??
      DEFAULT_QUANTITY_EPSILON;

    this.requireMarketSnapshot =
      options.requireMarketSnapshot ??
      false;

    assertParticipationRate(
      this.defaultParticipationRate,
      "defaultParticipationRate",
    );

    assertPositiveFiniteNumber(
      this.defaultSliceIntervalMilliseconds,
      "defaultSliceIntervalMilliseconds",
    );

    assertPositiveFiniteNumber(
      this.fallbackMarketVolumePerInterval,
      "fallbackMarketVolumePerInterval",
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
    this.assertPovInstruction(
      context.instruction,
    );

    assertNonNegativeFiniteNumber(
      context.currentTime,
      "context.currentTime",
    );

    return this.buildSchedule({
      instruction:
        context.instruction,

      marketSnapshot:
        context.marketSnapshot,

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
    this.assertPovInstruction(
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

      marketSnapshot:
        context.marketSnapshot,

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
    input: PovScheduleBuildInput,
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
        "A POV schedule requires endTime to be greater than startTime.",
      );
    }

    if (
      this.requireMarketSnapshot &&
      input.marketSnapshot === null
    ) {
      throw new Error(
        "A market snapshot is required to create this POV schedule.",
      );
    }

    const duration =
      input.endTime -
      input.startTime;

    const participationRate =
      resolveParticipationRate(
        input.instruction,
        this.defaultParticipationRate,
      );

    const interval =
      resolveSliceInterval(
        input.instruction,
        this
          .defaultSliceIntervalMilliseconds,
      );

    const sliceCount =
      calculateSliceCount(
        input.instruction,
        input.targetQuantity,
        duration,
        interval,
        this.maximumSliceCount,
      );

    const observedMarketVolume =
      resolveSideSpecificMarketVolume(
        input.instruction,
        input.marketSnapshot,
        this
          .fallbackMarketVolumePerInterval,
      );

    const expectedMarketVolumePerSlice =
      Math.max(
        this
          .fallbackMarketVolumePerInterval,
        observedMarketVolume,
      );

    const quantities =
      distributePovQuantities(
        input.instruction,
        input.targetQuantity,
        sliceCount,
        expectedMarketVolumePerSlice,
        participationRate,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const plans =
      createSlicePlans(
        input,
        quantities,
        expectedMarketVolumePerSlice,
        participationRate,
      );

    const slices =
      createSlices(
        input,
        plans,
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
        "POV schedule quantity does not equal its target quantity.",
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

      algorithm: "POV",

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
          algorithm: "POV",
          rebuilt:
            input.rebuild,
          scheduleVersion:
            input.version,
          sliceCount:
            slices.length,
          participationRate,
          observedMarketVolume,
          expectedMarketVolumePerSlice,
          marketSnapshotCapturedAt:
            input.marketSnapshot
              ?.capturedAt ??
            null,
          usedFallbackMarketVolume:
            input.marketSnapshot ===
              null ||
            input.marketSnapshot
              .recentMarketVolume <= 0,
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

      algorithm: "POV",

      startTime,
      endTime,

      targetQuantity: 0,

      slices:
        Object.freeze(
          [] as AlgorithmicExecutionSlice[],
        ),

      totalScheduledQuantity: 0,

      createdAt,
      version,

      metadata:
        freezeAlgorithmicExecutionMetadata({
          algorithm: "POV",
          rebuilt: true,
          scheduleVersion:
            version,
          sliceCount: 0,
          noRemainingQuantity: true,
        }),
    });
  }

  private assertPovInstruction(
    instruction:
      AlgorithmicExecutionInstruction,
  ): void {
    if (
      instruction.algorithm !==
      "POV"
    ) {
      throw new Error(
        [
          "PovScheduler only supports",
          "instructions whose algorithm is POV.",
        ].join(" "),
      );
    }
  }
}

export function createPovScheduler(
  options:
    PovSchedulerOptions = {},
): AlgorithmicExecutionScheduler {
  return new PovScheduler(
    options,
  );
}