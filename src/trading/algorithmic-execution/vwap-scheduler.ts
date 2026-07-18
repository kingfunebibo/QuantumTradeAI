import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionScheduleContext,
  type AlgorithmicExecutionScheduler,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  type AlgorithmicExecutionVolumeProfile,
  type AlgorithmicExecutionVolumeProfilePoint,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface VwapSchedulerOptions {
  readonly fallbackSliceIntervalMilliseconds?: number;
  readonly maximumSliceCount?: number;
  readonly quantityPrecision?: number;
  readonly quantityEpsilon?: number;
  readonly requireVolumeProfile?: boolean;
}

interface VwapScheduleBuildInput {
  readonly instruction: AlgorithmicExecutionInstruction;
  readonly volumeProfile: AlgorithmicExecutionVolumeProfile | null;

  readonly targetQuantity: number;

  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: number;

  readonly version: number;
  readonly rebuild: boolean;
}

interface NormalizedVolumePoint {
  readonly intervalStart: number;
  readonly intervalEnd: number;
  readonly expectedVolume: number;
  readonly weight: number;
}

interface WeightedQuantity {
  readonly scheduledAt: number;
  readonly expiresAt: number;
  readonly quantity: number;
  readonly expectedVolume: number;
  readonly volumeWeight: number;
}

const DEFAULT_FALLBACK_SLICE_INTERVAL_MILLISECONDS =
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
    "vwap",
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
    "vwap",
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
    configuredMinimum >
      targetQuantity
  ) {
    return null;
  }

  return configuredMinimum;
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
    resolveEffectiveMinimumQuantity(
      instruction,
      targetQuantity,
    );

  if (
    minimumQuantity !== null
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

function createFallbackVolumePoints(
  startTime: number,
  endTime: number,
  intervalMilliseconds: number,
  maximumSliceCount: number,
): readonly NormalizedVolumePoint[] {
  const duration =
    endTime -
    startTime;

  const requestedCount =
    Math.max(
      1,
      Math.ceil(
        duration /
          intervalMilliseconds,
      ),
    );

  const count =
    Math.min(
      requestedCount,
      maximumSliceCount,
    );

  const points: NormalizedVolumePoint[] = [];

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const intervalStart =
      startTime +
      (
        duration *
        index
      ) /
        count;

    const intervalEnd =
      startTime +
      (
        duration *
        (index + 1)
      ) /
        count;

    points.push(
      Object.freeze({
        intervalStart,
        intervalEnd,
        expectedVolume: 1,
        weight:
          1 / count,
      }),
    );
  }

  return Object.freeze(
    [...points],
  );
}

function normalizeVolumeProfilePoints(
  profile:
    AlgorithmicExecutionVolumeProfile,
  startTime: number,
  endTime: number,
): readonly NormalizedVolumePoint[] {
  const overlappingPoints =
    profile.points
      .map(
        (
          point,
        ):
          AlgorithmicExecutionVolumeProfilePoint | null => {
          const intervalStart =
            Math.max(
              startTime,
              point.intervalStart,
            );

          const intervalEnd =
            Math.min(
              endTime,
              point.intervalEnd,
            );

          if (
            intervalEnd <=
            intervalStart
          ) {
            return null;
          }

          return Object.freeze({
            intervalStart,
            intervalEnd,
            expectedVolume:
              Number.isFinite(
                point.expectedVolume,
              )
                ? Math.max(
                    0,
                    point.expectedVolume,
                  )
                : 0,
            expectedVolumeRatio:
              Number.isFinite(
                point.expectedVolumeRatio,
              )
                ? Math.max(
                    0,
                    point.expectedVolumeRatio,
                  )
                : 0,
          });
        },
      )
      .filter(
        (
          point,
        ): point is AlgorithmicExecutionVolumeProfilePoint =>
          point !== null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.intervalStart -
            right.intervalStart ||
          left.intervalEnd -
            right.intervalEnd,
      );

  if (
    overlappingPoints.length === 0
  ) {
    return Object.freeze([]);
  }

  const expectedVolumeTotal =
    overlappingPoints.reduce(
      (
        total,
        point,
      ) =>
        total +
        point.expectedVolume,
      0,
    );

  const expectedRatioTotal =
    overlappingPoints.reduce(
      (
        total,
        point,
      ) =>
        total +
        point.expectedVolumeRatio,
      0,
    );

  const useExpectedVolume =
    expectedVolumeTotal > 0;

  const denominator =
    useExpectedVolume
      ? expectedVolumeTotal
      : expectedRatioTotal;

  if (
    denominator <= 0
  ) {
    const equalWeight =
      1 /
      overlappingPoints.length;

    return Object.freeze(
      overlappingPoints.map(
        (point) =>
          Object.freeze({
            intervalStart:
              point.intervalStart,
            intervalEnd:
              point.intervalEnd,
            expectedVolume:
              point.expectedVolume,
            weight:
              equalWeight,
          }),
      ),
    );
  }

  return Object.freeze(
    overlappingPoints.map(
      (point) =>
        Object.freeze({
          intervalStart:
            point.intervalStart,
          intervalEnd:
            point.intervalEnd,
          expectedVolume:
            point.expectedVolume,
          weight:
            (
              useExpectedVolume
                ? point.expectedVolume
                : point.expectedVolumeRatio
            ) /
            denominator,
        }),
    ),
  );
}

