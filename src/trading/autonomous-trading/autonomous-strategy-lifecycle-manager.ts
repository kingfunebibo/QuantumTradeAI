/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 3: Autonomous strategy lifecycle manager.
 *
 * Responsibilities:
 * - register autonomous strategies
 * - enforce deterministic lifecycle transitions
 * - maintain immutable runtime state
 * - process heartbeats and runtime metrics
 * - support pause, resume, stop, fail, recover, and archive flows
 * - expose deterministic snapshots and transition history
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousStrategyConfiguration,
  type AutonomousStrategyHealthStatus,
  type AutonomousStrategyLifecycleAction,
  type AutonomousStrategyLifecycleCommand,
  type AutonomousStrategyLifecycleState,
  type AutonomousStrategyLifecycleTransition,
  type AutonomousStrategyRuntimeState,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
  AutonomousTradingValidationError,
} from "./autonomous-trading-validator";

export interface AutonomousStrategyHeartbeat {
  readonly strategyId: string;
  readonly occurredAt: AutonomousTradingTimestamp;
  readonly healthStatus: AutonomousStrategyHealthStatus;
  readonly activePositionCount?: number;
  readonly allocatedCapital?: number;
  readonly usedCapital?: number;
  readonly realizedPnl?: number;
  readonly unrealizedPnl?: number;
  readonly drawdown?: number;
  readonly lastDecisionAt?: AutonomousTradingTimestamp;
  readonly lastSignalAt?: AutonomousTradingTimestamp;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousStrategyRuntimeUpdate {
  readonly strategyId: string;
  readonly occurredAt: AutonomousTradingTimestamp;
  readonly healthStatus?: AutonomousStrategyHealthStatus;
  readonly activePositionCount?: number;
  readonly allocatedCapital?: number;
  readonly usedCapital?: number;
  readonly realizedPnl?: number;
  readonly unrealizedPnl?: number;
  readonly drawdown?: number;
  readonly consecutiveFailureCount?: number;
  readonly consecutiveLossCount?: number;
  readonly lastDecisionAt?: AutonomousTradingTimestamp;
  readonly lastSignalAt?: AutonomousTradingTimestamp;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousStrategyLifecycleManagerOptions {
  readonly maximumTransitionHistory?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly retainArchivedStrategies?: boolean;
}

export interface AutonomousStrategyLifecycleManagerSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly configurations: readonly AutonomousStrategyConfiguration[];
  readonly runtimeStates: readonly AutonomousStrategyRuntimeState[];
  readonly transitions: readonly AutonomousStrategyLifecycleTransition[];
  readonly registeredStrategyCount: number;
  readonly runningStrategyCount: number;
  readonly pausedStrategyCount: number;
  readonly stoppedStrategyCount: number;
  readonly failedStrategyCount: number;
  readonly archivedStrategyCount: number;
}

interface ResolvedLifecycleManagerOptions {
  readonly maximumTransitionHistory: number;
  readonly heartbeatTimeoutMs: number;
  readonly retainArchivedStrategies: boolean;
}

interface MutableStrategyEntry {
  configuration: AutonomousStrategyConfiguration;
  runtimeState: AutonomousStrategyRuntimeState;
}

const DEFAULT_OPTIONS: Readonly<ResolvedLifecycleManagerOptions> =
  Object.freeze({
    maximumTransitionHistory: 10_000,
    heartbeatTimeoutMs: 60_000,
    retainArchivedStrategies: true,
  });

const TERMINAL_STATES: ReadonlySet<AutonomousStrategyLifecycleState> =
  new Set<AutonomousStrategyLifecycleState>(["ARCHIVED"]);

const ALLOWED_TRANSITIONS: Readonly<
  Record<
    AutonomousStrategyLifecycleState,
    Readonly<Partial<Record<AutonomousStrategyLifecycleAction, AutonomousStrategyLifecycleState>>>
  >
> = Object.freeze({
  DRAFT: Object.freeze({
    VALIDATE: "VALIDATING",
    FAIL: "FAILED",
    ARCHIVE: "ARCHIVED",
  }),
  VALIDATING: Object.freeze({
    REGISTER: "READY",
    FAIL: "FAILED",
    ARCHIVE: "ARCHIVED",
  }),
  READY: Object.freeze({
    SCHEDULE: "SCHEDULED",
    START: "STARTING",
    FAIL: "FAILED",
    ARCHIVE: "ARCHIVED",
  }),
  SCHEDULED: Object.freeze({
    START: "STARTING",
    STOP: "STOPPING",
    FAIL: "FAILED",
    ARCHIVE: "ARCHIVED",
  }),
  STARTING: Object.freeze({
    START: "RUNNING",
    STOP: "STOPPING",
    FAIL: "FAILED",
  }),
  RUNNING: Object.freeze({
    PAUSE: "PAUSING",
    STOP: "STOPPING",
    FAIL: "FAILED",
  }),
  PAUSING: Object.freeze({
    PAUSE: "PAUSED",
    STOP: "STOPPING",
    FAIL: "FAILED",
  }),
  PAUSED: Object.freeze({
    RESUME: "STARTING",
    STOP: "STOPPING",
    FAIL: "FAILED",
    ARCHIVE: "ARCHIVED",
  }),
  STOPPING: Object.freeze({
    STOP: "STOPPED",
    FAIL: "FAILED",
  }),
  STOPPED: Object.freeze({
    START: "STARTING",
    ARCHIVE: "ARCHIVED",
    FAIL: "FAILED",
  }),
  DEGRADED: Object.freeze({
    RECOVER: "RECOVERING",
    PAUSE: "PAUSING",
    STOP: "STOPPING",
    FAIL: "FAILED",
  }),
  RECOVERING: Object.freeze({
    RECOVER: "RUNNING",
    STOP: "STOPPING",
    FAIL: "FAILED",
  }),
  FAILED: Object.freeze({
    RECOVER: "RECOVERING",
    STOP: "STOPPED",
    ARCHIVE: "ARCHIVED",
  }),
  ARCHIVED: Object.freeze({}),
});

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const copy: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(copy);
}

