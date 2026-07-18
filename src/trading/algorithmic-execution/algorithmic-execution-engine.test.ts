import assert from "node:assert/strict";

import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionProgress,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  type AlgorithmicExecutionValidationResult,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

import {
  AlgorithmicExecutionChildOrderLifecycleManager,
} from "./algorithmic-execution-child-order-lifecycle-manager";

import {
  AlgorithmicExecutionProgressCalculator,
} from "./algorithmic-execution-progress-calculator";

import {
  AlgorithmicExecutionEngine,
  type AlgorithmicExecutionEngineEvent,
  type AlgorithmicExecutionEngineEventRepository,
  type AlgorithmicExecutionEngineRepository,
} from "./algorithmic-execution-engine";

const BASE_TIME =
  1_800_000_000_000;

class TestClock {
  private currentTime:
    number;

  public constructor(
    initialTime:
      number,
  ) {
    this.currentTime =
      initialTime;
  }

  public now(): number {
    return this.currentTime;
  }

  public advance(
    milliseconds:
      number,
  ): number {
    assert.ok(
      Number.isFinite(
        milliseconds,
      ),
    );

    assert.ok(
      milliseconds >= 0,
    );

    this.currentTime +=
      milliseconds;

    return this.currentTime;
  }
}

class TestStateRepository
  implements
    AlgorithmicExecutionEngineRepository
{
  private readonly states =
    new Map<
      string,
      AlgorithmicExecutionState
    >();

  public async save(
    state:
      AlgorithmicExecutionState,
  ): Promise<void> {
    this.states.set(
      state.executionId,
      state,
    );
  }

  public async findByExecutionId(
    executionId:
      string,
  ): Promise<
    AlgorithmicExecutionState |
    null
  > {
    return (
      this.states.get(
        executionId,
      ) ??
      null
    );
  }

  public size(): number {
    return this.states.size;
  }
}

class TestEventRepository
  implements
    AlgorithmicExecutionEngineEventRepository
{
  private readonly events:
    AlgorithmicExecutionEngineEvent[] =
      [];

  public async append(
    event:
      AlgorithmicExecutionEngineEvent,
  ): Promise<void> {
    this.events.push(
      event,
    );
  }

  public list():
    readonly AlgorithmicExecutionEngineEvent[] {
    return Object.freeze([
      ...this.events,
    ]);
  }

  public findByExecutionId(
    executionId:
      string,
  ):
    readonly AlgorithmicExecutionEngineEvent[] {
    return Object.freeze(
      this.events.filter(
        (
          event,
        ) =>
          event.executionId ===
          executionId,
      ),
    );
  }
}

function createInstruction(
  executionId:
    string,

  overrides:
    Partial<
      AlgorithmicExecutionInstruction
    > = {},
): AlgorithmicExecutionInstruction {
  return Object.freeze({
    executionId,

    algorithm:
      "TWAP",

    symbol:
      "BTC-USDT",

    exchangeSymbol:
      "BTC-USDT",

    side:
      "BUY",

    orderType:
      "LIMIT",

    timeInForce:
      "GTC",

    totalQuantity:
      10,

    limitPrice:
      50_000,

    startTime:
      BASE_TIME,

    endTime:
      BASE_TIME +
      60_000,

    urgency:
      "NORMAL",

    allowPartialCompletion:
      true,

    minimumChildOrderQuantity:
      1,

    maximumChildOrderQuantity:
      10,

    minimumSliceIntervalMilliseconds:
      1_000,

    maximumSliceIntervalMilliseconds:
      60_000,

    maximumActiveChildOrders:
      1,

    priceLimit:
      Object.freeze({
        minimumPrice:
          49_000,

        maximumPrice:
          51_000,
      }),

    slippageLimit:
      Object.freeze({
        maximumSlippageBps:
          25,

        referencePrice:
          50_000,
      }),

    participationLimit:
      Object.freeze({
        minimumParticipationRate:
          null,

        targetParticipationRate:
          null,

        maximumParticipationRate:
          null,
      }),

    venueConstraints:
      Object.freeze([
        Object.freeze({
          exchangeId:
            "OKX",

          accountId:
            "primary",

          enabled:
            true,

          maximumQuantity:
            null,

          maximumNotional:
            null,

          priority:
            1,

          metadata:
            freezeAlgorithmicExecutionMetadata({
              environment:
                "test",
            }),
        }),
      ]),

    createdAt:
      BASE_TIME,

    metadata:
      freezeAlgorithmicExecutionMetadata({
        test:
          true,
      }),

    ...overrides,
  });
}

