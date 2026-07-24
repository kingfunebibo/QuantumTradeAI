/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-registry.ts
 *
 * Purpose:
 * Provides deterministic, version-aware registration, discovery, querying,
 * provider loading, collection/release management, statistics, and immutable
 * snapshots for the Professional Trading Strategy Library.
 *
 * The library registry complements the Professional Strategy Framework. It
 * does not create or execute strategies. Optional framework-registry linkage
 * verifies that catalogued strategy versions are backed by registered runtime
 * factories.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyFactory,
  type StrategyId,
  type StrategyMetadata,
  type StrategyRegistry,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  compareStrategyVersions,
} from "../strategy-framework/strategy-registry";

import {
  EMPTY_STRATEGY_LIBRARY_COLLECTIONS,
  EMPTY_STRATEGY_LIBRARY_ENTRIES,
  EMPTY_STRATEGY_LIBRARY_RELEASES,
  STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT,
  STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT,
  STRATEGY_LIBRARY_SCHEMA_VERSION,
  type StrategyLibraryCollection,
  type StrategyLibraryCollectionId,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryFamily,
  type StrategyLibraryMarketRegime,
  type StrategyLibraryProvider,
  type StrategyLibraryProviderId,
  type StrategyLibraryQuery,
  type StrategyLibraryQueryResult,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseId,
  type StrategyLibraryRiskLevel,
  type StrategyLibrarySnapshot,
  type StrategyLibrarySortDirection,
  type StrategyLibrarySortField,
  type StrategyLibraryStatistics,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

import {
  StrategyLibraryValidator,
} from "./strategy-library-validator";

/* ========================================================================== *
 * Errors, clocks, options, and reports
 * ========================================================================== */

export type StrategyLibraryRegistryErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_ENTRY"
  | "INVALID_COLLECTION"
  | "INVALID_RELEASE"
  | "DUPLICATE_ENTRY_ID"
  | "DUPLICATE_STRATEGY_VERSION"
  | "COLLECTION_NOT_FOUND"
  | "RELEASE_NOT_FOUND"
  | "FRAMEWORK_STRATEGY_NOT_REGISTERED"
  | "FRAMEWORK_MANIFEST_MISMATCH"
  | "PROVIDER_ALREADY_LOADED"
  | "PROVIDER_LOAD_FAILED";

export class StrategyLibraryRegistryError extends Error {
  public readonly code: StrategyLibraryRegistryErrorCode;
  public readonly entryId?: StrategyLibraryEntryId;
  public readonly strategyId?: StrategyId;
  public readonly strategyVersion?: StrategyVersion;
  public readonly collectionId?: StrategyLibraryCollectionId;
  public readonly releaseId?: StrategyLibraryReleaseId;
  public readonly providerId?: StrategyLibraryProviderId;
  public readonly validationReport?: StrategyLibraryValidationReport;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryRegistryErrorCode,
    message: string,
    details: {
      readonly entryId?: StrategyLibraryEntryId;
      readonly strategyId?: StrategyId;
      readonly strategyVersion?: StrategyVersion;
      readonly collectionId?: StrategyLibraryCollectionId;
      readonly releaseId?: StrategyLibraryReleaseId;
      readonly providerId?: StrategyLibraryProviderId;
      readonly validationReport?: StrategyLibraryValidationReport;
      readonly cause?: unknown;
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyLibraryRegistryError";
    this.code = code;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.collectionId = details.collectionId;
    this.releaseId = details.releaseId;
    this.providerId = details.providerId;
    this.validationReport = details.validationReport;
    this.cause = details.cause;
    this.metadata = freezeMetadata(details.metadata);
    Object.setPrototypeOf(this, StrategyLibraryRegistryError.prototype);
  }
}

export interface StrategyLibraryRegistryClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryRegistryOptions {
  readonly allowEntryReplacement: boolean;
  readonly allowCollectionReplacement: boolean;
  readonly allowReleaseReplacement: boolean;
  readonly preserveRegistrationOrder: boolean;
  readonly requireFrameworkRegistration: boolean;
  readonly validateFrameworkManifestIdentity: boolean;
  readonly rejectDuplicateProviderLoads: boolean;
  readonly queryLimit: number;
  readonly maximumQueryLimit: number;
  readonly metadata: StrategyMetadata;
}

export const DEFAULT_STRATEGY_LIBRARY_REGISTRY_OPTIONS:
  StrategyLibraryRegistryOptions = Object.freeze({
    allowEntryReplacement: false,
    allowCollectionReplacement: false,
    allowReleaseReplacement: false,
    preserveRegistrationOrder: true,
    requireFrameworkRegistration: false,
    validateFrameworkManifestIdentity: true,
    rejectDuplicateProviderLoads: true,
    queryLimit: STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT,
    maximumQueryLimit: STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT,
    metadata: EMPTY_STRATEGY_METADATA,
  });

export interface StrategyLibraryProviderLoadReport {
  readonly providerId: StrategyLibraryProviderId;
  readonly loadedEntries: number;
  readonly loadedCollections: number;
  readonly loadedReleases: number;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

interface InternalEntry {
  readonly value: StrategyLibraryEntry;
  readonly sequence: number;
}

interface InternalCollection {
  readonly value: StrategyLibraryCollection;
  readonly sequence: number;
}

interface InternalRelease {
  readonly value: StrategyLibraryRelease;
  readonly sequence: number;
}

interface VersionAwareStrategyRegistry extends StrategyRegistry {
  getVersion(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): StrategyFactory | undefined;
}

const DEFAULT_CLOCK: StrategyLibraryRegistryClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

/* ========================================================================== *
 * Immutable utility functions
 * ========================================================================== */

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Readonly<Record<string, unknown>>,
    )) {
      output[key] = deepClone(nestedValue);
    }

    return output as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(
      value as Readonly<Record<string, unknown>>,
    )) {
      deepFreeze(nestedValue);
    }

    Object.freeze(value);
  }

  return value;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(deepClone(value));
}

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  return immutableCopy(metadata ?? EMPTY_STRATEGY_METADATA);
}

