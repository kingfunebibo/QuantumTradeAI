/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 9: Deterministic AI model runtime and execution coordinator.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiInferenceRequest,
  type AiInferenceResponse,
  type AiInferenceStatus,
  type AiModelDescriptor,
  type AiModelLifecycleStatus,
  type AiModelReference,
  type AiModelRuntimeConfiguration,
  type AiStrategyMetadata,
  type AiStrategyTimestamp,
} from "./ai-strategy-contracts";
import type { AiInferenceEngine } from "./ai-inference-engine";
import type {
  AiModelRegistry,
  AiModelResolutionRequest,
  AiModelResolutionResult,
} from "./ai-model-registry";

export type AiModelRuntimeState =
  | "UNLOADED"
  | "LOADING"
  | "WARMING"
  | "READY"
  | "BUSY"
  | "DEGRADED"
  | "UNLOADING"
  | "FAILED";

export type AiModelRuntimeEventType =
  | "INSTANCE_CREATED"
  | "INSTANCE_LOADING"
  | "INSTANCE_LOADED"
  | "INSTANCE_WARMING"
  | "INSTANCE_READY"
  | "INSTANCE_BUSY"
  | "INSTANCE_DEGRADED"
  | "INSTANCE_FAILED"
  | "INSTANCE_UNLOADING"
  | "INSTANCE_UNLOADED"
  | "EXECUTION_QUEUED"
  | "EXECUTION_STARTED"
  | "EXECUTION_RETRIED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELLED";

export interface AiModelRuntimeOptions {
  readonly maximumInstancesPerModel?: number;
  readonly maximumConcurrentExecutionsPerInstance?: number;
  readonly maximumQueueSize?: number;
  readonly defaultLoadTimeoutMs?: number;
  readonly defaultWarmupTimeoutMs?: number;
  readonly defaultUnloadTimeoutMs?: number;
  readonly defaultExecutionTimeoutMs?: number;
  readonly defaultMaximumAttempts?: number;
  readonly defaultRetryDelayMs?: number;
  readonly idleInstanceTtlMs?: number;
  readonly maximumAuditEntries?: number;
  readonly failClosed?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly metadata?: AiStrategyMetadata;
}

export interface AiModelRuntimeLoadRequest {
  readonly model: AiModelReference;
  readonly runtimeConfiguration?: AiModelRuntimeConfiguration;
  readonly minimumInstances?: number;
  readonly warmup?: boolean;
  readonly forceReload?: boolean;
  readonly metadata?: AiStrategyMetadata;
}

export interface AiModelRuntimeExecutionRequest {
  readonly request: AiInferenceRequest;
  readonly resolution?: AiModelResolutionRequest;
  readonly maximumAttempts?: number;
  readonly retryDelayMs?: number;
  readonly queueTimeoutMs?: number;
  readonly executionTimeoutMs?: number;
  readonly preferredInstanceId?: string;
  readonly metadata?: AiStrategyMetadata;
}

