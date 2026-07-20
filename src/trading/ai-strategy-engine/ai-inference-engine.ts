/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 5: Deterministic AI inference engine.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureContribution,
  type AiInferenceError,
  type AiInferencePrediction,
  type AiInferenceRequest,
  type AiInferenceResponse,
  type AiInferenceStatus,
  type AiModelDescriptor,
  type AiModelProvider,
  type AiModelRuntimeConfiguration,
  type AiProviderHealth,
  type AiProviderSnapshot,
  type AiStrategyMetadata,
  type AiStrategyTimestamp,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  AiStrategyValidationError,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface AiInferenceEngineOptions {
  readonly defaultTimeoutMs?: number;
  readonly maximumHistoryEntries?: number;
  readonly maximumCacheEntries?: number;
  readonly cacheSuccessfulResponses?: boolean;
  readonly rejectStaleFeatures?: boolean;
  readonly rejectInvalidPredictions?: boolean;
  readonly healthCheckBeforeInference?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly validator?: AiStrategyContractValidator;
}

export interface AiInferenceHistoryQuery {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly status?: AiInferenceStatus;
  readonly correlationId?: string;
  readonly strategyId?: string;
  readonly fromCompletedAt?: AiStrategyTimestamp;
  readonly toCompletedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface AiInferenceEngineMetrics {
  readonly requestCount: number;
  readonly successCount: number;
  readonly rejectedCount: number;
  readonly failureCount: number;
  readonly timeoutCount: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly activeCount: number;
  readonly averageLatencyMs: number;
  readonly maximumLatencyMs: number;
}

export interface AiInferenceEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly providers: readonly AiProviderSnapshot[];
  readonly models: readonly AiModelDescriptor[];
  readonly history: readonly AiInferenceResponse[];
  readonly metrics: AiInferenceEngineMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface AiInferenceEngine {
  registerProvider(provider: AiModelProvider): void;
  unregisterProvider(providerId: string): boolean;
  hasProvider(providerId: string): boolean;
  listProviders(): readonly AiProviderSnapshot[];
  listModels(providerId?: string): Promise<readonly AiModelDescriptor[]>;
  getProviderHealth(providerId: string): Promise<AiProviderHealth | undefined>;
  infer(request: AiInferenceRequest): Promise<AiInferenceResponse>;
  queryHistory(query?: AiInferenceHistoryQuery): readonly AiInferenceResponse[];
  clearHistory(): void;
  clearCache(): void;
  snapshot(): Promise<AiInferenceEngineSnapshot>;
}

interface RegisteredProvider {
  readonly provider: AiModelProvider;
  readonly registeredAt: AiStrategyTimestamp;
  health?: AiProviderHealth;
}

interface ResolvedOptions {
  readonly defaultTimeoutMs: number;
  readonly maximumHistoryEntries: number;
  readonly maximumCacheEntries: number;
  readonly cacheSuccessfulResponses: boolean;
  readonly rejectStaleFeatures: boolean;
  readonly rejectInvalidPredictions: boolean;
  readonly healthCheckBeforeInference: boolean;
  readonly clock: () => AiStrategyTimestamp;
  readonly validator: AiStrategyContractValidator;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;
const DEFAULT_MAXIMUM_CACHE_ENTRIES = 2_000;

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function cloneMetadata(metadata: AiStrategyMetadata | undefined): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const copy: Record<
    string,
    string | number | boolean | null | readonly (string | number | boolean | null)[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(copy);
}

function clonePrediction(
  prediction: AiInferencePrediction | undefined,
): AiInferencePrediction | undefined {
  if (prediction === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...prediction,
    payload: Object.freeze({ ...prediction.payload }),
  });
}

function cloneContribution(
  contribution: AiFeatureContribution,
): AiFeatureContribution {
  return Object.freeze({
    ...contribution,
    metadata: cloneMetadata(contribution.metadata),
  });
}

function cloneError(error: AiInferenceError | undefined): AiInferenceError | undefined {
  if (error === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...error,
    metadata: cloneMetadata(error.metadata),
  });
}

