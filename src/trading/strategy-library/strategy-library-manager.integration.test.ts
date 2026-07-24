/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * Deterministic integration test for strategy-library-manager.ts.
 *
 * Run:
 *   npx tsx src/trading/strategy-library/strategy-library-manager.integration.test.ts
 */

import assert from "node:assert/strict";

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyMetadata,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  STRATEGY_LIBRARY_SCHEMA_VERSION,
  type StrategyLibraryCollection,
  type StrategyLibraryCollectionId,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryProvider,
  type StrategyLibraryProviderId,
  type StrategyLibraryQuery,
  type StrategyLibraryQueryResult,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseId,
  type StrategyLibrarySnapshot,
  type StrategyLibraryStatistics,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

import type { StrategyLibraryProviderLoader } from "./strategy-library-provider-loader";
import type { StrategyLibraryEntryBuilderPort } from "./strategy-library-entry-builder";
import type { StrategyLibraryCollectionManager } from "./strategy-library-collection-manager";
import type { StrategyLibraryReleaseManager } from "./strategy-library-release-manager";
import type { StrategyLibrarySearchEngine } from "./strategy-library-search-engine";
import type { StrategyLibraryCompatibilityEngine } from "./strategy-library-compatibility-engine";
import type { StrategyLibraryRecommendationEngine } from "./strategy-library-recommendation-engine";
import type { StrategyLibraryComparisonEngine } from "./strategy-library-comparison-engine";
import type { StrategyLibraryDocumentationEngine } from "./library-documentation-engine";
import type { StrategyLibraryExportEngine } from "./strategy-library-export-engine";
import type { StrategyLibraryImportEngine } from "./strategy-library-import-engine";

import {
  StrategyLibraryManager,
  StrategyLibraryManagerError,
  createStrategyLibraryManager,
  type StrategyLibraryManagerDependencies,
  type StrategyLibraryManagerProviderLoadReport,
  type StrategyLibraryManagerRegistry,
} from "./strategy-library-manager";

/* ============================================================================
 * Deterministic constants
 * ============================================================================
 */

const BASE_TIME =
  1_750_000_000_000 as UnixTimestampMilliseconds;

const EMPTY_METADATA =
  EMPTY_STRATEGY_METADATA as StrategyMetadata;

const VALID_REPORT: StrategyLibraryValidationReport =
  deepFreeze({
    valid: true,
    issues: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    validatedAt: BASE_TIME,
    metadata: EMPTY_METADATA,
  });

/* ============================================================================
 * Deterministic test clock
 * ============================================================================
 */

class DeterministicClock {
  private value: number;

  public constructor(initialValue: UnixTimestampMilliseconds) {
    this.value = initialValue;
  }

  public now = (): UnixTimestampMilliseconds => {
    const current = this.value as UnixTimestampMilliseconds;
    this.value += 1;
    return current;
  };
}

/* ============================================================================
 * Validation adapter
 * ============================================================================
 */

class AlwaysValidStrategyLibraryValidator
  implements StrategyLibraryValidatorPort
{
  public validateEntry(
    _entry: StrategyLibraryEntry,
  ): StrategyLibraryValidationReport {
    return VALID_REPORT;
  }

  public validateCollection(
    _collection: StrategyLibraryCollection,
  ): StrategyLibraryValidationReport {
    return VALID_REPORT;
  }

  public validateRelease(
    _release: StrategyLibraryRelease,
  ): StrategyLibraryValidationReport {
    return VALID_REPORT;
  }

  public assertValid(
    report: StrategyLibraryValidationReport,
    message = "Strategy-library validation failed.",
  ): void {
    if (!report.valid) {
      throw new Error(message);
    }
  }
}

/* ============================================================================
 * Deterministic in-memory registry adapter
 *
 * The supplied Phase 19 bundle exposes a structural manager registry contract,
 * but does not expose a concrete StrategyLibraryRegistry class. This adapter is
 * therefore the required test boundary for exercising the manager facade.
 * ============================================================================
 */

