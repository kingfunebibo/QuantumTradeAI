/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 7: Deterministic AI signal generator.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureContribution,
  type AiFeatureSnapshot,
  type AiFeatureVector,
  type AiGeneratedSignal,
  type AiInferenceRequest,
  type AiInferenceResponse,
  type AiModelReference,
  type AiModelRuntimeConfiguration,
  type AiSignalGenerationRequest,
  type AiSignalGenerationResult,
  type AiSignalSourceType,
  type AiStrategyDirection,
  type AiStrategyMetadata,
  type AiStrategySignalAction,
  type AiStrategyTimestamp,
  type MarketRegimeDetection,
} from "./ai-strategy-contracts";
import type { AiInferenceEngine } from "./ai-inference-engine";
import {
  type EnsembleInferenceEngine,
  type EnsembleInferenceRequest,
  type EnsembleInferenceResult,
} from "./ensemble-inference-engine";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface AiSignalGeneratorOptions {
  readonly defaultSignalValidityMs?: number;
  readonly minimumConfidence?: number;
  readonly minimumAbsoluteScore?: number;
  readonly requireValidFeatureSnapshot?: boolean;
  readonly rejectStaleRegime?: boolean;
  readonly generateHoldSignal?: boolean;
  readonly maximumHistoryEntries?: number;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
}

export interface DirectSignalGenerationRequest
  extends AiSignalGenerationRequest {
  readonly sourceType?: Exclude<AiSignalSourceType, "ENSEMBLE">;
  readonly sourceId?: string;
  readonly signalValidityMs?: number;
  readonly minimumConfidence?: number;
  readonly minimumAbsoluteScore?: number;
}

export interface EnsembleSignalGenerationRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly marketContext: AiSignalGenerationRequest["marketContext"];
  readonly featureSnapshot: AiFeatureSnapshot;
  readonly regime?: MarketRegimeDetection;
  readonly ensembleRequest: EnsembleInferenceRequest;
  readonly signalValidityMs?: number;
  readonly minimumConfidence?: number;
  readonly minimumAbsoluteScore?: number;
  readonly metadata: AiStrategyMetadata;
}

export interface AiSignalHistoryQuery {
  readonly correlationId?: string;
  readonly strategyId?: string;
  readonly strategyInstanceId?: string;
  readonly sourceType?: AiSignalSourceType;
  readonly action?: AiStrategySignalAction;
  readonly direction?: AiStrategyDirection;
  readonly status?: AiSignalGenerationResult["status"];
  readonly fromGeneratedAt?: AiStrategyTimestamp;
  readonly toGeneratedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface AiSignalGeneratorMetrics {
  readonly requestCount: number;
  readonly generatedCount: number;
  readonly holdCount: number;
  readonly rejectedCount: number;
  readonly failedCount: number;
  readonly directInferenceCount: number;
  readonly ensembleInferenceCount: number;
  readonly averageConfidence: number;
  readonly averageAbsoluteScore: number;
}

export interface AiSignalGeneratorSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly history: readonly AiSignalGenerationResult[];
  readonly metrics: AiSignalGeneratorMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface AiSignalGenerator {
  generate(
    request: DirectSignalGenerationRequest,
  ): Promise<AiSignalGenerationResult>;
  generateFromEnsemble(
    request: EnsembleSignalGenerationRequest,
  ): Promise<AiSignalGenerationResult>;
  queryHistory(
    query?: AiSignalHistoryQuery,
  ): readonly AiSignalGenerationResult[];
  clearHistory(): void;
  snapshot(): AiSignalGeneratorSnapshot;
}

interface ResolvedOptions {
  readonly defaultSignalValidityMs: number;
  readonly minimumConfidence: number;
  readonly minimumAbsoluteScore: number;
  readonly requireValidFeatureSnapshot: boolean;
  readonly rejectStaleRegime: boolean;
  readonly generateHoldSignal: boolean;
  readonly maximumHistoryEntries: number;
  readonly clock: () => AiStrategyTimestamp;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator: AiStrategyContractValidator;
}

interface NormalizedPrediction {
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly score: number;
  readonly confidence: number;
  readonly rationale: readonly string[];
  readonly featureContributions: readonly AiFeatureContribution[];
  readonly modelReferences: readonly AiModelReference[];
}

const DEFAULT_SIGNAL_VALIDITY_MS = 60_000;
const DEFAULT_MINIMUM_CONFIDENCE = 0.5;
const DEFAULT_MINIMUM_ABSOLUTE_SCORE = 0;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function assertNonEmptyString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const output: Record<
    string,
    string | number | boolean | null | readonly (
      | string
      | number
      | boolean
      | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(output);
}

function cloneModelReference(reference: AiModelReference): AiModelReference {
  return Object.freeze({ ...reference });
}

function cloneContribution(
  contribution: AiFeatureContribution,
): AiFeatureContribution {
  return Object.freeze({
    ...contribution,
    metadata: cloneMetadata(contribution.metadata),
  });
}

function cloneRegime(
  regime: MarketRegimeDetection | undefined,
): MarketRegimeDetection | undefined {
  if (regime === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...regime,
    instrument: Object.freeze({
      ...regime.instrument,
      metadata: cloneMetadata(regime.instrument.metadata),
    }),
    probabilities: Object.freeze(
      regime.probabilities.map((entry) => Object.freeze({ ...entry })),
    ),
    supportingFeatures: Object.freeze(
      regime.supportingFeatures.map(cloneContribution),
    ),
    model: cloneModelReference(regime.model),
    metadata: cloneMetadata(regime.metadata),
  });
}