function normalizeRequiredIdentifier(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyLibraryRegistryError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en-US", {
    sensitivity: "base",
    numeric: true,
  });
}

function assertTimestamp(value: number, field = "timestamp"): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyLibraryRegistryError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StrategyLibraryRegistryError(
      "INVALID_ARGUMENT",
      `${field} must be a positive integer.`,
    );
  }
}

function strategyVersionKey(
  strategyId: StrategyId,
  strategyVersion: StrategyVersion,
): string {
  return `${strategyId}\u0000${strategyVersion}`;
}

function normalizedSet(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map(normalizeSearchText));
}

function intersects(
  values: readonly string[],
  expected: ReadonlySet<string>,
): boolean {
  if (expected.size === 0) {
    return true;
  }

  return values.some((value) => expected.has(normalizeSearchText(value)));
}

function includesAll(
  values: readonly string[],
  expected: ReadonlySet<string>,
): boolean {
  if (expected.size === 0) {
    return true;
  }

  const actual = normalizedSet(values);
  return [...expected].every((value) => actual.has(value));
}

function statusRank(status: StrategyLibraryEntry["status"]): number {
  const ranks: Readonly<Record<StrategyLibraryEntry["status"], number>> =
    Object.freeze({
      DRAFT: 0,
      EXPERIMENTAL: 1,
      BACKTEST_READY: 2,
      PAPER_READY: 3,
      LIVE_READY: 4,
      DEPRECATED: 5,
      RETIRED: 6,
    });

  return ranks[status];
}

function verificationRank(
  status: StrategyLibraryEntry["verificationStatus"],
): number {
  const ranks: Readonly<
    Record<StrategyLibraryEntry["verificationStatus"], number>
  > = Object.freeze({
    UNVERIFIED: 0,
    VALIDATED: 1,
    BACKTESTED: 2,
    PAPER_VERIFIED: 3,
    LIVE_VERIFIED: 4,
    CERTIFIED: 5,
  });

  return ranks[status];
}

function riskRank(level: StrategyLibraryRiskLevel): number {
  const ranks: Readonly<Record<StrategyLibraryRiskLevel, number>> =
    Object.freeze({
      VERY_LOW: 0,
      LOW: 1,
      MODERATE: 2,
      HIGH: 3,
      VERY_HIGH: 4,
    });

  return ranks[level];
}

function incrementRecord<TKey extends string>(
  target: Partial<Record<TKey, number>>,
  key: TKey,
): void {
  target[key] = (target[key] ?? 0) + 1;
}

/* ========================================================================== *
 * Registry implementation
 * ========================================================================== */

export class StrategyLibraryRegistry implements StrategyLibraryRegistryPort {
  private readonly validator: StrategyLibraryValidatorPort;
  private readonly frameworkRegistry?: StrategyRegistry;
  private readonly clock: StrategyLibraryRegistryClock;
  private readonly options: StrategyLibraryRegistryOptions;

  private readonly entriesByEntryId = new Map<
    StrategyLibraryEntryId,
    InternalEntry
  >();

  private readonly entriesByStrategy = new Map<
    StrategyId,
    Map<StrategyVersion, InternalEntry>
  >();

  private readonly collectionsById = new Map<
    StrategyLibraryCollectionId,
    InternalCollection
  >();