class DeterministicStrategyLibraryRegistry
  implements StrategyLibraryManagerRegistry
{
  private readonly entries =
    new Map<StrategyLibraryEntryId, StrategyLibraryEntry>();

  private readonly collections =
    new Map<StrategyLibraryCollectionId, StrategyLibraryCollection>();

  private readonly releases =
    new Map<StrategyLibraryReleaseId, StrategyLibraryRelease>();

  private readonly loadedProviderIds =
    new Set<StrategyLibraryProviderId>();

  private capturedAt =
    BASE_TIME as UnixTimestampMilliseconds;

  public register(entry: StrategyLibraryEntry): void {
    if (this.entries.has(entry.entryId)) {
      throw new Error(
        `Duplicate strategy-library entry '${entry.entryId}'.`,
      );
    }

    this.entries.set(entry.entryId, immutableCopy(entry));
  }

  public registerMany(
    entries: readonly StrategyLibraryEntry[],
  ): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  public unregisterEntry(
    entryId: StrategyLibraryEntryId,
  ): boolean {
    return this.entries.delete(entryId);
  }

  public get(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): StrategyLibraryEntry | undefined {
    const matches = this.list().filter(
      (entry) =>
        entry.strategyId === strategyId &&
        (
          strategyVersion === undefined ||
          entry.strategyVersion === strategyVersion
        ),
    );

    if (matches.length === 0) {
      return undefined;
    }

    return strategyVersion === undefined
      ? matches[matches.length - 1]
      : matches[0];
  }

  public getByEntryId(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry | undefined {
    const entry = this.entries.get(entryId);
    return entry === undefined
      ? undefined
      : immutableCopy(entry);
  }

  public list(): readonly StrategyLibraryEntry[] {
    return deepFreeze(
      [...this.entries.values()]
        .sort((left, right) =>
          String(left.entryId).localeCompare(
            String(right.entryId),
          ),
        )
        .map(immutableCopy),
    );
  }

  public listVersions(
    strategyId: StrategyId,
  ): readonly StrategyLibraryEntry[] {
    return deepFreeze(
      this.list()
        .filter(
          (entry) => entry.strategyId === strategyId,
        )
        .sort((left, right) =>
          String(left.strategyVersion).localeCompare(
            String(right.strategyVersion),
          ),
        ),
    );
  }

  public registerCollection(
    collection: StrategyLibraryCollection,
  ): void {
    if (this.collections.has(collection.collectionId)) {
      throw new Error(
        `Duplicate strategy-library collection '${collection.collectionId}'.`,
      );
    }

    this.collections.set(
      collection.collectionId,
      immutableCopy(collection),
    );
  }

  public unregisterCollection(
    collectionId: StrategyLibraryCollectionId,
  ): boolean {
    return this.collections.delete(collectionId);
  }

  public getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined {
    const collection = this.collections.get(collectionId);

    return collection === undefined
      ? undefined
      : immutableCopy(collection);
  }

  public listCollections():
    readonly StrategyLibraryCollection[] {
    return deepFreeze(
      [...this.collections.values()]
        .sort((left, right) =>
          String(left.collectionId).localeCompare(
            String(right.collectionId),
          ),
        )
        .map(immutableCopy),
    );
  }

  public registerRelease(
    release: StrategyLibraryRelease,
  ): void {
    if (this.releases.has(release.releaseId)) {
      throw new Error(
        `Duplicate strategy-library release '${release.releaseId}'.`,
      );
    }

    this.releases.set(
      release.releaseId,
      immutableCopy(release),
    );
  }

  public unregisterRelease(
    releaseId: StrategyLibraryReleaseId,
  ): boolean {
    return this.releases.delete(releaseId);
  }

  public getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined {
    const release = this.releases.get(releaseId);

    return release === undefined
      ? undefined
      : immutableCopy(release);
  }

  public listReleases():
    readonly StrategyLibraryRelease[] {
    return deepFreeze(
      [...this.releases.values()]
        .sort((left, right) =>
          String(left.releaseId).localeCompare(
            String(right.releaseId),
          ),
        )
        .map(immutableCopy),
    );
  }

  public async loadProvider(
    provider: StrategyLibraryProvider,
  ): Promise<StrategyLibraryManagerProviderLoadReport> {
    const entries = await provider.listEntries();
    const collections =
      provider.listCollections === undefined
        ? []
        : await provider.listCollections();
    const releases =
      provider.listReleases === undefined
        ? []
        : await provider.listReleases();

    this.registerMany(entries);

    for (const collection of collections) {
      this.registerCollection(collection);
    }

    for (const release of releases) {
      this.registerRelease(release);
    }

    this.loadedProviderIds.add(provider.providerId);
    this.capturedAt =
      (this.capturedAt + 1) as UnixTimestampMilliseconds;

    return deepFreeze({
      providerId: provider.providerId,
      loadedEntries: entries.length,
      loadedCollections: collections.length,
      loadedReleases: releases.length,
      loadedAt: this.capturedAt,
      metadata: EMPTY_METADATA,
    });
  }

  public hasLoadedProvider(
    providerId: StrategyLibraryProviderId,
  ): boolean {
    return this.loadedProviderIds.has(providerId);
  }

  public listLoadedProviderIds():
    readonly StrategyLibraryProviderId[] {
    return Object.freeze(
      [...this.loadedProviderIds].sort(),
    );
  }

  public query(
    query: StrategyLibraryQuery = {},
  ): StrategyLibraryQueryResult {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const all = this.list();

    return deepFreeze({
      query: immutableCopy(query),
      total: all.length,
      offset,
      limit,
      entries: all.slice(offset, offset + limit),
      generatedAt: this.capturedAt,
      metadata: EMPTY_METADATA,
    });
  }

  public statistics(): StrategyLibraryStatistics {
    const entries = this.list();

    return deepFreeze({
      totalEntries: entries.length,
      activeEntries: entries.filter(
        (entry) =>
          entry.status !== "DEPRECATED" &&
          entry.status !== "RETIRED",
      ).length,
      deprecatedEntries: entries.filter(
        (entry) => entry.status === "DEPRECATED",
      ).length,
      retiredEntries: entries.filter(
        (entry) => entry.status === "RETIRED",
      ).length,
      liveReadyEntries: entries.filter(
        (entry) => entry.status === "LIVE_READY",
      ).length,
      certifiedEntries: entries.filter(
        (entry) => entry.verificationStatus === "CERTIFIED",
      ).length,
      familyCounts: {},
      riskLevelCounts: {},
      verificationCounts: {},
    });
  }

  public snapshot(): StrategyLibrarySnapshot {
    return deepFreeze({
      schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
      capturedAt: this.capturedAt,
      entries: this.list(),
      collections: this.listCollections(),
      releases: this.listReleases(),
      statistics: this.statistics(),
      metadata: EMPTY_METADATA,
    });
  }

  public clear(): void {
    this.entries.clear();
    this.collections.clear();
    this.releases.clear();
    this.loadedProviderIds.clear();
  }

  public countEntries(): number {
    return this.entries.size;
  }

  public countStrategies(): number {
    return new Set(
      this.list().map((entry) => entry.strategyId),
    ).size;
  }

  public countCollections(): number {
    return this.collections.size;
  }

  public countReleases(): number {
    return this.releases.size;
  }
}

/* ============================================================================
 * Fixtures
 * ============================================================================
 */

function createEntry(
  entryId: string,
  strategyId: string,
  strategyVersion: string,
): StrategyLibraryEntry {
  return deepFreeze({
    entryId,
    strategyId,
    strategyVersion,
    schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
    manifest: {
      strategyId,
      version: strategyVersion,
    },
    family: "TREND_FOLLOWING",
    secondaryFamilies: [],
    complexity: "INTERMEDIATE",
    tags: [],
    aliases: [],
    searchKeywords: [],
    status: "PAPER_READY",
    verificationStatus: "VALIDATED",
    availability: "PUBLIC",
    introducedAt: BASE_TIME,
    updatedAt: BASE_TIME,
    operationalProfile: {},
    riskProfile: {},
    compatibilityProfile: {},
    regimeProfiles: [],
    dataRequirements: [],
    indicatorRequirements: [],
    performanceExpectations: [],
    documentation: [],
    metadata: EMPTY_METADATA,
  } as unknown as StrategyLibraryEntry);
}

function createCollection(
  collectionId: string,
): StrategyLibraryCollection {
  return deepFreeze({
    collectionId,
    schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
    name: collectionId,
    description: "Deterministic integration-test collection.",
    type: "CURATED",
    members: [],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    metadata: EMPTY_METADATA,
  } as unknown as StrategyLibraryCollection);
}

function createRelease(
  releaseId: string,
): StrategyLibraryRelease {
  return deepFreeze({
    releaseId,
    schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
    version: "1.0.0",
    status: "DRAFT",
    entries: [],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    metadata: EMPTY_METADATA,
  } as unknown as StrategyLibraryRelease);
}

function createDependencies(
  registry: StrategyLibraryManagerRegistry,
  validator: StrategyLibraryValidatorPort,
): {
  readonly dependencies: StrategyLibraryManagerDependencies;
  readonly services: Readonly<Record<string, object>>;
} {
  const services = deepFreeze({
    providerLoader: {},
    entryBuilder: {},
    collectionManager: {},
    releaseManager: {},
    searchEngine: {},
    compatibilityEngine: {},
    recommendationEngine: {},
    comparisonEngine: {},
    documentationEngine: {},
    exportEngine: {},
    importEngine: {},
  });

  const dependencies: StrategyLibraryManagerDependencies = {
    registry,
    validator,
    providerLoader:
      services.providerLoader as StrategyLibraryProviderLoader,
    entryBuilder:
      services.entryBuilder as StrategyLibraryEntryBuilderPort,
    collectionManager:
      services.collectionManager as StrategyLibraryCollectionManager,
    releaseManager:
      services.releaseManager as StrategyLibraryReleaseManager,
    searchEngine:
      services.searchEngine as StrategyLibrarySearchEngine,
    compatibilityEngine:
      services.compatibilityEngine as StrategyLibraryCompatibilityEngine,
    recommendationEngine:
      services.recommendationEngine as StrategyLibraryRecommendationEngine,
    comparisonEngine:
      services.comparisonEngine as StrategyLibraryComparisonEngine,
    documentationEngine:
      services.documentationEngine as StrategyLibraryDocumentationEngine,
    exportEngine:
      services.exportEngine as StrategyLibraryExportEngine,
    importEngine:
      services.importEngine as StrategyLibraryImportEngine,
  };

  return {
    dependencies,
    services,
  };
}

/* ============================================================================
 * Tests
 * ============================================================================
 */

async function testInitialStateAndServiceSurface(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const clock = new DeterministicClock(BASE_TIME);
  const { dependencies, services } =
    createDependencies(registry, validator);

  const manager = createStrategyLibraryManager(
    dependencies,
    {
      clock: clock.now,
      metadata: {
        testSuite: "strategy-library-manager",
      },
    },
  );

  assert.equal(manager.lifecycleState, "READY");
  assert.equal(manager.mutationSequence, 0);
  assert.equal(manager.registry, registry);
  assert.equal(manager.validator, validator);
  assert.equal(manager.providerLoader, services.providerLoader);
  assert.equal(manager.entryBuilder, services.entryBuilder);
  assert.equal(
    manager.collectionManager,
    services.collectionManager,
  );
  assert.equal(manager.releaseManager, services.releaseManager);
  assert.equal(manager.searchEngine, services.searchEngine);
  assert.equal(
    manager.compatibilityEngine,
    services.compatibilityEngine,
  );
  assert.equal(
    manager.recommendationEngine,
    services.recommendationEngine,
  );
  assert.equal(manager.comparisonEngine, services.comparisonEngine);
  assert.equal(
    manager.documentationEngine,
    services.documentationEngine,
  );
  assert.equal(manager.exportEngine, services.exportEngine);
  assert.equal(manager.importEngine, services.importEngine);

  const status = manager.status();

  assert.equal(status.lifecycleState, "READY");
  assert.equal(status.entryCount, 0);
  assert.equal(status.strategyCount, 0);
  assert.equal(status.collectionCount, 0);
  assert.equal(status.releaseCount, 0);
  assert.equal(status.loadedProviderCount, 0);
  assert.equal(status.mutationSequence, 0);
  assert.equal(status.capturedAt, BASE_TIME);
  assert.ok(Object.isFrozen(status));
  assert.ok(Object.isFrozen(manager.metadata));
}

async function testEntryLifecycle(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const { dependencies } = createDependencies(registry, validator);
  const manager = new StrategyLibraryManager(dependencies, {
    clock: () => BASE_TIME,
  });

  const first = createEntry(
    "entry:trend:1",
    "strategy:trend",
    "1.0.0",
  );

  const second = createEntry(
    "entry:trend:2",
    "strategy:trend",
    "2.0.0",
  );

  const registeredFirst = manager.registerEntry(first);

  assert.deepEqual(registeredFirst, first);
  assert.notEqual(registeredFirst, first);
  assert.equal(manager.mutationSequence, 1);
  assert.deepEqual(
    manager.getEntry(first.entryId),
    first,
  );
  assert.deepEqual(
    manager.getStrategy(first.strategyId, first.strategyVersion),
    first,
  );

  const registered = manager.registerEntries([second]);

  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0], second);
  assert.equal(manager.mutationSequence, 2);
  assert.equal(manager.listEntries().length, 2);
  assert.equal(
    manager.listStrategyVersions(first.strategyId).length,
    2,
  );
  assert.equal(manager.statistics().totalEntries, 2);

  assert.equal(
    manager.unregisterEntry(first.entryId, true),
    true,
  );
  assert.equal(manager.mutationSequence, 3);
  assert.equal(manager.getEntry(first.entryId), undefined);

  assert.throws(
    () => manager.requireEntry(first.entryId),
    (error: unknown) =>
      error instanceof StrategyLibraryManagerError &&
      error.code === "ENTRY_NOT_FOUND",
  );

  assert.throws(
    () => manager.unregisterEntry(first.entryId, true),
    (error: unknown) =>
      error instanceof StrategyLibraryManagerError &&
      error.code === "ENTRY_NOT_FOUND",
  );
}

