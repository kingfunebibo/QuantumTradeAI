import {
  type AlgorithmicExecutionAlgorithm,
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionScheduleContext,
  type AlgorithmicExecutionScheduler,
  type AlgorithmicExecutionState,
} from "./algorithmic-execution-contracts";

import {
  AdaptiveScheduler,
  type AdaptiveSchedulerOptions,
} from "./adaptive-scheduler";

import {
  IcebergScheduler,
  type IcebergSchedulerOptions,
} from "./iceberg-scheduler";

import {
  PovScheduler,
  type PovSchedulerOptions,
} from "./pov-scheduler";

import {
  TwapScheduler,
  type TwapSchedulerOptions,
} from "./twap-scheduler";

import {
  VwapScheduler,
  type VwapSchedulerOptions,
} from "./vwap-scheduler";

export interface AlgorithmicExecutionSchedulerRegistry {
  register(
    algorithm: AlgorithmicExecutionAlgorithm,
    scheduler: AlgorithmicExecutionScheduler,
  ): void;

  unregister(
    algorithm: AlgorithmicExecutionAlgorithm,
  ): boolean;

  has(
    algorithm: AlgorithmicExecutionAlgorithm,
  ): boolean;

  get(
    algorithm: AlgorithmicExecutionAlgorithm,
  ): AlgorithmicExecutionScheduler;

  resolve(
    instruction: AlgorithmicExecutionInstruction,
  ): AlgorithmicExecutionScheduler;

  listAlgorithms():
    readonly AlgorithmicExecutionAlgorithm[];

