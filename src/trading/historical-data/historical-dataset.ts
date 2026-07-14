import {
  CreateHistoricalDatasetInput,
  HistoricalDataset,
  HistoricalDatasetMetadata,
  HistoricalDatasetStatus,
  HistoricalDatasetStorage,
  HistoricalDatasetTimeRange,
  HistoricalMetadataAttributes,
  HistoricalMetadataValue,
  HistoricalTimestamp,
  historicalCount,
} from "./historical-dataset.types";

/**
 * Error thrown when historical dataset domain invariants are violated.
 */
export class HistoricalDatasetDomainError extends Error {
  public readonly code: HistoricalDatasetDomainErrorCode;

  public constructor(
    code: HistoricalDatasetDomainErrorCode,
    message: string,
  ) {
    super(message);

    this.name = "HistoricalDatasetDomainError";
    this.code = code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const HISTORICAL_DATASET_DOMAIN_ERROR_CODES = [
  "INVALID_TIME_RANGE",
  "INVALID_RECORD_COUNT",
  "INVALID_VERSION",
  "INVALID_TIMESTAMP_ORDER",
  "INVALID_STORAGE_LOCATION",
  "INVALID_DESCRIPTION",
  "INVALID_EXTERNAL_REFERENCE",
  "INVALID_METADATA_ATTRIBUTE",
  "INVALID_STATUS_TRANSITION",
] as const;

export type HistoricalDatasetDomainErrorCode =
  (typeof HISTORICAL_DATASET_DOMAIN_ERROR_CODES)[number];

/**
 * Valid lifecycle transitions for a historical dataset.
 *
 * Dataset state transitions are intentionally explicit. Arbitrary status
 * mutation would allow invalid datasets to become available for loading.
 */
const HISTORICAL_DATASET_STATUS_TRANSITIONS = {
  CREATED: ["IMPORTING", "ARCHIVED"],
  IMPORTING: ["VALIDATING", "REJECTED", "ARCHIVED"],
  VALIDATING: ["READY", "REJECTED", "ARCHIVED"],
  READY: ["ARCHIVED"],
  REJECTED: ["IMPORTING", "ARCHIVED"],
  ARCHIVED: [],
} as const satisfies Readonly<
  Record<
    HistoricalDatasetStatus,
    readonly HistoricalDatasetStatus[]
  >
>;

/**
 * Input used when rebuilding an existing persisted aggregate.
 *
 * Repository implementations will use this contract to restore a dataset
 * without bypassing domain validation.
 */
export interface RestoreHistoricalDatasetInput {
  readonly dataset: HistoricalDataset;
}

/**
 * Input used to produce a new immutable dataset revision with another status.
 */
export interface TransitionHistoricalDatasetStatusInput {
  readonly dataset: HistoricalDataset;
  readonly nextStatus: HistoricalDatasetStatus;
  readonly updatedAt: HistoricalTimestamp;
}

/**
 * Creates a new immutable historical dataset aggregate.
 */
export function createHistoricalDataset(
  input: CreateHistoricalDatasetInput,
): HistoricalDataset {
  validateCreateHistoricalDatasetInput(input);

  const metadata: HistoricalDatasetMetadata = deepFreeze({
    datasetId: input.id,
    version: input.version,
    source: input.source,
    origin: input.origin,
    marketType: input.marketType,
    symbol: input.symbol,
    timeframe: input.timeframe,
    range: createImmutableTimeRange(input.range),
    recordCount: input.recordCount,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.externalReference === undefined
      ? {}
      : {
          externalReference: input.externalReference.trim(),
        }),
    ...(input.description === undefined
      ? {}
      : {
          description: input.description.trim(),
        }),
    ...(input.attributes === undefined
      ? {}
      : {
          attributes: cloneAndFreezeMetadataAttributes(
            input.attributes,
          ),
        }),
  });

  const storage: HistoricalDatasetStorage = deepFreeze({
    encoding: input.encoding,
    partitionStrategy: input.partitionStrategy,
    partitions: Object.freeze([]),
  });

  return deepFreeze({
    id: input.id,
    version: input.version,
    status: "CREATED",
    metadata,
    storage,
  });
}

/**
 * Restores and validates a historical dataset obtained from persistence.
 *
 * A new deeply immutable object is returned so mutable repository objects
 * cannot leak into the domain layer.
 */
export function restoreHistoricalDataset(
  input: RestoreHistoricalDatasetInput,
): HistoricalDataset {
  validateHistoricalDataset(input.dataset);

  return deepFreeze(cloneHistoricalDataset(input.dataset));
}

/**
 * Produces a new immutable aggregate with an updated lifecycle status.
 *
 * The input aggregate remains unchanged.
 */
export function transitionHistoricalDatasetStatus(
  input: TransitionHistoricalDatasetStatusInput,
): HistoricalDataset {
  const { dataset, nextStatus, updatedAt } = input;

  validateHistoricalDataset(dataset);
  validateStatusTransition(dataset.status, nextStatus);
  validateUpdatedAt(
    dataset.metadata.createdAt,
    dataset.metadata.updatedAt,
    updatedAt,
  );

  return deepFreeze({
    ...cloneHistoricalDataset(dataset),
    status: nextStatus,
    metadata: {
      ...cloneHistoricalDatasetMetadata(dataset.metadata),
      updatedAt,
    },
  });
}

/**
 * Returns true when the requested lifecycle transition is allowed.
 */
export function canTransitionHistoricalDatasetStatus(
  currentStatus: HistoricalDatasetStatus,
  nextStatus: HistoricalDatasetStatus,
): boolean {
  return (
    HISTORICAL_DATASET_STATUS_TRANSITIONS[currentStatus] as readonly
      HistoricalDatasetStatus[]
  ).includes(nextStatus);
}

/**
 * Validates a complete historical dataset aggregate.
 */
export function validateHistoricalDataset(
  dataset: HistoricalDataset,
): void {
  if (dataset.id !== dataset.metadata.datasetId) {
    throw new HistoricalDatasetDomainError(
      "INVALID_METADATA_ATTRIBUTE",
      "Dataset ID must match metadata dataset ID.",
    );
  }

  if (dataset.version !== dataset.metadata.version) {
    throw new HistoricalDatasetDomainError(
      "INVALID_VERSION",
      "Dataset version must match metadata version.",
    );
  }

  validateTimeRange(dataset.metadata.range);

  validateTimestampOrder(
    dataset.metadata.createdAt,
    dataset.metadata.updatedAt,
  );

  if (
    !Number.isSafeInteger(dataset.metadata.recordCount) ||
    dataset.metadata.recordCount < 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_RECORD_COUNT",
      "Dataset record count must be a non-negative safe integer.",
    );
  }

