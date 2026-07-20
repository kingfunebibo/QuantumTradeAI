/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 3: Deterministic AI feature store.
 *
 * Responsibilities:
 * - register and version feature definitions
 * - persist immutable feature vectors
 * - build immutable feature snapshots
 * - detect stale, missing, invalid, and conflicting features
 * - calculate snapshot completeness
 * - retain bounded deterministic history
 * - support point-in-time feature retrieval
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureDefinition,
  type AiFeatureObservation,
  type AiFeatureQuality,
  type AiFeatureSnapshot,
  type AiFeatureValidationIssue,
  type AiFeatureValue,
  type AiFeatureVector,
  type AiStrategyInstrument,
  type AiStrategyMetadata,
  type AiStrategyTimeframe,
  type AiStrategyTimestamp,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  AiStrategyValidationError,
  createAiStrategyContractValidator,
  toFeatureValidationIssues,
} from "./ai-strategy-validator";

export interface AiFeatureSchema {
  readonly schemaId: string;
  readonly version: string;
  readonly createdAt: AiStrategyTimestamp;
  readonly definitions: readonly AiFeatureDefinition[];
  readonly checksum?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiFeatureStoreOptions {
  readonly maximumSchemas?: number;
  readonly maximumVectors?: number;
  readonly maximumVectorsPerInstrument?: number;
  readonly defaultMaximumFeatureAgeMs?: number;
  readonly rejectUnknownFeatures?: boolean;
  readonly rejectDuplicateVectorIds?: boolean;
  readonly strictObservationValueConsistency?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
}

export interface AiFeatureSnapshotRequest {
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly observedAt?: AiStrategyTimestamp;
  readonly schemaVersion?: string;
  readonly maximumFeatureAgeMs?: number;
  readonly requiredFeatureIds?: readonly string[];
  readonly includeQualities?: readonly AiFeatureQuality[];
  readonly metadata?: AiStrategyMetadata;
}

export interface AiFeatureVectorQuery {
  readonly exchangeId?: string;
  readonly normalizedSymbol?: string;
  readonly timeframe?: AiStrategyTimeframe;
  readonly schemaVersion?: string;
  readonly fromObservedAt?: AiStrategyTimestamp;
  readonly toObservedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface AiFeatureStoreSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly schemas: readonly AiFeatureSchema[];
  readonly vectorCount: number;
  readonly vectors: readonly AiFeatureVector[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiFeatureStore {
  registerSchema(schema: AiFeatureSchema): void;

  getSchema(version: string): AiFeatureSchema | undefined;

  listSchemas(): readonly AiFeatureSchema[];

  putVector(vector: AiFeatureVector): void;

  putVectors(vectors: readonly AiFeatureVector[]): void;

  getVector(vectorId: string): AiFeatureVector | undefined;

  queryVectors(query?: AiFeatureVectorQuery): readonly AiFeatureVector[];

  createSnapshot(request: AiFeatureSnapshotRequest): AiFeatureSnapshot;

  removeVector(vectorId: string): boolean;

  clearVectors(): void;

  snapshot(): AiFeatureStoreSnapshot;
}

const DEFAULT_OPTIONS = Object.freeze({
  maximumSchemas: 64,
  maximumVectors: 100_000,
  maximumVectorsPerInstrument: 10_000,
  defaultMaximumFeatureAgeMs: 300_000,
  rejectUnknownFeatures: true,
  rejectDuplicateVectorIds: true,
  strictObservationValueConsistency: true,
});

interface ResolvedOptions {
  readonly maximumSchemas: number;
  readonly maximumVectors: number;
  readonly maximumVectorsPerInstrument: number;
  readonly defaultMaximumFeatureAgeMs: number;
  readonly rejectUnknownFeatures: boolean;
  readonly rejectDuplicateVectorIds: boolean;
  readonly strictObservationValueConsistency: boolean;
  readonly clock: () => AiStrategyTimestamp;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator: AiStrategyContractValidator;
}

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

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const cloned: Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]> =
    {};