function selectVolumePoints(
  points:
    readonly NormalizedVolumePoint[],
  minimumCount: number,
  maximumCount: number,
): readonly NormalizedVolumePoint[] {
  if (
    minimumCount >
    maximumCount
  ) {
    throw new Error(
      [
        "Unable to create a VWAP schedule because",
        "quantity and interval constraints conflict.",
      ].join(" "),
    );
  }

  if (
    points.length >=
      minimumCount &&
    points.length <=
      maximumCount
  ) {
    return points;
  }

  const desiredCount =
    Math.min(
      maximumCount,
      Math.max(
        minimumCount,
        points.length,
      ),
    );

  const scheduleStart =
    points[0]?.intervalStart;

  const scheduleEnd =
    points[
      points.length - 1
    ]?.intervalEnd;

  if (
    scheduleStart === undefined ||
    scheduleEnd === undefined
  ) {
    return Object.freeze([]);
  }

  const duration =
    scheduleEnd -
    scheduleStart;

  const redistributed:
    NormalizedVolumePoint[] = [];

  for (
    let index = 0;
    index < desiredCount;
    index += 1
  ) {
    const intervalStart =
      scheduleStart +
      (
        duration *
        index
      ) /
        desiredCount;

    const intervalEnd =
      scheduleStart +
      (
        duration *
        (index + 1)
      ) /
        desiredCount;

    let expectedVolume = 0;
    let weightedContribution = 0;

    for (
      const point of points
    ) {
      const overlapStart =
        Math.max(
          intervalStart,
          point.intervalStart,
        );

      const overlapEnd =
        Math.min(
          intervalEnd,
          point.intervalEnd,
        );

      const overlapDuration =
        Math.max(
          0,
          overlapEnd -
            overlapStart,
        );

      const pointDuration =
        point.intervalEnd -
        point.intervalStart;

      if (
        overlapDuration <= 0 ||
        pointDuration <= 0
      ) {
        continue;
      }

      const overlapRatio =
        overlapDuration /
        pointDuration;

      expectedVolume +=
        point.expectedVolume *
        overlapRatio;

      weightedContribution +=
        point.weight *
        overlapRatio;
    }

    redistributed.push(
      Object.freeze({
        intervalStart,
        intervalEnd,
        expectedVolume,
        weight:
          weightedContribution,
      }),
    );
  }

  const weightTotal =
    redistributed.reduce(
      (
        total,
        point,
      ) =>
        total +
        point.weight,
      0,
    );

  if (
    weightTotal <= 0
  ) {
    const equalWeight =
      1 /
      redistributed.length;

    return Object.freeze(
      redistributed.map(
        (point) =>
          Object.freeze({
            ...point,
            weight:
              equalWeight,
          }),
      ),
    );
  }

  return Object.freeze(
    redistributed.map(
      (point) =>
        Object.freeze({
          ...point,
          weight:
            point.weight /
            weightTotal,
        }),
    ),
  );
}