  private readonly releasesById = new Map<
    StrategyLibraryReleaseId,
    InternalRelease
  >();

  private readonly loadedProviders = new Set<StrategyLibraryProviderId>();

  private sequence = 0;

  public constructor(
    dependencies: {
      readonly validator?: StrategyLibraryValidatorPort;
      readonly frameworkRegistry?: StrategyRegistry;
      readonly clock?: StrategyLibraryRegistryClock;
      readonly options?: Partial<StrategyLibraryRegistryOptions>;
    } = {},
  ) {
    this.validator = dependencies.validator ?? new StrategyLibraryValidator();
    this.frameworkRegistry = dependencies.frameworkRegistry;
    this.clock = dependencies.clock ?? DEFAULT_CLOCK;

    const options: StrategyLibraryRegistryOptions = Object.freeze({
      ...DEFAULT_STRATEGY_LIBRARY_REGISTRY_OPTIONS,
      ...dependencies.options,
      metadata: freezeMetadata(
        dependencies.options?.metadata ??
          DEFAULT_STRATEGY_LIBRARY_REGISTRY_OPTIONS.metadata,
      ),
    });

    assertPositiveInteger(options.queryLimit, "options.queryLimit");
    assertPositiveInteger(options.maximumQueryLimit, "options.maximumQueryLimit");

    if (options.queryLimit > options.maximumQueryLimit) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "options.queryLimit cannot exceed options.maximumQueryLimit.",
      );
    }

    if (options.requireFrameworkRegistration && !this.frameworkRegistry) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "frameworkRegistry is required when requireFrameworkRegistration is enabled.",
      );
    }

    this.options = options;
  }

  /* ------------------------------------------------------------------------ *
   * Entry registration and lookup
   * ------------------------------------------------------------------------ */

  public register(entry: StrategyLibraryEntry): void {
    this.registerAt(entry, this.now());
  }

  public registerAt(
    entry: StrategyLibraryEntry,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    assertTimestamp(timestamp);
    this.assertEntry(entry);

    const entryId = normalizeRequiredIdentifier(entry.entryId, "entry.entryId");
    const strategyId = normalizeRequiredIdentifier(
      entry.strategyId,
      "entry.strategyId",
    );
    const strategyVersion = normalizeRequiredIdentifier(
      entry.strategyVersion,
      "entry.strategyVersion",
    );

    const report = this.validator.validateEntry(entry);

    if (!report.valid) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ENTRY",
        `Strategy library entry '${entryId}' is invalid.`,
        {
          entryId,
          strategyId,
          strategyVersion,
          validationReport: report,
          metadata: this.options.metadata,
        },
      );
    }

    this.assertFrameworkCompatibility(entry);

    const existingByEntryId = this.entriesByEntryId.get(entryId);
    const existingByVersion = this.entriesByStrategy
      .get(strategyId)
      ?.get(strategyVersion);

    if (existingByEntryId !== undefined && existingByEntryId.value !== entry) {
      if (!this.options.allowEntryReplacement) {
        throw new StrategyLibraryRegistryError(
          "DUPLICATE_ENTRY_ID",
          `Strategy library entryId '${entryId}' is already registered.`,
          { entryId, strategyId, strategyVersion },
        );
      }

      this.removeInternalEntry(existingByEntryId);
    }

    if (existingByVersion !== undefined && existingByVersion.value !== entry) {
      if (!this.options.allowEntryReplacement) {
        throw new StrategyLibraryRegistryError(
          "DUPLICATE_STRATEGY_VERSION",
          `Strategy '${strategyId}' version '${strategyVersion}' is already catalogued.`,
          { entryId, strategyId, strategyVersion },
        );
      }

      this.removeInternalEntry(existingByVersion);
    }

    if (
      existingByEntryId?.value === entry &&
      existingByVersion?.value === entry
    ) {
      return;
    }

    this.sequence += 1;

    const internal: InternalEntry = Object.freeze({
      value: immutableCopy(entry),
      sequence: this.sequence,
    });

    const versions =
      this.entriesByStrategy.get(strategyId) ??
      new Map<StrategyVersion, InternalEntry>();

    versions.set(strategyVersion, internal);
    this.entriesByStrategy.set(strategyId, versions);
    this.entriesByEntryId.set(entryId, internal);
  }

  public registerMany(entries: readonly StrategyLibraryEntry[]): void {
    if (!Array.isArray(entries)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "entries must be an array.",
      );
    }

    const staged = new StrategyLibraryRegistry({
      validator: this.validator,
      frameworkRegistry: this.frameworkRegistry,
      clock: this.clock,
      options: {
        ...this.options,
        allowEntryReplacement: this.options.allowEntryReplacement,
      },
    });

    for (const existing of this.list()) {
      staged.register(existing);
    }

    for (const entry of entries) {
      staged.register(entry);
    }

    this.replaceEntriesFrom(staged);
  }

  public unregister(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );

    if (strategyVersion !== undefined) {
      const normalizedVersion = normalizeRequiredIdentifier(
        strategyVersion,
        "strategyVersion",
      );
      const internal = this.entriesByStrategy
        .get(normalizedStrategyId)
        ?.get(normalizedVersion);

      if (internal === undefined) {
        return false;
      }

      this.removeInternalEntry(internal);
      return true;
    }

    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined) {
      return false;
    }

    for (const internal of [...versions.values()]) {
      this.removeInternalEntry(internal);
    }

    return true;
  }

  public unregisterEntry(entryId: StrategyLibraryEntryId): boolean {
    const normalizedEntryId = normalizeRequiredIdentifier(entryId, "entryId");
    const internal = this.entriesByEntryId.get(normalizedEntryId);

    if (internal === undefined) {
      return false;
    }

    this.removeInternalEntry(internal);
    return true;
  }

  public has(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );

    if (strategyVersion === undefined) {
      return this.entriesByStrategy.has(normalizedStrategyId);
    }

    return (
      this.entriesByStrategy
        .get(normalizedStrategyId)
        ?.has(normalizeRequiredIdentifier(strategyVersion, "strategyVersion")) ??
      false
    );
  }

  public hasEntry(entryId: StrategyLibraryEntryId): boolean {
    return this.entriesByEntryId.has(
      normalizeRequiredIdentifier(entryId, "entryId"),
    );
  }

  public get(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
  ): StrategyLibraryEntry | undefined {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );

    if (strategyVersion !== undefined) {
      return this.entriesByStrategy
        .get(normalizedStrategyId)
        ?.get(normalizeRequiredIdentifier(strategyVersion, "strategyVersion"))
        ?.value;
    }

    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined || versions.size === 0) {
      return undefined;
    }

    let latest: InternalEntry | undefined;

    for (const internal of versions.values()) {
      if (
        latest === undefined ||
        compareStrategyVersions(
          internal.value.strategyVersion,
          latest.value.strategyVersion,
        ) > 0
      ) {
        latest = internal;
      }
    }

    return latest?.value;
  }

  public getByEntryId(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry | undefined {
    return this.entriesByEntryId.get(
      normalizeRequiredIdentifier(entryId, "entryId"),
    )?.value;
  }

  public list(): readonly StrategyLibraryEntry[] {
    return Object.freeze(
      this.listInternalEntries().map((internal) => internal.value),
    );
  }

  public listVersions(strategyId: StrategyId): readonly StrategyLibraryEntry[] {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined) {
      return EMPTY_STRATEGY_LIBRARY_ENTRIES;
    }

    return Object.freeze(
      [...versions.values()]
        .sort((left, right) =>
          compareStrategyVersions(
            right.value.strategyVersion,
            left.value.strategyVersion,
          ),
        )
        .map((internal) => internal.value),
    );
  }

  /* ------------------------------------------------------------------------ *
   * Collection operations
   * ------------------------------------------------------------------------ */

  public registerCollection(collection: StrategyLibraryCollection): void {
    this.registerCollectionAt(collection, this.now());
  }

  public registerCollectionAt(
    collection: StrategyLibraryCollection,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    assertTimestamp(timestamp);
    this.assertCollection(collection);

    const collectionId = normalizeRequiredIdentifier(
      collection.collectionId,
      "collection.collectionId",
    );
    const report = this.validator.validateCollection(collection);

    if (!report.valid) {
      throw new StrategyLibraryRegistryError(
        "INVALID_COLLECTION",
        `Strategy library collection '${collectionId}' is invalid.`,
        { collectionId, validationReport: report },
      );
    }

    const existing = this.collectionsById.get(collectionId);

    if (existing !== undefined) {
      if (existing.value === collection) {
        return;
      }

      if (!this.options.allowCollectionReplacement) {
        throw new StrategyLibraryRegistryError(
          "INVALID_COLLECTION",
          `Strategy library collection '${collectionId}' is already registered.`,
          { collectionId },
        );
      }
    }

    this.sequence += 1;
    this.collectionsById.set(
      collectionId,
      Object.freeze({
        value: immutableCopy(collection),
        sequence: this.sequence,
      }),
    );
  }

  public unregisterCollection(
    collectionId: StrategyLibraryCollectionId,
  ): boolean {
    return this.collectionsById.delete(
      normalizeRequiredIdentifier(collectionId, "collectionId"),
    );
  }

  public getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined {
    return this.collectionsById.get(
      normalizeRequiredIdentifier(collectionId, "collectionId"),
    )?.value;
  }

  public listCollections(): readonly StrategyLibraryCollection[] {
    if (this.collectionsById.size === 0) {
      return EMPTY_STRATEGY_LIBRARY_COLLECTIONS;
    }

    return Object.freeze(
      [...this.collectionsById.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((internal) => internal.value),
    );
  }

  /* ------------------------------------------------------------------------ *
   * Release operations
   * ------------------------------------------------------------------------ */

  public registerRelease(release: StrategyLibraryRelease): void {
    this.registerReleaseAt(release, this.now());
  }

  public registerReleaseAt(
    release: StrategyLibraryRelease,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    assertTimestamp(timestamp);
    this.assertRelease(release);

    const releaseId = normalizeRequiredIdentifier(
      release.releaseId,
      "release.releaseId",
    );
    const report = this.validator.validateRelease(release);

    if (!report.valid) {
      throw new StrategyLibraryRegistryError(
        "INVALID_RELEASE",
        `Strategy library release '${releaseId}' is invalid.`,
        { releaseId, validationReport: report },
      );
    }

    const existing = this.releasesById.get(releaseId);

    if (existing !== undefined) {
      if (existing.value === release) {
        return;
      }

      if (!this.options.allowReleaseReplacement) {
        throw new StrategyLibraryRegistryError(
          "INVALID_RELEASE",
          `Strategy library release '${releaseId}' is already registered.`,
          { releaseId },
        );
      }
    }

    this.sequence += 1;
    this.releasesById.set(
      releaseId,
      Object.freeze({
        value: immutableCopy(release),
        sequence: this.sequence,
      }),
    );
  }

  public unregisterRelease(releaseId: StrategyLibraryReleaseId): boolean {
    return this.releasesById.delete(
      normalizeRequiredIdentifier(releaseId, "releaseId"),
    );
  }

  public getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined {
    return this.releasesById.get(
      normalizeRequiredIdentifier(releaseId, "releaseId"),
    )?.value;
  }

  public listReleases(): readonly StrategyLibraryRelease[] {
    if (this.releasesById.size === 0) {
      return EMPTY_STRATEGY_LIBRARY_RELEASES;
    }

    return Object.freeze(
      [...this.releasesById.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((internal) => internal.value),
    );
  }

  /* ------------------------------------------------------------------------ *
   * Provider loading
   * ------------------------------------------------------------------------ */

  public async loadProvider(
    provider: StrategyLibraryProvider,
  ): Promise<StrategyLibraryProviderLoadReport> {
    if (!isObject(provider)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "provider must be an object.",
      );
    }

    const providerId = normalizeRequiredIdentifier(
      provider.providerId,
      "provider.providerId",
    );

    if (
      this.options.rejectDuplicateProviderLoads &&
      this.loadedProviders.has(providerId)
    ) {
      throw new StrategyLibraryRegistryError(
        "PROVIDER_ALREADY_LOADED",
        `Strategy library provider '${providerId}' has already been loaded.`,
        { providerId },
      );
    }

    try {
      const entries = await Promise.resolve(provider.listEntries());
      const collections = provider.listCollections
        ? await Promise.resolve(provider.listCollections())
        : EMPTY_STRATEGY_LIBRARY_COLLECTIONS;
      const releases = provider.listReleases
        ? await Promise.resolve(provider.listReleases())
        : EMPTY_STRATEGY_LIBRARY_RELEASES;

      const staged = this.cloneRegistry();
      staged.registerMany(entries);

      for (const collection of collections) {
        staged.registerCollection(collection);
      }

      for (const release of releases) {
        staged.registerRelease(release);
      }

      this.replaceAllFrom(staged);
      this.loadedProviders.add(providerId);

      return deepFreeze({
        providerId,
        loadedEntries: entries.length,
        loadedCollections: collections.length,
        loadedReleases: releases.length,
        loadedAt: this.now(),
        metadata: this.options.metadata,
      });
    } catch (error) {
      if (error instanceof StrategyLibraryRegistryError) {
        throw error;
      }

      throw new StrategyLibraryRegistryError(
        "PROVIDER_LOAD_FAILED",
        `Failed to load strategy library provider '${providerId}'.`,
        { providerId, cause: error },
      );
    }
  }

  public hasLoadedProvider(providerId: StrategyLibraryProviderId): boolean {
    return this.loadedProviders.has(
      normalizeRequiredIdentifier(providerId, "providerId"),
    );
  }

  public listLoadedProviderIds(): readonly StrategyLibraryProviderId[] {
    return Object.freeze([...this.loadedProviders].sort(compareText));
  }

  /* ------------------------------------------------------------------------ *
   * Querying
   * ------------------------------------------------------------------------ */

  public query(query: StrategyLibraryQuery = {}): StrategyLibraryQueryResult {
    if (typeof query !== "object" || query === null || Array.isArray(query)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "query must be an object.",
      );
    }

    const normalizedQuery = immutableCopy(query);
    const offset = this.resolveOffset(query.offset);
    const limit = this.resolveLimit(query.limit);
    const filtered = this.list().filter((entry) => this.matches(entry, query));
    const sorted = this.sortEntries(filtered, query.sortBy, query.sortDirection);

    return deepFreeze({
      query: normalizedQuery,
      total: sorted.length,
      offset,
      limit,
      entries: sorted.slice(offset, offset + limit),
      generatedAt: this.now(),
      metadata: this.options.metadata,
    });
  }

  /* ------------------------------------------------------------------------ *
   * Statistics, snapshots, and maintenance
   * ------------------------------------------------------------------------ */

  public statistics(): StrategyLibraryStatistics {
    const familyCounts: Partial<Record<StrategyLibraryFamily, number>> = {};
    const riskLevelCounts: Partial<Record<StrategyLibraryRiskLevel, number>> = {};
    const verificationCounts: Partial<
      Record<StrategyLibraryEntry["verificationStatus"], number>
    > = {};

    let activeEntries = 0;
    let deprecatedEntries = 0;
    let retiredEntries = 0;
    let liveReadyEntries = 0;
    let certifiedEntries = 0;

    for (const entry of this.list()) {
      incrementRecord(familyCounts, entry.family);
      incrementRecord(riskLevelCounts, entry.riskProfile.overallRiskLevel);
      incrementRecord(verificationCounts, entry.verificationStatus);

      if (entry.status === "DEPRECATED") {
        deprecatedEntries += 1;
      } else if (entry.status === "RETIRED") {
        retiredEntries += 1;
      } else {
        activeEntries += 1;
      }

      if (entry.status === "LIVE_READY") {
        liveReadyEntries += 1;
      }

      if (entry.verificationStatus === "CERTIFIED") {
        certifiedEntries += 1;
      }
    }

    return deepFreeze({
      totalEntries: this.entriesByEntryId.size,
      activeEntries,
      deprecatedEntries,
      retiredEntries,
      liveReadyEntries,
      certifiedEntries,
      familyCounts,
      riskLevelCounts,
      verificationCounts,
    });
  }

  public snapshot(): StrategyLibrarySnapshot {
    return deepFreeze({
      schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
      capturedAt: this.now(),
      entries: [...this.list()],
      collections: [...this.listCollections()],
      releases: [...this.listReleases()],
      statistics: this.statistics(),
      metadata: this.options.metadata,
    });
  }

  public clear(): void {
    this.entriesByEntryId.clear();
    this.entriesByStrategy.clear();
    this.collectionsById.clear();
    this.releasesById.clear();
    this.loadedProviders.clear();
  }

  public countEntries(): number {
    return this.entriesByEntryId.size;
  }

  public countStrategies(): number {
    return this.entriesByStrategy.size;
  }

  public countCollections(): number {
    return this.collectionsById.size;
  }

  public countReleases(): number {
    return this.releasesById.size;
  }

  /* ------------------------------------------------------------------------ *
   * Internal operations
   * ------------------------------------------------------------------------ */

  private now(): UnixTimestampMilliseconds {
    const value = this.clock.now();
    assertTimestamp(value, "clock.now()");
    return value;
  }

  private assertEntry(entry: StrategyLibraryEntry): void {
    if (!isObject(entry)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "entry must be an object.",
      );
    }
  }

  private assertCollection(collection: StrategyLibraryCollection): void {
    if (!isObject(collection)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "collection must be an object.",
      );
    }
  }

  private assertRelease(release: StrategyLibraryRelease): void {
    if (!isObject(release)) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "release must be an object.",
      );
    }
  }

  private assertFrameworkCompatibility(entry: StrategyLibraryEntry): void {
    if (!this.frameworkRegistry) {
      return;
    }

    const versionAware = this.frameworkRegistry as VersionAwareStrategyRegistry;
    const factory =
      typeof versionAware.getVersion === "function"
        ? versionAware.getVersion(entry.strategyId, entry.strategyVersion)
        : this.frameworkRegistry.get(entry.strategyId);

    if (factory === undefined) {
      if (this.options.requireFrameworkRegistration) {
        throw new StrategyLibraryRegistryError(
          "FRAMEWORK_STRATEGY_NOT_REGISTERED",
          `Strategy '${entry.strategyId}' version '${entry.strategyVersion}' is not registered in the Professional Strategy Framework.`,
          {
            entryId: entry.entryId,
            strategyId: entry.strategyId,
            strategyVersion: entry.strategyVersion,
          },
        );
      }

      return;
    }

    if (!this.options.validateFrameworkManifestIdentity) {
      return;
    }

    if (
      factory.manifest.strategyId !== entry.manifest.strategyId ||
      factory.manifest.version !== entry.manifest.version
    ) {
      throw new StrategyLibraryRegistryError(
        "FRAMEWORK_MANIFEST_MISMATCH",
        `Library entry '${entry.entryId}' does not match its framework factory manifest identity.`,
        {
          entryId: entry.entryId,
          strategyId: entry.strategyId,
          strategyVersion: entry.strategyVersion,
        },
      );
    }
  }

  private removeInternalEntry(internal: InternalEntry): void {
    const { entryId, strategyId, strategyVersion } = internal.value;
    this.entriesByEntryId.delete(entryId);

    const versions = this.entriesByStrategy.get(strategyId);
    versions?.delete(strategyVersion);

    if (versions?.size === 0) {
      this.entriesByStrategy.delete(strategyId);
    }
  }

  private listInternalEntries(): readonly InternalEntry[] {
    const entries = [...this.entriesByEntryId.values()];

    if (this.options.preserveRegistrationOrder) {
      return entries.sort((left, right) => left.sequence - right.sequence);
    }

    return entries.sort((left, right) => {
      const strategyComparison = compareText(
        left.value.strategyId,
        right.value.strategyId,
      );

      if (strategyComparison !== 0) {
        return strategyComparison;
      }

      return compareStrategyVersions(
        right.value.strategyVersion,
        left.value.strategyVersion,
      );
    });
  }

  private resolveOffset(offset: number | undefined): number {
    if (offset === undefined) {
      return 0;
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "query.offset must be a non-negative integer.",
      );
    }

    return offset;
  }

  private resolveLimit(limit: number | undefined): number {
    const resolved = limit ?? this.options.queryLimit;

    if (!Number.isInteger(resolved) || resolved <= 0) {
      throw new StrategyLibraryRegistryError(
        "INVALID_ARGUMENT",
        "query.limit must be a positive integer.",
      );
    }

    return Math.min(resolved, this.options.maximumQueryLimit);
  }

  private matches(
    entry: StrategyLibraryEntry,
    query: StrategyLibraryQuery,
  ): boolean {
    if (!query.includeDeprecated && entry.status === "DEPRECATED") {
      return false;
    }

    if (!query.includeRetired && entry.status === "RETIRED") {
      return false;
    }

    if (query.text !== undefined && query.text.trim().length > 0) {
      const text = normalizeSearchText(query.text);
      const searchable = [
        entry.entryId,
        entry.strategyId,
        entry.strategyVersion,
        entry.manifest.name,
        entry.manifest.description,
        entry.family,
        entry.complexity,
        ...entry.tags,
        ...entry.aliases,
        ...entry.searchKeywords,
      ]
        .join("\u0000")
        .toLocaleLowerCase("en-US");

      if (!searchable.includes(text)) {
        return false;
      }
    }

    if (!intersects([entry.strategyId], normalizedSet(query.strategyIds))) {
      return false;
    }

    if (!intersects([entry.family], normalizedSet(query.families))) {
      return false;
    }

    if (!intersects([entry.complexity], normalizedSet(query.complexities))) {
      return false;
    }

    if (
      !intersects(
        [entry.riskProfile.overallRiskLevel],
        normalizedSet(query.riskLevels),
      )
    ) {
      return false;
    }

    if (!intersects([entry.status], normalizedSet(query.statuses))) {
      return false;
    }

    if (
      !intersects(
        [entry.verificationStatus],
        normalizedSet(query.verificationStatuses),
      )
    ) {
      return false;
    }

    if (
      !intersects(
        entry.compatibilityProfile.marketTypes,
        normalizedSet(query.marketTypes),
      )
    ) {
      return false;
    }

    if (
      !intersects(
        entry.compatibilityProfile.tradingModes,
        normalizedSet(query.tradingModes),
      )
    ) {
      return false;
    }

    if (
      !intersects(
        entry.compatibilityProfile.environments,
        normalizedSet(query.environments),
      )
    ) {
      return false;
    }

    if (
      !includesAll(
        entry.compatibilityProfile.requiredCapabilities,
        normalizedSet(query.capabilities),
      )
    ) {
      return false;
    }

    if (!this.matchesRegimes(entry, query.regimes)) {
      return false;
    }

    if (!includesAll(entry.tags, normalizedSet(query.tags))) {
      return false;
    }

    if (
      !intersects(
        [entry.operationalProfile.intelligenceType],
        normalizedSet(query.intelligenceTypes),
      )
    ) {
      return false;
    }

    return true;
  }

  private matchesRegimes(
    entry: StrategyLibraryEntry,
    regimes: readonly StrategyLibraryMarketRegime[] | undefined,
  ): boolean {
    const expected = normalizedSet(regimes);

    if (expected.size === 0) {
      return true;
    }

    return entry.regimeProfiles.some(
      (profile) =>
        expected.has(normalizeSearchText(profile.regime)) &&
        profile.compatibility !== "UNSUPPORTED",
    );
  }

  private sortEntries(
    entries: readonly StrategyLibraryEntry[],
    sortBy: StrategyLibrarySortField = "NAME",
    direction: StrategyLibrarySortDirection = "ASCENDING",
  ): readonly StrategyLibraryEntry[] {
    const multiplier = direction === "DESCENDING" ? -1 : 1;
    const sorted = [...entries].sort((left, right) => {
      const comparison = this.compareEntryField(left, right, sortBy);

      if (comparison !== 0) {
        return comparison * multiplier;
      }

      const strategyComparison = compareText(left.strategyId, right.strategyId);

      if (strategyComparison !== 0) {
        return strategyComparison;
      }

      return compareStrategyVersions(
        right.strategyVersion,
        left.strategyVersion,
      );
    });

    return Object.freeze(sorted);
  }

  private compareEntryField(
    left: StrategyLibraryEntry,
    right: StrategyLibraryEntry,
    field: StrategyLibrarySortField,
  ): number {
    switch (field) {
      case "NAME":
        return compareText(left.manifest.name, right.manifest.name);
      case "STRATEGY_ID":
        return compareText(left.strategyId, right.strategyId);
      case "FAMILY":
        return compareText(left.family, right.family);
      case "COMPLEXITY":
        return compareText(left.complexity, right.complexity);
      case "RISK":
        return (
          riskRank(left.riskProfile.overallRiskLevel) -
          riskRank(right.riskProfile.overallRiskLevel)
        );
      case "STATUS":
        return statusRank(left.status) - statusRank(right.status);
      case "VERIFICATION":
        return (
          verificationRank(left.verificationStatus) -
          verificationRank(right.verificationStatus)
        );
      case "CREATED_AT":
        return left.introducedAt - right.introducedAt;
      case "UPDATED_AT":
        return left.updatedAt - right.updatedAt;
      default: {
        const exhaustive: never = field;
        return exhaustive;
      }
    }
  }

  private cloneRegistry(): StrategyLibraryRegistry {
    const clone = new StrategyLibraryRegistry({
      validator: this.validator,
      frameworkRegistry: this.frameworkRegistry,
      clock: this.clock,
      options: {
        ...this.options,
        allowEntryReplacement: true,
        allowCollectionReplacement: true,
        allowReleaseReplacement: true,
      },
    });

    clone.replaceAllFrom(this);
    return clone;
  }

  private replaceEntriesFrom(source: StrategyLibraryRegistry): void {
    this.entriesByEntryId.clear();
    this.entriesByStrategy.clear();

    for (const internal of source.listInternalEntries()) {
      const versions =
        this.entriesByStrategy.get(internal.value.strategyId) ??
        new Map<StrategyVersion, InternalEntry>();

      versions.set(internal.value.strategyVersion, internal);
      this.entriesByStrategy.set(internal.value.strategyId, versions);
      this.entriesByEntryId.set(internal.value.entryId, internal);
    }

    this.sequence = Math.max(this.sequence, source.sequence);
  }

  private replaceAllFrom(source: StrategyLibraryRegistry): void {
    this.replaceEntriesFrom(source);

    this.collectionsById.clear();
    for (const [key, value] of source.collectionsById) {
      this.collectionsById.set(key, value);
    }

    this.releasesById.clear();
    for (const [key, value] of source.releasesById) {
      this.releasesById.set(key, value);
    }

    this.loadedProviders.clear();
    for (const providerId of source.loadedProviders) {
      this.loadedProviders.add(providerId);
    }

    this.sequence = Math.max(this.sequence, source.sequence);
  }
}

/* ========================================================================== *
 * Factory and convenience functions
 * ========================================================================== */

export function createStrategyLibraryRegistry(
  dependencies: {
    readonly validator?: StrategyLibraryValidatorPort;
    readonly frameworkRegistry?: StrategyRegistry;
    readonly clock?: StrategyLibraryRegistryClock;
    readonly options?: Partial<StrategyLibraryRegistryOptions>;
  } = {},
): StrategyLibraryRegistry {
  return new StrategyLibraryRegistry(dependencies);
}

export default StrategyLibraryRegistry;