async function testCollectionAndReleaseLifecycle(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const { dependencies } = createDependencies(registry, validator);
  const manager = new StrategyLibraryManager(dependencies, {
    clock: () => BASE_TIME,
  });

  const collection = createCollection("collection:core");
  const release = createRelease("release:phase-19");

  assert.deepEqual(
    manager.registerCollection(collection),
    collection,
  );
  assert.deepEqual(
    manager.requireCollection(collection.collectionId),
    collection,
  );
  assert.equal(manager.listCollections().length, 1);

  assert.deepEqual(
    manager.registerRelease(release),
    release,
  );
  assert.deepEqual(
    manager.requireRelease(release.releaseId),
    release,
  );
  assert.equal(manager.listReleases().length, 1);

  assert.equal(
    manager.unregisterCollection(
      collection.collectionId,
      true,
    ),
    true,
  );
  assert.equal(
    manager.unregisterRelease(
      release.releaseId,
      true,
    ),
    true,
  );

  assert.equal(manager.getCollection(collection.collectionId), undefined);
  assert.equal(manager.getRelease(release.releaseId), undefined);
}

async function testAtomicBatchAndRollback(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const { dependencies } = createDependencies(registry, validator);
  const manager = new StrategyLibraryManager(dependencies, {
    clock: () => BASE_TIME,
    rollbackFailedBatchOperations: true,
  });

  const entry = createEntry(
    "entry:batch:1",
    "strategy:batch",
    "1.0.0",
  );
  const collection = createCollection("collection:batch");
  const release = createRelease("release:batch");

  const successful = manager.applyBatch([
    {
      type: "REGISTER_ENTRY",
      entry,
    },
    {
      type: "REGISTER_COLLECTION",
      collection,
    },
    {
      type: "REGISTER_RELEASE",
      release,
    },
  ]);

  assert.equal(successful.operationCount, 3);
  assert.equal(successful.registeredEntryCount, 1);
  assert.equal(successful.registeredCollectionCount, 1);
  assert.equal(successful.registeredReleaseCount, 1);
  assert.equal(successful.mutationSequence, 1);
  assert.equal(successful.snapshot.status.entryCount, 1);
  assert.equal(successful.snapshot.status.collectionCount, 1);
  assert.equal(successful.snapshot.status.releaseCount, 1);
  assert.ok(Object.isFrozen(successful));
  assert.ok(Object.isFrozen(successful.snapshot));

  const beforeFailure = manager.snapshot();
  const duplicate = createEntry(
    "entry:batch:1",
    "strategy:duplicate",
    "9.9.9",
  );

  assert.throws(
    () =>
      manager.applyBatch([
        {
          type: "UNREGISTER_COLLECTION",
          collectionId: collection.collectionId,
          requireExisting: true,
        },
        {
          type: "REGISTER_ENTRY",
          entry: duplicate,
        },
      ]),
    (error: unknown) =>
      error instanceof StrategyLibraryManagerError &&
      error.code === "BATCH_OPERATION_FAILED" &&
      error.operationIndex === 1,
  );

  const afterFailure = manager.snapshot();

  assert.deepEqual(
    afterFailure.library.entries,
    beforeFailure.library.entries,
  );
  assert.deepEqual(
    afterFailure.library.collections,
    beforeFailure.library.collections,
  );
  assert.deepEqual(
    afterFailure.library.releases,
    beforeFailure.library.releases,
  );
  assert.equal(manager.lifecycleState, "READY");
  assert.equal(manager.mutationSequence, 1);
}