function cloneSignal(signal: AiGeneratedSignal): AiGeneratedSignal {
  return Object.freeze({
    ...signal,
    instrument: Object.freeze({
      ...signal.instrument,
      metadata: cloneMetadata(signal.instrument.metadata),
    }),
    regime: cloneRegime(signal.regime),
    rationale: Object.freeze([...signal.rationale]),
    featureContributions: Object.freeze(
      signal.featureContributions.map(cloneContribution),
    ),
    modelReferences: Object.freeze(
      signal.modelReferences.map(cloneModelReference),
    ),
    metadata: cloneMetadata(signal.metadata),
  });
}

function cloneResult(
  result: AiSignalGenerationResult,
): AiSignalGenerationResult {
  return Object.freeze({
    ...result,
    signal:
      result.signal === undefined ? undefined : cloneSignal(result.signal),
    inferenceResponses: Object.freeze([...result.inferenceResponses]),
    rejectionReasons: Object.freeze([...result.rejectionReasons]),
    metadata: cloneMetadata(result.metadata),
  });
}

function compareResults(
  left: AiSignalGenerationResult,
  right: AiSignalGenerationResult,
): number {
  if (left.generatedAt !== right.generatedAt) {
    return left.generatedAt - right.generatedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function inferDirection(
  label: string | undefined,
  explicitDirection: AiStrategyDirection | undefined,
  score: number,
): AiStrategyDirection {
  if (explicitDirection !== undefined) {
    return explicitDirection;
  }

  switch (label?.trim().toUpperCase()) {
    case "BUY":
    case "LONG":
      return "LONG";
    case "SELL":
    case "SHORT":
      return "SHORT";
    case "FLAT":
      return "FLAT";
    case "HOLD":
    case "NEUTRAL":
      return "HOLD";
    default:
      return score > 0 ? "LONG" : score < 0 ? "SHORT" : "HOLD";
  }
}

function inferAction(
  label: string | undefined,
  direction: AiStrategyDirection,
): AiStrategySignalAction {
  switch (label?.trim().toUpperCase()) {
    case "BUY":
    case "LONG":
      return "BUY";
    case "SELL":
    case "SHORT":
      return "SELL";
    case "CLOSE_LONG":
      return "CLOSE_LONG";
    case "CLOSE_SHORT":
      return "CLOSE_SHORT";
    case "REDUCE_LONG":
      return "REDUCE_LONG";
    case "REDUCE_SHORT":
      return "REDUCE_SHORT";
    case "HOLD":
    case "FLAT":
    case "NEUTRAL":
      return "HOLD";
    default:
      return direction === "LONG"
        ? "BUY"
        : direction === "SHORT"
          ? "SELL"
          : "HOLD";
  }
}

function sourceTypeForConfiguration(
  configuration: AiModelRuntimeConfiguration,
  requestedType: DirectSignalGenerationRequest["sourceType"],
): Exclude<AiSignalSourceType, "ENSEMBLE"> {
  if (requestedType !== undefined) {
    return requestedType;
  }

  const family = String(configuration.metadata.modelFamily ?? "").toUpperCase();
  if (family === "LLM") {
    return "LLM";
  }
  if (family === "REINFORCEMENT_LEARNING") {
    return "REINFORCEMENT_LEARNING";
  }
  return "MODEL";
}

export class DeterministicAiSignalGenerator
  implements AiSignalGenerator
{
  private readonly options: ResolvedOptions;
  private readonly history: AiSignalGenerationResult[] = [];
  private sequence = 0;
  private directInferenceCount = 0;
  private ensembleInferenceCount = 0;

  public constructor(
    private readonly inferenceEngine: AiInferenceEngine,
    private readonly ensembleEngine?: EnsembleInferenceEngine,
    options: AiSignalGeneratorOptions = {},
  ) {
    const defaultSignalValidityMs =
      options.defaultSignalValidityMs ?? DEFAULT_SIGNAL_VALIDITY_MS;
    const minimumConfidence =
      options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
    const minimumAbsoluteScore =
      options.minimumAbsoluteScore ?? DEFAULT_MINIMUM_ABSOLUTE_SCORE;
    const maximumHistoryEntries =
      options.maximumHistoryEntries ?? DEFAULT_MAXIMUM_HISTORY_ENTRIES;

    assertPositiveInteger(
      defaultSignalValidityMs,
      "defaultSignalValidityMs",
    );
    assertUnitInterval(minimumConfidence, "minimumConfidence");
    assertUnitInterval(minimumAbsoluteScore, "minimumAbsoluteScore");
    assertPositiveInteger(
      maximumHistoryEntries,
      "maximumHistoryEntries",
    );

    this.options = Object.freeze({
      defaultSignalValidityMs,
      minimumConfidence,
      minimumAbsoluteScore,
      requireValidFeatureSnapshot:
        options.requireValidFeatureSnapshot ?? true,
      rejectStaleRegime: options.rejectStaleRegime ?? true,
      generateHoldSignal: options.generateHoldSignal ?? true,
      maximumHistoryEntries,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
    });
  }

  public async generate(
    request: DirectSignalGenerationRequest,
  ): Promise<AiSignalGenerationResult> {
    const generatedAt = this.options.clock();

    try {
      this.validateDirectRequest(request);
      const rejectionReasons = this.preflightRejectionReasons(
        request.featureSnapshot,
        request.regime,
        generatedAt,
      );

      if (rejectionReasons.length > 0) {
        return this.recordResult({
          requestId: request.requestId,
          correlationId: request.correlationId,
          status: "REJECTED",
          inferenceResponses: Object.freeze([]),
          rejectionReasons: Object.freeze(rejectionReasons),
          generatedAt,
          metadata: cloneMetadata(request.metadata),
        });
      }

      const featureVector = this.selectFeatureVector(
        request.featureSnapshot,
        request.marketContext.instrument.normalizedSymbol,
        request.marketContext.timeframe,
      );

      if (featureVector === undefined) {
        return this.recordResult({
          requestId: request.requestId,
          correlationId: request.correlationId,
          status: "REJECTED",
          inferenceResponses: Object.freeze([]),
          rejectionReasons: Object.freeze([
            "No feature vector matched the requested instrument and timeframe.",
          ]),
          generatedAt,
          metadata: cloneMetadata(request.metadata),
        });
      }

      const responses = await Promise.all(
        request.modelConfigurations.map((configuration, index) =>
          this.executeInference(
            request,
            featureVector,
            configuration,
            index,
          ),
        ),
      );
      this.directInferenceCount += responses.length;

      const normalized = this.aggregateDirectResponses(responses);
      const sourceType =
        request.modelConfigurations.length > 1
          ? "HYBRID"
          : sourceTypeForConfiguration(
              request.modelConfigurations[0]!,
              request.sourceType,
            );
      const sourceId =
        request.sourceId ??
        (request.modelConfigurations.length === 1
          ? `${request.modelConfigurations[0]!.providerId}/${request.modelConfigurations[0]!.modelId}`
          : `hybrid:${request.strategyId}`);

      return this.finalizeSignal(
        request,
        responses,
        normalized,
        sourceType,
        sourceId,
        generatedAt,
      );
    } catch (error) {
      return this.recordResult({
        requestId: request.requestId,
        correlationId: request.correlationId,
        status: "FAILED",
        inferenceResponses: Object.freeze([]),
        rejectionReasons: Object.freeze([
          error instanceof Error ? error.message : String(error),
        ]),
        generatedAt,
        metadata: cloneMetadata(request.metadata),
      });
    }
  }

  public async generateFromEnsemble(
    request: EnsembleSignalGenerationRequest,
  ): Promise<AiSignalGenerationResult> {
    const generatedAt = this.options.clock();

    try {
      this.validateEnsembleRequest(request);
      if (this.ensembleEngine === undefined) {
        throw new Error(
          "An ensemble inference engine is required for ensemble signal generation.",
        );
      }

      const rejectionReasons = this.preflightRejectionReasons(
        request.featureSnapshot,
        request.regime,
        generatedAt,
      );
      if (rejectionReasons.length > 0) {
        return this.recordResult({
          requestId: request.requestId,
          correlationId: request.correlationId,
          status: "REJECTED",
          inferenceResponses: Object.freeze([]),
          rejectionReasons: Object.freeze(rejectionReasons),
          generatedAt,
          metadata: cloneMetadata(request.metadata),
        });
      }

      const ensembleResult =
        await this.ensembleEngine.execute(request.ensembleRequest);
      this.ensembleInferenceCount += 1;

      const normalized =
        this.normalizeEnsembleDecision(ensembleResult);
      return this.finalizeSignal(
        request,
        ensembleResult.responses,
        normalized,
        "ENSEMBLE",
        ensembleResult.configuration.ensembleId,
        generatedAt,
      );
    } catch (error) {
      return this.recordResult({
        requestId: request.requestId,
        correlationId: request.correlationId,
        status: "FAILED",
        inferenceResponses: Object.freeze([]),
        rejectionReasons: Object.freeze([
          error instanceof Error ? error.message : String(error),
        ]),
        generatedAt,
        metadata: cloneMetadata(request.metadata),
      });
    }
  }

  public queryHistory(
    query: AiSignalHistoryQuery = {},
  ): readonly AiSignalGenerationResult[] {
    const limit = query.limit ?? this.options.maximumHistoryEntries;
    assertPositiveInteger(limit, "query.limit");

    if (
      query.fromGeneratedAt !== undefined &&
      query.toGeneratedAt !== undefined &&
      query.fromGeneratedAt > query.toGeneratedAt
    ) {
      throw new RangeError(
        "query.fromGeneratedAt cannot exceed query.toGeneratedAt.",
      );
    }

    return Object.freeze(
      this.history
        .filter((result) => {
          const signal = result.signal;
          if (
            query.correlationId !== undefined &&
            result.correlationId !== query.correlationId
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
            query.strategyId !== undefined &&
            signal?.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.strategyInstanceId !== undefined &&
            signal?.strategyInstanceId !== query.strategyInstanceId
          ) {
            return false;
          }
          if (
            query.sourceType !== undefined &&
            signal?.sourceType !== query.sourceType
          ) {
            return false;
          }
          if (
            query.action !== undefined &&
            signal?.action !== query.action
          ) {
            return false;
          }
          if (
            query.direction !== undefined &&
            signal?.direction !== query.direction
          ) {
            return false;
          }
          if (
            query.fromGeneratedAt !== undefined &&
            result.generatedAt < query.fromGeneratedAt
          ) {
            return false;
          }
          if (
            query.toGeneratedAt !== undefined &&
            result.generatedAt > query.toGeneratedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareResults)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public snapshot(): AiSignalGeneratorSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      history: Object.freeze([...this.history]),
      metrics: this.calculateMetrics(),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private validateDirectRequest(
    request: DirectSignalGenerationRequest,
  ): void {
    const validation =
      this.options.validator.validateSignalGenerationRequest(request);
    this.options.validator.assertValid(
      validation,
      "AI signal generation request validation failed.",
    );

    if (request.modelConfigurations.length === 0) {
      throw new RangeError(
        "request.modelConfigurations must contain at least one model.",
      );
    }
    this.validateThresholdOverrides(request);
  }

  private validateEnsembleRequest(
    request: EnsembleSignalGenerationRequest,
  ): void {
    assertNonEmptyString(request.requestId, "request.requestId");
    assertNonEmptyString(
      request.correlationId,
      "request.correlationId",
    );
    assertNonEmptyString(request.strategyId, "request.strategyId");
    assertNonEmptyString(
      request.strategyInstanceId,
      "request.strategyInstanceId",
    );
    const marketValidation =
      this.options.validator.validateMarketContext(
        request.marketContext,
      );
    this.options.validator.assertValid(
      marketValidation,
      "Ensemble signal market context validation failed.",
    );
    const snapshotValidation =
      this.options.validator.validateFeatureSnapshot(
        request.featureSnapshot,
      );
    this.options.validator.assertValid(
      snapshotValidation,
      "Ensemble signal feature snapshot validation failed.",
    );
    this.validateThresholdOverrides(request);
  }

  private validateThresholdOverrides(
    request: {
      readonly signalValidityMs?: number;
      readonly minimumConfidence?: number;
      readonly minimumAbsoluteScore?: number;
    },
  ): void {
    if (request.signalValidityMs !== undefined) {
      assertPositiveInteger(
        request.signalValidityMs,
        "request.signalValidityMs",
      );
    }
    if (request.minimumConfidence !== undefined) {
      assertUnitInterval(
        request.minimumConfidence,
        "request.minimumConfidence",
      );
    }
    if (request.minimumAbsoluteScore !== undefined) {
      assertUnitInterval(
        request.minimumAbsoluteScore,
        "request.minimumAbsoluteScore",
      );
    }
  }

  private preflightRejectionReasons(
    snapshot: AiFeatureSnapshot,
    regime: MarketRegimeDetection | undefined,
    generatedAt: number,
  ): string[] {
    const reasons: string[] = [];

    if (this.options.requireValidFeatureSnapshot && !snapshot.valid) {
      reasons.push("The feature snapshot is invalid.");
    }
    if (
      this.options.rejectStaleRegime &&
      regime !== undefined &&
      regime.validUntil < generatedAt
    ) {
      reasons.push("The market-regime detection is stale.");
    }

    return reasons;
  }

  private selectFeatureVector(
    snapshot: AiFeatureSnapshot,
    normalizedSymbol: string,
    timeframe: AiSignalGenerationRequest["marketContext"]["timeframe"],
  ): AiFeatureVector | undefined {
    const exact = snapshot.vectors
      .filter(
        (vector) =>
          vector.instrument.normalizedSymbol === normalizedSymbol &&
          vector.timeframe === timeframe,
      )
      .sort((left, right) => {
        if (left.observedAt !== right.observedAt) {
          return right.observedAt - left.observedAt;
        }
        return left.vectorId.localeCompare(right.vectorId);
      });

    return exact[0];
  }

  private async executeInference(
    request: DirectSignalGenerationRequest,
    featureVector: AiFeatureVector,
    configuration: AiModelRuntimeConfiguration,
    index: number,
  ): Promise<AiInferenceResponse> {
    const inferenceRequest: AiInferenceRequest = Object.freeze({
      requestId: `${request.requestId}:model:${index + 1}`,
      correlationId: request.correlationId,
      strategyId: request.strategyId,
      strategyInstanceId: request.strategyInstanceId,
      requestedAt: request.requestedAt,
      marketContext: request.marketContext,
      featureVector,
      model: configuration,
      purpose: "SIGNAL_GENERATION",
      metadata: cloneMetadata(request.metadata),
    });

    return this.inferenceEngine.infer(inferenceRequest);
  }

  private aggregateDirectResponses(
    responses: readonly AiInferenceResponse[],
  ): NormalizedPrediction {
    const successful = responses.filter(
      (response) =>
        response.status === "SUCCEEDED" &&
        response.prediction !== undefined,
    );

    if (successful.length === 0) {
      return Object.freeze({
        action: "HOLD",
        direction: "HOLD",
        score: 0,
        confidence: 0,
        rationale: Object.freeze([
          "No model produced a successful prediction.",
        ]),
        featureContributions: Object.freeze([]),
        modelReferences: Object.freeze(
          responses.map((response) =>
            Object.freeze({
              providerId: response.providerId,
              modelId: response.modelId,
              modelVersion: response.modelVersion,
            }),
          ),
        ),
      });
    }

    const score =
      successful.reduce((sum, response) => {
        const prediction = response.prediction!;
        const value =
          prediction.score ??
          prediction.value ??
          (prediction.probability !== undefined
            ? prediction.probability * 2 - 1
            : 0);
        return sum + clamp(value, -1, 1);
      }, 0) / successful.length;
    const confidence =
      successful.reduce(
        (sum, response) =>
          sum +
          clamp(
            response.confidence ??
              response.prediction!.probability ??
              Math.abs(score),
            0,
            1,
          ),
        0,
      ) / successful.length;

    const direction = inferDirection(
      successful[0]!.prediction!.label,
      successful.length === 1
        ? successful[0]!.prediction!.direction
        : undefined,
      score,
    );
    const action = inferAction(
      successful.length === 1
        ? successful[0]!.prediction!.label
        : undefined,
      direction,
    );

    return Object.freeze({
      action,
      direction,
      score: clamp(score, -1, 1),
      confidence: clamp(confidence, 0, 1),
      rationale: Object.freeze([
        `${successful.length} of ${responses.length} model responses were successfully aggregated.`,
        `Aggregated action is ${action} with confidence ${confidence.toFixed(6)}.`,
      ]),
      featureContributions: this.mergeFeatureContributions(successful),
      modelReferences: Object.freeze(
        successful.map((response) =>
          Object.freeze({
            providerId: response.providerId,
            modelId: response.modelId,
            modelVersion: response.modelVersion,
          }),
        ),
      ),
    });
  }

  private normalizeEnsembleDecision(
    result: EnsembleInferenceResult,
  ): NormalizedPrediction {
    return Object.freeze({
      action: result.decision.action,
      direction: result.decision.direction,
      score: result.decision.score,
      confidence: result.decision.confidence,
      rationale: Object.freeze([...result.decision.rationale]),
      featureContributions: this.mergeFeatureContributions(
        result.responses.filter(
          (response) => response.status === "SUCCEEDED",
        ),
      ),
      modelReferences: Object.freeze(
        result.decision.votes.map((vote) =>
          cloneModelReference(vote.model),
        ),
      ),
    });
  }

  private mergeFeatureContributions(
    responses: readonly AiInferenceResponse[],
  ): readonly AiFeatureContribution[] {
    const totals = new Map<
      string,
      { total: number; count: number }
    >();

    for (const response of responses) {
      for (const contribution of response.featureContributions) {
        const current = totals.get(contribution.featureId) ?? {
          total: 0,
          count: 0,
        };
        current.total += contribution.contribution;
        current.count += 1;
        totals.set(contribution.featureId, current);
      }
    }

    const merged = [...totals.entries()]
      .map(([featureId, aggregate]) => ({
        featureId,
        contribution: aggregate.total / aggregate.count,
      }))
      .sort((left, right) => {
        const magnitude =
          Math.abs(right.contribution) -
          Math.abs(left.contribution);
        return magnitude !== 0
          ? magnitude
          : left.featureId.localeCompare(right.featureId);
      })
      .map((entry, index) =>
        cloneContribution({
          featureId: entry.featureId,
          contribution: entry.contribution,
          rank: index + 1,
          direction:
            entry.contribution > 0
              ? "POSITIVE"
              : entry.contribution < 0
                ? "NEGATIVE"
                : "NEUTRAL",
          metadata: EMPTY_AI_STRATEGY_METADATA,
        }),
      );

    return Object.freeze(merged);
  }

  private finalizeSignal(
    request: {
      readonly requestId: string;
      readonly correlationId: string;
      readonly strategyId: string;
      readonly strategyInstanceId: string;
      readonly marketContext: AiSignalGenerationRequest["marketContext"];
      readonly regime?: MarketRegimeDetection;
      readonly signalValidityMs?: number;
      readonly minimumConfidence?: number;
      readonly minimumAbsoluteScore?: number;
      readonly metadata: AiStrategyMetadata;
    },
    responses: readonly AiInferenceResponse[],
    prediction: NormalizedPrediction,
    sourceType: AiSignalSourceType,
    sourceId: string,
    generatedAt: AiStrategyTimestamp,
  ): AiSignalGenerationResult {
    const minimumConfidence =
      request.minimumConfidence ?? this.options.minimumConfidence;
    const minimumAbsoluteScore =
      request.minimumAbsoluteScore ??
      this.options.minimumAbsoluteScore;
    const rejectionReasons: string[] = [];

    if (prediction.confidence < minimumConfidence) {
      rejectionReasons.push(
        `Confidence ${prediction.confidence.toFixed(6)} is below minimum ${minimumConfidence.toFixed(6)}.`,
      );
    }
    if (
      prediction.action !== "HOLD" &&
      Math.abs(prediction.score) < minimumAbsoluteScore
    ) {
      rejectionReasons.push(
        `Absolute score ${Math.abs(prediction.score).toFixed(6)} is below minimum ${minimumAbsoluteScore.toFixed(6)}.`,
      );
    }

    const shouldHold =
      prediction.action === "HOLD" ||
      prediction.direction === "HOLD" ||
      prediction.direction === "FLAT";

    if (rejectionReasons.length > 0) {
      return this.recordResult({
        requestId: request.requestId,
        correlationId: request.correlationId,
        status: "REJECTED",
        inferenceResponses: Object.freeze([...responses]),
        rejectionReasons: Object.freeze(rejectionReasons),
        generatedAt,
        metadata: cloneMetadata(request.metadata),
      });
    }

    if (shouldHold && !this.options.generateHoldSignal) {
      return this.recordResult({
        requestId: request.requestId,
        correlationId: request.correlationId,
        status: "HOLD",
        inferenceResponses: Object.freeze([...responses]),
        rejectionReasons: Object.freeze([]),
        generatedAt,
        metadata: cloneMetadata(request.metadata),
      });
    }

    const signal = cloneSignal({
      signalId: this.nextId("ai-signal", generatedAt),
      correlationId: request.correlationId,
      strategyId: request.strategyId,
      strategyInstanceId: request.strategyInstanceId,
      sourceType,
      sourceId,
      instrument: request.marketContext.instrument,
      timeframe: request.marketContext.timeframe,
      action: shouldHold ? "HOLD" : prediction.action,
      direction: shouldHold ? "HOLD" : prediction.direction,
      generatedAt,
      validUntil:
        generatedAt +
        (request.signalValidityMs ??
          this.options.defaultSignalValidityMs),
      confidence: prediction.confidence,
      rawConfidence: prediction.confidence,
      score: prediction.score,
      regime: cloneRegime(request.regime),
      rationale: Object.freeze([...prediction.rationale]),
      featureContributions: prediction.featureContributions,
      modelReferences: prediction.modelReferences,
      metadata: cloneMetadata(request.metadata),
    });

    const validation =
      this.options.validator.validateGeneratedSignal(signal);
    this.options.validator.assertValid(
      validation,
      "Generated AI signal validation failed.",
    );

    return this.recordResult({
      requestId: request.requestId,
      correlationId: request.correlationId,
      status: shouldHold ? "HOLD" : "GENERATED",
      signal,
      inferenceResponses: Object.freeze([...responses]),
      rejectionReasons: Object.freeze([]),
      generatedAt,
      metadata: cloneMetadata(request.metadata),
    });
  }

  private recordResult(
    result: AiSignalGenerationResult,
  ): AiSignalGenerationResult {
    const cloned = cloneResult(result);
    this.history.push(cloned);
    this.history.sort(compareResults);

    while (
      this.history.length > this.options.maximumHistoryEntries
    ) {
      this.history.shift();
    }

    return cloned;
  }

  private calculateMetrics(): AiSignalGeneratorMetrics {
    const signals = this.history
      .map((entry) => entry.signal)
      .filter(
        (signal): signal is AiGeneratedSignal =>
          signal !== undefined,
      );
    const confidenceTotal = signals.reduce(
      (sum, signal) => sum + signal.confidence,
      0,
    );
    const absoluteScoreTotal = signals.reduce(
      (sum, signal) => sum + Math.abs(signal.score),
      0,
    );

    return Object.freeze({
      requestCount: this.history.length,
      generatedCount: this.history.filter(
        (entry) => entry.status === "GENERATED",
      ).length,
      holdCount: this.history.filter(
        (entry) => entry.status === "HOLD",
      ).length,
      rejectedCount: this.history.filter(
        (entry) => entry.status === "REJECTED",
      ).length,
      failedCount: this.history.filter(
        (entry) => entry.status === "FAILED",
      ).length,
      directInferenceCount: this.directInferenceCount,
      ensembleInferenceCount: this.ensembleInferenceCount,
      averageConfidence:
        signals.length === 0
          ? 0
          : confidenceTotal / signals.length,
      averageAbsoluteScore:
        signals.length === 0
          ? 0
          : absoluteScoreTotal / signals.length,
    });
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(
      prefix,
      timestamp,
      this.sequence,
    );
  }
}

export function createDeterministicAiSignalGenerator(
  inferenceEngine: AiInferenceEngine,
  ensembleEngine?: EnsembleInferenceEngine,
  options: AiSignalGeneratorOptions = {},
): DeterministicAiSignalGenerator {
  return new DeterministicAiSignalGenerator(
    inferenceEngine,
    ensembleEngine,
    options,
  );
}