  validateOptionalString(
    dataset.metadata.description,
    "description",
    "INVALID_DESCRIPTION",
  );

  validateOptionalString(
    dataset.metadata.externalReference,
    "external reference",
    "INVALID_EXTERNAL_REFERENCE",
  );

  if (dataset.metadata.attributes !== undefined) {
    validateMetadataAttributes(dataset.metadata.attributes);
  }

  if (
    dataset.storage.location !== undefined &&
    dataset.storage.location.trim().length === 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_STORAGE_LOCATION",
      "Dataset storage location must not be empty.",
    );
  }

  for (const partition of dataset.storage.partitions) {
    if (partition.datasetId !== dataset.id) {
      throw new HistoricalDatasetDomainError(
        "INVALID_METADATA_ATTRIBUTE",
        `Partition "${partition.id}" belongs to another dataset.`,
      );
    }

    validateTimeRange(partition.range);

    if (
      !Number.isSafeInteger(partition.ordinal) ||
      partition.ordinal < 0
    ) {
      throw new HistoricalDatasetDomainError(
        "INVALID_METADATA_ATTRIBUTE",
        `Partition "${partition.id}" has an invalid ordinal.`,
      );
    }

    if (partition.firstSequence > partition.lastSequence) {
      throw new HistoricalDatasetDomainError(
        "INVALID_METADATA_ATTRIBUTE",
        `Partition "${partition.id}" has an invalid sequence range.`,
      );
    }

    if (
      !Number.isSafeInteger(partition.recordCount) ||
      partition.recordCount < 0
    ) {
      throw new HistoricalDatasetDomainError(
        "INVALID_RECORD_COUNT",
        `Partition "${partition.id}" has an invalid record count.`,
      );
    }

    if (
      partition.location !== undefined &&
      partition.location.trim().length === 0
    ) {
      throw new HistoricalDatasetDomainError(
        "INVALID_STORAGE_LOCATION",
        `Partition "${partition.id}" has an empty storage location.`,
      );
    }
  }
}

/**
 * Validates dataset creation input.
 */
