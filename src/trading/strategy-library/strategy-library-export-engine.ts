/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-export-engine.ts
 *
 * Purpose:
 * Produces deterministic, immutable, portable exports of strategy-library
 * entries, collections, releases, statistics, and complete registry snapshots.
 *
 * Responsibilities:
 *
 * - export complete strategy-library snapshots
 * - export selected entries, collections, and releases
 * - support canonical JSON and newline-delimited JSON
 * - provide deterministic ordering and serialization
 * - calculate deterministic checksums and fingerprints
 * - optionally remove metadata and documentation URIs
 * - enforce export-size and resource-count limits
 * - produce immutable export manifests and results
 *
 * The engine performs no filesystem or network operations. Persistence,
 * transport, compression, encryption, and storage remain the responsibility
 * of infrastructure adapters.
 */

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
  type StrategyLibraryDocumentationReference,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseId,
  type StrategyLibrarySchemaVersion,
  type StrategyLibraryStatistics,
} from "./strategy-library-contracts";

/* ============================================================================
 * Export types
 * ============================================================================
 */

export type StrategyLibraryExportFormat =
  | "JSON"
  | "NDJSON";

export type StrategyLibraryExportScope =
  | "SNAPSHOT"
  | "ENTRIES"
  | "COLLECTIONS"
  | "RELEASES"
  | "CUSTOM";

export type StrategyLibraryExportResourceType =
  | "MANIFEST"
  | "STATISTICS"
  | "ENTRY"
  | "COLLECTION"
  | "RELEASE";

export type StrategyLibraryExportChecksumAlgorithm =
  | "FNV1A_32";

export type StrategyLibraryExportStatus =
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS";

/* ============================================================================
 * Errors
 * ============================================================================
 */

export type StrategyLibraryExportEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_REQUEST"
  | "ENTRY_NOT_FOUND"
  | "COLLECTION_NOT_FOUND"
  | "RELEASE_NOT_FOUND"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "OUTPUT_SIZE_LIMIT_EXCEEDED"
  | "SERIALIZATION_FAILED"
  | "EXPORT_FAILED";