function freezeConfiguration(
  configuration: AutonomousStrategyConfiguration,
): AutonomousStrategyConfiguration {
  return Object.freeze({
    ...configuration,
    identity: Object.freeze({
      ...configuration.identity,
      tags: Object.freeze([...configuration.identity.tags]),
      metadata: freezeMetadata(configuration.identity.metadata),
    }),
    universe: Object.freeze({
      ...configuration.universe,
      instruments: Object.freeze(
        configuration.universe.instruments.map((instrument) =>
          Object.freeze({
            ...instrument,
            metadata: freezeMetadata(instrument.metadata),
          }),
        ),
      ),
      timeframes: Object.freeze([...configuration.universe.timeframes]),
      includeExchanges:
        configuration.universe.includeExchanges === undefined
          ? undefined
          : Object.freeze([...configuration.universe.includeExchanges]),
      excludeExchanges:
        configuration.universe.excludeExchanges === undefined
          ? undefined
          : Object.freeze([...configuration.universe.excludeExchanges]),
      includeMarketTypes:
        configuration.universe.includeMarketTypes === undefined
          ? undefined
          : Object.freeze([...configuration.universe.includeMarketTypes]),
      metadata: freezeMetadata(configuration.universe.metadata),
    }),
    schedule: Object.freeze({
      ...configuration.schedule,
      activeDaysOfWeek:
        configuration.schedule.activeDaysOfWeek === undefined
          ? undefined
          : Object.freeze([...configuration.schedule.activeDaysOfWeek]),
      metadata: freezeMetadata(configuration.schedule.metadata),
    }),
    riskLimits: Object.freeze({
      ...configuration.riskLimits,
      metadata: freezeMetadata(configuration.riskLimits.metadata),
    }),
    capitalPolicy: Object.freeze({
      ...configuration.capitalPolicy,
      metadata: freezeMetadata(configuration.capitalPolicy.metadata),
    }),
    metadata: freezeMetadata(configuration.metadata),
  });
}

