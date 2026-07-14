import {
  HistoricalDataset,
  HistoricalDatasetId,
  HistoricalDatasetIndexKey,
  HistoricalDatasetPage,
  HistoricalDatasetQuery,
  HistoricalDatasetSort,
  HistoricalDatasetSortDirection,
  HistoricalDatasetSortField,
  HistoricalDatasetVersion,
  historicalCount,
} from "./historical-dataset.types";

import {
  restoreHistoricalDataset,
  validateHistoricalDataset,
} from "./historical-dataset";

import {
  createHistoricalDatasetRepositoryKey,
  DeleteHistoricalDatasetInput,
  DeleteHistoricalDatasetResult,
  FindHistoricalDatasetByIdInput,
  FindHistoricalDatasetByIndexInput,
  FindHistoricalDatasetVersionsInput,
  HistoricalDatasetExistsInput,
  HistoricalDatasetRepository,
  HistoricalDatasetRepositoryError,
  HistoricalDatasetVersionCollection,
  normalizeHistoricalDatasetPagination,
  normalizeHistoricalDatasetSort,
  QueryHistoricalDatasetsInput,
  SaveHistoricalDatasetInput,
  SaveHistoricalDatasetResult,
  validateHistoricalDatasetQuery,
} from "./historical-dataset.repository";

/**
 * Deterministic in-memory implementation of the historical dataset repository.
 *
 * The repository stores immutable defensive copies and returns newly restored
 * immutable copies for every read operation.
 */