async function testProviderLoadingAndQuery(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const { dependencies } = createDependencies(registry, validator);
  const manager = new StrategyLibraryManager(dependencies, {
    clock: () => BASE_TIME,
  });

  const providerEntry = createEntry(
    "entry:provider:1",
    "strategy:provider",
    "1.0.0",
  );
  const providerCollection =
    createCollection("collection:provider");
  const providerRelease =
    createRelease("release:provider");

  const provider: StrategyLibraryProvider = deepFreeze({
    providerId: "provider:deterministic",
    listEntries: () => [providerEntry],
    listCollections: () => [providerCollection],
    listReleases: () => [providerRelease],
  } as StrategyLibraryProvider);

  const report = await manager.loadProvider(provider);

  assert.equal(report.providerId, provider.providerId);
  assert.equal(report.loadedEntries, 1);
  assert.equal(report.loadedCollections, 1);
  assert.equal(report.loadedReleases, 1);
  assert.ok(Object.isFrozen(report));

  assert.equal(
    manager.hasLoadedProvider(provider.providerId),
    true,
  );
  assert.deepEqual(
    manager.listLoadedProviderIds(),
    [provider.providerId],
  );

  const result = manager.query({
    offset: 0,
    limit: 10,
  });

  assert.equal(result.total, 1);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], providerEntry);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.entries));
}