  for (const [key, value] of Object.entries(metadata)) {
    cloned[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(cloned);
}

function cloneDefinition(
  definition: AiFeatureDefinition,
): AiFeatureDefinition {
  return Object.freeze({
    ...definition,
    metadata: cloneMetadata(definition.metadata),
  });
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

function cloneVector(vector: AiFeatureVector): AiFeatureVector {
  const values: Record<string, AiFeatureValue> = {};
  for (const [featureId, value] of Object.entries(vector.values)) {
    values[featureId] = value;
  }

  return Object.freeze({
    ...vector,
    instrument: cloneInstrument(vector.instrument),
    observations: Object.freeze(vector.observations.map(cloneObservation)),
    values: Object.freeze(values),
    metadata: cloneMetadata(vector.metadata),
  });
}

function cloneSchema(schema: AiFeatureSchema): AiFeatureSchema {
  return Object.freeze({
    ...schema,
    definitions: Object.freeze(schema.definitions.map(cloneDefinition)),
    metadata: cloneMetadata(schema.metadata),
  });
}

function cloneIssue(
  issue: AiFeatureValidationIssue,
): AiFeatureValidationIssue {
  return Object.freeze({
    ...issue,
    metadata: cloneMetadata(issue.metadata),
  });
}

function instrumentKey(
  instrument: AiStrategyInstrument,
  timeframe: AiStrategyTimeframe,
): string {
  return [
    instrument.exchangeId,
    instrument.normalizedSymbol,
    instrument.marketType,
    timeframe,
  ].join("::");
}

function valuesEqual(left: AiFeatureValue, right: AiFeatureValue): boolean {
  return Object.is(left, right);
}

function compareVectors(
  left: AiFeatureVector,
  right: AiFeatureVector,
): number {
  if (left.observedAt !== right.observedAt) {
    return left.observedAt - right.observedAt;
  }

  return left.vectorId.localeCompare(right.vectorId);
}

function compareSchemas(left: AiFeatureSchema, right: AiFeatureSchema): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.version.localeCompare(right.version);
}

export class InMemoryAiFeatureStore implements AiFeatureStore {
  private readonly options: ResolvedOptions;

  private readonly schemasByVersion = new Map<string, AiFeatureSchema>();

  private readonly vectorsById = new Map<string, AiFeatureVector>();

  private readonly vectorIdsByInstrument = new Map<string, string[]>();

  private sequence = 0;

  public constructor(options: AiFeatureStoreOptions = {}) {
    const maximumSchemas =
      options.maximumSchemas ?? DEFAULT_OPTIONS.maximumSchemas;
    const maximumVectors =
      options.maximumVectors ?? DEFAULT_OPTIONS.maximumVectors;
    const maximumVectorsPerInstrument =
      options.maximumVectorsPerInstrument ??
      DEFAULT_OPTIONS.maximumVectorsPerInstrument;
    const defaultMaximumFeatureAgeMs =
      options.defaultMaximumFeatureAgeMs ??
      DEFAULT_OPTIONS.defaultMaximumFeatureAgeMs;

    assertPositiveInteger(maximumSchemas, "maximumSchemas");
    assertPositiveInteger(maximumVectors, "maximumVectors");
    assertPositiveInteger(
      maximumVectorsPerInstrument,
      "maximumVectorsPerInstrument",
    );
    assertNonNegativeFiniteNumber(
      defaultMaximumFeatureAgeMs,
      "defaultMaximumFeatureAgeMs",
    );

    this.options = Object.freeze({
      maximumSchemas,
      maximumVectors,
      maximumVectorsPerInstrument,
      defaultMaximumFeatureAgeMs,
      rejectUnknownFeatures:
        options.rejectUnknownFeatures ??
        DEFAULT_OPTIONS.rejectUnknownFeatures,
      rejectDuplicateVectorIds:
        options.rejectDuplicateVectorIds ??
        DEFAULT_OPTIONS.rejectDuplicateVectorIds,
      strictObservationValueConsistency:
        options.strictObservationValueConsistency ??
        DEFAULT_OPTIONS.strictObservationValueConsistency,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
    });
  }

  public registerSchema(schema: AiFeatureSchema): void {
    this.validateSchema(schema);

    const immutable = cloneSchema(schema);
    const existing = this.schemasByVersion.get(immutable.version);

    if (existing !== undefined) {
      if (!this.schemasEquivalent(existing, immutable)) {
        throw new AiStrategyValidationError(
          `Feature schema version "${immutable.version}" is already registered with different content.`,
          Object.freeze([
            Object.freeze({
              path: "schema.version",
              code: "SCHEMA_VERSION_CONFLICT",
              message:
                "A schema version cannot be replaced with different definitions.",
              severity: "ERROR" as const,
            }),
          ]),
        );
      }

      return;
    }

    this.schemasByVersion.set(immutable.version, immutable);
    this.trimSchemas();
  }

  public getSchema(version: string): AiFeatureSchema | undefined {
    return this.schemasByVersion.get(version);
  }

  public listSchemas(): readonly AiFeatureSchema[] {
    return Object.freeze(
      [...this.schemasByVersion.values()].sort(compareSchemas),
    );
  }

  public putVector(vector: AiFeatureVector): void {
    const validation = this.options.validator.validateFeatureVector(vector);
    this.options.validator.assertValid(
      validation,
      "AI feature vector validation failed.",
    );

    const schema = this.schemasByVersion.get(vector.schemaVersion);
    if (schema === undefined) {
      throw new AiStrategyValidationError(
        `No feature schema is registered for version "${vector.schemaVersion}".`,
        Object.freeze([
          Object.freeze({
            path: "featureVector.schemaVersion",
            code: "UNKNOWN_SCHEMA_VERSION",
            message:
              "A feature vector must reference a registered schema version.",
            severity: "ERROR" as const,
          }),
        ]),
      );
    }

    this.validateVectorAgainstSchema(vector, schema);

    if (
      this.options.rejectDuplicateVectorIds &&
      this.vectorsById.has(vector.vectorId)
    ) {
      throw new AiStrategyValidationError(
        `Feature vector "${vector.vectorId}" is already stored.`,
        Object.freeze([
          Object.freeze({
            path: "featureVector.vectorId",
            code: "DUPLICATE_VECTOR_ID",
            message: "Feature vector identifiers must be unique.",
            severity: "ERROR" as const,
          }),
        ]),
      );
    }

    const immutable = cloneVector(vector);

    if (this.vectorsById.has(immutable.vectorId)) {
      this.detachVectorFromIndex(immutable.vectorId);
    }

    this.vectorsById.set(immutable.vectorId, immutable);
    this.attachVectorToIndex(immutable);
    this.trimInstrumentHistory(immutable);
    this.trimGlobalHistory();
  }

  public putVectors(vectors: readonly AiFeatureVector[]): void {
    for (const vector of vectors) {
      this.putVector(vector);
    }
  }

  public getVector(vectorId: string): AiFeatureVector | undefined {
    return this.vectorsById.get(vectorId);
  }

  public queryVectors(
    query: AiFeatureVectorQuery = {},
  ): readonly AiFeatureVector[] {
    const limit = query.limit ?? this.options.maximumVectors;

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("query.limit must be a positive integer.");
    }

    if (
      query.fromObservedAt !== undefined &&
      query.toObservedAt !== undefined &&
      query.fromObservedAt > query.toObservedAt
    ) {
      throw new RangeError(
        "query.fromObservedAt cannot exceed query.toObservedAt.",
      );
    }

    const matches = [...this.vectorsById.values()]
      .filter((vector) => {
        if (
          query.exchangeId !== undefined &&
          vector.instrument.exchangeId !== query.exchangeId
        ) {
          return false;
        }

        if (
          query.normalizedSymbol !== undefined &&
          vector.instrument.normalizedSymbol !== query.normalizedSymbol
        ) {
          return false;
        }

        if (
          query.timeframe !== undefined &&
          vector.timeframe !== query.timeframe
        ) {
          return false;
        }

        if (
          query.schemaVersion !== undefined &&
          vector.schemaVersion !== query.schemaVersion
        ) {
          return false;
        }

        if (
          query.fromObservedAt !== undefined &&
          vector.observedAt < query.fromObservedAt
        ) {
          return false;
        }

        if (
          query.toObservedAt !== undefined &&
          vector.observedAt > query.toObservedAt
        ) {
          return false;
        }

        return true;
      })
      .sort(compareVectors)
      .slice(-limit);

    return Object.freeze(matches);
  }

  public createSnapshot(
    request: AiFeatureSnapshotRequest,
  ): AiFeatureSnapshot {
    const instrumentValidation =
      this.options.validator.validateInstrument(request.instrument);
    this.options.validator.assertValid(
      instrumentValidation,
      "Snapshot instrument validation failed.",
    );

    const observedAt = request.observedAt ?? this.options.clock();
    assertNonNegativeFiniteNumber(observedAt, "request.observedAt");

    const maximumFeatureAgeMs =
      request.maximumFeatureAgeMs ??
      this.options.defaultMaximumFeatureAgeMs;
    assertNonNegativeFiniteNumber(
      maximumFeatureAgeMs,
      "request.maximumFeatureAgeMs",
    );

    const schema = this.resolveSnapshotSchema(request.schemaVersion);
    const requestedFeatureIds = this.resolveRequestedFeatureIds(
      schema,
      request.requiredFeatureIds,
    );
    const includedQualities = new Set<AiFeatureQuality>(
      request.includeQualities ?? [
        "VALID",
        "STALE",
        "IMPUTED",
        "OUTLIER",
        "MISSING",
        "INVALID",
      ],
    );

    const candidates = this.findPointInTimeVectors(
      request.instrument,
      request.timeframe,
      schema.version,
      observedAt,
    );

    const selectedByFeature = new Map<
      string,
      {
        readonly observation: AiFeatureObservation;
        readonly vector: AiFeatureVector;
      }
    >();

    for (const vector of candidates) {
      for (const observation of vector.observations) {
        if (!requestedFeatureIds.has(observation.featureId)) {
          continue;
        }

        if (!includedQualities.has(observation.quality)) {
          continue;
        }

        const current = selectedByFeature.get(observation.featureId);
        if (
          current === undefined ||
          observation.observedAt > current.observation.observedAt ||
          (observation.observedAt === current.observation.observedAt &&
            vector.vectorId.localeCompare(current.vector.vectorId) > 0)
        ) {
          selectedByFeature.set(observation.featureId, {
            observation,
            vector,
          });
        }
      }
    }

    const issues: AiFeatureValidationIssue[] = [];
    const vectorsById = new Map<string, AiFeatureVector>();
    let usableFeatureCount = 0;

    for (const featureId of requestedFeatureIds) {
      const selected = selectedByFeature.get(featureId);

      if (selected === undefined) {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_MISSING",
            `Required feature "${featureId}" is missing.`,
            "ERROR",
          ),
        );
        continue;
      }

      vectorsById.set(selected.vector.vectorId, selected.vector);

      const ageMs = observedAt - selected.observation.observedAt;

      if (ageMs < 0) {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_FROM_FUTURE",
            `Feature "${featureId}" was observed after the snapshot timestamp.`,
            "ERROR",
          ),
        );
        continue;
      }

