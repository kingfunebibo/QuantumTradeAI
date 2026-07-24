/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-manager.ts
 *
 * Purpose:
 * Central deterministic facade and lifecycle coordinator for the complete
 * Professional Trading Strategy Library subsystem.
 *
 * Architectural responsibilities:
 * - expose one immutable integration boundary for every Phase 19 component;
 * - coordinate registry-backed entry, collection, release, and provider state;
 * - validate all directly managed catalog mutations before persistence;
 * - provide deterministic batch operations with atomic rollback;
 * - expose immutable status, statistics, snapshots, and service references;
 * - never execute trading strategies or bypass framework/runtime safeguards.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyMetadata,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  EMPTY_STRATEGY_LIBRARY_COLLECTIONS,
  EMPTY_STRATEGY_LIBRARY_ENTRIES,
  EMPTY_STRATEGY_LIBRARY_RELEASES,
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

import {
  StrategyLibraryValidator,
} from "./strategy-library-validator";

import type {
  StrategyLibraryProviderLoader,
} from "./strategy-library-provider-loader";

import type {
  StrategyLibraryEntryBuilderPort,
} from "./strategy-library-entry-builder";

import type {
  StrategyLibraryCollectionManager,
} from "./strategy-library-collection-manager";

import type {
  StrategyLibraryReleaseManager,
} from "./strategy-library-release-manager";

import type {
  StrategyLibrarySearchEngine,
} from "./strategy-library-search-engine";

import type {
  StrategyLibraryCompatibilityEngine,
} from "./strategy-library-compatibility-engine";

import type {
  StrategyLibraryRecommendationEngine,
} from "./strategy-library-recommendation-engine";

import type {
  StrategyLibraryComparisonEngine,
} from "./strategy-library-comparison-engine";

import type {
  StrategyLibraryDocumentationEngine,
} from "./library-documentation-engine";

import type {
  StrategyLibraryExportEngine,
} from "./strategy-library-export-engine";

import type {
  StrategyLibraryImportEngine,
} from "./strategy-library-import-engine";

/* ========================================================================== *
 * Error contracts
 * ========================================================================== */

export type StrategyLibraryManagerErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_ENTRY"
  | "INVALID_COLLECTION"
  | "INVALID_RELEASE"
  | "ENTRY_NOT_FOUND"
  | "COLLECTION_NOT_FOUND"
  | "RELEASE_NOT_FOUND"
  | "PROVIDER_LOAD_FAILED"
  | "BATCH_OPERATION_FAILED"
  | "ROLLBACK_FAILED"
  | "MANAGER_DISPOSED";

export interface StrategyLibraryManagerErrorDetails {
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly collectionId?: StrategyLibraryCollectionId;
  readonly releaseId?: StrategyLibraryReleaseId;
  readonly providerId?: StrategyLibraryProviderId;
  readonly operationIndex?: number;
  readonly validationReport?: StrategyLibraryValidationReport;
  readonly cause?: unknown;
  readonly rollbackCause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryManagerError extends Error {
  public readonly code: StrategyLibraryManagerErrorCode;
  public readonly entryId?: StrategyLibraryEntryId;
  public readonly strategyId?: StrategyId;
  public readonly strategyVersion?: StrategyVersion;
  public readonly collectionId?: StrategyLibraryCollectionId;
  public readonly releaseId?: StrategyLibraryReleaseId;
  public readonly providerId?: StrategyLibraryProviderId;
  public readonly operationIndex?: number;
  public readonly validationReport?: StrategyLibraryValidationReport;
  public readonly cause?: unknown;
  public readonly rollbackCause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryManagerErrorCode,
    message: string,
    details: StrategyLibraryManagerErrorDetails = {},
  ) {
    super(message);
    this.name = "StrategyLibraryManagerError";
    this.code = code;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.collectionId = details.collectionId;
    this.releaseId = details.releaseId;
    this.providerId = details.providerId;
    this.operationIndex = details.operationIndex;
    this.validationReport = details.validationReport;
    this.cause = details.cause;
    this.rollbackCause = details.rollbackCause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryManagerError.prototype,
    );
    Object.freeze(this);
  }
}

/* ========================================================================== *
 * Clock, options, dependencies, and public reports
 * ========================================================================== */