function createSchedule(
  instruction:
    AlgorithmicExecutionInstruction,
): AlgorithmicExecutionSchedule {
  const slice:
    AlgorithmicExecutionSlice =
    Object.freeze({
      sliceId:
        `${instruction.executionId}-slice-1`,

      executionId:
        instruction.executionId,

      sequence:
        1,

      scheduledAt:
        instruction.startTime,

      expiresAt:
        instruction.endTime,

      targetQuantity:
        instruction.totalQuantity,

      minimumQuantity:
        instruction.minimumChildOrderQuantity,

      maximumQuantity:
        instruction.maximumChildOrderQuantity,

      status:
        "PENDING",

      submittedQuantity:
        0,

      filledQuantity:
        0,

      remainingQuantity:
        instruction.totalQuantity,

      averageFillPrice:
        null,

      childOrderIds:
        Object.freeze([]),

      createdAt:
        instruction.createdAt,

      updatedAt:
        instruction.createdAt,

      metadata:
        freezeAlgorithmicExecutionMetadata({
          scheduler:
            "TEST_TWAP",
        }),
    });

  return Object.freeze({
    scheduleId:
      `${instruction.executionId}-schedule`,

    executionId:
      instruction.executionId,

    algorithm:
      instruction.algorithm,

    startTime:
      instruction.startTime,

    endTime:
      instruction.endTime,

    targetQuantity:
      instruction.totalQuantity,

    slices:
      Object.freeze([
        slice,
      ]),

    totalScheduledQuantity:
      instruction.totalQuantity,

    createdAt:
      instruction.createdAt,

    version:
      1,

    metadata:
      freezeAlgorithmicExecutionMetadata({
        deterministic:
          true,
      }),
  });
}

function calculateProgress(
  state:
    AlgorithmicExecutionState,

  currentTime:
    number,

  estimatedArrivalPrice:
    number | null =
      null,
): AlgorithmicExecutionProgress {
  const schedule =
    state.schedule;

  const slices =
    schedule?.slices ??
    [];

  const scheduledQuantity =
    schedule
      ?.totalScheduledQuantity ??
    0;

  const submittedQuantity =
    slices.reduce(
      (
        total,
        slice,
      ) =>
        total +
        slice.submittedQuantity,
      0,
    );

  const filledQuantity =
    slices.reduce(
      (
        total,
        slice,
      ) =>
        total +
        slice.filledQuantity,
      0,
    );

  const remainingQuantity =
    Math.max(
      0,
      state.instruction
        .totalQuantity -
        filledQuantity,
    );

  const filledNotional =
    state.fills.reduce(
      (
        total,
        fill,
      ) =>
        total +
        fill.notional,
      0,
    );

  const averageFillPrice =
    filledQuantity > 0
      ? filledNotional /
        filledQuantity
      : null;

  const completionRatio =
    state.instruction
      .totalQuantity > 0
      ? Math.min(
          1,
          filledQuantity /
            state.instruction
              .totalQuantity,
        )
      : 0;

  const implementationShortfallBps =
    estimatedArrivalPrice !==
      null &&
    estimatedArrivalPrice > 0 &&
    averageFillPrice !== null
      ? (
          (
            averageFillPrice -
            estimatedArrivalPrice
          ) /
          estimatedArrivalPrice
        ) *
        10_000
      : null;

  return Object.freeze({
    executionId:
      state.executionId,

    targetQuantity:
      state.instruction
        .totalQuantity,

    scheduledQuantity,

    submittedQuantity,

    filledQuantity,

    remainingQuantity,

    completionRatio,

    elapsedMilliseconds:
      Math.max(
        0,
        currentTime -
          state.instruction
            .startTime,
      ),

    remainingMilliseconds:
      Math.max(
        0,
        state.instruction
          .endTime -
          currentTime,
      ),

    scheduledSliceCount:
      slices.length,

    completedSliceCount:
      slices.filter(
        (
          slice,
        ) =>
          slice.status ===
          "FILLED",
      ).length,

    failedSliceCount:
      slices.filter(
        (
          slice,
        ) =>
          slice.status ===
          "FAILED",
      ).length,

    activeChildOrderCount:
      state.childOrders.filter(
        (
          childOrder,
        ) =>
          childOrder.status ===
            "CREATED" ||
          childOrder.status ===
            "SUBMITTING" ||
          childOrder.status ===
            "OPEN" ||
          childOrder.status ===
            "PARTIALLY_FILLED" ||
          childOrder.status ===
            "CANCELLING",
      ).length,

    completedChildOrderCount:
      state.childOrders.filter(
        (
          childOrder,
        ) =>
          childOrder.status ===
            "FILLED" ||
          childOrder.status ===
            "CANCELLED",
      ).length,

    failedChildOrderCount:
      state.childOrders.filter(
        (
          childOrder,
        ) =>
          childOrder.status ===
            "FAILED" ||
          childOrder.status ===
            "REJECTED",
      ).length,

    averageFillPrice,

    filledNotional,

    estimatedArrivalPrice,

    implementationShortfallBps,

    updatedAt:
      currentTime,
  });
}