function distributeWeightedQuantities(
  points:
    readonly NormalizedVolumePoint[],
  targetQuantity: number,
  precision: number,
  epsilon: number,
): readonly WeightedQuantity[] {
  if (
    points.length === 0
  ) {
    throw new Error(
      "VWAP schedule requires at least one volume point.",
    );
  }

  const quantities:
    WeightedQuantity[] = [];

  let allocatedQuantity = 0;

  for (
    let index = 0;
    index < points.length;
    index += 1
  ) {
    const point =
      points[index];

    const isFinalPoint =
      index ===
      points.length - 1;

    const quantity =
      isFinalPoint
        ? normalizeQuantity(
            targetQuantity -
              allocatedQuantity,
            precision,
            epsilon,
          )
        : normalizeQuantity(
            targetQuantity *
              point.weight,
            precision,
            epsilon,
          );

    quantities.push(
      Object.freeze({
        scheduledAt:
          point.intervalStart,
        expiresAt:
          point.intervalEnd,
        quantity,
        expectedVolume:
          point.expectedVolume,
        volumeWeight:
          point.weight,
      }),
    );

    allocatedQuantity =
      normalizeQuantity(
        allocatedQuantity +
          quantity,
        precision,
        epsilon,
      );
  }

  const positiveQuantities =
    quantities.filter(
      (entry) =>
        entry.quantity > 0,
    );

  if (
    positiveQuantities.length === 0
  ) {
    throw new Error(
      "VWAP quantity distribution produced no positive slices.",
    );
  }

  const distributedTotal =
    positiveQuantities.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.quantity,
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
      positiveQuantities.length - 1;

    const finalEntry =
      positiveQuantities[
        finalIndex
      ];

    const correctedQuantity =
      normalizeQuantity(
        finalEntry.quantity +
          difference,
        precision,
        epsilon,
      );

    if (
      correctedQuantity <= 0
    ) {
      throw new Error(
        "VWAP quantity correction produced an invalid final slice.",
      );
    }

    positiveQuantities[
      finalIndex
    ] =
      Object.freeze({
        ...finalEntry,
        quantity:
          correctedQuantity,
      });
  }

  return Object.freeze(
    [...positiveQuantities],
  );
}

function createSlices(
  input: VwapScheduleBuildInput,
  quantities:
    readonly WeightedQuantity[],
): readonly AlgorithmicExecutionSlice[] {
  const effectiveMinimumQuantity =
    resolveEffectiveMinimumQuantity(
      input.instruction,
      input.targetQuantity,
    );

  return Object.freeze(
    quantities.map(
      (
        weightedQuantity,
        index,
      ): AlgorithmicExecutionSlice => {
        const sequence =
          index + 1;

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

          scheduledAt:
            weightedQuantity
              .scheduledAt,

          expiresAt:
            weightedQuantity
              .expiresAt,

          targetQuantity:
            weightedQuantity
              .quantity,

          minimumQuantity:
            effectiveMinimumQuantity,

          maximumQuantity:
            input.instruction
              .maximumChildOrderQuantity,

          status: "PENDING",

          submittedQuantity: 0,
          filledQuantity: 0,

          remainingQuantity:
            weightedQuantity
              .quantity,

          averageFillPrice: null,

          childOrderIds:
            Object.freeze([]),

          createdAt:
            input.createdAt,

          updatedAt:
            input.createdAt,

          metadata:
            freezeAlgorithmicExecutionMetadata({
              algorithm: "VWAP",
              rebuilt:
                input.rebuild,
              scheduleVersion:
                input.version,
              sequence,
              volumeWeight:
                weightedQuantity
                  .volumeWeight,
              expectedVolume:
                weightedQuantity
                  .expectedVolume,
            }),
        });
      },
    ),
  );
}