async function testSnapshotClearAndDispose(): Promise<void> {
  const registry = new DeterministicStrategyLibraryRegistry();
  const validator = new AlwaysValidStrategyLibraryValidator();
  const { dependencies } = createDependencies(registry, validator);
  const manager = new StrategyLibraryManager(dependencies, {
    clock: () => BASE_TIME,
    rejectOperationsAfterDispose: true,
  });

  manager.registerEntry(
    createEntry(
      "entry:lifecycle:1",
      "strategy:lifecycle",
      "1.0.0",
    ),
  );

  const snapshot = manager.snapshot();

  assert.equal(snapshot.status.entryCount, 1);
  assert.equal(snapshot.library.entries.length, 1);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.library));
  assert.ok(Object.isFrozen(snapshot.library.entries));

  manager.clear();

  assert.equal(manager.listEntries().length, 0);
  assert.equal(manager.mutationSequence, 2);

  manager.dispose();

  assert.equal(manager.lifecycleState, "DISPOSED");
  assert.equal(manager.mutationSequence, 3);

  manager.dispose();

  assert.equal(manager.mutationSequence, 3);

  assert.throws(
    () => manager.status(),
    (error: unknown) =>
      error instanceof StrategyLibraryManagerError &&
      error.code === "MANAGER_DISPOSED",
  );

  assert.throws(
    () => manager.listEntries(),
    (error: unknown) =>
      error instanceof StrategyLibraryManagerError &&
      error.code === "MANAGER_DISPOSED",
  );
}