export class InMemoryHistoricalDatasetRepository
  implements HistoricalDatasetRepository
{
  private readonly datasetsByKey =
    new Map<string, HistoricalDataset>();

  private readonly versionsByDatasetId =
    new Map<string, Set<number>>();

  private readonly keysByLogicalIndex =
    new Map<string, Set<string>>();

  public async save(
    input: SaveHistoricalDatasetInput,
  ): Promise<SaveHistoricalDatasetResult> {
    validateHistoricalDataset(input.dataset);

    const repositoryKey =
      createHistoricalDatasetRepositoryKey(
        input.dataset.id,
        input.dataset.version,
      );

    const existingDataset =
      this.datasetsByKey.get(repositoryKey);

    this.validateExpectedVersion(
      input.dataset,
      existingDataset,
      input.expectedVersion,
    );

    const storedDataset = restoreHistoricalDataset({
      dataset: input.dataset,
    });

    if (existingDataset !== undefined) {
      this.removeLogicalIndex(
        existingDataset,
        repositoryKey,
      );
    }

    this.datasetsByKey.set(
      repositoryKey,
      storedDataset,
    );

    this.addVersionIndex(storedDataset);

    this.addLogicalIndex(
      storedDataset,
      repositoryKey,
    );

    return Object.freeze({
      dataset: this.restoreForRead(storedDataset),
      created: existingDataset === undefined,
    });
  }

  public async findById(
    input: FindHistoricalDatasetByIdInput,
  ): Promise<HistoricalDataset | undefined> {
    if (input.version !== undefined) {
      const repositoryKey =
        createHistoricalDatasetRepositoryKey(
          input.id,
          input.version,
        );

      const dataset =
        this.datasetsByKey.get(repositoryKey);

      return dataset === undefined
        ? undefined
        : this.restoreForRead(dataset);
    }

    const latestVersion =
      this.findLatestVersion(input.id);

    if (latestVersion === undefined) {
      return undefined;
    }

    const repositoryKey =
      createHistoricalDatasetRepositoryKey(
        input.id,
        latestVersion,
      );

    const dataset =
      this.datasetsByKey.get(repositoryKey);

    return dataset === undefined
      ? undefined
      : this.restoreForRead(dataset);
  }

  public async findByIndex(
    input: FindHistoricalDatasetByIndexInput,
  ): Promise<HistoricalDataset | undefined> {
    const logicalIndexKey =
      this.createLogicalIndexKey(input.key);

    const repositoryKeys =
      this.keysByLogicalIndex.get(logicalIndexKey);

    if (repositoryKeys === undefined) {
      return undefined;
    }

    const matchingDatasets: HistoricalDataset[] = [];

    for (const repositoryKey of repositoryKeys) {
      const dataset =
        this.datasetsByKey.get(repositoryKey);

      if (dataset === undefined) {
        continue;
      }

      if (
        input.key.version !== undefined &&
        dataset.version !== input.key.version
      ) {
        continue;
      }

      matchingDatasets.push(dataset);
    }

    if (matchingDatasets.length === 0) {
      return undefined;
    }

    matchingDatasets.sort(
      compareHistoricalDatasetVersionDescending,
    );

    const selectedDataset = matchingDatasets[0];

    return selectedDataset === undefined
      ? undefined
      : this.restoreForRead(selectedDataset);
  }

  public async findVersions(
    input: FindHistoricalDatasetVersionsInput,
  ): Promise<HistoricalDatasetVersionCollection> {
    const storedVersions =
      this.versionsByDatasetId.get(
        String(input.id),
      );

    if (storedVersions === undefined) {
      return Object.freeze({
        id: input.id,
        versions: Object.freeze([]),
        datasets: Object.freeze([]),
      });
    }

    const versions = [...storedVersions]
      .sort((left, right) => left - right)
      .map(
        (version) =>
          version as HistoricalDatasetVersion,
      );

    const datasets: HistoricalDataset[] = [];

    for (const version of versions) {
      const repositoryKey =
        createHistoricalDatasetRepositoryKey(
          input.id,
          version,
        );

      const dataset =
        this.datasetsByKey.get(repositoryKey);

      if (dataset !== undefined) {
        datasets.push(
          this.restoreForRead(dataset),
        );
      }
    }

    return Object.freeze({
      id: input.id,
      versions: Object.freeze([...versions]),
      datasets: Object.freeze([...datasets]),
    });
  }

  public async query(
    input: QueryHistoricalDatasetsInput = {},
  ): Promise<HistoricalDatasetPage> {
    validateHistoricalDatasetQuery(input.query);

    const pagination =
      normalizeHistoricalDatasetPagination(
        input.query,
      );

    const sort =
      normalizeHistoricalDatasetSort(
        input.sort,
      );

    const matchingDatasets = [
      ...this.datasetsByKey.values(),
    ].filter((dataset) =>
      matchesHistoricalDatasetQuery(
        dataset,
        input.query,
      ),
    );

    matchingDatasets.sort(
      createHistoricalDatasetComparator(sort),
    );

    const total = matchingDatasets.length;

    const paginatedDatasets =
      matchingDatasets.slice(
        pagination.offset,
        pagination.offset + pagination.limit,
      );

    return Object.freeze({
      items: Object.freeze(
        paginatedDatasets.map((dataset) =>
          this.restoreForRead(dataset),
        ),
      ),
      total: historicalCount(total),
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore:
        pagination.offset +
          pagination.limit <
        total,
    });
  }

  public async exists(
    input: HistoricalDatasetExistsInput,
  ): Promise<boolean> {
    if (input.version !== undefined) {
      const repositoryKey =
        createHistoricalDatasetRepositoryKey(
          input.id,
          input.version,
        );

      return this.datasetsByKey.has(
        repositoryKey,
      );
    }

    const versions =
      this.versionsByDatasetId.get(
        String(input.id),
      );

    return (
      versions !== undefined &&
      versions.size > 0
    );
  }

  public async delete(
    input: DeleteHistoricalDatasetInput,
  ): Promise<DeleteHistoricalDatasetResult> {
    const repositoryKey =
      createHistoricalDatasetRepositoryKey(
        input.id,
        input.version,
      );

    const existingDataset =
      this.datasetsByKey.get(repositoryKey);

    if (existingDataset === undefined) {
      return Object.freeze({
        deleted: false,
      });
    }

    this.datasetsByKey.delete(repositoryKey);

    this.removeVersionIndex(existingDataset);

    this.removeLogicalIndex(
      existingDataset,
      repositoryKey,
    );

    return Object.freeze({
      deleted: true,
      dataset:
        this.restoreForRead(existingDataset),
    });
  }

  public async count(): Promise<number> {
    return this.datasetsByKey.size;
  }

  public async clear(): Promise<void> {
    this.datasetsByKey.clear();
    this.versionsByDatasetId.clear();
    this.keysByLogicalIndex.clear();
  }

  private validateExpectedVersion(
    incomingDataset: HistoricalDataset,
    existingDataset: HistoricalDataset | undefined,
    expectedVersion:
      | HistoricalDatasetVersion
      | undefined,
  ): void {
    if (expectedVersion === undefined) {
      return;
    }

    if (existingDataset === undefined) {
      throw new HistoricalDatasetRepositoryError(
        "DATASET_VERSION_CONFLICT",
        [
          `Historical dataset "${incomingDataset.id}"`,
          `version ${incomingDataset.version} does not exist.`,
          `Expected persisted version ${expectedVersion}.`,
        ].join(" "),
        incomingDataset.id,
      );
    }

    if (
      existingDataset.version !==
      expectedVersion
    ) {
      throw new HistoricalDatasetRepositoryError(
        "DATASET_VERSION_CONFLICT",
        [
          `Historical dataset "${incomingDataset.id}"`,
          "version conflict.",
          `Expected ${expectedVersion},`,
          `but persisted version is ${existingDataset.version}.`,
        ].join(" "),
        incomingDataset.id,
      );
    }
  }

  private addVersionIndex(
    dataset: HistoricalDataset,
  ): void {
    const datasetId = String(dataset.id);

    let versions =
      this.versionsByDatasetId.get(datasetId);

    if (versions === undefined) {
      versions = new Set<number>();

      this.versionsByDatasetId.set(
        datasetId,
        versions,
      );
    }

    versions.add(Number(dataset.version));
  }

  private removeVersionIndex(
    dataset: HistoricalDataset,
  ): void {
    const datasetId = String(dataset.id);

    const versions =
      this.versionsByDatasetId.get(datasetId);

    if (versions === undefined) {
      return;
    }

    versions.delete(Number(dataset.version));

    if (versions.size === 0) {
      this.versionsByDatasetId.delete(
        datasetId,
      );
    }
  }

  private addLogicalIndex(
    dataset: HistoricalDataset,
    repositoryKey: string,
  ): void {
    const logicalIndexKey =
      this.createLogicalIndexKey({
        source: dataset.metadata.source,
        marketType:
          dataset.metadata.marketType,
        symbol: dataset.metadata.symbol,
        timeframe:
          dataset.metadata.timeframe,
      });

    let repositoryKeys =
      this.keysByLogicalIndex.get(
        logicalIndexKey,
      );

    if (repositoryKeys === undefined) {
      repositoryKeys = new Set<string>();

      this.keysByLogicalIndex.set(
        logicalIndexKey,
        repositoryKeys,
      );
    }

    repositoryKeys.add(repositoryKey);
  }

  private removeLogicalIndex(
    dataset: HistoricalDataset,
    repositoryKey: string,
  ): void {
    const logicalIndexKey =
      this.createLogicalIndexKey({
        source: dataset.metadata.source,
        marketType:
          dataset.metadata.marketType,
        symbol: dataset.metadata.symbol,
        timeframe:
          dataset.metadata.timeframe,
      });

    const repositoryKeys =
      this.keysByLogicalIndex.get(
        logicalIndexKey,
      );

    if (repositoryKeys === undefined) {
      return;
    }

    repositoryKeys.delete(repositoryKey);

    if (repositoryKeys.size === 0) {
      this.keysByLogicalIndex.delete(
        logicalIndexKey,
      );
    }
  }

  private createLogicalIndexKey(
    key: HistoricalDatasetIndexKey,
  ): string {
    return [
      String(key.source),
      key.marketType,
      String(key.symbol),
      key.timeframe,
    ].join("::");
  }

  private findLatestVersion(
    id: HistoricalDatasetId,
  ): HistoricalDatasetVersion | undefined {
    const versions =
      this.versionsByDatasetId.get(
        String(id),
      );

    if (
      versions === undefined ||
      versions.size === 0
    ) {
      return undefined;
    }

    let latestVersion: number | undefined;

    for (const version of versions) {
      if (
        latestVersion === undefined ||
        version > latestVersion
      ) {
        latestVersion = version;
      }
    }

    return latestVersion as
      | HistoricalDatasetVersion
      | undefined;
  }

  private restoreForRead(
    dataset: HistoricalDataset,
  ): HistoricalDataset {
    return restoreHistoricalDataset({
      dataset,
    });
  }
}

