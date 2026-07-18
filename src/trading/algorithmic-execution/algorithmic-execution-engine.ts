import {
  type AlgorithmicExecutionChildOrder,
  type AlgorithmicExecutionCompletionReason,
  type AlgorithmicExecutionFill,
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionMetadata,
  type AlgorithmicExecutionPauseReason,
  type AlgorithmicExecutionProgress,
  type AlgorithmicExecutionSchedule,
  type AlgorithmicExecutionSlice,
  type AlgorithmicExecutionState,
  type AlgorithmicExecutionStatus,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

import {
  AlgorithmicExecutionChildOrderLifecycleManager,
  type AlgorithmicExecutionChildOrderLifecycleEvent,
  type CreateAlgorithmicExecutionChildOrderInput,
  type MarkAlgorithmicExecutionChildOrderSubmittedInput,
} from "./algorithmic-execution-child-order-lifecycle-manager";

import {
  AlgorithmicExecutionProgressCalculator,
} from "./algorithmic-execution-progress-calculator";

export interface AlgorithmicExecutionEngineClock {
  now(): number;
}

export interface AlgorithmicExecutionEngineInstructionValidator {
  validate(
    instruction:
      AlgorithmicExecutionInstruction,
  ): unknown;
}

export interface AlgorithmicExecutionEngineScheduler {
  createSchedule(
    input:
      AlgorithmicExecutionInstruction,
  ): AlgorithmicExecutionSchedule;
}

export interface AlgorithmicExecutionEngineStateFactory {
  create(
    instruction:
      AlgorithmicExecutionInstruction,

    schedule:
      AlgorithmicExecutionSchedule,

    createdAt:
      number,
  ): AlgorithmicExecutionState;
}

export interface AlgorithmicExecutionEngineRepository {
  save(
    state:
      AlgorithmicExecutionState,
  ): void | Promise<void>;

  findByExecutionId(
    executionId:
      string,
  ):
    | AlgorithmicExecutionState
    | null
    | Promise<
        AlgorithmicExecutionState |
        null
      >;
}

export interface AlgorithmicExecutionEngineEventRepository {
  append(
    event:
      AlgorithmicExecutionEngineEvent,
  ): void | Promise<void>;
}

export interface AlgorithmicExecutionEngineEventPublisher {
  publish(
    event:
      AlgorithmicExecutionEngineEvent,
  ): void | Promise<void>;
}

export type AlgorithmicExecutionEngineEventType =
  | "EXECUTION_CREATED"
  | "EXECUTION_STARTED"
  | "EXECUTION_PAUSED"
  | "EXECUTION_RESUMED"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "SLICE_READY"
  | "SLICE_FILLED"
  | "SLICE_FAILED"
  | "CHILD_ORDER_CREATED"
  | "CHILD_ORDER_SUBMITTING"
  | "CHILD_ORDER_SUBMITTED"
  | "CHILD_ORDER_PARTIALLY_FILLED"
  | "CHILD_ORDER_FILLED"
  | "CHILD_ORDER_CANCELLING"
  | "CHILD_ORDER_CANCELLED"
  | "CHILD_ORDER_REJECTED"
  | "CHILD_ORDER_FAILED"
  | "FILL_RECORDED"
  | "PROGRESS_UPDATED";

export interface AlgorithmicExecutionEngineEvent {
  readonly executionId:
    string;

  readonly type:
    AlgorithmicExecutionEngineEventType;

  readonly occurredAt:
    number;

  readonly sliceId:
    string | null;

  readonly childOrderId:
    string | null;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionEngineDependencies {
  readonly validator:
    AlgorithmicExecutionEngineInstructionValidator;

  readonly scheduler:
    AlgorithmicExecutionEngineScheduler;

  readonly stateFactory:
    AlgorithmicExecutionEngineStateFactory;

  readonly repository:
    AlgorithmicExecutionEngineRepository;

  readonly childOrderLifecycleManager:
    AlgorithmicExecutionChildOrderLifecycleManager;

  readonly progressCalculator:
    AlgorithmicExecutionProgressCalculator;

  readonly clock:
    AlgorithmicExecutionEngineClock;

  readonly eventRepository?:
    AlgorithmicExecutionEngineEventRepository;

  readonly eventPublisher?:
    AlgorithmicExecutionEngineEventPublisher;
}

export interface AlgorithmicExecutionEngineOptions {
  readonly quantityTolerance?:
    number;

  readonly automaticallyCompleteExecution?:
    boolean;

  readonly automaticallyCompleteSlices?:
    boolean;
}

export interface CreateAlgorithmicExecutionInput {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  readonly occurredAt?:
    number;
}

export interface StartAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface PauseAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly occurredAt?:
    number;

  readonly reason?:
    AlgorithmicExecutionPauseReason;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface ResumeAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface CancelAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface FailAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface ActivateAlgorithmicExecutionSliceInput {
  readonly executionId:
    string;

  readonly sliceId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface CompleteAlgorithmicExecutionSliceInput {
  readonly executionId:
    string;

  readonly sliceId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface FailAlgorithmicExecutionSliceInput {
  readonly executionId:
    string;

  readonly sliceId:
    string;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface CreateChildOrderForExecutionInput
  extends Omit<
    CreateAlgorithmicExecutionChildOrderInput,
    "instruction" | "slice"
  > {
  readonly executionId:
    string;

  readonly sliceId:
    string;
}

export interface MarkExecutionChildOrderSubmittingInput {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface MarkExecutionChildOrderSubmittedInput
  extends Omit<
    MarkAlgorithmicExecutionChildOrderSubmittedInput,
    "childOrder" | "occurredAt"
  > {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly occurredAt?:
    number;
}

export interface ApplyExecutionChildOrderFillInput {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly fill:
    AlgorithmicExecutionFill;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface CancelExecutionChildOrderInput {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface RejectExecutionChildOrderInput {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface FailExecutionChildOrderInput {
  readonly executionId:
    string;

  readonly childOrderId:
    string;

  readonly failureCode:
    string;

  readonly failureMessage:
    string;

  readonly occurredAt?:
    number;

  readonly metadata?:
    AlgorithmicExecutionMetadata;
}

export interface RefreshAlgorithmicExecutionInput {
  readonly executionId:
    string;

  readonly occurredAt?:
    number;

  readonly estimatedArrivalPrice?:
    number | null;
}

export interface AlgorithmicExecutionEngineResult {
  readonly state:
    AlgorithmicExecutionState;

  readonly events:
    readonly AlgorithmicExecutionEngineEvent[];
}

function createStatusList(
  ...statuses:
    AlgorithmicExecutionStatus[]
): readonly AlgorithmicExecutionStatus[] {
  return Object.freeze([
    ...statuses,
  ]);
}

const EXECUTION_TRANSITIONS:
  Readonly<
    Record<
      AlgorithmicExecutionStatus,
      readonly AlgorithmicExecutionStatus[]
    >
  > =
  Object.freeze({
    CREATED:
      createStatusList(
        "VALIDATED",
        "SCHEDULED",
        "RUNNING",
        "CANCELLED",
        "FAILED",
      ),

    VALIDATED:
      createStatusList(
        "SCHEDULED",
        "RUNNING",
        "CANCELLED",
        "FAILED",
      ),

    SCHEDULED:
      createStatusList(
        "RUNNING",
        "CANCELLED",
        "FAILED",
      ),

    RUNNING:
      createStatusList(
        "PAUSED",
        "COMPLETED",
        "CANCELLED",
        "FAILED",
      ),

    PAUSED:
      createStatusList(
        "RUNNING",
        "CANCELLED",
        "FAILED",
      ),

    COMPLETED:
      createStatusList(),

    CANCELLED:
      createStatusList(),

    FAILED:
      createStatusList(),
  });

function assertObject(
  value:
    unknown,

  field:
    string,
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
  value:
    string,

  field:
    string,
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
  value:
    number,

  field:
    string,
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

function freezeEngineEvent(
  event:
    AlgorithmicExecutionEngineEvent,
): AlgorithmicExecutionEngineEvent {
  return Object.freeze({
    ...event,

    metadata:
      freezeAlgorithmicExecutionMetadata(
        event.metadata,
      ),
  });
}

function freezeSlice(
  slice:
    AlgorithmicExecutionSlice,
): AlgorithmicExecutionSlice {
  return Object.freeze({
    ...slice,

    childOrderIds:
      Object.freeze([
        ...slice.childOrderIds,
      ]),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        slice.metadata,
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
          freezeSlice,
        ),
      ),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        schedule.metadata,
      ),
  });
}

function freezeState(
  state:
    AlgorithmicExecutionState,
): AlgorithmicExecutionState {
  return Object.freeze({
    ...state,

    schedule:
      state.schedule === null
        ? null
        : freezeSchedule(
            state.schedule,
          ),

    childOrders:
      Object.freeze([
        ...state.childOrders,
      ]),

    fills:
      Object.freeze([
        ...state.fills,
      ]),

    metadata:
      freezeAlgorithmicExecutionMetadata(
        state.metadata,
      ),
  });
}

function isTerminalStatus(
  status:
    AlgorithmicExecutionStatus,
): boolean {
  return (
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "FAILED"
  );
}

function ensureExecutionTransition(
  currentStatus:
    AlgorithmicExecutionStatus,

  nextStatus:
    AlgorithmicExecutionStatus,
): void {
  if (
    currentStatus ===
    nextStatus
  ) {
    return;
  }

  if (
    !EXECUTION_TRANSITIONS[
      currentStatus
    ].includes(
      nextStatus,
    )
  ) {
    throw new Error(
      [
        "Invalid algorithmic execution transition:",
        `${currentStatus} -> ${nextStatus}.`,
      ].join(" "),
    );
  }
}

function replaceChildOrder(
  childOrders:
    readonly AlgorithmicExecutionChildOrder[],

  replacement:
    AlgorithmicExecutionChildOrder,
): readonly AlgorithmicExecutionChildOrder[] {
  let replaced = false;

  const nextChildOrders =
    childOrders.map(
      (
        childOrder,
      ) => {
        if (
          childOrder.childOrderId !==
          replacement.childOrderId
        ) {
          return childOrder;
        }

        replaced = true;

        return replacement;
      },
    );

  if (
    !replaced
  ) {
    throw new Error(
      [
        "Unknown child order:",
        `${replacement.childOrderId}.`,
      ].join(" "),
    );
  }

  return Object.freeze(
    nextChildOrders,
  );
}

function replaceSlice(
  schedule:
    AlgorithmicExecutionSchedule,

  replacement:
    AlgorithmicExecutionSlice,
): AlgorithmicExecutionSchedule {
  let replaced = false;

  const slices =
    schedule.slices.map(
      (
        slice,
      ) => {
        if (
          slice.sliceId !==
          replacement.sliceId
        ) {
          return slice;
        }

        replaced = true;

        return replacement;
      },
    );

  if (
    !replaced
  ) {
    throw new Error(
      [
        "Unknown execution slice:",
        `${replacement.sliceId}.`,
      ].join(" "),
    );
  }

  return freezeSchedule({
    ...schedule,

    slices:
      Object.freeze(
        slices,
      ),

    version:
      schedule.version +
      1,
  });
}

function mapLifecycleEventType(
  event:
    AlgorithmicExecutionChildOrderLifecycleEvent,
): AlgorithmicExecutionEngineEventType {
  switch (
    event.type
  ) {
    case "CHILD_ORDER_CREATED":
      return "CHILD_ORDER_CREATED";

    case "CHILD_ORDER_SUBMITTED":
      return event.payload.phase ===
        "SUBMITTING"
        ? "CHILD_ORDER_SUBMITTING"
        : "CHILD_ORDER_SUBMITTED";

    case "CHILD_ORDER_PARTIALLY_FILLED":
      return "CHILD_ORDER_PARTIALLY_FILLED";

    case "CHILD_ORDER_FILLED":
      return "CHILD_ORDER_FILLED";

    case "CHILD_ORDER_CANCELLED":
      return event.payload.phase ===
        "CANCELLING"
        ? "CHILD_ORDER_CANCELLING"
        : "CHILD_ORDER_CANCELLED";

    case "CHILD_ORDER_REJECTED":
      return "CHILD_ORDER_REJECTED";

    case "CHILD_ORDER_FAILED":
      return "CHILD_ORDER_FAILED";

    default:
      throw new Error(
        [
          "Unsupported child-order lifecycle event type:",
          `${event.type}.`,
        ].join(" "),
      );
  }
}

export class AlgorithmicExecutionEngine {
  private readonly validator:
    AlgorithmicExecutionEngineInstructionValidator;

  private readonly scheduler:
    AlgorithmicExecutionEngineScheduler;

  private readonly stateFactory:
    AlgorithmicExecutionEngineStateFactory;

  private readonly repository:
    AlgorithmicExecutionEngineRepository;

  private readonly eventRepository:
    AlgorithmicExecutionEngineEventRepository | null;

  private readonly eventPublisher:
    AlgorithmicExecutionEngineEventPublisher | null;

  private readonly childOrderLifecycleManager:
    AlgorithmicExecutionChildOrderLifecycleManager;

  private readonly progressCalculator:
    AlgorithmicExecutionProgressCalculator;

  private readonly clock:
    AlgorithmicExecutionEngineClock;

  private readonly quantityTolerance:
    number;

  private readonly automaticallyCompleteExecution:
    boolean;

  private readonly automaticallyCompleteSlices:
    boolean;

  public constructor(
    dependencies:
      AlgorithmicExecutionEngineDependencies,

    options:
      AlgorithmicExecutionEngineOptions = {},
  ) {
    assertObject(
      dependencies,
      "dependencies",
    );

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

    this.validator =
      dependencies.validator;

    this.scheduler =
      dependencies.scheduler;

    this.stateFactory =
      dependencies.stateFactory;

    this.repository =
      dependencies.repository;

    this.eventRepository =
      dependencies.eventRepository ??
      null;

    this.eventPublisher =
      dependencies.eventPublisher ??
      null;

    this.childOrderLifecycleManager =
      dependencies.childOrderLifecycleManager;

    this.progressCalculator =
      dependencies.progressCalculator;

    this.clock =
      dependencies.clock;

    this.quantityTolerance =
      quantityTolerance;

    this.automaticallyCompleteExecution =
      options.automaticallyCompleteExecution ??
      true;

    this.automaticallyCompleteSlices =
      options.automaticallyCompleteSlices ??
      true;
  }

  public async create(
    input:
      CreateAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    this.validator.validate(
      input.instruction,
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const existing =
      await this.repository
        .findByExecutionId(
          input.instruction.executionId,
        );

    if (
      existing !== null
    ) {
      throw new Error(
        [
          "Algorithmic execution already exists:",
          `${input.instruction.executionId}.`,
        ].join(" "),
      );
    }

    const schedule =
      this.scheduler.createSchedule(
        input.instruction,
      );

    let state =
      this.stateFactory.create(
        input.instruction,
        schedule,
        occurredAt,
      );

    state =
      this.withProgress(
        state,
        occurredAt,
      );

    return this.commit(
      state,
      [
        this.createEvent(
          state.executionId,
          "EXECUTION_CREATED",
          occurredAt,
          {
            algorithm:
              state.instruction.algorithm,

            targetQuantity:
              state.instruction.totalQuantity,

            scheduledSliceCount:
              schedule.slices.length,
          },
        ),
      ],
    );
  }

  public async start(
    input:
      StartAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const nextState =
      this.transitionExecution(
        state,
        "RUNNING",
        occurredAt,
        {
          startedAt:
            state.startedAt ??
            occurredAt,

          pauseReason:
            null,

          metadata:
            mergeMetadata(
              state.metadata,
              input.metadata,
            ),
        },
      );

    return this.commit(
      this.withProgress(
        nextState,
        occurredAt,
      ),
      [
        this.createEvent(
          input.executionId,
          "EXECUTION_STARTED",
          occurredAt,
          input.metadata,
        ),
      ],
    );
  }

  public async pause(
    input:
      PauseAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const pauseReason =
      input.reason ??
      "USER_REQUEST";

    const nextState =
      this.transitionExecution(
        state,
        "PAUSED",
        occurredAt,
        {
          pauseReason,

          metadata:
            mergeMetadata(
              state.metadata,
              input.metadata,
            ),
        },
      );

    return this.commit(
      this.withProgress(
        nextState,
        occurredAt,
      ),
      [
        this.createEvent(
          input.executionId,
          "EXECUTION_PAUSED",
          occurredAt,
          {
            reason:
              pauseReason,

            ...(input.metadata ?? {}),
          },
        ),
      ],
    );
  }

  public async resume(
    input:
      ResumeAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const nextState =
      this.transitionExecution(
        state,
        "RUNNING",
        occurredAt,
        {
          pauseReason:
            null,

          metadata:
            mergeMetadata(
              state.metadata,
              input.metadata,
            ),
        },
      );

    return this.commit(
      this.withProgress(
        nextState,
        occurredAt,
      ),
      [
        this.createEvent(
          input.executionId,
          "EXECUTION_RESUMED",
          occurredAt,
          input.metadata,
        ),
      ],
    );
  }

  public async cancel(
    input:
      CancelAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    let state =
      await this.requireState(
        input.executionId,
      );

    if (
      isTerminalStatus(
        state.status,
      )
    ) {
      throw new Error(
        [
          "Cannot cancel an execution in",
          `${state.status} status.`,
        ].join(" "),
      );
    }

    const events:
      AlgorithmicExecutionEngineEvent[] =
      [];

    let childOrders =
      state.childOrders;

    for (
      const childOrder of
      state.childOrders
    ) {
      if (
        !this.childOrderLifecycleManager
          .isActive(
            childOrder,
          )
      ) {
        continue;
      }

      const cancelling =
        this.childOrderLifecycleManager
          .markCancelling({
            childOrder,
            occurredAt,
            metadata:
              input.metadata,
          });

      const cancelled =
        this.childOrderLifecycleManager
          .markCancelled({
            childOrder:
              cancelling.childOrder,

            occurredAt,

            metadata:
              input.metadata,
          });

      childOrders =
        replaceChildOrder(
          childOrders,
          cancelled.childOrder,
        );

      events.push(
        this.fromLifecycleEvent(
          cancelling.event,
        ),

        this.fromLifecycleEvent(
          cancelled.event,
        ),
      );
    }

    state =
      freezeState({
        ...state,

        childOrders,

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    state =
      this.transitionExecution(
        state,
        "CANCELLED",
        occurredAt,
        {
          pauseReason:
            null,

          completionReason:
            "CANCELLED_BY_USER",

          completedAt:
            occurredAt,

          metadata:
            mergeMetadata(
              state.metadata,
              input.metadata,
            ),
        },
      );

    state =
      this.withProgress(
        state,
        occurredAt,
      );

    events.push(
      this.createEvent(
        input.executionId,
        "EXECUTION_CANCELLED",
        occurredAt,
        input.metadata,
      ),
    );

    return this.commit(
      state,
      events,
    );
  }

  public async fail(
    input:
      FailAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
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

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const nextState =
      this.transitionExecution(
        state,
        "FAILED",
        occurredAt,
        {
          pauseReason:
            null,

          completionReason:
            "EXECUTION_FAILED",

          failureCode:
            input.failureCode.trim(),

          failureMessage:
            input.failureMessage.trim(),

          completedAt:
            occurredAt,

          metadata:
            mergeMetadata(
              state.metadata,
              input.metadata,
            ),
        },
      );

    return this.commit(
      this.withProgress(
        nextState,
        occurredAt,
      ),
      [
        this.createEvent(
          input.executionId,
          "EXECUTION_FAILED",
          occurredAt,
          {
            failureCode:
              input.failureCode.trim(),

            failureMessage:
              input.failureMessage.trim(),

            ...(input.metadata ?? {}),
          },
        ),
      ],
    );
  }

  public async activateSlice(
    input:
      ActivateAlgorithmicExecutionSliceInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireRunningState(
        input.executionId,
      );

    const schedule =
      this.requireSchedule(
        state,
      );

    const slice =
      this.requireSlice(
        schedule,
        input.sliceId,
      );

    if (
      slice.status !==
      "PENDING"
    ) {
      throw new Error(
        [
          "Only a PENDING slice can become READY.",
          `Current status: ${slice.status}.`,
        ].join(" "),
      );
    }

    const updatedSlice =
      freezeSlice({
        ...slice,

        status:
          "READY",

        updatedAt:
          occurredAt,

        metadata:
          mergeMetadata(
            slice.metadata,
            input.metadata,
          ),
      });

    const nextState =
      freezeState({
        ...state,

        schedule:
          replaceSlice(
            schedule,
            updatedSlice,
          ),

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    return this.commit(
      this.withProgress(
        nextState,
        occurredAt,
      ),
      [
        this.createEvent(
          input.executionId,
          "SLICE_READY",
          occurredAt,
          input.metadata,
          input.sliceId,
        ),
      ],
    );
  }

  public async completeSlice(
    input:
      CompleteAlgorithmicExecutionSliceInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    let state =
      await this.requireState(
        input.executionId,
      );

    const schedule =
      this.requireSchedule(
        state,
      );

    const slice =
      this.requireSlice(
        schedule,
        input.sliceId,
      );

    const updatedSlice =
      freezeSlice({
        ...slice,

        status:
          "FILLED",

        filledQuantity:
          slice.targetQuantity,

        remainingQuantity:
          0,

        updatedAt:
          occurredAt,

        metadata:
          mergeMetadata(
            slice.metadata,
            input.metadata,
          ),
      });

    state =
      freezeState({
        ...state,

        schedule:
          replaceSlice(
            schedule,
            updatedSlice,
          ),

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    state =
      this.withProgress(
        state,
        occurredAt,
      );

    const events = [
      this.createEvent(
        input.executionId,
        "SLICE_FILLED",
        occurredAt,
        input.metadata,
        input.sliceId,
      ),
    ];

    state =
      this.completeExecutionWhenEligible(
        state,
        occurredAt,
        events,
      );

    return this.commit(
      state,
      events,
    );
  }

  public async failSlice(
    input:
      FailAlgorithmicExecutionSliceInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
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

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const schedule =
      this.requireSchedule(
        state,
      );

    const slice =
      this.requireSlice(
        schedule,
        input.sliceId,
      );

    const updatedSlice =
      freezeSlice({
        ...slice,

        status:
          "FAILED",

        updatedAt:
          occurredAt,

        metadata:
          mergeMetadata(
            slice.metadata,
            {
              failureCode:
                input.failureCode.trim(),

              failureMessage:
                input.failureMessage.trim(),

              ...(input.metadata ?? {}),
            },
          ),
      });

    const nextState =
      this.withProgress(
        freezeState({
          ...state,

          schedule:
            replaceSlice(
              schedule,
              updatedSlice,
            ),

          updatedAt:
            occurredAt,

          version:
            state.version +
            1,
        }),
        occurredAt,
      );

    return this.commit(
      nextState,
      [
        this.createEvent(
          input.executionId,
          "SLICE_FAILED",
          occurredAt,
          {
            failureCode:
              input.failureCode.trim(),

            failureMessage:
              input.failureMessage.trim(),

            ...(input.metadata ?? {}),
          },
          input.sliceId,
        ),
      ],
    );
  }

  public async createChildOrder(
    input:
      CreateChildOrderForExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const state =
      await this.requireRunningState(
        input.executionId,
      );

    const schedule =
      this.requireSchedule(
        state,
      );

    const slice =
      this.requireSlice(
        schedule,
        input.sliceId,
      );

    if (
      slice.status !==
      "READY" &&
      slice.status !==
      "SUBMITTING" &&
      slice.status !==
      "SUBMITTED" &&
      slice.status !==
      "PARTIALLY_FILLED"
    ) {
      throw new Error(
        [
          "Child orders require a READY, SUBMITTING,",
          "SUBMITTED, or PARTIALLY_FILLED slice.",
        ].join(" "),
      );
    }

    const result =
      this.childOrderLifecycleManager
        .create({
          ...input,

          instruction:
            state.instruction,

          slice,
        });

    const updatedSlice =
      freezeSlice({
        ...slice,

        status:
          "SUBMITTING",

        childOrderIds:
          Object.freeze([
            ...slice.childOrderIds,
            result.childOrder
              .childOrderId,
          ]),

        updatedAt:
          result.childOrder.updatedAt,
      });

    let nextState =
      freezeState({
        ...state,

        schedule:
          replaceSlice(
            schedule,
            updatedSlice,
          ),

        childOrders:
          Object.freeze([
            ...state.childOrders,
            result.childOrder,
          ]),

        updatedAt:
          result.childOrder.updatedAt,

        version:
          state.version +
          1,
      });

    nextState =
      this.withProgress(
        nextState,
        result.childOrder.updatedAt,
      );

    return this.commit(
      nextState,
      [
        this.fromLifecycleEvent(
          result.event,
        ),
      ],
    );
  }

  public async markChildOrderSubmitting(
    input:
      MarkExecutionChildOrderSubmittingInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    const result =
      this.childOrderLifecycleManager
        .markSubmitting({
          childOrder,
          occurredAt,
          metadata:
            input.metadata,
        });

    return this.commitChildOrderUpdate(
      state,
      result.childOrder,
      result.event,
      occurredAt,
    );
  }

  public async markChildOrderSubmitted(
    input:
      MarkExecutionChildOrderSubmittedInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    const result =
      this.childOrderLifecycleManager
        .markSubmitted({
          childOrder,

          exchangeOrderId:
            input.exchangeOrderId,

          submittedQuantity:
            input.submittedQuantity,

          occurredAt,

          metadata:
            input.metadata,
        });

    let nextState =
      this.updateSliceFromChildOrder(
        state,
        result.childOrder,
        occurredAt,
      );

    nextState =
      freezeState({
        ...nextState,

        childOrders:
          replaceChildOrder(
            nextState.childOrders,
            result.childOrder,
          ),

        updatedAt:
          occurredAt,

        version:
          nextState.version +
          1,
      });

    nextState =
      this.withProgress(
        nextState,
        occurredAt,
      );

    return this.commit(
      nextState,
      [
        this.fromLifecycleEvent(
          result.event,
        ),

        this.createProgressEvent(
          nextState,
          occurredAt,
        ),
      ],
    );
  }

  public async applyFill(
    input:
      ApplyExecutionChildOrderFillInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt ??
        input.fill.receivedAt,
      );

    let state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    if (
      state.fills.some(
        (
          fill,
        ) =>
          fill.fillId ===
          input.fill.fillId,
      )
    ) {
      throw new Error(
        [
          "Duplicate execution fill:",
          `${input.fill.fillId}.`,
        ].join(" "),
      );
    }

    const result =
      this.childOrderLifecycleManager
        .applyFill({
          childOrder,

          fill:
            input.fill,

          occurredAt,

          metadata:
            input.metadata,
        });

    state =
      freezeState({
        ...state,

        childOrders:
          replaceChildOrder(
            state.childOrders,
            result.childOrder,
          ),

        fills:
          Object.freeze([
            ...state.fills,
            input.fill,
          ]),

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    state =
      this.updateSliceFromChildOrder(
        state,
        result.childOrder,
        occurredAt,
      );

    state =
      this.withProgress(
        state,
        occurredAt,
      );

    const events:
      AlgorithmicExecutionEngineEvent[] =
      [
        this.fromLifecycleEvent(
          result.event,
        ),

        this.createEvent(
          input.executionId,
          "FILL_RECORDED",
          occurredAt,
          {
            fillId:
              input.fill.fillId,

            quantity:
              input.fill.quantity,

            price:
              input.fill.price,

            notional:
              input.fill.notional,
          },
          input.fill.sliceId,
          input.childOrderId,
        ),

        this.createProgressEvent(
          state,
          occurredAt,
        ),
      ];

    state =
      this.completeExecutionWhenEligible(
        state,
        occurredAt,
        events,
      );

    return this.commit(
      state,
      events,
    );
  }

  public async cancelChildOrder(
    input:
      CancelExecutionChildOrderInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    const cancelling =
      this.childOrderLifecycleManager
        .markCancelling({
          childOrder,
          occurredAt,
          metadata:
            input.metadata,
        });

    const cancelled =
      this.childOrderLifecycleManager
        .markCancelled({
          childOrder:
            cancelling.childOrder,

          occurredAt,

          metadata:
            input.metadata,
        });

    let nextState =
      freezeState({
        ...state,

        childOrders:
          replaceChildOrder(
            state.childOrders,
            cancelled.childOrder,
          ),

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    nextState =
      this.updateSliceFromChildOrder(
        nextState,
        cancelled.childOrder,
        occurredAt,
      );

    nextState =
      this.withProgress(
        nextState,
        occurredAt,
      );

    return this.commit(
      nextState,
      [
        this.fromLifecycleEvent(
          cancelling.event,
        ),

        this.fromLifecycleEvent(
          cancelled.event,
        ),

        this.createProgressEvent(
          nextState,
          occurredAt,
        ),
      ],
    );
  }

  public async rejectChildOrder(
    input:
      RejectExecutionChildOrderInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    const result =
      this.childOrderLifecycleManager
        .markRejected({
          childOrder,

          failureCode:
            input.failureCode,

          failureMessage:
            input.failureMessage,

          occurredAt,

          metadata:
            input.metadata,
        });

    return this.commitChildOrderUpdate(
      state,
      result.childOrder,
      result.event,
      occurredAt,
    );
  }

  public async failChildOrder(
    input:
      FailExecutionChildOrderInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    const state =
      await this.requireState(
        input.executionId,
      );

    const childOrder =
      this.requireChildOrder(
        state,
        input.childOrderId,
      );

    const result =
      this.childOrderLifecycleManager
        .markFailed({
          childOrder,

          failureCode:
            input.failureCode,

          failureMessage:
            input.failureMessage,

          occurredAt,

          metadata:
            input.metadata,
        });

    return this.commitChildOrderUpdate(
      state,
      result.childOrder,
      result.event,
      occurredAt,
    );
  }

  public async refresh(
    input:
      RefreshAlgorithmicExecutionInput,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    assertObject(
      input,
      "input",
    );

    const occurredAt =
      this.resolveTime(
        input.occurredAt,
      );

    let state =
      await this.requireState(
        input.executionId,
      );

    state =
      this.withProgress(
        state,
        occurredAt,
        input.estimatedArrivalPrice,
      );

    const events = [
      this.createProgressEvent(
        state,
        occurredAt,
      ),
    ];

    state =
      this.completeExecutionWhenEligible(
        state,
        occurredAt,
        events,
      );

    return this.commit(
      state,
      events,
    );
  }

  public async get(
    executionId:
      string,
  ): Promise<
    AlgorithmicExecutionState
  > {
    return this.requireState(
      executionId,
    );
  }

  public canTransition(
    currentStatus:
      AlgorithmicExecutionStatus,

    nextStatus:
      AlgorithmicExecutionStatus,
  ): boolean {
    return (
      currentStatus ===
        nextStatus ||
      EXECUTION_TRANSITIONS[
        currentStatus
      ].includes(
        nextStatus,
      )
    );
  }

  private async commitChildOrderUpdate(
    state:
      AlgorithmicExecutionState,

    childOrder:
      AlgorithmicExecutionChildOrder,

    lifecycleEvent:
      AlgorithmicExecutionChildOrderLifecycleEvent,

    occurredAt:
      number,
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    let nextState =
      freezeState({
        ...state,

        childOrders:
          replaceChildOrder(
            state.childOrders,
            childOrder,
          ),

        updatedAt:
          occurredAt,

        version:
          state.version +
          1,
      });

    nextState =
      this.updateSliceFromChildOrder(
        nextState,
        childOrder,
        occurredAt,
      );

    nextState =
      this.withProgress(
        nextState,
        occurredAt,
      );

    return this.commit(
      nextState,
      [
        this.fromLifecycleEvent(
          lifecycleEvent,
        ),

        this.createProgressEvent(
          nextState,
          occurredAt,
        ),
      ],
    );
  }

  private updateSliceFromChildOrder(
    state:
      AlgorithmicExecutionState,

    childOrder:
      AlgorithmicExecutionChildOrder,

    occurredAt:
      number,
  ): AlgorithmicExecutionState {
    const schedule =
      this.requireSchedule(
        state,
      );

    const slice =
      this.requireSlice(
        schedule,
        childOrder.sliceId,
      );

    const sliceChildOrders =
      state.childOrders.filter(
        (
          candidate,
        ) =>
          candidate.sliceId ===
          slice.sliceId,
      );

    const submittedQuantity =
      Math.min(
        slice.targetQuantity,

        sliceChildOrders.reduce(
          (
            total,
            candidate,
          ) =>
            total +
            candidate.submittedQuantity,
          0,
        ),
      );

    const filledQuantity =
      Math.min(
        slice.targetQuantity,

        sliceChildOrders.reduce(
          (
            total,
            candidate,
          ) =>
            total +
            candidate.filledQuantity,
          0,
        ),
      );

    const remainingQuantity =
      Math.max(
        0,
        slice.targetQuantity -
          filledQuantity,
      );

    const completed =
      this.automaticallyCompleteSlices &&
      remainingQuantity <=
        this.quantityTolerance;

    const hasPartialFill =
      filledQuantity >
        this.quantityTolerance &&
      !completed;

    const allOrdersTerminal =
      sliceChildOrders.length > 0 &&
      sliceChildOrders.every(
        (
          candidate,
        ) =>
          this.childOrderLifecycleManager
            .isTerminal(
              candidate,
            ),
      );

    let status =
      slice.status;

    if (
      completed
    ) {
      status =
        "FILLED";
    } else if (
      hasPartialFill
    ) {
      status =
        "PARTIALLY_FILLED";
    } else if (
      submittedQuantity >
      this.quantityTolerance
    ) {
      status =
        "SUBMITTED";
    } else if (
      allOrdersTerminal
    ) {
      status =
        "CANCELLED";
    }

    let weightedNotional = 0;

    for (
      const candidate of
      sliceChildOrders
    ) {
      if (
        candidate.averageFillPrice !==
          null &&
        candidate.filledQuantity >
          0
      ) {
        weightedNotional +=
          candidate.averageFillPrice *
          candidate.filledQuantity;
      }
    }

    const averageFillPrice =
      filledQuantity >
      this.quantityTolerance
        ? weightedNotional /
          filledQuantity
        : null;

    const updatedSlice =
      freezeSlice({
        ...slice,

        status,

        submittedQuantity,

        filledQuantity,

        remainingQuantity,

        averageFillPrice,

        updatedAt:
          occurredAt,
      });

    return freezeState({
      ...state,

      schedule:
        replaceSlice(
          schedule,
          updatedSlice,
        ),

      updatedAt:
        occurredAt,

      version:
        state.version +
        1,
    });
  }

  private completeExecutionWhenEligible(
    state:
      AlgorithmicExecutionState,

    occurredAt:
      number,

    events:
      AlgorithmicExecutionEngineEvent[],
  ): AlgorithmicExecutionState {
    if (
      !this.automaticallyCompleteExecution ||
      isTerminalStatus(
        state.status,
      ) ||
      state.progress.remainingQuantity >
        this.quantityTolerance
    ) {
      return state;
    }

    const completionReason:
      AlgorithmicExecutionCompletionReason =
      state.progress.filledQuantity >=
      state.progress.targetQuantity -
        this.quantityTolerance
        ? "TARGET_QUANTITY_FILLED"
        : "NO_REMAINING_QUANTITY";

    const completedState =
      this.transitionExecution(
        state,
        "COMPLETED",
        occurredAt,
        {
          pauseReason:
            null,

          completionReason,

          completedAt:
            occurredAt,
        },
      );

    events.push(
      this.createEvent(
        state.executionId,
        "EXECUTION_COMPLETED",
        occurredAt,
        {
          completionReason,

          filledQuantity:
            completedState.progress
              .filledQuantity,

          averageFillPrice:
            completedState.progress
              .averageFillPrice,

          filledNotional:
            completedState.progress
              .filledNotional,
        },
      ),
    );

    return completedState;
  }

  private withProgress(
    state:
      AlgorithmicExecutionState,

    occurredAt:
      number,

    estimatedArrivalPrice?:
      number | null,
  ): AlgorithmicExecutionState {
    const progress:
      AlgorithmicExecutionProgress =
      this.progressCalculator
        .calculateFromState(
          state,
          occurredAt,
          estimatedArrivalPrice,
        );

    return freezeState({
      ...state,

      progress,

      updatedAt:
        occurredAt,
    });
  }

  private transitionExecution(
    state:
      AlgorithmicExecutionState,

    nextStatus:
      AlgorithmicExecutionStatus,

    occurredAt:
      number,

    updates:
      Partial<
        AlgorithmicExecutionState
      > = {},
  ): AlgorithmicExecutionState {
    ensureExecutionTransition(
      state.status,
      nextStatus,
    );

    if (
      occurredAt <
      state.updatedAt
    ) {
      throw new Error(
        [
          "Execution transition time cannot be",
          "earlier than state.updatedAt.",
        ].join(" "),
      );
    }

    return freezeState({
      ...state,
      ...updates,

      status:
        nextStatus,

      updatedAt:
        occurredAt,

      version:
        state.version +
        1,
    });
  }

  private async requireState(
    executionId:
      string,
  ): Promise<
    AlgorithmicExecutionState
  > {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    const state =
      await this.repository
        .findByExecutionId(
          executionId,
        );

    if (
      state === null
    ) {
      throw new Error(
        [
          "Unknown algorithmic execution:",
          `${executionId}.`,
        ].join(" "),
      );
    }

    return state;
  }

  private async requireRunningState(
    executionId:
      string,
  ): Promise<
    AlgorithmicExecutionState
  > {
    const state =
      await this.requireState(
        executionId,
      );

    if (
      state.status !==
      "RUNNING"
    ) {
      throw new Error(
        [
          "Algorithmic execution must be RUNNING.",
          `Current status: ${state.status}.`,
        ].join(" "),
      );
    }

    return state;
  }

  private requireSchedule(
    state:
      AlgorithmicExecutionState,
  ): AlgorithmicExecutionSchedule {
    if (
      state.schedule === null
    ) {
      throw new Error(
        [
          "Algorithmic execution does not",
          "have a schedule.",
        ].join(" "),
      );
    }

    return state.schedule;
  }

  private requireSlice(
    schedule:
      AlgorithmicExecutionSchedule,

    sliceId:
      string,
  ): AlgorithmicExecutionSlice {
    assertNonEmptyString(
      sliceId,
      "sliceId",
    );

    const slice =
      schedule.slices.find(
        (
          candidate,
        ) =>
          candidate.sliceId ===
          sliceId,
      );

    if (
      slice === undefined
    ) {
      throw new Error(
        [
          "Unknown algorithmic execution slice:",
          `${sliceId}.`,
        ].join(" "),
      );
    }

    return slice;
  }

  private requireChildOrder(
    state:
      AlgorithmicExecutionState,

    childOrderId:
      string,
  ): AlgorithmicExecutionChildOrder {
    assertNonEmptyString(
      childOrderId,
      "childOrderId",
    );

    const childOrder =
      state.childOrders.find(
        (
          candidate,
        ) =>
          candidate.childOrderId ===
          childOrderId,
      );

    if (
      childOrder === undefined
    ) {
      throw new Error(
        [
          "Unknown algorithmic execution child order:",
          `${childOrderId}.`,
        ].join(" "),
      );
    }

    return childOrder;
  }

  private createEvent(
    executionId:
      string,

    type:
      AlgorithmicExecutionEngineEventType,

    occurredAt:
      number,

    metadata:
      AlgorithmicExecutionMetadata = {},

    sliceId:
      string | null = null,

    childOrderId:
      string | null = null,
  ): AlgorithmicExecutionEngineEvent {
    return freezeEngineEvent({
      executionId,
      type,
      occurredAt,
      sliceId,
      childOrderId,
      metadata,
    });
  }

  private createProgressEvent(
    state:
      AlgorithmicExecutionState,

    occurredAt:
      number,
  ): AlgorithmicExecutionEngineEvent {
    return this.createEvent(
      state.executionId,
      "PROGRESS_UPDATED",
      occurredAt,
      {
        filledQuantity:
          state.progress.filledQuantity,

        remainingQuantity:
          state.progress.remainingQuantity,

        completionRatio:
          state.progress.completionRatio,

        averageFillPrice:
          state.progress.averageFillPrice,

        filledNotional:
          state.progress.filledNotional,
      },
    );
  }

  private fromLifecycleEvent(
    event:
      AlgorithmicExecutionChildOrderLifecycleEvent,
  ): AlgorithmicExecutionEngineEvent {
    return this.createEvent(
      event.executionId,

      mapLifecycleEventType(
        event,
      ),

      event.occurredAt,

      event.payload,

      event.sliceId,

      event.childOrderId,
    );
  }

  private async commit(
    state:
      AlgorithmicExecutionState,

    events:
      readonly AlgorithmicExecutionEngineEvent[],
  ): Promise<
    AlgorithmicExecutionEngineResult
  > {
    const frozenState =
      freezeState(
        state,
      );

    const frozenEvents =
      Object.freeze(
        events.map(
          freezeEngineEvent,
        ),
      );

    await this.repository.save(
      frozenState,
    );

    for (
      const event of
      frozenEvents
    ) {
      if (
        this.eventRepository !==
        null
      ) {
        await this.eventRepository
          .append(
            event,
          );
      }

      if (
        this.eventPublisher !==
        null
      ) {
        await this.eventPublisher
          .publish(
            event,
          );
      }
    }

    return Object.freeze({
      state:
        frozenState,

      events:
        frozenEvents,
    });
  }

  private resolveTime(
    suppliedTime?:
      number,
  ): number {
    const occurredAt =
      suppliedTime ??
      this.clock.now();

    assertFiniteNonNegativeNumber(
      occurredAt,
      "occurredAt",
    );

    return occurredAt;
  }
}

export function createAlgorithmicExecutionEngine(
  dependencies:
    AlgorithmicExecutionEngineDependencies,

  options:
    AlgorithmicExecutionEngineOptions = {},
): AlgorithmicExecutionEngine {
  return new AlgorithmicExecutionEngine(
    dependencies,
    options,
  );
}