/* ============================================================================
 * Test runner
 * ============================================================================
 */

async function run(): Promise<void> {
  const tests: readonly [
    name: string,
    execute: () => Promise<void>,
  ][] = [
    [
      "initial state and integrated service surface",
      testInitialStateAndServiceSurface,
    ],
    [
      "entry lifecycle",
      testEntryLifecycle,
    ],
    [
      "collection and release lifecycle",
      testCollectionAndReleaseLifecycle,
    ],
    [
      "atomic batch and rollback",
      testAtomicBatchAndRollback,
    ],
    [
      "provider loading and query",
      testProviderLoadingAndQuery,
    ],
    [
      "snapshot, clear, and dispose",
      testSnapshotClearAndDispose,
    ],
  ];

  for (const [name, execute] of tests) {
    await execute();
    console.log(`✓ ${name}`);
  }

  console.log(
    "All strategy-library manager integration tests passed successfully.",
  );
}

void run().catch((error: unknown) => {
  console.error(
    "Strategy-library manager integration tests failed.",
  );
  console.error(error);
  process.exitCode = 1;
});

/* ============================================================================
 * Immutability helpers
 * ============================================================================
 */

function immutableCopy<TValue>(value: TValue): TValue {
  return deepFreeze(deepClone(value));
}

function deepClone<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map(
      (item) => deepClone(item),
    ) as TValue;
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const clone: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(value)) {
      clone[key] = deepClone(
        (
          value as Record<PropertyKey, unknown>
        )[key],
      );
    }

    return clone as TValue;
  }

  return value;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(
      (
        value as Record<PropertyKey, unknown>
      )[key],
    );
  }

  return value;
}