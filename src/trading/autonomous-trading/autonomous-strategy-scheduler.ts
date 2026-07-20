/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 4: Autonomous strategy scheduler.
 *
 * Responsibilities:
 * - evaluate deterministic strategy schedules
 * - enforce absolute and recurring UTC activity windows
 * - enforce cooldown and maximum-runtime constraints
 * - issue lifecycle commands through the lifecycle manager
 * - support automatic start, stop, and schedule transitions
 * - expose immutable scheduler evaluations and snapshots
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousStrategyConfiguration,
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
  AutonomousStrategyLifecycleManager,
} from "./autonomous-strategy-lifecycle-manager";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export type AutonomousStrategyScheduleDecision =
  | "NO_ACTION"
  | "SCHEDULE"
  | "START"
  | "STOP"
  | "SKIP"
  | "REJECT";

export interface AutonomousStrategyScheduleEvaluation {
  readonly evaluationId: string;
  readonly strategyId: string;
  readonly evaluatedAt: AutonomousTradingTimestamp;
  readonly lifecycleState: AutonomousStrategyLifecycleState;
  readonly scheduleActive: boolean;
  readonly withinAbsoluteWindow: boolean;
  readonly withinRecurringWindow: boolean;
  readonly cooldownSatisfied: boolean;
  readonly maximumRuntimeExceeded: boolean;
  readonly decision: AutonomousStrategyScheduleDecision;
  readonly command?: AutonomousStrategyLifecycleCommand;
  readonly transition?: AutonomousStrategyLifecycleTransition;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategySchedulerOptions {
  readonly requestedBy?: string;
  readonly maximumEvaluationHistory?: number;
  readonly automaticallyScheduleReadyStrategies?: boolean;
  readonly automaticallyCompleteTransitionalStates?: boolean;
  readonly stopDisabledStrategies?: boolean;
  readonly stopOutsideScheduleWindow?: boolean;
  readonly stopAtMaximumRuntime?: boolean;
}

export interface AutonomousStrategySchedulerSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly registeredStrategyCount: number;
  readonly evaluationCount: number;
  readonly actionCount: number;
  readonly acceptedTransitionCount: number;
  readonly rejectedTransitionCount: number;
  readonly evaluations: readonly AutonomousStrategyScheduleEvaluation[];
}

interface ResolvedSchedulerOptions {
  readonly requestedBy: string;
  readonly maximumEvaluationHistory: number;
  readonly automaticallyScheduleReadyStrategies: boolean;
  readonly automaticallyCompleteTransitionalStates: boolean;
  readonly stopDisabledStrategies: boolean;
  readonly stopOutsideScheduleWindow: boolean;
  readonly stopAtMaximumRuntime: boolean;
}

interface ScheduleWindowState {
  readonly active: boolean;
  readonly withinAbsoluteWindow: boolean;
  readonly withinRecurringWindow: boolean;
  readonly reason: string;
}

interface SchedulerDecisionPlan {
  readonly decision: AutonomousStrategyScheduleDecision;
  readonly action?: AutonomousStrategyLifecycleAction;
  readonly reason: string;
}

const MINUTES_PER_DAY = 1_440;
const MILLISECONDS_PER_MINUTE = 60_000;

const DEFAULT_OPTIONS: Readonly<ResolvedSchedulerOptions> = Object.freeze({
  requestedBy: "autonomous-strategy-scheduler",
  maximumEvaluationHistory: 10_000,
  automaticallyScheduleReadyStrategies: true,
  automaticallyCompleteTransitionalStates: true,
  stopDisabledStrategies: true,
  stopOutsideScheduleWindow: true,
  stopAtMaximumRuntime: true,
});