function createInitialState(
  instruction:
    AlgorithmicExecutionInstruction,

  schedule:
    AlgorithmicExecutionSchedule,

  createdAt:
    number,
): AlgorithmicExecutionState {
  const initialState:
    AlgorithmicExecutionState =
    Object.freeze({
      executionId:
        instruction.executionId,

      instruction,

      status:
        "SCHEDULED",

      schedule,

      childOrders:
        Object.freeze([]),

      fills:
        Object.freeze([]),

      progress:
        Object.freeze({
          executionId:
            instruction.executionId,

          targetQuantity:
            instruction.totalQuantity,

          scheduledQuantity:
            schedule
              .totalScheduledQuantity,

          submittedQuantity:
            0,

          filledQuantity:
            0,

          remainingQuantity:
            instruction.totalQuantity,

          completionRatio:
            0,

          elapsedMilliseconds:
            Math.max(
              0,
              createdAt -
                instruction.startTime,
            ),

          remainingMilliseconds:
            Math.max(
              0,
              instruction.endTime -
                createdAt,
            ),

          scheduledSliceCount:
            schedule.slices.length,

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

          estimatedArrivalPrice:
            null,

          implementationShortfallBps:
            null,

          updatedAt:
            createdAt,
        }),

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

      version:
        1,

      metadata:
        freezeAlgorithmicExecutionMetadata({
          factory:
            "TEST",
        }),
    });

  return initialState;
}

