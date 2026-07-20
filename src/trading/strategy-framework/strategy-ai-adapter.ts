/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-ai-adapter.ts
 */

import {
  EMPTY_STRATEGY_METADATA,
  STRATEGY_CONFIDENCE_MAXIMUM,
  STRATEGY_CONFIDENCE_MINIMUM,
  type StrategyAiInference,
  type StrategyCorrelationId,
  type StrategyDirection,
  type StrategyEvaluationContext,
  type StrategyExternalSignal,
  type StrategyMetadata,
  type StrategySerializableValue,
  type StrategySignalAction,
  type UnixTimestampMilliseconds,
} from "./strategy-contracts";

export type StrategyAiProviderId = string;
export type StrategyAiModelId = string;
export type StrategyAiInferenceStatus =
  | "SUCCEEDED"
  | "REJECTED"
  | "FAILED"
  | "TIMED_OUT";

export interface StrategyAiModelDescriptor {
  readonly providerId: StrategyAiProviderId;
  readonly modelId: StrategyAiModelId;
  readonly modelVersion: string;
  readonly displayName: string;
  readonly deterministic: boolean;
  readonly supportsSeed: boolean;
  readonly maximumInputBytes?: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyAiInferenceRequest {
  readonly requestId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly providerId: StrategyAiProviderId;
  readonly modelId: StrategyAiModelId;
  readonly modelVersion?: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly input: StrategySerializableValue;
  readonly deterministicSeed?: string;
  readonly timeoutMilliseconds?: number;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyAiProviderResponse {
  readonly prediction: StrategySerializableValue;
  readonly confidence?: number;
  readonly featureContributions?: Readonly<Record<string, number>>;
  readonly generatedAt?: UnixTimestampMilliseconds;
  readonly modelVersion?: string;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyAiProvider {
  readonly providerId: StrategyAiProviderId;

  listModels():
    | readonly StrategyAiModelDescriptor[]
    | Promise<readonly StrategyAiModelDescriptor[]>;

  infer(
    request: StrategyAiInferenceRequest,
  ): Promise<StrategyAiProviderResponse>;
}

export interface StrategyAiInferenceResult {
  readonly requestId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly providerId: StrategyAiProviderId;
  readonly modelId: StrategyAiModelId;
  readonly status: StrategyAiInferenceStatus;
  readonly startedAt: UnixTimestampMilliseconds;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly inference?: StrategyAiInference;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyAiSignalMapping {
  readonly action: StrategySignalAction;
  readonly direction: StrategyDirection;
  readonly confidence?: number;
  readonly reason?: string;
  readonly validForMilliseconds?: number;
  readonly payload?: StrategyMetadata;
}

export interface StrategyAiSignalMapper {
  map(
    inference: StrategyAiInference,
    context: StrategyEvaluationContext,
  ): StrategyAiSignalMapping | undefined;
}

export interface StrategyAiAdapterOptions {
  readonly defaultTimeoutMilliseconds?: number;
  readonly maximumTimeoutMilliseconds?: number;
  readonly normalizeConfidence?: boolean;
  readonly rejectNonFiniteFeatureContributions?: boolean;
  readonly maximumHistoryEntries?: number;
  readonly clock?: () => UnixTimestampMilliseconds;
}

export interface StrategyAiAdapterSnapshot {
  readonly providers: readonly StrategyAiProviderId[];
  readonly activeRequestIds: readonly string[];
  readonly history: readonly StrategyAiInferenceResult[];
}

const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const DEFAULT_MAXIMUM_TIMEOUT_MILLISECONDS = 120_000;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 1_000;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} cannot be empty.`);
  }
}

function assertTimestamp(
  value: UnixTimestampMilliseconds,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function isSerializable(value: unknown): value is StrategySerializableValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isSerializable);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(
      isSerializable,
    );
  }

  return false;
}

function normalizeConfidence(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw new Error("AI confidence must be a finite number.");
  }

  return Math.min(
    STRATEGY_CONFIDENCE_MAXIMUM,
    Math.max(STRATEGY_CONFIDENCE_MINIMUM, value),
  );
}

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  return Object.freeze({
    ...(metadata ?? EMPTY_STRATEGY_METADATA),
  });
}

function freezeInference(
  inference: StrategyAiInference,
): StrategyAiInference {
  return Object.freeze({
    ...inference,
    featureContributions:
      inference.featureContributions === undefined
        ? undefined
        : Object.freeze({ ...inference.featureContributions }),
    metadata: freezeMetadata(inference.metadata),
  });
}

function freezeResult(
  result: StrategyAiInferenceResult,
): StrategyAiInferenceResult {
  return Object.freeze({
    ...result,
    inference:
      result.inference === undefined
        ? undefined
        : freezeInference(result.inference),
    metadata: freezeMetadata(result.metadata),
  });
}

function timeoutPromise<T>(
  milliseconds: number,
): Promise<T> {
  return new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(
        Object.assign(
          new Error(
            `AI inference timed out after ${milliseconds} milliseconds.`,
          ),
          { code: "AI_INFERENCE_TIMEOUT" },
        ),
      );
    }, milliseconds);
  });
}

export class StrategyAiAdapter {
  private readonly providers = new Map<
    StrategyAiProviderId,
    StrategyAiProvider
  >();

  private readonly activeRequestIds = new Set<string>();
  private readonly history: StrategyAiInferenceResult[] = [];
  private readonly defaultTimeoutMilliseconds: number;
  private readonly maximumTimeoutMilliseconds: number;
  private readonly shouldNormalizeConfidence: boolean;
  private readonly rejectNonFiniteFeatureContributions: boolean;
  private readonly maximumHistoryEntries: number;
  private readonly clock: () => UnixTimestampMilliseconds;

  public constructor(options: StrategyAiAdapterOptions = {}) {
    this.defaultTimeoutMilliseconds =
      options.defaultTimeoutMilliseconds ??
      DEFAULT_TIMEOUT_MILLISECONDS;
    this.maximumTimeoutMilliseconds =
      options.maximumTimeoutMilliseconds ??
      DEFAULT_MAXIMUM_TIMEOUT_MILLISECONDS;
    this.shouldNormalizeConfidence =
      options.normalizeConfidence ?? true;
    this.rejectNonFiniteFeatureContributions =
      options.rejectNonFiniteFeatureContributions ?? true;
    this.maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    this.clock = options.clock ?? (() => Date.now());

    if (
      !Number.isInteger(this.defaultTimeoutMilliseconds) ||
      this.defaultTimeoutMilliseconds <= 0
    ) {
      throw new Error(
        "defaultTimeoutMilliseconds must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(this.maximumTimeoutMilliseconds) ||
      this.maximumTimeoutMilliseconds <
        this.defaultTimeoutMilliseconds
    ) {
      throw new Error(
        "maximumTimeoutMilliseconds must be an integer greater than or equal to the default timeout.",
      );
    }

    if (
      !Number.isInteger(this.maximumHistoryEntries) ||
      this.maximumHistoryEntries <= 0
    ) {
      throw new Error(
        "maximumHistoryEntries must be a positive integer.",
      );
    }
  }

  public registerProvider(provider: StrategyAiProvider): void {
    assertNonEmpty(provider.providerId, "provider.providerId");

    if (this.providers.has(provider.providerId)) {
      throw new Error(
        `AI provider '${provider.providerId}' is already registered.`,
      );
    }

    this.providers.set(provider.providerId, provider);
  }

  public unregisterProvider(providerId: StrategyAiProviderId): boolean {
    assertNonEmpty(providerId, "providerId");
    return this.providers.delete(providerId);
  }

  public hasProvider(providerId: StrategyAiProviderId): boolean {
    return this.providers.has(providerId);
  }

  public async listModels(
    providerId?: StrategyAiProviderId,
  ): Promise<readonly StrategyAiModelDescriptor[]> {
    const providers = providerId === undefined
      ? [...this.providers.values()]
      : [this.requireProvider(providerId)];

    const models = (
      await Promise.all(
        providers
          .sort((left, right) =>
            left.providerId.localeCompare(right.providerId),
          )
          .map((provider) => provider.listModels()),
      )
    ).flat();

    models.sort((left, right) => {
      const providerComparison = left.providerId.localeCompare(
        right.providerId,
      );

      if (providerComparison !== 0) {
        return providerComparison;
      }

      const modelComparison = left.modelId.localeCompare(
        right.modelId,
      );

      return modelComparison !== 0
        ? modelComparison
        : left.modelVersion.localeCompare(right.modelVersion);
    });

    return Object.freeze(
      models.map((model) =>
        Object.freeze({
          ...model,
          metadata: freezeMetadata(model.metadata),
        }),
      ),
    );
  }

  public async infer(
    request: StrategyAiInferenceRequest,
  ): Promise<StrategyAiInferenceResult> {
    this.validateRequest(request);

    if (this.activeRequestIds.has(request.requestId)) {
      throw new Error(
        `AI inference request '${request.requestId}' is already active.`,
      );
    }

    const provider = this.requireProvider(request.providerId);
    const startedAt = this.clock();
    const timeoutMilliseconds = Math.min(
      request.timeoutMilliseconds ??
        this.defaultTimeoutMilliseconds,
      this.maximumTimeoutMilliseconds,
    );

    this.activeRequestIds.add(request.requestId);

    try {
      const providerResponse = await Promise.race([
        provider.infer(
          Object.freeze({
            ...request,
            timeoutMilliseconds,
            metadata: freezeMetadata(request.metadata),
          }),
        ),
        timeoutPromise<StrategyAiProviderResponse>(
          timeoutMilliseconds,
        ),
      ]);

      const completedAt = this.clock();
      const inference = this.buildInference(
        request,
        providerResponse,
        completedAt,
      );

      return this.record(
        freezeResult({
          requestId: request.requestId,
          correlationId: request.correlationId,
          providerId: request.providerId,
          modelId: request.modelId,
          status: "SUCCEEDED",
          startedAt,
          completedAt,
          durationMilliseconds: Math.max(
            completedAt - startedAt,
            0,
          ),
          inference,
          metadata: freezeMetadata(request.metadata),
        }),
      );
    } catch (error) {
      const completedAt = this.clock();
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { readonly code?: unknown }).code ===
          "string"
          ? (error as { readonly code: string }).code
          : "AI_INFERENCE_FAILED";
      const timedOut = code === "AI_INFERENCE_TIMEOUT";

      return this.record(
        freezeResult({
          requestId: request.requestId,
          correlationId: request.correlationId,
          providerId: request.providerId,
          modelId: request.modelId,
          status: timedOut ? "TIMED_OUT" : "FAILED",
          startedAt,
          completedAt,
          durationMilliseconds: Math.max(
            completedAt - startedAt,
            0,
          ),
          errorCode: code,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Unknown AI inference failure.",
          metadata: freezeMetadata(request.metadata),
        }),
      );
    } finally {
      this.activeRequestIds.delete(request.requestId);
    }
  }

  public toExternalSignal(
    result: StrategyAiInferenceResult,
    context: StrategyEvaluationContext,
    mapper: StrategyAiSignalMapper,
  ): StrategyExternalSignal | undefined {
    if (
      result.status !== "SUCCEEDED" ||
      result.inference === undefined
    ) {
      return undefined;
    }

    const mapping = mapper.map(result.inference, context);

    if (mapping === undefined) {
      return undefined;
    }

    const confidence = this.shouldNormalizeConfidence
      ? normalizeConfidence(
          mapping.confidence ?? result.inference.confidence,
        )
      : mapping.confidence ?? result.inference.confidence;

    if (confidence === undefined) {
      throw new Error(
        "AI signal mapping must provide confidence when the inference does not.",
      );
    }

    if (!Number.isFinite(confidence)) {
      throw new Error(
        "AI signal confidence must be a finite number.",
      );
    }

    const validForMilliseconds =
      mapping.validForMilliseconds;

    if (
      validForMilliseconds !== undefined &&
      (!Number.isInteger(validForMilliseconds) ||
        validForMilliseconds <= 0)
    ) {
      throw new Error(
        "validForMilliseconds must be a positive integer when provided.",
      );
    }

    return Object.freeze({
      externalSignalId: `${result.requestId}:external-signal`,
      providerId: result.providerId,
      instrument: result.inference.instrument,
      action: mapping.action,
      confidence,
      generatedAt: result.inference.generatedAt,
      validUntil:
        validForMilliseconds === undefined
          ? undefined
          : result.inference.generatedAt +
            validForMilliseconds,
      payload: freezeMetadata({
        modelId: result.inference.modelId,
        modelVersion: result.inference.modelVersion,
        direction: mapping.direction,
        reason: mapping.reason ?? "AI advisory signal",
        ...(mapping.payload ?? EMPTY_STRATEGY_METADATA),
      }),
      metadata: freezeMetadata(result.inference.metadata),
    });
  }

  public snapshot(): StrategyAiAdapterSnapshot {
    return Object.freeze({
      providers: Object.freeze(
        [...this.providers.keys()].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      activeRequestIds: Object.freeze(
        [...this.activeRequestIds].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      history: Object.freeze([...this.history]),
    });
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  private requireProvider(
    providerId: StrategyAiProviderId,
  ): StrategyAiProvider {
    assertNonEmpty(providerId, "providerId");
    const provider = this.providers.get(providerId);

    if (provider === undefined) {
      throw new Error(
        `AI provider '${providerId}' is not registered.`,
      );
    }

    return provider;
  }

  private validateRequest(
    request: StrategyAiInferenceRequest,
  ): void {
    assertNonEmpty(request.requestId, "requestId");
    assertNonEmpty(request.correlationId, "correlationId");
    assertNonEmpty(request.providerId, "providerId");
    assertNonEmpty(request.modelId, "modelId");
    assertTimestamp(request.timestamp, "timestamp");

    if (!isSerializable(request.input)) {
      throw new Error(
        "AI inference input must be strategy-serializable.",
      );
    }

    if (
      request.timeoutMilliseconds !== undefined &&
      (!Number.isInteger(request.timeoutMilliseconds) ||
        request.timeoutMilliseconds <= 0)
    ) {
      throw new Error(
        "timeoutMilliseconds must be a positive integer when provided.",
      );
    }
  }

  private buildInference(
    request: StrategyAiInferenceRequest,
    response: StrategyAiProviderResponse,
    completedAt: UnixTimestampMilliseconds,
  ): StrategyAiInference {
    if (!isSerializable(response.prediction)) {
      throw new Error(
        "AI provider returned a non-serializable prediction.",
      );
    }

    const generatedAt = response.generatedAt ?? completedAt;
    assertTimestamp(generatedAt, "response.generatedAt");

    const contributions = response.featureContributions;

    if (contributions !== undefined) {
      for (const [feature, contribution] of Object.entries(
        contributions,
      )) {
        assertNonEmpty(feature, "feature contribution key");

        if (
          this.rejectNonFiniteFeatureContributions &&
          !Number.isFinite(contribution)
        ) {
          throw new Error(
            `Feature contribution '${feature}' must be finite.`,
          );
        }
      }
    }

    const confidence = this.shouldNormalizeConfidence
      ? normalizeConfidence(response.confidence)
      : response.confidence;

    if (
      confidence !== undefined &&
      !Number.isFinite(confidence)
    ) {
      throw new Error(
        "AI provider confidence must be finite.",
      );
    }

    return freezeInference({
      inferenceId: `${request.requestId}:inference`,
      modelId: request.modelId,
      modelVersion:
        response.modelVersion ??
        request.modelVersion ??
        "unspecified",
      instrument: this.inferInstrument(request.input),
      generatedAt,
      prediction: response.prediction,
      confidence,
      featureContributions:
        contributions === undefined
          ? undefined
          : Object.freeze({ ...contributions }),
      metadata: freezeMetadata({
        providerId: request.providerId,
        correlationId: request.correlationId,
        ...(request.metadata ?? EMPTY_STRATEGY_METADATA),
        ...(response.metadata ?? EMPTY_STRATEGY_METADATA),
      }),
    });
  }

  private inferInstrument(
    input: StrategySerializableValue,
  ): StrategyAiInference["instrument"] {
    if (
      typeof input === "object" &&
      input !== null &&
      !Array.isArray(input) &&
      "instrument" in input
    ) {
      const instrument = (
        input as Readonly<Record<string, StrategySerializableValue>>
      ).instrument;

      if (
        typeof instrument === "object" &&
        instrument !== null &&
        !Array.isArray(instrument)
      ) {
        return instrument as unknown as StrategyAiInference["instrument"];
      }
    }

    throw new Error(
      "AI inference input must contain a serializable 'instrument' object.",
    );
  }

  private record(
    result: StrategyAiInferenceResult,
  ): StrategyAiInferenceResult {
    this.history.push(result);

    const overflow =
      this.history.length - this.maximumHistoryEntries;

    if (overflow > 0) {
      this.history.splice(0, overflow);
    }

    return result;
  }
}

export default StrategyAiAdapter;