import type {
  MultiExchangeCoordinatorEvent,
  MultiExchangeCoordinatorLifecycle,
  MultiExchangeCoordinatorLifecycleSnapshot,
  MultiExchangeCoordinatorState,
} from "./coordinator-contracts";
import type {
  MultiExchangeCoordinatorEventFactory,
} from "./coordinator-events";
import type {
  MultiExchangeCoordinatorObserverRegistry,
} from "./coordinator-observers";
import type {
  MultiExchangeCoordinatorStateMachine,
} from "./coordinator-state-machine";

export interface MultiExchangeCoordinatorLifecycleOptions {
  readonly emitEvents?: boolean;
}

export class MultiExchangeCoordinatorLifecycleController
  implements MultiExchangeCoordinatorLifecycle
{
  private readonly emitEvents: boolean;

  public constructor(
    private readonly stateMachine:
      MultiExchangeCoordinatorStateMachine,
    private readonly eventFactory:
      MultiExchangeCoordinatorEventFactory,
    private readonly observers:
      MultiExchangeCoordinatorObserverRegistry,
    options: MultiExchangeCoordinatorLifecycleOptions = {},
  ) {
    this.emitEvents = options.emitEvents ?? true;
  }

  public getState(): MultiExchangeCoordinatorState {
    return this.stateMachine.getState();
  }

  public async start(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    const currentState = this.getState();

    if (currentState === "RUNNING") {
      return this.stateMachine.getSnapshot();
    }

    if (
      currentState !== "CREATED" &&
      currentState !== "PAUSED" &&
      currentState !== "STOPPED" &&
      currentState !== "FAILED"
    ) {
      throw new Error(
        `Coordinator cannot start from state ${currentState}.`,
      );
    }

    await this.transition("STARTING", "COORDINATOR_STARTING");

    return this.transition("RUNNING", "COORDINATOR_STARTED");
  }

  public async pause(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    const currentState = this.getState();

    if (currentState === "PAUSED") {
      return this.stateMachine.getSnapshot();
    }

    if (
      currentState !== "RUNNING" &&
      currentState !== "DEGRADED"
    ) {
      throw new Error(
        `Coordinator cannot pause from state ${currentState}.`,
      );
    }

    await this.transition("PAUSING", "COORDINATOR_PAUSING");

    return this.transition("PAUSED", "COORDINATOR_PAUSED");
  }

  public async resume(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    if (this.getState() !== "PAUSED") {
      throw new Error(
        `Coordinator cannot resume from state ${this.getState()}.`,
      );
    }

    await this.transition("STARTING", "COORDINATOR_STARTING");

    return this.transition("RUNNING", "COORDINATOR_RESUMED");
  }

  public async stop(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    const currentState = this.getState();

    if (currentState === "STOPPED") {
      return this.stateMachine.getSnapshot();
    }

    if (
      currentState !== "STARTING" &&
      currentState !== "RUNNING" &&
      currentState !== "DEGRADED" &&
      currentState !== "PAUSED" &&
      currentState !== "FAILED"
    ) {
      throw new Error(
        `Coordinator cannot stop from state ${currentState}.`,
      );
    }

    await this.transition("STOPPING", "COORDINATOR_STOPPING");

    return this.transition("STOPPED", "COORDINATOR_STOPPED");
  }

  public async dispose(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    const currentState = this.getState();

    if (currentState === "DISPOSED") {
      return this.stateMachine.getSnapshot();
    }

    if (
      currentState === "STARTING" ||
      currentState === "RUNNING" ||
      currentState === "DEGRADED" ||
      currentState === "PAUSING" ||
      currentState === "PAUSED" ||
      currentState === "STOPPING"
    ) {
      await this.stop();
    }

    const stateAfterStop = this.getState();

    if (
      stateAfterStop !== "CREATED" &&
      stateAfterStop !== "STOPPED" &&
      stateAfterStop !== "FAILED"
    ) {
      throw new Error(
        `Coordinator cannot dispose from state ${stateAfterStop}.`,
      );
    }

    const snapshot = await this.transition(
      "DISPOSED",
      "COORDINATOR_DISPOSED",
    );

    this.observers.clearAll();

    return snapshot;
  }

  public async markDegraded(
    reason: string,
  ): Promise<MultiExchangeCoordinatorLifecycleSnapshot> {
    if (this.getState() !== "RUNNING") {
      throw new Error(
        `Coordinator cannot enter DEGRADED from state ${this.getState()}.`,
      );
    }

    return this.transition(
      "DEGRADED",
      "COORDINATOR_DEGRADED",
      reason,
    );
  }

  public async markRecovered(): Promise<
    MultiExchangeCoordinatorLifecycleSnapshot
  > {
    if (this.getState() !== "DEGRADED") {
      throw new Error(
        `Coordinator cannot recover from state ${this.getState()}.`,
      );
    }

    return this.transition(
      "RUNNING",
      "COORDINATOR_STARTED",
    );
  }

  public async fail(
    reason: string,
  ): Promise<MultiExchangeCoordinatorLifecycleSnapshot> {
    const currentState = this.getState();

    if (
      currentState === "FAILED" ||
      currentState === "DISPOSED"
    ) {
      return this.stateMachine.getSnapshot();
    }

    return this.transition(
      "FAILED",
      "COORDINATOR_FAILED",
      reason,
    );
  }

  private async transition(
    nextState: MultiExchangeCoordinatorState,
    eventType:
      MultiExchangeCoordinatorEvent["eventType"],
    failureReason: string | null = null,
  ): Promise<MultiExchangeCoordinatorLifecycleSnapshot> {
    const transition = this.stateMachine.transitionTo(
      nextState,
      failureReason,
    );

    const snapshot = this.stateMachine.getSnapshot();

    if (this.emitEvents) {
      const event = this.eventFactory.create({
        eventType,
        payload: Object.freeze({
          previousState: transition.previousState,
          currentState: transition.currentState,
          changedAt: transition.changedAt,
          failureReason: transition.failureReason,
        }),
      });

      await this.observers.notifyEvent(event);
    }

    return snapshot;
  }
}

export function createMultiExchangeCoordinatorLifecycleController(
  stateMachine: MultiExchangeCoordinatorStateMachine,
  eventFactory: MultiExchangeCoordinatorEventFactory,
  observers: MultiExchangeCoordinatorObserverRegistry,
  options: MultiExchangeCoordinatorLifecycleOptions = {},
): MultiExchangeCoordinatorLifecycleController {
  return new MultiExchangeCoordinatorLifecycleController(
    stateMachine,
    eventFactory,
    observers,
    options,
  );
}