function createEngineRuntime(): {
  readonly clock:
    TestClock;

  readonly repository:
    TestStateRepository;

  readonly eventRepository:
    TestEventRepository;

  readonly engine:
    AlgorithmicExecutionEngine;
} {
  const clock =
    new TestClock(
      BASE_TIME,
    );

  const repository =
    new TestStateRepository();

  const eventRepository =
    new TestEventRepository();

  const validator = {
    validate(
      instruction:
        AlgorithmicExecutionInstruction,
    ): AlgorithmicExecutionValidationResult {
      const valid =
        instruction.executionId
          .trim().length > 0 &&
        Number.isFinite(
          instruction.totalQuantity,
        ) &&
        instruction.totalQuantity >
          0;

      return Object.freeze({
        valid,

        errors:
          valid
            ? Object.freeze([])
            : Object.freeze([
                Object.freeze({
                  field:
                    "instruction",

                  code:
                    "INVALID_INSTRUCTION",

                  message:
                    "Instruction is invalid.",
                }),
              ]),

        warnings:
          Object.freeze([]),
      });
    },
  };

  const scheduler = {
    createSchedule(
      instruction:
        AlgorithmicExecutionInstruction,
    ): AlgorithmicExecutionSchedule {
      return createSchedule(
        instruction,
      );
    },
  };

  const stateFactory = {
    create(
      instruction:
        AlgorithmicExecutionInstruction,

      schedule:
        AlgorithmicExecutionSchedule,

      createdAt:
        number,
    ): AlgorithmicExecutionState {
      return createInitialState(
        instruction,
        schedule,
        createdAt,
      );
    },
  };

  const childOrderLifecycleManager = {
    isActive(): boolean {
      return false;
    },

    isTerminal(): boolean {
      return true;
    },
  } as unknown as
    AlgorithmicExecutionChildOrderLifecycleManager;

  const progressCalculator = {
    calculateFromState(
      state:
        AlgorithmicExecutionState,

      currentTime:
        number,

      estimatedArrivalPrice?:
        number | null,
    ): AlgorithmicExecutionProgress {
      return calculateProgress(
        state,
        currentTime,
        estimatedArrivalPrice ??
          null,
      );
    },
  } as unknown as
    AlgorithmicExecutionProgressCalculator;

  const engine =
    new AlgorithmicExecutionEngine(
      {
        validator,
        scheduler,
        stateFactory,
        repository,
        eventRepository,
        childOrderLifecycleManager,
        progressCalculator,
        clock,
      },
      {
        quantityTolerance:
          1e-12,

        automaticallyCompleteExecution:
          true,

        automaticallyCompleteSlices:
          true,
      },
    );

  return {
    clock,
    repository,
    eventRepository,
    engine,
  };
}

async function testCreationAndStart():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-create-start",
    );

  const createResult =
    await runtime.engine.create({
      instruction,
      occurredAt:
        BASE_TIME,
    });

  assert.equal(
    createResult.state.executionId,
    instruction.executionId,
  );

  assert.equal(
    createResult.state.status,
    "SCHEDULED",
  );

  assert.equal(
    createResult.state.schedule
      ?.slices.length,
    1,
  );

  assert.equal(
    createResult.state.progress
      .targetQuantity,
    10,
  );

  assert.equal(
    createResult.events.length,
    1,
  );

  assert.equal(
    createResult.events[0]?.type,
    "EXECUTION_CREATED",
  );

  runtime.clock.advance(
    1_000,
  );

  const startResult =
    await runtime.engine.start({
      executionId:
        instruction.executionId,

      occurredAt:
        runtime.clock.now(),

      metadata: {
        startedBy:
          "integration-test",
      },
    });

  assert.equal(
    startResult.state.status,
    "RUNNING",
  );

  assert.equal(
    startResult.state.startedAt,
    BASE_TIME +
      1_000,
  );

  assert.equal(
    startResult.state.pauseReason,
    null,
  );

  assert.equal(
    startResult.events[0]?.type,
    "EXECUTION_STARTED",
  );

  const persistedState =
    await runtime.repository
      .findByExecutionId(
        instruction.executionId,
      );

  assert.equal(
    persistedState?.status,
    "RUNNING",
  );

  assert.equal(
    runtime.repository.size(),
    1,
  );
}

async function testPauseAndResume():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-pause-resume",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  const pauseResult =
    await runtime.engine.pause({
      executionId:
        instruction.executionId,

      occurredAt:
        runtime.clock.now(),

      reason:
        "USER_REQUEST",

      metadata: {
        testPhase:
          "pause",
      },
    });

  assert.equal(
    pauseResult.state.status,
    "PAUSED",
  );

  assert.equal(
    pauseResult.state.pauseReason,
    "USER_REQUEST",
  );

  assert.equal(
    pauseResult.events[0]?.type,
    "EXECUTION_PAUSED",
  );

  runtime.clock.advance(
    1_000,
  );

  const resumeResult =
    await runtime.engine.resume({
      executionId:
        instruction.executionId,

      occurredAt:
        runtime.clock.now(),

      metadata: {
        testPhase:
          "resume",
      },
    });

  assert.equal(
    resumeResult.state.status,
    "RUNNING",
  );

  assert.equal(
    resumeResult.state.pauseReason,
    null,
  );

  assert.equal(
    resumeResult.events[0]?.type,
    "EXECUTION_RESUMED",
  );
}