  createSchedule(
    context: AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule;

  rebuildSchedule(
    state: AlgorithmicExecutionState,
    context: AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule;
}

export interface SchedulerRegistryOptions {
  /**
   * Prevents an existing scheduler from being replaced through register().
   */
  readonly preventReplacement?: boolean;

  /**
   * When true, all five built-in schedulers are registered automatically.
   */
  readonly registerDefaultSchedulers?: boolean;

  /**
   * Optional custom TWAP scheduler configuration.
   */
  readonly twap?: TwapSchedulerOptions;

  /**
   * Optional custom VWAP scheduler configuration.
   */
  readonly vwap?: VwapSchedulerOptions;

  /**
   * Optional custom iceberg scheduler configuration.
   */
  readonly iceberg?: IcebergSchedulerOptions;

  /**
   * Optional custom POV scheduler configuration.
   */
  readonly pov?: PovSchedulerOptions;

  /**
   * Optional custom adaptive scheduler configuration.
   */
  readonly adaptive?: AdaptiveSchedulerOptions;
}

export interface DefaultSchedulerSetOptions {
  readonly twap?: TwapSchedulerOptions;
  readonly vwap?: VwapSchedulerOptions;
  readonly iceberg?: IcebergSchedulerOptions;
  readonly pov?: PovSchedulerOptions;
  readonly adaptive?: AdaptiveSchedulerOptions;
}

export type AlgorithmicExecutionSchedulerMap =
  Readonly<
    Record<
      AlgorithmicExecutionAlgorithm,
      AlgorithmicExecutionScheduler
    >
  >;

type SchedulerRegistryEntry =
  readonly [
    AlgorithmicExecutionAlgorithm,
    AlgorithmicExecutionScheduler,
  ];

const ALGORITHM_ORDER:
  readonly AlgorithmicExecutionAlgorithm[] =
    Object.freeze([
      "TWAP",
      "VWAP",
      "ICEBERG",
      "POV",
      "ADAPTIVE",
    ]);

function assertAlgorithm(
  algorithm: AlgorithmicExecutionAlgorithm,
): void {
  if (
    !ALGORITHM_ORDER.includes(
      algorithm,
    )
  ) {
    throw new Error(
      `Unsupported algorithmic execution algorithm: ${String(
        algorithm,
      )}.`,
    );
  }
}

function assertScheduler(
  scheduler: AlgorithmicExecutionScheduler,
): void {
  if (
    scheduler === null ||
    scheduler === undefined ||
    typeof scheduler !== "object"
  ) {
    throw new Error(
      "scheduler must be an AlgorithmicExecutionScheduler object.",
    );
  }

  if (
    typeof scheduler.createSchedule !==
    "function"
  ) {
    throw new Error(
      "scheduler.createSchedule must be a function.",
    );
  }

  if (
    typeof scheduler.rebuildSchedule !==
    "function"
  ) {
    throw new Error(
      "scheduler.rebuildSchedule must be a function.",
    );
  }
}

function assertInstruction(
  instruction: AlgorithmicExecutionInstruction,
): void {
  if (
    instruction === null ||
    instruction === undefined ||
    typeof instruction !== "object"
  ) {
    throw new Error(
      "instruction must be an AlgorithmicExecutionInstruction object.",
    );
  }

  assertAlgorithm(
    instruction.algorithm,
  );
}

function assertScheduleContext(
  context: AlgorithmicExecutionScheduleContext,
): void {
  if (
    context === null ||
    context === undefined ||
    typeof context !== "object"
  ) {
    throw new Error(
      "context must be an AlgorithmicExecutionScheduleContext object.",
    );
  }

  assertInstruction(
    context.instruction,
  );

  if (
    !Number.isFinite(
      context.currentTime,
    ) ||
    context.currentTime < 0
  ) {
    throw new Error(
      "context.currentTime must be a non-negative finite number.",
    );
  }
}

function assertRebuildInputs(
  state: AlgorithmicExecutionState,
  context: AlgorithmicExecutionScheduleContext,
): void {
  if (
    state === null ||
    state === undefined ||
    typeof state !== "object"
  ) {
    throw new Error(
      "state must be an AlgorithmicExecutionState object.",
    );
  }

  assertScheduleContext(
    context,
  );

  if (
    state.executionId !==
    context.instruction.executionId
  ) {
    throw new Error(
      [
        "state.executionId must match",
        "context.instruction.executionId.",
      ].join(" "),
    );
  }

  if (
    state.instruction.algorithm !==
    context.instruction.algorithm
  ) {
    throw new Error(
      [
        "state.instruction.algorithm must match",
        "context.instruction.algorithm.",
      ].join(" "),
    );
  }
}

function createDefaultSchedulerEntries(
  options: DefaultSchedulerSetOptions,
): readonly SchedulerRegistryEntry[] {
  const entries:
    readonly SchedulerRegistryEntry[] =
      [
        [
          "TWAP",
          new TwapScheduler(
            options.twap,
          ),
        ],

        [
          "VWAP",
          new VwapScheduler(
            options.vwap,
          ),
        ],

        [
          "ICEBERG",
          new IcebergScheduler(
            options.iceberg,
          ),
        ],

        [
          "POV",
          new PovScheduler(
            options.pov,
          ),
        ],

        [
          "ADAPTIVE",
          new AdaptiveScheduler(
            options.adaptive,
          ),
        ],
      ];

  return Object.freeze(
    entries.map(
      (
        entry,
      ): SchedulerRegistryEntry =>
        Object.freeze([
          entry[0],
          entry[1],
        ]),
    ),
  );
}

export class SchedulerRegistry
implements AlgorithmicExecutionSchedulerRegistry {
  private readonly schedulers =
    new Map<
      AlgorithmicExecutionAlgorithm,
      AlgorithmicExecutionScheduler
    >();

  private readonly preventReplacement:
    boolean;

  public constructor(
    options: SchedulerRegistryOptions = {},
  ) {
    this.preventReplacement =
      options.preventReplacement ??
      false;

    const registerDefaults =
      options.registerDefaultSchedulers ??
      true;

    if (registerDefaults) {
      const entries =
        createDefaultSchedulerEntries({
          twap:
            options.twap,

          vwap:
            options.vwap,

          iceberg:
            options.iceberg,

          pov:
            options.pov,

          adaptive:
            options.adaptive,
        });

      for (
        const [
          algorithm,
          scheduler,
        ] of entries
      ) {
        this.register(
          algorithm,
          scheduler,
        );
      }
    }
  }

  public register(
    algorithm:
      AlgorithmicExecutionAlgorithm,
    scheduler:
      AlgorithmicExecutionScheduler,
  ): void {
    assertAlgorithm(
      algorithm,
    );

    assertScheduler(
      scheduler,
    );

    if (
      this.preventReplacement &&
      this.schedulers.has(
        algorithm,
      )
    ) {
      throw new Error(
        [
          "A scheduler is already registered",
          `for algorithm ${algorithm}.`,
        ].join(" "),
      );
    }

    this.schedulers.set(
      algorithm,
      scheduler,
    );
  }

  public unregister(
    algorithm:
      AlgorithmicExecutionAlgorithm,
  ): boolean {
    assertAlgorithm(
      algorithm,
    );

    return this.schedulers.delete(
      algorithm,
    );
  }

  public has(
    algorithm:
      AlgorithmicExecutionAlgorithm,
  ): boolean {
    assertAlgorithm(
      algorithm,
    );

    return this.schedulers.has(
      algorithm,
    );
  }

  public get(
    algorithm:
      AlgorithmicExecutionAlgorithm,
  ): AlgorithmicExecutionScheduler {
    assertAlgorithm(
      algorithm,
    );

    const scheduler =
      this.schedulers.get(
        algorithm,
      );

    if (
      scheduler === undefined
    ) {
      throw new Error(
        [
          "No algorithmic execution scheduler",
          `is registered for ${algorithm}.`,
        ].join(" "),
      );
    }

    return scheduler;
  }

  public resolve(
    instruction:
      AlgorithmicExecutionInstruction,
  ): AlgorithmicExecutionScheduler {
    assertInstruction(
      instruction,
    );

    return this.get(
      instruction.algorithm,
    );
  }

  public listAlgorithms():
    readonly AlgorithmicExecutionAlgorithm[] {
    const registeredAlgorithms =
      ALGORITHM_ORDER.filter(
        (
          algorithm,
        ) =>
          this.schedulers.has(
            algorithm,
          ),
      );

    return Object.freeze(
      [...registeredAlgorithms],
    );
  }

  public createSchedule(
    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule {
    assertScheduleContext(
      context,
    );

    const scheduler =
      this.resolve(
        context.instruction,
      );

    const schedule =
      scheduler.createSchedule(
        context,
      );

    this.assertScheduleResult(
      context.instruction,
      schedule,
    );

    return schedule;
  }

  public rebuildSchedule(
    state:
      AlgorithmicExecutionState,
    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule {
    assertRebuildInputs(
      state,
      context,
    );

    const scheduler =
      this.resolve(
        context.instruction,
      );

    const schedule =
      scheduler.rebuildSchedule(
        state,
        context,
      );

    this.assertScheduleResult(
      context.instruction,
      schedule,
    );

    return schedule;
  }

  public toSchedulerMap():
    ReadonlyMap<
      AlgorithmicExecutionAlgorithm,
      AlgorithmicExecutionScheduler
    > {
    return new Map(
      this.schedulers,
    );
  }

  private assertScheduleResult(
    instruction:
      AlgorithmicExecutionInstruction,
    schedule:
      AlgorithmicExecutionSchedule,
  ): void {
    if (
      schedule.executionId !==
      instruction.executionId
    ) {
      throw new Error(
        [
          "The selected scheduler returned",
          "a schedule for a different executionId.",
        ].join(" "),
      );
    }

    if (
      schedule.algorithm !==
      instruction.algorithm
    ) {
      throw new Error(
        [
          "The selected scheduler returned",
          "a schedule for a different algorithm.",
        ].join(" "),
      );
    }
  }
}

export function createSchedulerRegistry(
  options: SchedulerRegistryOptions = {},
): AlgorithmicExecutionSchedulerRegistry {
  return new SchedulerRegistry(
    options,
  );
}

export function createDefaultSchedulerMap(
  options: DefaultSchedulerSetOptions = {},
): AlgorithmicExecutionSchedulerMap {
  return Object.freeze({
    TWAP:
      new TwapScheduler(
        options.twap,
      ),

    VWAP:
      new VwapScheduler(
        options.vwap,
      ),

    ICEBERG:
      new IcebergScheduler(
        options.iceberg,
      ),

    POV:
      new PovScheduler(
        options.pov,
      ),

    ADAPTIVE:
      new AdaptiveScheduler(
        options.adaptive,
      ),
  });
}