export class VwapScheduler
implements AlgorithmicExecutionScheduler {
  private readonly fallbackSliceIntervalMilliseconds:
    number;

  private readonly maximumSliceCount:
    number;

  private readonly quantityPrecision:
    number;

  private readonly quantityEpsilon:
    number;

  private readonly requireVolumeProfile:
    boolean;

  public constructor(
    options:
      VwapSchedulerOptions = {},
  ) {
    this.fallbackSliceIntervalMilliseconds =
      options
        .fallbackSliceIntervalMilliseconds ??
      DEFAULT_FALLBACK_SLICE_INTERVAL_MILLISECONDS;

    this.maximumSliceCount =
      options.maximumSliceCount ??
      DEFAULT_MAXIMUM_SLICE_COUNT;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    this.quantityEpsilon =
      options.quantityEpsilon ??
      DEFAULT_QUANTITY_EPSILON;

    this.requireVolumeProfile =
      options.requireVolumeProfile ??
      false;

    assertPositiveFiniteNumber(
      this.fallbackSliceIntervalMilliseconds,
      "fallbackSliceIntervalMilliseconds",
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
    this.assertVwapInstruction(
      context.instruction,
    );

    assertNonNegativeFiniteNumber(
      context.currentTime,
      "context.currentTime",
    );

    return this.buildSchedule({
      instruction:
        context.instruction,

      volumeProfile:
        context.volumeProfile,

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
    this.assertVwapInstruction(
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

      volumeProfile:
        context.volumeProfile,

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
    input: VwapScheduleBuildInput,
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
        "A VWAP schedule requires endTime to be greater than startTime.",
      );
    }

    if (
      this.requireVolumeProfile &&
      input.volumeProfile === null
    ) {
      throw new Error(
        "A volume profile is required to create this VWAP schedule.",
      );
    }

    const duration =
      input.endTime -
      input.startTime;

    const maximumCount =
      calculateMaximumAllowedSliceCount(
        input.instruction,
        input.targetQuantity,
        duration,
        this.maximumSliceCount,
      );

    const minimumCount =
      calculateMinimumRequiredSliceCount(
        input.instruction,
        input.targetQuantity,
        duration,
      );

    let normalizedPoints =
      input.volumeProfile === null
        ? Object.freeze(
            [] as NormalizedVolumePoint[],
          )
        : normalizeVolumeProfilePoints(
            input.volumeProfile,
            input.startTime,
            input.endTime,
          );

    if (
      normalizedPoints.length === 0
    ) {
      normalizedPoints =
        createFallbackVolumePoints(
          input.startTime,
          input.endTime,
          this
            .fallbackSliceIntervalMilliseconds,
          maximumCount,
        );
    }

    const selectedPoints =
      selectVolumePoints(
        normalizedPoints,
        minimumCount,
        maximumCount,
      );

    const weightedQuantities =
      distributeWeightedQuantities(
        selectedPoints,
        input.targetQuantity,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const slices =
      createSlices(
        input,
        weightedQuantities,
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
      ) >
      this.quantityEpsilon
    ) {
      throw new Error(
        "VWAP schedule quantity does not equal its target quantity.",
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

      algorithm: "VWAP",

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
          algorithm: "VWAP",
          rebuilt:
            input.rebuild,
          scheduleVersion:
            input.version,
          sliceCount:
            slices.length,
          volumeProfileId:
            input.volumeProfile
              ?.profileId ??
            null,
          usedFallbackProfile:
            input.volumeProfile ===
            null,
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

      algorithm: "VWAP",

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
          algorithm: "VWAP",
          rebuilt: true,
          scheduleVersion:
            version,
          sliceCount: 0,
          noRemainingQuantity: true,
        }),
    });
  }

  private assertVwapInstruction(
    instruction:
      AlgorithmicExecutionInstruction,
  ): void {
    if (
      instruction.algorithm !==
      "VWAP"
    ) {
      throw new Error(
        [
          "VwapScheduler only supports",
          "instructions whose algorithm is VWAP.",
        ].join(" "),
      );
    }
  }
}

export function createVwapScheduler(
  options:
    VwapSchedulerOptions = {},
): AlgorithmicExecutionScheduler {
  return new VwapScheduler(
    options,
  );
}