async function testSliceCompletion():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-slice-completion",
    );

  const createResult =
    await runtime.engine.create({
      instruction,
      occurredAt:
        BASE_TIME,
    });

  const sliceId =
    createResult.state.schedule
      ?.slices[0]?.sliceId;

  assert.ok(
    sliceId,
  );

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  const readyResult =
    await runtime.engine.activateSlice({
      executionId:
        instruction.executionId,

      sliceId,

      occurredAt:
        runtime.clock.now(),
    });

  assert.equal(
    readyResult.state.schedule
      ?.slices[0]?.status,
    "READY",
  );

  assert.equal(
    readyResult.events[0]?.type,
    "SLICE_READY",
  );

  runtime.clock.advance(
    1_000,
  );

  const completedResult =
    await runtime.engine.completeSlice({
      executionId:
        instruction.executionId,

      sliceId,

      occurredAt:
        runtime.clock.now(),

      metadata: {
        completionSource:
          "test",
      },
    });

  assert.equal(
    completedResult.state.schedule
      ?.slices[0]?.status,
    "FILLED",
  );

  assert.equal(
    completedResult.state.schedule
      ?.slices[0]?.filledQuantity,
    instruction.totalQuantity,
  );

  assert.equal(
    completedResult.state.schedule
      ?.slices[0]?.remainingQuantity,
    0,
  );

  assert.equal(
    completedResult.state.progress
      .filledQuantity,
    instruction.totalQuantity,
  );

  assert.equal(
    completedResult.state.progress
      .completionRatio,
    1,
  );

  assert.equal(
    completedResult.state.status,
    "COMPLETED",
  );

  assert.equal(
    completedResult.state
      .completionReason,
    "TARGET_QUANTITY_FILLED",
  );

  assert.equal(
    completedResult.state.completedAt,
    runtime.clock.now(),
  );

  assert.deepEqual(
    completedResult.events.map(
      (
        event,
      ) =>
        event.type,
    ),
    [
      "SLICE_FILLED",
      "EXECUTION_COMPLETED",
    ],
  );
}

async function testCancellation():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-cancel",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  const cancelResult =
    await runtime.engine.cancel({
      executionId:
        instruction.executionId,

      occurredAt:
        runtime.clock.now(),

      metadata: {
        cancelledBy:
          "integration-test",
      },
    });

  assert.equal(
    cancelResult.state.status,
    "CANCELLED",
  );

  assert.equal(
    cancelResult.state
      .completionReason,
    "CANCELLED_BY_USER",
  );

  assert.equal(
    cancelResult.state.completedAt,
    runtime.clock.now(),
  );

  assert.equal(
    cancelResult.events.at(-1)
      ?.type,
    "EXECUTION_CANCELLED",
  );
}

async function testFailure():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-failure",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  const failResult =
    await runtime.engine.fail({
      executionId:
        instruction.executionId,

      failureCode:
        "TEST_EXECUTION_FAILURE",

      failureMessage:
        "Deterministic execution failure.",

      occurredAt:
        runtime.clock.now(),
    });

  assert.equal(
    failResult.state.status,
    "FAILED",
  );

  assert.equal(
    failResult.state
      .completionReason,
    "EXECUTION_FAILED",
  );

  assert.equal(
    failResult.state.failureCode,
    "TEST_EXECUTION_FAILURE",
  );

  assert.equal(
    failResult.state.failureMessage,
    "Deterministic execution failure.",
  );

  assert.equal(
    failResult.events[0]?.type,
    "EXECUTION_FAILED",
  );
}