function validateCreateHistoricalDatasetInput(
  input: CreateHistoricalDatasetInput,
): void {
  validateTimeRange(input.range);

  if (
    !Number.isSafeInteger(input.version) ||
    input.version <= 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_VERSION",
      "Dataset version must be a positive safe integer.",
    );
  }

  if (
    !Number.isSafeInteger(input.recordCount) ||
    input.recordCount < 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_RECORD_COUNT",
      "Dataset record count must be a non-negative safe integer.",
    );
  }

  validateOptionalString(
    input.description,
    "description",
    "INVALID_DESCRIPTION",
  );

  validateOptionalString(
    input.externalReference,
    "external reference",
    "INVALID_EXTERNAL_REFERENCE",
  );

  if (input.attributes !== undefined) {
    validateMetadataAttributes(input.attributes);
  }
}

/**
 * Validates an inclusive dataset time range.
 */
function validateTimeRange(
  range: HistoricalDatasetTimeRange,
): void {
  if (
    !Number.isSafeInteger(range.startTime) ||
    range.startTime < 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIME_RANGE",
      "Dataset start time must be a non-negative safe integer.",
    );
  }

  if (
    !Number.isSafeInteger(range.endTime) ||
    range.endTime < 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIME_RANGE",
      "Dataset end time must be a non-negative safe integer.",
    );
  }

  if (range.startTime > range.endTime) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIME_RANGE",
      "Dataset start time must not be after its end time.",
    );
  }
}

/**
 * Validates creation and update timestamp ordering.
 */
function validateTimestampOrder(
  createdAt: HistoricalTimestamp,
  updatedAt: HistoricalTimestamp,
): void {
  if (
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIMESTAMP_ORDER",
      "Dataset timestamps must be non-negative safe integers.",
    );
  }

  if (updatedAt < createdAt) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIMESTAMP_ORDER",
      "Dataset updated timestamp must not precede creation.",
    );
  }
}

/**
 * Validates the timestamp supplied during a state transition.
 */
function validateUpdatedAt(
  createdAt: HistoricalTimestamp,
  previousUpdatedAt: HistoricalTimestamp,
  updatedAt: HistoricalTimestamp,
): void {
  validateTimestampOrder(createdAt, updatedAt);

  if (updatedAt < previousUpdatedAt) {
    throw new HistoricalDatasetDomainError(
      "INVALID_TIMESTAMP_ORDER",
      "Dataset updated timestamp must not move backwards.",
    );
  }
}

/**
 * Validates a lifecycle transition.
 */
function validateStatusTransition(
  currentStatus: HistoricalDatasetStatus,
  nextStatus: HistoricalDatasetStatus,
): void {
  if (
    !canTransitionHistoricalDatasetStatus(
      currentStatus,
      nextStatus,
    )
  ) {
    throw new HistoricalDatasetDomainError(
      "INVALID_STATUS_TRANSITION",
      `Historical dataset cannot transition from ${currentStatus} to ${nextStatus}.`,
    );
  }
}

/**
 * Validates optional human-readable fields.
 */
function validateOptionalString(
  value: string | undefined,
  fieldName: string,
  errorCode:
    | "INVALID_DESCRIPTION"
    | "INVALID_EXTERNAL_REFERENCE",
): void {
  if (value === undefined) {
    return;
  }

  if (value.trim().length === 0) {
    throw new HistoricalDatasetDomainError(
      errorCode,
      `Dataset ${fieldName} must not be empty when provided.`,
    );
  }
}

/**
 * Validates custom metadata attributes recursively.
 */
function validateMetadataAttributes(
  attributes: HistoricalMetadataAttributes,
): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (key.trim().length === 0) {
      throw new HistoricalDatasetDomainError(
        "INVALID_METADATA_ATTRIBUTE",
        "Dataset metadata attribute keys must not be empty.",
      );
    }

    validateMetadataValue(value, key);
  }
}

/**
 * Validates a deterministic JSON-compatible metadata value.
 */