      if (
        selected.observation.quality === "INVALID" ||
        selected.observation.quality === "MISSING"
      ) {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_NOT_USABLE",
            `Feature "${featureId}" has quality "${selected.observation.quality}".`,
            "ERROR",
          ),
        );
        continue;
      }

      if (
        selected.observation.quality === "STALE" ||
        ageMs > maximumFeatureAgeMs
      ) {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_STALE",
            `Feature "${featureId}" exceeds the maximum allowed age.`,
            "WARNING",
          ),
        );
        continue;
      }

      if (selected.observation.quality === "OUTLIER") {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_OUTLIER",
            `Feature "${featureId}" is marked as an outlier.`,
            "WARNING",
          ),
        );
      }

      if (selected.observation.quality === "IMPUTED") {
        issues.push(
          this.createFeatureIssue(
            featureId,
            "FEATURE_IMPUTED",
            `Feature "${featureId}" uses an imputed value.`,
            "INFO",
          ),
        );
      }

      usableFeatureCount += 1;
    }

    const requiredCount = requestedFeatureIds.size;
    const completeness =
      requiredCount === 0 ? 1 : usableFeatureCount / requiredCount;
    const valid = !issues.some((issue) => issue.severity === "ERROR");

    const snapshotId = this.nextId("feature-snapshot", observedAt);

    return Object.freeze({
      snapshotId,
      createdAt: observedAt,
      vectors: Object.freeze(
        [...vectorsById.values()].sort(compareVectors),
      ),
      completeness,
      valid,
      issues: Object.freeze(issues.map(cloneIssue)),
      metadata: cloneMetadata(request.metadata),
    });
  }

  public removeVector(vectorId: string): boolean {
    const removed = this.vectorsById.delete(vectorId);
    if (removed) {
      this.detachVectorFromIndex(vectorId);
    }
    return removed;
  }

  public clearVectors(): void {
    this.vectorsById.clear();
    this.vectorIdsByInstrument.clear();
  }

  public snapshot(): AiFeatureStoreSnapshot {
    const capturedAt = this.options.clock();

    return Object.freeze({
      capturedAt,
      schemas: this.listSchemas(),
      vectorCount: this.vectorsById.size,
      vectors: Object.freeze(
        [...this.vectorsById.values()].sort(compareVectors),
      ),
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private validateSchema(schema: AiFeatureSchema): void {
    if (
      typeof schema.schemaId !== "string" ||
      schema.schemaId.trim().length === 0
    ) {
      throw new TypeError("schema.schemaId must be a non-empty string.");
    }

    if (
      typeof schema.version !== "string" ||
      schema.version.trim().length === 0
    ) {
      throw new TypeError("schema.version must be a non-empty string.");
    }

    assertNonNegativeFiniteNumber(schema.createdAt, "schema.createdAt");

    if (!Array.isArray(schema.definitions)) {
      throw new TypeError("schema.definitions must be an array.");
    }

    const featureIds = new Set<string>();

    for (const definition of schema.definitions) {
      const validation =
        this.options.validator.validateFeatureDefinition(definition);
      this.options.validator.assertValid(
        validation,
        `Feature definition "${definition.featureId}" is invalid.`,
      );

      if (featureIds.has(definition.featureId)) {
        throw new AiStrategyValidationError(
          `Feature "${definition.featureId}" is duplicated in schema "${schema.version}".`,
          Object.freeze([
            Object.freeze({
              path: "schema.definitions",
              code: "DUPLICATE_FEATURE_DEFINITION",
              message:
                "A schema cannot contain duplicate feature identifiers.",
              severity: "ERROR" as const,
            }),
          ]),
        );
      }

      featureIds.add(definition.featureId);
    }

    if (
      schema.checksum !== undefined &&
      (typeof schema.checksum !== "string" ||
        schema.checksum.trim().length === 0)
    ) {
      throw new TypeError("schema.checksum must be a non-empty string.");
    }
  }

  private validateVectorAgainstSchema(
    vector: AiFeatureVector,
    schema: AiFeatureSchema,
  ): void {
    const definitionsById = new Map(
      schema.definitions.map((definition) => [
        definition.featureId,
        definition,
      ]),
    );

    const issues: AiFeatureValidationIssue[] = [];
    const observationsById = new Map<string, AiFeatureObservation>();

    for (const observation of vector.observations) {
      observationsById.set(observation.featureId, observation);

      const definition = definitionsById.get(observation.featureId);
      if (definition === undefined) {
        if (this.options.rejectUnknownFeatures) {
          issues.push(
            this.createFeatureIssue(
              observation.featureId,
              "UNKNOWN_FEATURE",
              `Feature "${observation.featureId}" is not defined by schema "${schema.version}".`,
              "ERROR",
            ),
          );
        }
        continue;
      }

      this.validateValueAgainstDefinition(
        observation.value,
        definition,
        issues,
      );

      const storedValue = vector.values[observation.featureId];
      if (
        this.options.strictObservationValueConsistency &&
        !valuesEqual(storedValue, observation.value)
      ) {
        issues.push(
          this.createFeatureIssue(
            observation.featureId,
            "FEATURE_VALUE_MISMATCH",
            `Observation and values map disagree for feature "${observation.featureId}".`,
            "ERROR",
          ),
        );
      }
    }

    for (const definition of schema.definitions) {
      if (
        definition.required &&
        !observationsById.has(definition.featureId)
      ) {
        issues.push(
          this.createFeatureIssue(
            definition.featureId,
            "REQUIRED_FEATURE_MISSING",
            `Required feature "${definition.featureId}" is missing from the vector.`,
            "ERROR",
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          vector.values,
          definition.featureId,
        )
      ) {
        this.validateValueAgainstDefinition(
          vector.values[definition.featureId],
          definition,
          issues,
        );
      }
    }

    const result = Object.freeze({
      valid: !issues.some((issue) => issue.severity === "ERROR"),
      issues: Object.freeze(
        issues.map((issue) =>
          Object.freeze({
            path: `featureVector.${issue.featureId ?? "values"}`,
            code: issue.code,
            message: issue.message,
            severity: issue.severity,
          }),
        ),
      ),
    });

    this.options.validator.assertValid(
      result,
      "Feature vector does not satisfy its registered schema.",
    );
  }

  private validateValueAgainstDefinition(
    value: AiFeatureValue | undefined,
    definition: AiFeatureDefinition,
    issues: AiFeatureValidationIssue[],
  ): void {
    if (value === undefined || value === null) {
      if (definition.required) {
        issues.push(
          this.createFeatureIssue(
            definition.featureId,
            "REQUIRED_FEATURE_VALUE_MISSING",
            `Required feature "${definition.featureId}" cannot be null or undefined.`,
            "ERROR",
          ),
        );
      }
      return;
    }

    if (
      definition.dataType === "NUMBER" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      issues.push(
        this.createFeatureIssue(
          definition.featureId,
          "FEATURE_TYPE_MISMATCH",
          `Feature "${definition.featureId}" must be a finite number.`,
          "ERROR",
        ),
      );
      return;
    }

    if (
      definition.dataType === "BOOLEAN" &&
      typeof value !== "boolean"
    ) {
      issues.push(
        this.createFeatureIssue(
          definition.featureId,
          "FEATURE_TYPE_MISMATCH",
          `Feature "${definition.featureId}" must be a boolean.`,
          "ERROR",
        ),
      );
      return;
    }

    if (
      definition.dataType === "CATEGORY" &&
      typeof value !== "string"
    ) {
      issues.push(
        this.createFeatureIssue(
          definition.featureId,
          "FEATURE_TYPE_MISMATCH",
          `Feature "${definition.featureId}" must be a category string.`,
          "ERROR",
        ),
      );
      return;
    }

    if (typeof value === "number") {
      if (
        definition.minimum !== undefined &&
        value < definition.minimum
      ) {
        issues.push(
          this.createFeatureIssue(
            definition.featureId,
            "FEATURE_BELOW_MINIMUM",
            `Feature "${definition.featureId}" is below its minimum value.`,
            "ERROR",
          ),
        );
      }

      if (
        definition.maximum !== undefined &&
        value > definition.maximum
      ) {
        issues.push(
          this.createFeatureIssue(
            definition.featureId,
            "FEATURE_ABOVE_MAXIMUM",
            `Feature "${definition.featureId}" exceeds its maximum value.`,
            "ERROR",
          ),
        );
      }
    }
  }

  private resolveSnapshotSchema(
    requestedVersion: string | undefined,
  ): AiFeatureSchema {
    if (requestedVersion !== undefined) {
      const schema = this.schemasByVersion.get(requestedVersion);
      if (schema === undefined) {
        throw new Error(
          `Feature schema version "${requestedVersion}" is not registered.`,
        );
      }
      return schema;
    }

    const latest = [...this.schemasByVersion.values()]
      .sort(compareSchemas)
      .at(-1);

    if (latest === undefined) {
      throw new Error(
        "At least one feature schema must be registered before creating a snapshot.",
      );
    }

    return latest;
  }

  private resolveRequestedFeatureIds(
    schema: AiFeatureSchema,
    requested: readonly string[] | undefined,
  ): Set<string> {
    if (requested === undefined) {
      return new Set(
        schema.definitions
          .filter((definition) => definition.required)
          .map((definition) => definition.featureId),
      );
    }

    const available = new Set(
      schema.definitions.map((definition) => definition.featureId),
    );
    const resolved = new Set<string>();

    for (const featureId of requested) {
      if (!available.has(featureId)) {
        throw new Error(
          `Requested feature "${featureId}" is not defined by schema "${schema.version}".`,
        );
      }

      resolved.add(featureId);
    }

    return resolved;
  }

  private findPointInTimeVectors(
    instrument: AiStrategyInstrument,
    timeframe: AiStrategyTimeframe,
    schemaVersion: string,
    observedAt: AiStrategyTimestamp,
  ): readonly AiFeatureVector[] {
    const key = instrumentKey(instrument, timeframe);
    const ids = this.vectorIdsByInstrument.get(key) ?? [];

    return Object.freeze(
      ids
        .map((id) => this.vectorsById.get(id))
        .filter(
          (vector): vector is AiFeatureVector =>
            vector !== undefined &&
            vector.schemaVersion === schemaVersion &&
            vector.observedAt <= observedAt,
        )
        .sort(compareVectors),
    );
  }

  private attachVectorToIndex(vector: AiFeatureVector): void {
    const key = instrumentKey(vector.instrument, vector.timeframe);
    const ids = this.vectorIdsByInstrument.get(key) ?? [];

    ids.push(vector.vectorId);
    ids.sort((leftId, rightId) => {
      const left = this.vectorsById.get(leftId);
      const right = this.vectorsById.get(rightId);

      if (left === undefined && right === undefined) {
        return leftId.localeCompare(rightId);
      }
      if (left === undefined) {
        return -1;
      }
      if (right === undefined) {
        return 1;
      }

      return compareVectors(left, right);
    });

    this.vectorIdsByInstrument.set(key, ids);
  }

  private detachVectorFromIndex(vectorId: string): void {
    for (const [key, ids] of this.vectorIdsByInstrument.entries()) {
      const next = ids.filter((id) => id !== vectorId);

      if (next.length === 0) {
        this.vectorIdsByInstrument.delete(key);
      } else if (next.length !== ids.length) {
        this.vectorIdsByInstrument.set(key, next);
      }
    }
  }

  private trimInstrumentHistory(vector: AiFeatureVector): void {
    const key = instrumentKey(vector.instrument, vector.timeframe);
    const ids = this.vectorIdsByInstrument.get(key);

    if (ids === undefined) {
      return;
    }

    while (ids.length > this.options.maximumVectorsPerInstrument) {
      const oldestId = ids.shift();
      if (oldestId !== undefined) {
        this.vectorsById.delete(oldestId);
      }
    }

    if (ids.length === 0) {
      this.vectorIdsByInstrument.delete(key);
    }
  }

  private trimGlobalHistory(): void {
    while (this.vectorsById.size > this.options.maximumVectors) {
      const oldest = [...this.vectorsById.values()].sort(compareVectors)[0];
      if (oldest === undefined) {
        return;
      }

      this.removeVector(oldest.vectorId);
    }
  }

  private trimSchemas(): void {
    while (this.schemasByVersion.size > this.options.maximumSchemas) {
      const oldest = [...this.schemasByVersion.values()].sort(compareSchemas)[0];
      if (oldest === undefined) {
        return;
      }

      this.schemasByVersion.delete(oldest.version);
    }
  }

  private schemasEquivalent(
    left: AiFeatureSchema,
    right: AiFeatureSchema,
  ): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private createFeatureIssue(
    featureId: string | undefined,
    code: string,
    message: string,
    severity: "INFO" | "WARNING" | "ERROR",
  ): AiFeatureValidationIssue {
    return Object.freeze({
      featureId,
      code,
      message,
      severity,
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(prefix, timestamp, this.sequence);
  }
}

export function createInMemoryAiFeatureStore(
  options: AiFeatureStoreOptions = {},
): InMemoryAiFeatureStore {
  return new InMemoryAiFeatureStore(options);
}

export function validateFeatureVectorForStore(
  vector: AiFeatureVector,
  validator: AiStrategyContractValidator =
    createAiStrategyContractValidator(),
): readonly AiFeatureValidationIssue[] {
  return toFeatureValidationIssues(
    validator.validateFeatureVector(vector),
  );
}