function matchesHistoricalDatasetQuery(
  dataset: HistoricalDataset,
  query: HistoricalDatasetQuery | undefined,
): boolean {
  if (query === undefined) {
    return true;
  }

  if (
    query.ids !== undefined &&
    !query.ids.includes(dataset.id)
  ) {
    return false;
  }

  if (
    query.sources !== undefined &&
    !query.sources.includes(
      dataset.metadata.source,
    )
  ) {
    return false;
  }

  if (
    query.marketTypes !== undefined &&
    !query.marketTypes.includes(
      dataset.metadata.marketType,
    )
  ) {
    return false;
  }

  if (
    query.symbols !== undefined &&
    !query.symbols.includes(
      dataset.metadata.symbol,
    )
  ) {
    return false;
  }

  if (
    query.timeframes !== undefined &&
    !query.timeframes.includes(
      dataset.metadata.timeframe,
    )
  ) {
    return false;
  }

  if (
    query.statuses !== undefined &&
    !query.statuses.includes(dataset.status)
  ) {
    return false;
  }

  if (
    query.origins !== undefined &&
    !query.origins.includes(
      dataset.metadata.origin,
    )
  ) {
    return false;
  }

  if (
    query.version !== undefined &&
    dataset.version !== query.version
  ) {
    return false;
  }

  if (
    query.overlappingRange !== undefined &&
    !rangesOverlap(
      dataset.metadata.range.startTime,
      dataset.metadata.range.endTime,
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

function createHistoricalDatasetComparator(
  sort: readonly HistoricalDatasetSort[],
): (
  left: HistoricalDataset,
  right: HistoricalDataset,
) => number {
  return (
    left: HistoricalDataset,
    right: HistoricalDataset,
  ): number => {
    for (const sortEntry of sort) {
      const comparison =
        compareBySortEntry(
          left,
          right,
          sortEntry.field,
          sortEntry.direction,
        );

      if (comparison !== 0) {
        return comparison;
      }
    }

    const idComparison = compareStrings(
      String(left.id),
      String(right.id),
    );

    if (idComparison !== 0) {
      return idComparison;
    }

    return compareNumbers(
      left.version,
      right.version,
    );
  };
}

function compareBySortEntry(
  left: HistoricalDataset,
  right: HistoricalDataset,
  field: HistoricalDatasetSortField,
  direction: HistoricalDatasetSortDirection,
): number {
  const multiplier =
    direction === "ASC" ? 1 : -1;

  switch (field) {
    case "CREATED_AT":
      return (
        compareNumbers(
          left.metadata.createdAt,
          right.metadata.createdAt,
        ) * multiplier
      );

    case "UPDATED_AT":
      return (
        compareNumbers(
          left.metadata.updatedAt,
          right.metadata.updatedAt,
        ) * multiplier
      );

    case "START_TIME":
      return (
        compareNumbers(
          left.metadata.range.startTime,
          right.metadata.range.startTime,
        ) * multiplier
      );

    case "END_TIME":
      return (
        compareNumbers(
          left.metadata.range.endTime,
          right.metadata.range.endTime,
        ) * multiplier
      );

    case "RECORD_COUNT":
      return (
        compareNumbers(
          left.metadata.recordCount,
          right.metadata.recordCount,
        ) * multiplier
      );

    case "VERSION":
      return (
        compareNumbers(
          left.version,
          right.version,
        ) * multiplier
      );

    default:
      return assertNever(field);
  }
}

function compareHistoricalDatasetVersionDescending(
  left: HistoricalDataset,
  right: HistoricalDataset,
): number {
  const versionComparison =
    compareNumbers(
      right.version,
      left.version,
    );

  if (versionComparison !== 0) {
    return versionComparison;
  }

  return compareStrings(
    String(left.id),
    String(right.id),
  );
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
  throw new HistoricalDatasetRepositoryError(
    "INVALID_QUERY",
    `Unsupported historical dataset sort field: ${String(
      value,
    )}.`,
  );
}