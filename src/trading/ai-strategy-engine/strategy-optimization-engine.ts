/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 13: Deterministic strategy optimization engine.
 *
 * Responsibilities:
 * - validate adaptive optimization requests
 * - generate deterministic candidate parameter sets
 * - support grid, random, Bayesian-style, evolutionary, RL-style, and custom search
 * - evaluate trials through an injected production evaluator
 * - rank objective values with objective-aware direction
 * - preserve immutable results, bounded history, metrics, and snapshots
 */

import {
  type AdaptiveOptimizationRequest,
  type AdaptiveOptimizationResult,
  type AiStrategyMetadata,
  type AiStrategyPrimitive,
  type AiStrategyTimestamp,
  type OptimizationAlgorithm,
  type OptimizationObjective,
  type OptimizationParameterDefinition,
  type OptimizationTrial,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface StrategyOptimizationEvaluationContext {
  readonly request: AdaptiveOptimizationRequest;
  readonly trialId: string;
  readonly trialNumber: number;
  readonly parameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly deterministicSeed?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface StrategyOptimizationEvaluation {
  readonly objectiveValue: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly accepted?: boolean;
  readonly rejectionReason?: string;
  readonly metadata?: AiStrategyMetadata;
}

export type StrategyOptimizationEvaluator = (
  context: StrategyOptimizationEvaluationContext,
) =>
  | StrategyOptimizationEvaluation
  | Promise<StrategyOptimizationEvaluation>;

export type CustomStrategyCandidateGenerator = (
  request: AdaptiveOptimizationRequest,
  generatedTrials: readonly OptimizationTrial[],
) =>
  | Readonly<Record<string, AiStrategyPrimitive>>
  | undefined
  | Promise<
      Readonly<Record<string, AiStrategyPrimitive>> | undefined
    >;

export interface StrategyOptimizationEngineOptions {
  readonly maximumHistoryEntries?: number;
  readonly maximumTrialsPerRequest?: number;
  readonly maximumGridValuesPerParameter?: number;
  readonly stopOnFirstFailure?: boolean;
  readonly includeCurrentParametersAsFirstTrial?: boolean;
  readonly rejectDuplicateCandidates?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly evaluator?: StrategyOptimizationEvaluator;
  readonly customCandidateGenerator?: CustomStrategyCandidateGenerator;
  readonly validator?: AiStrategyContractValidator;
  readonly metadata?: AiStrategyMetadata;
}

export interface StrategyOptimizationHistoryQuery {
  readonly requestId?: string;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly algorithm?: OptimizationAlgorithm;
  readonly objective?: OptimizationObjective;
  readonly status?: AdaptiveOptimizationResult["status"];
  readonly fromCompletedAt?: AiStrategyTimestamp;
  readonly toCompletedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface StrategyOptimizationEngineMetrics {
  readonly executionCount: number;
  readonly succeededExecutionCount: number;
  readonly partialExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly generatedTrialCount: number;
  readonly succeededTrialCount: number;
  readonly failedTrialCount: number;
  readonly rejectedTrialCount: number;
  readonly duplicateCandidateCount: number;
  readonly averageTrialsPerExecution: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
}

export interface StrategyOptimizationEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly history: readonly AdaptiveOptimizationResult[];
  readonly metrics: StrategyOptimizationEngineMetrics;
  readonly metadata: AiStrategyMetadata;
}

interface MutableMetrics {
  executionCount: number;
  succeededExecutionCount: number;
  partialExecutionCount: number;
  failedExecutionCount: number;
  generatedTrialCount: number;
  succeededTrialCount: number;
  failedTrialCount: number;
  rejectedTrialCount: number;
  duplicateCandidateCount: number;
  totalExecutionLatencyMs: number;
  maximumExecutionLatencyMs: number;
}

interface DeterministicRandom {
  next(): number;
  integer(minimum: number, maximum: number): number;
  pick<T>(values: readonly T[]): T;
}

const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 2_000;
const DEFAULT_MAXIMUM_TRIALS_PER_REQUEST = 10_000;
const DEFAULT_MAXIMUM_GRID_VALUES_PER_PARAMETER = 100;
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

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
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

function cloneTrial(trial: OptimizationTrial): OptimizationTrial {
  return Object.freeze({
    trialId: trial.trialId,
    trialNumber: trial.trialNumber,
    parameters: cloneParameters(trial.parameters),
    objectiveValue: trial.objectiveValue,
    metrics: cloneMetrics(trial.metrics),
    startedAt: trial.startedAt,
    completedAt: trial.completedAt,
    status: trial.status,
    error: trial.error,
    metadata: cloneMetadata(trial.metadata),
  });
}

function cloneResult(
  result: AdaptiveOptimizationResult,
): AdaptiveOptimizationResult {
  return Object.freeze({
    requestId: result.requestId,
    strategyId: result.strategyId,
    strategyVersion: result.strategyVersion,
    status: result.status,
    objective: result.objective,
    bestTrial:
      result.bestTrial === undefined
        ? undefined
        : cloneTrial(result.bestTrial),
    trials: Object.freeze(result.trials.map(cloneTrial)),
    recommendedParameters: cloneParameters(
      result.recommendedParameters,
    ),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    metadata: cloneMetadata(result.metadata),
  });
}

function compareResults(
  left: AdaptiveOptimizationResult,
  right: AdaptiveOptimizationResult,
): number {
  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function canonicalPrimitive(value: AiStrategyPrimitive): string {
  if (value === null) {
    return "null";
  }
  return `${typeof value}:${String(value)}`;
}

function canonicalParameters(
  parameters: Readonly<Record<string, AiStrategyPrimitive>>,
): string {
  return Object.keys(parameters)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}=${canonicalPrimitive(parameters[key]!)}`,
    )
    .join("|");
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createDeterministicRandom(seed: string): DeterministicRandom {
  let state = hashString(seed) || 0x9e3779b9;

  const next = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return Object.freeze({
    next,
    integer(minimum: number, maximum: number): number {
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
        throw new TypeError("Random integer bounds must be integers.");
      }
      if (minimum > maximum) {
        throw new RangeError(
          "Random integer minimum cannot exceed maximum.",
        );
      }
      return minimum + Math.floor(next() * (maximum - minimum + 1));
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new RangeError("Cannot pick from an empty collection.");
      }
      return values[Math.floor(next() * values.length)]!;
    },
  });
}

function roundToPrecision(value: number): number {
  return Number(value.toPrecision(15));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function objectiveHigherIsBetter(
  objective: OptimizationObjective,
): boolean {
  return objective !== "MAX_DRAWDOWN";
}

export class StrategyOptimizationEngine {
  private readonly options: Required<
    Omit<StrategyOptimizationEngineOptions, "metadata">
  > & {
    readonly metadata: AiStrategyMetadata;
  };

  private readonly history: AdaptiveOptimizationResult[] = [];

  private readonly metricsState: MutableMetrics = {
    executionCount: 0,
    succeededExecutionCount: 0,
    partialExecutionCount: 0,
    failedExecutionCount: 0,
    generatedTrialCount: 0,
    succeededTrialCount: 0,
    failedTrialCount: 0,
    rejectedTrialCount: 0,
    duplicateCandidateCount: 0,
    totalExecutionLatencyMs: 0,
    maximumExecutionLatencyMs: 0,
  };

  public constructor(options: StrategyOptimizationEngineOptions = {}) {
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const maximumTrialsPerRequest =
      options.maximumTrialsPerRequest ??
      DEFAULT_MAXIMUM_TRIALS_PER_REQUEST;
    const maximumGridValuesPerParameter =
      options.maximumGridValuesPerParameter ??
      DEFAULT_MAXIMUM_GRID_VALUES_PER_PARAMETER;

    assertPositiveInteger(
      maximumHistoryEntries,
      "options.maximumHistoryEntries",
    );
    assertPositiveInteger(
      maximumTrialsPerRequest,
      "options.maximumTrialsPerRequest",
    );
    assertPositiveInteger(
      maximumGridValuesPerParameter,
      "options.maximumGridValuesPerParameter",
    );

    this.options = Object.freeze({
      maximumHistoryEntries,
      maximumTrialsPerRequest,
      maximumGridValuesPerParameter,
      stopOnFirstFailure: options.stopOnFirstFailure ?? false,
      includeCurrentParametersAsFirstTrial:
        options.includeCurrentParametersAsFirstTrial ?? true,
      rejectDuplicateCandidates:
        options.rejectDuplicateCandidates ?? true,
      clock: options.clock ?? defaultClock,
      evaluator: options.evaluator ?? this.defaultEvaluator,
      customCandidateGenerator:
        options.customCandidateGenerator ??
        this.defaultCustomCandidateGenerator,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      metadata: cloneMetadata(options.metadata),
    });
  }

  public async optimize(
    request: AdaptiveOptimizationRequest,
  ): Promise<AdaptiveOptimizationResult> {
    const startedAt = this.options.clock();
    this.metricsState.executionCount += 1;

    try {
      this.options.validator.assertOptimizationRequest(request);
      this.validateRequestSemantics(request);

      const random = createDeterministicRandom(
        this.seedForRequest(request),
      );
      const trials: OptimizationTrial[] = [];
      const seenCandidates = new Set<string>();
      const candidates = await this.generateCandidates(
        request,
        random,
        trials,
      );

      for (
        let index = 0;
        index < candidates.length &&
        trials.length < request.maximumTrials;
        index += 1
      ) {
        const candidate = cloneParameters(candidates[index]!);
        const canonical = canonicalParameters(candidate);

        if (
          this.options.rejectDuplicateCandidates &&
          seenCandidates.has(canonical)
        ) {
          this.metricsState.duplicateCandidateCount += 1;
          continue;
        }
        seenCandidates.add(canonical);

        const trial = await this.evaluateTrial(
          request,
          trials.length + 1,
          candidate,
        );
        trials.push(trial);

        if (
          this.options.stopOnFirstFailure &&
          trial.status === "FAILED"
        ) {
          break;
        }
      }

      const result = this.buildResult(request, trials, startedAt);
      return this.recordResult(result);
    } catch (error) {
      const completedAt = this.options.clock();
      const failed: AdaptiveOptimizationResult = Object.freeze({
        requestId: request.requestId,
        strategyId: request.strategyId,
        strategyVersion: request.strategyVersion,
        status: "FAILED",
        objective: request.objective,
        trials: Object.freeze([]),
        recommendedParameters: cloneParameters(
          request.currentParameters,
        ),
        startedAt,
        completedAt,
        metadata: cloneMetadata(request.metadata),
      });
      return this.recordResult(failed);
    }
  }

  public queryHistory(
    query: StrategyOptimizationHistoryQuery = {},
  ): readonly AdaptiveOptimizationResult[] {
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
            query.objective !== undefined &&
            result.objective !== query.objective
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
        .sort(compareResults)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public metrics(): StrategyOptimizationEngineMetrics {
    const state = this.metricsState;
    return Object.freeze({
      executionCount: state.executionCount,
      succeededExecutionCount: state.succeededExecutionCount,
      partialExecutionCount: state.partialExecutionCount,
      failedExecutionCount: state.failedExecutionCount,
      generatedTrialCount: state.generatedTrialCount,
      succeededTrialCount: state.succeededTrialCount,
      failedTrialCount: state.failedTrialCount,
      rejectedTrialCount: state.rejectedTrialCount,
      duplicateCandidateCount: state.duplicateCandidateCount,
      averageTrialsPerExecution:
        state.executionCount === 0
          ? 0
          : state.generatedTrialCount / state.executionCount,
      averageExecutionLatencyMs:
        state.executionCount === 0
          ? 0
          : state.totalExecutionLatencyMs /
            state.executionCount,
      maximumExecutionLatencyMs:
        state.maximumExecutionLatencyMs,
    });
  }

  public snapshot(): StrategyOptimizationEngineSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      history: Object.freeze([...this.history]),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  private validateRequestSemantics(
    request: AdaptiveOptimizationRequest,
  ): void {
    assertNonEmptyString(request.requestId, "request.requestId");
    assertNonEmptyString(request.strategyId, "request.strategyId");
    assertNonEmptyString(
      request.strategyVersion,
      "request.strategyVersion",
    );
    assertFiniteNumber(request.requestedAt, "request.requestedAt");
    assertPositiveInteger(
      request.maximumTrials,
      "request.maximumTrials",
    );

    if (
      request.maximumTrials >
      this.options.maximumTrialsPerRequest
    ) {
      throw new RangeError(
        `request.maximumTrials cannot exceed ${this.options.maximumTrialsPerRequest}.`,
      );
    }

    if (request.parameterDefinitions.length === 0) {
      throw new RangeError(
        "request.parameterDefinitions must contain at least one parameter.",
      );
    }

    const ids = new Set<string>();
    for (const definition of request.parameterDefinitions) {
      this.validateParameterDefinition(definition);
      if (ids.has(definition.parameterId)) {
        throw new Error(
          `Duplicate parameter definition '${definition.parameterId}'.`,
        );
      }
      ids.add(definition.parameterId);
    }

    for (const [key, value] of Object.entries(
      request.currentParameters,
    )) {
      if (!ids.has(key)) {
        continue;
      }
      const definition = request.parameterDefinitions.find(
        (entry) => entry.parameterId === key,
      )!;
      this.assertParameterValue(definition, value, `currentParameters.${key}`);
    }

    if (
      request.trainingWindow.startTime >=
      request.trainingWindow.endTime
    ) {
      throw new RangeError(
        "request.trainingWindow.startTime must precede endTime.",
      );
    }
    if (
      request.validationWindow.startTime >=
      request.validationWindow.endTime
    ) {
      throw new RangeError(
        "request.validationWindow.startTime must precede endTime.",
      );
    }
    if (
      request.trainingWindow.endTime >=
      request.validationWindow.startTime
    ) {
      throw new Error(
        "Training window must end before validation window starts.",
      );
    }
  }

  private validateParameterDefinition(
    definition: OptimizationParameterDefinition,
  ): void {
    assertNonEmptyString(
      definition.parameterId,
      "parameterDefinition.parameterId",
    );

    switch (definition.dataType) {
      case "NUMBER":
      case "INTEGER":
        if (
          definition.minimum === undefined ||
          definition.maximum === undefined
        ) {
          throw new Error(
            `Numeric parameter '${definition.parameterId}' requires minimum and maximum.`,
          );
        }
        assertFiniteNumber(
          definition.minimum,
          `${definition.parameterId}.minimum`,
        );
        assertFiniteNumber(
          definition.maximum,
          `${definition.parameterId}.maximum`,
        );
        if (definition.minimum > definition.maximum) {
          throw new RangeError(
            `Parameter '${definition.parameterId}' minimum cannot exceed maximum.`,
          );
        }
        if (definition.step !== undefined) {
          assertFiniteNumber(
            definition.step,
            `${definition.parameterId}.step`,
          );
          if (definition.step <= 0) {
            throw new RangeError(
              `Parameter '${definition.parameterId}' step must be positive.`,
            );
          }
        }
        break;
      case "BOOLEAN":
        break;
      case "CATEGORY":
        if (
          definition.categories === undefined ||
          definition.categories.length === 0
        ) {
          throw new RangeError(
            `Category parameter '${definition.parameterId}' requires categories.`,
          );
        }
        if (
          new Set(definition.categories).size !==
          definition.categories.length
        ) {
          throw new Error(
            `Category parameter '${definition.parameterId}' contains duplicate categories.`,
          );
        }
        break;
      default:
        this.assertNever(definition.dataType);
    }

    this.assertParameterValue(
      definition,
      definition.defaultValue,
      `${definition.parameterId}.defaultValue`,
    );
  }

  private assertParameterValue(
    definition: OptimizationParameterDefinition,
    value: AiStrategyPrimitive,
    path: string,
  ): void {
    switch (definition.dataType) {
      case "NUMBER":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new TypeError(`${path} must be a finite number.`);
        }
        this.assertNumericRange(definition, value, path);
        return;
      case "INTEGER":
        if (!Number.isInteger(value)) {
          throw new TypeError(`${path} must be an integer.`);
        }
        this.assertNumericRange(definition, value as number, path);
        return;
      case "BOOLEAN":
        if (typeof value !== "boolean") {
          throw new TypeError(`${path} must be a boolean.`);
        }
        return;
      case "CATEGORY":
        if (
          typeof value !== "string" ||
          !definition.categories?.includes(value)
        ) {
          throw new RangeError(
            `${path} must be one of the declared categories.`,
          );
        }
        return;
      default:
        this.assertNever(definition.dataType);
    }
  }

  private assertNumericRange(
    definition: OptimizationParameterDefinition,
    value: number,
    path: string,
  ): void {
    if (
      definition.minimum !== undefined &&
      value < definition.minimum
    ) {
      throw new RangeError(
        `${path} cannot be below ${definition.minimum}.`,
      );
    }
    if (
      definition.maximum !== undefined &&
      value > definition.maximum
    ) {
      throw new RangeError(
        `${path} cannot exceed ${definition.maximum}.`,
      );
    }
  }

  private seedForRequest(
    request: AdaptiveOptimizationRequest,
  ): string {
    return [
      request.deterministicSeed ?? "quantumtradeai",
      request.requestId,
      request.strategyId,
      request.strategyVersion,
      request.algorithm,
      request.objective,
      request.maximumTrials,
    ].join(":");
  }

  private async generateCandidates(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
    generatedTrials: readonly OptimizationTrial[],
  ): Promise<
    readonly Readonly<Record<string, AiStrategyPrimitive>>[]
  > {
    const candidates: Readonly<
      Record<string, AiStrategyPrimitive>
    >[] = [];

    if (this.options.includeCurrentParametersAsFirstTrial) {
      candidates.push(
        this.completeParameters(
          request,
          request.currentParameters,
        ),
      );
    }

    switch (request.algorithm) {
      case "GRID_SEARCH":
        candidates.push(...this.gridCandidates(request));
        break;
      case "RANDOM_SEARCH":
        candidates.push(
          ...this.randomCandidates(
            request,
            random,
            request.maximumTrials,
          ),
        );
        break;
      case "BAYESIAN":
        candidates.push(
          ...this.bayesianStyleCandidates(
            request,
            random,
            request.maximumTrials,
          ),
        );
        break;
      case "EVOLUTIONARY":
        candidates.push(
          ...this.evolutionaryCandidates(
            request,
            random,
            request.maximumTrials,
          ),
        );
        break;
      case "REINFORCEMENT_LEARNING":
        candidates.push(
          ...this.reinforcementStyleCandidates(
            request,
            random,
            request.maximumTrials,
          ),
        );
        break;
      case "CUSTOM":
        while (candidates.length < request.maximumTrials) {
          const candidate =
            await this.options.customCandidateGenerator(
              request,
              generatedTrials,
            );
          if (candidate === undefined) {
            break;
          }
          candidates.push(
            this.completeParameters(request, candidate),
          );
        }
        break;
      default:
        this.assertNever(request.algorithm);
    }

    return Object.freeze(
      candidates.slice(0, request.maximumTrials),
    );
  }

  private gridCandidates(
    request: AdaptiveOptimizationRequest,
  ): readonly Readonly<Record<string, AiStrategyPrimitive>>[] {
    const valueSets = request.parameterDefinitions.map(
      (definition) => this.gridValues(definition),
    );
    const candidates: Record<string, AiStrategyPrimitive>[] = [];

    const build = (
      index: number,
      current: Record<string, AiStrategyPrimitive>,
    ): void => {
      if (candidates.length >= request.maximumTrials) {
        return;
      }
      if (index >= request.parameterDefinitions.length) {
        candidates.push({ ...current });
        return;
      }

      const definition = request.parameterDefinitions[index]!;
      for (const value of valueSets[index]!) {
        current[definition.parameterId] = value;
        build(index + 1, current);
        if (candidates.length >= request.maximumTrials) {
          return;
        }
      }
      delete current[definition.parameterId];
    };

    build(0, {});
    return Object.freeze(
      candidates.map((candidate) => Object.freeze(candidate)),
    );
  }

  private gridValues(
    definition: OptimizationParameterDefinition,
  ): readonly AiStrategyPrimitive[] {
    switch (definition.dataType) {
      case "BOOLEAN":
        return Object.freeze([false, true]);
      case "CATEGORY":
        return Object.freeze([
          ...(definition.categories ?? []),
        ]);
      case "NUMBER":
      case "INTEGER": {
        const minimum = definition.minimum!;
        const maximum = definition.maximum!;
        const step =
          definition.step ??
          (definition.dataType === "INTEGER"
            ? 1
            : Math.max((maximum - minimum) / 10, EPSILON));
        const values: number[] = [];

        for (
          let value = minimum;
          value <= maximum + EPSILON &&
          values.length <
            this.options.maximumGridValuesPerParameter;
          value += step
        ) {
          values.push(
            definition.dataType === "INTEGER"
              ? Math.round(value)
              : roundToPrecision(value),
          );
        }

        if (
          values.length === 0 ||
          values[values.length - 1] !== maximum
        ) {
          values.push(
            definition.dataType === "INTEGER"
              ? Math.round(maximum)
              : roundToPrecision(maximum),
          );
        }

        return Object.freeze([...new Set(values)]);
      }
      default:
        return this.assertNever(definition.dataType);
    }
  }

  private randomCandidates(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
    count: number,
  ): readonly Readonly<Record<string, AiStrategyPrimitive>>[] {
    return Object.freeze(
      Array.from({ length: count }, () =>
        this.randomParameterSet(request, random),
      ),
    );
  }

  private bayesianStyleCandidates(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
    count: number,
  ): readonly Readonly<Record<string, AiStrategyPrimitive>>[] {
    const base = this.completeParameters(
      request,
      request.currentParameters,
    );
    const candidates: Readonly<
      Record<string, AiStrategyPrimitive>
    >[] = [base];

    for (let index = 1; index < count; index += 1) {
      const exploration =
        1 - index / Math.max(count - 1, 1);
      const candidate: Record<string, AiStrategyPrimitive> = {};

      for (const definition of request.parameterDefinitions) {
        const center =
          base[definition.parameterId] ??
          definition.defaultValue;
        candidate[definition.parameterId] =
          random.next() < exploration
            ? this.randomValue(definition, random)
            : this.perturbValue(
                definition,
                center,
                random,
                Math.max(0.05, exploration * 0.5),
              );
      }

      candidates.push(Object.freeze(candidate));
    }

    return Object.freeze(candidates);
  }

  private evolutionaryCandidates(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
    count: number,
  ): readonly Readonly<Record<string, AiStrategyPrimitive>>[] {
    const populationSize = Math.max(
      2,
      Math.min(8, count),
    );
    const population = this.randomCandidates(
      request,
      random,
      populationSize,
    );
    const candidates = [...population];

    while (candidates.length < count) {
      const left = random.pick(population);
      const right = random.pick(population);
      const child: Record<string, AiStrategyPrimitive> = {};

      for (const definition of request.parameterDefinitions) {
        const inherited =
          random.next() < 0.5
            ? left[definition.parameterId]
            : right[definition.parameterId];
        const value =
          inherited ?? definition.defaultValue;
        child[definition.parameterId] =
          random.next() < 0.2
            ? this.perturbValue(
                definition,
                value,
                random,
                0.25,
              )
            : value;
      }

      candidates.push(Object.freeze(child));
    }

    return Object.freeze(candidates.slice(0, count));
  }

  private reinforcementStyleCandidates(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
    count: number,
  ): readonly Readonly<Record<string, AiStrategyPrimitive>>[] {
    let policy = this.completeParameters(
      request,
      request.currentParameters,
    );
    const candidates: Readonly<
      Record<string, AiStrategyPrimitive>
    >[] = [policy];

    for (let index = 1; index < count; index += 1) {
      const temperature = Math.max(
        0.05,
        1 - index / Math.max(count, 1),
      );
      const next: Record<string, AiStrategyPrimitive> = {};

      for (const definition of request.parameterDefinitions) {
        const current =
          policy[definition.parameterId] ??
          definition.defaultValue;
        next[definition.parameterId] =
          random.next() < temperature
            ? this.perturbValue(
                definition,
                current,
                random,
                temperature,
              )
            : current;
      }

      policy = Object.freeze(next);
      candidates.push(policy);
    }

    return Object.freeze(candidates.slice(0, count));
  }

  private randomParameterSet(
    request: AdaptiveOptimizationRequest,
    random: DeterministicRandom,
  ): Readonly<Record<string, AiStrategyPrimitive>> {
    const candidate: Record<string, AiStrategyPrimitive> = {};
    for (const definition of request.parameterDefinitions) {
      candidate[definition.parameterId] =
        this.randomValue(definition, random);
    }
    return Object.freeze(candidate);
  }

  private randomValue(
    definition: OptimizationParameterDefinition,
    random: DeterministicRandom,
  ): AiStrategyPrimitive {
    switch (definition.dataType) {
      case "BOOLEAN":
        return random.next() >= 0.5;
      case "CATEGORY":
        return random.pick(definition.categories ?? []);
      case "INTEGER": {
        const minimum = Math.ceil(definition.minimum!);
        const maximum = Math.floor(definition.maximum!);
        const step = Math.max(1, Math.round(definition.step ?? 1));
        const count = Math.floor(
          (maximum - minimum) / step,
        );
        return minimum + random.integer(0, count) * step;
      }
      case "NUMBER": {
        const minimum = definition.minimum!;
        const maximum = definition.maximum!;
        const raw = minimum + random.next() * (maximum - minimum);
        if (definition.step === undefined) {
          return roundToPrecision(raw);
        }
        const steps = Math.round(
          (raw - minimum) / definition.step,
        );
        return roundToPrecision(
          clamp(
            minimum + steps * definition.step,
            minimum,
            maximum,
          ),
        );
      }
      default:
        return this.assertNever(definition.dataType);
    }
  }

  private perturbValue(
    definition: OptimizationParameterDefinition,
    current: AiStrategyPrimitive,
    random: DeterministicRandom,
    scale: number,
  ): AiStrategyPrimitive {
    switch (definition.dataType) {
      case "BOOLEAN":
        return random.next() < scale
          ? !Boolean(current)
          : Boolean(current);
      case "CATEGORY":
        return random.next() < scale
          ? random.pick(definition.categories ?? [])
          : current;
      case "INTEGER":
      case "NUMBER": {
        const minimum = definition.minimum!;
        const maximum = definition.maximum!;
        const range = maximum - minimum;
        const numeric =
          typeof current === "number"
            ? current
            : Number(definition.defaultValue);
        const delta = (random.next() * 2 - 1) * range * scale;
        let value = clamp(numeric + delta, minimum, maximum);

        if (definition.step !== undefined) {
          const steps = Math.round(
            (value - minimum) / definition.step,
          );
          value = minimum + steps * definition.step;
        }
        if (definition.dataType === "INTEGER") {
          value = Math.round(value);
        }

        return roundToPrecision(
          clamp(value, minimum, maximum),
        );
      }
      default:
        return this.assertNever(definition.dataType);
    }
  }

  private completeParameters(
    request: AdaptiveOptimizationRequest,
    supplied: Readonly<Record<string, AiStrategyPrimitive>>,
  ): Readonly<Record<string, AiStrategyPrimitive>> {
    const complete: Record<string, AiStrategyPrimitive> = {};

    for (const definition of request.parameterDefinitions) {
      const value =
        supplied[definition.parameterId] ??
        request.currentParameters[definition.parameterId] ??
        definition.defaultValue;
      this.assertParameterValue(
        definition,
        value,
        `parameters.${definition.parameterId}`,
      );
      complete[definition.parameterId] = value;
    }

    return Object.freeze(complete);
  }

  private async evaluateTrial(
    request: AdaptiveOptimizationRequest,
    trialNumber: number,
    parameters: Readonly<Record<string, AiStrategyPrimitive>>,
  ): Promise<OptimizationTrial> {
    const startedAt = this.options.clock();
    const trialId = `${request.requestId}:trial:${String(
      trialNumber,
    ).padStart(6, "0")}`;

    try {
      const evaluation = await this.options.evaluator({
        request,
        trialId,
        trialNumber,
        parameters,
        deterministicSeed: request.deterministicSeed,
        metadata: cloneMetadata(request.metadata),
      });

      assertFiniteNumber(
        evaluation.objectiveValue,
        "evaluation.objectiveValue",
      );
      this.validateMetrics(evaluation.metrics);

      const accepted = evaluation.accepted ?? true;
      const completedAt = this.options.clock();

      if (!accepted) {
        this.metricsState.rejectedTrialCount += 1;
        return Object.freeze({
          trialId,
          trialNumber,
          parameters,
          objectiveValue: evaluation.objectiveValue,
          metrics: cloneMetrics(evaluation.metrics),
          startedAt,
          completedAt,
          status: "REJECTED",
          error:
            evaluation.rejectionReason ??
            "Trial rejected by evaluator.",
          metadata: cloneMetadata(evaluation.metadata),
        });
      }

      this.metricsState.succeededTrialCount += 1;
      return Object.freeze({
        trialId,
        trialNumber,
        parameters,
        objectiveValue: evaluation.objectiveValue,
        metrics: cloneMetrics(evaluation.metrics),
        startedAt,
        completedAt,
        status: "SUCCEEDED",
        metadata: cloneMetadata(evaluation.metadata),
      });
    } catch (error) {
      this.metricsState.failedTrialCount += 1;
      return Object.freeze({
        trialId,
        trialNumber,
        parameters,
        objectiveValue: 0,
        metrics: Object.freeze({}),
        startedAt,
        completedAt: this.options.clock(),
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        metadata: cloneMetadata(request.metadata),
      });
    }
  }

  private validateMetrics(
    metrics: Readonly<Record<string, number>>,
  ): void {
    if (
      typeof metrics !== "object" ||
      metrics === null ||
      Array.isArray(metrics)
    ) {
      throw new TypeError(
        "evaluation.metrics must be a metric record.",
      );
    }
    for (const [key, value] of Object.entries(metrics)) {
      assertNonEmptyString(key, "evaluation.metrics key");
      assertFiniteNumber(value, `evaluation.metrics.${key}`);
    }
  }

  private buildResult(
    request: AdaptiveOptimizationRequest,
    trials: readonly OptimizationTrial[],
    startedAt: AiStrategyTimestamp,
  ): AdaptiveOptimizationResult {
    const successful = trials.filter(
      (trial) => trial.status === "SUCCEEDED",
    );
    const bestTrial = this.bestTrial(
      successful,
      request.objective,
    );
    const completedAt = this.options.clock();

    let status: AdaptiveOptimizationResult["status"];
    if (
      successful.length === 0 ||
      bestTrial === undefined
    ) {
      status = "FAILED";
    } else if (
      successful.length === trials.length &&
      trials.length > 0
    ) {
      status = "SUCCEEDED";
    } else {
      status = "PARTIAL";
    }

    return Object.freeze({
      requestId: request.requestId,
      strategyId: request.strategyId,
      strategyVersion: request.strategyVersion,
      status,
      objective: request.objective,
      bestTrial:
        bestTrial === undefined
          ? undefined
          : cloneTrial(bestTrial),
      trials: Object.freeze(trials.map(cloneTrial)),
      recommendedParameters:
        bestTrial?.parameters ??
        cloneParameters(request.currentParameters),
      startedAt,
      completedAt,
      metadata: cloneMetadata(request.metadata),
    });
  }

  private bestTrial(
    trials: readonly OptimizationTrial[],
    objective: OptimizationObjective,
  ): OptimizationTrial | undefined {
    if (trials.length === 0) {
      return undefined;
    }

    const higherIsBetter = objectiveHigherIsBetter(objective);
    return [...trials].sort((left, right) => {
      const comparison = higherIsBetter
        ? right.objectiveValue - left.objectiveValue
        : left.objectiveValue - right.objectiveValue;
      if (Math.abs(comparison) > EPSILON) {
        return comparison;
      }
      return left.trialNumber - right.trialNumber;
    })[0];
  }

  private recordResult(
    result: AdaptiveOptimizationResult,
  ): AdaptiveOptimizationResult {
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
      frozen.completedAt - frozen.startedAt,
    );
    state.totalExecutionLatencyMs += latency;
    state.maximumExecutionLatencyMs = Math.max(
      state.maximumExecutionLatencyMs,
      latency,
    );
    state.generatedTrialCount += frozen.trials.length;

    switch (frozen.status) {
      case "SUCCEEDED":
        state.succeededExecutionCount += 1;
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

  private readonly defaultEvaluator:
    StrategyOptimizationEvaluator = (context) => {
      const metrics: Record<string, number> = {};
      for (const [key, value] of Object.entries(
        context.request.validationWindow.metadata,
      )) {
        if (typeof value === "number" && Number.isFinite(value)) {
          metrics[key] = value;
        }
      }

      const objectiveAliases = this.objectiveMetricAliases(
        context.request.objective,
      );
      const objectiveValue = objectiveAliases
        .map((key) => metrics[key])
        .find((value): value is number => value !== undefined);

      if (objectiveValue === undefined) {
        throw new Error(
          `No evaluator was supplied and validation window metadata does not contain objective '${context.request.objective}'.`,
        );
      }

      return Object.freeze({
        objectiveValue,
        metrics: Object.freeze(metrics),
        accepted: true,
        metadata: cloneMetadata(context.request.metadata),
      });
    };

  private readonly defaultCustomCandidateGenerator:
    CustomStrategyCandidateGenerator = () => undefined;

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

  private assertNever(value: never): never {
    throw new Error(`Unsupported value '${String(value)}'.`);
  }
}

export function createStrategyOptimizationEngine(
  options: StrategyOptimizationEngineOptions = {},
): StrategyOptimizationEngine {
  return new StrategyOptimizationEngine(options);
}