export interface StrategyLibraryExportEngineErrorDetails {
  readonly field?: string;
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly collectionId?: StrategyLibraryCollectionId;
  readonly releaseId?: StrategyLibraryReleaseId;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryExportEngineError extends Error {
  public readonly code: StrategyLibraryExportEngineErrorCode;

  public readonly field?: string;

  public readonly entryId?: StrategyLibraryEntryId;

  public readonly strategyId?: StrategyId;

  public readonly strategyVersion?: StrategyVersion;

  public readonly collectionId?: StrategyLibraryCollectionId;

  public readonly releaseId?: StrategyLibraryReleaseId;

  public readonly cause?: unknown;

  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryExportEngineErrorCode,
    message: string,
    details: StrategyLibraryExportEngineErrorDetails = {},
  ) {
    super(message);

    this.name = "StrategyLibraryExportEngineError";
    this.code = code;
    this.field = details.field;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.collectionId = details.collectionId;
    this.releaseId = details.releaseId;
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryExportEngineError.prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and registry extensions
 * ============================================================================
 */

export interface StrategyLibraryExportClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryExportRegistry
  extends StrategyLibraryRegistryPort {
  getCollection?(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined;

  listCollections?(): readonly StrategyLibraryCollection[];

  getRelease?(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined;

  listReleases?(): readonly StrategyLibraryRelease[];

  statistics?(): StrategyLibraryStatistics;
}

/* ============================================================================
 * Configuration
 * ============================================================================
 */

export interface StrategyLibraryExportEngineOptions {
  readonly clock?: StrategyLibraryExportClock;

  readonly defaultFormat?: StrategyLibraryExportFormat;

  readonly defaultPrettyPrint?: boolean;

  readonly defaultIncludeMetadata?: boolean;

  readonly defaultIncludeDocumentationUris?: boolean;

  readonly defaultIncludeStatistics?: boolean;

  readonly maximumEntries?: number;

  readonly maximumCollections?: number;

  readonly maximumReleases?: number;

  readonly maximumOutputCharacters?: number;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Selection contracts
 * ============================================================================
 */

export interface StrategyLibraryExportEntrySelector {
  readonly entryId?: StrategyLibraryEntryId;

  readonly strategyId?: StrategyId;

  readonly strategyVersion?: StrategyVersion;
}

export interface StrategyLibraryExportSelection {
  readonly entries?:
    readonly StrategyLibraryExportEntrySelector[];

  readonly collectionIds?:
    readonly StrategyLibraryCollectionId[];

  readonly releaseIds?:
    readonly StrategyLibraryReleaseId[];
}

/* ============================================================================
 * Request contracts
 * ============================================================================
 */

export interface StrategyLibraryExportRequest {
  readonly scope?: StrategyLibraryExportScope;

  readonly format?: StrategyLibraryExportFormat;

  readonly selection?: StrategyLibraryExportSelection;

  readonly includeEntries?: boolean;

  readonly includeCollections?: boolean;

  readonly includeReleases?: boolean;

  readonly includeStatistics?: boolean;

  readonly includeMetadata?: boolean;

  readonly includeDocumentationUris?: boolean;

  readonly prettyPrint?: boolean;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Export resource contracts
 * ============================================================================
 */

export interface StrategyLibraryExportResource {
  readonly resourceType: StrategyLibraryExportResourceType;

  readonly resourceId: string;

  readonly sequence: number;

  readonly checksumAlgorithm:
    StrategyLibraryExportChecksumAlgorithm;

  readonly checksum: string;

  readonly content: unknown;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryExportCounts {
  readonly entries: number;

  readonly collections: number;

  readonly releases: number;

  readonly resources: number;
}

export interface StrategyLibraryExportManifest {
  readonly exportId: string;

  readonly schemaVersion: StrategyLibrarySchemaVersion;

  readonly format: StrategyLibraryExportFormat;

  readonly scope: StrategyLibraryExportScope;

  readonly generatedAt: UnixTimestampMilliseconds;

  readonly counts: StrategyLibraryExportCounts;

  readonly includeStatistics: boolean;

  readonly includeMetadata: boolean;

  readonly includeDocumentationUris: boolean;

  readonly checksumAlgorithm:
    StrategyLibraryExportChecksumAlgorithm;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryExportPackage {
  readonly manifest: StrategyLibraryExportManifest;

  readonly statistics?: StrategyLibraryStatistics;

  readonly entries: readonly StrategyLibraryEntry[];

  readonly collections:
    readonly StrategyLibraryCollection[];

  readonly releases:
    readonly StrategyLibraryRelease[];

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryRenderedExport {
  readonly format: StrategyLibraryExportFormat;

  readonly mediaType: string;

  readonly fileExtension: string;

  readonly content: string;

  readonly contentLength: number;

  readonly checksumAlgorithm:
    StrategyLibraryExportChecksumAlgorithm;

  readonly checksum: string;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryExportResult {
  readonly status: StrategyLibraryExportStatus;

  readonly manifest: StrategyLibraryExportManifest;

  readonly package: StrategyLibraryExportPackage;

  readonly resources:
    readonly StrategyLibraryExportResource[];

  readonly rendered: StrategyLibraryRenderedExport;

  readonly warnings: readonly string[];

  readonly generatedAt: UnixTimestampMilliseconds;

  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface ResolvedOptions {
  readonly clock: StrategyLibraryExportClock;

  readonly defaultFormat: StrategyLibraryExportFormat;

  readonly defaultPrettyPrint: boolean;

  readonly defaultIncludeMetadata: boolean;

  readonly defaultIncludeDocumentationUris: boolean;

  readonly defaultIncludeStatistics: boolean;

  readonly maximumEntries: number;

  readonly maximumCollections: number;

  readonly maximumReleases: number;

  readonly maximumOutputCharacters: number;

  readonly metadata: StrategyMetadata;
}

interface NormalizedRequest {
  readonly source: StrategyLibraryExportRequest;

  readonly scope: StrategyLibraryExportScope;

  readonly format: StrategyLibraryExportFormat;

  readonly selection: StrategyLibraryExportSelection;

  readonly includeEntries: boolean;

  readonly includeCollections: boolean;

  readonly includeReleases: boolean;

  readonly includeStatistics: boolean;

  readonly includeMetadata: boolean;

  readonly includeDocumentationUris: boolean;

  readonly prettyPrint: boolean;

  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_CLOCK: StrategyLibraryExportClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const DEFAULT_MAXIMUM_ENTRIES = 100_000;

const DEFAULT_MAXIMUM_COLLECTIONS = 10_000;

const DEFAULT_MAXIMUM_RELEASES = 10_000;

const DEFAULT_MAXIMUM_OUTPUT_CHARACTERS =
  100_000_000;

const EMPTY_ENTRIES:
  readonly StrategyLibraryEntry[] =
  Object.freeze([]);

const EMPTY_COLLECTIONS:
  readonly StrategyLibraryCollection[] =
  Object.freeze([]);

const EMPTY_RELEASES:
  readonly StrategyLibraryRelease[] =
  Object.freeze([]);

const EMPTY_RESOURCES:
  readonly StrategyLibraryExportResource[] =
  Object.freeze([]);

const EMPTY_WARNINGS:
  readonly string[] =
  Object.freeze([]);

const EMPTY_SELECTION:
  StrategyLibraryExportSelection =
  Object.freeze({});

/* ============================================================================
 * Export engine
 * ============================================================================
 */

export class StrategyLibraryExportEngine {
  private readonly registry:
    StrategyLibraryExportRegistry;

  private readonly options: ResolvedOptions;

  public constructor(
    registry: StrategyLibraryExportRegistry,
    options: StrategyLibraryExportEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    const defaultFormat: StrategyLibraryExportFormat =
      options.defaultFormat ?? "JSON";

    const defaultPrettyPrint: boolean =
      options.defaultPrettyPrint ?? true;

    const defaultIncludeMetadata: boolean =
      options.defaultIncludeMetadata ?? true;

    const defaultIncludeDocumentationUris: boolean =
      options.defaultIncludeDocumentationUris ?? true;

    const defaultIncludeStatistics: boolean =
      options.defaultIncludeStatistics ?? true;

    const maximumEntries: number =
      options.maximumEntries ??
      DEFAULT_MAXIMUM_ENTRIES;

    const maximumCollections: number =
      options.maximumCollections ??
      DEFAULT_MAXIMUM_COLLECTIONS;

    const maximumReleases: number =
      options.maximumReleases ??
      DEFAULT_MAXIMUM_RELEASES;

    const maximumOutputCharacters: number =
      options.maximumOutputCharacters ??
      DEFAULT_MAXIMUM_OUTPUT_CHARACTERS;

    assertExportFormat(
      defaultFormat,
      "options.defaultFormat",
    );

    assertBoolean(
      defaultPrettyPrint,
      "options.defaultPrettyPrint",
    );

    assertBoolean(
      defaultIncludeMetadata,
      "options.defaultIncludeMetadata",
    );

    assertBoolean(
      defaultIncludeDocumentationUris,
      "options.defaultIncludeDocumentationUris",
    );

    assertBoolean(
      defaultIncludeStatistics,
      "options.defaultIncludeStatistics",
    );

    assertPositiveSafeInteger(
      maximumEntries,
      "options.maximumEntries",
    );

    assertPositiveSafeInteger(
      maximumCollections,
      "options.maximumCollections",
    );

    assertPositiveSafeInteger(
      maximumReleases,
      "options.maximumReleases",
    );

    assertPositiveSafeInteger(
      maximumOutputCharacters,
      "options.maximumOutputCharacters",
    );

    this.registry = registry;

    this.options = deepFreeze({
      clock: options.clock ?? DEFAULT_CLOCK,
      defaultFormat,
      defaultPrettyPrint,
      defaultIncludeMetadata,
      defaultIncludeDocumentationUris,
      defaultIncludeStatistics,
      maximumEntries,
      maximumCollections,
      maximumReleases,
      maximumOutputCharacters,
      metadata: immutableCopy(
        options.metadata ?? EMPTY_STRATEGY_METADATA,
      ),
    });

    this.now();
  }

  public export(
    request: StrategyLibraryExportRequest = {},
  ): StrategyLibraryExportResult {
    const normalized =
      this.normalizeRequest(request);

    try {
      const generatedAt = this.now();

      const warnings: string[] = [];

      const entries =
        normalized.includeEntries
          ? this.resolveEntries(
              normalized.selection.entries,
            )
          : EMPTY_ENTRIES;

      const collections =
        normalized.includeCollections
          ? this.resolveCollections(
              normalized.selection.collectionIds,
              warnings,
            )
          : EMPTY_COLLECTIONS;

      const releases =
        normalized.includeReleases
          ? this.resolveReleases(
              normalized.selection.releaseIds,
              warnings,
            )
          : EMPTY_RELEASES;

      this.assertResourceLimits(
        entries,
        collections,
        releases,
      );

      const transformedEntries =
        transformEntries(
          entries,
          normalized.includeMetadata,
          normalized.includeDocumentationUris,
        );

      const transformedCollections =
        normalized.includeMetadata
          ? immutableCopy(collections)
          : removeMetadataFromCollections(
              collections,
            );

      const transformedReleases =
        normalized.includeMetadata
          ? immutableCopy(releases)
          : removeMetadataFromReleases(
              releases,
            );

      const statistics =
        normalized.includeStatistics
          ? this.resolveStatistics(
              transformedEntries,
            )
          : undefined;

      const resourceCount =
        transformedEntries.length +
        transformedCollections.length +
        transformedReleases.length +
        (statistics === undefined ? 1 : 2);

      const counts:
        StrategyLibraryExportCounts =
        deepFreeze({
          entries: transformedEntries.length,
          collections:
            transformedCollections.length,
          releases:
            transformedReleases.length,
          resources: resourceCount,
        });

      const exportId = createExportId(
        generatedAt,
        normalized.scope,
        counts,
      );

      const manifest:
        StrategyLibraryExportManifest =
        deepFreeze({
          exportId,
          schemaVersion:
            STRATEGY_LIBRARY_SCHEMA_VERSION,
          format: normalized.format,
          scope: normalized.scope,
          generatedAt,
          counts,
          includeStatistics:
            normalized.includeStatistics,
          includeMetadata:
            normalized.includeMetadata,
          includeDocumentationUris:
            normalized.includeDocumentationUris,
          checksumAlgorithm: "FNV1A_32",
          metadata: normalized.metadata,
        });

      const exportPackage:
        StrategyLibraryExportPackage =
        deepFreeze({
          manifest,
          ...(statistics === undefined
            ? {}
            : { statistics }),
          entries: transformedEntries,
          collections: transformedCollections,
          releases: transformedReleases,
          metadata:
            normalized.includeMetadata
              ? normalized.metadata
              : EMPTY_STRATEGY_METADATA,
        });

      const resources = buildResources(
        exportPackage,
        normalized.includeMetadata,
      );

      const rendered = this.render(
        exportPackage,
        resources,
        normalized,
      );

      if (
        rendered.contentLength >
        this.options.maximumOutputCharacters
      ) {
        throw new StrategyLibraryExportEngineError(
          "OUTPUT_SIZE_LIMIT_EXCEEDED",
          `Export output length ${rendered.contentLength} exceeds the configured maximum of ${this.options.maximumOutputCharacters} characters.`,
          {
            field:
              "options.maximumOutputCharacters",
            metadata: normalized.metadata,
          },
        );
      }

      const normalizedWarnings =
        warnings.length === 0
          ? EMPTY_WARNINGS
          : Object.freeze(
              [...new Set(warnings)].sort(
                compareText,
              ),
            );

      return deepFreeze({
        status:
          normalizedWarnings.length === 0
            ? "COMPLETED"
            : "COMPLETED_WITH_WARNINGS",
        manifest,
        package: exportPackage,
        resources,
        rendered,
        warnings: normalizedWarnings,
        generatedAt,
        metadata: normalized.metadata,
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryExportEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryExportEngineError(
        "EXPORT_FAILED",
        "Strategy-library export failed.",
        {
          cause,
          metadata: normalized.metadata,
        },
      );
    }
  }

  public exportSnapshot(
    format: StrategyLibraryExportFormat =
      this.options.defaultFormat,
  ): StrategyLibraryExportResult {
    return this.export({
      scope: "SNAPSHOT",
      format,
    });
  }

  public exportEntries(
    entries:
      readonly StrategyLibraryExportEntrySelector[],
    format: StrategyLibraryExportFormat =
      this.options.defaultFormat,
  ): StrategyLibraryExportResult {
    return this.export({
      scope: "ENTRIES",
      format,
      selection: {
        entries,
      },
      includeEntries: true,
      includeCollections: false,
      includeReleases: false,
    });
  }

  public exportCollections(
    collectionIds:
      readonly StrategyLibraryCollectionId[],
    format: StrategyLibraryExportFormat =
      this.options.defaultFormat,
  ): StrategyLibraryExportResult {
    return this.export({
      scope: "COLLECTIONS",
      format,
      selection: {
        collectionIds,
      },
      includeEntries: false,
      includeCollections: true,
      includeReleases: false,
    });
  }

  public exportReleases(
    releaseIds:
      readonly StrategyLibraryReleaseId[],
    format: StrategyLibraryExportFormat =
      this.options.defaultFormat,
  ): StrategyLibraryExportResult {
    return this.export({
      scope: "RELEASES",
      format,
      selection: {
        releaseIds,
      },
      includeEntries: false,
      includeCollections: false,
      includeReleases: true,
    });
  }

  private normalizeRequest(
    request: StrategyLibraryExportRequest,
  ): NormalizedRequest {
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      throw new StrategyLibraryExportEngineError(
        "INVALID_REQUEST",
        "export request must be an object.",
        {
          field: "request",
        },
      );
    }

    const scope:
      StrategyLibraryExportScope =
      request.scope ?? "SNAPSHOT";

    assertExportScope(
      scope,
      "request.scope",
    );

    const format:
      StrategyLibraryExportFormat =
      request.format ??
      this.options.defaultFormat;

    assertExportFormat(
      format,
      "request.format",
    );

    const selection:
      StrategyLibraryExportSelection =
      request.selection ??
      EMPTY_SELECTION;

    assertSelection(
      selection,
      "request.selection",
    );

    const defaults =
      defaultsForScope(scope);

    const includeEntries: boolean =
      request.includeEntries ??
      defaults.includeEntries;

    const includeCollections: boolean =
      request.includeCollections ??
      defaults.includeCollections;

    const includeReleases: boolean =
      request.includeReleases ??
      defaults.includeReleases;

    const includeStatistics: boolean =
      request.includeStatistics ??
      this.options.defaultIncludeStatistics;

    const includeMetadata: boolean =
      request.includeMetadata ??
      this.options.defaultIncludeMetadata;

    const includeDocumentationUris: boolean =
      request.includeDocumentationUris ??
      this.options
        .defaultIncludeDocumentationUris;

    const prettyPrint: boolean =
      request.prettyPrint ??
      this.options.defaultPrettyPrint;

    assertBoolean(
      includeEntries,
      "request.includeEntries",
    );

    assertBoolean(
      includeCollections,
      "request.includeCollections",
    );

    assertBoolean(
      includeReleases,
      "request.includeReleases",
    );

    assertBoolean(
      includeStatistics,
      "request.includeStatistics",
    );

    assertBoolean(
      includeMetadata,
      "request.includeMetadata",
    );

    assertBoolean(
      includeDocumentationUris,
      "request.includeDocumentationUris",
    );

    assertBoolean(
      prettyPrint,
      "request.prettyPrint",
    );

    const metadata:
      StrategyMetadata =
      request.metadata ??
      this.options.metadata;

    const normalized:
      NormalizedRequest = {
      source: immutableCopy(request),
      scope,
      format,
      selection:
        normalizeSelection(selection),
      includeEntries,
      includeCollections,
      includeReleases,
      includeStatistics,
      includeMetadata,
      includeDocumentationUris,
      prettyPrint,
      metadata:
        immutableCopy(metadata),
    };

    return deepFreeze(normalized);
  }

  private resolveEntries(
    selectors:
      | readonly StrategyLibraryExportEntrySelector[]
      | undefined,
  ): readonly StrategyLibraryEntry[] {
    if (
      selectors === undefined ||
      selectors.length === 0
    ) {
      return sortEntries(
        this.registry.list(),
      );
    }

    const resolved =
      new Map<
        StrategyLibraryEntryId,
        StrategyLibraryEntry
      >();

    for (const selector of selectors) {
      const entry =
        this.resolveEntry(selector);

      resolved.set(
        entry.entryId,
        entry,
      );
    }

    return sortEntries(
      [...resolved.values()],
    );
  }

  private resolveEntry(
    selector:
      StrategyLibraryExportEntrySelector,
  ): StrategyLibraryEntry {
    if (selector.entryId !== undefined) {
      const entryId =
        normalizeRequiredString(
          selector.entryId,
          "selection.entries[].entryId",
        );

      const found =
        this.registry
          .list()
          .find(
            (entry) =>
              entry.entryId === entryId,
          );

      if (found === undefined) {
        throw new StrategyLibraryExportEngineError(
          "ENTRY_NOT_FOUND",
          `Strategy-library entry '${entryId}' was not found.`,
          {
            entryId,
          },
        );
      }

      return found;
    }

    if (
      selector.strategyId === undefined
    ) {
      throw new StrategyLibraryExportEngineError(
        "INVALID_REQUEST",
        "Each entry selector must define entryId or strategyId.",
        {
          field: "selection.entries",
        },
      );
    }

    const strategyId =
      normalizeRequiredString(
        selector.strategyId,
        "selection.entries[].strategyId",
      );

    const strategyVersion =
      selector.strategyVersion === undefined
        ? undefined
        : normalizeRequiredString(
            selector.strategyVersion,
            "selection.entries[].strategyVersion",
          );

    const found = this.registry.get(
      strategyId,
      strategyVersion,
    );

    if (found === undefined) {
      throw new StrategyLibraryExportEngineError(
        "ENTRY_NOT_FOUND",
        strategyVersion === undefined
          ? `Strategy '${strategyId}' was not found.`
          : `Strategy '${strategyId}' version '${strategyVersion}' was not found.`,
        {
          strategyId,
          strategyVersion,
        },
      );
    }

    return found;
  }

  private resolveCollections(
    collectionIds:
      | readonly StrategyLibraryCollectionId[]
      | undefined,
    warnings: string[],
  ): readonly StrategyLibraryCollection[] {
    const available =
      typeof this.registry.listCollections ===
      "function"
        ? this.registry.listCollections()
        : this.registry.snapshot().collections;

    if (
      collectionIds === undefined ||
      collectionIds.length === 0
    ) {
      return sortCollections(available);
    }

    const availableById = new Map(
      available.map(
        (collection) =>
          [
            collection.collectionId,
            collection,
          ] as const,
      ),
    );

    const resolved =
      new Map<
        StrategyLibraryCollectionId,
        StrategyLibraryCollection
      >();

    for (const rawId of collectionIds) {
      const collectionId =
        normalizeRequiredString(
          rawId,
          "selection.collectionIds[]",
        );

      const collection =
        typeof this.registry.getCollection ===
        "function"
          ? this.registry.getCollection(
              collectionId,
            )
          : availableById.get(
              collectionId,
            );

      if (collection === undefined) {
        throw new StrategyLibraryExportEngineError(
          "COLLECTION_NOT_FOUND",
          `Strategy-library collection '${collectionId}' was not found.`,
          {
            collectionId,
          },
        );
      }

      resolved.set(
        collection.collectionId,
        collection,
      );
    }

    if (
      typeof this.registry.listCollections !==
        "function" &&
      available.length === 0
    ) {
      warnings.push(
        "The registry does not expose collection operations and its snapshot contains no collections.",
      );
    }

    return sortCollections(
      [...resolved.values()],
    );
  }

  private resolveReleases(
    releaseIds:
      | readonly StrategyLibraryReleaseId[]
      | undefined,
    warnings: string[],
  ): readonly StrategyLibraryRelease[] {
    const available =
      typeof this.registry.listReleases ===
      "function"
        ? this.registry.listReleases()
        : this.registry.snapshot().releases;

    if (
      releaseIds === undefined ||
      releaseIds.length === 0
    ) {
      return sortReleases(available);
    }

    const availableById = new Map(
      available.map(
        (release) =>
          [
            release.releaseId,
            release,
          ] as const,
      ),
    );

    const resolved =
      new Map<
        StrategyLibraryReleaseId,
        StrategyLibraryRelease
      >();

    for (const rawId of releaseIds) {
      const releaseId =
        normalizeRequiredString(
          rawId,
          "selection.releaseIds[]",
        );

      const release =
        typeof this.registry.getRelease ===
        "function"
          ? this.registry.getRelease(
              releaseId,
            )
          : availableById.get(
              releaseId,
            );

      if (release === undefined) {
        throw new StrategyLibraryExportEngineError(
          "RELEASE_NOT_FOUND",
          `Strategy-library release '${releaseId}' was not found.`,
          {
            releaseId,
          },
        );
      }

      resolved.set(
        release.releaseId,
        release,
      );
    }

    if (
      typeof this.registry.listReleases !==
        "function" &&
      available.length === 0
    ) {
      warnings.push(
        "The registry does not expose release operations and its snapshot contains no releases.",
      );
    }

    return sortReleases(
      [...resolved.values()],
    );
  }

  private resolveStatistics(
    entries:
      readonly StrategyLibraryEntry[],
  ): StrategyLibraryStatistics {
    const fullRegistryEntries =
      this.registry.list();

    if (
      typeof this.registry.statistics ===
        "function" &&
      entries.length === fullRegistryEntries.length &&
      containsSameEntries(
        entries,
        fullRegistryEntries,
      )
    ) {
      return immutableCopy(
        this.registry.statistics(),
      );
    }

    return calculateStatistics(entries);
  }

  private assertResourceLimits(
    entries:
      readonly StrategyLibraryEntry[],
    collections:
      readonly StrategyLibraryCollection[],
    releases:
      readonly StrategyLibraryRelease[],
  ): void {
    if (
      entries.length >
      this.options.maximumEntries
    ) {
      throw new StrategyLibraryExportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Export contains ${entries.length} entries, exceeding the configured maximum of ${this.options.maximumEntries}.`,
        {
          field: "entries",
        },
      );
    }

    if (
      collections.length >
      this.options.maximumCollections
    ) {
      throw new StrategyLibraryExportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Export contains ${collections.length} collections, exceeding the configured maximum of ${this.options.maximumCollections}.`,
        {
          field: "collections",
        },
      );
    }

    if (
      releases.length >
      this.options.maximumReleases
    ) {
      throw new StrategyLibraryExportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Export contains ${releases.length} releases, exceeding the configured maximum of ${this.options.maximumReleases}.`,
        {
          field: "releases",
        },
      );
    }
  }

  private render(
    exportPackage:
      StrategyLibraryExportPackage,
    resources:
      readonly StrategyLibraryExportResource[],
    request: NormalizedRequest,
  ): StrategyLibraryRenderedExport {
    let content: string;
    let mediaType: string;
    let fileExtension: string;

    try {
      switch (request.format) {
        case "JSON":
          content = stableStringify(
            exportPackage,
            request.prettyPrint ? 2 : 0,
          );

          mediaType =
            "application/json";

          fileExtension = ".json";
          break;

        case "NDJSON":
          content =
            renderNdjson(resources);

          mediaType =
            "application/x-ndjson";

          fileExtension = ".ndjson";
          break;

        default:
          return assertNever(
            request.format,
          );
      }
    } catch (cause) {
      throw new StrategyLibraryExportEngineError(
        "SERIALIZATION_FAILED",
        "Unable to serialize strategy-library export.",
        {
          cause,
          metadata: request.metadata,
        },
      );
    }

    return deepFreeze({
      format: request.format,
      mediaType,
      fileExtension,
      content,
      contentLength: content.length,
      checksumAlgorithm: "FNV1A_32",
      checksum:
        calculateDeterministicChecksum(
          content,
        ),
      metadata: request.metadata,
    });
  }

  private now():
    UnixTimestampMilliseconds {
    const timestamp =
      this.options.clock.now();

    assertTimestamp(
      timestamp,
      "clock.now()",
    );

    return timestamp;
  }
}

/* ============================================================================
 * Factory functions
 * ============================================================================
 */

export function createStrategyLibraryExportEngine(
  registry: StrategyLibraryExportRegistry,
  options: StrategyLibraryExportEngineOptions = {},
): StrategyLibraryExportEngine {
  return new StrategyLibraryExportEngine(
    registry,
    options,
  );
}

export function exportStrategyLibrarySnapshot(
  registry: StrategyLibraryExportRegistry,
  options: StrategyLibraryExportEngineOptions = {},
  request: StrategyLibraryExportRequest = {},
): StrategyLibraryExportResult {
  return createStrategyLibraryExportEngine(
    registry,
    options,
  ).export(request);
}

/* ============================================================================
 * Selection defaults
 * ============================================================================
 */

function defaultsForScope(
  scope: StrategyLibraryExportScope,
): {
  readonly includeEntries: boolean;
  readonly includeCollections: boolean;
  readonly includeReleases: boolean;
} {
  switch (scope) {
    case "SNAPSHOT":
      return Object.freeze({
        includeEntries: true,
        includeCollections: true,
        includeReleases: true,
      });

    case "ENTRIES":
      return Object.freeze({
        includeEntries: true,
        includeCollections: false,
        includeReleases: false,
      });

    case "COLLECTIONS":
      return Object.freeze({
        includeEntries: false,
        includeCollections: true,
        includeReleases: false,
      });

    case "RELEASES":
      return Object.freeze({
        includeEntries: false,
        includeCollections: false,
        includeReleases: true,
      });

    case "CUSTOM":
      return Object.freeze({
        includeEntries: false,
        includeCollections: false,
        includeReleases: false,
      });

    default:
      return assertNever(scope);
  }
}

/* ============================================================================
 * Resource creation
 * ============================================================================
 */

function buildResources(
  exportPackage:
    StrategyLibraryExportPackage,
  includeMetadata: boolean,
): readonly StrategyLibraryExportResource[] {
  const resources:
    StrategyLibraryExportResource[] = [];

  let sequence = 0;

  sequence += 1;

  resources.push(
    createResource(
      "MANIFEST",
      exportPackage.manifest.exportId,
      sequence,
      exportPackage.manifest,
      includeMetadata
        ? exportPackage.metadata
        : EMPTY_STRATEGY_METADATA,
    ),
  );

  if (
    exportPackage.statistics !== undefined
  ) {
    sequence += 1;

    resources.push(
      createResource(
        "STATISTICS",
        `${exportPackage.manifest.exportId}:statistics`,
        sequence,
        exportPackage.statistics,
        includeMetadata
          ? exportPackage.metadata
          : EMPTY_STRATEGY_METADATA,
      ),
    );
  }

  for (
    const entry of exportPackage.entries
  ) {
    sequence += 1;

    resources.push(
      createResource(
        "ENTRY",
        entry.entryId,
        sequence,
        entry,
        includeMetadata
          ? entry.metadata
          : EMPTY_STRATEGY_METADATA,
      ),
    );
  }

  for (
    const collection of
    exportPackage.collections
  ) {
    sequence += 1;

    resources.push(
      createResource(
        "COLLECTION",
        collection.collectionId,
        sequence,
        collection,
        includeMetadata
          ? collection.metadata
          : EMPTY_STRATEGY_METADATA,
      ),
    );
  }

  for (
    const release of
    exportPackage.releases
  ) {
    sequence += 1;

    resources.push(
      createResource(
        "RELEASE",
        release.releaseId,
        sequence,
        release,
        includeMetadata
          ? release.metadata
          : EMPTY_STRATEGY_METADATA,
      ),
    );
  }

  return resources.length === 0
    ? EMPTY_RESOURCES
    : Object.freeze(resources);
}

function createResource(
  resourceType:
    StrategyLibraryExportResourceType,
  resourceId: string,
  sequence: number,
  content: unknown,
  metadata: StrategyMetadata,
): StrategyLibraryExportResource {
  const canonical =
    stableStringify(content, 0);

  return deepFreeze({
    resourceType,
    resourceId,
    sequence,
    checksumAlgorithm: "FNV1A_32",
    checksum:
      calculateDeterministicChecksum(
        canonical,
      ),
    content: immutableCopy(content),
    metadata,
  });
}

/* ============================================================================
 * Transformation
 * ============================================================================
 */

function transformEntries(
  entries:
    readonly StrategyLibraryEntry[],
  includeMetadata: boolean,
  includeDocumentationUris: boolean,
): readonly StrategyLibraryEntry[] {
  if (entries.length === 0) {
    return EMPTY_ENTRIES;
  }

  return Object.freeze(
    entries.map((entry) => {
      let transformed =
        immutableCopy(entry);

      if (!includeDocumentationUris) {
        transformed =
          removeDocumentationUris(
            transformed,
          );
      }

      if (!includeMetadata) {
        transformed =
          removeMetadataFromEntry(
            transformed,
          );
      }

      return transformed;
    }),
  );
}

function removeDocumentationUris(
  entry: StrategyLibraryEntry,
): StrategyLibraryEntry {
  const documentation =
    entry.documentation.map(
      (
        reference,
      ): StrategyLibraryDocumentationReference =>
        deepFreeze({
          documentationId:
            reference.documentationId,
          title: reference.title,
          description:
            reference.description,
          contentType:
            reference.contentType,
          required: reference.required,
          metadata:
            reference.metadata,
        }),
    );

  return deepFreeze({
    ...entry,
    documentation:
      Object.freeze(documentation),
  });
}

function removeMetadataFromEntry(
  entry: StrategyLibraryEntry,
): StrategyLibraryEntry {
  return replaceMetadataRecursively(
    immutableCopy(entry),
  ) as StrategyLibraryEntry;
}

function removeMetadataFromCollections(
  collections:
    readonly StrategyLibraryCollection[],
): readonly StrategyLibraryCollection[] {
  if (collections.length === 0) {
    return EMPTY_COLLECTIONS;
  }

  return Object.freeze(
    collections.map(
      (collection) =>
        replaceMetadataRecursively(
          immutableCopy(collection),
        ) as StrategyLibraryCollection,
    ),
  );
}

function removeMetadataFromReleases(
  releases:
    readonly StrategyLibraryRelease[],
): readonly StrategyLibraryRelease[] {
  if (releases.length === 0) {
    return EMPTY_RELEASES;
  }

  return Object.freeze(
    releases.map(
      (release) =>
        replaceMetadataRecursively(
          immutableCopy(release),
        ) as StrategyLibraryRelease,
    ),
  );
}

function replaceMetadataRecursively(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(
        replaceMetadataRecursively,
      ),
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const result:
    Record<string, unknown> = {};

  for (
    const key of Object.keys(value).sort(
      compareText,
    )
  ) {
    result[key] =
      key === "metadata"
        ? EMPTY_STRATEGY_METADATA
        : replaceMetadataRecursively(
            value[key],
          );
  }

  return deepFreeze(result);
}

/* ============================================================================
 * Statistics
 * ============================================================================
 */

function calculateStatistics(
  entries:
    readonly StrategyLibraryEntry[],
): StrategyLibraryStatistics {
  let activeEntries = 0;
  let deprecatedEntries = 0;
  let retiredEntries = 0;
  let liveReadyEntries = 0;
  let certifiedEntries = 0;

  const familyCounts:
    Record<string, number> = {};

  const riskLevelCounts:
    Record<string, number> = {};

  const verificationCounts:
    Record<string, number> = {};

  for (const entry of entries) {
    incrementCount(
      familyCounts,
      entry.family,
    );

    incrementCount(
      riskLevelCounts,
      entry.riskProfile.overallRiskLevel,
    );

    incrementCount(
      verificationCounts,
      entry.verificationStatus,
    );

    if (
      entry.status === "DEPRECATED"
    ) {
      deprecatedEntries += 1;
    } else if (
      entry.status === "RETIRED"
    ) {
      retiredEntries += 1;
    } else {
      activeEntries += 1;
    }

    if (
      entry.status === "LIVE_READY"
    ) {
      liveReadyEntries += 1;
    }

    if (
      entry.verificationStatus ===
      "CERTIFIED"
    ) {
      certifiedEntries += 1;
    }
  }

  return deepFreeze({
    totalEntries: entries.length,
    activeEntries,
    deprecatedEntries,
    retiredEntries,
    liveReadyEntries,
    certifiedEntries,
    familyCounts,
    riskLevelCounts,
    verificationCounts,
  }) as StrategyLibraryStatistics;
}

function incrementCount(
  record: Record<string, number>,
  key: string,
): void {
  record[key] =
    (record[key] ?? 0) + 1;
}

function containsSameEntries(
  left:
    readonly StrategyLibraryEntry[],
  right:
    readonly StrategyLibraryEntry[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftKeys = left
    .map(createEntryIdentity)
    .sort(compareText);

  const rightKeys = right
    .map(createEntryIdentity)
    .sort(compareText);

  for (
    let index = 0;
    index < leftKeys.length;
    index += 1
  ) {
    if (
      leftKeys[index] !==
      rightKeys[index]
    ) {
      return false;
    }
  }

  return true;
}

function createEntryIdentity(
  entry: StrategyLibraryEntry,
): string {
  return [
    entry.entryId,
    entry.strategyId,
    entry.strategyVersion,
  ].join(":");
}

/* ============================================================================
 * Sorting
 * ============================================================================
 */

function sortEntries(
  entries:
    readonly StrategyLibraryEntry[],
): readonly StrategyLibraryEntry[] {
  if (entries.length === 0) {
    return EMPTY_ENTRIES;
  }

  return Object.freeze(
    [...entries]
      .sort((left, right) => {
        const strategyOrder =
          compareText(
            left.strategyId,
            right.strategyId,
          );

        if (strategyOrder !== 0) {
          return strategyOrder;
        }

        const versionOrder =
          compareText(
            left.strategyVersion,
            right.strategyVersion,
          );

        if (versionOrder !== 0) {
          return versionOrder;
        }

        return compareText(
          left.entryId,
          right.entryId,
        );
      })
      .map(immutableCopy),
  );
}

function sortCollections(
  collections:
    readonly StrategyLibraryCollection[],
): readonly StrategyLibraryCollection[] {
  if (collections.length === 0) {
    return EMPTY_COLLECTIONS;
  }

  return Object.freeze(
    [...collections]
      .sort((left, right) =>
        compareText(
          left.collectionId,
          right.collectionId,
        ),
      )
      .map(immutableCopy),
  );
}

function sortReleases(
  releases:
    readonly StrategyLibraryRelease[],
): readonly StrategyLibraryRelease[] {
  if (releases.length === 0) {
    return EMPTY_RELEASES;
  }

  return Object.freeze(
    [...releases]
      .sort((left, right) =>
        compareText(
          left.releaseId,
          right.releaseId,
        ),
      )
      .map(immutableCopy),
  );
}

function compareText(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

/* ============================================================================
 * Request normalization
 * ============================================================================
 */

function normalizeSelection(
  selection:
    StrategyLibraryExportSelection,
): StrategyLibraryExportSelection {
  const normalizedEntries =
    selection.entries === undefined
      ? undefined
      : Object.freeze(
          selection.entries.map(
            normalizeEntrySelector,
          ),
        );

  const normalizedCollectionIds =
    selection.collectionIds === undefined
      ? undefined
      : normalizeStringArray(
          selection.collectionIds,
          "selection.collectionIds",
        );

  const normalizedReleaseIds =
    selection.releaseIds === undefined
      ? undefined
      : normalizeStringArray(
          selection.releaseIds,
          "selection.releaseIds",
        );

  return deepFreeze({
    ...(normalizedEntries === undefined
      ? {}
      : {
          entries: normalizedEntries,
        }),
    ...(normalizedCollectionIds === undefined
      ? {}
      : {
          collectionIds:
            normalizedCollectionIds,
        }),
    ...(normalizedReleaseIds === undefined
      ? {}
      : {
          releaseIds:
            normalizedReleaseIds,
        }),
  });
}

function normalizeEntrySelector(
  selector:
    StrategyLibraryExportEntrySelector,
): StrategyLibraryExportEntrySelector {
  if (
    typeof selector !== "object" ||
    selector === null ||
    Array.isArray(selector)
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      "Each entry selector must be an object.",
      {
        field: "selection.entries",
      },
    );
  }

  if (
    selector.entryId === undefined &&
    selector.strategyId === undefined
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      "Each entry selector must define entryId or strategyId.",
      {
        field: "selection.entries",
      },
    );
  }

  const entryId =
    selector.entryId === undefined
      ? undefined
      : normalizeRequiredString(
          selector.entryId,
          "selection.entries[].entryId",
        );

  const strategyId =
    selector.strategyId === undefined
      ? undefined
      : normalizeRequiredString(
          selector.strategyId,
          "selection.entries[].strategyId",
        );

  const strategyVersion =
    selector.strategyVersion === undefined
      ? undefined
      : normalizeRequiredString(
          selector.strategyVersion,
          "selection.entries[].strategyVersion",
        );

  return deepFreeze({
    ...(entryId === undefined
      ? {}
      : { entryId }),
    ...(strategyId === undefined
      ? {}
      : { strategyId }),
    ...(strategyVersion === undefined
      ? {}
      : { strategyVersion }),
  });
}

function normalizeStringArray(
  values: readonly string[],
  field: string,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field} must be an array.`,
      {
        field,
      },
    );
  }

  const normalized =
    values.map(
      (value, index) =>
        normalizeRequiredString(
          value,
          `${field}[${index}]`,
        ),
    );

  return Object.freeze(
    [...new Set(normalized)].sort(
      compareText,
    ),
  );
}

/* ============================================================================
 * Validation
 * ============================================================================
 */

function assertRegistry(
  registry: StrategyLibraryExportRegistry,
): void {
  if (
    !isRecord(registry) ||
    typeof registry.register !== "function" ||
    typeof registry.registerMany !== "function" ||
    typeof registry.unregister !== "function" ||
    typeof registry.has !== "function" ||
    typeof registry.get !== "function" ||
    typeof registry.list !== "function" ||
    typeof registry.query !== "function" ||
    typeof registry.snapshot !== "function"
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      "registry must implement StrategyLibraryRegistryPort.",
      {
        field: "registry",
      },
    );
  }
}

function assertOptions(
  options:
    StrategyLibraryExportEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }

  if (
    options.clock !== undefined &&
    (
      !isRecord(options.clock) ||
      typeof options.clock.now !==
        "function"
    )
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      "options.clock must implement StrategyLibraryExportClock.",
      {
        field: "options.clock",
      },
    );
  }

  if (
    options.defaultFormat !== undefined
  ) {
    assertExportFormat(
      options.defaultFormat,
      "options.defaultFormat",
    );
  }

  assertOptionalBoolean(
    options.defaultPrettyPrint,
    "options.defaultPrettyPrint",
  );

  assertOptionalBoolean(
    options.defaultIncludeMetadata,
    "options.defaultIncludeMetadata",
  );

  assertOptionalBoolean(
    options.defaultIncludeDocumentationUris,
    "options.defaultIncludeDocumentationUris",
  );

  assertOptionalBoolean(
    options.defaultIncludeStatistics,
    "options.defaultIncludeStatistics",
  );

  if (
    options.maximumEntries !== undefined
  ) {
    assertPositiveSafeInteger(
      options.maximumEntries,
      "options.maximumEntries",
    );
  }

  if (
    options.maximumCollections !==
    undefined
  ) {
    assertPositiveSafeInteger(
      options.maximumCollections,
      "options.maximumCollections",
    );
  }

  if (
    options.maximumReleases !== undefined
  ) {
    assertPositiveSafeInteger(
      options.maximumReleases,
      "options.maximumReleases",
    );
  }

  if (
    options.maximumOutputCharacters !==
    undefined
  ) {
    assertPositiveSafeInteger(
      options.maximumOutputCharacters,
      "options.maximumOutputCharacters",
    );
  }
}

function assertSelection(
  selection:
    StrategyLibraryExportSelection,
  field: string,
): void {
  if (
    typeof selection !== "object" ||
    selection === null ||
    Array.isArray(selection)
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field} must be an object.`,
      {
        field,
      },
    );
  }

  if (
    selection.entries !== undefined &&
    !Array.isArray(selection.entries)
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field}.entries must be an array.`,
      {
        field: `${field}.entries`,
      },
    );
  }

  if (
    selection.collectionIds !== undefined &&
    !Array.isArray(
      selection.collectionIds,
    )
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field}.collectionIds must be an array.`,
      {
        field:
          `${field}.collectionIds`,
      },
    );
  }

  if (
    selection.releaseIds !== undefined &&
    !Array.isArray(
      selection.releaseIds,
    )
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field}.releaseIds must be an array.`,
      {
        field:
          `${field}.releaseIds`,
      },
    );
  }
}

function assertExportFormat(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryExportFormat {
  if (
    value !== "JSON" &&
    value !== "NDJSON"
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be JSON or NDJSON.`,
      {
        field,
      },
    );
  }
}

function assertExportScope(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryExportScope {
  if (
    value !== "SNAPSHOT" &&
    value !== "ENTRIES" &&
    value !== "COLLECTIONS" &&
    value !== "RELEASES" &&
    value !== "CUSTOM"
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_REQUEST",
      `${field} contains an unsupported export scope.`,
      {
        field,
      },
    );
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a boolean.`,
      {
        field,
      },
    );
  }
}

function assertOptionalBoolean(
  value: unknown,
  field: string,
): void {
  if (
    value !== undefined &&
    typeof value !== "boolean"
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a boolean when provided.`,
      {
        field,
      },
    );
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a positive safe integer.`,
      {
        field,
      },
    );
  }
}

function assertTimestamp(
  value: unknown,
  field: string,
): asserts value is UnixTimestampMilliseconds {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer timestamp.`,
      {
        field,
      },
    );
  }
}

function normalizeRequiredString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a string.`,
      {
        field,
      },
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryExportEngineError(
      "INVALID_ARGUMENT",
      `${field} must not be empty.`,
      {
        field,
      },
    );
  }

  return normalized;
}

function isRecord(
  value: unknown,
): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertNever(
  value: never,
): never {
  throw new StrategyLibraryExportEngineError(
    "INVALID_ARGUMENT",
    `Unsupported export value '${String(
      value,
    )}'.`,
  );
}

/* ============================================================================
 * Rendering and serialization
 * ============================================================================
 */

function renderNdjson(
  resources:
    readonly StrategyLibraryExportResource[],
): string {
  if (resources.length === 0) {
    return "";
  }

  return `${resources
    .map((resource) =>
      stableStringify(
        resource,
        0,
      ),
    )
    .join("\n")}\n`;
}

function stableStringify(
  value: unknown,
  indentation: number,
): string {
  return JSON.stringify(
    normalizeSerializableValue(value),
    null,
    indentation,
  );
}

function normalizeSerializableValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeSerializableValue,
    );
  }