export interface AiModelRuntimeInstance {
  readonly instanceId: string;
  readonly model: AiModelReference;
  readonly descriptor: AiModelDescriptor;
  readonly runtimeConfiguration: AiModelRuntimeConfiguration;
  readonly state: AiModelRuntimeState;
  readonly createdAt: AiStrategyTimestamp;
  readonly updatedAt: AiStrategyTimestamp;
  readonly loadedAt?: AiStrategyTimestamp;
  readonly warmedAt?: AiStrategyTimestamp;
  readonly lastUsedAt?: AiStrategyTimestamp;
  readonly activeExecutions: number;
  readonly completedExecutions: number;
  readonly failedExecutions: number;
  readonly consecutiveFailures: number;
  readonly averageLatencyMs: number;
  readonly maximumLatencyMs: number;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRuntimeExecution {
  readonly executionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly instanceId?: string;
  readonly model: AiModelReference;
  readonly status: AiInferenceStatus;
  readonly attemptCount: number;
  readonly queuedAt: AiStrategyTimestamp;
  readonly startedAt?: AiStrategyTimestamp;
  readonly completedAt?: AiStrategyTimestamp;
  readonly queueLatencyMs?: number;
  readonly executionLatencyMs?: number;
  readonly response?: AiInferenceResponse;
  readonly error?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRuntimeAuditEntry {
  readonly auditId: string;
  readonly eventType: AiModelRuntimeEventType;
  readonly timestamp: AiStrategyTimestamp;
  readonly instanceId?: string;
  readonly executionId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly message: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRuntimeMetrics {
  readonly instanceCount: number;
  readonly readyInstanceCount: number;
  readonly busyInstanceCount: number;
  readonly degradedInstanceCount: number;
  readonly failedInstanceCount: number;
  readonly queuedExecutionCount: number;
  readonly activeExecutionCount: number;
  readonly completedExecutionCount: number;
  readonly successfulExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly timedOutExecutionCount: number;
  readonly cancelledExecutionCount: number;
  readonly retryCount: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
}

export interface AiModelRuntimeSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly instances: readonly AiModelRuntimeInstance[];
  readonly executions: readonly AiModelRuntimeExecution[];
  readonly auditHistory: readonly AiModelRuntimeAuditEntry[];
  readonly metrics: AiModelRuntimeMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRuntime {
  load(request: AiModelRuntimeLoadRequest): Promise<readonly AiModelRuntimeInstance[]>;
  unload(model: AiModelReference, force?: boolean): Promise<number>;
  unloadInstance(instanceId: string, force?: boolean): Promise<boolean>;
  execute(request: AiModelRuntimeExecutionRequest): Promise<AiInferenceResponse>;
  cancel(executionId: string): boolean;
  getInstance(instanceId: string): AiModelRuntimeInstance | undefined;
  listInstances(model?: AiModelReference): readonly AiModelRuntimeInstance[];
  listExecutions(): readonly AiModelRuntimeExecution[];
  reapIdleInstances(): Promise<number>;
  snapshot(): AiModelRuntimeSnapshot;
}

interface MutableInstance {
  instanceId: string;
  model: AiModelReference;
  descriptor: AiModelDescriptor;
  runtimeConfiguration: AiModelRuntimeConfiguration;
  state: AiModelRuntimeState;
  createdAt: AiStrategyTimestamp;
  updatedAt: AiStrategyTimestamp;
  loadedAt?: AiStrategyTimestamp;
  warmedAt?: AiStrategyTimestamp;
  lastUsedAt?: AiStrategyTimestamp;
  activeExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  consecutiveFailures: number;
  totalLatencyMs: number;
  maximumLatencyMs: number;
  metadata: AiStrategyMetadata;
}

interface MutableExecution {
  executionId: string;
  requestId: string;
  correlationId: string;
  instanceId?: string;
  model: AiModelReference;
  status: AiInferenceStatus;
  attemptCount: number;
  queuedAt: AiStrategyTimestamp;
  startedAt?: AiStrategyTimestamp;
  completedAt?: AiStrategyTimestamp;
  queueLatencyMs?: number;
  executionLatencyMs?: number;
  response?: AiInferenceResponse;
  error?: string;
  metadata: AiStrategyMetadata;
}

interface ResolvedOptions {
  readonly maximumInstancesPerModel: number;
  readonly maximumConcurrentExecutionsPerInstance: number;
  readonly maximumQueueSize: number;
  readonly defaultLoadTimeoutMs: number;
  readonly defaultWarmupTimeoutMs: number;
  readonly defaultUnloadTimeoutMs: number;
  readonly defaultExecutionTimeoutMs: number;
  readonly defaultMaximumAttempts: number;
  readonly defaultRetryDelayMs: number;
  readonly idleInstanceTtlMs: number;
  readonly maximumAuditEntries: number;
  readonly failClosed: boolean;
  readonly clock: () => AiStrategyTimestamp;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly metadata: AiStrategyMetadata;
}

const DEFAULT_MAXIMUM_INSTANCES_PER_MODEL = 4;
const DEFAULT_MAXIMUM_CONCURRENT_EXECUTIONS = 1;
const DEFAULT_MAXIMUM_QUEUE_SIZE = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAXIMUM_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_IDLE_INSTANCE_TTL_MS = 300_000;
const DEFAULT_MAXIMUM_AUDIT_ENTRIES = 20_000;

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function cloneMetadata(metadata?: AiStrategyMetadata): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const cloned: Record<
    string,
    string | number | boolean | null | readonly (
      | string
      | number
      | boolean
      | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    cloned[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(cloned);
}

function cloneReference(reference: AiModelReference): AiModelReference {
  return Object.freeze({ ...reference });
}

function cloneDescriptor(descriptor: AiModelDescriptor): AiModelDescriptor {
  return Object.freeze({
    ...descriptor,
    supportedMarketTypes: Object.freeze([...descriptor.supportedMarketTypes]),
    supportedTimeframes: Object.freeze([...descriptor.supportedTimeframes]),
    requiredFeatures: Object.freeze([...descriptor.requiredFeatures]),
    optionalFeatures: Object.freeze([...descriptor.optionalFeatures]),
    metadata: cloneMetadata(descriptor.metadata),
  });
}

function cloneConfiguration(
  configuration: AiModelRuntimeConfiguration,
): AiModelRuntimeConfiguration {
  return Object.freeze({
    ...configuration,
    parameters: Object.freeze({ ...configuration.parameters }),
    metadata: cloneMetadata(configuration.metadata),
  });
}

function cloneResponse(response: AiInferenceResponse): AiInferenceResponse {
  return Object.freeze({
    ...response,
    prediction:
      response.prediction === undefined
        ? undefined
        : Object.freeze({
            ...response.prediction,
            payload: Object.freeze({ ...response.prediction.payload }),
          }),
    featureContributions: Object.freeze(
      response.featureContributions.map((entry) =>
        Object.freeze({
          ...entry,
          metadata: cloneMetadata(entry.metadata),
        }),
      ),
    ),
    warnings: Object.freeze([...response.warnings]),
    error:
      response.error === undefined
        ? undefined
        : Object.freeze({
            ...response.error,
            metadata: cloneMetadata(response.error.metadata),
          }),
    metadata: cloneMetadata(response.metadata),
  });
}

function modelKey(reference: AiModelReference): string {
  return `${reference.providerId}::${reference.modelId}::${reference.modelVersion}`;
}

function sameModel(
  left: AiModelReference,
  right: AiModelReference,
): boolean {
  return modelKey(left) === modelKey(right);
}

function cloneInstance(instance: MutableInstance): AiModelRuntimeInstance {
  return Object.freeze({
    instanceId: instance.instanceId,
    model: cloneReference(instance.model),
    descriptor: cloneDescriptor(instance.descriptor),
    runtimeConfiguration: cloneConfiguration(instance.runtimeConfiguration),
    state: instance.state,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    loadedAt: instance.loadedAt,
    warmedAt: instance.warmedAt,
    lastUsedAt: instance.lastUsedAt,
    activeExecutions: instance.activeExecutions,
    completedExecutions: instance.completedExecutions,
    failedExecutions: instance.failedExecutions,
    consecutiveFailures: instance.consecutiveFailures,
    averageLatencyMs:
      instance.completedExecutions === 0
        ? 0
        : instance.totalLatencyMs / instance.completedExecutions,
    maximumLatencyMs: instance.maximumLatencyMs,
    metadata: cloneMetadata(instance.metadata),
  });
}

function cloneExecution(
  execution: MutableExecution,
): AiModelRuntimeExecution {
  return Object.freeze({
    ...execution,
    model: cloneReference(execution.model),
    response:
      execution.response === undefined
        ? undefined
        : cloneResponse(execution.response),
    metadata: cloneMetadata(execution.metadata),
  });
}

function lifecycleAllowsRuntime(status: AiModelLifecycleStatus): boolean {
  return status === "READY" || status === "ACTIVE" || status === "DEGRADED";
}

export class DeterministicAiModelRuntime implements AiModelRuntime {
  private readonly options: ResolvedOptions;
  private readonly instances = new Map<string, MutableInstance>();
  private readonly executions = new Map<string, MutableExecution>();
  private readonly cancelledExecutionIds = new Set<string>();
  private readonly auditHistory: AiModelRuntimeAuditEntry[] = [];
  private sequence = 0;
  private queuedExecutionCount = 0;
  private retryCount = 0;
  private totalExecutionLatencyMs = 0;
  private maximumExecutionLatencyMs = 0;

  public constructor(
    private readonly registry: AiModelRegistry,
    private readonly inferenceEngine: AiInferenceEngine,
    options: AiModelRuntimeOptions = {},
  ) {
    const maximumInstancesPerModel =
      options.maximumInstancesPerModel ?? DEFAULT_MAXIMUM_INSTANCES_PER_MODEL;
    const maximumConcurrentExecutionsPerInstance =
      options.maximumConcurrentExecutionsPerInstance ??
      DEFAULT_MAXIMUM_CONCURRENT_EXECUTIONS;
    const maximumQueueSize =
      options.maximumQueueSize ?? DEFAULT_MAXIMUM_QUEUE_SIZE;
    const maximumAuditEntries =
      options.maximumAuditEntries ?? DEFAULT_MAXIMUM_AUDIT_ENTRIES;

    assertPositiveInteger(maximumInstancesPerModel, "maximumInstancesPerModel");
    assertPositiveInteger(
      maximumConcurrentExecutionsPerInstance,
      "maximumConcurrentExecutionsPerInstance",
    );
    assertPositiveInteger(maximumQueueSize, "maximumQueueSize");
    assertPositiveInteger(maximumAuditEntries, "maximumAuditEntries");

    const defaultMaximumAttempts =
      options.defaultMaximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
    assertPositiveInteger(defaultMaximumAttempts, "defaultMaximumAttempts");

    const idleInstanceTtlMs =
      options.idleInstanceTtlMs ?? DEFAULT_IDLE_INSTANCE_TTL_MS;
    assertNonNegativeInteger(idleInstanceTtlMs, "idleInstanceTtlMs");

    this.options = Object.freeze({
      maximumInstancesPerModel,
      maximumConcurrentExecutionsPerInstance,
      maximumQueueSize,
      defaultLoadTimeoutMs: options.defaultLoadTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      defaultWarmupTimeoutMs:
        options.defaultWarmupTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      defaultUnloadTimeoutMs:
        options.defaultUnloadTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      defaultExecutionTimeoutMs:
        options.defaultExecutionTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      defaultMaximumAttempts,
      defaultRetryDelayMs:
        options.defaultRetryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      idleInstanceTtlMs,
      maximumAuditEntries,
      failClosed: options.failClosed ?? true,
      clock: options.clock ?? defaultClock,
      sleep: options.sleep ?? defaultSleep,
      idFactory: options.idFactory ?? defaultIdFactory,
      metadata: cloneMetadata(options.metadata),
    });

    assertPositiveInteger(this.options.defaultLoadTimeoutMs, "defaultLoadTimeoutMs");
    assertPositiveInteger(
      this.options.defaultWarmupTimeoutMs,
      "defaultWarmupTimeoutMs",
    );
    assertPositiveInteger(
      this.options.defaultUnloadTimeoutMs,
      "defaultUnloadTimeoutMs",
    );
    assertPositiveInteger(
      this.options.defaultExecutionTimeoutMs,
      "defaultExecutionTimeoutMs",
    );
    assertNonNegativeInteger(
      this.options.defaultRetryDelayMs,
      "defaultRetryDelayMs",
    );
  }

  public async load(
    request: AiModelRuntimeLoadRequest,
  ): Promise<readonly AiModelRuntimeInstance[]> {
    this.validateReference(request.model);
    const minimumInstances = request.minimumInstances ?? 1;
    assertPositiveInteger(minimumInstances, "request.minimumInstances");

    if (minimumInstances > this.options.maximumInstancesPerModel) {
      throw new RangeError(
        "request.minimumInstances exceeds maximumInstancesPerModel.",
      );
    }

    const descriptor = this.registry.getModel(request.model);
    if (descriptor === undefined) {
      throw new Error(`AI model '${modelKey(request.model)}' is not registered.`);
    }
    if (!lifecycleAllowsRuntime(descriptor.lifecycleStatus)) {
      throw new Error(
        `AI model '${modelKey(request.model)}' cannot be loaded while in '${descriptor.lifecycleStatus}' status.`,
      );
    }

    if (request.forceReload === true) {
      await this.unload(request.model, true);
    }

    const existing = this.mutableInstances(request.model).filter(
      (instance) => instance.state !== "FAILED",
    );

    while (existing.length < minimumInstances) {
      const instance = await this.createAndLoadInstance(
        descriptor,
        request.runtimeConfiguration,
        request.warmup ?? true,
        request.metadata,
      );
      existing.push(instance);
    }

    return Object.freeze(existing.map(cloneInstance));
  }

  public async unload(
    model: AiModelReference,
    force = false,
  ): Promise<number> {
    this.validateReference(model);
    const instanceIds = this.mutableInstances(model).map(
      (instance) => instance.instanceId,
    );
    let removed = 0;
    for (const instanceId of instanceIds) {
      if (await this.unloadInstance(instanceId, force)) {
        removed += 1;
      }
    }
    return removed;
  }

  public async unloadInstance(
    instanceId: string,
    force = false,
  ): Promise<boolean> {
    assertNonEmptyString(instanceId, "instanceId");
    const instance = this.instances.get(instanceId);
    if (instance === undefined) {
      return false;
    }
    if (instance.activeExecutions > 0 && !force) {
      throw new Error(
        `Runtime instance '${instanceId}' has active executions.`,
      );
    }

    this.transition(instance, "UNLOADING", "INSTANCE_UNLOADING");
    await this.withTimeout(
      Promise.resolve(),
      this.options.defaultUnloadTimeoutMs,
      `Unloading runtime instance '${instanceId}'`,
    );
    this.transition(instance, "UNLOADED", "INSTANCE_UNLOADED");
    this.instances.delete(instanceId);
    return true;
  }

  public async execute(
    input: AiModelRuntimeExecutionRequest,
  ): Promise<AiInferenceResponse> {
    this.validateExecutionRequest(input);
    if (this.queuedExecutionCount >= this.options.maximumQueueSize) {
      throw new Error("AI model runtime execution queue is full.");
    }

    const resolution = this.resolveExecutionModel(input);
    const model = this.referenceFromResolutionOrRequest(resolution, input.request);
    const executionId = this.nextId("ai-runtime-execution", this.options.clock());
    const execution: MutableExecution = {
      executionId,
      requestId: input.request.requestId,
      correlationId: input.request.correlationId,
      model,
      status: "PENDING",
      attemptCount: 0,
      queuedAt: this.options.clock(),
      metadata: cloneMetadata(input.metadata),
    };
    this.executions.set(executionId, execution);
    this.queuedExecutionCount += 1;
    this.audit("EXECUTION_QUEUED", execution, undefined, "Execution queued.");

    try {
      const queueTimeout =
        input.queueTimeoutMs ?? this.options.defaultExecutionTimeoutMs;
      const instance = await this.withTimeout(
        this.acquireInstance(model, input.preferredInstanceId),
        queueTimeout,
        `Waiting for a runtime instance for '${modelKey(model)}'`,
      );

      this.queuedExecutionCount -= 1;
      execution.instanceId = instance.instanceId;
      execution.startedAt = this.options.clock();
      execution.queueLatencyMs = Math.max(
        0,
        execution.startedAt - execution.queuedAt,
      );
      execution.status = "RUNNING";
      this.audit(
        "EXECUTION_STARTED",
        execution,
        instance,
        "Execution started.",
      );

      const maximumAttempts =
        input.maximumAttempts ?? this.options.defaultMaximumAttempts;
      const retryDelayMs =
        input.retryDelayMs ?? this.options.defaultRetryDelayMs;
      const executionTimeoutMs =
        input.executionTimeoutMs ??
        input.request.model.timeoutMs ??
        this.options.defaultExecutionTimeoutMs;

      let lastResponse: AiInferenceResponse | undefined;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        execution.attemptCount = attempt;

        if (this.cancelledExecutionIds.has(executionId)) {
          execution.status = "CANCELLED";
          execution.completedAt = this.options.clock();
          execution.error = "Execution was cancelled.";
          this.audit(
            "EXECUTION_CANCELLED",
            execution,
            instance,
            "Execution cancelled.",
          );
          throw new Error("AI runtime execution was cancelled.");
        }

        this.beginInstanceExecution(instance);
        try {
          const request = this.withResolvedConfiguration(
            input.request,
            model,
            resolution.runtimeConfiguration,
          );
          const response = await this.withTimeout(
            this.inferenceEngine.infer(request),
            executionTimeoutMs,
            `AI inference '${input.request.requestId}'`,
          );
          lastResponse = response;

          if (response.status === "SUCCEEDED") {
            this.completeInstanceExecution(instance, response.latencyMs, true);
            return this.completeExecution(execution, instance, response);
          }

          this.completeInstanceExecution(instance, response.latencyMs, false);
          if (response.error?.retryable !== true || attempt >= maximumAttempts) {
            return this.completeExecution(execution, instance, response);
          }
        } catch (error) {
          lastError = error;
          this.completeInstanceExecution(instance, 0, false);
          if (attempt >= maximumAttempts) {
            break;
          }
        }

        this.retryCount += 1;
        this.audit(
          "EXECUTION_RETRIED",
          execution,
          instance,
          `Retrying execution after attempt ${attempt}.`,
        );
        if (retryDelayMs > 0) {
          await this.options.sleep(retryDelayMs);
        }
      }

      if (lastResponse !== undefined) {
        return this.completeExecution(execution, instance, lastResponse);
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("AI runtime execution failed.");
    } catch (error) {
      if (this.queuedExecutionCount > 0 && execution.startedAt === undefined) {
        this.queuedExecutionCount -= 1;
      }
      if (execution.status !== "CANCELLED") {
        execution.status = error instanceof Error &&
          error.message.includes("exceeded timeout")
          ? "TIMED_OUT"
          : "FAILED";
        execution.completedAt = this.options.clock();
        execution.error = error instanceof Error ? error.message : String(error);
        this.audit(
          "EXECUTION_FAILED",
          execution,
          execution.instanceId === undefined
            ? undefined
            : this.instances.get(execution.instanceId),
          execution.error,
        );
      }

      if (this.options.failClosed) {
        throw error;
      }

      return this.failureResponse(input.request, execution);
    } finally {
      this.cancelledExecutionIds.delete(executionId);
    }
  }

  public cancel(executionId: string): boolean {
    assertNonEmptyString(executionId, "executionId");
    const execution = this.executions.get(executionId);
    if (
      execution === undefined ||
      ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "REJECTED"].includes(
        execution.status,
      )
    ) {
      return false;
    }
    this.cancelledExecutionIds.add(executionId);
    return true;
  }

  public getInstance(
    instanceId: string,
  ): AiModelRuntimeInstance | undefined {
    assertNonEmptyString(instanceId, "instanceId");
    const instance = this.instances.get(instanceId);
    return instance === undefined ? undefined : cloneInstance(instance);
  }

  public listInstances(
    model?: AiModelReference,
  ): readonly AiModelRuntimeInstance[] {
    if (model !== undefined) {
      this.validateReference(model);
    }

    return Object.freeze(
      [...this.instances.values()]
        .filter((instance) => model === undefined || sameModel(instance.model, model))
        .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
        .map(cloneInstance),
    );
  }

  public listExecutions(): readonly AiModelRuntimeExecution[] {
    return Object.freeze(
      [...this.executions.values()]
        .sort((left, right) => {
          if (left.queuedAt !== right.queuedAt) {
            return left.queuedAt - right.queuedAt;
          }
          return left.executionId.localeCompare(right.executionId);
        })
        .map(cloneExecution),
    );
  }

  public async reapIdleInstances(): Promise<number> {
    if (this.options.idleInstanceTtlMs === 0) {
      return 0;
    }

    const now = this.options.clock();
    const candidates = [...this.instances.values()]
      .filter(
        (instance) =>
          instance.activeExecutions === 0 &&
          (instance.state === "READY" || instance.state === "DEGRADED") &&
          now - (instance.lastUsedAt ?? instance.loadedAt ?? instance.createdAt) >=
            this.options.idleInstanceTtlMs,
      )
      .map((instance) => instance.instanceId);

    let removed = 0;
    for (const instanceId of candidates) {
      if (await this.unloadInstance(instanceId, false)) {
        removed += 1;
      }
    }
    return removed;
  }

  public snapshot(): AiModelRuntimeSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      instances: this.listInstances(),
      executions: this.listExecutions(),
      auditHistory: Object.freeze(
        this.auditHistory.map((entry) =>
          Object.freeze({
            ...entry,
            metadata: cloneMetadata(entry.metadata),
          }),
        ),
      ),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  private async createAndLoadInstance(
    descriptor: AiModelDescriptor,
    requestedConfiguration: AiModelRuntimeConfiguration | undefined,
    warmup: boolean,
    metadata: AiStrategyMetadata | undefined,
  ): Promise<MutableInstance> {
    const currentCount = this.mutableInstances(descriptor).length;
    if (currentCount >= this.options.maximumInstancesPerModel) {
      throw new Error(
        `Maximum runtime instances reached for '${descriptorKey(descriptor)}'.`,
      );
    }

    const timestamp = this.options.clock();
    const instance: MutableInstance = {
      instanceId: this.nextId("ai-model-instance", timestamp),
      model: cloneReference(descriptor),
      descriptor: cloneDescriptor(descriptor),
      runtimeConfiguration: this.resolveConfiguration(
        descriptor,
        requestedConfiguration,
      ),
      state: "UNLOADED",
      createdAt: timestamp,
      updatedAt: timestamp,
      activeExecutions: 0,
      completedExecutions: 0,
      failedExecutions: 0,
      consecutiveFailures: 0,
      totalLatencyMs: 0,
      maximumLatencyMs: 0,
      metadata: cloneMetadata(metadata),
    };
    this.instances.set(instance.instanceId, instance);
    this.audit(
      "INSTANCE_CREATED",
      undefined,
      instance,
      "Runtime instance created.",
    );

    try {
      this.transition(instance, "LOADING", "INSTANCE_LOADING");
      await this.withTimeout(
        Promise.resolve(),
        this.options.defaultLoadTimeoutMs,
        `Loading runtime instance '${instance.instanceId}'`,
      );
      instance.loadedAt = this.options.clock();
      this.transition(instance, "READY", "INSTANCE_LOADED");

      if (warmup) {
        this.transition(instance, "WARMING", "INSTANCE_WARMING");
        await this.withTimeout(
          Promise.resolve(),
          this.options.defaultWarmupTimeoutMs,
          `Warming runtime instance '${instance.instanceId}'`,
        );
        instance.warmedAt = this.options.clock();
      }

      this.transition(instance, "READY", "INSTANCE_READY");
      return instance;
    } catch (error) {
      instance.state = "FAILED";
      instance.updatedAt = this.options.clock();
      this.audit(
        "INSTANCE_FAILED",
        undefined,
        instance,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async acquireInstance(
    model: AiModelReference,
    preferredInstanceId?: string,
  ): Promise<MutableInstance> {
    if (preferredInstanceId !== undefined) {
      const preferred = this.instances.get(preferredInstanceId);
      if (
        preferred !== undefined &&
        sameModel(preferred.model, model) &&
        this.instanceHasCapacity(preferred)
      ) {
        return preferred;
      }
    }

    while (true) {
      const candidate = this.mutableInstances(model)
        .filter((instance) => this.instanceHasCapacity(instance))
        .sort((left, right) => {
          if (left.activeExecutions !== right.activeExecutions) {
            return left.activeExecutions - right.activeExecutions;
          }
          const leftUsed = left.lastUsedAt ?? 0;
          const rightUsed = right.lastUsedAt ?? 0;
          if (leftUsed !== rightUsed) {
            return leftUsed - rightUsed;
          }
          return left.instanceId.localeCompare(right.instanceId);
        })[0];

      if (candidate !== undefined) {
        return candidate;
      }

      const existingCount = this.mutableInstances(model).length;
      if (existingCount < this.options.maximumInstancesPerModel) {
        const loaded = await this.load({
          model,
          minimumInstances: existingCount + 1,
          warmup: true,
        });
        const created = loaded.find((entry) =>
          ![...this.instances.values()]
            .filter((instance) => instance.instanceId !== entry.instanceId)
            .some((instance) => instance.instanceId === entry.instanceId),
        );
        const resolved = created === undefined
          ? this.instances.get(loaded[loaded.length - 1]!.instanceId)
          : this.instances.get(created.instanceId);
        if (resolved !== undefined) {
          return resolved;
        }
      }

      await this.options.sleep(1);
    }
  }

  private resolveExecutionModel(
    input: AiModelRuntimeExecutionRequest,
  ): AiModelResolutionResult {
    if (input.resolution !== undefined) {
      const result = this.registry.resolveModel(input.resolution);
      if (!result.resolved || result.model === undefined) {
        throw new Error(result.reasons.join(" "));
      }
      return result;
    }

    const requestedVersion = input.request.model.modelVersion;
    if (requestedVersion === undefined) {
      throw new Error(
        "Inference request modelVersion is required when no registry resolution request is provided.",
      );
    }

    const descriptor = this.registry.getModel({
      providerId: input.request.model.providerId,
      modelId: input.request.model.modelId,
      modelVersion: requestedVersion,
    });
    if (descriptor === undefined) {
      throw new Error("The requested AI model is not registered.");
    }

    return Object.freeze({
      resolved: true,
      model: descriptor,
      runtimeConfiguration: input.request.model,
      source: "EXPLICIT",
      score: 0,
      reasons: Object.freeze(["Resolved directly from inference request."]),
      resolvedAt: this.options.clock(),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private referenceFromResolutionOrRequest(
    resolution: AiModelResolutionResult,
    request: AiInferenceRequest,
  ): AiModelReference {
    if (resolution.model !== undefined) {
      return cloneReference(resolution.model);
    }
    if (request.model.modelVersion === undefined) {
      throw new Error("A resolved model version is required.");
    }
    return Object.freeze({
      providerId: request.model.providerId,
      modelId: request.model.modelId,
      modelVersion: request.model.modelVersion,
    });
  }

  private resolveConfiguration(
    descriptor: AiModelDescriptor,
    configuration?: AiModelRuntimeConfiguration,
  ): AiModelRuntimeConfiguration {
    if (configuration !== undefined) {
      if (
        configuration.providerId !== descriptor.providerId ||
        configuration.modelId !== descriptor.modelId ||
        (configuration.modelVersion !== undefined &&
          configuration.modelVersion !== descriptor.modelVersion)
      ) {
        throw new Error(
          "Runtime configuration does not match the selected model.",
        );
      }
      return cloneConfiguration({
        ...configuration,
        modelVersion: descriptor.modelVersion,
      });
    }

    return Object.freeze({
      providerId: descriptor.providerId,
      modelId: descriptor.modelId,
      modelVersion: descriptor.modelVersion,
      timeoutMs: this.options.defaultExecutionTimeoutMs,
      minimumConfidence: 0,
      maximumInferenceAgeMs: Number.MAX_SAFE_INTEGER,
      failClosed: this.options.failClosed,
      parameters: Object.freeze({}),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private withResolvedConfiguration(
    request: AiInferenceRequest,
    model: AiModelReference,
    resolved?: AiModelRuntimeConfiguration,
  ): AiInferenceRequest {
    const descriptor = this.registry.getModel(model);
    if (descriptor === undefined) {
      throw new Error(`AI model '${modelKey(model)}' is not registered.`);
    }
    return Object.freeze({
      ...request,
      model: this.resolveConfiguration(
        descriptor,
        resolved ?? request.model,
      ),
      metadata: cloneMetadata(request.metadata),
    });
  }

  private beginInstanceExecution(instance: MutableInstance): void {
    instance.activeExecutions += 1;
    instance.lastUsedAt = this.options.clock();
    this.transition(instance, "BUSY", "INSTANCE_BUSY");
  }

  private completeInstanceExecution(
    instance: MutableInstance,
    latencyMs: number,
    succeeded: boolean,
  ): void {
    instance.activeExecutions = Math.max(0, instance.activeExecutions - 1);
    instance.completedExecutions += 1;
    instance.totalLatencyMs += Math.max(0, latencyMs);
    instance.maximumLatencyMs = Math.max(
      instance.maximumLatencyMs,
      Math.max(0, latencyMs),
    );
    instance.lastUsedAt = this.options.clock();

    if (succeeded) {
      instance.consecutiveFailures = 0;
      this.transition(
        instance,
        instance.activeExecutions > 0 ? "BUSY" : "READY",
        instance.activeExecutions > 0 ? "INSTANCE_BUSY" : "INSTANCE_READY",
      );
    } else {
      instance.failedExecutions += 1;
      instance.consecutiveFailures += 1;
      this.transition(
        instance,
        instance.consecutiveFailures >= 3 ? "DEGRADED" : "READY",
        instance.consecutiveFailures >= 3
          ? "INSTANCE_DEGRADED"
          : "INSTANCE_READY",
      );
    }
  }

  private completeExecution(
    execution: MutableExecution,
    instance: MutableInstance,
    response: AiInferenceResponse,
  ): AiInferenceResponse {
    execution.response = cloneResponse(response);
    execution.status = response.status;
    execution.completedAt = this.options.clock();
    execution.executionLatencyMs = Math.max(
      0,
      execution.completedAt - (execution.startedAt ?? execution.queuedAt),
    );
    this.totalExecutionLatencyMs += execution.executionLatencyMs;
    this.maximumExecutionLatencyMs = Math.max(
      this.maximumExecutionLatencyMs,
      execution.executionLatencyMs,
    );
    this.audit(
      response.status === "SUCCEEDED"
        ? "EXECUTION_COMPLETED"
        : "EXECUTION_FAILED",
      execution,
      instance,
      `Execution completed with status '${response.status}'.`,
    );
    return cloneResponse(response);
  }

  private failureResponse(
    request: AiInferenceRequest,
    execution: MutableExecution,
  ): AiInferenceResponse {
    const timestamp = execution.completedAt ?? this.options.clock();
    return cloneResponse({
      requestId: request.requestId,
      correlationId: request.correlationId,
      providerId: execution.model.providerId,
      modelId: execution.model.modelId,
      modelVersion: execution.model.modelVersion,
      status: execution.status === "TIMED_OUT" ? "TIMED_OUT" : "FAILED",
      startedAt: execution.startedAt ?? execution.queuedAt,
      completedAt: timestamp,
      latencyMs: Math.max(
        0,
        timestamp - (execution.startedAt ?? execution.queuedAt),
      ),
      featureContributions: Object.freeze([]),
      warnings: Object.freeze([]),
      error: Object.freeze({
        code:
          execution.status === "TIMED_OUT"
            ? "RUNTIME_EXECUTION_TIMEOUT"
            : "RUNTIME_EXECUTION_FAILED",
        message: execution.error ?? "AI model runtime execution failed.",
        retryable: false,
        metadata: EMPTY_AI_STRATEGY_METADATA,
      }),
      metadata: cloneMetadata(request.metadata),
    });
  }

  private metrics(): AiModelRuntimeMetrics {
    const executions = [...this.executions.values()];
    const completed = executions.filter((entry) =>
      ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "REJECTED"].includes(
        entry.status,
      ),
    );

    return Object.freeze({
      instanceCount: this.instances.size,
      readyInstanceCount: [...this.instances.values()].filter(
        (entry) => entry.state === "READY",
      ).length,
      busyInstanceCount: [...this.instances.values()].filter(
        (entry) => entry.state === "BUSY",
      ).length,
      degradedInstanceCount: [...this.instances.values()].filter(
        (entry) => entry.state === "DEGRADED",
      ).length,
      failedInstanceCount: [...this.instances.values()].filter(
        (entry) => entry.state === "FAILED",
      ).length,
      queuedExecutionCount: this.queuedExecutionCount,
      activeExecutionCount: executions.filter(
        (entry) => entry.status === "RUNNING",
      ).length,
      completedExecutionCount: completed.length,
      successfulExecutionCount: executions.filter(
        (entry) => entry.status === "SUCCEEDED",
      ).length,
      failedExecutionCount: executions.filter(
        (entry) => entry.status === "FAILED",
      ).length,
      timedOutExecutionCount: executions.filter(
        (entry) => entry.status === "TIMED_OUT",
      ).length,
      cancelledExecutionCount: executions.filter(
        (entry) => entry.status === "CANCELLED",
      ).length,
      retryCount: this.retryCount,
      averageExecutionLatencyMs:
        completed.length === 0
          ? 0
          : this.totalExecutionLatencyMs / completed.length,
      maximumExecutionLatencyMs: this.maximumExecutionLatencyMs,
    });
  }

  private mutableInstances(
    model: AiModelReference,
  ): MutableInstance[] {
    return [...this.instances.values()].filter((instance) =>
      sameModel(instance.model, model),
    );
  }

  private instanceHasCapacity(instance: MutableInstance): boolean {
    return (
      (instance.state === "READY" ||
        instance.state === "BUSY" ||
        instance.state === "DEGRADED") &&
      instance.activeExecutions <
        this.options.maximumConcurrentExecutionsPerInstance
    );
  }

  private transition(
    instance: MutableInstance,
    state: AiModelRuntimeState,
    eventType: AiModelRuntimeEventType,
  ): void {
    instance.state = state;
    instance.updatedAt = this.options.clock();
    this.audit(
      eventType,
      undefined,
      instance,
      `Runtime instance transitioned to '${state}'.`,
    );
  }

  private validateExecutionRequest(
    input: AiModelRuntimeExecutionRequest,
  ): void {
    assertNonEmptyString(input.request.requestId, "request.requestId");
    assertNonEmptyString(
      input.request.correlationId,
      "request.correlationId",
    );
    if (input.maximumAttempts !== undefined) {
      assertPositiveInteger(input.maximumAttempts, "maximumAttempts");
    }
    if (input.retryDelayMs !== undefined) {
      assertNonNegativeInteger(input.retryDelayMs, "retryDelayMs");
    }
    if (input.queueTimeoutMs !== undefined) {
      assertPositiveInteger(input.queueTimeoutMs, "queueTimeoutMs");
    }
    if (input.executionTimeoutMs !== undefined) {
      assertPositiveInteger(input.executionTimeoutMs, "executionTimeoutMs");
    }
  }

  private validateReference(reference: AiModelReference): void {
    assertNonEmptyString(reference.providerId, "model.providerId");
    assertNonEmptyString(reference.modelId, "model.modelId");
    assertNonEmptyString(reference.modelVersion, "model.modelVersion");
  }

  private audit(
    eventType: AiModelRuntimeEventType,
    execution: MutableExecution | undefined,
    instance: MutableInstance | undefined,
    message: string,
  ): void {
    const timestamp = this.options.clock();
    const model = instance?.model ?? execution?.model;
    this.auditHistory.push(
      Object.freeze({
        auditId: this.nextId("ai-model-runtime-audit", timestamp),
        eventType,
        timestamp,
        instanceId: instance?.instanceId,
        executionId: execution?.executionId,
        providerId: model?.providerId,
        modelId: model?.modelId,
        modelVersion: model?.modelVersion,
        message,
        metadata: EMPTY_AI_STRATEGY_METADATA,
      }),
    );

    while (this.auditHistory.length > this.options.maximumAuditEntries) {
      this.auditHistory.shift();
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    assertPositiveInteger(timeoutMs, "timeoutMs");
    let handle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          handle = setTimeout(
            () =>
              reject(
                new Error(`${operation} exceeded timeout of ${timeoutMs} ms.`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    }
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(prefix, timestamp, this.sequence);
  }
}

function descriptorKey(descriptor: AiModelDescriptor): string {
  return modelKey(descriptor);
}

export function createDeterministicAiModelRuntime(
  registry: AiModelRegistry,
  inferenceEngine: AiInferenceEngine,
  options: AiModelRuntimeOptions = {},
): DeterministicAiModelRuntime {
  return new DeterministicAiModelRuntime(
    registry,
    inferenceEngine,
    options,
  );
}