export interface StrategyLibraryManagerClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryManagerRegistry {
  register(entry: StrategyLibraryEntry): void;
  registerMany(entries: readonly StrategyLibraryEntry[]): void;
  unregisterEntry(entryId: StrategyLibraryEntryId): boolean;
  get(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): StrategyLibraryEntry | undefined;
  getByEntryId(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry | undefined;
  list(): readonly StrategyLibraryEntry[];
  listVersions(strategyId: StrategyId): readonly StrategyLibraryEntry[];

  registerCollection(collection: StrategyLibraryCollection): void;
  unregisterCollection(collectionId: StrategyLibraryCollectionId): boolean;
  getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined;
  listCollections(): readonly StrategyLibraryCollection[];

  registerRelease(release: StrategyLibraryRelease): void;
  unregisterRelease(releaseId: StrategyLibraryReleaseId): boolean;
  getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined;
  listReleases(): readonly StrategyLibraryRelease[];

  loadProvider(
    provider: StrategyLibraryProvider,
  ): Promise<StrategyLibraryManagerProviderLoadReport>;
  hasLoadedProvider(providerId: StrategyLibraryProviderId): boolean;
  listLoadedProviderIds(): readonly StrategyLibraryProviderId[];

  query(query?: StrategyLibraryQuery): StrategyLibraryQueryResult;
  statistics(): StrategyLibraryStatistics;
  snapshot(): StrategyLibrarySnapshot;
  clear(): void;

  countEntries(): number;
  countStrategies(): number;
  countCollections(): number;
  countReleases(): number;
}

export interface StrategyLibraryManagerProviderLoadReport {
  readonly providerId: StrategyLibraryProviderId;
  readonly loadedEntries: number;
  readonly loadedCollections: number;
  readonly loadedReleases: number;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryManagerDependencies {
  readonly registry: StrategyLibraryManagerRegistry;
  readonly validator?: StrategyLibraryValidatorPort;
  readonly providerLoader: StrategyLibraryProviderLoader;
  readonly entryBuilder: StrategyLibraryEntryBuilderPort;
  readonly collectionManager: StrategyLibraryCollectionManager;
  readonly releaseManager: StrategyLibraryReleaseManager;
  readonly searchEngine: StrategyLibrarySearchEngine;
  readonly compatibilityEngine: StrategyLibraryCompatibilityEngine;
  readonly recommendationEngine: StrategyLibraryRecommendationEngine;
  readonly comparisonEngine: StrategyLibraryComparisonEngine;
  readonly documentationEngine: StrategyLibraryDocumentationEngine;
  readonly exportEngine: StrategyLibraryExportEngine;
  readonly importEngine: StrategyLibraryImportEngine;
}

export interface StrategyLibraryManagerOptions {
  readonly validateBeforeRegistration?: boolean;
  readonly validateBatchBeforeMutation?: boolean;
  readonly rollbackFailedBatchOperations?: boolean;
  readonly rejectOperationsAfterDispose?: boolean;
  readonly clock?:
    | StrategyLibraryManagerClock
    | (() => UnixTimestampMilliseconds);
  readonly metadata?: StrategyMetadata;
}

export const DEFAULT_STRATEGY_LIBRARY_MANAGER_OPTIONS =
  Object.freeze({
    validateBeforeRegistration: true,
    validateBatchBeforeMutation: true,
    rollbackFailedBatchOperations: true,
    rejectOperationsAfterDispose: true,
    metadata: EMPTY_STRATEGY_METADATA,
  });

interface ResolvedStrategyLibraryManagerOptions {
  readonly validateBeforeRegistration: boolean;
  readonly validateBatchBeforeMutation: boolean;
  readonly rollbackFailedBatchOperations: boolean;
  readonly rejectOperationsAfterDispose: boolean;
  readonly clock: StrategyLibraryManagerClock;
  readonly metadata: StrategyMetadata;
}

export type StrategyLibraryManagerLifecycleState =
  | "READY"
  | "MUTATING"
  | "DISPOSED";

export interface StrategyLibraryManagerStatus {
  readonly schemaVersion: string;
  readonly lifecycleState: StrategyLibraryManagerLifecycleState;
  readonly entryCount: number;
  readonly strategyCount: number;
  readonly collectionCount: number;
  readonly releaseCount: number;
  readonly loadedProviderCount: number;
  readonly mutationSequence: number;
  readonly capturedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryManagerSnapshot {
  readonly library: StrategyLibrarySnapshot;
  readonly status: StrategyLibraryManagerStatus;
  readonly loadedProviderIds: readonly StrategyLibraryProviderId[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryManagerBatchResult {
  readonly operationCount: number;
  readonly registeredEntryCount: number;
  readonly registeredCollectionCount: number;
  readonly registeredReleaseCount: number;
  readonly mutationSequence: number;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly snapshot: StrategyLibraryManagerSnapshot;
  readonly metadata: StrategyMetadata;
}

export type StrategyLibraryManagerBatchOperation =
  | {
      readonly type: "REGISTER_ENTRY";
      readonly entry: StrategyLibraryEntry;
    }
  | {
      readonly type: "UNREGISTER_ENTRY";
      readonly entryId: StrategyLibraryEntryId;
      readonly requireExisting?: boolean;
    }
  | {
      readonly type: "REGISTER_COLLECTION";
      readonly collection: StrategyLibraryCollection;
    }
  | {
      readonly type: "UNREGISTER_COLLECTION";
      readonly collectionId: StrategyLibraryCollectionId;
      readonly requireExisting?: boolean;
    }
  | {
      readonly type: "REGISTER_RELEASE";
      readonly release: StrategyLibraryRelease;
    }
  | {
      readonly type: "UNREGISTER_RELEASE";
      readonly releaseId: StrategyLibraryReleaseId;
      readonly requireExisting?: boolean;
    };

/* ========================================================================== *
 * Manager
 * ========================================================================== */

export class StrategyLibraryManager {
  private readonly dependencies: StrategyLibraryManagerDependencies;
  private readonly options: ResolvedStrategyLibraryManagerOptions;
  private lifecycleStateValue: StrategyLibraryManagerLifecycleState = "READY";
  private mutationSequenceValue = 0;

  public constructor(
    dependencies: StrategyLibraryManagerDependencies,
    options: StrategyLibraryManagerOptions = {},
  ) {
    assertDependencies(dependencies);
    this.dependencies = Object.freeze({ ...dependencies });
    this.options = resolveOptions(options);
  }

  /* ------------------------------------------------------------------------ *
   * Integrated Phase 19 services
   * ------------------------------------------------------------------------ */

  public get registry(): StrategyLibraryManagerRegistry {
    return this.dependencies.registry;
  }

  public get validator(): StrategyLibraryValidatorPort {
    return this.dependencies.validator ?? DEFAULT_VALIDATOR;
  }

  public get providerLoader(): StrategyLibraryProviderLoader {
    return this.dependencies.providerLoader;
  }

  public get entryBuilder(): StrategyLibraryEntryBuilderPort {
    return this.dependencies.entryBuilder;
  }

  public get collectionManager(): StrategyLibraryCollectionManager {
    return this.dependencies.collectionManager;
  }

  public get releaseManager(): StrategyLibraryReleaseManager {
    return this.dependencies.releaseManager;
  }

  public get searchEngine(): StrategyLibrarySearchEngine {
    return this.dependencies.searchEngine;
  }

  public get compatibilityEngine(): StrategyLibraryCompatibilityEngine {
    return this.dependencies.compatibilityEngine;
  }

  public get recommendationEngine(): StrategyLibraryRecommendationEngine {
    return this.dependencies.recommendationEngine;
  }

  public get comparisonEngine(): StrategyLibraryComparisonEngine {
    return this.dependencies.comparisonEngine;
  }

  public get documentationEngine(): StrategyLibraryDocumentationEngine {
    return this.dependencies.documentationEngine;
  }

  public get exportEngine(): StrategyLibraryExportEngine {
    return this.dependencies.exportEngine;
  }

  public get importEngine(): StrategyLibraryImportEngine {
    return this.dependencies.importEngine;
  }

  /* ------------------------------------------------------------------------ *
   * Entry lifecycle
   * ------------------------------------------------------------------------ */

  public registerEntry(entry: StrategyLibraryEntry): StrategyLibraryEntry {
    this.assertOperational();
    assertObject(entry, "entry");

    if (this.options.validateBeforeRegistration) {
      this.assertValidEntry(entry);
    }

    return this.withMutation(() => {
      this.registry.register(entry);
      return this.requireEntry(entry.entryId);
    });
  }

  public registerEntries(
    entries: readonly StrategyLibraryEntry[],
  ): readonly StrategyLibraryEntry[] {
    this.assertOperational();
    assertArray(entries, "entries");

    if (this.options.validateBatchBeforeMutation) {
      for (const entry of entries) {
        this.assertValidEntry(entry);
      }
    }

    const operations = entries.map(
      (entry): StrategyLibraryManagerBatchOperation =>
        Object.freeze({
          type: "REGISTER_ENTRY",
          entry,
        }),
    );

    this.applyBatch(operations);

    return Object.freeze(
      entries.map((entry) => this.requireEntry(entry.entryId)),
    );
  }

  public unregisterEntry(
    entryId: StrategyLibraryEntryId,
    requireExisting = false,
  ): boolean {
    this.assertOperational();
    const normalizedEntryId = requiredIdentifier(entryId, "entryId");

    return this.withMutation(() => {
      const removed = this.registry.unregisterEntry(normalizedEntryId);

      if (!removed && requireExisting) {
        throw new StrategyLibraryManagerError(
          "ENTRY_NOT_FOUND",
          `Strategy library entry '${normalizedEntryId}' was not found.`,
          { entryId: normalizedEntryId },
        );
      }

      return removed;
    });
  }

  public getEntry(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry | undefined {
    this.assertOperational();
    return this.registry.getByEntryId(
      requiredIdentifier(entryId, "entryId"),
    );
  }

  public requireEntry(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry {
    const normalizedEntryId = requiredIdentifier(entryId, "entryId");
    const entry = this.registry.getByEntryId(normalizedEntryId);

    if (entry === undefined) {
      throw new StrategyLibraryManagerError(
        "ENTRY_NOT_FOUND",
        `Strategy library entry '${normalizedEntryId}' was not found.`,
        { entryId: normalizedEntryId },
      );
    }

    return entry;
  }

  public getStrategy(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): StrategyLibraryEntry | undefined {
    this.assertOperational();
    return this.registry.get(
      requiredIdentifier(strategyId, "strategyId"),
      strategyVersion === undefined
        ? undefined
        : requiredIdentifier(strategyVersion, "strategyVersion"),
    );
  }

  public listEntries(): readonly StrategyLibraryEntry[] {
    this.assertOperational();
    return this.registry.list();
  }

  public listStrategyVersions(
    strategyId: StrategyId,
  ): readonly StrategyLibraryEntry[] {
    this.assertOperational();
    return this.registry.listVersions(
      requiredIdentifier(strategyId, "strategyId"),
    );
  }

  /* ------------------------------------------------------------------------ *
   * Collection lifecycle
   * ------------------------------------------------------------------------ */

  public registerCollection(
    collection: StrategyLibraryCollection,
  ): StrategyLibraryCollection {
    this.assertOperational();
    assertObject(collection, "collection");

    if (this.options.validateBeforeRegistration) {
      this.assertValidCollection(collection);
    }

    return this.withMutation(() => {
      this.registry.registerCollection(collection);
      return this.requireCollection(collection.collectionId);
    });
  }

  public unregisterCollection(
    collectionId: StrategyLibraryCollectionId,
    requireExisting = false,
  ): boolean {
    this.assertOperational();
    const normalizedCollectionId = requiredIdentifier(
      collectionId,
      "collectionId",
    );

    return this.withMutation(() => {
      const removed = this.registry.unregisterCollection(
        normalizedCollectionId,
      );

      if (!removed && requireExisting) {
        throw new StrategyLibraryManagerError(
          "COLLECTION_NOT_FOUND",
          `Strategy library collection '${normalizedCollectionId}' was not found.`,
          { collectionId: normalizedCollectionId },
        );
      }

      return removed;
    });
  }

  public getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined {
    this.assertOperational();
    return this.registry.getCollection(
      requiredIdentifier(collectionId, "collectionId"),
    );
  }

  public requireCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection {
    const normalizedCollectionId = requiredIdentifier(
      collectionId,
      "collectionId",
    );
    const collection = this.registry.getCollection(normalizedCollectionId);

    if (collection === undefined) {
      throw new StrategyLibraryManagerError(
        "COLLECTION_NOT_FOUND",
        `Strategy library collection '${normalizedCollectionId}' was not found.`,
        { collectionId: normalizedCollectionId },
      );
    }

    return collection;
  }

  public listCollections(): readonly StrategyLibraryCollection[] {
    this.assertOperational();
    return this.registry.listCollections();
  }

  /* ------------------------------------------------------------------------ *
   * Release lifecycle
   * ------------------------------------------------------------------------ */

  public registerRelease(
    release: StrategyLibraryRelease,
  ): StrategyLibraryRelease {
    this.assertOperational();
    assertObject(release, "release");

    if (this.options.validateBeforeRegistration) {
      this.assertValidRelease(release);
    }

    return this.withMutation(() => {
      this.registry.registerRelease(release);
      return this.requireRelease(release.releaseId);
    });
  }

  public unregisterRelease(
    releaseId: StrategyLibraryReleaseId,
    requireExisting = false,
  ): boolean {
    this.assertOperational();
    const normalizedReleaseId = requiredIdentifier(
      releaseId,
      "releaseId",
    );

    return this.withMutation(() => {
      const removed = this.registry.unregisterRelease(normalizedReleaseId);

      if (!removed && requireExisting) {
        throw new StrategyLibraryManagerError(
          "RELEASE_NOT_FOUND",
          `Strategy library release '${normalizedReleaseId}' was not found.`,
          { releaseId: normalizedReleaseId },
        );
      }

      return removed;
    });
  }

  public getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined {
    this.assertOperational();
    return this.registry.getRelease(
      requiredIdentifier(releaseId, "releaseId"),
    );
  }

  public requireRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease {
    const normalizedReleaseId = requiredIdentifier(
      releaseId,
      "releaseId",
    );
    const release = this.registry.getRelease(normalizedReleaseId);

    if (release === undefined) {
      throw new StrategyLibraryManagerError(
        "RELEASE_NOT_FOUND",
        `Strategy library release '${normalizedReleaseId}' was not found.`,
        { releaseId: normalizedReleaseId },
      );
    }

    return release;
  }

  public listReleases(): readonly StrategyLibraryRelease[] {
    this.assertOperational();
    return this.registry.listReleases();
  }

  /* ------------------------------------------------------------------------ *
   * Provider loading and discovery
   * ------------------------------------------------------------------------ */

  public async loadProvider(
    provider: StrategyLibraryProvider,
  ): Promise<StrategyLibraryManagerProviderLoadReport> {
    this.assertOperational();
    assertObject(provider, "provider");

    this.lifecycleStateValue = "MUTATING";

    try {
      const report = await this.registry.loadProvider(provider);
      this.mutationSequenceValue += 1;
      return immutableCopy(report);
    } catch (cause) {
      throw new StrategyLibraryManagerError(
        "PROVIDER_LOAD_FAILED",
        `Strategy library provider '${String(provider.providerId)}' failed to load.`,
        {
          providerId: provider.providerId,
          cause,
        },
      );
    } finally {
      this.lifecycleStateValue = "READY";
    }
  }

  public hasLoadedProvider(
    providerId: StrategyLibraryProviderId,
  ): boolean {
    this.assertOperational();
    return this.registry.hasLoadedProvider(
      requiredIdentifier(providerId, "providerId"),
    );
  }

  public listLoadedProviderIds():
    readonly StrategyLibraryProviderId[] {
    this.assertOperational();
    return this.registry.listLoadedProviderIds();
  }

  public query(
    query: StrategyLibraryQuery = {},
  ): StrategyLibraryQueryResult {
    this.assertOperational();
    assertObject(query, "query");
    return this.registry.query(query);
  }

  /* ------------------------------------------------------------------------ *
   * Validation
   * ------------------------------------------------------------------------ */

  public validateEntry(
    entry: StrategyLibraryEntry,
  ): StrategyLibraryValidationReport {
    this.assertOperational();
    return this.validator.validateEntry(entry);
  }

  public validateCollection(
    collection: StrategyLibraryCollection,
  ): StrategyLibraryValidationReport {
    this.assertOperational();
    return this.validator.validateCollection(collection);
  }

  public validateRelease(
    release: StrategyLibraryRelease,
  ): StrategyLibraryValidationReport {
    this.assertOperational();
    return this.validator.validateRelease(release);
  }

  /* ------------------------------------------------------------------------ *
   * Deterministic atomic batch coordination
   * ------------------------------------------------------------------------ */

  public applyBatch(
    operations: readonly StrategyLibraryManagerBatchOperation[],
  ): StrategyLibraryManagerBatchResult {
    this.assertOperational();
    assertArray(operations, "operations");

    if (this.options.validateBatchBeforeMutation) {
      this.validateBatch(operations);
    }

    const before = this.registry.snapshot();
    let registeredEntryCount = 0;
    let registeredCollectionCount = 0;
    let registeredReleaseCount = 0;

    this.lifecycleStateValue = "MUTATING";

    try {
      operations.forEach((operation, index) => {
        try {
          switch (operation.type) {
            case "REGISTER_ENTRY":
              if (
                !this.options.validateBatchBeforeMutation &&
                this.options.validateBeforeRegistration
              ) {
                this.assertValidEntry(operation.entry);
              }
              this.registry.register(operation.entry);
              registeredEntryCount += 1;
              break;

            case "UNREGISTER_ENTRY": {
              const removed = this.registry.unregisterEntry(
                requiredIdentifier(
                  operation.entryId,
                  `operations[${index}].entryId`,
                ),
              );
              if (!removed && operation.requireExisting === true) {
                throw new StrategyLibraryManagerError(
                  "ENTRY_NOT_FOUND",
                  `Strategy library entry '${operation.entryId}' was not found.`,
                  {
                    entryId: operation.entryId,
                    operationIndex: index,
                  },
                );
              }
              break;
            }

            case "REGISTER_COLLECTION":
              if (
                !this.options.validateBatchBeforeMutation &&
                this.options.validateBeforeRegistration
              ) {
                this.assertValidCollection(operation.collection);
              }
              this.registry.registerCollection(operation.collection);
              registeredCollectionCount += 1;
              break;

            case "UNREGISTER_COLLECTION": {
              const removed = this.registry.unregisterCollection(
                requiredIdentifier(
                  operation.collectionId,
                  `operations[${index}].collectionId`,
                ),
              );
              if (!removed && operation.requireExisting === true) {
                throw new StrategyLibraryManagerError(
                  "COLLECTION_NOT_FOUND",
                  `Strategy library collection '${operation.collectionId}' was not found.`,
                  {
                    collectionId: operation.collectionId,
                    operationIndex: index,
                  },
                );
              }
              break;
            }

            case "REGISTER_RELEASE":
              if (
                !this.options.validateBatchBeforeMutation &&
                this.options.validateBeforeRegistration
              ) {
                this.assertValidRelease(operation.release);
              }
              this.registry.registerRelease(operation.release);
              registeredReleaseCount += 1;
              break;

            case "UNREGISTER_RELEASE": {
              const removed = this.registry.unregisterRelease(
                requiredIdentifier(
                  operation.releaseId,
                  `operations[${index}].releaseId`,
                ),
              );
              if (!removed && operation.requireExisting === true) {
                throw new StrategyLibraryManagerError(
                  "RELEASE_NOT_FOUND",
                  `Strategy library release '${operation.releaseId}' was not found.`,
                  {
                    releaseId: operation.releaseId,
                    operationIndex: index,
                  },
                );
              }
              break;
            }

            default:
              assertNever(operation);
          }
        } catch (cause) {
          throw new StrategyLibraryManagerError(
            "BATCH_OPERATION_FAILED",
            `Strategy library batch operation ${index} failed.`,
            {
              operationIndex: index,
              cause,
            },
          );
        }
      });

      this.mutationSequenceValue += 1;
      const completedAt = this.now();

      return immutableCopy({
        operationCount: operations.length,
        registeredEntryCount,
        registeredCollectionCount,
        registeredReleaseCount,
        mutationSequence: this.mutationSequenceValue,
        completedAt,
        snapshot: this.snapshotAt(completedAt),
        metadata: this.options.metadata,
      });
    } catch (cause) {
      if (this.options.rollbackFailedBatchOperations) {
        try {
          this.restoreRegistry(before);
        } catch (rollbackCause) {
          throw new StrategyLibraryManagerError(
            "ROLLBACK_FAILED",
            "Strategy library batch failed and registry rollback also failed.",
            {
              cause,
              rollbackCause,
            },
          );
        }
      }

      if (cause instanceof StrategyLibraryManagerError) {
        throw cause;
      }

      throw new StrategyLibraryManagerError(
        "BATCH_OPERATION_FAILED",
        "Strategy library batch operation failed.",
        { cause },
      );
    } finally {
      this.lifecycleStateValue = "READY";
    }
  }

  /* ------------------------------------------------------------------------ *
   * State, statistics, snapshots, and lifecycle
   * ------------------------------------------------------------------------ */

  public statistics(): StrategyLibraryStatistics {
    this.assertOperational();
    return this.registry.statistics();
  }

  public status(): StrategyLibraryManagerStatus {
    this.assertOperational();
    return this.statusAt(this.now());
  }

  public snapshot(): StrategyLibraryManagerSnapshot {
    this.assertOperational();
    return this.snapshotAt(this.now());
  }

  public clear(): void {
    this.assertOperational();

    this.withMutation(() => {
      this.registry.clear();
    });
  }

  public dispose(): void {
    if (this.lifecycleStateValue === "DISPOSED") {
      return;
    }

    this.registry.clear();
    this.mutationSequenceValue += 1;
    this.lifecycleStateValue = "DISPOSED";
  }

  public get lifecycleState(): StrategyLibraryManagerLifecycleState {
    return this.lifecycleStateValue;
  }

  public get mutationSequence(): number {
    return this.mutationSequenceValue;
  }

  public get metadata(): StrategyMetadata {
    return this.options.metadata;
  }

  /* ------------------------------------------------------------------------ *
   * Internal validation and mutation helpers
   * ------------------------------------------------------------------------ */

  private validateBatch(
    operations: readonly StrategyLibraryManagerBatchOperation[],
  ): void {
    operations.forEach((operation, index) => {
      assertObject(operation, `operations[${index}]`);

      switch (operation.type) {
        case "REGISTER_ENTRY":
          this.assertValidEntry(operation.entry);
          break;

        case "UNREGISTER_ENTRY":
          requiredIdentifier(
            operation.entryId,
            `operations[${index}].entryId`,
          );
          break;

        case "REGISTER_COLLECTION":
          this.assertValidCollection(operation.collection);
          break;

        case "UNREGISTER_COLLECTION":
          requiredIdentifier(
            operation.collectionId,
            `operations[${index}].collectionId`,
          );
          break;

        case "REGISTER_RELEASE":
          this.assertValidRelease(operation.release);
          break;

        case "UNREGISTER_RELEASE":
          requiredIdentifier(
            operation.releaseId,
            `operations[${index}].releaseId`,
          );
          break;

        default:
          assertNever(operation);
      }
    });
  }

  private assertValidEntry(entry: StrategyLibraryEntry): void {
    const report = this.validator.validateEntry(entry);

    if (!report.valid) {
      throw new StrategyLibraryManagerError(
        "INVALID_ENTRY",
        `Strategy library entry '${String(entry.entryId)}' is invalid.`,
        {
          entryId: entry.entryId,
          strategyId: entry.manifest.strategyId,
          strategyVersion: entry.manifest.version,
          validationReport: report,
        },
      );
    }
  }

  private assertValidCollection(
    collection: StrategyLibraryCollection,
  ): void {
    const report = this.validator.validateCollection(collection);

    if (!report.valid) {
      throw new StrategyLibraryManagerError(
        "INVALID_COLLECTION",
        `Strategy library collection '${String(collection.collectionId)}' is invalid.`,
        {
          collectionId: collection.collectionId,
          validationReport: report,
        },
      );
    }
  }

  private assertValidRelease(release: StrategyLibraryRelease): void {
    const report = this.validator.validateRelease(release);

    if (!report.valid) {
      throw new StrategyLibraryManagerError(
        "INVALID_RELEASE",
        `Strategy library release '${String(release.releaseId)}' is invalid.`,
        {
          releaseId: release.releaseId,
          validationReport: report,
        },
      );
    }
  }

  private withMutation<TValue>(operation: () => TValue): TValue {
    this.lifecycleStateValue = "MUTATING";

    try {
      const result = operation();
      this.mutationSequenceValue += 1;
      return result;
    } finally {
      this.lifecycleStateValue = "READY";
    }
  }

  private restoreRegistry(snapshot: StrategyLibrarySnapshot): void {
    this.registry.clear();

    if (snapshot.entries.length > 0) {
      this.registry.registerMany(snapshot.entries);
    }

    for (const collection of snapshot.collections) {
      this.registry.registerCollection(collection);
    }

    for (const release of snapshot.releases) {
      this.registry.registerRelease(release);
    }
  }

  private snapshotAt(
    capturedAt: UnixTimestampMilliseconds,
  ): StrategyLibraryManagerSnapshot {
    assertTimestamp(capturedAt, "capturedAt");

    const librarySnapshot = this.registry.snapshot();
    const library = immutableCopy({
      ...librarySnapshot,
      capturedAt,
    });

    return immutableCopy({
      library,
      status: this.statusAt(capturedAt),
      loadedProviderIds: this.registry.listLoadedProviderIds(),
      metadata: this.options.metadata,
    });
  }

  private statusAt(
    capturedAt: UnixTimestampMilliseconds,
  ): StrategyLibraryManagerStatus {
    assertTimestamp(capturedAt, "capturedAt");

    return immutableCopy({
      schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
      lifecycleState: this.lifecycleStateValue,
      entryCount: this.registry.countEntries(),
      strategyCount: this.registry.countStrategies(),
      collectionCount: this.registry.countCollections(),
      releaseCount: this.registry.countReleases(),
      loadedProviderCount:
        this.registry.listLoadedProviderIds().length,
      mutationSequence: this.mutationSequenceValue,
      capturedAt,
      metadata: this.options.metadata,
    });
  }

  private now(): UnixTimestampMilliseconds {
    const timestamp = this.options.clock.now();
    assertTimestamp(timestamp, "clock.now()");
    return timestamp;
  }

  private assertOperational(): void {
    if (
      this.options.rejectOperationsAfterDispose &&
      this.lifecycleStateValue === "DISPOSED"
    ) {
      throw new StrategyLibraryManagerError(
        "MANAGER_DISPOSED",
        "Strategy library manager has been disposed.",
      );
    }
  }
}

/* ========================================================================== *
 * Factory
 * ========================================================================== */

export function createStrategyLibraryManager(
  dependencies: StrategyLibraryManagerDependencies,
  options: StrategyLibraryManagerOptions = {},
): StrategyLibraryManager {
  return new StrategyLibraryManager(dependencies, options);
}

/* ========================================================================== *
 * Defaults and utility functions
 * ========================================================================== */

const SYSTEM_CLOCK: StrategyLibraryManagerClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

const DEFAULT_VALIDATOR: StrategyLibraryValidator =
  new StrategyLibraryValidator();

function resolveOptions(
  options: StrategyLibraryManagerOptions,
): ResolvedStrategyLibraryManagerOptions {
  const optionsValue: unknown = options;

  if (
    optionsValue === null ||
    typeof optionsValue !== "object" ||
    Array.isArray(optionsValue)
  ) {
    throw new StrategyLibraryManagerError(
      "INVALID_ARGUMENT",
      "options must be an object.",
    );
  }

  const clockOption = options.clock;
  let clock: StrategyLibraryManagerClock;

  if (typeof clockOption === "function") {
    clock = Object.freeze({
      now: (): UnixTimestampMilliseconds => clockOption(),
    });
  } else if (clockOption === undefined) {
    clock = SYSTEM_CLOCK;
  } else {
    clock = clockOption;
  }

  if (typeof clock.now !== "function") {
    throw new StrategyLibraryManagerError(
      "INVALID_ARGUMENT",
      "options.clock must expose a now() function.",
    );
  }

  const validateBeforeRegistration =
    options.validateBeforeRegistration ?? true;

  const validateBatchBeforeMutation =
    options.validateBatchBeforeMutation ?? true;

  const rollbackFailedBatchOperations =
    options.rollbackFailedBatchOperations ?? true;

  const rejectOperationsAfterDispose =
    options.rejectOperationsAfterDispose ?? true;

  const metadata: StrategyMetadata = immutableCopy(
    options.metadata ?? EMPTY_STRATEGY_METADATA,
  );

  return Object.freeze({
    validateBeforeRegistration,
    validateBatchBeforeMutation,
    rollbackFailedBatchOperations,
    rejectOperationsAfterDispose,
    clock,
    metadata,
  });
}

function assertDependencies(
  dependencies: StrategyLibraryManagerDependencies,
): void {
  assertObject(dependencies, "dependencies");

  const requiredKeys: readonly (
    keyof StrategyLibraryManagerDependencies
  )[] = Object.freeze([
    "registry",
    "providerLoader",
    "entryBuilder",
    "collectionManager",
    "releaseManager",
    "searchEngine",
    "compatibilityEngine",
    "recommendationEngine",
    "comparisonEngine",
    "documentationEngine",
    "exportEngine",
    "importEngine",
  ]);

  for (const key of requiredKeys) {
    if (dependencies[key] === undefined || dependencies[key] === null) {
      throw new StrategyLibraryManagerError(
        "INVALID_ARGUMENT",
        `dependencies.${key} is required.`,
      );
    }
  }
}

function requiredIdentifier<TValue extends string>(
  value: TValue,
  field: string,
): TValue {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyLibraryManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim() as TValue;
}

function assertTimestamp(value: unknown, field: string): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new StrategyLibraryManagerError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
  }
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new StrategyLibraryManagerError(
      "INVALID_ARGUMENT",
      `${field} must be an object.`,
    );
  }
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new StrategyLibraryManagerError(
      "INVALID_ARGUMENT",
      `${field} must be an array.`,
    );
  }
}

function assertNever(value: never): never {
  throw new StrategyLibraryManagerError(
    "INVALID_ARGUMENT",
    `Unsupported strategy library manager operation: ${String(value)}.`,
  );
}

function deepClone<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as TValue;
  }

  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Readonly<Record<string, unknown>>,
    )) {
      clone[key] = deepClone(nestedValue);
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

  for (const nestedValue of Object.values(
    value as Readonly<Record<string, unknown>>,
  )) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function immutableCopy<TValue>(value: TValue): TValue {
  return deepFreeze(deepClone(value));
}

/**
 * Immutable empty values retained for consumers that need manager-level
 * defaults without allocating new arrays.
 */
export const EMPTY_STRATEGY_LIBRARY_MANAGER_ENTRIES =
  EMPTY_STRATEGY_LIBRARY_ENTRIES;

export const EMPTY_STRATEGY_LIBRARY_MANAGER_COLLECTIONS =
  EMPTY_STRATEGY_LIBRARY_COLLECTIONS;

export const EMPTY_STRATEGY_LIBRARY_MANAGER_RELEASES =
  EMPTY_STRATEGY_LIBRARY_RELEASES;