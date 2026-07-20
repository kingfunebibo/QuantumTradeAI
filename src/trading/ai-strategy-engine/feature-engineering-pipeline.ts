/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 11: Deterministic feature-engineering pipeline.
 *
 * Responsibilities:
 * - register immutable feature-engineering specifications
 * - transform raw feature observations into model-ready feature vectors
 * - support deterministic scaling, clipping, arithmetic, lag, return,
 *   rolling-statistic, boolean, categorical, and custom transforms
 * - validate transform dependencies and execution order
 * - preserve bounded immutable execution history
 * - optionally persist engineered vectors in the AI feature store
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureDefinition,
  type AiFeatureObservation,
  type AiFeatureQuality,
  type AiFeatureValue,
  type AiFeatureVector,
  type AiStrategyInstrument,
  type AiStrategyMetadata,
  type AiStrategyTimeframe,
  type AiStrategyTimestamp,
} from "./ai-strategy-contracts";
import type { AiFeatureStore } from "./ai-feature-store";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export type FeatureEngineeringTransformType =
  | "IDENTITY"
  | "CONSTANT"
  | "CLIP"
  | "MIN_MAX_SCALE"
  | "STANDARDIZE"
  | "ROBUST_SCALE"
  | "LOG"
  | "LOG1P"
  | "EXP"
  | "ABS"
  | "SIGN"
  | "POWER"
  | "ADD"
  | "SUBTRACT"
  | "MULTIPLY"
  | "DIVIDE"
  | "RATIO"
  | "DIFFERENCE"
  | "PERCENT_CHANGE"
  | "LAG"
  | "ROLLING_MEAN"
  | "ROLLING_SUM"
  | "ROLLING_MIN"
  | "ROLLING_MAX"
  | "ROLLING_STDDEV"
  | "BOOLEAN_NOT"
  | "BOOLEAN_AND"
  | "BOOLEAN_OR"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "EQUAL"
  | "CATEGORY_MAP"
  | "ONE_HOT"
  | "CUSTOM_LINEAR";

