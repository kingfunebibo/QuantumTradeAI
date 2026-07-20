/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 12: Deterministic walk-forward validation engine.
 *
 * Responsibilities:
 * - validate chronological training, validation, and test folds
 * - execute deterministic parameter selection and fold evaluation
 * - calculate normalized objective, stability, and acceptance scores
 * - reject leakage, overlap, invalid metrics, and unstable performance
 * - retain immutable bounded validation history
 * - expose deterministic operational metrics and snapshots
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiStrategyMetadata,
  type AiStrategyPrimitive,
  type AiStrategyTimestamp,
  type AiValidationWindow,
  type OptimizationObjective,
  type WalkForwardFold,
  type WalkForwardFoldDefinition,
  type WalkForwardValidationRequest,
  type WalkForwardValidationResult,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface WalkForwardParameterSelectionContext {
  readonly request: WalkForwardValidationRequest;
  readonly fold: WalkForwardFoldDefinition;
  readonly previousFolds: readonly WalkForwardFold[];
  readonly deterministicSeed?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface WalkForwardEvaluationContext {
  readonly request: WalkForwardValidationRequest;
  readonly fold: WalkForwardFoldDefinition;
  readonly phase: "TRAINING" | "VALIDATION" | "TEST";
  readonly window: AiValidationWindow;
  readonly parameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly deterministicSeed?: string;
  readonly metadata: AiStrategyMetadata;
}

export type WalkForwardParameterSelector = (
  context: WalkForwardParameterSelectionContext,
) =>
  | Readonly<Record<string, AiStrategyPrimitive>>
  | Promise<Readonly<Record<string, AiStrategyPrimitive>>>;

export type WalkForwardMetricEvaluator = (
  context: WalkForwardEvaluationContext,
) =>
  | Readonly<Record<string, number>>
  | Promise<Readonly<Record<string, number>>>;

export interface WalkForwardValidationEngineOptions {
  readonly maximumHistoryEntries?: number;
  readonly maximumFolds?: number;
  readonly minimumAcceptedFoldRatio?: number;
  readonly maximumValidationToTrainingDegradation?: number;
  readonly maximumTestToValidationDegradation?: number;
  readonly maximumObjectiveCoefficientOfVariation?: number;
  readonly requirePositiveObjective?: boolean;
  readonly rejectOverlappingFolds?: boolean;
  readonly rejectDatasetMismatch?: boolean;
  readonly failFast?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly parameterSelector?: WalkForwardParameterSelector;
  readonly metricEvaluator?: WalkForwardMetricEvaluator;
  readonly validator?: AiStrategyContractValidator;
  readonly metadata?: AiStrategyMetadata;
}

export interface WalkForwardValidationHistoryQuery {
  readonly requestId?: string;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly status?: WalkForwardValidationResult["status"];
  readonly accepted?: boolean;
  readonly minimumAcceptanceScore?: number;
  readonly maximumAcceptanceScore?: number;
  readonly fromCompletedAt?: AiStrategyTimestamp;
  readonly toCompletedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface WalkForwardValidationMetrics {
  readonly executionCount: number;
  readonly passedExecutionCount: number;
  readonly partialExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly acceptedExecutionCount: number;
  readonly rejectedExecutionCount: number;
  readonly evaluatedFoldCount: number;
  readonly acceptedFoldCount: number;
  readonly rejectedFoldCount: number;
  readonly averageAcceptanceScore: number;
  readonly averageStabilityScore: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
}

export interface WalkForwardValidationEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly history: readonly WalkForwardValidationResult[];
  readonly metrics: WalkForwardValidationMetrics;
  readonly metadata: AiStrategyMetadata;
}

interface MutableMetrics {
  executionCount: number;
  passedExecutionCount: number;
  partialExecutionCount: number;
  failedExecutionCount: number;
  acceptedExecutionCount: number;
  rejectedExecutionCount: number;
  evaluatedFoldCount: number;
  acceptedFoldCount: number;
  rejectedFoldCount: number;
  totalAcceptanceScore: number;
  totalStabilityScore: number;
  totalExecutionLatencyMs: number;
  maximumExecutionLatencyMs: number;
}

interface FoldEvaluation {
  readonly fold: WalkForwardFold;
  readonly objectiveValues: {
    readonly training: number;
    readonly validation: number;
    readonly test: number;
  };
}

const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 2_000;
const DEFAULT_MAXIMUM_FOLDS = 100;
const DEFAULT_MINIMUM_ACCEPTED_FOLD_RATIO = 0.7;
const DEFAULT_MAXIMUM_VALIDATION_DEGRADATION = 0.35;
const DEFAULT_MAXIMUM_TEST_DEGRADATION = 0.35;
const DEFAULT_MAXIMUM_OBJECTIVE_CV = 0.75;
const EPSILON = 1e-12;

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function assertNonEmptyString(value: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
}

function assertFiniteNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
}

function assertPositiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive integer.`);
  }
}

function assertProbability(value: number, path: string): void {
  assertFiniteNumber(value, path);
  if (value < 0 || value > 1) {
    throw new RangeError(`${path} must be between zero and one.`);
  }
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const cloned: Record<
    string,
    string | number | boolean | null | readonly (
      string | number | boolean | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    cloned[key] = Array.isArray(value)
      ? Object.freeze([...value])
      : value;
  }

  return Object.freeze(cloned);
}

function cloneWindow(window: AiValidationWindow): AiValidationWindow {
  return Object.freeze({
    startTime: window.startTime,
    endTime: window.endTime,
    datasetId: window.datasetId,
    metadata: cloneMetadata(window.metadata),
  });
}

function cloneParameters(
  parameters: Readonly<Record<string, AiStrategyPrimitive>>,
): Readonly<Record<string, AiStrategyPrimitive>> {
  return Object.freeze({ ...parameters });
}

function cloneMetrics(
  metrics: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.freeze({ ...metrics });
}

function cloneFold(fold: WalkForwardFold): WalkForwardFold {
  return Object.freeze({
    foldId: fold.foldId,
    sequence: fold.sequence,
    trainingWindow: cloneWindow(fold.trainingWindow),
    validationWindow: cloneWindow(fold.validationWindow),
    testWindow: cloneWindow(fold.testWindow),
    parameters: cloneParameters(fold.parameters),
    trainingMetrics: cloneMetrics(fold.trainingMetrics),
    validationMetrics: cloneMetrics(fold.validationMetrics),
    testMetrics: cloneMetrics(fold.testMetrics),
    accepted: fold.accepted,
    rejectionReasons: Object.freeze([...fold.rejectionReasons]),
    metadata: cloneMetadata(fold.metadata),
  });
}

function cloneResult(
  result: WalkForwardValidationResult,
): WalkForwardValidationResult {
  return Object.freeze({
    requestId: result.requestId,
    strategyId: result.strategyId,
    strategyVersion: result.strategyVersion,
    status: result.status,
    folds: Object.freeze(result.folds.map(cloneFold)),
    aggregateMetrics: cloneMetrics(result.aggregateMetrics),
    stabilityScore: result.stabilityScore,
    acceptanceScore: result.acceptanceScore,
    accepted: result.accepted,
    rejectionReasons: Object.freeze([...result.rejectionReasons]),
    completedAt: result.completedAt,
    metadata: cloneMetadata(result.metadata),
  });
}

function compareFoldDefinitions(
  left: WalkForwardFoldDefinition,
  right: WalkForwardFoldDefinition,
): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return left.foldId.localeCompare(right.foldId);
}

function compareResults(
  left: WalkForwardValidationResult,
  right: WalkForwardValidationResult,
): number {
  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) /
    values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const average = mean(values);
  const variance = values.reduce(
    (total, value) => total + Math.pow(value - average, 2),
    0,
  ) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function windowsOverlap(
  left: AiValidationWindow,
  right: AiValidationWindow,
): boolean {
  return left.startTime <= right.endTime &&
    right.startTime <= left.endTime;
}

export class WalkForwardValidationEngine {
  private readonly options: Required<
    Omit<
      WalkForwardValidationEngineOptions,
      "metadata"
    >
  > & {
    readonly metadata: AiStrategyMetadata;
  };

  private readonly history: WalkForwardValidationResult[] = [];

  private readonly metricsState: MutableMetrics = {
    executionCount: 0,
    passedExecutionCount: 0,
    partialExecutionCount: 0,
    failedExecutionCount: 0,
    acceptedExecutionCount: 0,
    rejectedExecutionCount: 0,
    evaluatedFoldCount: 0,
    acceptedFoldCount: 0,
    rejectedFoldCount: 0,
    totalAcceptanceScore: 0,
    totalStabilityScore: 0,
    totalExecutionLatencyMs: 0,
    maximumExecutionLatencyMs: 0,
  };

  public constructor(options: WalkForwardValidationEngineOptions = {}) {
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const maximumFolds =
      options.maximumFolds ?? DEFAULT_MAXIMUM_FOLDS;
    const minimumAcceptedFoldRatio =
      options.minimumAcceptedFoldRatio ??
      DEFAULT_MINIMUM_ACCEPTED_FOLD_RATIO;
    const maximumValidationToTrainingDegradation =
      options.maximumValidationToTrainingDegradation ??
      DEFAULT_MAXIMUM_VALIDATION_DEGRADATION;
    const maximumTestToValidationDegradation =
      options.maximumTestToValidationDegradation ??
      DEFAULT_MAXIMUM_TEST_DEGRADATION;
    const maximumObjectiveCoefficientOfVariation =
      options.maximumObjectiveCoefficientOfVariation ??
      DEFAULT_MAXIMUM_OBJECTIVE_CV;

    assertPositiveInteger(
      maximumHistoryEntries,
      "options.maximumHistoryEntries",
    );
    assertPositiveInteger(maximumFolds, "options.maximumFolds");
    assertProbability(
      minimumAcceptedFoldRatio,
      "options.minimumAcceptedFoldRatio",
    );
    assertProbability(
      maximumValidationToTrainingDegradation,
      "options.maximumValidationToTrainingDegradation",
    );
    assertProbability(
      maximumTestToValidationDegradation,
      "options.maximumTestToValidationDegradation",
    );
    if (
      !Number.isFinite(maximumObjectiveCoefficientOfVariation) ||
      maximumObjectiveCoefficientOfVariation < 0
    ) {
      throw new RangeError(
        "options.maximumObjectiveCoefficientOfVariation must be a non-negative finite number.",
      );
    }

    this.options = Object.freeze({
      maximumHistoryEntries,
      maximumFolds,
      minimumAcceptedFoldRatio,
      maximumValidationToTrainingDegradation,
      maximumTestToValidationDegradation,
      maximumObjectiveCoefficientOfVariation,
      requirePositiveObjective:
        options.requirePositiveObjective ?? false,
      rejectOverlappingFolds:
        options.rejectOverlappingFolds ?? true,
      rejectDatasetMismatch:
        options.rejectDatasetMismatch ?? true,
      failFast: options.failFast ?? false,
      clock: options.clock ?? defaultClock,
      parameterSelector:
        options.parameterSelector ??
        this.defaultParameterSelector,
      metricEvaluator:
        options.metricEvaluator ??
        this.defaultMetricEvaluator,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      metadata: cloneMetadata(options.metadata),
    });
  }

  public async validate(
    request: WalkForwardValidationRequest,
  ): Promise<WalkForwardValidationResult> {
    const startedAt = this.options.clock();
    this.metricsState.executionCount += 1;

    try {
      this.options.validator.assertWalkForwardRequest(request);
      this.validateRequestSemantics(request);

      const definitions = [...request.folds].sort(
        compareFoldDefinitions,
      );
      const evaluations: FoldEvaluation[] = [];
      const globalRejectionReasons: string[] = [];

      for (const definition of definitions) {
        try {
          const evaluation = await this.evaluateFold(
            request,
            definition,
            evaluations.map((entry) => entry.fold),
          );
          evaluations.push(evaluation);

          if (
            this.options.failFast &&
            !evaluation.fold.accepted
          ) {
            globalRejectionReasons.push(
              `Validation stopped after rejected fold '${definition.foldId}'.`,
            );
            break;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const failedFold = this.createFailedFold(
            definition,
            message,
          );
          evaluations.push({
            fold: failedFold,
            objectiveValues: {
              training: 0,
              validation: 0,
              test: 0,
            },
          });

          if (this.options.failFast) {
            globalRejectionReasons.push(
              `Validation stopped after fold '${definition.foldId}' failed: ${message}`,
            );
            break;
          }
        }
      }

      const result = this.buildResult(
        request,
        evaluations,
        globalRejectionReasons,
        this.options.clock(),
      );
      return this.recordResult(result, startedAt);
    } catch (error) {
      const completedAt = this.options.clock();
      const result: WalkForwardValidationResult = Object.freeze({
        requestId: request.requestId,
        strategyId: request.strategyId,
        strategyVersion: request.strategyVersion,
        status: "FAILED",
        folds: Object.freeze([]),
        aggregateMetrics: Object.freeze({}),
        stabilityScore: 0,
        acceptanceScore: 0,
        accepted: false,
        rejectionReasons: Object.freeze([
          error instanceof Error ? error.message : String(error),
        ]),
        completedAt,
        metadata: cloneMetadata(request.metadata),
      });

      return this.recordResult(result, startedAt);
    }
  }

  public queryHistory(
    query: WalkForwardValidationHistoryQuery = {},
  ): readonly WalkForwardValidationResult[] {
    const limit =
      query.limit ?? this.options.maximumHistoryEntries;
    assertPositiveInteger(limit, "query.limit");

    if (
      query.fromCompletedAt !== undefined &&
      query.toCompletedAt !== undefined &&
      query.fromCompletedAt > query.toCompletedAt
    ) {
      throw new RangeError(
        "query.fromCompletedAt cannot exceed query.toCompletedAt.",
      );
    }

    return Object.freeze(
      this.history
        .filter((result) => {
          if (
            query.requestId !== undefined &&
            result.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.strategyId !== undefined &&
            result.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.strategyVersion !== undefined &&
            result.strategyVersion !== query.strategyVersion
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
            query.accepted !== undefined &&
            result.accepted !== query.accepted
          ) {
            return false;
          }
          if (
            query.minimumAcceptanceScore !== undefined &&
            result.acceptanceScore <
              query.minimumAcceptanceScore
          ) {
            return false;
          }
          if (
            query.maximumAcceptanceScore !== undefined &&
            result.acceptanceScore >
              query.maximumAcceptanceScore
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
        .sort(compareResults)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public metrics(): WalkForwardValidationMetrics {
    const state = this.metricsState;
    return Object.freeze({
      executionCount: state.executionCount,
      passedExecutionCount: state.passedExecutionCount,
      partialExecutionCount: state.partialExecutionCount,
      failedExecutionCount: state.failedExecutionCount,
      acceptedExecutionCount: state.acceptedExecutionCount,
      rejectedExecutionCount: state.rejectedExecutionCount,
      evaluatedFoldCount: state.evaluatedFoldCount,
      acceptedFoldCount: state.acceptedFoldCount,
      rejectedFoldCount: state.rejectedFoldCount,
      averageAcceptanceScore:
        state.executionCount === 0
          ? 0
          : state.totalAcceptanceScore /
            state.executionCount,
      averageStabilityScore:
        state.executionCount === 0
          ? 0
          : state.totalStabilityScore /
            state.executionCount,
      averageExecutionLatencyMs:
        state.executionCount === 0
          ? 0
          : state.totalExecutionLatencyMs /
            state.executionCount,
      maximumExecutionLatencyMs:
        state.maximumExecutionLatencyMs,
    });
  }

  public snapshot(): WalkForwardValidationEngineSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      history: Object.freeze([...this.history]),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  private validateRequestSemantics(
    request: WalkForwardValidationRequest,
  ): void {
    assertNonEmptyString(request.requestId, "request.requestId");
    assertNonEmptyString(request.strategyId, "request.strategyId");
    assertNonEmptyString(
      request.strategyVersion,
      "request.strategyVersion",
    );
    assertNonEmptyString(request.datasetId, "request.datasetId");
    assertFiniteNumber(request.requestedAt, "request.requestedAt");
    assertProbability(
      request.minimumAcceptanceScore,
      "request.minimumAcceptanceScore",
    );

    if (request.folds.length === 0) {
      throw new RangeError(
        "request.folds must contain at least one fold.",
      );
    }
    if (request.folds.length > this.options.maximumFolds) {
      throw new RangeError(
        `request.folds cannot exceed ${this.options.maximumFolds} folds.`,
      );
    }

    const foldIds = new Set<string>();
    const sequences = new Set<number>();
    const sorted = [...request.folds].sort(
      compareFoldDefinitions,
    );

    for (const fold of sorted) {
      assertNonEmptyString(fold.foldId, "fold.foldId");
      assertPositiveInteger(fold.sequence, "fold.sequence");

      if (foldIds.has(fold.foldId)) {
        throw new Error(
          `Duplicate walk-forward fold identifier '${fold.foldId}'.`,
        );
      }
      foldIds.add(fold.foldId);

      if (sequences.has(fold.sequence)) {
        throw new Error(
          `Duplicate walk-forward fold sequence '${fold.sequence}'.`,
        );
      }
      sequences.add(fold.sequence);

      this.validateWindow(
        fold.trainingWindow,
        `${fold.foldId}.trainingWindow`,
        request.datasetId,
      );
      this.validateWindow(
        fold.validationWindow,
        `${fold.foldId}.validationWindow`,
        request.datasetId,
      );
      this.validateWindow(
        fold.testWindow,
        `${fold.foldId}.testWindow`,
        request.datasetId,
      );

      if (
        fold.trainingWindow.endTime >=
        fold.validationWindow.startTime
      ) {
        throw new Error(
          `Fold '${fold.foldId}' training window must end before its validation window starts.`,
        );
      }
      if (
        fold.validationWindow.endTime >=
        fold.testWindow.startTime
      ) {
        throw new Error(
          `Fold '${fold.foldId}' validation window must end before its test window starts.`,
        );
      }
    }

    if (this.options.rejectOverlappingFolds) {
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1]!;
        const current = sorted[index]!;

        if (
          windowsOverlap(previous.testWindow, current.testWindow)
        ) {
          throw new Error(
            `Test windows for folds '${previous.foldId}' and '${current.foldId}' overlap.`,
          );
        }

        if (
          current.trainingWindow.startTime <
          previous.trainingWindow.startTime
        ) {
          throw new Error(
            "Walk-forward training windows must progress chronologically.",
          );
        }
      }
    }
  }

  private validateWindow(
    window: AiValidationWindow,
    path: string,
    requestDatasetId: string,
  ): void {
    assertFiniteNumber(window.startTime, `${path}.startTime`);
    assertFiniteNumber(window.endTime, `${path}.endTime`);

    if (window.startTime >= window.endTime) {
      throw new RangeError(
        `${path}.startTime must precede ${path}.endTime.`,
      );
    }

    if (
      this.options.rejectDatasetMismatch &&
      window.datasetId !== undefined &&
      window.datasetId !== requestDatasetId
    ) {
      throw new Error(
        `${path}.datasetId '${window.datasetId}' does not match request.datasetId '${requestDatasetId}'.`,
      );
    }
  }

  private async evaluateFold(
    request: WalkForwardValidationRequest,
    definition: WalkForwardFoldDefinition,
    previousFolds: readonly WalkForwardFold[],
  ): Promise<FoldEvaluation> {
    const parameters = cloneParameters(
      await this.options.parameterSelector({
        request,
        fold: definition,
        previousFolds: Object.freeze(
          previousFolds.map(cloneFold),
        ),
        deterministicSeed: request.deterministicSeed,
        metadata: cloneMetadata(definition.metadata),
      }),
    );

    this.validateParameters(parameters, definition.foldId);

    const trainingMetrics = await this.evaluatePhase(
      request,
      definition,
      "TRAINING",
      definition.trainingWindow,
      parameters,
    );
    const validationMetrics = await this.evaluatePhase(
      request,
      definition,
      "VALIDATION",
      definition.validationWindow,
      parameters,
    );
    const testMetrics = await this.evaluatePhase(
      request,
      definition,
      "TEST",
      definition.testWindow,
      parameters,
    );

    const trainingObjective = this.objectiveValue(
      request.objective,
      trainingMetrics,
    );
    const validationObjective = this.objectiveValue(
      request.objective,
      validationMetrics,
    );
    const testObjective = this.objectiveValue(
      request.objective,
      testMetrics,
    );

    const rejectionReasons = this.foldRejectionReasons(
      request,
      trainingObjective,
      validationObjective,
      testObjective,
      validationMetrics,
      testMetrics,
    );

    const fold: WalkForwardFold = Object.freeze({
      foldId: definition.foldId,
      sequence: definition.sequence,
      trainingWindow: cloneWindow(definition.trainingWindow),
      validationWindow: cloneWindow(
        definition.validationWindow,
      ),
      testWindow: cloneWindow(definition.testWindow),
      parameters,
      trainingMetrics,
      validationMetrics,
      testMetrics,
      accepted: rejectionReasons.length === 0,
      rejectionReasons: Object.freeze(rejectionReasons),
      metadata: cloneMetadata(definition.metadata),
    });

    return Object.freeze({
      fold,
      objectiveValues: Object.freeze({
        training: trainingObjective,
        validation: validationObjective,
        test: testObjective,
      }),
    });
  }

  private async evaluatePhase(
    request: WalkForwardValidationRequest,
    fold: WalkForwardFoldDefinition,
    phase: WalkForwardEvaluationContext["phase"],
    window: AiValidationWindow,
    parameters: Readonly<Record<string, AiStrategyPrimitive>>,
  ): Promise<Readonly<Record<string, number>>> {
    const metrics = await this.options.metricEvaluator({
      request,
      fold,
      phase,
      window: cloneWindow(window),
      parameters,
      deterministicSeed: request.deterministicSeed,
      metadata: cloneMetadata(fold.metadata),
    });

    this.validateMetricRecord(
      metrics,
      `${fold.foldId}.${phase.toLowerCase()}Metrics`,
    );
    return cloneMetrics(metrics);
  }

  private validateParameters(
    parameters: Readonly<Record<string, AiStrategyPrimitive>>,
    foldId: string,
  ): void {
    for (const [key, value] of Object.entries(parameters)) {
      assertNonEmptyString(key, `${foldId}.parameters key`);
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new TypeError(
          `Fold '${foldId}' parameter '${key}' has an unsupported value.`,
        );
      }
      if (
        typeof value === "number" &&
        !Number.isFinite(value)
      ) {
        throw new TypeError(
          `Fold '${foldId}' parameter '${key}' must be finite.`,
        );
      }
    }
  }

  private validateMetricRecord(
    metrics: Readonly<Record<string, number>>,
    path: string,
  ): void {
    if (
      typeof metrics !== "object" ||
      metrics === null ||
      Array.isArray(metrics)
    ) {
      throw new TypeError(`${path} must be a metric record.`);
    }

    for (const [key, value] of Object.entries(metrics)) {
      assertNonEmptyString(key, `${path} key`);
      assertFiniteNumber(value, `${path}.${key}`);
    }
  }

  private foldRejectionReasons(
    request: WalkForwardValidationRequest,
    trainingObjective: number,
    validationObjective: number,
    testObjective: number,
    validationMetrics: Readonly<Record<string, number>>,
    testMetrics: Readonly<Record<string, number>>,
  ): string[] {
    const reasons: string[] = [];

    if (
      this.options.requirePositiveObjective &&
      testObjective <= 0
    ) {
      reasons.push(
        "Test objective must be greater than zero.",
      );
    }

    const validationDegradation = this.degradation(
      trainingObjective,
      validationObjective,
      request.objective,
    );
    if (
      validationDegradation >
      this.options.maximumValidationToTrainingDegradation
    ) {
      reasons.push(
        `Validation objective degradation ${validationDegradation} exceeds maximum ${this.options.maximumValidationToTrainingDegradation}.`,
      );
    }

    const testDegradation = this.degradation(
      validationObjective,
      testObjective,
      request.objective,
    );
    if (
      testDegradation >
      this.options.maximumTestToValidationDegradation
    ) {
      reasons.push(
        `Test objective degradation ${testDegradation} exceeds maximum ${this.options.maximumTestToValidationDegradation}.`,
      );
    }

    const validationScore = this.normalizedMetricScore(
      request.objective,
      validationObjective,
      validationMetrics,
    );
    const testScore = this.normalizedMetricScore(
      request.objective,
      testObjective,
      testMetrics,
    );
    const foldAcceptanceScore = clamp(
      validationScore * 0.4 + testScore * 0.6,
      0,
      1,
    );

    if (
      foldAcceptanceScore < request.minimumAcceptanceScore
    ) {
      reasons.push(
        `Fold acceptance score ${foldAcceptanceScore} is below minimum ${request.minimumAcceptanceScore}.`,
      );
    }

    return reasons;
  }

  private buildResult(
    request: WalkForwardValidationRequest,
    evaluations: readonly FoldEvaluation[],
    globalRejectionReasons: readonly string[],
    completedAt: AiStrategyTimestamp,
  ): WalkForwardValidationResult {
    const folds = evaluations.map((entry) => entry.fold);
    const acceptedFolds = folds.filter((fold) => fold.accepted);
    const rejectedFolds = folds.filter((fold) => !fold.accepted);
    const acceptedFoldRatio =
      folds.length === 0 ? 0 : acceptedFolds.length / folds.length;

    const testObjectives = evaluations.map(
      (entry) => entry.objectiveValues.test,
    );
    const validationObjectives = evaluations.map(
      (entry) => entry.objectiveValues.validation,
    );

    const stabilityScore = this.stabilityScore(testObjectives);
    const meanValidationScore = mean(
      evaluations.map((entry) =>
        this.normalizedMetricScore(
          request.objective,
          entry.objectiveValues.validation,
          entry.fold.validationMetrics,
        ),
      ),
    );
    const meanTestScore = mean(
      evaluations.map((entry) =>
        this.normalizedMetricScore(
          request.objective,
          entry.objectiveValues.test,
          entry.fold.testMetrics,
        ),
      ),
    );

    const acceptanceScore = clamp(
      acceptedFoldRatio * 0.4 +
        stabilityScore * 0.25 +
        meanValidationScore * 0.15 +
        meanTestScore * 0.2,
      0,
      1,
    );

    const rejectionReasons = [...globalRejectionReasons];

    if (
      acceptedFoldRatio <
      this.options.minimumAcceptedFoldRatio
    ) {
      rejectionReasons.push(
        `Accepted fold ratio ${acceptedFoldRatio} is below required ratio ${this.options.minimumAcceptedFoldRatio}.`,
      );
    }

    if (acceptanceScore < request.minimumAcceptanceScore) {
      rejectionReasons.push(
        `Overall acceptance score ${acceptanceScore} is below minimum ${request.minimumAcceptanceScore}.`,
      );
    }

    if (
      this.coefficientOfVariation(testObjectives) >
      this.options.maximumObjectiveCoefficientOfVariation
    ) {
      rejectionReasons.push(
        "Test objective variation exceeds the configured stability limit.",
      );
    }

    if (folds.length < request.folds.length) {
      rejectionReasons.push(
        `Only ${folds.length} of ${request.folds.length} folds were evaluated.`,
      );
    }

    const accepted =
      folds.length === request.folds.length &&
      rejectionReasons.length === 0 &&
      rejectedFolds.length === 0;

    const status: WalkForwardValidationResult["status"] =
      accepted
        ? "PASSED"
        : folds.length === 0 ||
            acceptedFolds.length === 0
          ? "FAILED"
          : "PARTIAL";

    const aggregateMetrics: Readonly<Record<string, number>> =
      Object.freeze({
        requestedFoldCount: request.folds.length,
        evaluatedFoldCount: folds.length,
        acceptedFoldCount: acceptedFolds.length,
        rejectedFoldCount: rejectedFolds.length,
        acceptedFoldRatio,
        averageTrainingObjective: mean(
          evaluations.map(
            (entry) => entry.objectiveValues.training,
          ),
        ),
        averageValidationObjective: mean(
          validationObjectives,
        ),
        averageTestObjective: mean(testObjectives),
        minimumTestObjective:
          testObjectives.length === 0
            ? 0
            : Math.min(...testObjectives),
        maximumTestObjective:
          testObjectives.length === 0
            ? 0
            : Math.max(...testObjectives),
        testObjectiveStandardDeviation:
          standardDeviation(testObjectives),
        testObjectiveCoefficientOfVariation:
          this.coefficientOfVariation(testObjectives),
        meanValidationScore,
        meanTestScore,
        stabilityScore,
        acceptanceScore,
      });

    return Object.freeze({
      requestId: request.requestId,
      strategyId: request.strategyId,
      strategyVersion: request.strategyVersion,
      status,
      folds: Object.freeze(folds.map(cloneFold)),
      aggregateMetrics,
      stabilityScore,
      acceptanceScore,
      accepted,
      rejectionReasons: Object.freeze(rejectionReasons),
      completedAt,
      metadata: cloneMetadata(request.metadata),
    });
  }

  private objectiveValue(
    objective: OptimizationObjective,
    metrics: Readonly<Record<string, number>>,
  ): number {
    const aliases = this.objectiveMetricAliases(objective);

    for (const alias of aliases) {
      const value = metrics[alias];
      if (value !== undefined) {
        return value;
      }
    }

    throw new Error(
      `Metrics do not contain a value for objective '${objective}'. Expected one of: ${aliases.join(", ")}.`,
    );
  }

  private objectiveMetricAliases(
    objective: OptimizationObjective,
  ): readonly string[] {
    switch (objective) {
      case "TOTAL_RETURN":
        return Object.freeze([
          "totalReturn",
          "total_return",
          "return",
        ]);
      case "RISK_ADJUSTED_RETURN":
        return Object.freeze([
          "riskAdjustedReturn",
          "risk_adjusted_return",
        ]);
      case "SHARPE_RATIO":
        return Object.freeze([
          "sharpeRatio",
          "sharpe_ratio",
          "sharpe",
        ]);
      case "SORTINO_RATIO":
        return Object.freeze([
          "sortinoRatio",
          "sortino_ratio",
          "sortino",
        ]);
      case "PROFIT_FACTOR":
        return Object.freeze([
          "profitFactor",
          "profit_factor",
        ]);
      case "MAX_DRAWDOWN":
        return Object.freeze([
          "maxDrawdown",
          "max_drawdown",
          "maximumDrawdown",
        ]);
      case "WIN_RATE":
        return Object.freeze(["winRate", "win_rate"]);
      case "CALMAR_RATIO":
        return Object.freeze([
          "calmarRatio",
          "calmar_ratio",
          "calmar",
        ]);
      case "CUSTOM":
        return Object.freeze([
          "customObjective",
          "custom_objective",
          "objective",
        ]);
      default:
        return this.assertNever(objective);
    }
  }

  private normalizedMetricScore(
    objective: OptimizationObjective,
    objectiveValue: number,
    metrics: Readonly<Record<string, number>>,
  ): number {
    switch (objective) {
      case "TOTAL_RETURN":
      case "RISK_ADJUSTED_RETURN":
        return clamp(0.5 + objectiveValue / 2, 0, 1);
      case "SHARPE_RATIO":
      case "SORTINO_RATIO":
      case "CALMAR_RATIO":
        return clamp(objectiveValue / 3, 0, 1);
      case "PROFIT_FACTOR":
        return clamp((objectiveValue - 1) / 2, 0, 1);
      case "MAX_DRAWDOWN": {
        const drawdown = Math.abs(objectiveValue);
        return clamp(1 - drawdown, 0, 1);
      }
      case "WIN_RATE":
        return clamp(
          objectiveValue > 1
            ? objectiveValue / 100
            : objectiveValue,
          0,
          1,
        );
      case "CUSTOM": {
        const normalized = metrics.normalizedObjective ??
          metrics.normalized_objective;
        if (normalized !== undefined) {
          return clamp(normalized, 0, 1);
        }
        return clamp(0.5 + objectiveValue / 2, 0, 1);
      }
      default:
        return this.assertNever(objective);
    }
  }

  private degradation(
    reference: number,
    candidate: number,
    objective: OptimizationObjective,
  ): number {
    const referenceUtility = this.objectiveUtility(
      objective,
      reference,
    );
    const candidateUtility = this.objectiveUtility(
      objective,
      candidate,
    );

    if (candidateUtility >= referenceUtility) {
      return 0;
    }

    const denominator = Math.max(
      Math.abs(referenceUtility),
      EPSILON,
    );
    return clamp(
      (referenceUtility - candidateUtility) / denominator,
      0,
      1,
    );
  }

  private objectiveUtility(
    objective: OptimizationObjective,
    value: number,
  ): number {
    return objective === "MAX_DRAWDOWN"
      ? -Math.abs(value)
      : value;
  }

  private stabilityScore(
    values: readonly number[],
  ): number {
    if (values.length <= 1) {
      return values.length === 1 ? 1 : 0;
    }

    const coefficient = this.coefficientOfVariation(values);
    const configuredMaximum =
      this.options.maximumObjectiveCoefficientOfVariation;

    if (configuredMaximum <= EPSILON) {
      return coefficient <= EPSILON ? 1 : 0;
    }

    return clamp(
      1 - coefficient / configuredMaximum,
      0,
      1,
    );
  }

  private coefficientOfVariation(
    values: readonly number[],
  ): number {
    if (values.length <= 1) {
      return 0;
    }

    const average = mean(values);
    const deviation = standardDeviation(values);
    return deviation / Math.max(Math.abs(average), EPSILON);
  }

  private createFailedFold(
    definition: WalkForwardFoldDefinition,
    reason: string,
  ): WalkForwardFold {
    return Object.freeze({
      foldId: definition.foldId,
      sequence: definition.sequence,
      trainingWindow: cloneWindow(definition.trainingWindow),
      validationWindow: cloneWindow(
        definition.validationWindow,
      ),
      testWindow: cloneWindow(definition.testWindow),
      parameters: Object.freeze({}),
      trainingMetrics: Object.freeze({}),
      validationMetrics: Object.freeze({}),
      testMetrics: Object.freeze({}),
      accepted: false,
      rejectionReasons: Object.freeze([reason]),
      metadata: cloneMetadata(definition.metadata),
    });
  }

  private recordResult(
    result: WalkForwardValidationResult,
    startedAt: AiStrategyTimestamp,
  ): WalkForwardValidationResult {
    const frozen = cloneResult(result);
    this.history.push(frozen);

    if (this.history.length > this.options.maximumHistoryEntries) {
      this.history.splice(
        0,
        this.history.length -
          this.options.maximumHistoryEntries,
      );
    }

    const state = this.metricsState;
    const latency = Math.max(
      0,
      frozen.completedAt - startedAt,
    );

    state.totalExecutionLatencyMs += latency;
    state.maximumExecutionLatencyMs = Math.max(
      state.maximumExecutionLatencyMs,
      latency,
    );
    state.totalAcceptanceScore += frozen.acceptanceScore;
    state.totalStabilityScore += frozen.stabilityScore;
    state.evaluatedFoldCount += frozen.folds.length;
    state.acceptedFoldCount += frozen.folds.filter(
      (fold) => fold.accepted,
    ).length;
    state.rejectedFoldCount += frozen.folds.filter(
      (fold) => !fold.accepted,
    ).length;

    if (frozen.accepted) {
      state.acceptedExecutionCount += 1;
    } else {
      state.rejectedExecutionCount += 1;
    }

    switch (frozen.status) {
      case "PASSED":
        state.passedExecutionCount += 1;
        break;
      case "PARTIAL":
        state.partialExecutionCount += 1;
        break;
      case "FAILED":
        state.failedExecutionCount += 1;
        break;
      default:
        this.assertNever(frozen.status);
    }

    return frozen;
  }

  private readonly defaultParameterSelector:
    WalkForwardParameterSelector = (context) => {
      const previous = context.previousFolds
        .filter((fold) => fold.accepted)
        .sort((left, right) => right.sequence - left.sequence)[0];

      return previous?.parameters ?? Object.freeze({});
    };

  private readonly defaultMetricEvaluator:
    WalkForwardMetricEvaluator = (context) => {
      const metadata = context.window.metadata;
      const metrics: Record<string, number> = {};

      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          metrics[key] = value;
        }
      }

      if (Object.keys(metrics).length === 0) {
        throw new Error(
          `No numeric metrics were supplied for fold '${context.fold.foldId}' phase '${context.phase}'. Provide a metricEvaluator or numeric window metadata.`,
        );
      }

      return Object.freeze(metrics);
    };

  private assertNever(value: never): never {
    throw new Error(`Unsupported value '${String(value)}'.`);
  }
}

export function createWalkForwardValidationEngine(
  options: WalkForwardValidationEngineOptions = {},
): WalkForwardValidationEngine {
  return new WalkForwardValidationEngine(options);
}