function cloneResponse(response: AiInferenceResponse): AiInferenceResponse {
  return Object.freeze({
    ...response,
    prediction: clonePrediction(response.prediction),
    featureContributions: Object.freeze(
      response.featureContributions.map(cloneContribution),
    ),
    warnings: Object.freeze([...response.warnings]),
    error: cloneError(response.error),
    metadata: cloneMetadata(response.metadata),
  });
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

function cloneHealth(health: AiProviderHealth): AiProviderHealth {
  return Object.freeze({
    ...health,
    metadata: cloneMetadata(health.metadata),
  });
}

function compareResponses(left: AiInferenceResponse, right: AiInferenceResponse): number {
  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function compareModels(left: AiModelDescriptor, right: AiModelDescriptor): number {
  const providerComparison = left.providerId.localeCompare(right.providerId);
  if (providerComparison !== 0) {
    return providerComparison;
  }

  const modelComparison = left.modelId.localeCompare(right.modelId);
  if (modelComparison !== 0) {
    return modelComparison;
  }

  return left.modelVersion.localeCompare(right.modelVersion);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function timeoutError(timeoutMs: number): Error {
  return new Error(`AI inference exceeded timeout of ${timeoutMs}ms.`);
}

export class DeterministicAiInferenceEngine implements AiInferenceEngine {
  private readonly options: ResolvedOptions;
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly history: AiInferenceResponse[] = [];
  private readonly cache = new Map<string, AiInferenceResponse>();
  private readonly activeRequestIds = new Set<string>();

  private requestCount = 0;
  private successCount = 0;
  private rejectedCount = 0;
  private failureCount = 0;
  private timeoutCount = 0;
  private cacheHitCount = 0;
  private cacheMissCount = 0;
  private totalLatencyMs = 0;
  private maximumLatencyMs = 0;

  public constructor(options: AiInferenceEngineOptions = {}) {
    const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maximumHistoryEntries =
      options.maximumHistoryEntries ?? DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const maximumCacheEntries =
      options.maximumCacheEntries ?? DEFAULT_MAXIMUM_CACHE_ENTRIES;

    assertPositiveInteger(defaultTimeoutMs, "defaultTimeoutMs");
    assertPositiveInteger(maximumHistoryEntries, "maximumHistoryEntries");
    assertPositiveInteger(maximumCacheEntries, "maximumCacheEntries");

    this.options = Object.freeze({
      defaultTimeoutMs,
      maximumHistoryEntries,
      maximumCacheEntries,
      cacheSuccessfulResponses: options.cacheSuccessfulResponses ?? true,
      rejectStaleFeatures: options.rejectStaleFeatures ?? true,
      rejectInvalidPredictions: options.rejectInvalidPredictions ?? true,
      healthCheckBeforeInference: options.healthCheckBeforeInference ?? false,
      clock: options.clock ?? defaultClock,
      validator: options.validator ?? createAiStrategyContractValidator(),
    });
  }

  public registerProvider(provider: AiModelProvider): void {
    if (provider.providerId.trim().length === 0) {
      throw new TypeError("provider.providerId must be a non-empty string.");
    }

    const existing = this.providers.get(provider.providerId);
    if (existing !== undefined && existing.provider !== provider) {
      throw new Error(`AI provider "${provider.providerId}" is already registered.`);
    }

    if (existing === undefined) {
      this.providers.set(provider.providerId, {
        provider,
        registeredAt: this.options.clock(),
      });
    }
  }

  public unregisterProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(`${providerId}::`)) {
          this.cache.delete(key);
        }
      }
    }
    return removed;
  }

  public hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  public listProviders(): readonly AiProviderSnapshot[] {
    return Object.freeze(
      [...this.providers.values()]
        .map((entry) =>
          Object.freeze({
            providerId: entry.provider.providerId,
            displayName: entry.provider.displayName,
            registeredAt: entry.registeredAt,
            modelCount: 0,
            health: entry.health === undefined ? undefined : cloneHealth(entry.health),
            metadata: cloneMetadata(entry.provider.metadata),
          }),
        )
        .sort((left, right) => left.providerId.localeCompare(right.providerId)),
    );
  }

  public async listModels(providerId?: string): Promise<readonly AiModelDescriptor[]> {
    const selected = providerId === undefined
      ? [...this.providers.values()]
      : [this.requireProvider(providerId)];

    const models: AiModelDescriptor[] = [];
    for (const entry of selected) {
      const providerModels = await entry.provider.listModels();
      for (const model of providerModels) {
        const result = this.options.validator.validateModelDescriptor(model);
        this.options.validator.assertValid(
          result,
          `Model descriptor "${model.modelId}" is invalid.`,
        );
        models.push(cloneDescriptor(model));
      }
    }

    return Object.freeze(models.sort(compareModels));
  }

  public async getProviderHealth(
    providerId: string,
  ): Promise<AiProviderHealth | undefined> {
    const entry = this.requireProvider(providerId);
    if (entry.provider.healthCheck === undefined) {
      return entry.health === undefined ? undefined : cloneHealth(entry.health);
    }

    const health = cloneHealth(await entry.provider.healthCheck());
    entry.health = health;
    return health;
  }

  public async infer(request: AiInferenceRequest): Promise<AiInferenceResponse> {
    const validation = this.options.validator.validateInferenceRequest(request);
    this.options.validator.assertValid(validation, "AI inference request is invalid.");

    if (this.activeRequestIds.has(request.requestId)) {
      throw new AiStrategyValidationError(
        `Inference request "${request.requestId}" is already running.`,
        Object.freeze([
          Object.freeze({
            path: "request.requestId",
            code: "DUPLICATE_ACTIVE_REQUEST",
            message: "An active inference request identifier must be unique.",
            severity: "ERROR" as const,
          }),
        ]),
      );
    }

    const providerEntry = this.providers.get(request.model.providerId);
    if (providerEntry === undefined) {
      return this.recordTerminalResponse(
        this.createRejectedResponse(
          request,
          "PROVIDER_NOT_REGISTERED",
          `AI provider "${request.model.providerId}" is not registered.`,
        ),
      );
    }

    const staleReason = this.findStaleFeatureReason(request);
    if (staleReason !== undefined) {
      return this.recordTerminalResponse(
        this.createRejectedResponse(request, "STALE_FEATURE_VECTOR", staleReason),
      );
    }

    if (this.options.healthCheckBeforeInference) {
      const health = await this.getProviderHealth(request.model.providerId);
      if (health?.status === "UNAVAILABLE") {
        return this.recordTerminalResponse(
          this.createRejectedResponse(
            request,
            "PROVIDER_UNAVAILABLE",
            health.message ?? "The selected AI provider is unavailable.",
          ),
        );
      }
    }

    const cacheKey = this.createCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.cacheHitCount += 1;
      return cloneResponse(cached);
    }
    this.cacheMissCount += 1;

    this.requestCount += 1;
    this.activeRequestIds.add(request.requestId);
    const startedAt = this.options.clock();

    try {
      const timeoutMs = request.model.timeoutMs || this.options.defaultTimeoutMs;
      const rawResponse = await this.withTimeout(
        providerEntry.provider.infer(request),
        timeoutMs,
      );
      const completedAt = this.options.clock();
      const normalized = this.normalizeProviderResponse(
        request,
        rawResponse,
        startedAt,
        completedAt,
      );

      if (
        this.options.rejectInvalidPredictions &&
        normalized.status === "SUCCEEDED" &&
        normalized.prediction === undefined
      ) {
        return this.recordTerminalResponse(
          this.createFailureResponse(
            request,
            startedAt,
            completedAt,
            "INVALID_PROVIDER_RESPONSE",
            "A successful provider response must include a prediction.",
            false,
          ),
        );
      }

      const recorded = this.recordTerminalResponse(normalized);
      if (
        this.options.cacheSuccessfulResponses &&
        recorded.status === "SUCCEEDED"
      ) {
        this.cache.set(cacheKey, recorded);
        this.trimCache();
      }

      return recorded;
    } catch (error) {
      const completedAt = this.options.clock();
      const timedOut =
        error instanceof Error && error.message.includes("exceeded timeout");
      const response = this.createFailureResponse(
        request,
        startedAt,
        completedAt,
        timedOut ? "INFERENCE_TIMEOUT" : "INFERENCE_FAILED",
        error instanceof Error ? error.message : "Unknown inference failure.",
        !timedOut,
        timedOut ? "TIMED_OUT" : "FAILED",
      );
      return this.recordTerminalResponse(response);
    } finally {
      this.activeRequestIds.delete(request.requestId);
    }
  }

  public queryHistory(
    query: AiInferenceHistoryQuery = {},
  ): readonly AiInferenceResponse[] {
    this.validateHistoryQuery(query);
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    return Object.freeze(
      this.history
        .filter((response) => {
          if (query.providerId !== undefined && response.providerId !== query.providerId) {
            return false;
          }
          if (query.modelId !== undefined && response.modelId !== query.modelId) {
            return false;
          }
          if (query.status !== undefined && response.status !== query.status) {
            return false;
          }
          if (
            query.correlationId !== undefined &&
            response.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.fromCompletedAt !== undefined &&
            response.completedAt < query.fromCompletedAt
          ) {
            return false;
          }
          if (
            query.toCompletedAt !== undefined &&
            response.completedAt > query.toCompletedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareResponses)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
    this.requestCount = 0;
    this.successCount = 0;
    this.rejectedCount = 0;
    this.failureCount = 0;
    this.timeoutCount = 0;
    this.totalLatencyMs = 0;
    this.maximumLatencyMs = 0;
  }

  public clearCache(): void {
    this.cache.clear();
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
  }

  public async snapshot(): Promise<AiInferenceEngineSnapshot> {
    const models = await this.listModels();
    const modelCountByProvider = new Map<string, number>();
    for (const model of models) {
      modelCountByProvider.set(
        model.providerId,
        (modelCountByProvider.get(model.providerId) ?? 0) + 1,
      );
    }

    const providers = Object.freeze(
      [...this.providers.values()]
        .map((entry) =>
          Object.freeze({
            providerId: entry.provider.providerId,
            displayName: entry.provider.displayName,
            registeredAt: entry.registeredAt,
            modelCount: modelCountByProvider.get(entry.provider.providerId) ?? 0,
            health: entry.health === undefined ? undefined : cloneHealth(entry.health),
            metadata: cloneMetadata(entry.provider.metadata),
          }),
        )
        .sort((left, right) => left.providerId.localeCompare(right.providerId)),
    );

    return Object.freeze({
      capturedAt: this.options.clock(),
      providers,
      models,
      history: Object.freeze([...this.history]),
      metrics: this.metrics(),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private metrics(): AiInferenceEngineMetrics {
    const terminalCount =
      this.successCount + this.rejectedCount + this.failureCount + this.timeoutCount;

    return Object.freeze({
      requestCount: this.requestCount,
      successCount: this.successCount,
      rejectedCount: this.rejectedCount,
      failureCount: this.failureCount,
      timeoutCount: this.timeoutCount,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
      activeCount: this.activeRequestIds.size,
      averageLatencyMs: terminalCount === 0 ? 0 : this.totalLatencyMs / terminalCount,
      maximumLatencyMs: this.maximumLatencyMs,
    });
  }

  private requireProvider(providerId: string): RegisteredProvider {
    const entry = this.providers.get(providerId);
    if (entry === undefined) {
      throw new Error(`AI provider "${providerId}" is not registered.`);
    }
    return entry;
  }

  private findStaleFeatureReason(request: AiInferenceRequest): string | undefined {
    if (!this.options.rejectStaleFeatures) {
      return undefined;
    }

    const ageMs = request.requestedAt - request.featureVector.observedAt;
    if (ageMs < 0) {
      return "The feature vector was observed after the inference request timestamp.";
    }

    if (ageMs > request.model.maximumInferenceAgeMs) {
      return `Feature vector age ${ageMs}ms exceeds maximum ${request.model.maximumInferenceAgeMs}ms.`;
    }

    return undefined;
  }

  private createCacheKey(request: AiInferenceRequest): string {
    return [
      request.model.providerId,
      request.model.modelId,
      request.model.modelVersion ?? "latest",
      request.purpose,
      request.featureVector.vectorId,
      stableSerialize(request.model.parameters),
      request.model.deterministicSeed ?? "",
    ].join("::");
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    assertPositiveInteger(timeoutMs, "timeoutMs");

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private normalizeProviderResponse(
    request: AiInferenceRequest,
    response: AiInferenceResponse,
    startedAt: AiStrategyTimestamp,
    completedAt: AiStrategyTimestamp,
  ): AiInferenceResponse {
    if (response.requestId !== request.requestId) {
      throw new Error("Provider response requestId does not match the request.");
    }
    if (response.correlationId !== request.correlationId) {
      throw new Error("Provider response correlationId does not match the request.");
    }
    if (response.providerId !== request.model.providerId) {
      throw new Error("Provider response providerId does not match the selected provider.");
    }
    if (response.modelId !== request.model.modelId) {
      throw new Error("Provider response modelId does not match the selected model.");
    }

    const status = response.status;
    const latencyMs = Math.max(0, completedAt - startedAt);
    const confidence = response.confidence;

    if (
      status === "SUCCEEDED" &&
      confidence !== undefined &&
      confidence < request.model.minimumConfidence
    ) {
      return cloneResponse({
        ...response,
        status: request.model.failClosed ? "REJECTED" : status,
        startedAt,
        completedAt,
        latencyMs,
        warnings: Object.freeze([
          ...response.warnings,
          `Confidence ${confidence} is below minimum ${request.model.minimumConfidence}.`,
        ]),
        error: request.model.failClosed
          ? {
              code: "MINIMUM_CONFIDENCE_NOT_MET",
              message: "Inference confidence is below the configured minimum.",
              retryable: false,
              metadata: EMPTY_AI_STRATEGY_METADATA,
            }
          : response.error,
      });
    }

    return cloneResponse({
      ...response,
      modelVersion: response.modelVersion || request.model.modelVersion || "unknown",
      startedAt,
      completedAt,
      latencyMs,
    });
  }

  private createRejectedResponse(
    request: AiInferenceRequest,
    code: string,
    message: string,
  ): AiInferenceResponse {
    const timestamp = this.options.clock();
    return cloneResponse({
      requestId: request.requestId,
      correlationId: request.correlationId,
      providerId: request.model.providerId,
      modelId: request.model.modelId,
      modelVersion: request.model.modelVersion ?? "unknown",
      status: "REJECTED",
      startedAt: timestamp,
      completedAt: timestamp,
      latencyMs: 0,
      featureContributions: Object.freeze([]),
      warnings: Object.freeze([]),
      error: {
        code,
        message,
        retryable: false,
        metadata: EMPTY_AI_STRATEGY_METADATA,
      },
      metadata: cloneMetadata(request.metadata),
    });
  }

  private createFailureResponse(
    request: AiInferenceRequest,
    startedAt: AiStrategyTimestamp,
    completedAt: AiStrategyTimestamp,
    code: string,
    message: string,
    retryable: boolean,
    status: "FAILED" | "TIMED_OUT" = "FAILED",
  ): AiInferenceResponse {
    return cloneResponse({
      requestId: request.requestId,
      correlationId: request.correlationId,
      providerId: request.model.providerId,
      modelId: request.model.modelId,
      modelVersion: request.model.modelVersion ?? "unknown",
      status,
      startedAt,
      completedAt,
      latencyMs: Math.max(0, completedAt - startedAt),
      featureContributions: Object.freeze([]),
      warnings: Object.freeze([]),
      error: {
        code,
        message,
        retryable,
        metadata: EMPTY_AI_STRATEGY_METADATA,
      },
      metadata: cloneMetadata(request.metadata),
    });
  }

  private recordTerminalResponse(response: AiInferenceResponse): AiInferenceResponse {
    const immutable = cloneResponse(response);
    this.history.push(immutable);
    this.history.sort(compareResponses);

    while (this.history.length > this.options.maximumHistoryEntries) {
      this.history.shift();
    }

    this.totalLatencyMs += immutable.latencyMs;
    this.maximumLatencyMs = Math.max(this.maximumLatencyMs, immutable.latencyMs);

    switch (immutable.status) {
      case "SUCCEEDED":
        this.successCount += 1;
        break;
      case "REJECTED":
        this.rejectedCount += 1;
        break;
      case "TIMED_OUT":
        this.timeoutCount += 1;
        break;
      case "FAILED":
      case "CANCELLED":
        this.failureCount += 1;
        break;
      default:
        break;
    }

    return immutable;
  }

  private trimCache(): void {
    while (this.cache.size > this.options.maximumCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.cache.delete(oldestKey);
    }
  }

  private validateHistoryQuery(query: AiInferenceHistoryQuery): void {
    if (
      query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit <= 0)
    ) {
      throw new RangeError("query.limit must be a positive integer.");
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

    if (query.fromCompletedAt !== undefined) {
      assertFiniteNonNegative(query.fromCompletedAt, "query.fromCompletedAt");
    }
    if (query.toCompletedAt !== undefined) {
      assertFiniteNonNegative(query.toCompletedAt, "query.toCompletedAt");
    }
  }
}

export function createDeterministicAiInferenceEngine(
  options: AiInferenceEngineOptions = {},
): DeterministicAiInferenceEngine {
  return new DeterministicAiInferenceEngine(options);
}