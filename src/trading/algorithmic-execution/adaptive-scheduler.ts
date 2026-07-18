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

export interface AdaptiveSchedulerOptions {
  /**
   * Default interval between adaptive execution slices.
   */
  readonly defaultSliceIntervalMilliseconds?: number;

  /**
   * Default number of slices when the execution window and interval do not
   * provide a meaningful count.
   */
  readonly defaultSliceCount?: number;

  /**
   * Maximum number of slices allowed in one schedule.
   */
  readonly maximumSliceCount?: number;

  /**
   * Market spread considered normal by the adaptive scheduler.
   */
  readonly normalSpreadBps?: number;

  /**
   * Market volatility considered normal by the adaptive scheduler.
   */
  readonly normalVolatilityBps?: number;

  /**
   * Maximum multiplier applied to an individual adaptive slice.
   */
  readonly maximumAggressionMultiplier?: number;

  /**
   * Minimum multiplier applied to an individual adaptive slice.
   */
  readonly minimumAggressionMultiplier?: number;

  /**
   * Default participation rate used when market volume is available.
   */
  readonly defaultParticipationRate?: number;

  /**
   * Decimal precision used for deterministic quantity calculations.
   */
  readonly quantityPrecision?: number;

  /**
   * Quantities at or below this value are treated as zero.
   */
  readonly quantityEpsilon?: number;

  /**
   * When true, the scheduler requires a current market snapshot.
   */
  readonly requireMarketSnapshot?: boolean;
}

type AdaptiveMarketCondition =
  | "FAVORABLE"
  | "NEUTRAL"
  | "UNFAVORABLE";

interface AdaptiveScheduleBuildInput {
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

interface AdaptiveMarketAssessment {
  readonly condition: AdaptiveMarketCondition;

  readonly spreadBps: number | null;
  readonly volatilityBps: number | null;

  readonly liquidityImbalance: number;
  readonly sideLiquidityRatio: number;

  readonly recentMarketVolume: number;

  readonly aggressionMultiplier: number;
}

interface AdaptiveSlicePlan {
  readonly sequence: number;

  readonly scheduledAt: number;
  readonly expiresAt: number;

  readonly baseWeight: number;
  readonly adaptiveWeight: number;

  readonly quantity: number;

