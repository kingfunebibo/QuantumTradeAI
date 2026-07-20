/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-lifecycle-manager.ts
 *
 * Purpose:
 * Provides deterministic lifecycle orchestration for strategy runtime
 * instances, including transition validation, per-instance serialization,
 * failure recording, recovery, shutdown coordination, and immutable history.
 */

import {
  EMPTY_STRATEGY_METADATA,
  StrategyConfiguration,
  StrategyCorrelationId,
  StrategyError,
  StrategyLifecycleState,
  StrategyMetadata,
  StrategyResult,
  StrategyRuntime,
  StrategyStateSnapshot,
  StrategyInstanceId,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

/* ========================================================================== *
 * Public contracts
 * ========================================================================== */

export type StrategyLifecycleOperation =
  | "INITIALIZE"
  | "START"
  | "PAUSE"
  | "RESUME"
  | "STOP"
  | "DISPOSE"
  | "MARK_FAILED"
  | "RECOVER";

export type StrategyLifecycleTransitionStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REJECTED";

export type StrategyLifecycleManagerErrorCode =
  | "INVALID_ARGUMENT"
  | "INSTANCE_ALREADY_TRACKED"
  | "INSTANCE_NOT_TRACKED"
  | "INVALID_TRANSITION"
  | "OPERATION_IN_PROGRESS"
  | "RUNTIME_OPERATION_FAILED"
  | "RECOVERY_NOT_ALLOWED"
  | "UNEXPECTED_LIFECYCLE_ERROR";

export class StrategyLifecycleManagerError extends Error {
  public readonly code: StrategyLifecycleManagerErrorCode;
  public readonly strategyInstanceId?: StrategyInstanceId;
  public readonly operation?: StrategyLifecycleOperation;
  public readonly retryable: boolean;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLifecycleManagerErrorCode,
    message: string,
    details: {
      readonly strategyInstanceId?: StrategyInstanceId;
      readonly operation?: StrategyLifecycleOperation;
      readonly retryable?: boolean;
      readonly cause?: unknown;
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyLifecycleManagerError";
    this.code = code;
    this.strategyInstanceId = details.strategyInstanceId;
    this.operation = details.operation;
    this.retryable = details.retryable ?? false;
    this.cause = details.cause;
    this.metadata = details.metadata ?? EMPTY_STRATEGY_METADATA;
    Object.setPrototypeOf(this, StrategyLifecycleManagerError.prototype);
  }
}

export interface StrategyLifecycleClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLifecycleIdGenerator {
  nextTransitionId(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    timestamp: UnixTimestampMilliseconds,
  ): string;

  nextCorrelationId(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyCorrelationId;
}

export interface StrategyLifecycleRuntime extends StrategyRuntime {
  dispose?(
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
  ): Promise<StrategyResult<void>>;

  getLifecycleState?(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyLifecycleState | undefined;

  hasInstance?(strategyInstanceId: StrategyInstanceId): boolean;
}

export interface StrategyLifecycleTransitionRecord {
  readonly transitionId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly operation: StrategyLifecycleOperation;
  readonly fromState: StrategyLifecycleState;
  readonly toState: StrategyLifecycleState;
  readonly status: StrategyLifecycleTransitionStatus;
  readonly requestedAt: UnixTimestampMilliseconds;
  readonly completedAt?: UnixTimestampMilliseconds;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLifecycleInstanceSnapshot {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly state: StrategyLifecycleState;
  readonly createdAt: UnixTimestampMilliseconds;
  readonly lastTransitionAt: UnixTimestampMilliseconds;
  readonly lastSuccessfulOperation?: StrategyLifecycleOperation;
  readonly lastFailure?: StrategyLifecycleFailureSnapshot;
  readonly operationInProgress: boolean;
  readonly transitionCount: number;
  readonly configuration: StrategyConfiguration;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLifecycleFailureSnapshot {
  readonly failedAt: UnixTimestampMilliseconds;
  readonly operation: StrategyLifecycleOperation;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly metadata: StrategyMetadata;
}

export interface InitializeManagedStrategyRequest {
  readonly configuration: StrategyConfiguration;
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyLifecycleActionRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly reason?: string;
  readonly metadata?: StrategyMetadata;
}

export interface MarkStrategyFailedRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly operation?: StrategyLifecycleOperation;
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
  readonly metadata?: StrategyMetadata;
}

export interface RecoverManagedStrategyRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly restart?: boolean;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyLifecycleManagerOptions {
  readonly maximumHistoryPerInstance: number;
  readonly rejectConcurrentOperations: boolean;
  readonly synchronizeWithRuntimeState: boolean;
  readonly automaticallyDisposeStoppedInstances: boolean;
}

export const DEFAULT_STRATEGY_LIFECYCLE_MANAGER_OPTIONS: StrategyLifecycleManagerOptions =
  Object.freeze({
    maximumHistoryPerInstance: 256,
    rejectConcurrentOperations: true,
    synchronizeWithRuntimeState: true,
    automaticallyDisposeStoppedInstances: false,
  });

export interface StrategyLifecycleManagerDependencies {
  readonly runtime: StrategyLifecycleRuntime;
  readonly clock?: StrategyLifecycleClock;
  readonly idGenerator?: StrategyLifecycleIdGenerator;
  readonly options?: Partial<StrategyLifecycleManagerOptions>;
}

export interface StrategyLifecycleManager {
  initialize(
    request: InitializeManagedStrategyRequest,
  ): Promise<StrategyResult<StrategyStateSnapshot>>;

  pause(request: StrategyLifecycleActionRequest): Promise<StrategyResult<void>>;
  resume(request: StrategyLifecycleActionRequest): Promise<StrategyResult<void>>;
  stop(request: StrategyLifecycleActionRequest): Promise<StrategyResult<void>>;
  dispose(request: StrategyLifecycleActionRequest): Promise<StrategyResult<void>>;
  markFailed(request: MarkStrategyFailedRequest): void;
  recover(request: RecoverManagedStrategyRequest): Promise<StrategyResult<void>>;

  has(strategyInstanceId: StrategyInstanceId): boolean;
  get(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyLifecycleInstanceSnapshot | undefined;
  list(): readonly StrategyLifecycleInstanceSnapshot[];
  getHistory(
    strategyInstanceId: StrategyInstanceId,
  ): readonly StrategyLifecycleTransitionRecord[];
}

/* ========================================================================== *
 * Internal models and helpers
 * ========================================================================== */

interface ManagedLifecycleInstance {
  readonly configuration: StrategyConfiguration;
  state: StrategyLifecycleState;
  readonly createdAt: UnixTimestampMilliseconds;
  lastTransitionAt: UnixTimestampMilliseconds;
  lastSuccessfulOperation?: StrategyLifecycleOperation;
  lastFailure?: StrategyLifecycleFailureSnapshot;
  operationInProgress: boolean;
  transitionCount: number;
  metadata: StrategyMetadata;
}

const ALLOWED_TRANSITIONS = {
  CREATED: ["INITIALIZING", "FAILED", "DISPOSED"],
  INITIALIZING: ["READY", "RUNNING", "FAILED", "DISPOSED"],
  READY: ["RUNNING", "STOPPING", "FAILED", "DISPOSED"],
  RUNNING: ["PAUSED", "STOPPING", "FAILED"],
  PAUSED: ["RUNNING", "STOPPING", "FAILED"],
  STOPPING: ["STOPPED", "FAILED"],
  STOPPED: ["INITIALIZING", "DISPOSED", "FAILED"],
  FAILED: ["INITIALIZING", "STOPPING", "STOPPED", "DISPOSED"],
  DISPOSED: [],
} as const satisfies Readonly<
  Record<StrategyLifecycleState, readonly StrategyLifecycleState[]>
>;

class SystemLifecycleClock implements StrategyLifecycleClock {
  public now(): UnixTimestampMilliseconds {
    return Date.now();
  }
}

class DeterministicLifecycleIdGenerator
  implements StrategyLifecycleIdGenerator
{
  private sequence = 0;

  public nextTransitionId(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    timestamp: UnixTimestampMilliseconds,
  ): string {
    this.sequence += 1;
    return [
      "strategy-lifecycle",
      operation.toLowerCase(),
      strategyInstanceId,
      String(timestamp),
      String(this.sequence).padStart(8, "0"),
    ].join(":");
  }

  public nextCorrelationId(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyCorrelationId {
    this.sequence += 1;
    return [
      "strategy-lifecycle-correlation",
      operation.toLowerCase(),
      strategyInstanceId,
      String(timestamp),
      String(this.sequence).padStart(8, "0"),
    ].join(":");
  }
}

function assertIdentifier(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new StrategyLifecycleManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string without surrounding whitespace.`,
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyLifecycleManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
  }
}

function assertReason(reason: string | undefined, operation: string): string {
  const normalized = reason?.trim() ?? "";
  if (normalized.length === 0) {
    throw new StrategyLifecycleManagerError(
      "INVALID_ARGUMENT",
      `${operation} requires a non-empty reason.`,
    );
  }
  return normalized;
}

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneUnknown(item);
    }
    return result as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(cloneUnknown(value));
}

function mergeMetadata(
  base: StrategyMetadata,
  additional?: StrategyMetadata,
): StrategyMetadata {
  return immutableCopy({ ...base, ...(additional ?? {}) }) as StrategyMetadata;
}

function resultSucceeded<T>(result: StrategyResult<T>): boolean {
  return result.ok;
}

function resultError(result: StrategyResult<unknown>): {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
} {
  if (result.ok) {
    return { code: "UNKNOWN", message: "Unknown lifecycle error.", retryable: false };
  }
  return {
    code: result.error.code,
    message: result.error.message,
    retryable: result.error.retryable,
  };
}

/* ========================================================================== *
 * In-memory lifecycle manager
 * ========================================================================== */

export class InMemoryStrategyLifecycleManager
  implements StrategyLifecycleManager
{
  private readonly runtime: StrategyLifecycleRuntime;
  private readonly clock: StrategyLifecycleClock;
  private readonly idGenerator: StrategyLifecycleIdGenerator;
  private readonly options: StrategyLifecycleManagerOptions;
  private readonly instances = new Map<
    StrategyInstanceId,
    ManagedLifecycleInstance
  >();
  private readonly histories = new Map<
    StrategyInstanceId,
    StrategyLifecycleTransitionRecord[]
  >();
  private readonly operationQueues = new Map<StrategyInstanceId, Promise<void>>();

  public constructor(dependencies: StrategyLifecycleManagerDependencies) {
    if (!dependencies || !dependencies.runtime) {
      throw new StrategyLifecycleManagerError(
        "INVALID_ARGUMENT",
        "A strategy runtime dependency is required.",
      );
    }

    this.runtime = dependencies.runtime;
    this.clock = dependencies.clock ?? new SystemLifecycleClock();
    this.idGenerator =
      dependencies.idGenerator ?? new DeterministicLifecycleIdGenerator();
    this.options = Object.freeze({
      ...DEFAULT_STRATEGY_LIFECYCLE_MANAGER_OPTIONS,
      ...(dependencies.options ?? {}),
    });

    if (
      !Number.isInteger(this.options.maximumHistoryPerInstance) ||
      this.options.maximumHistoryPerInstance < 1
    ) {
      throw new StrategyLifecycleManagerError(
        "INVALID_ARGUMENT",
        "maximumHistoryPerInstance must be a positive integer.",
      );
    }
  }

  public has(strategyInstanceId: StrategyInstanceId): boolean {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    return this.instances.has(strategyInstanceId);
  }

  public get(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyLifecycleInstanceSnapshot | undefined {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    const instance = this.instances.get(strategyInstanceId);
    if (!instance) {
      return undefined;
    }
    this.synchronizeRuntimeState(strategyInstanceId, instance);
    return this.toSnapshot(strategyInstanceId, instance);
  }

  public list(): readonly StrategyLifecycleInstanceSnapshot[] {
    return Object.freeze(
      [...this.instances.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([strategyInstanceId, instance]) => {
          this.synchronizeRuntimeState(strategyInstanceId, instance);
          return this.toSnapshot(strategyInstanceId, instance);
        }),
    );
  }

  public getHistory(
    strategyInstanceId: StrategyInstanceId,
  ): readonly StrategyLifecycleTransitionRecord[] {
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    return Object.freeze(
      (this.histories.get(strategyInstanceId) ?? []).map((record) =>
        immutableCopy(record),
      ),
    );
  }

  public async initialize(
    request: InitializeManagedStrategyRequest,
  ): Promise<StrategyResult<StrategyStateSnapshot>> {
    const configuration = request.configuration;
    if (!configuration) {
      throw new StrategyLifecycleManagerError(
        "INVALID_ARGUMENT",
        "configuration is required.",
      );
    }

    const strategyInstanceId = configuration.strategyInstanceId;
    assertIdentifier(strategyInstanceId, "configuration.strategyInstanceId");
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp, "timestamp");

    if (this.instances.has(strategyInstanceId)) {
      throw new StrategyLifecycleManagerError(
        "INSTANCE_ALREADY_TRACKED",
        `Strategy instance '${strategyInstanceId}' is already tracked.`,
        { strategyInstanceId, operation: "INITIALIZE" },
      );
    }

    const metadata = mergeMetadata(configuration.metadata, request.metadata);
    const instance: ManagedLifecycleInstance = {
      configuration: immutableCopy(configuration),
      state: "CREATED",
      createdAt: timestamp,
      lastTransitionAt: timestamp,
      operationInProgress: false,
      transitionCount: 0,
      metadata,
    };
    this.instances.set(strategyInstanceId, instance);
    this.histories.set(strategyInstanceId, []);

    return this.runSerialized(strategyInstanceId, "INITIALIZE", async () => {
      this.transition(instance, strategyInstanceId, "INITIALIZE", "INITIALIZING", timestamp, metadata);
      const result = await this.runtime.initialize(configuration, timestamp);

      if (!resultSucceeded(result)) {
        this.recordRuntimeFailure(
          instance,
          strategyInstanceId,
          "INITIALIZE",
          timestamp,
          result,
          metadata,
        );
        return result;
      }

      const runtimeState = this.runtime.getLifecycleState?.(strategyInstanceId);
      const targetState: StrategyLifecycleState =
        runtimeState === "RUNNING" ? "RUNNING" : "READY";
      this.transition(
        instance,
        strategyInstanceId,
        "INITIALIZE",
        targetState,
        timestamp,
        metadata,
      );
      instance.lastSuccessfulOperation = "INITIALIZE";
      instance.lastFailure = undefined;
      return result;
    });
  }

  public async pause(
    request: StrategyLifecycleActionRequest,
  ): Promise<StrategyResult<void>> {
    const reason = assertReason(request.reason, "pause");
    return this.executeRuntimeAction(
      request,
      "PAUSE",
      ["RUNNING"],
      "PAUSED",
      (timestamp) =>
        this.runtime.pause(request.strategyInstanceId, reason, timestamp),
    );
  }

  public async resume(
    request: StrategyLifecycleActionRequest,
  ): Promise<StrategyResult<void>> {
    return this.executeRuntimeAction(
      request,
      "RESUME",
      ["PAUSED"],
      "RUNNING",
      (timestamp) => this.runtime.resume(request.strategyInstanceId, timestamp),
    );
  }

  public async stop(
    request: StrategyLifecycleActionRequest,
  ): Promise<StrategyResult<void>> {
    const reason = assertReason(request.reason, "stop");
    const result = await this.executeRuntimeAction(
      request,
      "STOP",
      ["READY", "RUNNING", "PAUSED", "FAILED"],
      "STOPPED",
      async (timestamp, instance) => {
        this.transition(
          instance,
          request.strategyInstanceId,
          "STOP",
          "STOPPING",
          timestamp,
          request.metadata,
          reason,
        );
        return this.runtime.stop(request.strategyInstanceId, reason, timestamp);
      },
      reason,
    );

    if (
      result.ok &&
      this.options.automaticallyDisposeStoppedInstances
    ) {
      return this.dispose({
        strategyInstanceId: request.strategyInstanceId,
        timestamp: request.timestamp,
        reason: "Automatic disposal after stop.",
        metadata: request.metadata,
      });
    }

    return result;
  }

  public async dispose(
    request: StrategyLifecycleActionRequest,
  ): Promise<StrategyResult<void>> {
    const strategyInstanceId = request.strategyInstanceId;
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    const instance = this.requireInstance(strategyInstanceId, "DISPOSE");
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp, "timestamp");
    const metadata = mergeMetadata(instance.metadata, request.metadata);

    return this.runSerialized(strategyInstanceId, "DISPOSE", async () => {
      this.synchronizeRuntimeState(strategyInstanceId, instance);
      this.assertOperationAllowed(instance, strategyInstanceId, "DISPOSE", [
        "CREATED",
        "READY",
        "STOPPED",
        "FAILED",
      ]);

      if (this.runtime.dispose) {
        const result = await this.runtime.dispose(strategyInstanceId, timestamp);
        if (!result.ok) {
          this.recordRuntimeFailure(
            instance,
            strategyInstanceId,
            "DISPOSE",
            timestamp,
            result,
            metadata,
          );
          return result;
        }
      }

      this.transition(
        instance,
        strategyInstanceId,
        "DISPOSE",
        "DISPOSED",
        timestamp,
        metadata,
        request.reason,
      );
      instance.lastSuccessfulOperation = "DISPOSE";
      instance.lastFailure = undefined;
      return successResult<void>(undefined);
    });
  }

  public markFailed(request: MarkStrategyFailedRequest): void {
    const strategyInstanceId = request.strategyInstanceId;
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    assertIdentifier(request.code, "code");
    if (request.message.trim().length === 0) {
      throw new StrategyLifecycleManagerError(
        "INVALID_ARGUMENT",
        "message must be non-empty.",
      );
    }

    const instance = this.requireInstance(
      strategyInstanceId,
      request.operation ?? "MARK_FAILED",
    );
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp, "timestamp");
    const metadata = mergeMetadata(instance.metadata, request.metadata);
    const operation = request.operation ?? "MARK_FAILED";

    instance.lastFailure = immutableCopy({
      failedAt: timestamp,
      operation,
      code: request.code,
      message: request.message,
      retryable: request.retryable ?? false,
      metadata,
    });
    this.transition(
      instance,
      strategyInstanceId,
      operation,
      "FAILED",
      timestamp,
      metadata,
      request.message,
      "FAILED",
      request.code,
      request.message,
    );
  }

  public async recover(
    request: RecoverManagedStrategyRequest,
  ): Promise<StrategyResult<void>> {
    const strategyInstanceId = request.strategyInstanceId;
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    const instance = this.requireInstance(strategyInstanceId, "RECOVER");
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp, "timestamp");
    const metadata = mergeMetadata(instance.metadata, request.metadata);

    return this.runSerialized(strategyInstanceId, "RECOVER", async () => {
      this.synchronizeRuntimeState(strategyInstanceId, instance);
      if (instance.state !== "FAILED" && instance.state !== "STOPPED") {
        throw new StrategyLifecycleManagerError(
          "RECOVERY_NOT_ALLOWED",
          `Strategy instance '${strategyInstanceId}' cannot recover from state '${instance.state}'.`,
          { strategyInstanceId, operation: "RECOVER" },
        );
      }

      this.transition(
        instance,
        strategyInstanceId,
        "RECOVER",
        "INITIALIZING",
        timestamp,
        metadata,
      );

      const result = await this.runtime.initialize(
        instance.configuration,
        timestamp,
      );
      if (!result.ok) {
        this.recordRuntimeFailure(
          instance,
          strategyInstanceId,
          "RECOVER",
          timestamp,
          result,
          metadata,
        );
        return failureResult<void>(result.error);
      }

      const runtimeState = this.runtime.getLifecycleState?.(strategyInstanceId);
      const targetState: StrategyLifecycleState =
        request.restart === false
          ? "READY"
          : runtimeState === "READY"
            ? "READY"
            : "RUNNING";
      this.transition(
        instance,
        strategyInstanceId,
        "RECOVER",
        targetState,
        timestamp,
        metadata,
      );
      instance.lastSuccessfulOperation = "RECOVER";
      instance.lastFailure = undefined;
      return successResult<void>(undefined);
    });
  }

  private async executeRuntimeAction(
    request: StrategyLifecycleActionRequest,
    operation: StrategyLifecycleOperation,
    allowedStates: readonly StrategyLifecycleState[],
    successState: StrategyLifecycleState,
    action: (
      timestamp: UnixTimestampMilliseconds,
      instance: ManagedLifecycleInstance,
    ) => Promise<StrategyResult<void>>,
    reason?: string,
  ): Promise<StrategyResult<void>> {
    const strategyInstanceId = request.strategyInstanceId;
    assertIdentifier(strategyInstanceId, "strategyInstanceId");
    const instance = this.requireInstance(strategyInstanceId, operation);
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp, "timestamp");
    const metadata = mergeMetadata(instance.metadata, request.metadata);

    return this.runSerialized(strategyInstanceId, operation, async () => {
      this.synchronizeRuntimeState(strategyInstanceId, instance);
      this.assertOperationAllowed(
        instance,
        strategyInstanceId,
        operation,
        allowedStates,
      );

      const result = await action(timestamp, instance);
      if (!result.ok) {
        this.recordRuntimeFailure(
          instance,
          strategyInstanceId,
          operation,
          timestamp,
          result,
          metadata,
        );
        return result;
      }

      this.transition(
        instance,
        strategyInstanceId,
        operation,
        successState,
        timestamp,
        metadata,
        reason,
      );
      instance.lastSuccessfulOperation = operation;
      instance.lastFailure = undefined;
      return result;
    });
  }

  private async runSerialized<T>(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    action: () => Promise<StrategyResult<T>>,
  ): Promise<StrategyResult<T>> {
    const instance = this.requireInstance(strategyInstanceId, operation);

    if (
      this.options.rejectConcurrentOperations &&
      instance.operationInProgress
    ) {
      throw new StrategyLifecycleManagerError(
        "OPERATION_IN_PROGRESS",
        `A lifecycle operation is already running for '${strategyInstanceId}'.`,
        {
          strategyInstanceId,
          operation,
          retryable: true,
        },
      );
    }

    const previous = this.operationQueues.get(strategyInstanceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.operationQueues.set(strategyInstanceId, previous.then(() => current));

    if (!this.options.rejectConcurrentOperations) {
      await previous;
    }

    instance.operationInProgress = true;
    try {
      return await action();
    } catch (error) {
      if (error instanceof StrategyLifecycleManagerError) {
        throw error;
      }
      throw new StrategyLifecycleManagerError(
        "UNEXPECTED_LIFECYCLE_ERROR",
        `Unexpected lifecycle error during '${operation}' for '${strategyInstanceId}'.`,
        {
          strategyInstanceId,
          operation,
          cause: error,
        },
      );
    } finally {
      instance.operationInProgress = false;
      release();
      if (this.operationQueues.get(strategyInstanceId) === current) {
        this.operationQueues.delete(strategyInstanceId);
      }
    }
  }

  private requireInstance(
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
  ): ManagedLifecycleInstance {
    const instance = this.instances.get(strategyInstanceId);
    if (!instance) {
      throw new StrategyLifecycleManagerError(
        "INSTANCE_NOT_TRACKED",
        `Strategy instance '${strategyInstanceId}' is not tracked.`,
        { strategyInstanceId, operation },
      );
    }
    return instance;
  }

  private assertOperationAllowed(
    instance: ManagedLifecycleInstance,
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    allowedStates: readonly StrategyLifecycleState[],
  ): void {
    if (!allowedStates.includes(instance.state)) {
      this.appendHistory(strategyInstanceId, {
        transitionId: this.idGenerator.nextTransitionId(
          strategyInstanceId,
          operation,
          this.clock.now(),
        ),
        correlationId: this.idGenerator.nextCorrelationId(
          strategyInstanceId,
          operation,
          this.clock.now(),
        ),
        strategyInstanceId,
        operation,
        fromState: instance.state,
        toState: instance.state,
        status: "REJECTED",
        requestedAt: this.clock.now(),
        completedAt: this.clock.now(),
        errorCode: "INVALID_TRANSITION",
        errorMessage: `Operation '${operation}' is not allowed from '${instance.state}'.`,
        metadata: instance.metadata,
      });
      throw new StrategyLifecycleManagerError(
        "INVALID_TRANSITION",
        `Operation '${operation}' is not allowed for '${strategyInstanceId}' while in state '${instance.state}'.`,
        { strategyInstanceId, operation },
      );
    }
  }

  private transition(
    instance: ManagedLifecycleInstance,
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    toState: StrategyLifecycleState,
    timestamp: UnixTimestampMilliseconds,
    metadata?: StrategyMetadata,
    reason?: string,
    status: StrategyLifecycleTransitionStatus = "SUCCEEDED",
    errorCode?: string,
    errorMessage?: string,
  ): void {
    const fromState = instance.state;
    const allowedTargets: readonly StrategyLifecycleState[] = ALLOWED_TRANSITIONS[fromState];
    if (fromState !== toState && !allowedTargets.includes(toState)) {
      throw new StrategyLifecycleManagerError(
        "INVALID_TRANSITION",
        `Transition '${fromState}' -> '${toState}' is not permitted.`,
        { strategyInstanceId, operation },
      );
    }

    const mergedMetadata = mergeMetadata(instance.metadata, metadata);
    const record: StrategyLifecycleTransitionRecord = {
      transitionId: this.idGenerator.nextTransitionId(
        strategyInstanceId,
        operation,
        timestamp,
      ),
      correlationId: this.idGenerator.nextCorrelationId(
        strategyInstanceId,
        operation,
        timestamp,
      ),
      strategyInstanceId,
      operation,
      fromState,
      toState,
      status,
      requestedAt: timestamp,
      completedAt: timestamp,
      reason,
      errorCode,
      errorMessage,
      metadata: mergedMetadata,
    };

    instance.state = toState;
    instance.lastTransitionAt = timestamp;
    instance.transitionCount += 1;
    instance.metadata = mergedMetadata;
    this.appendHistory(strategyInstanceId, record);
  }

  private recordRuntimeFailure(
    instance: ManagedLifecycleInstance,
    strategyInstanceId: StrategyInstanceId,
    operation: StrategyLifecycleOperation,
    timestamp: UnixTimestampMilliseconds,
    result: StrategyResult<unknown>,
    metadata: StrategyMetadata,
  ): void {
    const error = resultError(result);
    instance.lastFailure = immutableCopy({
      failedAt: timestamp,
      operation,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      metadata,
    });
    this.transition(
      instance,
      strategyInstanceId,
      operation,
      "FAILED",
      timestamp,
      metadata,
      error.message,
      "FAILED",
      error.code,
      error.message,
    );
  }

  private synchronizeRuntimeState(
    strategyInstanceId: StrategyInstanceId,
    instance: ManagedLifecycleInstance,
  ): void {
    if (!this.options.synchronizeWithRuntimeState) {
      return;
    }
    const runtimeState = this.runtime.getLifecycleState?.(strategyInstanceId);
    if (runtimeState && runtimeState !== instance.state) {
      instance.state = runtimeState;
      instance.lastTransitionAt = this.clock.now();
    }
  }

  private appendHistory(
    strategyInstanceId: StrategyInstanceId,
    record: StrategyLifecycleTransitionRecord,
  ): void {
    const history = this.histories.get(strategyInstanceId) ?? [];
    history.push(immutableCopy(record));
    const overflow = history.length - this.options.maximumHistoryPerInstance;
    if (overflow > 0) {
      history.splice(0, overflow);
    }
    this.histories.set(strategyInstanceId, history);
  }

  private toSnapshot(
    strategyInstanceId: StrategyInstanceId,
    instance: ManagedLifecycleInstance,
  ): StrategyLifecycleInstanceSnapshot {
    return immutableCopy({
      strategyInstanceId,
      strategyId: instance.configuration.strategyId,
      strategyVersion: instance.configuration.strategyVersion,
      state: instance.state,
      createdAt: instance.createdAt,
      lastTransitionAt: instance.lastTransitionAt,
      lastSuccessfulOperation: instance.lastSuccessfulOperation,
      lastFailure: instance.lastFailure,
      operationInProgress: instance.operationInProgress,
      transitionCount: instance.transitionCount,
      configuration: instance.configuration,
      metadata: instance.metadata,
    });
  }
}

function successResult<T>(value: T): StrategyResult<T> {
  return immutableCopy({ ok: true, value, metadata: EMPTY_STRATEGY_METADATA }) as StrategyResult<T>;
}

function failureResult<T>(error: StrategyError): StrategyResult<T> {
  return immutableCopy({ ok: false, error, metadata: EMPTY_STRATEGY_METADATA }) as StrategyResult<T>;
}