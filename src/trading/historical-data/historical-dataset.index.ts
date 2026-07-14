import {
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetStatus,
  HistoricalDatasetVersion,
  HistoricalMarketSymbol,
  HistoricalMarketType,
  HistoricalDataSource,
  HistoricalTimeframe,
  HistoricalTimestamp,
} from "./historical-dataset.types";

/**
 * Stable identifier for one indexed dataset revision.
 */
export type HistoricalDatasetIndexEntryKey = string;

/**
 * Error codes produced by the historical dataset index.
 */
export const HISTORICAL_DATASET_INDEX_ERROR_CODES = [
  "ENTRY_ALREADY_EXISTS",
  "ENTRY_NOT_FOUND",
  "INVALID_ENTRY",
  "INVALID_QUERY",
] as const;

export type HistoricalDatasetIndexErrorCode =
  (typeof HISTORICAL_DATASET_INDEX_ERROR_CODES)[number];

/**
 * Error thrown by historical dataset index implementations.
 */
export class HistoricalDatasetIndexError extends Error {
  public readonly code: HistoricalDatasetIndexErrorCode;
  public readonly datasetId?: HistoricalDatasetId;
  public readonly version?: HistoricalDatasetVersion;

  public constructor(
    code: HistoricalDatasetIndexErrorCode,
    message: string,
    options: Readonly<{
      datasetId?: HistoricalDatasetId;
      version?: HistoricalDatasetVersion;
    }> = {},
  ) {
    super(message);

    this.name = "HistoricalDatasetIndexError";
    this.code = code;
    this.datasetId = options.datasetId;
    this.version = options.version;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Immutable index entry representing one historical dataset revision.
 */
export interface HistoricalDatasetIndexEntry {
  readonly key: HistoricalDatasetIndexEntryKey;

  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly source: HistoricalDataSource;
  readonly marketType: HistoricalMarketType;
  readonly symbol: HistoricalMarketSymbol;
  readonly timeframe: HistoricalTimeframe;
  readonly status: HistoricalDatasetStatus;

  readonly startTime: HistoricalTimestamp;
  readonly endTime: HistoricalTimestamp;

  readonly createdAt: HistoricalTimestamp;
  readonly updatedAt: HistoricalTimestamp;
}

/**
 * Input used to find one exact indexed dataset revision.
 */
export interface FindHistoricalDatasetIndexEntryInput {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;
}

/**
 * Input used to remove one exact indexed dataset revision.
 */
export interface RemoveHistoricalDatasetIndexEntryInput {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;
}

/**
 * Supported index query ordering fields.
 */
export const HISTORICAL_DATASET_INDEX_SORT_FIELDS = [
  "DATASET_ID",
  "VERSION",
  "START_TIME",
  "END_TIME",
  "CREATED_AT",
  "UPDATED_AT",
] as const;

export type HistoricalDatasetIndexSortField =
  (typeof HISTORICAL_DATASET_INDEX_SORT_FIELDS)[number];

export type HistoricalDatasetIndexSortDirection =
  | "ASC"
  | "DESC";

export interface HistoricalDatasetIndexSort {
  readonly field: HistoricalDatasetIndexSortField;
  readonly direction: HistoricalDatasetIndexSortDirection;
}

/**
 * Query for indexed dataset revisions.
 */
export interface HistoricalDatasetIndexQuery {
  readonly datasetIds?: readonly HistoricalDatasetId[];
  readonly versions?: readonly HistoricalDatasetVersion[];

  readonly sources?: readonly HistoricalDataSource[];
  readonly marketTypes?: readonly HistoricalMarketType[];
  readonly symbols?: readonly HistoricalMarketSymbol[];
  readonly timeframes?: readonly HistoricalTimeframe[];
  readonly statuses?: readonly HistoricalDatasetStatus[];

  /**
   * Returns entries whose inclusive ranges overlap this range.
   */
  readonly overlappingRange?: Readonly<{
    startTime: HistoricalTimestamp;
    endTime: HistoricalTimestamp;
  }>;

  readonly sort?: readonly HistoricalDatasetIndexSort[];

  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Immutable paginated index query result.
 */
export interface HistoricalDatasetIndexPage {
  readonly items: readonly HistoricalDatasetIndexEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

/**
 * Historical dataset index abstraction.
 */
export interface HistoricalDatasetIndex {
  add(dataset: HistoricalDataset): void;

  replace(dataset: HistoricalDataset): void;

  find(
    input: FindHistoricalDatasetIndexEntryInput,
  ): HistoricalDatasetIndexEntry | undefined;

  query(
    query?: HistoricalDatasetIndexQuery,
  ): HistoricalDatasetIndexPage;

  remove(
    input: RemoveHistoricalDatasetIndexEntryInput,
  ): HistoricalDatasetIndexEntry | undefined;

  has(
    input: FindHistoricalDatasetIndexEntryInput,
  ): boolean;

  count(): number;

  clear(): void;
}

export const DEFAULT_HISTORICAL_DATASET_INDEX_LIMIT = 100;

export const MAX_HISTORICAL_DATASET_INDEX_LIMIT = 10_000;

export const DEFAULT_HISTORICAL_DATASET_INDEX_SORT:
  readonly HistoricalDatasetIndexSort[] = Object.freeze([
    Object.freeze({
      field: "DATASET_ID",
      direction: "ASC",
    }),
    Object.freeze({
      field: "VERSION",
      direction: "ASC",
    }),
  ]);

/**
 * Deterministic in-memory dataset index.
 *
 * This structure is deliberately independent of repository persistence so it
 * can later support database repositories, object storage, import catalogues,
 * and distributed dataset discovery.
 */
export class InMemoryHistoricalDatasetIndex
  implements HistoricalDatasetIndex
{
  private readonly entries =
    new Map<
      HistoricalDatasetIndexEntryKey,
      HistoricalDatasetIndexEntry
    >();

  private readonly keysBySource =
    new Map<string, Set<HistoricalDatasetIndexEntryKey>>();

  private readonly keysByMarketType =
    new Map<
      HistoricalMarketType,
      Set<HistoricalDatasetIndexEntryKey>
    >();

  private readonly keysBySymbol =
    new Map<string, Set<HistoricalDatasetIndexEntryKey>>();

  private readonly keysByTimeframe =
    new Map<
      HistoricalTimeframe,
      Set<HistoricalDatasetIndexEntryKey>
    >();

  private readonly keysByStatus =
    new Map<
      HistoricalDatasetStatus,
      Set<HistoricalDatasetIndexEntryKey>
    >();

  public add(dataset: HistoricalDataset): void {
    validateHistoricalDatasetIndexSource(dataset);

    const entry = createHistoricalDatasetIndexEntry(
      dataset,
    );

    if (this.entries.has(entry.key)) {
      throw new HistoricalDatasetIndexError(
        "ENTRY_ALREADY_EXISTS",
        `Historical dataset index entry "${entry.key}" already exists.`,
        {
          datasetId: entry.datasetId,
          version: entry.version,
        },
      );
    }

    this.storeEntry(entry);
  }

  public replace(dataset: HistoricalDataset): void {
    validateHistoricalDatasetIndexSource(dataset);

    const entry = createHistoricalDatasetIndexEntry(
      dataset,
    );

    const existing = this.entries.get(entry.key);

    if (existing !== undefined) {
      this.removeSecondaryIndexes(existing);
    }

    this.entries.set(entry.key, entry);
    this.addSecondaryIndexes(entry);
  }

  public find(
    input: FindHistoricalDatasetIndexEntryInput,
  ): HistoricalDatasetIndexEntry | undefined {
    const key = createHistoricalDatasetIndexEntryKey(
      input.datasetId,
      input.version,
    );

    const entry = this.entries.get(key);

    return entry === undefined
      ? undefined
      : cloneHistoricalDatasetIndexEntry(entry);
  }

  public query(
    query: HistoricalDatasetIndexQuery = {},
  ): HistoricalDatasetIndexPage {
    validateHistoricalDatasetIndexQuery(query);

    const limit =
      query.limit ??
      DEFAULT_HISTORICAL_DATASET_INDEX_LIMIT;

    const offset = query.offset ?? 0;

    const sort = normalizeHistoricalDatasetIndexSort(
      query.sort,
    );

    const candidateKeys =
      this.resolveCandidateKeys(query);

    const matchingEntries: HistoricalDatasetIndexEntry[] =
      [];

    for (const key of candidateKeys) {
      const entry = this.entries.get(key);

      if (
        entry !== undefined &&
        matchesHistoricalDatasetIndexQuery(
          entry,
          query,
        )
      ) {
        matchingEntries.push(entry);
      }
    }

    matchingEntries.sort(
      createHistoricalDatasetIndexComparator(sort),
    );

    const total = matchingEntries.length;

    const items = matchingEntries
      .slice(offset, offset + limit)
      .map(cloneHistoricalDatasetIndexEntry);

    return Object.freeze({
      items: Object.freeze(items),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  }

  public remove(
    input: RemoveHistoricalDatasetIndexEntryInput,
  ): HistoricalDatasetIndexEntry | undefined {
    const key = createHistoricalDatasetIndexEntryKey(
      input.datasetId,
      input.version,
    );

    const existing = this.entries.get(key);

    if (existing === undefined) {
      return undefined;
    }

    this.entries.delete(key);
    this.removeSecondaryIndexes(existing);

    return cloneHistoricalDatasetIndexEntry(existing);
  }

  public has(
    input: FindHistoricalDatasetIndexEntryInput,
  ): boolean {
    return this.entries.has(
      createHistoricalDatasetIndexEntryKey(
        input.datasetId,
        input.version,
      ),
    );
  }

  public count(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
    this.keysBySource.clear();
    this.keysByMarketType.clear();
    this.keysBySymbol.clear();
    this.keysByTimeframe.clear();
    this.keysByStatus.clear();
  }

  private storeEntry(
    entry: HistoricalDatasetIndexEntry,
  ): void {
    this.entries.set(entry.key, entry);
    this.addSecondaryIndexes(entry);
  }

  private addSecondaryIndexes(
    entry: HistoricalDatasetIndexEntry,
  ): void {
    addIndexValue(
      this.keysBySource,
      String(entry.source),
      entry.key,
    );

    addIndexValue(
      this.keysByMarketType,
      entry.marketType,
      entry.key,
    );

    addIndexValue(
      this.keysBySymbol,
      String(entry.symbol),
      entry.key,
    );

    addIndexValue(
      this.keysByTimeframe,
      entry.timeframe,
      entry.key,
    );

    addIndexValue(
      this.keysByStatus,
      entry.status,
      entry.key,
    );
  }

  private removeSecondaryIndexes(
    entry: HistoricalDatasetIndexEntry,
  ): void {
    removeIndexValue(
      this.keysBySource,
      String(entry.source),
      entry.key,
    );

    removeIndexValue(
      this.keysByMarketType,
      entry.marketType,
      entry.key,
    );

    removeIndexValue(
      this.keysBySymbol,
      String(entry.symbol),
      entry.key,
    );

    removeIndexValue(
      this.keysByTimeframe,
      entry.timeframe,
      entry.key,
    );

    removeIndexValue(
      this.keysByStatus,
      entry.status,
      entry.key,
    );
  }

  /**
   * Uses the smallest available secondary-index candidate set to reduce
   * scanning while preserving deterministic query behaviour.
   */
  private resolveCandidateKeys(
    query: HistoricalDatasetIndexQuery,
  ): readonly HistoricalDatasetIndexEntryKey[] {
    const candidateSets: Set<HistoricalDatasetIndexEntryKey>[] =
      [];

    collectIndexCandidates(
      candidateSets,
      this.keysBySource,
      query.sources?.map(String),
    );

    collectIndexCandidates(
      candidateSets,
      this.keysByMarketType,
      query.marketTypes,
    );

    collectIndexCandidates(
      candidateSets,
      this.keysBySymbol,
      query.symbols?.map(String),
    );

    collectIndexCandidates(
      candidateSets,
      this.keysByTimeframe,
      query.timeframes,
    );

    collectIndexCandidates(
      candidateSets,
      this.keysByStatus,
      query.statuses,
    );

    if (candidateSets.length === 0) {
      return [...this.entries.keys()];
    }

    candidateSets.sort(
      (left, right) => left.size - right.size,
    );

    const smallestSet = candidateSets[0];

    return smallestSet === undefined
      ? []
      : [...smallestSet];
  }
}

/**
 * Creates a canonical index entry from a dataset aggregate.
 */
export function createHistoricalDatasetIndexEntry(
  dataset: HistoricalDataset,
): HistoricalDatasetIndexEntry {
  validateHistoricalDatasetIndexSource(dataset);

  return Object.freeze({
    key: createHistoricalDatasetIndexEntryKey(
      dataset.id,
      dataset.version,
    ),

    datasetId: dataset.id,
    version: dataset.version,

    source: dataset.metadata.source,
    marketType: dataset.metadata.marketType,
    symbol: dataset.metadata.symbol,
    timeframe: dataset.metadata.timeframe,
    status: dataset.status,

    startTime: dataset.metadata.range.startTime,
    endTime: dataset.metadata.range.endTime,

    createdAt: dataset.metadata.createdAt,
    updatedAt: dataset.metadata.updatedAt,
  });
}

/**
 * Creates a deterministic key for a dataset revision.
 */
export function createHistoricalDatasetIndexEntryKey(
  datasetId: HistoricalDatasetId,
  version: HistoricalDatasetVersion,
): HistoricalDatasetIndexEntryKey {
  return `${datasetId}::v${version}`;
}

function validateHistoricalDatasetIndexSource(
  dataset: HistoricalDataset,
): void {
  if (dataset.id !== dataset.metadata.datasetId) {
    throw new HistoricalDatasetIndexError(
      "INVALID_ENTRY",
      "Dataset ID must match metadata dataset ID before indexing.",
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }

  if (dataset.version !== dataset.metadata.version) {
    throw new HistoricalDatasetIndexError(
      "INVALID_ENTRY",
      "Dataset version must match metadata version before indexing.",
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }

  if (
    dataset.metadata.range.startTime >
    dataset.metadata.range.endTime
  ) {
    throw new HistoricalDatasetIndexError(
      "INVALID_ENTRY",
      "Dataset start time must not be after its end time.",
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }

  if (
    dataset.metadata.updatedAt <
    dataset.metadata.createdAt
  ) {
    throw new HistoricalDatasetIndexError(
      "INVALID_ENTRY",
      "Dataset updated timestamp must not precede creation.",
      {
        datasetId: dataset.id,
        version: dataset.version,
      },
    );
  }
}

function validateHistoricalDatasetIndexQuery(
  query: HistoricalDatasetIndexQuery,
): void {
  const limit =
    query.limit ??
    DEFAULT_HISTORICAL_DATASET_INDEX_LIMIT;

  const offset = query.offset ?? 0;

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new HistoricalDatasetIndexError(
      "INVALID_QUERY",
      "Historical dataset index limit must be a positive safe integer.",
    );
  }

  if (limit > MAX_HISTORICAL_DATASET_INDEX_LIMIT) {
    throw new HistoricalDatasetIndexError(
      "INVALID_QUERY",
      `Historical dataset index limit must not exceed ${MAX_HISTORICAL_DATASET_INDEX_LIMIT}.`,
    );
  }

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new HistoricalDatasetIndexError(
      "INVALID_QUERY",
      "Historical dataset index offset must be a non-negative safe integer.",
    );
  }

  validateOptionalQueryArray(
    query.datasetIds,
    "datasetIds",
  );

  validateOptionalQueryArray(
    query.versions,
    "versions",
  );

  validateOptionalQueryArray(
    query.sources,
    "sources",
  );

  validateOptionalQueryArray(
    query.marketTypes,
    "marketTypes",
  );

  validateOptionalQueryArray(
    query.symbols,
    "symbols",
  );

  validateOptionalQueryArray(
    query.timeframes,
    "timeframes",
  );

  validateOptionalQueryArray(
    query.statuses,
    "statuses",
  );

  if (
    query.overlappingRange !== undefined &&
    query.overlappingRange.startTime >
      query.overlappingRange.endTime
  ) {
    throw new HistoricalDatasetIndexError(
      "INVALID_QUERY",
      "Historical dataset index range start must not be after its end.",
    );
  }

  normalizeHistoricalDatasetIndexSort(
    query.sort,
  );
}

function validateOptionalQueryArray<T>(
  values: readonly T[] | undefined,
  fieldName: string,
): void {
  if (
    values !== undefined &&
    values.length === 0
  ) {
    throw new HistoricalDatasetIndexError(
      "INVALID_QUERY",
      `Historical dataset index query field "${fieldName}" must not be empty.`,
    );
  }
}

function normalizeHistoricalDatasetIndexSort(
  sort:
    | readonly HistoricalDatasetIndexSort[]
    | undefined,
): readonly HistoricalDatasetIndexSort[] {
  const normalizedSort =
    sort === undefined || sort.length === 0
      ? DEFAULT_HISTORICAL_DATASET_INDEX_SORT
      : sort;

  const seenFields =
    new Set<HistoricalDatasetIndexSortField>();

  for (const entry of normalizedSort) {
    if (seenFields.has(entry.field)) {
      throw new HistoricalDatasetIndexError(
        "INVALID_QUERY",
        `Historical dataset index sort field "${entry.field}" was provided more than once.`,
      );
    }

    seenFields.add(entry.field);
  }

  return Object.freeze(
    normalizedSort.map((entry) =>
      Object.freeze({
        field: entry.field,
        direction: entry.direction,
      }),
    ),
  );
}

function matchesHistoricalDatasetIndexQuery(
  entry: HistoricalDatasetIndexEntry,
  query: HistoricalDatasetIndexQuery,
): boolean {
  if (
    query.datasetIds !== undefined &&
    !query.datasetIds.includes(entry.datasetId)
  ) {
    return false;
  }

  if (
    query.versions !== undefined &&
    !query.versions.includes(entry.version)
  ) {
    return false;
  }

  if (
    query.sources !== undefined &&
    !query.sources.includes(entry.source)
  ) {
    return false;
  }

  if (
    query.marketTypes !== undefined &&
    !query.marketTypes.includes(entry.marketType)
  ) {
    return false;
  }

  if (
    query.symbols !== undefined &&
    !query.symbols.includes(entry.symbol)
  ) {
    return false;
  }

  if (
    query.timeframes !== undefined &&
    !query.timeframes.includes(entry.timeframe)
  ) {
    return false;
  }

  if (
    query.statuses !== undefined &&
    !query.statuses.includes(entry.status)
  ) {
    return false;
  }

  if (
    query.overlappingRange !== undefined &&
    !rangesOverlap(
      entry.startTime,
      entry.endTime,
      query.overlappingRange.startTime,
      query.overlappingRange.endTime,
    )
  ) {
    return false;
  }

  return true;
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return (
    leftStart <= rightEnd &&
    rightStart <= leftEnd
  );
}

function createHistoricalDatasetIndexComparator(
  sort: readonly HistoricalDatasetIndexSort[],
): (
  left: HistoricalDatasetIndexEntry,
  right: HistoricalDatasetIndexEntry,
) => number {
  return (
    left: HistoricalDatasetIndexEntry,
    right: HistoricalDatasetIndexEntry,
  ): number => {
    for (const sortEntry of sort) {
      const comparison =
        compareHistoricalDatasetIndexEntries(
          left,
          right,
          sortEntry,
        );

      if (comparison !== 0) {
        return comparison;
      }
    }

    const keyComparison = compareStrings(
      left.key,
      right.key,
    );

    return keyComparison;
  };
}

function compareHistoricalDatasetIndexEntries(
  left: HistoricalDatasetIndexEntry,
  right: HistoricalDatasetIndexEntry,
  sort: HistoricalDatasetIndexSort,
): number {
  const multiplier =
    sort.direction === "ASC" ? 1 : -1;

  switch (sort.field) {
    case "DATASET_ID":
      return (
        compareStrings(
          String(left.datasetId),
          String(right.datasetId),
        ) * multiplier
      );

    case "VERSION":
      return (
        compareNumbers(
          left.version,
          right.version,
        ) * multiplier
      );

    case "START_TIME":
      return (
        compareNumbers(
          left.startTime,
          right.startTime,
        ) * multiplier
      );

    case "END_TIME":
      return (
        compareNumbers(
          left.endTime,
          right.endTime,
        ) * multiplier
      );

    case "CREATED_AT":
      return (
        compareNumbers(
          left.createdAt,
          right.createdAt,
        ) * multiplier
      );

    case "UPDATED_AT":
      return (
        compareNumbers(
          left.updatedAt,
          right.updatedAt,
        ) * multiplier
      );

    default:
      return assertNever(sort.field);
  }
}

function collectIndexCandidates<TKey>(
  destination: Set<HistoricalDatasetIndexEntryKey>[],
  index: ReadonlyMap<
    TKey,
    Set<HistoricalDatasetIndexEntryKey>
  >,
  requestedValues: readonly TKey[] | undefined,
): void {
  if (requestedValues === undefined) {
    return;
  }

  const combined =
    new Set<HistoricalDatasetIndexEntryKey>();

  for (const value of requestedValues) {
    const matchingKeys = index.get(value);

    if (matchingKeys === undefined) {
      continue;
    }

    for (const key of matchingKeys) {
      combined.add(key);
    }
  }

  destination.push(combined);
}

function addIndexValue<TKey>(
  index: Map<
    TKey,
    Set<HistoricalDatasetIndexEntryKey>
  >,
  value: TKey,
  entryKey: HistoricalDatasetIndexEntryKey,
): void {
  let entryKeys = index.get(value);

  if (entryKeys === undefined) {
    entryKeys =
      new Set<HistoricalDatasetIndexEntryKey>();

    index.set(value, entryKeys);
  }

  entryKeys.add(entryKey);
}

function removeIndexValue<TKey>(
  index: Map<
    TKey,
    Set<HistoricalDatasetIndexEntryKey>
  >,
  value: TKey,
  entryKey: HistoricalDatasetIndexEntryKey,
): void {
  const entryKeys = index.get(value);

  if (entryKeys === undefined) {
    return;
  }

  entryKeys.delete(entryKey);

  if (entryKeys.size === 0) {
    index.delete(value);
  }
}

function cloneHistoricalDatasetIndexEntry(
  entry: HistoricalDatasetIndexEntry,
): HistoricalDatasetIndexEntry {
  return Object.freeze({
    key: entry.key,

    datasetId: entry.datasetId,
    version: entry.version,

    source: entry.source,
    marketType: entry.marketType,
    symbol: entry.symbol,
    timeframe: entry.timeframe,
    status: entry.status,

    startTime: entry.startTime,
    endTime: entry.endTime,

    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

function compareNumbers(
  left: number,
  right: number,
): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareStrings(
  left: string,
  right: string,
): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function assertNever(value: never): never {
  throw new HistoricalDatasetIndexError(
    "INVALID_QUERY",
    `Unsupported historical dataset index sort field: ${String(
      value,
    )}.`,
  );
}