  readonly marketCondition: AdaptiveMarketCondition;
  readonly aggressionMultiplier: number;
}

const DEFAULT_SLICE_INTERVAL_MILLISECONDS =
  30_000;

const DEFAULT_SLICE_COUNT =
  10;

const DEFAULT_MAXIMUM_SLICE_COUNT =
  10_000;

const DEFAULT_NORMAL_SPREAD_BPS =
  10;

const DEFAULT_NORMAL_VOLATILITY_BPS =
  50;

const DEFAULT_MAXIMUM_AGGRESSION_MULTIPLIER =
  2;

const DEFAULT_MINIMUM_AGGRESSION_MULTIPLIER =
  0.25;

const DEFAULT_PARTICIPATION_RATE =
  0.1;

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

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
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

function createScheduleId(
  executionId: string,
  version: number,
): string {
  return [
    executionId,
    "adaptive",
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
    "adaptive",
    "slice",
    version,
    sequence,
  ].join(":");
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

function calculateRequestedSliceCount(
  duration: number,
  interval: number,
  defaultSliceCount: number,
): number {
  if (
    duration <= 0 ||
    interval <= 0
  ) {
    return defaultSliceCount;
  }

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
  defaultSliceCount: number,
  maximumSliceCount: number,
): number {
  const requestedCount =
    calculateRequestedSliceCount(
      duration,
      interval,
      defaultSliceCount,
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
        "Unable to create an adaptive schedule because",
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

function resolveParticipationRate(
  instruction:
    AlgorithmicExecutionInstruction,
  defaultParticipationRate: number,
): number {
  let participationRate =
    instruction
      .participationLimit
      .targetParticipationRate ??
    defaultParticipationRate;

  const minimumParticipationRate =
    instruction
      .participationLimit
      .minimumParticipationRate;

  const maximumParticipationRate =
    instruction
      .participationLimit
      .maximumParticipationRate;

  if (
    minimumParticipationRate !== null
  ) {
    participationRate =
      Math.max(
        participationRate,
        minimumParticipationRate,
      );
  }

  if (
    maximumParticipationRate !== null
  ) {
    participationRate =
      Math.min(
        participationRate,
        maximumParticipationRate,
      );
  }

  return clamp(
    participationRate,
    Number.EPSILON,
    1,
  );
}

function calculateLiquidityImbalance(
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
): number {
  if (snapshot === null) {
    return 0;
  }

  const totalLiquidity =
    snapshot.bidQuantity +
    snapshot.askQuantity;

  if (
    !Number.isFinite(
      totalLiquidity,
    ) ||
    totalLiquidity <= 0
  ) {
    return 0;
  }

  return clamp(
    (
      snapshot.bidQuantity -
      snapshot.askQuantity
    ) /
      totalLiquidity,
    -1,
    1,
  );
}

function calculateSideLiquidityRatio(
  instruction:
    AlgorithmicExecutionInstruction,
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
): number {
  if (snapshot === null) {
    return 1;
  }

  const sideLiquidity =
    instruction.side === "BUY"
      ? snapshot.askQuantity
      : snapshot.bidQuantity;

  const oppositeLiquidity =
    instruction.side === "BUY"
      ? snapshot.bidQuantity
      : snapshot.askQuantity;

  if (
    !Number.isFinite(
      sideLiquidity,
    ) ||
    sideLiquidity < 0
  ) {
    return 1;
  }

  if (
    !Number.isFinite(
      oppositeLiquidity,
    ) ||
    oppositeLiquidity <= 0
  ) {
    return sideLiquidity > 0
      ? 2
      : 1;
  }

  return clamp(
    sideLiquidity /
      oppositeLiquidity,
    0,
    2,
  );
}

function calculateSpreadScore(
  spreadBps: number | null,
  normalSpreadBps: number,
): number {
  if (
    spreadBps === null ||
    !Number.isFinite(spreadBps) ||
    spreadBps < 0
  ) {
    return 0;
  }

  if (spreadBps === 0) {
    return 1;
  }

  return clamp(
    (
      normalSpreadBps -
      spreadBps
    ) /
      normalSpreadBps,
    -1,
    1,
  );
}

function calculateVolatilityScore(
  volatilityBps: number | null,
  normalVolatilityBps: number,
): number {
  if (
    volatilityBps === null ||
    !Number.isFinite(
      volatilityBps,
    ) ||
    volatilityBps < 0
  ) {
    return 0;
  }

  if (volatilityBps === 0) {
    return 1;
  }

  return clamp(
    (
      normalVolatilityBps -
      volatilityBps
    ) /
      normalVolatilityBps,
    -1,
    1,
  );
}

function calculateLiquidityScore(
  instruction:
    AlgorithmicExecutionInstruction,
  liquidityImbalance: number,
  sideLiquidityRatio: number,
): number {
  const imbalanceScore =
    instruction.side === "BUY"
      ? -liquidityImbalance
      : liquidityImbalance;

  const ratioScore =
    clamp(
      sideLiquidityRatio - 1,
      -1,
      1,
    );

  return clamp(
    (
      imbalanceScore +
      ratioScore
    ) /
      2,
    -1,
    1,
  );
}

function calculateVolumeScore(
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
  targetQuantity: number,
  participationRate: number,
): number {
  if (
    snapshot === null ||
    !Number.isFinite(
      snapshot.recentMarketVolume,
    ) ||
    snapshot.recentMarketVolume <= 0
  ) {
    return 0;
  }

  const executableQuantity =
    snapshot.recentMarketVolume *
    participationRate;

  if (
    executableQuantity >=
    targetQuantity
  ) {
    return 1;
  }

  return clamp(
    executableQuantity /
      targetQuantity,
    0,
    1,
  );
}

function assessMarket(
  instruction:
    AlgorithmicExecutionInstruction,
  snapshot:
    AlgorithmicExecutionMarketSnapshot | null,
  targetQuantity: number,
  participationRate: number,
  normalSpreadBps: number,
  normalVolatilityBps: number,
  minimumAggressionMultiplier: number,
  maximumAggressionMultiplier: number,
): AdaptiveMarketAssessment {
  if (snapshot === null) {
    return Object.freeze({
      condition: "NEUTRAL",

      spreadBps: null,
      volatilityBps: null,

      liquidityImbalance: 0,
      sideLiquidityRatio: 1,

      recentMarketVolume: 0,

      aggressionMultiplier: 1,
    });
  }

  const liquidityImbalance =
    calculateLiquidityImbalance(
      snapshot,
    );

  const sideLiquidityRatio =
    calculateSideLiquidityRatio(
      instruction,
      snapshot,
    );

  const spreadScore =
    calculateSpreadScore(
      snapshot.spreadBps,
      normalSpreadBps,
    );

  const volatilityScore =
    calculateVolatilityScore(
      snapshot.volatilityBps,
      normalVolatilityBps,
    );

  const liquidityScore =
    calculateLiquidityScore(
      instruction,
      liquidityImbalance,
      sideLiquidityRatio,
    );

  const volumeScore =
    calculateVolumeScore(
      snapshot,
      targetQuantity,
      participationRate,
    );

  const compositeScore =
    (
      spreadScore *
      0.3
    ) +
    (
      volatilityScore *
      0.25
    ) +
    (
      liquidityScore *
      0.25
    ) +
    (
      volumeScore *
      0.2
    );

  let condition:
    AdaptiveMarketCondition;

  if (compositeScore >= 0.25) {
    condition = "FAVORABLE";
  } else if (
    compositeScore <= -0.25
  ) {
    condition = "UNFAVORABLE";
  } else {
    condition = "NEUTRAL";
  }

  const aggressionMultiplier =
    clamp(
      1 + compositeScore,
      minimumAggressionMultiplier,
      maximumAggressionMultiplier,
    );

  return Object.freeze({
    condition,

    spreadBps:
      snapshot.spreadBps,

    volatilityBps:
      snapshot.volatilityBps,

    liquidityImbalance,
    sideLiquidityRatio,

    recentMarketVolume:
      Math.max(
        0,
        snapshot.recentMarketVolume,
      ),

    aggressionMultiplier,
  });
}

function createBaseWeights(
  sliceCount: number,
  urgency:
    AlgorithmicExecutionInstruction["urgency"],
): readonly number[] {
  const weights: number[] = [];

  for (
    let index = 0;
    index < sliceCount;
    index += 1
  ) {
    const normalizedPosition =
      sliceCount === 1
        ? 0
        : index /
          (
            sliceCount - 1
          );

    let weight: number;

    switch (urgency) {
      case "LOW":
        weight =
          0.75 +
          normalizedPosition *
          0.5;
        break;

      case "HIGH":
        weight =
          1.5 -
          normalizedPosition *
          0.75;
        break;

      case "IMMEDIATE":
        weight =
          2 -
          normalizedPosition;
        break;

      case "NORMAL":
      default:
        weight = 1;
        break;
    }

    weights.push(
      weight,
    );
  }

  return Object.freeze(
    [...weights],
  );
}

function createAdaptiveWeights(
  baseWeights: readonly number[],
  marketAssessment:
    AdaptiveMarketAssessment,
): readonly number[] {
  const adaptiveWeights =
    baseWeights.map(
      (
        baseWeight,
        index,
      ) => {
        const progress =
          baseWeights.length === 1
            ? 0
            : index /
              (
                baseWeights.length -
                1
              );

        let marketMultiplier =
          marketAssessment
            .aggressionMultiplier;

        if (
          marketAssessment.condition ===
          "FAVORABLE"
        ) {
          marketMultiplier *=
            1.25 -
            progress *
            0.25;
        } else if (
          marketAssessment.condition ===
          "UNFAVORABLE"
        ) {
          marketMultiplier *=
            0.75 +
            progress *
            0.25;
        }

        return Math.max(
          Number.EPSILON,
          baseWeight *
            marketMultiplier,
        );
      },
    );

  return Object.freeze(
    adaptiveWeights,
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

function distributeWeightedQuantities(
  instruction:
    AlgorithmicExecutionInstruction,
  targetQuantity: number,
  weights: readonly number[],
  precision: number,
  epsilon: number,
): readonly number[] {
  if (weights.length === 0) {
    throw new Error(
      "Adaptive quantity distribution requires at least one weight.",
    );
  }

  const totalWeight =
    weights.reduce(
      (
        total,
        weight,
      ) =>
        total + weight,
      0,
    );

  if (
    !Number.isFinite(
      totalWeight,
    ) ||
    totalWeight <= 0
  ) {
    throw new Error(
      "Adaptive quantity distribution requires a positive total weight.",
    );
  }

  const minimumQuantity =
    resolveEffectiveMinimumQuantity(
      instruction,
      targetQuantity,
    );

  const maximumQuantity =
    instruction.maximumChildOrderQuantity;

  const quantities: number[] = [];

  let remainingQuantity =
    normalizeQuantity(
      targetQuantity,
      precision,
      epsilon,
    );

  let remainingWeight =
    totalWeight;

  for (
    let index = 0;
    index < weights.length;
    index += 1
  ) {
    const remainingSliceCount =
      weights.length - index;

    const isFinalSlice =
      remainingSliceCount === 1;

    let quantity =
      isFinalSlice
        ? remainingQuantity
        : remainingQuantity *
          (
            weights[index] /
            remainingWeight
          );

    if (
      minimumQuantity !== null
    ) {
      quantity =
        Math.max(
          quantity,
          minimumQuantity,
        );
    }

    if (
      maximumQuantity !== null
    ) {
      quantity =
        Math.min(
          quantity,
          maximumQuantity,
        );
    }

    if (
      !isFinalSlice &&
      minimumQuantity !== null
    ) {
      const minimumReservedQuantity =
        minimumQuantity *
        (
          remainingSliceCount -
          1
        );

      const maximumCurrentQuantity =
        remainingQuantity -
        minimumReservedQuantity;

      quantity =
        Math.min(
          quantity,
          maximumCurrentQuantity,
        );
    }

    quantity =
      normalizeQuantity(
        Math.min(
          quantity,
          remainingQuantity,
        ),
        precision,
        epsilon,
      );

    if (quantity <= 0) {
      throw new Error(
        "Adaptive quantity distribution produced a non-positive slice.",
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

    remainingWeight -=
      weights[index];
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
        "Adaptive final quantity correction produced an invalid slice.",
      );
    }

    if (
      maximumQuantity !== null &&
      correctedFinalQuantity >
        maximumQuantity +
          epsilon
    ) {
      throw new Error(
        "Adaptive final quantity correction exceeded maximumChildOrderQuantity.",
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
      "Adaptive distributed quantity does not equal the target quantity.",
    );
  }

  return Object.freeze(
    [...quantities],
  );
}

function createSlicePlans(
  input:
    AdaptiveScheduleBuildInput,
  quantities: readonly number[],
  baseWeights: readonly number[],
  adaptiveWeights: readonly number[],
  marketAssessment:
    AdaptiveMarketAssessment,
): readonly AdaptiveSlicePlan[] {
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
      ): AdaptiveSlicePlan => {
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

          baseWeight:
            baseWeights[index],

          adaptiveWeight:
            adaptiveWeights[index],

          quantity,

          marketCondition:
            marketAssessment.condition,

          aggressionMultiplier:
            marketAssessment
              .aggressionMultiplier,
        });
      },
    );

  return Object.freeze(
    [...plans],
  );
}

function createSlices(
  input:
    AdaptiveScheduleBuildInput,
  plans:
    readonly AdaptiveSlicePlan[],
  marketAssessment:
    AdaptiveMarketAssessment,
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
              algorithm:
                "ADAPTIVE",

              rebuilt:
                input.rebuild,

              scheduleVersion:
                input.version,

              sequence:
                plan.sequence,

              marketCondition:
                plan.marketCondition,

              aggressionMultiplier:
                plan
                  .aggressionMultiplier,

              baseWeight:
                plan.baseWeight,

              adaptiveWeight:
                plan.adaptiveWeight,

              spreadBps:
                marketAssessment
                  .spreadBps,

              volatilityBps:
                marketAssessment
                  .volatilityBps,

              liquidityImbalance:
                marketAssessment
                  .liquidityImbalance,

              sideLiquidityRatio:
                marketAssessment
                  .sideLiquidityRatio,
            }),
        }),
    ),
  );
}