  if (isRecord(value)) {
    const result:
      Record<string, unknown> = {};

    for (
      const key of Object.keys(value).sort(
        compareText,
      )
    ) {
      result[key] =
        normalizeSerializableValue(
          value[key],
        );
    }

    return result;
  }

  return String(value);
}

function calculateDeterministicChecksum(
  value: string,
): string {
  let hash = 2_166_136_261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(
      hash,
      16_777_619,
    );
  }

  return `fnv1a32:${(
    hash >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

function createExportId(
  generatedAt:
    UnixTimestampMilliseconds,
  scope: StrategyLibraryExportScope,
  counts: StrategyLibraryExportCounts,
): string {
  const identity =
    stableStringify(
      {
        generatedAt,
        scope,
        counts,
        schemaVersion:
          STRATEGY_LIBRARY_SCHEMA_VERSION,
      },
      0,
    );

  return [
    "strategy-library-export",
    generatedAt,
    scope.toLowerCase(),
    calculateDeterministicChecksum(
      identity,
    ).replace("fnv1a32:", ""),
  ].join(":");
}

/* ============================================================================
 * Immutability
 * ============================================================================
 */

function immutableCopy<T>(
  value: T,
): T {
  return deepFreeze(
    cloneValue(value),
  );
}

function cloneValue<T>(
  value: T,
): T {
  if (Array.isArray(value)) {
    return value.map(
      (item) => cloneValue(item),
    ) as unknown as T;
  }

  if (isRecord(value)) {
    const clone:
      Record<PropertyKey, unknown> = {};

    for (
      const key of Reflect.ownKeys(value)
    ) {
      clone[key] = cloneValue(
        value[key],
      );
    }

    return clone as T;
  }

  return value;
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (
    const key of Reflect.ownKeys(value)
  ) {
    deepFreeze(
      (
        value as Record<
          PropertyKey,
          unknown
        >
      )[key],
    );
  }

  return value;
}