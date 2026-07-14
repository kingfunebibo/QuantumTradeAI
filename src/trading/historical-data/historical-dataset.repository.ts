import {
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetIndexKey,
  HistoricalDatasetPage,
  HistoricalDatasetQuery,
  HistoricalDatasetSort,
  HistoricalDatasetVersion,
} from "./historical-dataset.types";

/**
 * Repository error codes for historical dataset persistence operations.
 */
export const HISTORICAL_DATASET_REPOSITORY_ERROR_CODES = [
  "DATASET_NOT_FOUND",
  "DATASET_ALREADY_EXISTS",
  "DATASET_VERSION_CONFLICT",
  "INVALID_QUERY",
  "INVALID_PAGINATION",
  "PERSISTENCE_FAILURE",
] as const;

export type HistoricalDatasetRepositoryErrorCode =
  (typeof HISTORICAL_DATASET_REPOSITORY_ERROR_CODES)[number];

/**
 * Error thrown by historical dataset repository implementations.
 */
export class HistoricalDatasetRepositoryError extends Error {
  public readonly code: HistoricalDatasetRepositoryErrorCode;
  public readonly datasetId?: HistoricalDatasetId;

  public constructor(
    code: HistoricalDatasetRepositoryErrorCode,
    message: string,
    datasetId?: HistoricalDatasetId,
  ) {
    super(message);

    this.name = "HistoricalDatasetRepositoryError";
    this.code = code;
    this.datasetId = datasetId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Input for retrieving a specific dataset revision.
 */
export interface FindHistoricalDatasetByIdInput {
  readonly id: HistoricalDatasetId;

  /**
   * When omitted, the repository should return the highest available version.
   */
  readonly version?: HistoricalDatasetVersion;
}

/**
 * Input for determining whether a dataset revision exists.
 */
export interface HistoricalDatasetExistsInput {
  readonly id: HistoricalDatasetId;
  readonly version?: HistoricalDatasetVersion;
}

/**
 * Input for locating a dataset through its logical index fields.
 */
export interface FindHistoricalDatasetByIndexInput {
  readonly key: HistoricalDatasetIndexKey;

  /**
   * When multiple datasets match and the key does not include a version,
   * the repository must return the highest version deterministically.
   */
  readonly latestOnly?: boolean;
}

/**
 * Input for a deterministic paginated dataset query.
 */
export interface QueryHistoricalDatasetsInput {
  readonly query?: HistoricalDatasetQuery;

  /**
   * Repository implementations must apply this sort exactly.
   *
   * When omitted, implementations must use their documented deterministic
   * default ordering.
   */
  readonly sort?: readonly HistoricalDatasetSort[];
}

/**
 * Input for saving a dataset.
 */
export interface SaveHistoricalDatasetInput {
  readonly dataset: HistoricalDataset;

  /**
   * Optional optimistic concurrency version.
   *
   * When supplied, the repository must reject the write if the persisted
   * dataset version does not equal this value.
   */
  readonly expectedVersion?: HistoricalDatasetVersion;
}

/**
 * Result returned after saving a dataset.
 */
export interface SaveHistoricalDatasetResult {
  readonly dataset: HistoricalDataset;
  readonly created: boolean;
}

/**
 * Input for deleting one immutable dataset revision.
 */
export interface DeleteHistoricalDatasetInput {
  readonly id: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;
}

/**
 * Result returned after deleting a dataset revision.
 */
export interface DeleteHistoricalDatasetResult {
  readonly deleted: boolean;
  readonly dataset?: HistoricalDataset;
}

/**
 * Input for retrieving all versions associated with one dataset ID.
 */
export interface FindHistoricalDatasetVersionsInput {
  readonly id: HistoricalDatasetId;
}

/**
 * Result describing all known versions of a dataset.
 */
export interface HistoricalDatasetVersionCollection {
  readonly id: HistoricalDatasetId;
  readonly versions: readonly HistoricalDatasetVersion[];
  readonly datasets: readonly HistoricalDataset[];
}

/**
 * Persistence abstraction for historical dataset aggregates.
 *
 * Implementations may store datasets in memory, a relational database,
 * object storage, or another durable system.
 *
 * Repository guarantees:
 *
 * - Returned aggregates must be immutable defensive copies.
 * - Results must be deterministically ordered.
 * - Dataset ID and version form the persistence identity.
 * - Save operations must not mutate input aggregates.
 * - Query pagination must remain stable for identical repository state.
 * - Version conflicts must be explicit and never silently overwritten.
 */
export interface HistoricalDatasetRepository {
  /**
   * Saves a new dataset revision or replaces an existing revision when
   * optimistic concurrency requirements are satisfied.
   */
  save(
    input: SaveHistoricalDatasetInput,
  ): Promise<SaveHistoricalDatasetResult>;

  /**
   * Retrieves a dataset by ID and optional version.
   *
   * Returns undefined when no matching dataset exists.
   */
  findById(
    input: FindHistoricalDatasetByIdInput,
  ): Promise<HistoricalDataset | undefined>;

  /**
   * Retrieves a dataset using its logical index fields.
   */
  findByIndex(
    input: FindHistoricalDatasetByIndexInput,
  ): Promise<HistoricalDataset | undefined>;

  /**
   * Returns all stored versions for one dataset ID in ascending version order.
   */
  findVersions(
    input: FindHistoricalDatasetVersionsInput,
  ): Promise<HistoricalDatasetVersionCollection>;

  /**
   * Executes a filtered, paginated, deterministically ordered query.
   */
  query(
    input?: QueryHistoricalDatasetsInput,
  ): Promise<HistoricalDatasetPage>;

  /**
   * Returns whether a dataset or dataset revision exists.
   */
  exists(
    input: HistoricalDatasetExistsInput,
  ): Promise<boolean>;

  /**
   * Deletes one immutable dataset revision.
   *
   * Returns deleted=false when the revision does not exist.
   */
  delete(
    input: DeleteHistoricalDatasetInput,
  ): Promise<DeleteHistoricalDatasetResult>;

  /**
   * Returns the total number of stored dataset revisions.
   */
  count(): Promise<number>;

  /**
   * Removes every dataset revision from the repository.
   *
   * This operation is primarily intended for deterministic test isolation.
   */
  clear(): Promise<void>;
}

/**
 * Default deterministic repository query configuration.
 */
export const DEFAULT_HISTORICAL_DATASET_QUERY_LIMIT = 100;
export const MAX_HISTORICAL_DATASET_QUERY_LIMIT = 10_000;

export const DEFAULT_HISTORICAL_DATASET_SORT:
  readonly HistoricalDatasetSort[] = Object.freeze([
    Object.freeze({
      field: "CREATED_AT",
      direction: "ASC",
    }),
    Object.freeze({
      field: "VERSION",
      direction: "ASC",
    }),
  ]);

/**
 * Validates and normalizes repository pagination.
 */
export function normalizeHistoricalDatasetPagination(
  query: HistoricalDatasetQuery | undefined,
): Readonly<{
  limit: number;
  offset: number;
}> {
  const limit =
    query?.limit ?? DEFAULT_HISTORICAL_DATASET_QUERY_LIMIT;

  const offset = query?.offset ?? 0;

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new HistoricalDatasetRepositoryError(
      "INVALID_PAGINATION",
      "Historical dataset query limit must be a positive safe integer.",
    );
  }

  if (limit > MAX_HISTORICAL_DATASET_QUERY_LIMIT) {
    throw new HistoricalDatasetRepositoryError(
      "INVALID_PAGINATION",
      `Historical dataset query limit must not exceed ${MAX_HISTORICAL_DATASET_QUERY_LIMIT}.`,
    );
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new HistoricalDatasetRepositoryError(
      "INVALID_PAGINATION",
      "Historical dataset query offset must be a non-negative safe integer.",
    );
  }

  return Object.freeze({
    limit,
    offset,
  });
}

/**
 * Validates a repository query without changing it.
 */
export function validateHistoricalDatasetQuery(
  query: HistoricalDatasetQuery | undefined,
): void {
  normalizeHistoricalDatasetPagination(query);

  if (
    query?.overlappingRange !== undefined &&
    query.overlappingRange.startTime >
      query.overlappingRange.endTime
  ) {
    throw new HistoricalDatasetRepositoryError(
      "INVALID_QUERY",
      "Historical dataset query start time must not be after its end time.",
    );
  }

  validateOptionalArray(query?.ids, "ids");
  validateOptionalArray(query?.sources, "sources");
  validateOptionalArray(query?.marketTypes, "marketTypes");
  validateOptionalArray(query?.symbols, "symbols");
  validateOptionalArray(query?.timeframes, "timeframes");
  validateOptionalArray(query?.statuses, "statuses");
  validateOptionalArray(query?.origins, "origins");
}

/**
 * Validates deterministic repository sort definitions.
 */
export function normalizeHistoricalDatasetSort(
  sort: readonly HistoricalDatasetSort[] | undefined,
): readonly HistoricalDatasetSort[] {
  const selectedSort =
    sort === undefined || sort.length === 0
      ? DEFAULT_HISTORICAL_DATASET_SORT
      : sort;

  const seenFields = new Set<string>();

  for (const sortEntry of selectedSort) {
    if (seenFields.has(sortEntry.field)) {
      throw new HistoricalDatasetRepositoryError(
        "INVALID_QUERY",
        `Historical dataset sort field "${sortEntry.field}" was provided more than once.`,
      );
    }

    seenFields.add(sortEntry.field);
  }

  return Object.freeze(
    selectedSort.map((sortEntry) =>
      Object.freeze({
        field: sortEntry.field,
        direction: sortEntry.direction,
      }),
    ),
  );
}

/**
 * Produces the canonical persistence key for a dataset revision.
 */
export function createHistoricalDatasetRepositoryKey(
  id: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
): string {
  return `${id}::v${version}`;
}

function validateOptionalArray<T>(
  values: readonly T[] | undefined,
  fieldName: string,
): void {
  if (values === undefined) {
    return;
  }

  if (values.length === 0) {
    throw new HistoricalDatasetRepositoryError(
      "INVALID_QUERY",
      `Historical dataset query field "${fieldName}" must not be an empty array.`,
    );
  }
}