export interface FeatureEngineeringTransform {
  readonly transformId: string;
  readonly outputFeatureId: string;
  readonly type: FeatureEngineeringTransformType;
  readonly inputFeatureIds: readonly string[];
  readonly parameters: Readonly<Record<string, AiFeatureValue>>;
  readonly source?: string;
  readonly outputQuality?: AiFeatureQuality;
  readonly required: boolean;
  readonly enabled: boolean;
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringSpecification {
  readonly specificationId: string;
  readonly version: string;
  readonly inputSchemaVersion?: string;
  readonly outputSchemaVersion: string;
  readonly createdAt: AiStrategyTimestamp;
  readonly transforms: readonly FeatureEngineeringTransform[];
  readonly outputDefinitions: readonly AiFeatureDefinition[];
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringInput {
  readonly requestId: string;
  readonly specificationId: string;
  readonly specificationVersion?: string;
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly observedAt: AiStrategyTimestamp;
  readonly observations: readonly AiFeatureObservation[];
  readonly historicalVectors?: readonly AiFeatureVector[];
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringIssue {
  readonly transformId?: string;
  readonly featureId?: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringResult {
  readonly requestId: string;
  readonly specificationId: string;
  readonly specificationVersion: string;
  readonly status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  readonly vector?: AiFeatureVector;
  readonly issues: readonly FeatureEngineeringIssue[];
  readonly startedAt: AiStrategyTimestamp;
  readonly completedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringHistoryQuery {
  readonly requestId?: string;
  readonly specificationId?: string;
  readonly specificationVersion?: string;
  readonly status?: FeatureEngineeringResult["status"];
  readonly exchangeId?: string;
  readonly normalizedSymbol?: string;
  readonly timeframe?: AiStrategyTimeframe;
  readonly fromCompletedAt?: AiStrategyTimestamp;
  readonly toCompletedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface FeatureEngineeringPipelineMetrics {
  readonly registeredSpecificationCount: number;
  readonly executionCount: number;
  readonly successfulExecutionCount: number;
  readonly partialExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly generatedVectorCount: number;
  readonly persistedVectorCount: number;
  readonly transformExecutionCount: number;
  readonly transformFailureCount: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
}

export interface FeatureEngineeringPipelineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly specifications: readonly FeatureEngineeringSpecification[];
  readonly history: readonly FeatureEngineeringResult[];
  readonly metrics: FeatureEngineeringPipelineMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface FeatureEngineeringPipelineOptions {
  readonly maximumSpecifications?: number;
  readonly maximumHistoryEntries?: number;
  readonly maximumTransformsPerSpecification?: number;
  readonly persistGeneratedVectors?: boolean;
  readonly failOnRequiredTransformError?: boolean;
  readonly rejectDuplicateOutputFeatures?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
  readonly featureStore?: AiFeatureStore;
  readonly metadata?: AiStrategyMetadata;
}

interface MutableMetrics {
  executionCount: number;
  successfulExecutionCount: number;
  partialExecutionCount: number;
  failedExecutionCount: number;
  generatedVectorCount: number;
  persistedVectorCount: number;
  transformExecutionCount: number;
  transformFailureCount: number;
  totalExecutionLatencyMs: number;
  maximumExecutionLatencyMs: number;
}

interface TransformContext {
  readonly input: FeatureEngineeringInput;
  readonly transform: FeatureEngineeringTransform;
  readonly currentValues: ReadonlyMap<string, AiFeatureValue>;
  readonly currentObservations: ReadonlyMap<string, AiFeatureObservation>;
  readonly history: readonly AiFeatureVector[];
}

const DEFAULT_MAXIMUM_SPECIFICATIONS = 500;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;
const DEFAULT_MAXIMUM_TRANSFORMS = 1_000;
const EPSILON = 1e-12;

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

function cloneInstrument(
  instrument: AiStrategyInstrument,
): AiStrategyInstrument {
  return Object.freeze({
    ...instrument,
    metadata: cloneMetadata(instrument.metadata),
  });
}

function cloneObservation(
  observation: AiFeatureObservation,
): AiFeatureObservation {
  return Object.freeze({
    ...observation,
    metadata: cloneMetadata(observation.metadata),
  });
}

function cloneDefinition(
  definition: AiFeatureDefinition,
): AiFeatureDefinition {
  return Object.freeze({
    ...definition,
    metadata: cloneMetadata(definition.metadata),
  });
}

function cloneTransform(
  transform: FeatureEngineeringTransform,
): FeatureEngineeringTransform {
  return Object.freeze({
    ...transform,
    inputFeatureIds: Object.freeze([...transform.inputFeatureIds]),
    parameters: Object.freeze({ ...transform.parameters }),
    metadata: cloneMetadata(transform.metadata),
  });
}

function cloneSpecification(
  specification: FeatureEngineeringSpecification,
): FeatureEngineeringSpecification {
  return Object.freeze({
    ...specification,
    transforms: Object.freeze(
      specification.transforms.map(cloneTransform),
    ),
    outputDefinitions: Object.freeze(
      specification.outputDefinitions.map(cloneDefinition),
    ),
    metadata: cloneMetadata(specification.metadata),
  });
}

function cloneIssue(
  issue: FeatureEngineeringIssue,
): FeatureEngineeringIssue {
  return Object.freeze({
    ...issue,
    metadata: cloneMetadata(issue.metadata),
  });
}

function cloneVector(vector: AiFeatureVector): AiFeatureVector {
  return Object.freeze({
    ...vector,
    instrument: cloneInstrument(vector.instrument),
    observations: Object.freeze(
      vector.observations.map(cloneObservation),
    ),
    values: Object.freeze({ ...vector.values }),
    metadata: cloneMetadata(vector.metadata),
  });
}

function cloneResult(
  result: FeatureEngineeringResult,
): FeatureEngineeringResult {
  return Object.freeze({
    ...result,
    vector:
      result.vector === undefined
        ? undefined
        : cloneVector(result.vector),
    issues: Object.freeze(result.issues.map(cloneIssue)),
    metadata: cloneMetadata(result.metadata),
  });
}

function compareSpecifications(
  left: FeatureEngineeringSpecification,
  right: FeatureEngineeringSpecification,
): number {
  if (left.specificationId !== right.specificationId) {
    return left.specificationId.localeCompare(right.specificationId);
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.version.localeCompare(right.version);
}

function compareResults(
  left: FeatureEngineeringResult,
  right: FeatureEngineeringResult,
): number {
  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function specificationKey(
  specificationId: string,
  version: string,
): string {
  return `${specificationId}::${version}`;
}

function asNumber(
  value: AiFeatureValue,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
  return value;
}

function asBoolean(
  value: AiFeatureValue,
  path: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean.`);
  }
  return value;
}

function stableValueString(value: AiFeatureValue): string {
  if (value === null) {
    return "null";
  }
  return `${typeof value}:${String(value)}`;
}

export class FeatureEngineeringPipeline {
  private readonly options: Required<
    Omit<
      FeatureEngineeringPipelineOptions,
      "featureStore" | "metadata"
    >
  > & {
    readonly featureStore?: AiFeatureStore;
    readonly metadata: AiStrategyMetadata;
  };

  private readonly specifications = new Map<
    string,
    FeatureEngineeringSpecification
  >();

  private readonly history: FeatureEngineeringResult[] = [];

  private readonly metricsState: MutableMetrics = {
    executionCount: 0,
    successfulExecutionCount: 0,
    partialExecutionCount: 0,
    failedExecutionCount: 0,
    generatedVectorCount: 0,
    persistedVectorCount: 0,
    transformExecutionCount: 0,
    transformFailureCount: 0,
    totalExecutionLatencyMs: 0,
    maximumExecutionLatencyMs: 0,
  };

  private sequence = 0;

  public constructor(options: FeatureEngineeringPipelineOptions = {}) {
    const maximumSpecifications =
      options.maximumSpecifications ??
      DEFAULT_MAXIMUM_SPECIFICATIONS;
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const maximumTransformsPerSpecification =
      options.maximumTransformsPerSpecification ??
      DEFAULT_MAXIMUM_TRANSFORMS;

    assertPositiveInteger(
      maximumSpecifications,
      "options.maximumSpecifications",
    );
    assertPositiveInteger(
      maximumHistoryEntries,
      "options.maximumHistoryEntries",
    );
    assertPositiveInteger(
      maximumTransformsPerSpecification,
      "options.maximumTransformsPerSpecification",
    );

    this.options = Object.freeze({
      maximumSpecifications,
      maximumHistoryEntries,
      maximumTransformsPerSpecification,
      persistGeneratedVectors:
        options.persistGeneratedVectors ?? true,
      failOnRequiredTransformError:
        options.failOnRequiredTransformError ?? true,
      rejectDuplicateOutputFeatures:
        options.rejectDuplicateOutputFeatures ?? true,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      featureStore: options.featureStore,
      metadata: cloneMetadata(options.metadata),
    });
  }

  public registerSpecification(
    specification: FeatureEngineeringSpecification,
    replace = false,
  ): FeatureEngineeringSpecification {
    this.validateSpecification(specification);
    const immutable = cloneSpecification(specification);
    const key = specificationKey(
      immutable.specificationId,
      immutable.version,
    );

    if (this.specifications.has(key) && !replace) {
      throw new Error(
        `Feature-engineering specification '${key}' is already registered.`,
      );
    }

    if (
      !this.specifications.has(key) &&
      this.specifications.size >=
        this.options.maximumSpecifications
    ) {
      throw new Error(
        `Feature-engineering specification capacity of ${this.options.maximumSpecifications} has been reached.`,
      );
    }

    this.specifications.set(key, immutable);
    return immutable;
  }

  public unregisterSpecification(
    specificationId: string,
    version: string,
  ): boolean {
    assertNonEmptyString(specificationId, "specificationId");
    assertNonEmptyString(version, "version");
    return this.specifications.delete(
      specificationKey(specificationId, version),
    );
  }

  public getSpecification(
    specificationId: string,
    version?: string,
  ): FeatureEngineeringSpecification | undefined {
    assertNonEmptyString(specificationId, "specificationId");

    if (version !== undefined) {
      return this.specifications.get(
        specificationKey(specificationId, version),
      );
    }

    return [...this.specifications.values()]
      .filter(
        (candidate) =>
          candidate.specificationId === specificationId,
      )
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt;
        }
        return right.version.localeCompare(left.version);
      })[0];
  }

  public listSpecifications():
    readonly FeatureEngineeringSpecification[] {
    return Object.freeze(
      [...this.specifications.values()].sort(
        compareSpecifications,
      ),
    );
  }

  public execute(
    input: FeatureEngineeringInput,
  ): FeatureEngineeringResult {
    const startedAt = this.options.clock();
    this.metricsState.executionCount += 1;

    try {
      this.validateInput(input);
      const specification = this.resolveSpecification(input);
      const values = new Map<string, AiFeatureValue>();
      const observations = new Map<
        string,
        AiFeatureObservation
      >();

      for (const observation of input.observations) {
        values.set(observation.featureId, observation.value);
        observations.set(
          observation.featureId,
          cloneObservation(observation),
        );
      }

      const issues: FeatureEngineeringIssue[] = [];

      for (const transform of specification.transforms) {
        if (!transform.enabled) {
          issues.push(
            this.issue(
              "TRANSFORM_DISABLED",
              `Transform '${transform.transformId}' is disabled.`,
              "INFO",
              transform.transformId,
              transform.outputFeatureId,
            ),
          );
          continue;
        }

        this.metricsState.transformExecutionCount += 1;

        try {
          const value = this.executeTransform({
            input,
            transform,
            currentValues: values,
            currentObservations: observations,
            history: this.normalizedHistory(
              input.historicalVectors ?? [],
              input,
            ),
          });

          values.set(transform.outputFeatureId, value);
          observations.set(
            transform.outputFeatureId,
            Object.freeze({
              featureId: transform.outputFeatureId,
              value,
              observedAt: input.observedAt,
              source:
                transform.source ??
                `feature-engineering:${specification.specificationId}:${transform.transformId}`,
              quality: transform.outputQuality ?? "VALID",
              metadata: cloneMetadata(transform.metadata),
            }),
          );
        } catch (error) {
          this.metricsState.transformFailureCount += 1;
          const message =
            error instanceof Error ? error.message : String(error);

          issues.push(
            this.issue(
              "TRANSFORM_EXECUTION_FAILED",
              message,
              transform.required ? "ERROR" : "WARNING",
              transform.transformId,
              transform.outputFeatureId,
            ),
          );

          if (
            transform.required &&
            this.options.failOnRequiredTransformError
          ) {
            break;
          }
        }
      }

      const vector = this.createOutputVector(
        input,
        specification,
        values,
        observations,
        issues,
      );
      const hasErrors = issues.some(
        (issue) => issue.severity === "ERROR",
      );
      const status: FeatureEngineeringResult["status"] =
        vector === undefined
          ? "FAILED"
          : hasErrors
            ? "PARTIAL"
            : "SUCCEEDED";

      if (vector !== undefined) {
        this.metricsState.generatedVectorCount += 1;

        if (
          this.options.persistGeneratedVectors &&
          this.options.featureStore !== undefined
        ) {
          this.options.featureStore.putVector(vector);
          this.metricsState.persistedVectorCount += 1;
        }
      }

      return this.completeResult({
        requestId: input.requestId,
        specificationId: specification.specificationId,
        specificationVersion: specification.version,
        status,
        vector,
        issues: Object.freeze(issues),
        startedAt,
        completedAt: this.options.clock(),
        metadata: cloneMetadata(input.metadata),
      });
    } catch (error) {
      const completedAt = this.options.clock();
      const result: FeatureEngineeringResult = {
        requestId: input.requestId,
        specificationId: input.specificationId,
        specificationVersion:
          input.specificationVersion ?? "UNRESOLVED",
        status: "FAILED",
        issues: Object.freeze([
          this.issue(
            "PIPELINE_EXECUTION_FAILED",
            error instanceof Error ? error.message : String(error),
            "ERROR",
          ),
        ]),
        startedAt,
        completedAt,
        metadata: cloneMetadata(input.metadata),
      };

      return this.completeResult(result);
    }
  }

  public queryHistory(
    query: FeatureEngineeringHistoryQuery = {},
  ): readonly FeatureEngineeringResult[] {
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
          const vector = result.vector;

          if (
            query.requestId !== undefined &&
            result.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.specificationId !== undefined &&
            result.specificationId !== query.specificationId
          ) {
            return false;
          }
          if (
            query.specificationVersion !== undefined &&
            result.specificationVersion !==
              query.specificationVersion
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
            query.exchangeId !== undefined &&
            vector?.instrument.exchangeId !== query.exchangeId
          ) {
            return false;
          }
          if (
            query.normalizedSymbol !== undefined &&
            vector?.instrument.normalizedSymbol !==
              query.normalizedSymbol
          ) {
            return false;
          }
          if (
            query.timeframe !== undefined &&
            vector?.timeframe !== query.timeframe
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

  public metrics(): FeatureEngineeringPipelineMetrics {
    const state = this.metricsState;
    return Object.freeze({
      registeredSpecificationCount:
        this.specifications.size,
      executionCount: state.executionCount,
      successfulExecutionCount:
        state.successfulExecutionCount,
      partialExecutionCount: state.partialExecutionCount,
      failedExecutionCount: state.failedExecutionCount,
      generatedVectorCount: state.generatedVectorCount,
      persistedVectorCount: state.persistedVectorCount,
      transformExecutionCount:
        state.transformExecutionCount,
      transformFailureCount: state.transformFailureCount,
      averageExecutionLatencyMs:
        state.executionCount === 0
          ? 0
          : state.totalExecutionLatencyMs /
            state.executionCount,
      maximumExecutionLatencyMs:
        state.maximumExecutionLatencyMs,
    });
  }

  public snapshot(): FeatureEngineeringPipelineSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      specifications: this.listSpecifications(),
      history: Object.freeze([...this.history]),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  private validateSpecification(
    specification: FeatureEngineeringSpecification,
  ): void {
    assertNonEmptyString(
      specification.specificationId,
      "specification.specificationId",
    );
    assertNonEmptyString(
      specification.version,
      "specification.version",
    );
    assertNonEmptyString(
      specification.outputSchemaVersion,
      "specification.outputSchemaVersion",
    );
    assertFiniteNumber(
      specification.createdAt,
      "specification.createdAt",
    );

    if (
      specification.transforms.length >
      this.options.maximumTransformsPerSpecification
    ) {
      throw new RangeError(
        `Specification transform count cannot exceed ${this.options.maximumTransformsPerSpecification}.`,
      );
    }

    const transformIds = new Set<string>();
    const outputFeatureIds = new Set<string>();

    for (const transform of specification.transforms) {
      assertNonEmptyString(
        transform.transformId,
        "transform.transformId",
      );
      assertNonEmptyString(
        transform.outputFeatureId,
        "transform.outputFeatureId",
      );

      if (transformIds.has(transform.transformId)) {
        throw new Error(
          `Duplicate transform identifier '${transform.transformId}'.`,
        );
      }
      transformIds.add(transform.transformId);

      if (
        this.options.rejectDuplicateOutputFeatures &&
        outputFeatureIds.has(transform.outputFeatureId)
      ) {
        throw new Error(
          `Duplicate output feature '${transform.outputFeatureId}'.`,
        );
      }
      outputFeatureIds.add(transform.outputFeatureId);

      for (const inputFeatureId of transform.inputFeatureIds) {
        assertNonEmptyString(
          inputFeatureId,
          "transform.inputFeatureIds entry",
        );
      }

      this.validateTransformParameters(transform);
    }

    const definitionIds = new Set<string>();
    for (const definition of specification.outputDefinitions) {
      this.options.validator.assertValid(
        this.options.validator.validateFeatureDefinition(
          definition,
        ),
        `Output feature definition '${definition.featureId}' is invalid.`,
      );

      if (definitionIds.has(definition.featureId)) {
        throw new Error(
          `Duplicate output definition '${definition.featureId}'.`,
        );
      }
      definitionIds.add(definition.featureId);
    }

    for (const outputFeatureId of outputFeatureIds) {
      if (!definitionIds.has(outputFeatureId)) {
        throw new Error(
          `No output definition exists for engineered feature '${outputFeatureId}'.`,
        );
      }
    }
  }

  private validateTransformParameters(
    transform: FeatureEngineeringTransform,
  ): void {
    switch (transform.type) {
      case "IDENTITY":
      case "ABS":
      case "SIGN":
      case "LOG":
      case "LOG1P":
      case "EXP":
      case "BOOLEAN_NOT":
      case "LAG":
      case "ROLLING_MEAN":
      case "ROLLING_SUM":
      case "ROLLING_MIN":
      case "ROLLING_MAX":
      case "ROLLING_STDDEV":
        this.requireInputCount(transform, 1);
        break;
      case "ADD":
      case "SUBTRACT":
      case "MULTIPLY":
      case "DIVIDE":
      case "RATIO":
      case "DIFFERENCE":
      case "PERCENT_CHANGE":
      case "BOOLEAN_AND":
      case "BOOLEAN_OR":
      case "GREATER_THAN":
      case "GREATER_THAN_OR_EQUAL":
      case "LESS_THAN":
      case "LESS_THAN_OR_EQUAL":
      case "EQUAL":
        this.requireInputCount(transform, 2);
        break;
      case "CONSTANT":
        if (
          !Object.prototype.hasOwnProperty.call(
            transform.parameters,
            "value",
          )
        ) {
          throw new Error(
            `Transform '${transform.transformId}' requires parameter 'value'.`,
          );
        }
        break;
      case "CLIP":
      case "MIN_MAX_SCALE":
      case "STANDARDIZE":
      case "ROBUST_SCALE":
      case "POWER":
      case "CATEGORY_MAP":
      case "ONE_HOT":
      case "CUSTOM_LINEAR":
        this.requireInputCount(transform, 1);
        break;
      default:
        this.assertNever(transform.type);
    }

    const window = transform.parameters.window;
    if (
      window !== undefined &&
      (typeof window !== "number" ||
        !Number.isInteger(window) ||
        window <= 0)
    ) {
      throw new RangeError(
        `Transform '${transform.transformId}' parameter 'window' must be a positive integer.`,
      );
    }
  }

  private validateInput(input: FeatureEngineeringInput): void {
    assertNonEmptyString(input.requestId, "input.requestId");
    assertNonEmptyString(
      input.specificationId,
      "input.specificationId",
    );
    assertFiniteNumber(input.observedAt, "input.observedAt");

    this.options.validator.assertValid(
      this.options.validator.validateInstrument(
        input.instrument,
      ),
      "Feature-engineering input instrument validation failed.",
    );

    const seen = new Set<string>();
    for (const observation of input.observations) {
      this.options.validator.assertValid(
        this.options.validator.validateFeatureObservation(
          observation,
        ),
        `Feature observation '${observation.featureId}' is invalid.`,
      );

      if (seen.has(observation.featureId)) {
        throw new Error(
          `Input contains duplicate feature observation '${observation.featureId}'.`,
        );
      }
      seen.add(observation.featureId);

      if (observation.observedAt > input.observedAt) {
        throw new Error(
          `Feature '${observation.featureId}' was observed after the pipeline timestamp.`,
        );
      }
    }
  }

  private resolveSpecification(
    input: FeatureEngineeringInput,
  ): FeatureEngineeringSpecification {
    const specification = this.getSpecification(
      input.specificationId,
      input.specificationVersion,
    );

    if (specification === undefined) {
      throw new Error(
        `Feature-engineering specification '${input.specificationId}'` +
          (input.specificationVersion === undefined
            ? ""
            : ` version '${input.specificationVersion}'`) +
          " is not registered.",
      );
    }

    return specification;
  }

  private executeTransform(
    context: TransformContext,
  ): AiFeatureValue {
    const { transform } = context;
    const values = transform.inputFeatureIds.map(
      (featureId) =>
        this.requireValue(
          context.currentValues,
          featureId,
          transform.transformId,
        ),
    );

    switch (transform.type) {
      case "IDENTITY":
        return values[0]!;
      case "CONSTANT":
        return transform.parameters.value ?? null;
      case "CLIP": {
        const value = asNumber(values[0]!, "clip input");
        const minimum = this.numericParameter(
          transform,
          "minimum",
          -Infinity,
        );
        const maximum = this.numericParameter(
          transform,
          "maximum",
          Infinity,
        );
        if (minimum > maximum) {
          throw new RangeError(
            "CLIP minimum cannot exceed maximum.",
          );
        }
        return Math.min(maximum, Math.max(minimum, value));
      }
      case "MIN_MAX_SCALE": {
        const value = asNumber(values[0]!, "min-max input");
        const minimum = this.numericParameter(
          transform,
          "minimum",
          0,
        );
        const maximum = this.numericParameter(
          transform,
          "maximum",
          1,
        );
        const outputMinimum = this.numericParameter(
          transform,
          "outputMinimum",
          0,
        );
        const outputMaximum = this.numericParameter(
          transform,
          "outputMaximum",
          1,
        );
        const width = maximum - minimum;
        if (Math.abs(width) <= EPSILON) {
          throw new RangeError(
            "MIN_MAX_SCALE requires a non-zero input range.",
          );
        }
        const normalized = (value - minimum) / width;
        return (
          outputMinimum +
          normalized * (outputMaximum - outputMinimum)
        );
      }
      case "STANDARDIZE": {
        const value = asNumber(values[0]!, "standardize input");
        const mean = this.numericParameter(
          transform,
          "mean",
          0,
        );
        const standardDeviation = this.numericParameter(
          transform,
          "standardDeviation",
          1,
        );
        if (Math.abs(standardDeviation) <= EPSILON) {
          throw new RangeError(
            "STANDARDIZE requires a non-zero standard deviation.",
          );
        }
        return (value - mean) / standardDeviation;
      }
      case "ROBUST_SCALE": {
        const value = asNumber(values[0]!, "robust-scale input");
        const median = this.numericParameter(
          transform,
          "median",
          0,
        );
        const interquartileRange = this.numericParameter(
          transform,
          "interquartileRange",
          1,
        );
        if (Math.abs(interquartileRange) <= EPSILON) {
          throw new RangeError(
            "ROBUST_SCALE requires a non-zero interquartile range.",
          );
        }
        return (value - median) / interquartileRange;
      }
      case "LOG": {
        const value = asNumber(values[0]!, "log input");
        if (value <= 0) {
          throw new RangeError(
            "LOG requires an input greater than zero.",
          );
        }
        return Math.log(value);
      }
      case "LOG1P": {
        const value = asNumber(values[0]!, "log1p input");
        if (value <= -1) {
          throw new RangeError(
            "LOG1P requires an input greater than negative one.",
          );
        }
        return Math.log1p(value);
      }
      case "EXP":
        return Math.exp(asNumber(values[0]!, "exp input"));
      case "ABS":
        return Math.abs(asNumber(values[0]!, "abs input"));
      case "SIGN":
        return Math.sign(asNumber(values[0]!, "sign input"));
      case "POWER":
        return Math.pow(
          asNumber(values[0]!, "power input"),
          this.numericParameter(transform, "exponent", 1),
        );
      case "ADD":
        return (
          asNumber(values[0]!, "add left") +
          asNumber(values[1]!, "add right")
        );
      case "SUBTRACT":
      case "DIFFERENCE":
        return (
          asNumber(values[0]!, "subtract left") -
          asNumber(values[1]!, "subtract right")
        );
      case "MULTIPLY":
        return (
          asNumber(values[0]!, "multiply left") *
          asNumber(values[1]!, "multiply right")
        );
      case "DIVIDE":
      case "RATIO": {
        const numerator = asNumber(
          values[0]!,
          "divide numerator",
        );
        const denominator = asNumber(
          values[1]!,
          "divide denominator",
        );
        if (Math.abs(denominator) <= EPSILON) {
          throw new RangeError("Division by zero.");
        }
        return numerator / denominator;
      }
      case "PERCENT_CHANGE": {
        const current = asNumber(
          values[0]!,
          "percent-change current",
        );
        const previous = asNumber(
          values[1]!,
          "percent-change previous",
        );
        if (Math.abs(previous) <= EPSILON) {
          throw new RangeError(
            "PERCENT_CHANGE previous value cannot be zero.",
          );
        }
        return (current - previous) / Math.abs(previous);
      }
      case "LAG":
        return this.lagValue(context);
      case "ROLLING_MEAN":
        return this.rollingValue(context, "MEAN");
      case "ROLLING_SUM":
        return this.rollingValue(context, "SUM");
      case "ROLLING_MIN":
        return this.rollingValue(context, "MIN");
      case "ROLLING_MAX":
        return this.rollingValue(context, "MAX");
      case "ROLLING_STDDEV":
        return this.rollingValue(context, "STDDEV");
      case "BOOLEAN_NOT":
        return !asBoolean(values[0]!, "boolean-not input");
      case "BOOLEAN_AND":
        return (
          asBoolean(values[0]!, "boolean-and left") &&
          asBoolean(values[1]!, "boolean-and right")
        );
      case "BOOLEAN_OR":
        return (
          asBoolean(values[0]!, "boolean-or left") ||
          asBoolean(values[1]!, "boolean-or right")
        );
      case "GREATER_THAN":
        return (
          asNumber(values[0]!, "greater-than left") >
          asNumber(values[1]!, "greater-than right")
        );
      case "GREATER_THAN_OR_EQUAL":
        return (
          asNumber(values[0]!, "greater-than-or-equal left") >=
          asNumber(values[1]!, "greater-than-or-equal right")
        );
      case "LESS_THAN":
        return (
          asNumber(values[0]!, "less-than left") <
          asNumber(values[1]!, "less-than right")
        );
      case "LESS_THAN_OR_EQUAL":
        return (
          asNumber(values[0]!, "less-than-or-equal left") <=
          asNumber(values[1]!, "less-than-or-equal right")
        );
      case "EQUAL":
        return Object.is(values[0], values[1]);
      case "CATEGORY_MAP":
        return this.categoryMap(values[0]!, transform);
      case "ONE_HOT":
        return this.oneHot(values[0]!, transform);
      case "CUSTOM_LINEAR": {
        const value = asNumber(values[0]!, "custom-linear input");
        const slope = this.numericParameter(
          transform,
          "slope",
          1,
        );
        const intercept = this.numericParameter(
          transform,
          "intercept",
          0,
        );
        return slope * value + intercept;
      }
      default:
        return this.assertNever(transform.type);
    }
  }

  private lagValue(context: TransformContext): AiFeatureValue {
    const featureId = context.transform.inputFeatureIds[0]!;
    const lag = this.integerParameter(
      context.transform,
      "lag",
      1,
    );
    const historical = context.history
      .filter((vector) =>
        Object.prototype.hasOwnProperty.call(
          vector.values,
          featureId,
        ),
      )
      .sort(
        (left, right) =>
          right.observedAt - left.observedAt ||
          right.vectorId.localeCompare(left.vectorId),
      );

    const vector = historical[lag - 1];
    if (vector === undefined) {
      throw new Error(
        `Insufficient history for lag ${lag} of feature '${featureId}'.`,
      );
    }
    return vector.values[featureId] ?? null;
  }

  private rollingValue(
    context: TransformContext,
    operation: "MEAN" | "SUM" | "MIN" | "MAX" | "STDDEV",
  ): number {
    const featureId = context.transform.inputFeatureIds[0]!;
    const window = this.integerParameter(
      context.transform,
      "window",
      1,
    );
    const includeCurrent =
      context.transform.parameters.includeCurrent !== false;
    const values: number[] = [];

    if (includeCurrent) {
      values.push(
        asNumber(
          this.requireValue(
            context.currentValues,
            featureId,
            context.transform.transformId,
          ),
          "rolling current value",
        ),
      );
    }

    const historical = context.history
      .filter((vector) =>
        Object.prototype.hasOwnProperty.call(
          vector.values,
          featureId,
        ),
      )
      .sort(
        (left, right) =>
          right.observedAt - left.observedAt ||
          right.vectorId.localeCompare(left.vectorId),
      );

    for (const vector of historical) {
      if (values.length >= window) {
        break;
      }
      values.push(
        asNumber(
          vector.values[featureId] ?? null,
          `historical feature '${featureId}'`,
        ),
      );
    }

    if (values.length < window) {
      throw new Error(
        `Rolling ${operation.toLowerCase()} requires ${window} values for feature '${featureId}', but only ${values.length} are available.`,
      );
    }

    const sample = values.slice(0, window);
    const sum = sample.reduce(
      (total, value) => total + value,
      0,
    );

    switch (operation) {
      case "MEAN":
        return sum / sample.length;
      case "SUM":
        return sum;
      case "MIN":
        return Math.min(...sample);
      case "MAX":
        return Math.max(...sample);
      case "STDDEV": {
        const mean = sum / sample.length;
        const variance =
          sample.reduce(
            (total, value) =>
              total + Math.pow(value - mean, 2),
            0,
          ) / sample.length;
        return Math.sqrt(variance);
      }
      default:
        return this.assertNever(operation);
    }
  }

  private categoryMap(
    value: AiFeatureValue,
    transform: FeatureEngineeringTransform,
  ): AiFeatureValue {
    const key = `map.${stableValueString(value)}`;
    if (
      Object.prototype.hasOwnProperty.call(
        transform.parameters,
        key,
      )
    ) {
      return transform.parameters[key] ?? null;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        transform.parameters,
        "default",
      )
    ) {
      return transform.parameters.default ?? null;
    }

    throw new Error(
      `CATEGORY_MAP has no mapping for '${stableValueString(value)}'.`,
    );
  }

  private oneHot(
    value: AiFeatureValue,
    transform: FeatureEngineeringTransform,
  ): boolean {
    const category =
      transform.parameters.category ?? null;
    return Object.is(value, category);
  }

  private createOutputVector(
    input: FeatureEngineeringInput,
    specification: FeatureEngineeringSpecification,
    values: ReadonlyMap<string, AiFeatureValue>,
    observations: ReadonlyMap<string, AiFeatureObservation>,
    issues: FeatureEngineeringIssue[],
  ): AiFeatureVector | undefined {
    const outputValues: Record<string, AiFeatureValue> = {};
    const outputObservations: AiFeatureObservation[] = [];

    for (const definition of specification.outputDefinitions) {
      const value = values.get(definition.featureId);
      const observation = observations.get(
        definition.featureId,
      );

      if (value === undefined || observation === undefined) {
        if (definition.required) {
          issues.push(
            this.issue(
              "REQUIRED_OUTPUT_MISSING",
              `Required output feature '${definition.featureId}' was not produced.`,
              "ERROR",
              undefined,
              definition.featureId,
            ),
          );
        }
        continue;
      }

      if (!this.valueMatchesDefinition(value, definition)) {
        issues.push(
          this.issue(
            "OUTPUT_TYPE_MISMATCH",
            `Output feature '${definition.featureId}' does not match definition type '${definition.dataType}'.`,
            "ERROR",
            undefined,
            definition.featureId,
          ),
        );
        continue;
      }

      if (
        typeof value === "number" &&
        ((definition.minimum !== undefined &&
          value < definition.minimum) ||
          (definition.maximum !== undefined &&
            value > definition.maximum))
      ) {
        issues.push(
          this.issue(
            "OUTPUT_RANGE_VIOLATION",
            `Output feature '${definition.featureId}' violates its configured range.`,
            "ERROR",
            undefined,
            definition.featureId,
          ),
        );
        continue;
      }

      outputValues[definition.featureId] = value;
      outputObservations.push(observation);
    }

    if (
      issues.some((issue) => issue.severity === "ERROR") &&
      this.options.failOnRequiredTransformError
    ) {
      return undefined;
    }

    const vector: AiFeatureVector = Object.freeze({
      vectorId: this.nextId(
        "engineered-feature-vector",
        input.observedAt,
      ),
      schemaVersion: specification.outputSchemaVersion,
      instrument: cloneInstrument(input.instrument),
      timeframe: input.timeframe,
      observedAt: input.observedAt,
      observations: Object.freeze(
        outputObservations
          .map(cloneObservation)
          .sort((left, right) =>
            left.featureId.localeCompare(right.featureId),
          ),
      ),
      values: Object.freeze(outputValues),
      metadata: cloneMetadata(input.metadata),
    });

    this.options.validator.assertValid(
      this.options.validator.validateFeatureVector(vector),
      "Engineered feature vector validation failed.",
    );

    return vector;
  }

  private normalizedHistory(
    vectors: readonly AiFeatureVector[],
    input: FeatureEngineeringInput,
  ): readonly AiFeatureVector[] {
    return Object.freeze(
      vectors
        .filter(
          (vector) =>
            vector.instrument.exchangeId ===
              input.instrument.exchangeId &&
            vector.instrument.normalizedSymbol ===
              input.instrument.normalizedSymbol &&
            vector.instrument.marketType ===
              input.instrument.marketType &&
            vector.timeframe === input.timeframe &&
            vector.observedAt <= input.observedAt,
        )
        .map(cloneVector),
    );
  }

  private requireValue(
    values: ReadonlyMap<string, AiFeatureValue>,
    featureId: string,
    transformId: string,
  ): AiFeatureValue {
    if (!values.has(featureId)) {
      throw new Error(
        `Transform '${transformId}' requires missing feature '${featureId}'.`,
      );
    }
    return values.get(featureId) ?? null;
  }

  private requireInputCount(
    transform: FeatureEngineeringTransform,
    expected: number,
  ): void {
    if (transform.inputFeatureIds.length !== expected) {
      throw new RangeError(
        `Transform '${transform.transformId}' of type '${transform.type}' requires exactly ${expected} input feature(s).`,
      );
    }
  }

  private numericParameter(
    transform: FeatureEngineeringTransform,
    name: string,
    defaultValue: number,
  ): number {
    const value = transform.parameters[name];
    if (value === undefined) {
      return defaultValue;
    }
    return asNumber(
      value,
      `transform '${transform.transformId}' parameter '${name}'`,
    );
  }

  private integerParameter(
    transform: FeatureEngineeringTransform,
    name: string,
    defaultValue: number,
  ): number {
    const value = this.numericParameter(
      transform,
      name,
      defaultValue,
    );
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(
        `Transform '${transform.transformId}' parameter '${name}' must be a positive integer.`,
      );
    }
    return value;
  }

  private valueMatchesDefinition(
    value: AiFeatureValue,
    definition: AiFeatureDefinition,
  ): boolean {
    if (value === null) {
      return !definition.required;
    }

    switch (definition.dataType) {
      case "NUMBER":
        return typeof value === "number" && Number.isFinite(value);
      case "BOOLEAN":
        return typeof value === "boolean";
      case "CATEGORY":
        return typeof value === "string";
      default:
        return this.assertNever(definition.dataType);
    }
  }

  private issue(
    code: string,
    message: string,
    severity: FeatureEngineeringIssue["severity"],
    transformId?: string,
    featureId?: string,
  ): FeatureEngineeringIssue {
    return Object.freeze({
      transformId,
      featureId,
      code,
      message,
      severity,
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private completeResult(
    result: FeatureEngineeringResult,
  ): FeatureEngineeringResult {
    const frozen = cloneResult(result);
    this.history.push(frozen);

    if (this.history.length > this.options.maximumHistoryEntries) {
      this.history.splice(
        0,
        this.history.length -
          this.options.maximumHistoryEntries,
      );
    }

    const latency = Math.max(
      0,
      frozen.completedAt - frozen.startedAt,
    );
    this.metricsState.totalExecutionLatencyMs += latency;
    this.metricsState.maximumExecutionLatencyMs = Math.max(
      this.metricsState.maximumExecutionLatencyMs,
      latency,
    );

    switch (frozen.status) {
      case "SUCCEEDED":
        this.metricsState.successfulExecutionCount += 1;
        break;
      case "PARTIAL":
        this.metricsState.partialExecutionCount += 1;
        break;
      case "FAILED":
        this.metricsState.failedExecutionCount += 1;
        break;
      default:
        this.assertNever(frozen.status);
    }

    return frozen;
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

  private assertNever(value: never): never {
    throw new Error(`Unsupported value '${String(value)}'.`);
  }
}

export function createFeatureEngineeringPipeline(
  options: FeatureEngineeringPipelineOptions = {},
): FeatureEngineeringPipeline {
  return new FeatureEngineeringPipeline(options);
}