function assertTimestamp(
  value: AutonomousTradingTimestamp,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${fieldName} must be a non-negative finite timestamp.`,
    );
  }
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const result: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    result[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(result);
}

function freezeEvaluation(
  evaluation: AutonomousStrategyScheduleEvaluation,
): AutonomousStrategyScheduleEvaluation {
  return Object.freeze({
    ...evaluation,
    command:
      evaluation.command === undefined
        ? undefined
        : Object.freeze({
            ...evaluation.command,
            metadata: freezeMetadata(evaluation.command.metadata),
          }),
    transition:
      evaluation.transition === undefined
        ? undefined
        : Object.freeze({
            ...evaluation.transition,
            metadata: freezeMetadata(evaluation.transition.metadata),
          }),
    metadata: freezeMetadata(evaluation.metadata),
  });
}

export class AutonomousStrategyScheduler {
  private readonly lifecycleManager: AutonomousStrategyLifecycleManager;
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedSchedulerOptions;
  private readonly evaluations: AutonomousStrategyScheduleEvaluation[] = [];

  private evaluationSequence = 0;
  private commandSequence = 0;
  private actionCount = 0;
  private acceptedTransitionCount = 0;
  private rejectedTransitionCount = 0;

  public constructor(
    lifecycleManager: AutonomousStrategyLifecycleManager,
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousStrategySchedulerOptions = {},
  ) {
    if (!lifecycleManager) {
      throw new TypeError("lifecycleManager is required.");
    }
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const maximumEvaluationHistory =
      options.maximumEvaluationHistory ??
      DEFAULT_OPTIONS.maximumEvaluationHistory;

    if (
      !Number.isInteger(maximumEvaluationHistory) ||
      maximumEvaluationHistory <= 0
    ) {
      throw new RangeError(
        "maximumEvaluationHistory must be a positive integer.",
      );
    }

    const requestedBy =
      options.requestedBy ?? DEFAULT_OPTIONS.requestedBy;
    if (requestedBy.trim().length === 0) {
      throw new Error("requestedBy must be a non-empty string.");
    }

    this.lifecycleManager = lifecycleManager;
    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      requestedBy,
      maximumEvaluationHistory,
      automaticallyScheduleReadyStrategies:
        options.automaticallyScheduleReadyStrategies ??
        DEFAULT_OPTIONS.automaticallyScheduleReadyStrategies,
      automaticallyCompleteTransitionalStates:
        options.automaticallyCompleteTransitionalStates ??
        DEFAULT_OPTIONS.automaticallyCompleteTransitionalStates,
      stopDisabledStrategies:
        options.stopDisabledStrategies ??
        DEFAULT_OPTIONS.stopDisabledStrategies,
      stopOutsideScheduleWindow:
        options.stopOutsideScheduleWindow ??
        DEFAULT_OPTIONS.stopOutsideScheduleWindow,
      stopAtMaximumRuntime:
        options.stopAtMaximumRuntime ??
        DEFAULT_OPTIONS.stopAtMaximumRuntime,
    });
  }

  public evaluateAll(
    evaluatedAt = this.clock.now(),
  ): readonly AutonomousStrategyScheduleEvaluation[] {
    assertTimestamp(evaluatedAt, "evaluatedAt");

    const configurations = this.lifecycleManager.listConfigurations();
    const results = configurations.map((configuration) =>
      this.evaluate(configuration.identity.strategyId, evaluatedAt),
    );

    return Object.freeze(results);
  }

  public evaluate(
    strategyId: string,
    evaluatedAt = this.clock.now(),
  ): AutonomousStrategyScheduleEvaluation {
    if (strategyId.trim().length === 0) {
      throw new Error("strategyId must be a non-empty string.");
    }
    assertTimestamp(evaluatedAt, "evaluatedAt");

    const configuration =
      this.lifecycleManager.getConfiguration(strategyId);
    const runtimeState =
      this.lifecycleManager.getRuntimeState(strategyId);

    if (configuration === undefined || runtimeState === undefined) {
      throw new Error(`Strategy "${strategyId}" is not registered.`);
    }

    const window = this.evaluateWindow(configuration, evaluatedAt);
    const cooldownSatisfied = this.isCooldownSatisfied(
      configuration,
      runtimeState,
      evaluatedAt,
    );
    const maximumRuntimeExceeded = this.isMaximumRuntimeExceeded(
      configuration,
      runtimeState,
      evaluatedAt,
    );

    const plan = this.planDecision(
      configuration,
      runtimeState,
      window,
      cooldownSatisfied,
      maximumRuntimeExceeded,
    );

    let command: AutonomousStrategyLifecycleCommand | undefined;
    let transition: AutonomousStrategyLifecycleTransition | undefined;
    let finalDecision = plan.decision;
    let reason = plan.reason;

    if (plan.action !== undefined) {
      command = this.createCommand(
        configuration,
        runtimeState,
        plan.action,
        evaluatedAt,
        plan.reason,
      );

      const commandValidation =
        this.validator.validateLifecycleCommand(command);
      this.validator.assertValid(
        commandValidation,
        "Scheduler generated an invalid lifecycle command.",
      );

      transition = this.lifecycleManager.execute(command);
      this.actionCount += 1;

      if (transition.accepted) {
        this.acceptedTransitionCount += 1;
      } else {
        this.rejectedTransitionCount += 1;
        finalDecision = "REJECT";
        reason = transition.reason;
      }
    }

    const evaluation = freezeEvaluation({
      evaluationId: this.idFactory.create(
        "strategy-schedule-evaluation",
        evaluatedAt,
        this.evaluationSequence++,
      ),
      strategyId,
      evaluatedAt,
      lifecycleState: runtimeState.lifecycleState,
      scheduleActive: window.active,
      withinAbsoluteWindow: window.withinAbsoluteWindow,
      withinRecurringWindow: window.withinRecurringWindow,
      cooldownSatisfied,
      maximumRuntimeExceeded,
      decision: finalDecision,
      command,
      transition,
      reason,
      metadata: freezeMetadata({
        controlMode: configuration.controlMode,
        priority: configuration.priority,
        scheduleEnabled: configuration.schedule.enabled,
      }),
    });

    this.recordEvaluation(evaluation);
    return evaluation;
  }

  public getEvaluationHistory(
    strategyId?: string,
  ): readonly AutonomousStrategyScheduleEvaluation[] {
    const values =
      strategyId === undefined
        ? this.evaluations
        : this.evaluations.filter(
            (evaluation) => evaluation.strategyId === strategyId,
          );

    return Object.freeze([...values]);
  }

  public clearEvaluationHistory(): void {
    this.evaluations.splice(0, this.evaluations.length);
  }

  public snapshot(
    capturedAt = this.clock.now(),
  ): AutonomousStrategySchedulerSnapshot {
    assertTimestamp(capturedAt, "capturedAt");

    return Object.freeze({
      capturedAt,
      registeredStrategyCount: this.lifecycleManager.size(),
      evaluationCount: this.evaluations.length,
      actionCount: this.actionCount,
      acceptedTransitionCount: this.acceptedTransitionCount,
      rejectedTransitionCount: this.rejectedTransitionCount,
      evaluations: this.getEvaluationHistory(),
    });
  }

  public isScheduleActive(
    strategyId: string,
    evaluatedAt = this.clock.now(),
  ): boolean {
    const configuration =
      this.lifecycleManager.getConfiguration(strategyId);
    if (configuration === undefined) {
      throw new Error(`Strategy "${strategyId}" is not registered.`);
    }

    assertTimestamp(evaluatedAt, "evaluatedAt");
    return this.evaluateWindow(configuration, evaluatedAt).active;
  }

  private evaluateWindow(
    configuration: AutonomousStrategyConfiguration,
    evaluatedAt: AutonomousTradingTimestamp,
  ): ScheduleWindowState {
    const schedule = configuration.schedule;

    if (!configuration.enabled) {
      return Object.freeze({
        active: false,
        withinAbsoluteWindow: false,
        withinRecurringWindow: false,
        reason: "Strategy configuration is disabled.",
      });
    }

    if (!schedule.enabled) {
      return Object.freeze({
        active: true,
        withinAbsoluteWindow: true,
        withinRecurringWindow: true,
        reason: "Schedule restrictions are disabled.",
      });
    }

    const afterStart =
      schedule.startAt === undefined || evaluatedAt >= schedule.startAt;
    const beforeStop =
      schedule.stopAt === undefined || evaluatedAt < schedule.stopAt;
    const withinAbsoluteWindow = afterStart && beforeStop;

    const date = new Date(evaluatedAt);
    const dayOfWeek = date.getUTCDay();
    const minuteOfDay =
      date.getUTCHours() * 60 + date.getUTCMinutes();

    const dayAllowed =
      schedule.activeDaysOfWeek === undefined ||
      schedule.activeDaysOfWeek.length === 0 ||
      schedule.activeDaysOfWeek.includes(dayOfWeek);

    const timeAllowed = this.isMinuteInsideWindow(
      minuteOfDay,
      schedule.activeStartMinuteUtc,
      schedule.activeEndMinuteUtc,
    );

    const withinRecurringWindow = dayAllowed && timeAllowed;
    const active = withinAbsoluteWindow && withinRecurringWindow;

    let reason: string;
    if (!afterStart) {
      reason = "Strategy schedule has not reached startAt.";
    } else if (!beforeStop) {
      reason = "Strategy schedule has reached stopAt.";
    } else if (!dayAllowed) {
      reason = "Current UTC day is outside the active schedule.";
    } else if (!timeAllowed) {
      reason = "Current UTC time is outside the active schedule window.";
    } else {
      reason = "Strategy schedule is active.";
    }

    return Object.freeze({
      active,
      withinAbsoluteWindow,
      withinRecurringWindow,
      reason,
    });
  }

  private isMinuteInsideWindow(
    minuteOfDay: number,
    startMinute: number | undefined,
    endMinute: number | undefined,
  ): boolean {
    if (startMinute === undefined && endMinute === undefined) {
      return true;
    }

    const start = startMinute ?? 0;
    const end = endMinute ?? MINUTES_PER_DAY;

    if (start === end) {
      return true;
    }

    if (start < end) {
      return minuteOfDay >= start && minuteOfDay < end;
    }

    return minuteOfDay >= start || minuteOfDay < end;
  }

  private isCooldownSatisfied(
    configuration: AutonomousStrategyConfiguration,
    runtimeState: AutonomousStrategyRuntimeState,
    evaluatedAt: AutonomousTradingTimestamp,
  ): boolean {
    const cooldownMs = configuration.schedule.cooldownMs;
    if (cooldownMs <= 0 || runtimeState.stoppedAt === undefined) {
      return true;
    }

    return evaluatedAt - runtimeState.stoppedAt >= cooldownMs;
  }

  private isMaximumRuntimeExceeded(
    configuration: AutonomousStrategyConfiguration,
    runtimeState: AutonomousStrategyRuntimeState,
    evaluatedAt: AutonomousTradingTimestamp,
  ): boolean {
    const maximumRuntimeMs = configuration.schedule.maximumRuntimeMs;
    if (
      maximumRuntimeMs === undefined ||
      runtimeState.startedAt === undefined
    ) {
      return false;
    }

    if (
      runtimeState.lifecycleState !== "RUNNING" &&
      runtimeState.lifecycleState !== "DEGRADED" &&
      runtimeState.lifecycleState !== "PAUSING" &&
      runtimeState.lifecycleState !== "PAUSED"
    ) {
      return false;
    }

    return evaluatedAt - runtimeState.startedAt >= maximumRuntimeMs;
  }

  private planDecision(
    configuration: AutonomousStrategyConfiguration,
    runtimeState: AutonomousStrategyRuntimeState,
    window: ScheduleWindowState,
    cooldownSatisfied: boolean,
    maximumRuntimeExceeded: boolean,
  ): SchedulerDecisionPlan {
    const state = runtimeState.lifecycleState;

    if (state === "ARCHIVED" || state === "FAILED") {
      return Object.freeze({
        decision: "SKIP",
        reason: `Strategy lifecycle state ${state} is not scheduler-managed.`,
      });
    }

    if (
      !configuration.enabled &&
      this.options.stopDisabledStrategies &&
      this.canRequestStop(state)
    ) {
      return Object.freeze({
        decision: "STOP",
        action: "STOP",
        reason: "Strategy is disabled and must be stopped.",
      });
    }

    if (
      maximumRuntimeExceeded &&
      this.options.stopAtMaximumRuntime &&
      this.canRequestStop(state)
    ) {
      return Object.freeze({
        decision: "STOP",
        action: "STOP",
        reason: "Strategy maximum runtime has been reached.",
      });
    }

    if (
      !window.active &&
      this.options.stopOutsideScheduleWindow &&
      this.canRequestStop(state)
    ) {
      return Object.freeze({
        decision: "STOP",
        action: "STOP",
        reason: window.reason,
      });
    }

    if (
      this.options.automaticallyCompleteTransitionalStates &&
      state === "STARTING" &&
      window.active
    ) {
      return Object.freeze({
        decision: "START",
        action: "START",
        reason: "Complete the deterministic STARTING to RUNNING transition.",
      });
    }

    if (
      this.options.automaticallyCompleteTransitionalStates &&
      state === "STOPPING"
    ) {
      return Object.freeze({
        decision: "STOP",
        action: "STOP",
        reason: "Complete the deterministic STOPPING to STOPPED transition.",
      });
    }

    if (
      this.options.automaticallyCompleteTransitionalStates &&
      state === "PAUSING"
    ) {
      return Object.freeze({
        decision: "NO_ACTION",
        reason:
          "PAUSING is intentionally left for the lifecycle owner to complete.",
      });
    }

    if (
      state === "READY" &&
      configuration.schedule.enabled &&
      this.options.automaticallyScheduleReadyStrategies
    ) {
      return Object.freeze({
        decision: "SCHEDULE",
        action: "SCHEDULE",
        reason: "Ready strategy is enrolled in automatic scheduling.",
      });
    }

    if (
      window.active &&
      cooldownSatisfied &&
      (state === "READY" ||
        state === "SCHEDULED" ||
        state === "STOPPED")
    ) {
      return Object.freeze({
        decision: "START",
        action: "START",
        reason: "Strategy schedule is active and cooldown is satisfied.",
      });
    }

    if (window.active && !cooldownSatisfied) {
      return Object.freeze({
        decision: "SKIP",
        reason: "Strategy cooldown period has not elapsed.",
      });
    }

    if (!window.active) {
      return Object.freeze({
        decision: "NO_ACTION",
        reason: window.reason,
      });
    }

    return Object.freeze({
      decision: "NO_ACTION",
      reason: `No scheduled lifecycle action is required from state ${state}.`,
    });
  }

  private canRequestStop(
    state: AutonomousStrategyLifecycleState,
  ): boolean {
    return (
      state === "SCHEDULED" ||
      state === "STARTING" ||
      state === "RUNNING" ||
      state === "PAUSING" ||
      state === "PAUSED" ||
      state === "DEGRADED" ||
      state === "RECOVERING"
    );
  }

  private createCommand(
    configuration: AutonomousStrategyConfiguration,
    runtimeState: AutonomousStrategyRuntimeState,
    action: AutonomousStrategyLifecycleAction,
    requestedAt: AutonomousTradingTimestamp,
    reason: string,
  ): AutonomousStrategyLifecycleCommand {
    const strategyId = configuration.identity.strategyId;
    const sequence = this.commandSequence++;

    return Object.freeze({
      commandId: this.idFactory.create(
        "strategy-scheduler-command",
        requestedAt,
        sequence,
      ),
      correlationId: this.idFactory.create(
        "strategy-schedule-cycle",
        requestedAt,
        sequence,
      ),
      strategyId,
      action,
      requestedAt,
      requestedBy: this.options.requestedBy,
      reason,
      expectedState: runtimeState.lifecycleState,
      metadata: freezeMetadata({
        scheduleEvaluationAt: requestedAt,
        scheduleEnabled: configuration.schedule.enabled,
      }),
    });
  }

  private recordEvaluation(
    evaluation: AutonomousStrategyScheduleEvaluation,
  ): void {
    this.evaluations.push(evaluation);

    if (
      this.evaluations.length >
      this.options.maximumEvaluationHistory
    ) {
      this.evaluations.splice(
        0,
        this.evaluations.length -
          this.options.maximumEvaluationHistory,
      );
    }
  }
}

export function createAutonomousStrategyScheduler(
  lifecycleManager: AutonomousStrategyLifecycleManager,
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousStrategySchedulerOptions = {},
): AutonomousStrategyScheduler {
  return new AutonomousStrategyScheduler(
    lifecycleManager,
    clock,
    idFactory,
    validator,
    options,
  );
}

export function utcMinuteOfDay(
  timestamp: AutonomousTradingTimestamp,
): number {
  assertTimestamp(timestamp, "timestamp");
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function nextUtcMinuteBoundary(
  timestamp: AutonomousTradingTimestamp,
): AutonomousTradingTimestamp {
  assertTimestamp(timestamp, "timestamp");
  return (
    Math.floor(timestamp / MILLISECONDS_PER_MINUTE + 1) *
    MILLISECONDS_PER_MINUTE
  );
}