export class AdaptiveScheduler
implements AlgorithmicExecutionScheduler {
  private readonly defaultSliceIntervalMilliseconds:
    number;

  private readonly defaultSliceCount:
    number;

  private readonly maximumSliceCount:
    number;

  private readonly normalSpreadBps:
    number;

  private readonly normalVolatilityBps:
    number;

  private readonly maximumAggressionMultiplier:
    number;

  private readonly minimumAggressionMultiplier:
    number;

  private readonly defaultParticipationRate:
    number;

  private readonly quantityPrecision:
    number;

  private readonly quantityEpsilon:
    number;

  private readonly requireMarketSnapshot:
    boolean;

  public constructor(
    options:
      AdaptiveSchedulerOptions = {},
  ) {
    this.defaultSliceIntervalMilliseconds =
      options
        .defaultSliceIntervalMilliseconds ??
      DEFAULT_SLICE_INTERVAL_MILLISECONDS;

    this.defaultSliceCount =
      options.defaultSliceCount ??
      DEFAULT_SLICE_COUNT;

    this.maximumSliceCount =
      options.maximumSliceCount ??
      DEFAULT_MAXIMUM_SLICE_COUNT;

    this.normalSpreadBps =
      options.normalSpreadBps ??
      DEFAULT_NORMAL_SPREAD_BPS;

    this.normalVolatilityBps =
      options.normalVolatilityBps ??
      DEFAULT_NORMAL_VOLATILITY_BPS;

    this.maximumAggressionMultiplier =
      options
        .maximumAggressionMultiplier ??
      DEFAULT_MAXIMUM_AGGRESSION_MULTIPLIER;

    this.minimumAggressionMultiplier =
      options
        .minimumAggressionMultiplier ??
      DEFAULT_MINIMUM_AGGRESSION_MULTIPLIER;

    this.defaultParticipationRate =
      options.defaultParticipationRate ??
      DEFAULT_PARTICIPATION_RATE;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    this.quantityEpsilon =
      options.quantityEpsilon ??
      DEFAULT_QUANTITY_EPSILON;

    this.requireMarketSnapshot =
      options.requireMarketSnapshot ??
      false;

    assertPositiveFiniteNumber(
      this.defaultSliceIntervalMilliseconds,
      "defaultSliceIntervalMilliseconds",
    );

    assertPositiveInteger(
      this.defaultSliceCount,
      "defaultSliceCount",
    );

    assertPositiveInteger(
      this.maximumSliceCount,
      "maximumSliceCount",
    );

    assertPositiveFiniteNumber(
      this.normalSpreadBps,
      "normalSpreadBps",
    );

    assertPositiveFiniteNumber(
      this.normalVolatilityBps,
      "normalVolatilityBps",
    );

    assertPositiveFiniteNumber(
      this.maximumAggressionMultiplier,
      "maximumAggressionMultiplier",
    );

    assertPositiveFiniteNumber(
      this.minimumAggressionMultiplier,
      "minimumAggressionMultiplier",
    );

    if (
      this.minimumAggressionMultiplier >
      this.maximumAggressionMultiplier
    ) {
      throw new Error(
        [
          "minimumAggressionMultiplier",
          "cannot exceed",
          "maximumAggressionMultiplier.",
        ].join(" "),
      );
    }

    assertRatio(
      this.defaultParticipationRate,
      "defaultParticipationRate",
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
    this.assertAdaptiveInstruction(
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
    this.assertAdaptiveInstruction(
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
    input:
      AdaptiveScheduleBuildInput,
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
        [
          "An adaptive schedule requires",
          "endTime to be greater than startTime.",
        ].join(" "),
      );
    }

    if (
      this.requireMarketSnapshot &&
      input.marketSnapshot === null
    ) {
      throw new Error(
        [
          "A market snapshot is required",
          "to create this adaptive schedule.",
        ].join(" "),
      );
    }

    if (
      input.marketSnapshot !== null &&
      input.marketSnapshot.symbol !==
        input.instruction.symbol
    ) {
      throw new Error(
        [
          "marketSnapshot.symbol must match",
          "instruction.symbol.",
        ].join(" "),
      );
    }

    const duration =
      input.endTime -
      input.startTime;

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
        this.defaultSliceCount,
        this.maximumSliceCount,
      );

    const participationRate =
      resolveParticipationRate(
        input.instruction,
        this.defaultParticipationRate,
      );

    const marketAssessment =
      assessMarket(
        input.instruction,
        input.marketSnapshot,
        input.targetQuantity,
        participationRate,
        this.normalSpreadBps,
        this.normalVolatilityBps,
        this
          .minimumAggressionMultiplier,
        this
          .maximumAggressionMultiplier,
      );

    const baseWeights =
      createBaseWeights(
        sliceCount,
        input.instruction.urgency,
      );

    const adaptiveWeights =
      createAdaptiveWeights(
        baseWeights,
        marketAssessment,
      );

    const quantities =
      distributeWeightedQuantities(
        input.instruction,
        input.targetQuantity,
        adaptiveWeights,
        this.quantityPrecision,
        this.quantityEpsilon,
      );

    const plans =
      createSlicePlans(
        input,
        quantities,
        baseWeights,
        adaptiveWeights,
        marketAssessment,
      );

    const slices =
      createSlices(
        input,
        plans,
        marketAssessment,
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
        [
          "Adaptive schedule quantity",
          "does not equal its target quantity.",
        ].join(" "),
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

      algorithm: "ADAPTIVE",

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
          algorithm:
            "ADAPTIVE",

          rebuilt:
            input.rebuild,

          scheduleVersion:
            input.version,

          sliceCount:
            slices.length,

          marketCondition:
            marketAssessment.condition,

          aggressionMultiplier:
            marketAssessment
              .aggressionMultiplier,

          spreadBps:
            marketAssessment
              .spreadBps,

          volatilityBps:
            marketAssessment
              .volatilityBps,

          liquidityImbalance:
            marketAssessment
              .liquidityImbalance,

          sideLiquidityRatio:
            marketAssessment
              .sideLiquidityRatio,

          recentMarketVolume:
            marketAssessment
              .recentMarketVolume,

          participationRate,

          marketSnapshotCapturedAt:
            input.marketSnapshot
              ?.capturedAt ??
            null,

          usedNeutralMarketAssessment:
            input.marketSnapshot ===
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

      algorithm: "ADAPTIVE",

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
          algorithm:
            "ADAPTIVE",

          rebuilt: true,

          scheduleVersion:
            version,

          sliceCount: 0,

          noRemainingQuantity:
            true,
        }),
    });
  }

  private assertAdaptiveInstruction(
    instruction:
      AlgorithmicExecutionInstruction,
  ): void {
    if (
      instruction.algorithm !==
      "ADAPTIVE"
    ) {
      throw new Error(
        [
          "AdaptiveScheduler only supports",
          "instructions whose algorithm",
          "is ADAPTIVE.",
        ].join(" "),
      );
    }
  }
}

export function createAdaptiveScheduler(
  options:
    AdaptiveSchedulerOptions = {},
): AlgorithmicExecutionScheduler {
  return new AdaptiveScheduler(
    options,
  );
}