/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 13: Autonomous recovery engine.
 *
 * Responsibilities:
 * - validate and evaluate deterministic recovery requests
 * - select retry, restart, failover, containment, and escalation actions
 * - calculate bounded exponential retry backoff
 * - coordinate strategy lifecycle recovery, pause, and stop transitions
 * - execute injectable recovery action handlers
 * - maintain circuit-breaker and bounded recovery history
 * - expose immutable decisions, execution results, metrics, and snapshots
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousRecoveryAction,
  type AutonomousRecoveryDecision,
  type AutonomousRecoveryPolicy,
  type AutonomousRecoveryRequest,
  type AutonomousRecoveryTrigger,
  type AutonomousStrategyLifecycleAction,
  type AutonomousStrategyLifecycleCommand,
  type AutonomousStrategyLifecycleTransition,
  type AutonomousStrategyRuntimeState,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";
import {
  AutonomousStrategyLifecycleManager,
} from "./autonomous-strategy-lifecycle-manager";

export interface AutonomousRecoveryActionContext {
  readonly request: AutonomousRecoveryRequest;
  readonly decision: AutonomousRecoveryDecision;
  readonly runtimeState?: AutonomousStrategyRuntimeState;
  readonly startedAt: AutonomousTradingTimestamp;
  readonly deadlineAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryActionOutcome {
  readonly success: boolean;
  readonly retryable?: boolean;
  readonly message: string;
  readonly providerId?: string;
  readonly exchangeId?: string;
  readonly reducedExposure?: number;
  readonly closedPositionCount?: number;
  readonly metadata?: AutonomousTradingMetadata;
}

export type AutonomousRecoveryActionHandler = (
  context: AutonomousRecoveryActionContext,
) =>
  | AutonomousRecoveryActionOutcome
  | Promise<AutonomousRecoveryActionOutcome>;

export interface AutonomousRecoveryActionHandlers {
  readonly retry?: AutonomousRecoveryActionHandler;
  readonly restartStrategy?: AutonomousRecoveryActionHandler;
  readonly switchProvider?: AutonomousRecoveryActionHandler;
  readonly switchExchange?: AutonomousRecoveryActionHandler;
  readonly pauseStrategy?: AutonomousRecoveryActionHandler;
  readonly stopStrategy?: AutonomousRecoveryActionHandler;
  readonly reduceExposure?: AutonomousRecoveryActionHandler;
  readonly closePositions?: AutonomousRecoveryActionHandler;
  readonly escalate?: AutonomousRecoveryActionHandler;
}

export type AutonomousRecoveryExecutionStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "SKIPPED";

export interface AutonomousRecoveryExecutionResult {
  readonly executionId: string;
  readonly requestId: string;
  readonly decisionId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly action: AutonomousRecoveryAction;
  readonly status: AutonomousRecoveryExecutionStatus;
  readonly startedAt: AutonomousTradingTimestamp;
  readonly completedAt: AutonomousTradingTimestamp;
  readonly latencyMs: number;
  readonly lifecycleTransitions: readonly AutonomousStrategyLifecycleTransition[];
  readonly outcome?: AutonomousRecoveryActionOutcome;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryCircuitState {
  readonly strategyId: string;
  readonly open: boolean;
  readonly consecutiveFailureCount: number;
  readonly openedAt?: AutonomousTradingTimestamp;
  readonly lastFailureAt?: AutonomousTradingTimestamp;
  readonly lastSuccessAt?: AutonomousTradingTimestamp;
  readonly nextProbeAt?: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryEngineMetrics {
  readonly decisionCount: number;
  readonly retryDecisionCount: number;
  readonly terminalDecisionCount: number;
  readonly executionCount: number;
  readonly successfulExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly timedOutExecutionCount: number;
  readonly skippedExecutionCount: number;
  readonly circuitOpenCount: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
}

export interface AutonomousRecoveryEngineSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly decisions: readonly AutonomousRecoveryDecision[];
  readonly executions: readonly AutonomousRecoveryExecutionResult[];
  readonly circuitStates: readonly AutonomousRecoveryCircuitState[];
  readonly metrics: AutonomousRecoveryEngineMetrics;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousRecoveryHistoryQuery {
  readonly strategyId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly trigger?: AutonomousRecoveryTrigger;
  readonly action?: AutonomousRecoveryAction;
  readonly terminal?: boolean;
  readonly fromDecidedAt?: AutonomousTradingTimestamp;
  readonly toDecidedAt?: AutonomousTradingTimestamp;
  readonly limit?: number;
}

export interface AutonomousRecoveryExecutionHistoryQuery {
  readonly strategyId?: string;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly correlationId?: string;
  readonly action?: AutonomousRecoveryAction;
  readonly status?: AutonomousRecoveryExecutionStatus;
  readonly fromCompletedAt?: AutonomousTradingTimestamp;
  readonly toCompletedAt?: AutonomousTradingTimestamp;
  readonly limit?: number;
}

export interface AutonomousRecoveryEngineOptions {
  readonly handlers?: AutonomousRecoveryActionHandlers;
  readonly requestedBy?: string;
  readonly maximumHistoryEntries?: number;
  readonly maximumRequestAgeMs?: number;
  readonly executeLifecycleTransitions?: boolean;
  readonly automaticallyCompleteLifecycleTransitions?: boolean;
  readonly circuitBreakerFailureThreshold?: number;
  readonly circuitBreakerCooldownMs?: number;
  readonly failClosedWhenHandlerMissing?: boolean;
  readonly metadata?: AutonomousTradingMetadata;
}

interface ResolvedAutonomousRecoveryEngineOptions {
  readonly handlers: AutonomousRecoveryActionHandlers;
  readonly requestedBy: string;
  readonly maximumHistoryEntries: number;
  readonly maximumRequestAgeMs: number;
  readonly executeLifecycleTransitions: boolean;
  readonly automaticallyCompleteLifecycleTransitions: boolean;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerCooldownMs: number;
  readonly failClosedWhenHandlerMissing: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

interface MutableRecoveryMetrics {
  decisionCount: number;
  retryDecisionCount: number;
  terminalDecisionCount: number;
  executionCount: number;
  successfulExecutionCount: number;
  failedExecutionCount: number;
  timedOutExecutionCount: number;
  skippedExecutionCount: number;
  totalExecutionLatencyMs: number;
  maximumExecutionLatencyMs: number;
}

interface MutableCircuitState {
  strategyId: string;
  open: boolean;
  consecutiveFailureCount: number;
  openedAt?: AutonomousTradingTimestamp;
  lastFailureAt?: AutonomousTradingTimestamp;
  lastSuccessAt?: AutonomousTradingTimestamp;
  nextProbeAt?: AutonomousTradingTimestamp;
  metadata: AutonomousTradingMetadata;
}

interface RecoverySelection {
  readonly action: AutonomousRecoveryAction;
  readonly shouldRetry: boolean;
  readonly terminal: boolean;
  readonly nextRetryAt?: AutonomousTradingTimestamp;
  readonly reason: string;
}

const DEFAULT_OPTIONS = Object.freeze({
  requestedBy: "autonomous-recovery-engine",
  maximumHistoryEntries: 10_000,
  maximumRequestAgeMs: 300_000,
  executeLifecycleTransitions: true,
  automaticallyCompleteLifecycleTransitions: true,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerCooldownMs: 60_000,
  failClosedWhenHandlerMissing: true,
});


function recoveryActions(
  ...actions: AutonomousRecoveryAction[]
): readonly AutonomousRecoveryAction[] {
  return Object.freeze(actions);
}

const ACTION_PRIORITY_BY_TRIGGER: Readonly<
  Record<AutonomousRecoveryTrigger, readonly AutonomousRecoveryAction[]>
> = Object.freeze({
  HEARTBEAT_TIMEOUT: recoveryActions(
    "RESTART_STRATEGY",
    "RETRY",
    "PAUSE_STRATEGY",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  PROVIDER_FAILURE: recoveryActions(
    "SWITCH_PROVIDER",
    "RETRY",
    "RESTART_STRATEGY",
    "PAUSE_STRATEGY",
    "ESCALATE",
  ),
  EXCHANGE_FAILURE: recoveryActions(
    "SWITCH_EXCHANGE",
    "RETRY",
    "PAUSE_STRATEGY",
    "CLOSE_POSITIONS",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  EXECUTION_FAILURE: recoveryActions(
    "RETRY",
    "SWITCH_EXCHANGE",
    "PAUSE_STRATEGY",
    "REDUCE_EXPOSURE",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  RISK_BREACH: recoveryActions(
    "REDUCE_EXPOSURE",
    "CLOSE_POSITIONS",
    "PAUSE_STRATEGY",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  DATA_STALENESS: recoveryActions(
    "SWITCH_PROVIDER",
    "RETRY",
    "PAUSE_STRATEGY",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  MODEL_FAILURE: recoveryActions(
    "RESTART_STRATEGY",
    "SWITCH_PROVIDER",
    "PAUSE_STRATEGY",
    "STOP_STRATEGY",
    "ESCALATE",
  ),
  MANUAL: recoveryActions(
    "RETRY",
    "RESTART_STRATEGY",
    "PAUSE_STRATEGY",
    "STOP_STRATEGY",
    "REDUCE_EXPOSURE",
    "CLOSE_POSITIONS",
    "ESCALATE",
  ),
});

const RETRYABLE_ACTIONS: ReadonlySet<AutonomousRecoveryAction> =
  new Set<AutonomousRecoveryAction>([
    "RETRY",
    "RESTART_STRATEGY",
    "SWITCH_PROVIDER",
    "SWITCH_EXCHANGE",
  ]);

const TERMINAL_ACTIONS: ReadonlySet<AutonomousRecoveryAction> =
  new Set<AutonomousRecoveryAction>([
    "STOP_STRATEGY",
    "CLOSE_POSITIONS",
    "ESCALATE",
  ]);

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite timestamp.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
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

function freezePolicy(
  policy: AutonomousRecoveryPolicy,
): AutonomousRecoveryPolicy {
  return Object.freeze({
    ...policy,
    actions: Object.freeze([...policy.actions]),
    metadata: freezeMetadata(policy.metadata),
  });
}

function freezeRequest(
  request: AutonomousRecoveryRequest,
): AutonomousRecoveryRequest {
  return Object.freeze({
    ...request,
    policy: freezePolicy(request.policy),
    metadata: freezeMetadata(request.metadata),
  });
}

function freezeDecision(
  decision: AutonomousRecoveryDecision,
): AutonomousRecoveryDecision {
  return Object.freeze({
    ...decision,
    metadata: freezeMetadata(decision.metadata),
  });
}

function freezeOutcome(
  outcome: AutonomousRecoveryActionOutcome,
): AutonomousRecoveryActionOutcome {
  return Object.freeze({
    ...outcome,
    metadata: freezeMetadata(outcome.metadata),
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

function freezeExecution(
  result: AutonomousRecoveryExecutionResult,
): AutonomousRecoveryExecutionResult {
  return Object.freeze({
    ...result,
    lifecycleTransitions: Object.freeze(
      result.lifecycleTransitions.map(freezeTransition),
    ),
    outcome:
      result.outcome === undefined ? undefined : freezeOutcome(result.outcome),
    metadata: freezeMetadata(result.metadata),
  });
}

function freezeCircuitState(
  state: MutableCircuitState,
): AutonomousRecoveryCircuitState {
  return Object.freeze({
    ...state,
    metadata: freezeMetadata(state.metadata),
  });
}

function compareDecisions(
  left: AutonomousRecoveryDecision,
  right: AutonomousRecoveryDecision,
): number {
  return (
    left.decidedAt - right.decidedAt ||
    left.decisionId.localeCompare(right.decisionId)
  );
}

function compareExecutions(
  left: AutonomousRecoveryExecutionResult,
  right: AutonomousRecoveryExecutionResult,
): number {
  return (
    left.completedAt - right.completedAt ||
    left.executionId.localeCompare(right.executionId)
  );
}

export class AutonomousRecoveryEngine {
  private readonly lifecycleManager: AutonomousStrategyLifecycleManager;
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousRecoveryEngineOptions;
  private readonly requests = new Map<string, AutonomousRecoveryRequest>();
  private readonly decisions: AutonomousRecoveryDecision[] = [];
  private readonly executions: AutonomousRecoveryExecutionResult[] = [];
  private readonly circuitStates = new Map<string, MutableCircuitState>();
  private readonly metricsState: MutableRecoveryMetrics = {
    decisionCount: 0,
    retryDecisionCount: 0,
    terminalDecisionCount: 0,
    executionCount: 0,
    successfulExecutionCount: 0,
    failedExecutionCount: 0,
    timedOutExecutionCount: 0,
    skippedExecutionCount: 0,
    totalExecutionLatencyMs: 0,
    maximumExecutionLatencyMs: 0,
  };

  private decisionSequence = 0;
  private executionSequence = 0;
  private commandSequence = 0;

  public constructor(
    lifecycleManager: AutonomousStrategyLifecycleManager,
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousRecoveryEngineOptions = {},
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

    const maximumHistoryEntries =
      options.maximumHistoryEntries ?? DEFAULT_OPTIONS.maximumHistoryEntries;
    const maximumRequestAgeMs =
      options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs;
    const circuitBreakerFailureThreshold =
      options.circuitBreakerFailureThreshold ??
      DEFAULT_OPTIONS.circuitBreakerFailureThreshold;
    const circuitBreakerCooldownMs =
      options.circuitBreakerCooldownMs ??
      DEFAULT_OPTIONS.circuitBreakerCooldownMs;
    const requestedBy = options.requestedBy ?? DEFAULT_OPTIONS.requestedBy;

    assertPositiveInteger(maximumHistoryEntries, "maximumHistoryEntries");
    assertNonNegativeFinite(maximumRequestAgeMs, "maximumRequestAgeMs");
    assertPositiveInteger(
      circuitBreakerFailureThreshold,
      "circuitBreakerFailureThreshold",
    );
    assertNonNegativeFinite(
      circuitBreakerCooldownMs,
      "circuitBreakerCooldownMs",
    );
    assertNonEmptyString(requestedBy, "requestedBy");

    this.lifecycleManager = lifecycleManager;
    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      handlers: Object.freeze({ ...(options.handlers ?? {}) }),
      requestedBy,
      maximumHistoryEntries,
      maximumRequestAgeMs,
      executeLifecycleTransitions:
        options.executeLifecycleTransitions ??
        DEFAULT_OPTIONS.executeLifecycleTransitions,
      automaticallyCompleteLifecycleTransitions:
        options.automaticallyCompleteLifecycleTransitions ??
        DEFAULT_OPTIONS.automaticallyCompleteLifecycleTransitions,
      circuitBreakerFailureThreshold,
      circuitBreakerCooldownMs,
      failClosedWhenHandlerMissing:
        options.failClosedWhenHandlerMissing ??
        DEFAULT_OPTIONS.failClosedWhenHandlerMissing,
      metadata: freezeMetadata(options.metadata),
    });
  }

  public decide(
    request: AutonomousRecoveryRequest,
  ): AutonomousRecoveryDecision {
    const now = this.clock.now();
    assertTimestamp(now, "clock.now()");

    const validation = this.validator.validateRecoveryRequest(request);
    this.validator.assertValid(validation, "Recovery request is invalid.");
    this.validateRequestSemantics(request, now);

    if (this.requests.has(request.requestId)) {
      throw new Error(
        `Recovery request '${request.requestId}' has already been evaluated.`,
      );
    }

    const storedRequest = freezeRequest(request);
    this.requests.set(request.requestId, storedRequest);

    const circuit = this.getOrCreateCircuitState(request.strategyId);
    this.refreshCircuit(circuit, now);
    const selection = this.selectRecovery(request, circuit, now);

    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "autonomous-recovery-decision",
        now,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      strategyId: request.strategyId,
      selectedAction: selection.action,
      shouldRetry: selection.shouldRetry,
      nextRetryAt: selection.nextRetryAt,
      terminal: selection.terminal,
      reason: selection.reason,
      decidedAt: now,
      metadata: freezeMetadata({
        trigger: request.trigger,
        failureCode: request.failureCode,
        attempt: request.attempt,
        circuitOpen: circuit.open,
        ...request.metadata,
      }),
    });

    const decisionValidation =
      this.validator.validateRecoveryDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated recovery decision is invalid.",
    );

    this.recordDecision(decision);
    return decision;
  }

  public async recover(
    request: AutonomousRecoveryRequest,
  ): Promise<AutonomousRecoveryExecutionResult> {
    const decision = this.decide(request);
    return this.execute(decision);
  }

  public async execute(
    decision: AutonomousRecoveryDecision,
  ): Promise<AutonomousRecoveryExecutionResult> {
    const validation = this.validator.validateRecoveryDecision(decision);
    this.validator.assertValid(validation, "Recovery decision is invalid.");

    const request = this.requests.get(decision.requestId);
    if (request === undefined) {
      throw new Error(
        `Recovery request '${decision.requestId}' is not registered.`,
      );
    }
    if (
      request.strategyId !== decision.strategyId ||
      request.correlationId !== decision.correlationId
    ) {
      throw new Error(
        "Recovery decision does not match its registered request.",
      );
    }

    const startedAt = this.clock.now();
    assertTimestamp(startedAt, "clock.now()");
    const lifecycleTransitions: AutonomousStrategyLifecycleTransition[] = [];
    this.metricsState.executionCount += 1;

    if (decision.shouldRetry && decision.nextRetryAt !== undefined) {
      if (startedAt < decision.nextRetryAt) {
        return this.recordExecution({
          request,
          decision,
          status: "SKIPPED",
          startedAt,
          completedAt: startedAt,
          lifecycleTransitions,
          reason:
            `Recovery retry is not eligible until ${decision.nextRetryAt}.`,
        });
      }
    }

    const circuit = this.getOrCreateCircuitState(decision.strategyId);
    this.refreshCircuit(circuit, startedAt);
    if (circuit.open && circuit.nextProbeAt !== undefined) {
      return this.recordExecution({
        request,
        decision,
        status: "SKIPPED",
        startedAt,
        completedAt: startedAt,
        lifecycleTransitions,
        reason:
          `Recovery circuit is open until ${circuit.nextProbeAt}.`,
      });
    }

    const deadlineAt = startedAt + request.policy.recoveryTimeoutMs;

    try {
      if (this.options.executeLifecycleTransitions) {
        lifecycleTransitions.push(
          ...this.executePreActionLifecycleTransitions(
            decision,
            startedAt,
          ),
        );
      }

      const handler = this.handlerFor(decision.selectedAction);
      let outcome: AutonomousRecoveryActionOutcome;

      if (handler === undefined) {
        if (this.isLifecycleOnlyAction(decision.selectedAction)) {
          outcome = Object.freeze({
            success: lifecycleTransitions.some(
              (transition) => transition.accepted,
            ),
            retryable: false,
            message:
              lifecycleTransitions.length === 0
                ? "No lifecycle transition was required."
                : "Recovery lifecycle action completed.",
            metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
          });
        } else if (this.options.failClosedWhenHandlerMissing) {
          outcome = Object.freeze({
            success: false,
            retryable: false,
            message:
              `No handler is configured for recovery action ` +
              `${decision.selectedAction}.`,
            metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
          });
        } else {
          outcome = Object.freeze({
            success: true,
            retryable: false,
            message:
              `Recovery action ${decision.selectedAction} was accepted ` +
              "without an external handler.",
            metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
          });
        }
      } else {
        const handlerResult = await handler(
          Object.freeze({
            request,
            decision,
            runtimeState: this.lifecycleManager.getRuntimeState(
              decision.strategyId,
            ),
            startedAt,
            deadlineAt,
            metadata: this.options.metadata,
          }),
        );
        outcome = freezeOutcome(handlerResult);
      }

      const completedAt = this.clock.now();
      assertTimestamp(completedAt, "clock.now()");

      if (completedAt > deadlineAt) {
        this.recordCircuitFailure(circuit, completedAt, "RECOVERY_TIMEOUT");
        return this.recordExecution({
          request,
          decision,
          status: "TIMED_OUT",
          startedAt,
          completedAt,
          lifecycleTransitions,
          outcome,
          reason:
            `Recovery action exceeded timeout of ` +
            `${request.policy.recoveryTimeoutMs}ms.`,
        });
      }

      if (outcome.success) {
        if (this.options.executeLifecycleTransitions) {
          lifecycleTransitions.push(
            ...this.executePostSuccessLifecycleTransitions(
              decision,
              completedAt,
            ),
          );
        }
        this.recordCircuitSuccess(circuit, completedAt);
        return this.recordExecution({
          request,
          decision,
          status: "SUCCEEDED",
          startedAt,
          completedAt,
          lifecycleTransitions,
          outcome,
          reason: outcome.message,
        });
      }

      this.recordCircuitFailure(
        circuit,
        completedAt,
        outcome.retryable === false
          ? "NON_RETRYABLE_RECOVERY_FAILURE"
          : "RECOVERY_ACTION_FAILURE",
      );

      if (request.policy.failClosed && this.options.executeLifecycleTransitions) {
        lifecycleTransitions.push(
          ...this.failClosed(decision.strategyId, completedAt),
        );
      }

      return this.recordExecution({
        request,
        decision,
        status: "FAILED",
        startedAt,
        completedAt,
        lifecycleTransitions,
        outcome,
        reason: outcome.message,
      });
    } catch (error) {
      const completedAt = this.clock.now();
      assertTimestamp(completedAt, "clock.now()");
      this.recordCircuitFailure(circuit, completedAt, "RECOVERY_EXCEPTION");

      if (request.policy.failClosed && this.options.executeLifecycleTransitions) {
        lifecycleTransitions.push(
          ...this.failClosed(decision.strategyId, completedAt),
        );
      }

      return this.recordExecution({
        request,
        decision,
        status: completedAt > deadlineAt ? "TIMED_OUT" : "FAILED",
        startedAt,
        completedAt,
        lifecycleTransitions,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown recovery execution failure.",
        metadata: freezeMetadata({
          errorName:
            error instanceof Error ? error.name : "UnknownRecoveryError",
        }),
      });
    }
  }

  public queryDecisions(
    query: AutonomousRecoveryHistoryQuery = {},
  ): readonly AutonomousRecoveryDecision[] {
    this.validateDecisionQuery(query);
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    return Object.freeze(
      this.decisions
        .filter((decision) => {
          const request = this.requests.get(decision.requestId);
          if (
            query.strategyId !== undefined &&
            decision.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.requestId !== undefined &&
            decision.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.correlationId !== undefined &&
            decision.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.trigger !== undefined &&
            request?.trigger !== query.trigger
          ) {
            return false;
          }
          if (
            query.action !== undefined &&
            decision.selectedAction !== query.action
          ) {
            return false;
          }
          if (
            query.terminal !== undefined &&
            decision.terminal !== query.terminal
          ) {
            return false;
          }
          if (
            query.fromDecidedAt !== undefined &&
            decision.decidedAt < query.fromDecidedAt
          ) {
            return false;
          }
          if (
            query.toDecidedAt !== undefined &&
            decision.decidedAt > query.toDecidedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareDecisions)
        .slice(-limit),
    );
  }

  public queryExecutions(
    query: AutonomousRecoveryExecutionHistoryQuery = {},
  ): readonly AutonomousRecoveryExecutionResult[] {
    this.validateExecutionQuery(query);
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    return Object.freeze(
      this.executions
        .filter((result) => {
          if (
            query.strategyId !== undefined &&
            result.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.requestId !== undefined &&
            result.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.decisionId !== undefined &&
            result.decisionId !== query.decisionId
          ) {
            return false;
          }
          if (
            query.correlationId !== undefined &&
            result.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.action !== undefined &&
            result.action !== query.action
          ) {
            return false;
          }
          if (
            query.status !== undefined &&
            result.status !== query.status
          ) {
            return false;
          }
          if (
            query.fromCompletedAt !== undefined &&
            result.completedAt < query.fromCompletedAt
          ) {
            return false;
          }
          if (
            query.toCompletedAt !== undefined &&
            result.completedAt > query.toCompletedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareExecutions)
        .slice(-limit),
    );
  }

  public getCircuitState(
    strategyId: string,
  ): AutonomousRecoveryCircuitState | undefined {
    const state = this.circuitStates.get(strategyId);
    return state === undefined ? undefined : freezeCircuitState(state);
  }

  public resetCircuit(
    strategyId: string,
    resetAt = this.clock.now(),
  ): AutonomousRecoveryCircuitState {
    assertNonEmptyString(strategyId, "strategyId");
    assertTimestamp(resetAt, "resetAt");
    const state = this.getOrCreateCircuitState(strategyId);
    state.open = false;
    state.consecutiveFailureCount = 0;
    state.openedAt = undefined;
    state.nextProbeAt = undefined;
    state.lastSuccessAt = resetAt;
    state.metadata = freezeMetadata({
      ...state.metadata,
      resetAt,
    });
    return freezeCircuitState(state);
  }

  public metrics(): AutonomousRecoveryEngineMetrics {
    const state = this.metricsState;
    return Object.freeze({
      decisionCount: state.decisionCount,
      retryDecisionCount: state.retryDecisionCount,
      terminalDecisionCount: state.terminalDecisionCount,
      executionCount: state.executionCount,
      successfulExecutionCount: state.successfulExecutionCount,
      failedExecutionCount: state.failedExecutionCount,
      timedOutExecutionCount: state.timedOutExecutionCount,
      skippedExecutionCount: state.skippedExecutionCount,
      circuitOpenCount: [...this.circuitStates.values()].filter(
        (circuit) => circuit.open,
      ).length,
      averageExecutionLatencyMs:
        state.executionCount === 0
          ? 0
          : state.totalExecutionLatencyMs / state.executionCount,
      maximumExecutionLatencyMs: state.maximumExecutionLatencyMs,
    });
  }

  public snapshot(
    capturedAt = this.clock.now(),
  ): AutonomousRecoveryEngineSnapshot {
    assertTimestamp(capturedAt, "capturedAt");
    return Object.freeze({
      capturedAt,
      decisions: Object.freeze([...this.decisions]),
      executions: Object.freeze([...this.executions]),
      circuitStates: Object.freeze(
        [...this.circuitStates.values()]
          .sort((left, right) =>
            left.strategyId.localeCompare(right.strategyId),
          )
          .map(freezeCircuitState),
      ),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  public clearHistory(): void {
    this.requests.clear();
    this.decisions.length = 0;
    this.executions.length = 0;
    this.circuitStates.clear();
    Object.assign(this.metricsState, {
      decisionCount: 0,
      retryDecisionCount: 0,
      terminalDecisionCount: 0,
      executionCount: 0,
      successfulExecutionCount: 0,
      failedExecutionCount: 0,
      timedOutExecutionCount: 0,
      skippedExecutionCount: 0,
      totalExecutionLatencyMs: 0,
      maximumExecutionLatencyMs: 0,
    });
  }

  private selectRecovery(
    request: AutonomousRecoveryRequest,
    circuit: MutableCircuitState,
    now: number,
  ): RecoverySelection {
    const allowed = new Set(request.policy.actions);
    const exhausted =
      request.attempt >= request.policy.maximumRetryAttempts;

    if (circuit.open) {
      const action = this.firstAllowed(
        allowed,
        request.policy.failClosed
          ? ["STOP_STRATEGY", "PAUSE_STRATEGY", "CLOSE_POSITIONS", "ESCALATE"]
          : ["PAUSE_STRATEGY", "ESCALATE", "STOP_STRATEGY"],
      );
      return Object.freeze({
        action,
        shouldRetry: false,
        terminal: TERMINAL_ACTIONS.has(action),
        reason:
          `Recovery circuit is open after ` +
          `${circuit.consecutiveFailureCount} consecutive failures.`,
      });
    }

    if (exhausted) {
      const action = this.firstAllowed(
        allowed,
        request.policy.failClosed
          ? ["STOP_STRATEGY", "CLOSE_POSITIONS", "PAUSE_STRATEGY", "ESCALATE"]
          : ["PAUSE_STRATEGY", "ESCALATE", "STOP_STRATEGY"],
      );
      return Object.freeze({
        action,
        shouldRetry: false,
        terminal: TERMINAL_ACTIONS.has(action),
        reason:
          `Maximum recovery attempts (${request.policy.maximumRetryAttempts}) ` +
          "have been exhausted.",
      });
    }

    const priority = ACTION_PRIORITY_BY_TRIGGER[request.trigger];
    const action = this.firstAllowed(allowed, priority);
    const shouldRetry = RETRYABLE_ACTIONS.has(action);
    const nextRetryAt = shouldRetry
      ? now + this.calculateBackoff(request.attempt, request.policy)
      : undefined;

    return Object.freeze({
      action,
      shouldRetry,
      nextRetryAt,
      terminal: TERMINAL_ACTIONS.has(action),
      reason:
        `Selected ${action} for ${request.trigger} using attempt ` +
        `${request.attempt} of ${request.policy.maximumRetryAttempts}.`,
    });
  }

  private calculateBackoff(
    attempt: number,
    policy: AutonomousRecoveryPolicy,
  ): number {
    const exponent = Math.max(0, attempt);
    const calculated =
      policy.initialBackoffMs *
      Math.pow(policy.backoffMultiplier, exponent);
    return Math.min(policy.maximumBackoffMs, calculated);
  }

  private firstAllowed(
    allowed: ReadonlySet<AutonomousRecoveryAction>,
    preferred: readonly AutonomousRecoveryAction[],
  ): AutonomousRecoveryAction {
    for (const action of preferred) {
      if (allowed.has(action)) {
        return action;
      }
    }
    const fallback = [...allowed][0];
    if (fallback === undefined) {
      throw new Error("Recovery policy does not contain an action.");
    }
    return fallback;
  }

  private executePreActionLifecycleTransitions(
    decision: AutonomousRecoveryDecision,
    occurredAt: number,
  ): AutonomousStrategyLifecycleTransition[] {
    const transitions: AutonomousStrategyLifecycleTransition[] = [];
    const state = this.lifecycleManager.getRuntimeState(decision.strategyId);
    if (state === undefined) {
      return transitions;
    }

    switch (decision.selectedAction) {
      case "RESTART_STRATEGY":
        if (state.lifecycleState === "RUNNING") {
          transitions.push(
            ...this.executeLifecycleSequence(
              decision,
              ["FAIL", "RECOVER"],
              occurredAt,
            ),
          );
        } else if (
          state.lifecycleState === "DEGRADED" ||
          state.lifecycleState === "FAILED"
        ) {
          transitions.push(
            ...this.executeLifecycleSequence(
              decision,
              ["RECOVER"],
              occurredAt,
            ),
          );
        }
        break;
      case "PAUSE_STRATEGY":
        if (
          state.lifecycleState === "RUNNING" ||
          state.lifecycleState === "DEGRADED"
        ) {
          transitions.push(
            ...this.executeLifecycleSequence(
              decision,
              ["PAUSE"],
              occurredAt,
            ),
          );
        }
        break;
      case "STOP_STRATEGY":
      case "CLOSE_POSITIONS":
        if (
          state.lifecycleState !== "STOPPED" &&
          state.lifecycleState !== "ARCHIVED"
        ) {
          transitions.push(
            ...this.executeLifecycleSequence(
              decision,
              ["STOP"],
              occurredAt,
            ),
          );
        }
        break;
      default:
        break;
    }

    return transitions;
  }

  private executePostSuccessLifecycleTransitions(
    decision: AutonomousRecoveryDecision,
    occurredAt: number,
  ): AutonomousStrategyLifecycleTransition[] {
    if (
      decision.selectedAction !== "RESTART_STRATEGY" ||
      !this.options.automaticallyCompleteLifecycleTransitions
    ) {
      return [];
    }

    const state = this.lifecycleManager.getRuntimeState(decision.strategyId);
    if (state?.lifecycleState !== "RECOVERING") {
      return [];
    }

    return this.executeLifecycleSequence(
      decision,
      ["RECOVER"],
      occurredAt,
    );
  }

  private failClosed(
    strategyId: string,
    occurredAt: number,
  ): AutonomousStrategyLifecycleTransition[] {
    const state = this.lifecycleManager.getRuntimeState(strategyId);
    if (
      state === undefined ||
      state.lifecycleState === "STOPPED" ||
      state.lifecycleState === "ARCHIVED"
    ) {
      return [];
    }

    const syntheticDecision: AutonomousRecoveryDecision = freezeDecision({
      decisionId: this.idFactory.create(
        "fail-closed-decision",
        occurredAt,
        this.decisionSequence++,
      ),
      requestId: "fail-closed",
      correlationId: "fail-closed",
      strategyId,
      selectedAction: "STOP_STRATEGY",
      shouldRetry: false,
      terminal: true,
      reason: "Fail-closed policy requested strategy stop.",
      decidedAt: occurredAt,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });

    return this.executeLifecycleSequence(
      syntheticDecision,
      ["STOP"],
      occurredAt,
    );
  }

  private executeLifecycleSequence(
    decision: AutonomousRecoveryDecision,
    actions: readonly AutonomousStrategyLifecycleAction[],
    occurredAt: number,
  ): AutonomousStrategyLifecycleTransition[] {
    const transitions: AutonomousStrategyLifecycleTransition[] = [];

    for (const action of actions) {
      const state = this.lifecycleManager.getRuntimeState(decision.strategyId);
      if (state === undefined) {
        break;
      }

      const command: AutonomousStrategyLifecycleCommand = Object.freeze({
        commandId: this.idFactory.create(
          "recovery-lifecycle-command",
          occurredAt,
          this.commandSequence++,
        ),
        correlationId: decision.correlationId,
        strategyId: decision.strategyId,
        action,
        requestedAt: occurredAt,
        requestedBy: this.options.requestedBy,
        reason:
          `Recovery action ${decision.selectedAction}: ${decision.reason}`,
        expectedState: state.lifecycleState,
        metadata: freezeMetadata({
          recoveryDecisionId: decision.decisionId,
          recoveryAction: decision.selectedAction,
        }),
      });

      const transition = this.lifecycleManager.execute(command);
      transitions.push(transition);
      if (!transition.accepted) {
        break;
      }

      if (!this.options.automaticallyCompleteLifecycleTransitions) {
        break;
      }
    }

    return transitions;
  }

  private handlerFor(
    action: AutonomousRecoveryAction,
  ): AutonomousRecoveryActionHandler | undefined {
    switch (action) {
      case "RETRY":
        return this.options.handlers.retry;
      case "RESTART_STRATEGY":
        return this.options.handlers.restartStrategy;
      case "SWITCH_PROVIDER":
        return this.options.handlers.switchProvider;
      case "SWITCH_EXCHANGE":
        return this.options.handlers.switchExchange;
      case "PAUSE_STRATEGY":
        return this.options.handlers.pauseStrategy;
      case "STOP_STRATEGY":
        return this.options.handlers.stopStrategy;
      case "REDUCE_EXPOSURE":
        return this.options.handlers.reduceExposure;
      case "CLOSE_POSITIONS":
        return this.options.handlers.closePositions;
      case "ESCALATE":
        return this.options.handlers.escalate;
      default:
        return this.assertNever(action);
    }
  }

  private isLifecycleOnlyAction(action: AutonomousRecoveryAction): boolean {
    return (
      action === "RESTART_STRATEGY" ||
      action === "PAUSE_STRATEGY" ||
      action === "STOP_STRATEGY"
    );
  }

  private recordDecision(
    decision: AutonomousRecoveryDecision,
  ): void {
    this.decisions.push(decision);
    this.decisions.sort(compareDecisions);
    this.metricsState.decisionCount += 1;
    if (decision.shouldRetry) {
      this.metricsState.retryDecisionCount += 1;
    }
    if (decision.terminal) {
      this.metricsState.terminalDecisionCount += 1;
    }
    this.trimHistory();
  }

  private recordExecution(input: {
    readonly request: AutonomousRecoveryRequest;
    readonly decision: AutonomousRecoveryDecision;
    readonly status: AutonomousRecoveryExecutionStatus;
    readonly startedAt: AutonomousTradingTimestamp;
    readonly completedAt: AutonomousTradingTimestamp;
    readonly lifecycleTransitions: readonly AutonomousStrategyLifecycleTransition[];
    readonly outcome?: AutonomousRecoveryActionOutcome;
    readonly reason: string;
    readonly metadata?: AutonomousTradingMetadata;
  }): AutonomousRecoveryExecutionResult {
    const latencyMs = Math.max(0, input.completedAt - input.startedAt);
    const result = freezeExecution({
      executionId: this.idFactory.create(
        "autonomous-recovery-execution",
        input.completedAt,
        this.executionSequence++,
      ),
      requestId: input.request.requestId,
      decisionId: input.decision.decisionId,
      correlationId: input.decision.correlationId,
      strategyId: input.decision.strategyId,
      action: input.decision.selectedAction,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      latencyMs,
      lifecycleTransitions: input.lifecycleTransitions,
      outcome: input.outcome,
      reason: input.reason,
      metadata: freezeMetadata({
        trigger: input.request.trigger,
        failureCode: input.request.failureCode,
        attempt: input.request.attempt,
        ...input.metadata,
      }),
    });

    this.executions.push(result);
    this.executions.sort(compareExecutions);
    this.metricsState.totalExecutionLatencyMs += latencyMs;
    this.metricsState.maximumExecutionLatencyMs = Math.max(
      this.metricsState.maximumExecutionLatencyMs,
      latencyMs,
    );

    switch (result.status) {
      case "SUCCEEDED":
        this.metricsState.successfulExecutionCount += 1;
        break;
      case "FAILED":
        this.metricsState.failedExecutionCount += 1;
        break;
      case "TIMED_OUT":
        this.metricsState.timedOutExecutionCount += 1;
        break;
      case "SKIPPED":
        this.metricsState.skippedExecutionCount += 1;
        break;
      default:
        this.assertNever(result.status);
    }

    this.trimHistory();
    return result;
  }

  private getOrCreateCircuitState(
    strategyId: string,
  ): MutableCircuitState {
    const existing = this.circuitStates.get(strategyId);
    if (existing !== undefined) {
      return existing;
    }

    const created: MutableCircuitState = {
      strategyId,
      open: false,
      consecutiveFailureCount: 0,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    };
    this.circuitStates.set(strategyId, created);
    return created;
  }

  private refreshCircuit(
    state: MutableCircuitState,
    now: number,
  ): void {
    if (
      state.open &&
      state.nextProbeAt !== undefined &&
      now >= state.nextProbeAt
    ) {
      state.open = false;
      state.nextProbeAt = undefined;
      state.metadata = freezeMetadata({
        ...state.metadata,
        halfOpenedAt: now,
      });
    }
  }

  private recordCircuitFailure(
    state: MutableCircuitState,
    failedAt: number,
    failureCode: string,
  ): void {
    state.consecutiveFailureCount += 1;
    state.lastFailureAt = failedAt;
    state.metadata = freezeMetadata({
      ...state.metadata,
      lastFailureCode: failureCode,
    });

    if (
      state.consecutiveFailureCount >=
      this.options.circuitBreakerFailureThreshold
    ) {
      state.open = true;
      state.openedAt = failedAt;
      state.nextProbeAt =
        failedAt + this.options.circuitBreakerCooldownMs;
    }
  }

  private recordCircuitSuccess(
    state: MutableCircuitState,
    succeededAt: number,
  ): void {
    state.open = false;
    state.consecutiveFailureCount = 0;
    state.openedAt = undefined;
    state.nextProbeAt = undefined;
    state.lastSuccessAt = succeededAt;
    state.metadata = freezeMetadata({
      ...state.metadata,
      lastRecoveredAt: succeededAt,
    });
  }

  private validateRequestSemantics(
    request: AutonomousRecoveryRequest,
    now: number,
  ): void {
    if (!this.lifecycleManager.has(request.strategyId)) {
      throw new Error(
        `Strategy '${request.strategyId}' is not registered.`,
      );
    }

    if (request.requestedAt > now) {
      throw new Error("Recovery request cannot be from the future.");
    }
    if (now - request.requestedAt > this.options.maximumRequestAgeMs) {
      throw new Error(
        `Recovery request is stale by ${now - request.requestedAt}ms.`,
      );
    }
    if (request.attempt > request.policy.maximumRetryAttempts) {
      throw new Error(
        "Recovery request attempt cannot exceed maximumRetryAttempts.",
      );
    }

    const uniqueActions = new Set(request.policy.actions);
    if (uniqueActions.size !== request.policy.actions.length) {
      throw new Error("Recovery policy actions must be unique.");
    }
  }

  private validateDecisionQuery(
    query: AutonomousRecoveryHistoryQuery,
  ): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (
      query.fromDecidedAt !== undefined &&
      query.toDecidedAt !== undefined &&
      query.fromDecidedAt > query.toDecidedAt
    ) {
      throw new RangeError(
        "query.fromDecidedAt cannot exceed query.toDecidedAt.",
      );
    }
  }

  private validateExecutionQuery(
    query: AutonomousRecoveryExecutionHistoryQuery,
  ): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (
      query.fromCompletedAt !== undefined &&
      query.toCompletedAt !== undefined &&
      query.fromCompletedAt > query.toCompletedAt
    ) {
      throw new RangeError(
        "query.fromCompletedAt cannot exceed query.toCompletedAt.",
      );
    }
  }

  private trimHistory(): void {
    while (
      this.decisions.length > this.options.maximumHistoryEntries
    ) {
      const removed = this.decisions.shift();
      if (removed !== undefined) {
        this.requests.delete(removed.requestId);
      }
    }
    while (
      this.executions.length > this.options.maximumHistoryEntries
    ) {
      this.executions.shift();
    }
  }

  private assertNever(value: never): never {
    throw new Error(`Unsupported recovery value '${String(value)}'.`);
  }
}

export function createAutonomousRecoveryEngine(
  lifecycleManager: AutonomousStrategyLifecycleManager,
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousRecoveryEngineOptions = {},
): AutonomousRecoveryEngine {
  return new AutonomousRecoveryEngine(
    lifecycleManager,
    clock,
    idFactory,
    validator,
    options,
  );
}