async function testSliceFailure():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-slice-failure",
    );

  const createResult =
    await runtime.engine.create({
      instruction,
      occurredAt:
        BASE_TIME,
    });

  const sliceId =
    createResult.state.schedule
      ?.slices[0]?.sliceId;

  assert.ok(
    sliceId,
  );

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  const failResult =
    await runtime.engine.failSlice({
      executionId:
        instruction.executionId,

      sliceId,

      failureCode:
        "TEST_SLICE_FAILURE",

      failureMessage:
        "Slice could not be executed.",

      occurredAt:
        runtime.clock.now(),
    });

  assert.equal(
    failResult.state.schedule
      ?.slices[0]?.status,
    "FAILED",
  );

  assert.equal(
    failResult.state.progress
      .failedSliceCount,
    1,
  );

  assert.equal(
    failResult.events[0]?.type,
    "SLICE_FAILED",
  );

  assert.equal(
    failResult.events[0]
      ?.metadata.failureCode,
    "TEST_SLICE_FAILURE",
  );
}

async function testRefresh():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-refresh",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  runtime.clock.advance(
    5_000,
  );

  const refreshResult =
    await runtime.engine.refresh({
      executionId:
        instruction.executionId,

      occurredAt:
        runtime.clock.now(),

      estimatedArrivalPrice:
        50_000,
    });

  assert.equal(
    refreshResult.state.progress
      .estimatedArrivalPrice,
    50_000,
  );

  assert.equal(
    refreshResult.state.progress
      .elapsedMilliseconds,
    5_000,
  );

  assert.equal(
    refreshResult.events[0]?.type,
    "PROGRESS_UPDATED",
  );
}

async function testDuplicateCreation():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-duplicate",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  await assert.rejects(
    async () =>
      runtime.engine.create({
        instruction,
        occurredAt:
          BASE_TIME,
      }),

    /Algorithmic execution already exists/,
  );
}

async function testInvalidTransitions():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-invalid-transition",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  assert.equal(
    runtime.engine.canTransition(
      "SCHEDULED",
      "RUNNING",
    ),
    true,
  );

  assert.equal(
    runtime.engine.canTransition(
      "COMPLETED",
      "RUNNING",
    ),
    false,
  );

  await assert.rejects(
    async () =>
      runtime.engine.pause({
        executionId:
          instruction.executionId,

        occurredAt:
          BASE_TIME +
          1_000,
      }),

    /Invalid algorithmic execution transition/,
  );
}

async function testEventPersistence():
Promise<void> {
  const runtime =
    createEngineRuntime();

  const instruction =
    createInstruction(
      "execution-events",
    );

  await runtime.engine.create({
    instruction,
    occurredAt:
      BASE_TIME,
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.start({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.pause({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),

    reason:
      "SYSTEM_RECOVERY",
  });

  runtime.clock.advance(
    1_000,
  );

  await runtime.engine.resume({
    executionId:
      instruction.executionId,

    occurredAt:
      runtime.clock.now(),
  });

  const events =
    runtime.eventRepository
      .findByExecutionId(
        instruction.executionId,
      );

  assert.deepEqual(
    events.map(
      (
        event,
      ) =>
        event.type,
    ),
    [
      "EXECUTION_CREATED",
      "EXECUTION_STARTED",
      "EXECUTION_PAUSED",
      "EXECUTION_RESUMED",
    ],
  );

  assert.equal(
    Object.isFrozen(
      events[0],
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      events[0]?.metadata,
    ),
    true,
  );
}

async function run():
Promise<void> {
  await testCreationAndStart();

  await testPauseAndResume();

  await testSliceCompletion();

  await testCancellation();

  await testFailure();

  await testSliceFailure();

  await testRefresh();

  await testDuplicateCreation();

  await testInvalidTransitions();

  await testEventPersistence();

  console.log(
    [
      "All deterministic algorithmic",
      "execution engine integration",
      "tests passed successfully.",
    ].join(" "),
  );
}

run().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Algorithmic execution engine integration test failed.",
    );

    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);