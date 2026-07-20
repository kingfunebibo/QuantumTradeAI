/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-runtime.ts
 *
 * Purpose:
 * Coordinates strategy creation, configuration validation, lifecycle
 * transitions, versioned state management, deterministic evaluation,
 * output validation, state updates, and runtime event publication.
 */

import {
  EMPTY_STRATEGY_METADATA,
  StrategyConfiguration,
  StrategyContractValidator,
  StrategyCorrelationId,
  StrategyDisposeContext,
  StrategyError,
  StrategyEvaluationContext,
  StrategyEvaluationResult,
  StrategyFactory,
  StrategyInitializationContext,
  StrategyInstanceId,
  StrategyLifecycleState,
  StrategyMetadata,
  StrategyPauseContext,
  StrategyRegistry,
  StrategyResult,
  StrategyResumeContext,
  StrategyRuntime,
  StrategyRuntimeEvent,
  StrategyRuntimeEventListener,
  StrategyRuntimeEventType,
  StrategyStartContext,
  StrategyStateSnapshot,
  StrategyStopContext,
  TradingStrategy,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";
import {
  ApplyStrategyStateUpdateRequest,
  CreateStrategyStateRequest,
  InMemoryStrategyStateManager,
  ReplaceStrategyStateRequest,
  StrategyStateManager,
} from "./strategy-state-manager";

/* ========================================================================== *
 * Runtime errors and dependencies
 * ========================================================================== */

export type StrategyRuntimeErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_CONFIGURATION"
  | "STRATEGY_NOT_REGISTERED"
  | "STRATEGY_VERSION_NOT_REGISTERED"
  | "INSTANCE_ALREADY_EXISTS"
  | "INSTANCE_NOT_FOUND"
  | "INVALID_LIFECYCLE_TRANSITION"
  | "STRATEGY_IDENTITY_MISMATCH"
  | "INVALID_EVALUATION_CONTEXT"
  | "INVALID_EVALUATION_RESULT"
  | "STRATEGY_OPERATION_FAILED"
  | "STATE_OPERATION_FAILED"
  | "EVENT_LISTENER_FAILED"
  | "UNEXPECTED_RUNTIME_ERROR";

export class StrategyRuntimeError extends Error {
  public readonly code: StrategyRuntimeErrorCode;
  public readonly strategyInstanceId?: StrategyInstanceId;
  public readonly retryable: boolean;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyRuntimeErrorCode,
    message: string,
    details: {
      readonly strategyInstanceId?: StrategyInstanceId;
      readonly retryable?: boolean;
      readonly cause?: unknown;
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyRuntimeError";
    this.code = code;
    this.strategyInstanceId = details.strategyInstanceId;
    this.retryable = details.retryable ?? false;
    this.cause = details.cause;
    this.metadata = details.metadata ?? EMPTY_STRATEGY_METADATA;
    Object.setPrototypeOf(this, StrategyRuntimeError.prototype);
  }
}

export interface StrategyRuntimeClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyRuntimeIdGenerator {
  nextEventId(
    type: StrategyRuntimeEventType,
    strategyInstanceId: StrategyInstanceId | undefined,
    timestamp: UnixTimestampMilliseconds,
  ): string;
}

export interface StrategyRuntimeOptions {
  readonly automaticallyStartAfterInitialization: boolean;
  readonly validateEvaluationOutputs: boolean;
  readonly rejectConcurrentEvaluations: boolean;
  readonly stopOnEvaluationFailure: boolean;
  readonly disposeOnStop: boolean;
  readonly failOnEventListenerError: boolean;
}

export const DEFAULT_STRATEGY_RUNTIME_OPTIONS: StrategyRuntimeOptions =
  Object.freeze({
    automaticallyStartAfterInitialization: true,
    validateEvaluationOutputs: true,
    rejectConcurrentEvaluations: true,
    stopOnEvaluationFailure: false,
    disposeOnStop: false,
    failOnEventListenerError: false,
  });

export interface StrategyRuntimeDependencies {
  readonly registry: StrategyRegistry;
  readonly validator: StrategyContractValidator;
  readonly stateManager?: StrategyStateManager;
  readonly clock?: StrategyRuntimeClock;
  readonly idGenerator?: StrategyRuntimeIdGenerator;
  readonly listeners?: readonly StrategyRuntimeEventListener[];
  readonly options?: Partial<StrategyRuntimeOptions>;
}

export interface StrategyRuntimeInstanceSnapshot {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly lifecycleState: StrategyLifecycleState;
  readonly initializedAt: UnixTimestampMilliseconds;
  readonly lastTransitionAt: UnixTimestampMilliseconds;
  readonly evaluationCount: number;
  readonly evaluationInProgress: boolean;
  readonly configuration: StrategyConfiguration;
  readonly state: StrategyStateSnapshot;
}

interface RuntimeInstance {
  readonly strategy: TradingStrategy;
  readonly configuration: StrategyConfiguration;
  lifecycleState: StrategyLifecycleState;
  initializedAt: UnixTimestampMilliseconds;
  lastTransitionAt: UnixTimestampMilliseconds;
  evaluationCount: number;
  evaluationInProgress: boolean;
}

interface VersionAwareRegistry extends StrategyRegistry {
  getVersion(strategyId: string, strategyVersion: string): StrategyFactory | undefined;
}

class SystemRuntimeClock implements StrategyRuntimeClock {
  public now(): UnixTimestampMilliseconds {
    return Date.now();
  }
}

class DeterministicRuntimeIdGenerator implements StrategyRuntimeIdGenerator {
  private sequence = 0;

  public nextEventId(
    type: StrategyRuntimeEventType,
    strategyInstanceId: StrategyInstanceId | undefined,
    timestamp: UnixTimestampMilliseconds,
  ): string {
    this.sequence += 1;
    return [
      "strategy-runtime",
      type.toLowerCase(),
      strategyInstanceId ?? "global",
      String(timestamp),
      String(this.sequence).padStart(8, "0"),
    ].join(":");
  }
}

/* ========================================================================== *
 * Helpers
 * ========================================================================== */

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new StrategyRuntimeError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string without surrounding whitespace.`,
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyRuntimeError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
  }
}

function cloneMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return deepFreeze(cloneUnknown(metadata)) as StrategyMetadata;
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneUnknown(entry));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = cloneUnknown(value[key]);
    }
    return output;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function success<T>(
  value: T,
  metadata: StrategyMetadata = EMPTY_STRATEGY_METADATA,
): StrategyResult<T> {
  return Object.freeze({
    ok: true as const,
    value,
    metadata: cloneMetadata(metadata),
  });
}

function failure<T>(
  error: StrategyError,
  metadata: StrategyMetadata = EMPTY_STRATEGY_METADATA,
): StrategyResult<T> {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({
      ...error,
      metadata: cloneMetadata(error.metadata),
    }),
    metadata: cloneMetadata(metadata),
  });
}

function runtimeFailure<T>(error: StrategyRuntimeError): StrategyResult<T> {
  return failure({
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    cause: error.cause,
    metadata: error.metadata,
  });
}

function normalizeUnknownError(
  error: unknown,
  code: StrategyRuntimeErrorCode,
  fallbackMessage: string,
  strategyInstanceId?: StrategyInstanceId,
): StrategyRuntimeError {
  if (error instanceof StrategyRuntimeError) {
    return error;
  }

  return new StrategyRuntimeError(
    code,
    error instanceof Error ? error.message : fallbackMessage,
    { strategyInstanceId, cause: error },
  );
}

function createCorrelationId(
  strategyInstanceId: StrategyInstanceId,
  operation: string,
  timestamp: UnixTimestampMilliseconds,
): StrategyCorrelationId {
  return `${strategyInstanceId}:${operation}:${timestamp}`;
}

function requireValidReport(
  valid: boolean,
  issues: readonly { readonly field: string; readonly message: string }[],
  code: StrategyRuntimeErrorCode,
  subject: string,
  strategyInstanceId?: StrategyInstanceId,
): void {
  if (valid) {
    return;
  }

  const summary = issues
    .filter((issue) => issue.message.length > 0)
    .slice(0, 10)
    .map((issue) => `${issue.field}: ${issue.message}`)
    .join("; ");

  throw new StrategyRuntimeError(
    code,
    `${subject} is invalid${summary.length > 0 ? ` — ${summary}` : "."}`,
    { strategyInstanceId },
  );
}

function isVersionAwareRegistry(
  registry: StrategyRegistry,
): registry is VersionAwareRegistry {
  return "getVersion" in registry &&
    typeof (registry as Partial<VersionAwareRegistry>).getVersion === "function";
}

/* ========================================================================== *
 * Default professional runtime
 * ========================================================================== */

export class DefaultStrategyRuntime implements StrategyRuntime {
  public readonly options: StrategyRuntimeOptions;

  private readonly registry: StrategyRegistry;
  private readonly validator: StrategyContractValidator;
  private readonly stateManager: StrategyStateManager;
  private readonly clock: StrategyRuntimeClock;
  private readonly idGenerator: StrategyRuntimeIdGenerator;
  private readonly listeners = new Set<StrategyRuntimeEventListener>();
  private readonly instances = new Map<StrategyInstanceId, RuntimeInstance>();

  public constructor(dependencies: StrategyRuntimeDependencies) {
    if (dependencies === null || typeof dependencies !== "object") {
      throw new StrategyRuntimeError(
        "INVALID_ARGUMENT",
        "Strategy runtime dependencies are required.",
      );
    }

    if (dependencies.registry === undefined) {
      throw new StrategyRuntimeError("INVALID_ARGUMENT", "registry is required.");
    }

    if (dependencies.validator === undefined) {
      throw new StrategyRuntimeError("INVALID_ARGUMENT", "validator is required.");
    }

    this.registry = dependencies.registry;
    this.validator = dependencies.validator;
    this.stateManager = dependencies.stateManager ?? new InMemoryStrategyStateManager();
    this.clock = dependencies.clock ?? new SystemRuntimeClock();
    this.idGenerator = dependencies.idGenerator ?? new DeterministicRuntimeIdGenerator();
    this.options = Object.freeze({
      ...DEFAULT_STRATEGY_RUNTIME_OPTIONS,
      ...dependencies.options,
    });

    for (const listener of dependencies.listeners ?? []) {
      this.addEventListener(listener);
    }
  }

  public addEventListener(listener: StrategyRuntimeEventListener): void {
    if (listener === null || typeof listener !== "object" || typeof listener.onEvent !== "function") {
      throw new StrategyRuntimeError(
        "INVALID_ARGUMENT",
        "listener must implement onEvent(event).",
      );
    }
    this.listeners.add(listener);
  }

  public removeEventListener(listener: StrategyRuntimeEventListener): boolean {
    return this.listeners.delete(listener);
  }

  public hasInstance(strategyInstanceId: StrategyInstanceId): boolean {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    return this.instances.has(strategyInstanceId);
  }

  public getLifecycleState(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyLifecycleState | undefined {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    return this.instances.get(strategyInstanceId)?.lifecycleState;
  }

  public getInstanceSnapshot(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyRuntimeInstanceSnapshot | undefined {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    const instance = this.instances.get(strategyInstanceId);
    if (instance === undefined) {
      return undefined;
    }

    return deepFreeze({
      strategyInstanceId,
      strategyId: instance.configuration.strategyId,
      strategyVersion: instance.configuration.strategyVersion,
      lifecycleState: instance.lifecycleState,
      initializedAt: instance.initializedAt,
      lastTransitionAt: instance.lastTransitionAt,
      evaluationCount: instance.evaluationCount,
      evaluationInProgress: instance.evaluationInProgress,
      configuration: cloneUnknown(instance.configuration) as StrategyConfiguration,
      state: this.stateManager.require(strategyInstanceId),
    });
  }

  public listInstanceSnapshots(): readonly StrategyRuntimeInstanceSnapshot[] {
    return Object.freeze(
      [...this.instances.keys()]
        .sort((left, right) => left.localeCompare(right))
        .map((strategyInstanceId) => this.getInstanceSnapshot(strategyInstanceId))
        .filter(
          (snapshot): snapshot is StrategyRuntimeInstanceSnapshot =>
            snapshot !== undefined,
        ),
    );
  }

  public async initialize(
    configuration: StrategyConfiguration,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<StrategyStateSnapshot>> {
    try {
      assertTimestamp(timestamp, "timestamp");
      this.assertConfigurationIdentity(configuration);

      if (this.instances.has(configuration.strategyInstanceId)) {
        throw new StrategyRuntimeError(
          "INSTANCE_ALREADY_EXISTS",
          `Strategy instance '${configuration.strategyInstanceId}' already exists.`,
          { strategyInstanceId: configuration.strategyInstanceId },
        );
      }

      const factory = this.resolveFactory(configuration);
      const configurationReport = this.validator.validateConfiguration(
        configuration,
        factory.manifest,
        timestamp,
      );
      requireValidReport(
        configurationReport.valid,
        configurationReport.issues,
        "INVALID_CONFIGURATION",
        "Strategy configuration",
        configuration.strategyInstanceId,
      );

      const strategy = factory.create(configuration);
      this.assertCreatedStrategy(strategy, configuration, factory);

      const instance: RuntimeInstance = {
        strategy,
        configuration: cloneUnknown(configuration) as StrategyConfiguration,
        lifecycleState: "INITIALIZING",
        initializedAt: timestamp,
        lastTransitionAt: timestamp,
        evaluationCount: 0,
        evaluationInProgress: false,
      };
      this.instances.set(configuration.strategyInstanceId, instance);

      const correlationId = createCorrelationId(
        configuration.strategyInstanceId,
        "initialize",
        timestamp,
      );
      const existingState = this.stateManager.get(configuration.strategyInstanceId);
      const initializationContext: StrategyInitializationContext = deepFreeze({
        strategyId: configuration.strategyId,
        strategyInstanceId: configuration.strategyInstanceId,
        configuration: instance.configuration,
        timestamp,
        correlationId,
        metadata: EMPTY_STRATEGY_METADATA,
        existingState,
      });

      const initialized = await strategy.initialize(initializationContext);
      if (!initialized.ok) {
        instance.lifecycleState = "FAILED";
        instance.lastTransitionAt = timestamp;
        await this.emitFailureEvent(instance, correlationId, timestamp, initialized.error);
        this.instances.delete(configuration.strategyInstanceId);
        return initialized;
      }

      const storedState = this.storeInitializedState(
        configuration.strategyInstanceId,
        initialized.value,
        timestamp,
      );
      instance.lifecycleState = "READY";
      instance.lastTransitionAt = timestamp;

      await this.emit(
        "INITIALIZED",
        instance,
        timestamp,
        correlationId,
        Object.freeze({ stateVersion: storedState.version }),
      );

      if (this.options.automaticallyStartAfterInitialization && configuration.enabled) {
        const startResult = await this.startInstance(instance, timestamp, correlationId);
        if (!startResult.ok) {
          return failure(startResult.error, startResult.metadata);
        }
      }

      return success(storedState, initialized.metadata);
    } catch (error) {
      const normalized = normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy initialization failed.",
        configuration?.strategyInstanceId,
      );
      if (configuration?.strategyInstanceId !== undefined) {
        this.instances.delete(configuration.strategyInstanceId);
      }
      return runtimeFailure(normalized);
    }
  }

  public async evaluate(
    context: StrategyEvaluationContext,
  ): Promise<StrategyResult<StrategyEvaluationResult>> {
    let instance: RuntimeInstance | undefined;

    try {
      assertTimestamp(context.evaluationTime, "context.evaluationTime");
      instance = this.requireInstance(context.strategyInstanceId);
      this.assertLifecycle(instance, ["RUNNING"], "evaluate");
      this.assertEvaluationIdentity(instance, context);

      if (instance.evaluationInProgress && this.options.rejectConcurrentEvaluations) {
        throw new StrategyRuntimeError(
          "INVALID_LIFECYCLE_TRANSITION",
          `A strategy evaluation is already running for '${context.strategyInstanceId}'.`,
          { strategyInstanceId: context.strategyInstanceId, retryable: true },
        );
      }

      const currentState = this.stateManager.require(context.strategyInstanceId);
      if (
        context.state.version !== currentState.version ||
        context.state.strategyInstanceId !== currentState.strategyInstanceId ||
        context.state.checksum !== currentState.checksum
      ) {
        throw new StrategyRuntimeError(
          "INVALID_EVALUATION_CONTEXT",
          "Evaluation context state does not match the runtime's current strategy state.",
          { strategyInstanceId: context.strategyInstanceId },
        );
      }

      const contextReport = this.validator.validateEvaluationContext(context);
      requireValidReport(
        contextReport.valid,
        contextReport.issues,
        "INVALID_EVALUATION_CONTEXT",
        "Strategy evaluation context",
        context.strategyInstanceId,
      );

      instance.evaluationInProgress = true;
      await this.emit(
        "EVALUATION_STARTED",
        instance,
        context.evaluationTime,
        context.correlationId,
        Object.freeze({ evaluationId: context.evaluationId }),
      );

      const result = await instance.strategy.evaluate(context);
      if (!result.ok) {
        await this.emitFailureEvent(
          instance,
          context.correlationId,
          context.evaluationTime,
          result.error,
        );

        if (this.options.stopOnEvaluationFailure) {
          instance.lifecycleState = "FAILED";
          instance.lastTransitionAt = context.evaluationTime;
        }
        return result;
      }

      this.validateEvaluationResult(instance, context, result.value);
      const completed = result.value;

      if (completed.decision.stateUpdate !== undefined) {
        const stateReport = this.validator.validateStateUpdate(
          completed.decision.stateUpdate,
          currentState,
          completed.completedAt,
        );
        requireValidReport(
          stateReport.valid,
          stateReport.issues,
          "INVALID_EVALUATION_RESULT",
          "Strategy state update",
          context.strategyInstanceId,
        );

        const request: ApplyStrategyStateUpdateRequest = {
          strategyInstanceId: context.strategyInstanceId,
          update: completed.decision.stateUpdate,
          timestamp: completed.completedAt,
        };
        const updatedState = this.stateManager.apply(request);
        await this.emit(
          "STATE_UPDATED",
          instance,
          completed.completedAt,
          context.correlationId,
          Object.freeze({ stateVersion: updatedState.version }),
        );
      }

      for (const signal of completed.decision.signals) {
        await this.emit(
          "SIGNAL_GENERATED",
          instance,
          completed.completedAt,
          context.correlationId,
          Object.freeze({ signalId: signal.signalId }),
        );
      }

      for (const orderIntent of completed.decision.orderIntents) {
        await this.emit(
          "ORDER_INTENT_GENERATED",
          instance,
          completed.completedAt,
          context.correlationId,
          Object.freeze({ orderIntentId: orderIntent.orderIntentId }),
        );
      }

      instance.evaluationCount += 1;
      await this.emit(
        "EVALUATION_COMPLETED",
        instance,
        completed.completedAt,
        context.correlationId,
        Object.freeze({
          evaluationId: completed.evaluationId,
          decisionStatus: completed.decision.status,
          signalCount: completed.decision.signals.length,
          orderIntentCount: completed.decision.orderIntents.length,
        }),
      );

      return success(completed, result.metadata);
    } catch (error) {
      const normalized = normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy evaluation failed.",
        context?.strategyInstanceId,
      );
      if (instance !== undefined) {
        await this.safeEmitFailure(
          instance,
          context.correlationId,
          context.evaluationTime,
          normalized,
        );
      }
      return runtimeFailure(normalized);
    } finally {
      if (instance !== undefined) {
        instance.evaluationInProgress = false;
      }
    }
  }

  public async pause(
    strategyInstanceId: StrategyInstanceId,
    reason: string,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>> {
    try {
      assertIdentifier(strategyInstanceId, "strategyInstanceId");
      assertIdentifier(reason, "reason");
      assertTimestamp(timestamp, "timestamp");
      const instance = this.requireInstance(strategyInstanceId);
      this.assertLifecycle(instance, ["RUNNING"], "pause");
      const state = this.stateManager.require(strategyInstanceId);
      const correlationId = createCorrelationId(strategyInstanceId, "pause", timestamp);
      const context: StrategyPauseContext = deepFreeze({
        strategyId: instance.configuration.strategyId,
        strategyInstanceId,
        configuration: instance.configuration,
        timestamp,
        correlationId,
        metadata: EMPTY_STRATEGY_METADATA,
        state,
        reason,
      });
      const result = await instance.strategy.pause(context);
      if (!result.ok) {
        await this.emitFailureEvent(instance, correlationId, timestamp, result.error);
        return result;
      }
      instance.lifecycleState = "PAUSED";
      instance.lastTransitionAt = timestamp;
      await this.emit("PAUSED", instance, timestamp, correlationId, Object.freeze({ reason }));
      return success(undefined, result.metadata);
    } catch (error) {
      return runtimeFailure(normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy pause failed.",
        strategyInstanceId,
      ));
    }
  }

  public async resume(
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>> {
    try {
      assertIdentifier(strategyInstanceId, "strategyInstanceId");
      assertTimestamp(timestamp, "timestamp");
      const instance = this.requireInstance(strategyInstanceId);
      this.assertLifecycle(instance, ["PAUSED"], "resume");
      const state = this.stateManager.require(strategyInstanceId);
      const correlationId = createCorrelationId(strategyInstanceId, "resume", timestamp);
      const context: StrategyResumeContext = deepFreeze({
        strategyId: instance.configuration.strategyId,
        strategyInstanceId,
        configuration: instance.configuration,
        timestamp,
        correlationId,
        metadata: EMPTY_STRATEGY_METADATA,
        state,
      });
      const result = await instance.strategy.resume(context);
      if (!result.ok) {
        await this.emitFailureEvent(instance, correlationId, timestamp, result.error);
        return result;
      }
      instance.lifecycleState = "RUNNING";
      instance.lastTransitionAt = timestamp;
      await this.emit("RESUMED", instance, timestamp, correlationId, EMPTY_STRATEGY_METADATA);
      return success(undefined, result.metadata);
    } catch (error) {
      return runtimeFailure(normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy resume failed.",
        strategyInstanceId,
      ));
    }
  }

  public async stop(
    strategyInstanceId: StrategyInstanceId,
    reason: string,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>> {
    try {
      assertIdentifier(strategyInstanceId, "strategyInstanceId");
      assertIdentifier(reason, "reason");
      assertTimestamp(timestamp, "timestamp");
      const instance = this.requireInstance(strategyInstanceId);
      this.assertLifecycle(instance, ["READY", "RUNNING", "PAUSED", "FAILED"], "stop");
      const state = this.stateManager.require(strategyInstanceId);
      const correlationId = createCorrelationId(strategyInstanceId, "stop", timestamp);
      instance.lifecycleState = "STOPPING";
      instance.lastTransitionAt = timestamp;
      const context: StrategyStopContext = deepFreeze({
        strategyId: instance.configuration.strategyId,
        strategyInstanceId,
        configuration: instance.configuration,
        timestamp,
        correlationId,
        metadata: EMPTY_STRATEGY_METADATA,
        state,
        reason,
      });
      const result = await instance.strategy.stop(context);
      if (!result.ok) {
        instance.lifecycleState = "FAILED";
        await this.emitFailureEvent(instance, correlationId, timestamp, result.error);
        return result;
      }
      instance.lifecycleState = "STOPPED";
      instance.lastTransitionAt = timestamp;
      await this.emit("STOPPED", instance, timestamp, correlationId, Object.freeze({ reason }));

      if (this.options.disposeOnStop) {
        const disposed = await this.dispose(strategyInstanceId, timestamp);
        if (!disposed.ok) {
          return disposed;
        }
      }
      return success(undefined, result.metadata);
    } catch (error) {
      return runtimeFailure(normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy stop failed.",
        strategyInstanceId,
      ));
    }
  }

  public async dispose(
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): Promise<StrategyResult<void>> {
    try {
      assertIdentifier(strategyInstanceId, "strategyInstanceId");
      assertTimestamp(timestamp, "timestamp");
      const instance = this.requireInstance(strategyInstanceId);
      this.assertLifecycle(instance, ["READY", "STOPPED", "FAILED"], "dispose");
      const state = this.stateManager.get(strategyInstanceId);
      const correlationId = createCorrelationId(strategyInstanceId, "dispose", timestamp);
      const context: StrategyDisposeContext = deepFreeze({
        strategyId: instance.configuration.strategyId,
        strategyInstanceId,
        configuration: instance.configuration,
        timestamp,
        correlationId,
        metadata: EMPTY_STRATEGY_METADATA,
        state,
      });
      const result = await instance.strategy.dispose(context);
      if (!result.ok) {
        await this.emitFailureEvent(instance, correlationId, timestamp, result.error);
        return result;
      }
      instance.lifecycleState = "DISPOSED";
      instance.lastTransitionAt = timestamp;
      await this.emit("DISPOSED", instance, timestamp, correlationId, EMPTY_STRATEGY_METADATA);
      this.instances.delete(strategyInstanceId);
      this.stateManager.delete({ strategyInstanceId });
      return success(undefined, result.metadata);
    } catch (error) {
      return runtimeFailure(normalizeUnknownError(
        error,
        "UNEXPECTED_RUNTIME_ERROR",
        "Strategy disposal failed.",
        strategyInstanceId,
      ));
    }
  }

  private resolveFactory(configuration: StrategyConfiguration): StrategyFactory {
    const factory = isVersionAwareRegistry(this.registry)
      ? this.registry.getVersion(configuration.strategyId, configuration.strategyVersion)
      : this.registry.get(configuration.strategyId);

    if (factory === undefined) {
      throw new StrategyRuntimeError(
        isVersionAwareRegistry(this.registry)
          ? "STRATEGY_VERSION_NOT_REGISTERED"
          : "STRATEGY_NOT_REGISTERED",
        `Strategy '${configuration.strategyId}' version '${configuration.strategyVersion}' is not registered.`,
        { strategyInstanceId: configuration.strategyInstanceId },
      );
    }

    if (factory.manifest.version !== configuration.strategyVersion) {
      throw new StrategyRuntimeError(
        "STRATEGY_VERSION_NOT_REGISTERED",
        `Registered strategy version '${factory.manifest.version}' does not match requested version '${configuration.strategyVersion}'.`,
        { strategyInstanceId: configuration.strategyInstanceId },
      );
    }
    return factory;
  }

  private assertConfigurationIdentity(configuration: StrategyConfiguration): void {
    if (configuration === null || typeof configuration !== "object") {
      throw new StrategyRuntimeError("INVALID_ARGUMENT", "configuration is required.");
    }
    assertIdentifier(configuration.strategyId, "configuration.strategyId");
    assertIdentifier(configuration.strategyVersion, "configuration.strategyVersion");
    assertIdentifier(configuration.strategyInstanceId, "configuration.strategyInstanceId");
  }

  private assertCreatedStrategy(
    strategy: TradingStrategy,
    configuration: StrategyConfiguration,
    factory: StrategyFactory,
  ): void {
    if (strategy === null || typeof strategy !== "object") {
      throw new StrategyRuntimeError(
        "STRATEGY_OPERATION_FAILED",
        "Strategy factory returned an invalid strategy instance.",
        { strategyInstanceId: configuration.strategyInstanceId },
      );
    }

    if (
      strategy.manifest.strategyId !== configuration.strategyId ||
      strategy.manifest.version !== configuration.strategyVersion ||
      strategy.manifest.strategyId !== factory.manifest.strategyId
    ) {
      throw new StrategyRuntimeError(
        "STRATEGY_IDENTITY_MISMATCH",
        "Created strategy manifest does not match the requested strategy identity.",
        { strategyInstanceId: configuration.strategyInstanceId },
      );
    }
  }

  private storeInitializedState(
    strategyInstanceId: StrategyInstanceId,
    state: StrategyStateSnapshot,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyStateSnapshot {
    if (state.strategyInstanceId !== strategyInstanceId) {
      throw new StrategyRuntimeError(
        "STRATEGY_IDENTITY_MISMATCH",
        "Initialized state belongs to a different strategy instance.",
        { strategyInstanceId },
      );
    }

    try {
      if (!this.stateManager.has(strategyInstanceId)) {
        const request: CreateStrategyStateRequest = {
          strategyInstanceId,
          values: state.values,
          timestamp,
          metadata: state.metadata,
        };
        return this.stateManager.create(request);
      }

      const current = this.stateManager.require(strategyInstanceId);
      const request: ReplaceStrategyStateRequest = {
        strategyInstanceId,
        expectedVersion: current.version,
        values: state.values,
        timestamp,
        metadata: state.metadata,
      };
      return this.stateManager.replace(request);
    } catch (error) {
      throw normalizeUnknownError(
        error,
        "STATE_OPERATION_FAILED",
        "Unable to store initialized strategy state.",
        strategyInstanceId,
      );
    }
  }

  private async startInstance(
    instance: RuntimeInstance,
    timestamp: UnixTimestampMilliseconds,
    correlationId: StrategyCorrelationId,
  ): Promise<StrategyResult<void>> {
    this.assertLifecycle(instance, ["READY"], "start");
    const state = this.stateManager.require(instance.configuration.strategyInstanceId);
    const context: StrategyStartContext = deepFreeze({
      strategyId: instance.configuration.strategyId,
      strategyInstanceId: instance.configuration.strategyInstanceId,
      configuration: instance.configuration,
      timestamp,
      correlationId,
      metadata: EMPTY_STRATEGY_METADATA,
      state,
    });
    const result = await instance.strategy.start(context);
    if (!result.ok) {
      instance.lifecycleState = "FAILED";
      instance.lastTransitionAt = timestamp;
      await this.emitFailureEvent(instance, correlationId, timestamp, result.error);
      return result;
    }
    instance.lifecycleState = "RUNNING";
    instance.lastTransitionAt = timestamp;
    await this.emit("STARTED", instance, timestamp, correlationId, EMPTY_STRATEGY_METADATA);
    return success(undefined, result.metadata);
  }

  private validateEvaluationResult(
    instance: RuntimeInstance,
    context: StrategyEvaluationContext,
    result: StrategyEvaluationResult,
  ): void {
    if (
      result.evaluationId !== context.evaluationId ||
      result.strategyId !== instance.configuration.strategyId ||
      result.strategyInstanceId !== instance.configuration.strategyInstanceId
    ) {
      throw new StrategyRuntimeError(
        "STRATEGY_IDENTITY_MISMATCH",
        "Strategy evaluation result identity does not match its evaluation context.",
        { strategyInstanceId: context.strategyInstanceId },
      );
    }

    if (
      !Number.isInteger(result.startedAt) ||
      !Number.isInteger(result.completedAt) ||
      result.startedAt < 0 ||
      result.completedAt < result.startedAt ||
      result.durationMilliseconds !== result.completedAt - result.startedAt
    ) {
      throw new StrategyRuntimeError(
        "INVALID_EVALUATION_RESULT",
        "Strategy evaluation result contains invalid timing information.",
        { strategyInstanceId: context.strategyInstanceId },
      );
    }

    if (!this.options.validateEvaluationOutputs) {
      return;
    }

    for (const signal of result.decision.signals) {
      const report = this.validator.validateSignal(signal, result.completedAt);
      requireValidReport(
        report.valid,
        report.issues,
        "INVALID_EVALUATION_RESULT",
        `Strategy signal '${signal.signalId}'`,
        context.strategyInstanceId,
      );
    }

    for (const orderIntent of result.decision.orderIntents) {
      const report = this.validator.validateOrderIntent(orderIntent, result.completedAt);
      requireValidReport(
        report.valid,
        report.issues,
        "INVALID_EVALUATION_RESULT",
        `Strategy order intent '${orderIntent.orderIntentId}'`,
        context.strategyInstanceId,
      );
    }
  }

  private assertEvaluationIdentity(
    instance: RuntimeInstance,
    context: StrategyEvaluationContext,
  ): void {
    const configuration = instance.configuration;
    if (
      context.strategyId !== configuration.strategyId ||
      context.strategyVersion !== configuration.strategyVersion ||
      context.strategyInstanceId !== configuration.strategyInstanceId ||
      context.environment !== configuration.environment ||
      context.tradingMode !== configuration.tradingMode
    ) {
      throw new StrategyRuntimeError(
        "STRATEGY_IDENTITY_MISMATCH",
        "Evaluation context does not match the initialized strategy configuration.",
        { strategyInstanceId: configuration.strategyInstanceId },
      );
    }
  }

  private requireInstance(strategyInstanceId: StrategyInstanceId): RuntimeInstance {
    const instance = this.instances.get(strategyInstanceId);
    if (instance === undefined) {
      throw new StrategyRuntimeError(
        "INSTANCE_NOT_FOUND",
        `Strategy instance '${strategyInstanceId}' was not found.`,
        { strategyInstanceId },
      );
    }
    return instance;
  }

  private assertLifecycle(
    instance: RuntimeInstance,
    allowedStates: readonly StrategyLifecycleState[],
    operation: string,
  ): void {
    if (!allowedStates.includes(instance.lifecycleState)) {
      throw new StrategyRuntimeError(
        "INVALID_LIFECYCLE_TRANSITION",
        `Cannot ${operation} strategy instance '${instance.configuration.strategyInstanceId}' while it is '${instance.lifecycleState}'.`,
        { strategyInstanceId: instance.configuration.strategyInstanceId },
      );
    }
  }

  private async emit(
    type: StrategyRuntimeEventType,
    instance: RuntimeInstance,
    timestamp: UnixTimestampMilliseconds,
    correlationId: StrategyCorrelationId | undefined,
    payload: StrategyMetadata,
  ): Promise<void> {
    const event: StrategyRuntimeEvent = deepFreeze({
      eventId: this.idGenerator.nextEventId(
        type,
        instance.configuration.strategyInstanceId,
        timestamp,
      ),
      type,
      strategyId: instance.configuration.strategyId,
      strategyInstanceId: instance.configuration.strategyInstanceId,
      correlationId,
      timestamp,
      payload: cloneMetadata(payload),
      metadata: EMPTY_STRATEGY_METADATA,
    });

    for (const listener of this.listeners) {
      try {
        await listener.onEvent(event);
      } catch (error) {
        if (this.options.failOnEventListenerError) {
          throw new StrategyRuntimeError(
            "EVENT_LISTENER_FAILED",
            "A strategy runtime event listener failed.",
            {
              strategyInstanceId: instance.configuration.strategyInstanceId,
              cause: error,
            },
          );
        }
      }
    }
  }

  private async emitFailureEvent(
    instance: RuntimeInstance,
    correlationId: StrategyCorrelationId | undefined,
    timestamp: UnixTimestampMilliseconds,
    error: StrategyError,
  ): Promise<void> {
    await this.emit(
      "FAILED",
      instance,
      timestamp,
      correlationId,
      Object.freeze({
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
      }),
    );
  }

  private async safeEmitFailure(
    instance: RuntimeInstance,
    correlationId: StrategyCorrelationId | undefined,
    timestamp: UnixTimestampMilliseconds,
    error: StrategyRuntimeError,
  ): Promise<void> {
    try {
      await this.emitFailureEvent(instance, correlationId, timestamp, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        cause: error.cause,
        metadata: error.metadata,
      });
    } catch {
      // Preserve the original runtime failure when failure-event delivery fails.
    }
  }
}