function freezeRuntimeState(
  state: AutonomousStrategyRuntimeState,
): AutonomousStrategyRuntimeState {
  return Object.freeze({
    ...state,
    metadata: freezeMetadata(state.metadata),
  });
}

function freezeTransition(
  transition: AutonomousStrategyLifecycleTransition,
): AutonomousStrategyLifecycleTransition {
  return Object.freeze({
    ...transition,
    metadata: freezeMetadata(transition.metadata),
  });
}

function assertNonNegativeFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative finite number.`);
  }
}

function assertTimestamp(
  value: AutonomousTradingTimestamp,
  fieldName: string,
): void {
  assertNonNegativeFinite(value, fieldName);
}

export class AutonomousStrategyLifecycleManager {
  private readonly strategies = new Map<string, MutableStrategyEntry>();
  private readonly transitions: AutonomousStrategyLifecycleTransition[] = [];
  private readonly validator: AutonomousTradingContractValidator;
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly options: ResolvedLifecycleManagerOptions;
  private transitionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousStrategyLifecycleManagerOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const maximumTransitionHistory =
      options.maximumTransitionHistory ??
      DEFAULT_OPTIONS.maximumTransitionHistory;
    const heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_OPTIONS.heartbeatTimeoutMs;

    if (
      !Number.isInteger(maximumTransitionHistory) ||
      maximumTransitionHistory <= 0
    ) {
      throw new RangeError(
        "maximumTransitionHistory must be a positive integer.",
      );
    }
    assertNonNegativeFinite(heartbeatTimeoutMs, "heartbeatTimeoutMs");

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      maximumTransitionHistory,
      heartbeatTimeoutMs,
      retainArchivedStrategies:
        options.retainArchivedStrategies ??
        DEFAULT_OPTIONS.retainArchivedStrategies,
    });
  }

  public register(
    configuration: AutonomousStrategyConfiguration,
    requestedBy = "system",
  ): AutonomousStrategyLifecycleTransition {
    const validation =
      this.validator.validateStrategyConfiguration(configuration);
    this.validator.assertValid(
      validation,
      "Autonomous strategy configuration is invalid.",
    );

    const strategyId = configuration.identity.strategyId;
    if (this.strategies.has(strategyId)) {
      throw new Error(`Strategy "${strategyId}" is already registered.`);
    }

    const now = this.clock.now();
    assertTimestamp(now, "clock.now()");

    const storedConfiguration = freezeConfiguration(configuration);
    const initialState = freezeRuntimeState({
      strategyId,
      strategyVersion: configuration.identity.strategyVersion,
      lifecycleState: configuration.lifecycleState,
      healthStatus: "UNKNOWN",
      consecutiveFailureCount: 0,
      consecutiveLossCount: 0,
      activePositionCount: 0,
      allocatedCapital: 0,
      usedCapital: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      drawdown: 0,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });

    this.strategies.set(strategyId, {
      configuration: storedConfiguration,
      runtimeState: initialState,
    });

    const command: AutonomousStrategyLifecycleCommand = Object.freeze({
      commandId: this.idFactory.create("lifecycle-command", now, 0),
      correlationId: this.idFactory.create("strategy-registration", now, 0),
      strategyId,
      action: "REGISTER",
      requestedAt: now,
      requestedBy,
      reason: "Strategy registered with lifecycle manager.",
      expectedState: configuration.lifecycleState,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });

    return this.recordTransition({
      command,
      fromState: configuration.lifecycleState,
      toState: configuration.lifecycleState,
      accepted: true,
      reason: "Strategy registration accepted.",
      transitionedAt: now,
    });
  }

  public execute(
    command: AutonomousStrategyLifecycleCommand,
  ): AutonomousStrategyLifecycleTransition {
    const validation = this.validator.validateLifecycleCommand(command);
    this.validator.assertValid(validation, "Lifecycle command is invalid.");

    const entry = this.requireEntry(command.strategyId);
    const currentState = entry.runtimeState.lifecycleState;
    const now = this.clock.now();
    assertTimestamp(now, "clock.now()");

    if (command.requestedAt > now) {
      return this.recordTransition({
        command,
        fromState: currentState,
        toState: currentState,
        accepted: false,
        reason: "Lifecycle command requestedAt cannot be in the future.",
        transitionedAt: now,
      });
    }

    if (
      command.expectedState !== undefined &&
      command.expectedState !== currentState
    ) {
      return this.recordTransition({
        command,
        fromState: currentState,
        toState: currentState,
        accepted: false,
        reason:
          `Expected state ${command.expectedState}, ` +
          `but strategy is currently ${currentState}.`,
        transitionedAt: now,
      });
    }

    if (TERMINAL_STATES.has(currentState)) {
      return this.recordTransition({
        command,
        fromState: currentState,
        toState: currentState,
        accepted: false,
        reason: `Strategy in terminal state ${currentState} cannot transition.`,
        transitionedAt: now,
      });
    }

    const nextState = ALLOWED_TRANSITIONS[currentState][command.action];
    if (nextState === undefined) {
      return this.recordTransition({
        command,
        fromState: currentState,
        toState: currentState,
        accepted: false,
        reason:
          `Action ${command.action} is not valid from lifecycle state ` +
          `${currentState}.`,
        transitionedAt: now,
      });
    }

    this.applyAcceptedTransition(entry, nextState, now);

    const transition = this.recordTransition({
      command,
      fromState: currentState,
      toState: nextState,
      accepted: true,
      reason:
        command.reason ??
        `Lifecycle action ${command.action} transitioned strategy ` +
          `from ${currentState} to ${nextState}.`,
      transitionedAt: now,
    });

    if (
      nextState === "ARCHIVED" &&
      !this.options.retainArchivedStrategies
    ) {
      this.strategies.delete(command.strategyId);
    }

    return transition;
  }

  public heartbeat(
    heartbeat: AutonomousStrategyHeartbeat,
  ): AutonomousStrategyRuntimeState {
    const entry = this.requireEntry(heartbeat.strategyId);
    assertTimestamp(heartbeat.occurredAt, "heartbeat.occurredAt");

    const current = entry.runtimeState;
    if (
      current.lastHeartbeatAt !== undefined &&
      heartbeat.occurredAt < current.lastHeartbeatAt
    ) {
      throw new Error(
        `Heartbeat for strategy "${heartbeat.strategyId}" is older than the ` +
          "most recently recorded heartbeat.",
      );
    }

    this.assertOptionalRuntimeValues(heartbeat);

    let lifecycleState = current.lifecycleState;
    if (
      heartbeat.healthStatus === "DEGRADED" &&
      current.lifecycleState === "RUNNING"
    ) {
      lifecycleState = "DEGRADED";
    } else if (
      heartbeat.healthStatus === "HEALTHY" &&
      current.lifecycleState === "DEGRADED"
    ) {
      lifecycleState = "RUNNING";
    }

    const next = freezeRuntimeState({
      ...current,
      lifecycleState,
      healthStatus: heartbeat.healthStatus,
      lastHeartbeatAt: heartbeat.occurredAt,
      lastDecisionAt: heartbeat.lastDecisionAt ?? current.lastDecisionAt,
      lastSignalAt: heartbeat.lastSignalAt ?? current.lastSignalAt,
      activePositionCount:
        heartbeat.activePositionCount ?? current.activePositionCount,
      allocatedCapital:
        heartbeat.allocatedCapital ?? current.allocatedCapital,
      usedCapital: heartbeat.usedCapital ?? current.usedCapital,
      realizedPnl: heartbeat.realizedPnl ?? current.realizedPnl,
      unrealizedPnl: heartbeat.unrealizedPnl ?? current.unrealizedPnl,
      drawdown: heartbeat.drawdown ?? current.drawdown,
      metadata: freezeMetadata({
        ...current.metadata,
        ...(heartbeat.metadata ?? {}),
      }),
    });

    this.assertRuntimeStateValid(next);
    entry.runtimeState = next;
    return next;
  }

  public updateRuntime(
    update: AutonomousStrategyRuntimeUpdate,
  ): AutonomousStrategyRuntimeState {
    const entry = this.requireEntry(update.strategyId);
    assertTimestamp(update.occurredAt, "update.occurredAt");
    this.assertOptionalRuntimeValues(update);

    const current = entry.runtimeState;
    const next = freezeRuntimeState({
      ...current,
      healthStatus: update.healthStatus ?? current.healthStatus,
      activePositionCount:
        update.activePositionCount ?? current.activePositionCount,
      allocatedCapital:
        update.allocatedCapital ?? current.allocatedCapital,
      usedCapital: update.usedCapital ?? current.usedCapital,
      realizedPnl: update.realizedPnl ?? current.realizedPnl,
      unrealizedPnl: update.unrealizedPnl ?? current.unrealizedPnl,
      drawdown: update.drawdown ?? current.drawdown,
      consecutiveFailureCount:
        update.consecutiveFailureCount ?? current.consecutiveFailureCount,
      consecutiveLossCount:
        update.consecutiveLossCount ?? current.consecutiveLossCount,
      lastDecisionAt: update.lastDecisionAt ?? current.lastDecisionAt,
      lastSignalAt: update.lastSignalAt ?? current.lastSignalAt,
      metadata: freezeMetadata({
        ...current.metadata,
        ...(update.metadata ?? {}),
        lastRuntimeUpdateAt: update.occurredAt,
      }),
    });

    this.assertRuntimeStateValid(next);
    entry.runtimeState = next;
    return next;
  }

  public evaluateHeartbeatTimeouts(
    evaluatedAt = this.clock.now(),
  ): readonly AutonomousStrategyRuntimeState[] {
    assertTimestamp(evaluatedAt, "evaluatedAt");
    const changed: AutonomousStrategyRuntimeState[] = [];

    for (const entry of this.strategies.values()) {
      const current = entry.runtimeState;
      if (
        current.lifecycleState !== "RUNNING" &&
        current.lifecycleState !== "DEGRADED"
      ) {
        continue;
      }

      const referenceTimestamp =
        current.lastHeartbeatAt ?? current.startedAt;
      if (referenceTimestamp === undefined) {
        continue;
      }

      if (
        evaluatedAt - referenceTimestamp >
        this.options.heartbeatTimeoutMs
      ) {
        const next = freezeRuntimeState({
          ...current,
          lifecycleState: "DEGRADED",
          healthStatus: "UNHEALTHY",
          consecutiveFailureCount: current.consecutiveFailureCount + 1,
          metadata: freezeMetadata({
            ...current.metadata,
            heartbeatTimedOutAt: evaluatedAt,
          }),
        });
        entry.runtimeState = next;
        changed.push(next);
      }
    }

    return Object.freeze(changed);
  }

  public getConfiguration(
    strategyId: string,
  ): AutonomousStrategyConfiguration | undefined {
    return this.strategies.get(strategyId)?.configuration;
  }

  public getRuntimeState(
    strategyId: string,
  ): AutonomousStrategyRuntimeState | undefined {
    return this.strategies.get(strategyId)?.runtimeState;
  }

  public getTransitionHistory(
    strategyId?: string,
  ): readonly AutonomousStrategyLifecycleTransition[] {
    const values =
      strategyId === undefined
        ? this.transitions
        : this.transitions.filter(
            (transition) => transition.strategyId === strategyId,
          );
    return Object.freeze([...values]);
  }

  public listConfigurations(): readonly AutonomousStrategyConfiguration[] {
    return Object.freeze(
      [...this.strategies.values()]
        .map((entry) => entry.configuration)
        .sort((left, right) =>
          left.identity.strategyId.localeCompare(right.identity.strategyId),
        ),
    );
  }

  public listRuntimeStates(): readonly AutonomousStrategyRuntimeState[] {
    return Object.freeze(
      [...this.strategies.values()]
        .map((entry) => entry.runtimeState)
        .sort((left, right) =>
          left.strategyId.localeCompare(right.strategyId),
        ),
    );
  }

  public snapshot(
    capturedAt = this.clock.now(),
  ): AutonomousStrategyLifecycleManagerSnapshot {
    assertTimestamp(capturedAt, "capturedAt");

    const configurations = this.listConfigurations();
    const runtimeStates = this.listRuntimeStates();
    const transitions = this.getTransitionHistory();

    const count = (state: AutonomousStrategyLifecycleState): number =>
      runtimeStates.filter(
        (runtimeState) => runtimeState.lifecycleState === state,
      ).length;

    return Object.freeze({
      capturedAt,
      configurations,
      runtimeStates,
      transitions,
      registeredStrategyCount: configurations.length,
      runningStrategyCount: count("RUNNING"),
      pausedStrategyCount: count("PAUSED"),
      stoppedStrategyCount: count("STOPPED"),
      failedStrategyCount: count("FAILED"),
      archivedStrategyCount: count("ARCHIVED"),
    });
  }

  public has(strategyId: string): boolean {
    return this.strategies.has(strategyId);
  }

  public size(): number {
    return this.strategies.size;
  }

  private requireEntry(strategyId: string): MutableStrategyEntry {
    const entry = this.strategies.get(strategyId);
    if (entry === undefined) {
      throw new Error(`Strategy "${strategyId}" is not registered.`);
    }
    return entry;
  }

  private applyAcceptedTransition(
    entry: MutableStrategyEntry,
    nextState: AutonomousStrategyLifecycleState,
    transitionedAt: AutonomousTradingTimestamp,
  ): void {
    const current = entry.runtimeState;

    const startedAt =
      nextState === "RUNNING"
        ? current.startedAt ?? transitionedAt
        : current.startedAt;
    const stoppedAt =
      nextState === "STOPPED" || nextState === "ARCHIVED"
        ? transitionedAt
        : current.stoppedAt;

    const healthStatus: AutonomousStrategyHealthStatus =
      nextState === "RUNNING"
        ? "HEALTHY"
        : nextState === "DEGRADED"
          ? "DEGRADED"
          : nextState === "FAILED"
            ? "UNHEALTHY"
            : current.healthStatus;

    const next = freezeRuntimeState({
      ...current,
      lifecycleState: nextState,
      healthStatus,
      startedAt,
      stoppedAt,
      consecutiveFailureCount:
        nextState === "FAILED"
          ? current.consecutiveFailureCount + 1
          : nextState === "RUNNING"
            ? 0
            : current.consecutiveFailureCount,
      metadata: freezeMetadata({
        ...current.metadata,
        lastLifecycleTransitionAt: transitionedAt,
      }),
    });

    this.assertRuntimeStateValid(next);
    entry.runtimeState = next;

    entry.configuration = freezeConfiguration({
      ...entry.configuration,
      lifecycleState: nextState,
      updatedAt: transitionedAt,
    });
  }

  private recordTransition(input: {
    readonly command: AutonomousStrategyLifecycleCommand;
    readonly fromState: AutonomousStrategyLifecycleState;
    readonly toState: AutonomousStrategyLifecycleState;
    readonly accepted: boolean;
    readonly reason: string;
    readonly transitionedAt: AutonomousTradingTimestamp;
  }): AutonomousStrategyLifecycleTransition {
    const transition = freezeTransition({
      transitionId: this.idFactory.create(
        "lifecycle-transition",
        input.transitionedAt,
        this.transitionSequence++,
      ),
      commandId: input.command.commandId,
      strategyId: input.command.strategyId,
      fromState: input.fromState,
      toState: input.toState,
      action: input.command.action,
      accepted: input.accepted,
      reason: input.reason,
      transitionedAt: input.transitionedAt,
      metadata: freezeMetadata(input.command.metadata),
    });

    const validation =
      this.validator.validateLifecycleTransition(transition);
    const errors = validation.issues.filter(
      (issue) => issue.severity === "ERROR",
    );

    if (errors.length > 0) {
      throw new AutonomousTradingValidationError(
        "Generated lifecycle transition is invalid.",
        errors,
      );
    }

    this.transitions.push(transition);
    if (
      this.transitions.length >
      this.options.maximumTransitionHistory
    ) {
      this.transitions.splice(
        0,
        this.transitions.length -
          this.options.maximumTransitionHistory,
      );
    }

    return transition;
  }

  private assertRuntimeStateValid(
    state: AutonomousStrategyRuntimeState,
  ): void {
    const validation =
      this.validator.validateStrategyRuntimeState(state);
    this.validator.assertValid(
      validation,
      "Generated strategy runtime state is invalid.",
    );
  }

  private assertOptionalRuntimeValues(
    input: {
      readonly activePositionCount?: number;
      readonly allocatedCapital?: number;
      readonly usedCapital?: number;
      readonly realizedPnl?: number;
      readonly unrealizedPnl?: number;
      readonly drawdown?: number;
      readonly consecutiveFailureCount?: number;
      readonly consecutiveLossCount?: number;
      readonly lastDecisionAt?: AutonomousTradingTimestamp;
      readonly lastSignalAt?: AutonomousTradingTimestamp;
    },
  ): void {
    if (
      input.activePositionCount !== undefined &&
      (!Number.isInteger(input.activePositionCount) ||
        input.activePositionCount < 0)
    ) {
      throw new RangeError(
        "activePositionCount must be a non-negative integer.",
      );
    }

    for (const [name, value] of [
      ["allocatedCapital", input.allocatedCapital],
      ["usedCapital", input.usedCapital],
    ] as const) {
      if (value !== undefined) {
        assertNonNegativeFinite(value, name);
      }
    }

    for (const [name, value] of [
      ["realizedPnl", input.realizedPnl],
      ["unrealizedPnl", input.unrealizedPnl],
    ] as const) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new RangeError(`${name} must be a finite number.`);
      }
    }

    if (
      input.drawdown !== undefined &&
      (!Number.isFinite(input.drawdown) ||
        input.drawdown < 0 ||
        input.drawdown > 1)
    ) {
      throw new RangeError("drawdown must be between 0 and 1 inclusive.");
    }

    for (const [name, value] of [
      ["consecutiveFailureCount", input.consecutiveFailureCount],
      ["consecutiveLossCount", input.consecutiveLossCount],
    ] as const) {
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < 0)
      ) {
        throw new RangeError(`${name} must be a non-negative integer.`);
      }
    }

    if (input.lastDecisionAt !== undefined) {
      assertTimestamp(input.lastDecisionAt, "lastDecisionAt");
    }
    if (input.lastSignalAt !== undefined) {
      assertTimestamp(input.lastSignalAt, "lastSignalAt");
    }
  }
}

export function createAutonomousStrategyLifecycleManager(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousStrategyLifecycleManagerOptions = {},
): AutonomousStrategyLifecycleManager {
  return new AutonomousStrategyLifecycleManager(
    clock,
    idFactory,
    validator,
    options,
  );
}