function validateMetadataValue(
  value: HistoricalMetadataValue,
  path: string,
): void {
  if (value === null) {
    return;
  }

  if (typeof value === "string") {
    return;
  }

  if (typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new HistoricalDatasetDomainError(
        "INVALID_METADATA_ATTRIBUTE",
        `Metadata attribute "${path}" must contain only finite numbers.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateMetadataValue(item, `${path}[${index}]`);
    });

    return;
  }

  if (typeof value === "object") {
    for (const [key, childValue] of Object.entries(value)) {
      if (key.trim().length === 0) {
        throw new HistoricalDatasetDomainError(
          "INVALID_METADATA_ATTRIBUTE",
          `Metadata attribute "${path}" contains an empty key.`,
        );
      }

      validateMetadataValue(childValue, `${path}.${key}`);
    }

    return;
  }

  throw new HistoricalDatasetDomainError(
    "INVALID_METADATA_ATTRIBUTE",
    `Metadata attribute "${path}" contains an unsupported value.`,
  );
}

/**
 * Creates a defensive immutable copy of a time range.
 */
function createImmutableTimeRange(
  range: HistoricalDatasetTimeRange,
): HistoricalDatasetTimeRange {
  return Object.freeze({
    startTime: range.startTime,
    endTime: range.endTime,
  });
}

/**
 * Clones an aggregate while preserving all domain values.
 */
function cloneHistoricalDataset(
  dataset: HistoricalDataset,
): HistoricalDataset {
  return {
    id: dataset.id,
    version: dataset.version,
    status: dataset.status,
    metadata: cloneHistoricalDatasetMetadata(dataset.metadata),
    storage: {
      encoding: dataset.storage.encoding,
      partitionStrategy: dataset.storage.partitionStrategy,
      ...(dataset.storage.location === undefined
        ? {}
        : {
            location: dataset.storage.location,
          }),
      partitions: dataset.storage.partitions.map((partition) => ({
        id: partition.id,
        datasetId: partition.datasetId,
        ordinal: partition.ordinal,
        strategy: partition.strategy,
        range: {
          startTime: partition.range.startTime,
          endTime: partition.range.endTime,
        },
        firstSequence: partition.firstSequence,
        lastSequence: partition.lastSequence,
        recordCount: partition.recordCount,
        ...(partition.location === undefined
          ? {}
          : {
              location: partition.location,
            }),
        ...(partition.checksum === undefined
          ? {}
          : {
              checksum: {
                algorithm: partition.checksum.algorithm,
                value: partition.checksum.value,
                calculatedAt:
                  partition.checksum.calculatedAt,
                recordCount:
                  partition.checksum.recordCount,
              },
            }),
      })),
    },
    ...(dataset.checksum === undefined
      ? {}
      : {
          checksum: {
            algorithm: dataset.checksum.algorithm,
            value: dataset.checksum.value,
            calculatedAt: dataset.checksum.calculatedAt,
            recordCount: dataset.checksum.recordCount,
          },
        }),
  };
}

/**
 * Clones dataset metadata.
 */
function cloneHistoricalDatasetMetadata(
  metadata: HistoricalDatasetMetadata,
): HistoricalDatasetMetadata {
  return {
    datasetId: metadata.datasetId,
    version: metadata.version,
    source: metadata.source,
    origin: metadata.origin,
    marketType: metadata.marketType,
    symbol: metadata.symbol,
    timeframe: metadata.timeframe,
    range: {
      startTime: metadata.range.startTime,
      endTime: metadata.range.endTime,
    },
    recordCount: historicalCount(metadata.recordCount),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    ...(metadata.externalReference === undefined
      ? {}
      : {
          externalReference: metadata.externalReference,
        }),
    ...(metadata.description === undefined
      ? {}
      : {
          description: metadata.description,
        }),
    ...(metadata.attributes === undefined
      ? {}
      : {
          attributes: cloneMetadataAttributes(
            metadata.attributes,
          ),
        }),
  };
}

/**
 * Creates a defensive copy of metadata attributes.
 */
function cloneMetadataAttributes(
  attributes: HistoricalMetadataAttributes,
): HistoricalMetadataAttributes {
  const cloned: Record<string, HistoricalMetadataValue> = {};

  for (const [key, value] of Object.entries(attributes)) {
    cloned[key] = cloneMetadataValue(value);
  }

  return cloned;
}

/**
 * Creates an immutable defensive copy of metadata attributes.
 */
function cloneAndFreezeMetadataAttributes(
  attributes: HistoricalMetadataAttributes,
): HistoricalMetadataAttributes {
  return deepFreeze(cloneMetadataAttributes(attributes));
}

/**
 * Recursively clones a JSON-compatible metadata value.
 */
function cloneMetadataValue(
  value: HistoricalMetadataValue,
): HistoricalMetadataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneMetadataValue(item));
  }

  const cloned: Record<string, HistoricalMetadataValue> = {};

  for (const [key, childValue] of Object.entries(value)) {
    cloned[key] = cloneMetadataValue(childValue);
  }

  return cloned;
}

/**
 * Recursively freezes arrays and plain objects.
 *
 * Branded primitives and scalar values are returned unchanged.
 */
function deepFreeze<T>(value: T): Readonly<T> {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const childValue of Object.values(value)) {
    deepFreeze(childValue);
  }

  return Object.freeze(value);
}