import type {
  CoordinatorTimestamp,
  MultiExchangeCoordinatorClock,
  MultiExchangeCoordinatorLifecycleSnapshot,
  MultiExchangeCoordinatorState,
} from "./coordinator-contracts";

export class MultiExchangeCoordinatorStateTransitionError extends Error {
  public constructor(
    public readonly currentState: MultiExchangeCoordinatorState,
    public readonly requestedState: MultiExchangeCoordinatorState,
  ) {
    super(
      `Invalid coordinator state transition from ${currentState} to ${requestedState}.`,
    );

    this.name = "MultiExchangeCoordinatorStateTransitionError";

    Object.setPrototypeOf(
      this,
      MultiExchangeCoordinatorStateTransitionError.prototype,
    );
  }
}

const ALLOWED_TRANSITIONS = {
  CREATED: ["STARTING", "DISPOSED"],
  STARTING: ["RUNNING", "FAILED", "STOPPING"],
  RUNNING: [
    "DEGRADED",
    "PAUSING",
    "STOPPING",
    "FAILED",
  ],
  DEGRADED: [
    "RUNNING",
    "PAUSING",
    "STOPPING",
    "FAILED",
  ],
  PAUSING: [
    "PAUSED",
    "RUNNING",
    "DEGRADED",
    "FAILED",
  ],
  PAUSED: ["STARTING", "STOPPING", "FAILED"],
  STOPPING: ["STOPPED", "FAILED"],
  STOPPED: ["STARTING", "DISPOSED"],
  FAILED: ["STARTING", "STOPPING", "DISPOSED"],
  DISPOSED: [],
} as const satisfies Readonly<
  Record<
    MultiExchangeCoordinatorState,
    readonly MultiExchangeCoordinatorState[]
  >
>;

export interface MultiExchangeCoordinatorStateTransition {
  readonly previousState: MultiExchangeCoordinatorState;
  readonly currentState: MultiExchangeCoordinatorState;
  readonly changedAt: CoordinatorTimestamp;
  readonly failureReason: string | null;
}

export interface MultiExchangeCoordinatorStateMachineOptions {
  readonly initialState?: MultiExchangeCoordinatorState;
  readonly initialTimestamp?: CoordinatorTimestamp;
  readonly failureReason?: string | null;
}

export class MultiExchangeCoordinatorStateMachine {
  private currentState: MultiExchangeCoordinatorState;

  private previousState: MultiExchangeCoordinatorState | null;

  private stateChangedAt: CoordinatorTimestamp;

  private startedAt: CoordinatorTimestamp | null;

  private pausedAt: CoordinatorTimestamp | null;

  private stoppedAt: CoordinatorTimestamp | null;

  private failureReason: string | null;

  public constructor(
    private readonly clock: MultiExchangeCoordinatorClock,
    options: MultiExchangeCoordinatorStateMachineOptions = {},
  ) {
    const initialState = options.initialState ?? "CREATED";
    const initialTimestamp =
      options.initialTimestamp ?? this.clock.now();

    this.assertValidTimestamp(initialTimestamp);

    this.currentState = initialState;
    this.previousState = null;
    this.stateChangedAt = initialTimestamp;

    this.startedAt =
      initialState === "RUNNING" ||
      initialState === "DEGRADED"
        ? initialTimestamp
        : null;

    this.pausedAt =
      initialState === "PAUSED"
        ? initialTimestamp
        : null;

    this.stoppedAt =
      initialState === "STOPPED"
        ? initialTimestamp
        : null;

    this.failureReason =
      initialState === "FAILED"
        ? options.failureReason ??
          "Coordinator initialized in FAILED state."
        : null;
  }

  public getState(): MultiExchangeCoordinatorState {
    return this.currentState;
  }

  public canTransitionTo(
    requestedState: MultiExchangeCoordinatorState,
  ): boolean {
    const allowedTransitions:
      readonly MultiExchangeCoordinatorState[] =
        ALLOWED_TRANSITIONS[this.currentState];

    return allowedTransitions.includes(requestedState);
  }

  public transitionTo(
    requestedState: MultiExchangeCoordinatorState,
    failureReason: string | null = null,
  ): MultiExchangeCoordinatorStateTransition {
    if (!this.canTransitionTo(requestedState)) {
      throw new MultiExchangeCoordinatorStateTransitionError(
        this.currentState,
        requestedState,
      );
    }

    const changedAt = this.clock.now();

    this.assertValidTimestamp(changedAt);

    if (changedAt < this.stateChangedAt) {
      throw new Error(
        "Coordinator state transition timestamp cannot move backwards.",
      );
    }

    const previousState = this.currentState;

    this.previousState = previousState;
    this.currentState = requestedState;
    this.stateChangedAt = changedAt;

    this.applyTransitionTimestamps(requestedState, changedAt);
    this.applyFailureReason(requestedState, failureReason);

    return Object.freeze({
      previousState,
      currentState: requestedState,
      changedAt,
      failureReason: this.failureReason,
    });
  }

  public getSnapshot(): MultiExchangeCoordinatorLifecycleSnapshot {
    return Object.freeze({
      state: this.currentState,
      previousState: this.previousState,
      stateChangedAt: this.stateChangedAt,
      startedAt: this.startedAt,
      pausedAt: this.pausedAt,
      stoppedAt: this.stoppedAt,
      failureReason: this.failureReason,
    });
  }

  private applyTransitionTimestamps(
    requestedState: MultiExchangeCoordinatorState,
    changedAt: CoordinatorTimestamp,
  ): void {
    if (
      requestedState === "RUNNING" ||
      requestedState === "DEGRADED"
    ) {
      if (this.startedAt === null) {
        this.startedAt = changedAt;
      }

      this.stoppedAt = null;
    }

    if (requestedState === "RUNNING") {
      this.pausedAt = null;
    }

    if (requestedState === "PAUSED") {
      this.pausedAt = changedAt;
    }

    if (requestedState === "STOPPED") {
      this.stoppedAt = changedAt;
    }
  }

  private applyFailureReason(
    requestedState: MultiExchangeCoordinatorState,
    failureReason: string | null,
  ): void {
    if (requestedState === "FAILED") {
      this.failureReason =
        failureReason ??
        "Coordinator entered FAILED state.";

      return;
    }

    if (requestedState === "DEGRADED") {
      this.failureReason = failureReason;

      return;
    }

    this.failureReason = null;
  }

  private assertValidTimestamp(
    timestamp: CoordinatorTimestamp,
  ): void {
    if (!Number.isFinite(timestamp)) {
      throw new Error(
        "Coordinator state timestamp must be finite.",
      );
    }

    if (!Number.isSafeInteger(timestamp)) {
      throw new Error(
        "Coordinator state timestamp must be a safe integer.",
      );
    }

    if (timestamp < 0) {
      throw new Error(
        "Coordinator state timestamp cannot be negative.",
      );
    }
  }
}

export function createMultiExchangeCoordinatorStateMachine(
  clock: MultiExchangeCoordinatorClock,
  options: MultiExchangeCoordinatorStateMachineOptions = {},
): MultiExchangeCoordinatorStateMachine {
  return new MultiExchangeCoordinatorStateMachine(
    clock,
    options,
  );
}

export function getAllowedCoordinatorStateTransitions(
  state: MultiExchangeCoordinatorState,
): readonly MultiExchangeCoordinatorState[] {
  return ALLOWED_TRANSITIONS[state];
}