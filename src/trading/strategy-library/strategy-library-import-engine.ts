/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-import-engine.ts
 *
 * Purpose:
 * Imports deterministic Strategy Library export packages into the live library
 * registry with schema checks, validation, duplicate policies, dry-run support,
 * transactional rollback, immutable reports, and deterministic ordering.
 *
 * Responsibilities:
 *
 * - parse JSON and NDJSON Strategy Library exports
 * - verify schema identity and optional checksums
 * - validate entries, collections, and releases before mutation
 * - detect duplicate identities
 * - support reject, skip, and replace conflict policies
 * - register resources in dependency-safe order
 * - restore registry state when a transactional import fails
 * - produce immutable import plans and reports
 *
 * This engine performs no filesystem or network I/O. Export content is supplied
 * directly as a string or as an already parsed export package.
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
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseId,
  type StrategyLibrarySchemaVersion,
  type StrategyLibraryValidationIssue,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

import {
  StrategyLibraryValidator,
} from "./strategy-library-validator";

import type {
  StrategyLibraryExportFormat,
  StrategyLibraryExportManifest,
  StrategyLibraryExportPackage,
  StrategyLibraryExportResource,
  StrategyLibraryExportResourceType,
} from "./strategy-library-export-engine";

/* ============================================================================
 * Import types
 * ============================================================================
 */

export type StrategyLibraryImportConflictPolicy =
  | "REJECT"
  | "SKIP"
  | "REPLACE";

export type StrategyLibraryImportMode =
  | "APPLY"
  | "DRY_RUN";

export type StrategyLibraryImportStatus =
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "DRY_RUN_COMPLETED"
  | "FAILED";

export type StrategyLibraryImportResourceType =
  | "ENTRY"
  | "COLLECTION"
  | "RELEASE";

export type StrategyLibraryImportAction =
  | "CREATE"
  | "REPLACE"
  | "SKIP";

export type StrategyLibraryImportFailureStage =
  | "PARSING"
  | "SCHEMA_VALIDATION"
  | "CHECKSUM_VALIDATION"
  | "RESOURCE_VALIDATION"
  | "PLANNING"
  | "REGISTRATION"
  | "ROLLBACK";

/* ============================================================================
 * Registry extension
 * ============================================================================
 */

export interface StrategyLibraryImportRegistry
  extends StrategyLibraryRegistryPort {
  registerCollection(
    collection: StrategyLibraryCollection,
  ): void;

  unregisterCollection(
    collectionId: StrategyLibraryCollectionId,
  ): boolean;

  getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined;

  listCollections():
    readonly StrategyLibraryCollection[];

  registerRelease(
    release: StrategyLibraryRelease,
  ): void;

  unregisterRelease(
    releaseId: StrategyLibraryReleaseId,
  ): boolean;

  getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined;

  listReleases():
    readonly StrategyLibraryRelease[];
}

/* ============================================================================
 * Clock
 * ============================================================================
 */

export interface StrategyLibraryImportClock {
  now(): UnixTimestampMilliseconds;
}

/* ============================================================================
 * Options
 * ============================================================================
 */

export interface StrategyLibraryImportEngineOptions {
  readonly validator?: StrategyLibraryValidatorPort;

  readonly clock?: StrategyLibraryImportClock;

  readonly defaultConflictPolicy?:
    StrategyLibraryImportConflictPolicy;

  readonly defaultTransactional?: boolean;

  readonly defaultVerifyChecksums?: boolean;

  readonly requireSchemaVersionMatch?: boolean;

  readonly maximumInputCharacters?: number;

  readonly maximumEntries?: number;

  readonly maximumCollections?: number;

  readonly maximumReleases?: number;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Requests
 * ============================================================================
 */

export interface StrategyLibraryImportContentSource {
  readonly format: StrategyLibraryExportFormat;

  readonly content: string;
}

export interface StrategyLibraryImportPackageSource {
  readonly package: StrategyLibraryExportPackage;
}

export type StrategyLibraryImportSource =
  | StrategyLibraryImportContentSource
  | StrategyLibraryImportPackageSource;

export interface StrategyLibraryImportRequest {
  readonly source: StrategyLibraryImportSource;

  readonly mode?: StrategyLibraryImportMode;

  readonly conflictPolicy?:
    StrategyLibraryImportConflictPolicy;

  readonly transactional?: boolean;

  readonly verifyChecksums?: boolean;

  readonly requireSchemaVersionMatch?: boolean;

  readonly includeEntries?: boolean;

  readonly includeCollections?: boolean;

  readonly includeReleases?: boolean;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Plans and reports
 * ============================================================================
 */

export interface StrategyLibraryImportResourcePlan {
  readonly resourceType:
    StrategyLibraryImportResourceType;

  readonly resourceId: string;

  readonly action: StrategyLibraryImportAction;

  readonly reason: string;

  readonly valid: boolean;

  readonly validationReport:
    StrategyLibraryValidationReport;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryImportCounts {
  readonly sourceEntries: number;

  readonly sourceCollections: number;

  readonly sourceReleases: number;

  readonly plannedCreates: number;

  readonly plannedReplacements: number;

  readonly plannedSkips: number;

  readonly importedEntries: number;

  readonly importedCollections: number;

  readonly importedReleases: number;
}

export interface StrategyLibraryImportPlan {
  readonly schemaVersion:
    StrategyLibrarySchemaVersion;

  readonly mode: StrategyLibraryImportMode;

  readonly conflictPolicy:
    StrategyLibraryImportConflictPolicy;

  readonly transactional: boolean;

  readonly verifyChecksums: boolean;

  readonly entryPlans:
    readonly StrategyLibraryImportResourcePlan[];

  readonly collectionPlans:
    readonly StrategyLibraryImportResourcePlan[];

  readonly releasePlans:
    readonly StrategyLibraryImportResourcePlan[];

  readonly valid: boolean;

  readonly warnings: readonly string[];

  readonly generatedAt: UnixTimestampMilliseconds;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryImportFailure {
  readonly stage:
    StrategyLibraryImportFailureStage;

  readonly resourceType?:
    StrategyLibraryImportResourceType;

  readonly resourceId?: string;

  readonly message: string;

  readonly cause?: unknown;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryImportResult {
  readonly status: StrategyLibraryImportStatus;

  readonly plan: StrategyLibraryImportPlan;

  readonly counts: StrategyLibraryImportCounts;

  readonly importedEntryIds:
    readonly StrategyLibraryEntryId[];

  readonly importedCollectionIds:
    readonly StrategyLibraryCollectionId[];

  readonly importedReleaseIds:
    readonly StrategyLibraryReleaseId[];

  readonly skippedResourceIds:
    readonly string[];

  readonly warnings: readonly string[];

  readonly failure?: StrategyLibraryImportFailure;

  readonly startedAt: UnixTimestampMilliseconds;

  readonly completedAt: UnixTimestampMilliseconds;

  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Errors
 * ============================================================================
 */

export type StrategyLibraryImportEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_REQUEST"
  | "INPUT_SIZE_EXCEEDED"
  | "INVALID_JSON"
  | "INVALID_NDJSON"
  | "INVALID_EXPORT_PACKAGE"
  | "SCHEMA_VERSION_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "RESOURCE_VALIDATION_FAILED"
  | "DUPLICATE_RESOURCE"
  | "REGISTRY_OPERATION_FAILED"
  | "ROLLBACK_FAILED"
  | "IMPORT_FAILED";

export interface StrategyLibraryImportEngineErrorDetails {
  readonly stage?: StrategyLibraryImportFailureStage;

  readonly field?: string;

  readonly resourceType?:
    StrategyLibraryImportResourceType;

  readonly resourceId?: string;

  readonly entryId?: StrategyLibraryEntryId;

  readonly strategyId?: StrategyId;

  readonly strategyVersion?: StrategyVersion;

  readonly collectionId?: StrategyLibraryCollectionId;

  readonly releaseId?: StrategyLibraryReleaseId;

  readonly validationReport?:
    StrategyLibraryValidationReport;

  readonly cause?: unknown;

  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryImportEngineError extends Error {
  public readonly code:
    StrategyLibraryImportEngineErrorCode;

  public readonly stage?:
    StrategyLibraryImportFailureStage;

  public readonly field?: string;

  public readonly resourceType?:
    StrategyLibraryImportResourceType;

  public readonly resourceId?: string;

  public readonly entryId?:
    StrategyLibraryEntryId;

  public readonly strategyId?: StrategyId;

  public readonly strategyVersion?:
    StrategyVersion;

  public readonly collectionId?:
    StrategyLibraryCollectionId;

  public readonly releaseId?:
    StrategyLibraryReleaseId;

  public readonly validationReport?:
    StrategyLibraryValidationReport;

  public readonly cause?: unknown;

  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryImportEngineErrorCode,
    message: string,
    details:
      StrategyLibraryImportEngineErrorDetails = {},
  ) {
    super(message);

    this.name =
      "StrategyLibraryImportEngineError";

    this.code = code;
    this.stage = details.stage;
    this.field = details.field;
    this.resourceType =
      details.resourceType;
    this.resourceId = details.resourceId;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion =
      details.strategyVersion;
    this.collectionId =
      details.collectionId;
    this.releaseId = details.releaseId;
    this.validationReport =
      details.validationReport === undefined
        ? undefined
        : immutableCopy(
            details.validationReport,
          );
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ??
        EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryImportEngineError
        .prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface ResolvedOptions {
  readonly validator:
    StrategyLibraryValidatorPort;

  readonly clock:
    StrategyLibraryImportClock;

  readonly defaultConflictPolicy:
    StrategyLibraryImportConflictPolicy;

  readonly defaultTransactional: boolean;

  readonly defaultVerifyChecksums: boolean;

  readonly requireSchemaVersionMatch: boolean;

  readonly maximumInputCharacters: number;

  readonly maximumEntries: number;

  readonly maximumCollections: number;

  readonly maximumReleases: number;

  readonly metadata: StrategyMetadata;
}

interface NormalizedRequest {
  readonly source:
    StrategyLibraryImportSource;

  readonly mode:
    StrategyLibraryImportMode;

  readonly conflictPolicy:
    StrategyLibraryImportConflictPolicy;

  readonly transactional: boolean;

  readonly verifyChecksums: boolean;

  readonly requireSchemaVersionMatch: boolean;

  readonly includeEntries: boolean;

  readonly includeCollections: boolean;

  readonly includeReleases: boolean;

  readonly metadata: StrategyMetadata;
}

interface PreparedImport {
  readonly manifest?:
    StrategyLibraryExportManifest;

  readonly schemaVersion:
    StrategyLibrarySchemaVersion;

  readonly entries:
    readonly StrategyLibraryEntry[];

  readonly collections:
    readonly StrategyLibraryCollection[];

  readonly releases:
    readonly StrategyLibraryRelease[];

  readonly resources:
    readonly StrategyLibraryExportResource[];
}

interface RegistryBackup {
  readonly entries:
    readonly StrategyLibraryEntry[];

  readonly collections:
    readonly StrategyLibraryCollection[];

  readonly releases:
    readonly StrategyLibraryRelease[];
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_CLOCK:
  StrategyLibraryImportClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const DEFAULT_MAXIMUM_INPUT_CHARACTERS =
  100_000_000;

const DEFAULT_MAXIMUM_ENTRIES = 100_000;

const DEFAULT_MAXIMUM_COLLECTIONS = 10_000;

const DEFAULT_MAXIMUM_RELEASES = 10_000;

const EMPTY_ENTRIES:
  readonly StrategyLibraryEntry[] =
  Object.freeze([]);

const EMPTY_COLLECTIONS:
  readonly StrategyLibraryCollection[] =
  Object.freeze([]);

const EMPTY_RELEASES:
  readonly StrategyLibraryRelease[] =
  Object.freeze([]);

const EMPTY_EXPORT_RESOURCES:
  readonly StrategyLibraryExportResource[] =
  Object.freeze([]);

const EMPTY_RESOURCE_PLANS:
  readonly StrategyLibraryImportResourcePlan[] =
  Object.freeze([]);

const EMPTY_STRINGS:
  readonly string[] =
  Object.freeze([]);

const EMPTY_VALIDATION_REPORT:
  StrategyLibraryValidationReport =
  Object.freeze({
    valid: true,
    issues: Object.freeze([]),
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    validatedAt: 0,
    metadata: EMPTY_STRATEGY_METADATA,
  });

/* ============================================================================
 * Import engine
 * ============================================================================
 */

export class StrategyLibraryImportEngine {
  private readonly registry:
    StrategyLibraryImportRegistry;

  private readonly options: ResolvedOptions;

  public constructor(
    registry:
      StrategyLibraryImportRegistry,
    options:
      StrategyLibraryImportEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    const defaultConflictPolicy =
      options.defaultConflictPolicy ??
      "REJECT";

    const defaultTransactional =
      options.defaultTransactional ?? true;

    const defaultVerifyChecksums =
      options.defaultVerifyChecksums ?? true;

    const requireSchemaVersionMatch =
      options.requireSchemaVersionMatch ??
      true;

    const maximumInputCharacters =
      options.maximumInputCharacters ??
      DEFAULT_MAXIMUM_INPUT_CHARACTERS;

    const maximumEntries =
      options.maximumEntries ??
      DEFAULT_MAXIMUM_ENTRIES;

    const maximumCollections =
      options.maximumCollections ??
      DEFAULT_MAXIMUM_COLLECTIONS;

    const maximumReleases =
      options.maximumReleases ??
      DEFAULT_MAXIMUM_RELEASES;

    assertConflictPolicy(
      defaultConflictPolicy,
      "options.defaultConflictPolicy",
    );

    assertBoolean(
      defaultTransactional,
      "options.defaultTransactional",
    );

    assertBoolean(
      defaultVerifyChecksums,
      "options.defaultVerifyChecksums",
    );

    assertBoolean(
      requireSchemaVersionMatch,
      "options.requireSchemaVersionMatch",
    );

    assertPositiveSafeInteger(
      maximumInputCharacters,
      "options.maximumInputCharacters",
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

    this.registry = registry;

    this.options = deepFreeze({
      validator:
        options.validator ??
        new StrategyLibraryValidator(),
      clock:
        options.clock ??
        DEFAULT_CLOCK,
      defaultConflictPolicy,
      defaultTransactional,
      defaultVerifyChecksums,
      requireSchemaVersionMatch,
      maximumInputCharacters,
      maximumEntries,
      maximumCollections,
      maximumReleases,
      metadata: immutableCopy(
        options.metadata ??
          EMPTY_STRATEGY_METADATA,
      ),
    });

    this.now();
  }

  public import(
    request: StrategyLibraryImportRequest,
  ): StrategyLibraryImportResult {
    const normalized =
      this.normalizeRequest(request);

    const startedAt = this.now();

    let prepared: PreparedImport;
    let plan: StrategyLibraryImportPlan;

    try {
      prepared =
        this.prepareImport(normalized);

      this.assertSchema(
        prepared,
        normalized,
      );

      this.assertResourceLimits(prepared);

      if (normalized.verifyChecksums) {
        this.verifyChecksums(prepared);
      }

      plan = this.createPlan(
        prepared,
        normalized,
      );
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryImportEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryImportEngineError(
        "IMPORT_FAILED",
        "Strategy-library import preparation failed.",
        {
          stage: "PLANNING",
          cause,
          metadata: normalized.metadata,
        },
      );
    }

    if (!plan.valid) {
      throw new StrategyLibraryImportEngineError(
        "RESOURCE_VALIDATION_FAILED",
        "The strategy-library import contains invalid resources.",
        {
          stage: "RESOURCE_VALIDATION",
          metadata: normalized.metadata,
        },
      );
    }

    if (normalized.mode === "DRY_RUN") {
      const completedAt = this.now();

      return deepFreeze({
        status: "DRY_RUN_COMPLETED",
        plan,
        counts: createCounts(
          prepared,
          plan,
          0,
          0,
          0,
        ),
        importedEntryIds: EMPTY_STRINGS,
        importedCollectionIds:
          EMPTY_STRINGS,
        importedReleaseIds: EMPTY_STRINGS,
        skippedResourceIds:
          collectSkippedIds(plan),
        warnings: plan.warnings,
        startedAt,
        completedAt,
        metadata: normalized.metadata,
      });
    }

    const backup =
      normalized.transactional
        ? this.captureBackup()
        : undefined;

    const importedEntryIds:
      StrategyLibraryEntryId[] = [];

    const importedCollectionIds:
      StrategyLibraryCollectionId[] = [];

    const importedReleaseIds:
      StrategyLibraryReleaseId[] = [];

    try {
      this.applyEntryPlans(
        prepared.entries,
        plan.entryPlans,
        importedEntryIds,
      );

      this.applyCollectionPlans(
        prepared.collections,
        plan.collectionPlans,
        importedCollectionIds,
      );

      this.applyReleasePlans(
        prepared.releases,
        plan.releasePlans,
        importedReleaseIds,
      );

      const completedAt = this.now();

      return deepFreeze({
        status:
          plan.warnings.length === 0
            ? "COMPLETED"
            : "COMPLETED_WITH_WARNINGS",
        plan,
        counts: createCounts(
          prepared,
          plan,
          importedEntryIds.length,
          importedCollectionIds.length,
          importedReleaseIds.length,
        ),
        importedEntryIds:
          freezeSortedStrings(
            importedEntryIds,
          ),
        importedCollectionIds:
          freezeSortedStrings(
            importedCollectionIds,
          ),
        importedReleaseIds:
          freezeSortedStrings(
            importedReleaseIds,
          ),
        skippedResourceIds:
          collectSkippedIds(plan),
        warnings: plan.warnings,
        startedAt,
        completedAt,
        metadata: normalized.metadata,
      });
    } catch (cause) {
      if (
        normalized.transactional &&
        backup !== undefined
      ) {
        try {
          this.restoreBackup(backup);
        } catch (rollbackCause) {
          throw new StrategyLibraryImportEngineError(
            "ROLLBACK_FAILED",
            "Strategy-library import failed and the registry rollback also failed.",
            {
              stage: "ROLLBACK",
              cause: Object.freeze({
                importCause: cause,
                rollbackCause,
              }),
              metadata: normalized.metadata,
            },
          );
        }
      }

      if (
        cause instanceof
        StrategyLibraryImportEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryImportEngineError(
        "REGISTRY_OPERATION_FAILED",
        "Strategy-library import failed during registry mutation.",
        {
          stage: "REGISTRATION",
          cause,
          metadata: normalized.metadata,
        },
      );
    }
  }

  public dryRun(
    source: StrategyLibraryImportSource,
    conflictPolicy:
      StrategyLibraryImportConflictPolicy =
      this.options.defaultConflictPolicy,
  ): StrategyLibraryImportResult {
    return this.import({
      source,
      mode: "DRY_RUN",
      conflictPolicy,
    });
  }

  public importJson(
    content: string,
    options: Omit<
      StrategyLibraryImportRequest,
      "source"
    > = {},
  ): StrategyLibraryImportResult {
    return this.import({
      ...options,
      source: {
        format: "JSON",
        content,
      },
    });
  }

  public importNdjson(
    content: string,
    options: Omit<
      StrategyLibraryImportRequest,
      "source"
    > = {},
  ): StrategyLibraryImportResult {
    return this.import({
      ...options,
      source: {
        format: "NDJSON",
        content,
      },
    });
  }

  public importPackage(
    exportPackage:
      StrategyLibraryExportPackage,
    options: Omit<
      StrategyLibraryImportRequest,
      "source"
    > = {},
  ): StrategyLibraryImportResult {
    return this.import({
      ...options,
      source: {
        package: exportPackage,
      },
    });
  }

  private normalizeRequest(
    request:
      StrategyLibraryImportRequest,
  ): NormalizedRequest {
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      throw new StrategyLibraryImportEngineError(
        "INVALID_REQUEST",
        "import request must be an object.",
        {
          stage: "PARSING",
          field: "request",
        },
      );
    }

    if (request.source === undefined) {
      throw new StrategyLibraryImportEngineError(
        "INVALID_REQUEST",
        "request.source is required.",
        {
          stage: "PARSING",
          field: "request.source",
        },
      );
    }

    assertImportSource(
      request.source,
      "request.source",
    );

    const mode:
      StrategyLibraryImportMode =
      request.mode ?? "APPLY";

    const conflictPolicy:
      StrategyLibraryImportConflictPolicy =
      request.conflictPolicy ??
      this.options.defaultConflictPolicy;

    const transactional: boolean =
      request.transactional ??
      this.options.defaultTransactional;

    const verifyChecksums: boolean =
      request.verifyChecksums ??
      this.options.defaultVerifyChecksums;

    const requireSchemaVersionMatch:
      boolean =
      request.requireSchemaVersionMatch ??
      this.options.requireSchemaVersionMatch;

    const includeEntries: boolean =
      request.includeEntries ?? true;

    const includeCollections: boolean =
      request.includeCollections ?? true;

    const includeReleases: boolean =
      request.includeReleases ?? true;

    assertImportMode(
      mode,
      "request.mode",
    );

    assertConflictPolicy(
      conflictPolicy,
      "request.conflictPolicy",
    );

    assertBoolean(
      transactional,
      "request.transactional",
    );

    assertBoolean(
      verifyChecksums,
      "request.verifyChecksums",
    );

    assertBoolean(
      requireSchemaVersionMatch,
      "request.requireSchemaVersionMatch",
    );

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

    const metadata: StrategyMetadata =
      request.metadata ??
      this.options.metadata;

    const normalized:
      NormalizedRequest = {
      source: immutableCopy(
        request.source,
      ),
      mode,
      conflictPolicy,
      transactional,
      verifyChecksums,
      requireSchemaVersionMatch,
      includeEntries,
      includeCollections,
      includeReleases,
      metadata: immutableCopy(metadata),
    };

    return deepFreeze(normalized);
  }

  private prepareImport(
    request: NormalizedRequest,
  ): PreparedImport {
    if (
      isPackageSource(request.source)
    ) {
      return this.prepareFromPackage(
        request.source.package,
        request,
      );
    }

    if (
      request.source.content.length >
      this.options.maximumInputCharacters
    ) {
      throw new StrategyLibraryImportEngineError(
        "INPUT_SIZE_EXCEEDED",
        `Import input contains ${request.source.content.length} characters, exceeding the configured maximum of ${this.options.maximumInputCharacters}.`,
        {
          stage: "PARSING",
          field: "request.source.content",
          metadata: request.metadata,
        },
      );
    }

    return request.source.format === "JSON"
      ? this.parseJson(
          request.source.content,
          request,
        )
      : this.parseNdjson(
          request.source.content,
          request,
        );
  }

  private prepareFromPackage(
    exportPackage:
      StrategyLibraryExportPackage,
    request: NormalizedRequest,
  ): PreparedImport {
    assertExportPackage(
      exportPackage,
      "request.source.package",
    );

    return deepFreeze({
      manifest:
        immutableCopy(
          exportPackage.manifest,
        ),
      schemaVersion:
        exportPackage.manifest
          .schemaVersion,
      entries:
        request.includeEntries
          ? sortEntries(
              exportPackage.entries,
            )
          : EMPTY_ENTRIES,
      collections:
        request.includeCollections
          ? sortCollections(
              exportPackage.collections,
            )
          : EMPTY_COLLECTIONS,
      releases:
        request.includeReleases
          ? sortReleases(
              exportPackage.releases,
            )
          : EMPTY_RELEASES,
      resources:
        EMPTY_EXPORT_RESOURCES,
    });
  }

  private parseJson(
    content: string,
    request: NormalizedRequest,
  ): PreparedImport {
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (cause) {
      throw new StrategyLibraryImportEngineError(
        "INVALID_JSON",
        "The supplied strategy-library JSON export is invalid.",
        {
          stage: "PARSING",
          cause,
          metadata: request.metadata,
        },
      );
    }

    assertExportPackage(
      parsed,
      "JSON export",
    );

    return this.prepareFromPackage(
      parsed,
      request,
    );
  }

  private parseNdjson(
    content: string,
    request: NormalizedRequest,
  ): PreparedImport {
    const lines = content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const resources:
      StrategyLibraryExportResource[] = [];

    for (
      let index = 0;
      index < lines.length;
      index += 1
    ) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(
          lines[index] ?? "",
        );
      } catch (cause) {
        throw new StrategyLibraryImportEngineError(
          "INVALID_NDJSON",
          `Invalid NDJSON resource at line ${index + 1}.`,
          {
            stage: "PARSING",
            field:
              `request.source.content:${index + 1}`,
            cause,
            metadata: request.metadata,
          },
        );
      }

      assertExportResource(
        parsed,
        `NDJSON line ${index + 1}`,
      );

      resources.push(
        immutableCopy(parsed),
      );
    }

    const manifestResource =
      resources.find(
        (resource) =>
          resource.resourceType ===
          "MANIFEST",
      );

    const manifest =
      manifestResource?.content;

    if (
      manifest === undefined ||
      !isExportManifest(manifest)
    ) {
      throw new StrategyLibraryImportEngineError(
        "INVALID_EXPORT_PACKAGE",
        "The NDJSON export does not contain a valid MANIFEST resource.",
        {
          stage: "PARSING",
          metadata: request.metadata,
        },
      );
    }

    const entries = request.includeEntries
      ? resources
          .filter(
            (resource) =>
              resource.resourceType ===
              "ENTRY",
          )
          .map((resource) => {
            assertEntry(
              resource.content,
              resource.resourceId,
            );

            return immutableCopy(
              resource.content,
            );
          })
      : [];

    const collections =
      request.includeCollections
        ? resources
            .filter(
              (resource) =>
                resource.resourceType ===
                "COLLECTION",
            )
            .map((resource) => {
              assertCollection(
                resource.content,
                resource.resourceId,
              );

              return immutableCopy(
                resource.content,
              );
            })
        : [];

    const releases =
      request.includeReleases
        ? resources
            .filter(
              (resource) =>
                resource.resourceType ===
                "RELEASE",
            )
            .map((resource) => {
              assertRelease(
                resource.content,
                resource.resourceId,
              );

              return immutableCopy(
                resource.content,
              );
            })
        : [];

    return deepFreeze({
      manifest:
        immutableCopy(manifest),
      schemaVersion:
        manifest.schemaVersion,
      entries:
        sortEntries(entries),
      collections:
        sortCollections(collections),
      releases:
        sortReleases(releases),
      resources:
        Object.freeze(
          resources.sort(
            (
              left,
              right,
            ) =>
              left.sequence -
                right.sequence ||
              compareText(
                left.resourceId,
                right.resourceId,
              ),
          ),
        ),
    });
  }

  private assertSchema(
    prepared: PreparedImport,
    request: NormalizedRequest,
  ): void {
    if (
      request.requireSchemaVersionMatch &&
      prepared.schemaVersion !==
        STRATEGY_LIBRARY_SCHEMA_VERSION
    ) {
      throw new StrategyLibraryImportEngineError(
        "SCHEMA_VERSION_MISMATCH",
        `Import schema version '${prepared.schemaVersion}' does not match supported version '${STRATEGY_LIBRARY_SCHEMA_VERSION}'.`,
        {
          stage: "SCHEMA_VALIDATION",
          metadata: request.metadata,
        },
      );
    }
  }

  private assertResourceLimits(
    prepared: PreparedImport,
  ): void {
    if (
      prepared.entries.length >
      this.options.maximumEntries
    ) {
      throw new StrategyLibraryImportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Import contains ${prepared.entries.length} entries, exceeding the configured maximum of ${this.options.maximumEntries}.`,
        {
          stage: "PARSING",
          field: "entries",
        },
      );
    }

    if (
      prepared.collections.length >
      this.options.maximumCollections
    ) {
      throw new StrategyLibraryImportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Import contains ${prepared.collections.length} collections, exceeding the configured maximum of ${this.options.maximumCollections}.`,
        {
          stage: "PARSING",
          field: "collections",
        },
      );
    }

    if (
      prepared.releases.length >
      this.options.maximumReleases
    ) {
      throw new StrategyLibraryImportEngineError(
        "RESOURCE_LIMIT_EXCEEDED",
        `Import contains ${prepared.releases.length} releases, exceeding the configured maximum of ${this.options.maximumReleases}.`,
        {
          stage: "PARSING",
          field: "releases",
        },
      );
    }
  }

  private verifyChecksums(
    prepared: PreparedImport,
  ): void {
    for (
      const resource of prepared.resources
    ) {
      const canonical =
        stableStringify(resource.content);

      const expected =
        calculateDeterministicChecksum(
          canonical,
        );

      if (resource.checksum !== expected) {
        throw new StrategyLibraryImportEngineError(
          "CHECKSUM_MISMATCH",
          `Checksum mismatch for export resource '${resource.resourceId}'.`,
          {
            stage:
              "CHECKSUM_VALIDATION",
            resourceType:
              mapResourceType(
                resource.resourceType,
              ),
            resourceId:
              resource.resourceId,
          },
        );
      }
    }
  }

  private createPlan(
    prepared: PreparedImport,
    request: NormalizedRequest,
  ): StrategyLibraryImportPlan {
    const warnings: string[] = [];

    const entryPlans =
      prepared.entries.map((entry) =>
        this.planEntry(
          entry,
          request.conflictPolicy,
        ),
      );

    const collectionPlans =
      prepared.collections.map(
        (collection) =>
          this.planCollection(
            collection,
            request.conflictPolicy,
          ),
      );

    const releasePlans =
      prepared.releases.map((release) =>
        this.planRelease(
          release,
          request.conflictPolicy,
        ),
      );

    for (
      const plan of [
        ...entryPlans,
        ...collectionPlans,
        ...releasePlans,
      ]
    ) {
      if (
        plan.action === "SKIP"
      ) {
        warnings.push(
          `${plan.resourceType} '${plan.resourceId}' will be skipped: ${plan.reason}`,
        );
      }

      if (
        plan.validationReport.warningCount >
        0
      ) {
        warnings.push(
          `${plan.resourceType} '${plan.resourceId}' produced ${plan.validationReport.warningCount} validation warning(s).`,
        );
      }
    }

    const valid = [
      ...entryPlans,
      ...collectionPlans,
      ...releasePlans,
    ].every((plan) => plan.valid);

    return deepFreeze({
      schemaVersion:
        prepared.schemaVersion,
      mode: request.mode,
      conflictPolicy:
        request.conflictPolicy,
      transactional:
        request.transactional,
      verifyChecksums:
        request.verifyChecksums,
      entryPlans:
        freezePlans(entryPlans),
      collectionPlans:
        freezePlans(collectionPlans),
      releasePlans:
        freezePlans(releasePlans),
      valid,
      warnings:
        freezeSortedStrings(warnings),
      generatedAt: this.now(),
      metadata: request.metadata,
    });
  }

  private planEntry(
    entry: StrategyLibraryEntry,
    conflictPolicy:
      StrategyLibraryImportConflictPolicy,
  ): StrategyLibraryImportResourcePlan {
    const report =
      this.options.validator
        .validateEntry(entry);

    const existingById =
      this.registry
        .list()
        .find(
          (candidate) =>
            candidate.entryId ===
            entry.entryId,
        );

    const existingByVersion =
      this.registry.get(
        entry.strategyId,
        entry.strategyVersion,
      );

    const existing =
      existingById ??
      existingByVersion;

    return createResourcePlan(
      "ENTRY",
      entry.entryId,
      report,
      resolveAction(
        existing !== undefined,
        conflictPolicy,
        `Entry '${entry.entryId}' already exists.`,
      ),
      this.options.metadata,
    );
  }

  private planCollection(
    collection:
      StrategyLibraryCollection,
    conflictPolicy:
      StrategyLibraryImportConflictPolicy,
  ): StrategyLibraryImportResourcePlan {
    const report =
      this.options.validator
        .validateCollection(collection);

    const existing =
      this.registry.getCollection(
        collection.collectionId,
      );

    return createResourcePlan(
      "COLLECTION",
      collection.collectionId,
      report,
      resolveAction(
        existing !== undefined,
        conflictPolicy,
        `Collection '${collection.collectionId}' already exists.`,
      ),
      this.options.metadata,
    );
  }

  private planRelease(
    release: StrategyLibraryRelease,
    conflictPolicy:
      StrategyLibraryImportConflictPolicy,
  ): StrategyLibraryImportResourcePlan {
    const report =
      this.options.validator
        .validateRelease(release);

    const existing =
      this.registry.getRelease(
        release.releaseId,
      );

    return createResourcePlan(
      "RELEASE",
      release.releaseId,
      report,
      resolveAction(
        existing !== undefined,
        conflictPolicy,
        `Release '${release.releaseId}' already exists.`,
      ),
      this.options.metadata,
    );
  }

  private applyEntryPlans(
    entries:
      readonly StrategyLibraryEntry[],
    plans:
      readonly StrategyLibraryImportResourcePlan[],
    importedIds:
      StrategyLibraryEntryId[],
  ): void {
    const byId = new Map(
      entries.map(
        (entry) =>
          [entry.entryId, entry] as const,
      ),
    );

    for (const plan of plans) {
      if (plan.action === "SKIP") {
        continue;
      }

      const entry =
        byId.get(plan.resourceId);

      if (entry === undefined) {
        throw new StrategyLibraryImportEngineError(
          "INVALID_EXPORT_PACKAGE",
          `Planned entry '${plan.resourceId}' is missing from the prepared import.`,
          {
            stage: "REGISTRATION",
            resourceType: "ENTRY",
            resourceId:
              plan.resourceId,
          },
        );
      }

      if (plan.action === "REPLACE") {
        this.unregisterExistingEntry(
          entry,
        );
      }

      try {
        this.registry.register(entry);
      } catch (cause) {
        throw new StrategyLibraryImportEngineError(
          "REGISTRY_OPERATION_FAILED",
          `Failed to register strategy-library entry '${entry.entryId}'.`,
          {
            stage: "REGISTRATION",
            resourceType: "ENTRY",
            resourceId:
              entry.entryId,
            entryId: entry.entryId,
            strategyId:
              entry.strategyId,
            strategyVersion:
              entry.strategyVersion,
            cause,
          },
        );
      }

      importedIds.push(entry.entryId);
    }
  }

  private applyCollectionPlans(
    collections:
      readonly StrategyLibraryCollection[],
    plans:
      readonly StrategyLibraryImportResourcePlan[],
    importedIds:
      StrategyLibraryCollectionId[],
  ): void {
    const byId = new Map(
      collections.map(
        (collection) =>
          [
            collection.collectionId,
            collection,
          ] as const,
      ),
    );

    for (const plan of plans) {
      if (plan.action === "SKIP") {
        continue;
      }

      const collection =
        byId.get(plan.resourceId);

      if (collection === undefined) {
        throw new StrategyLibraryImportEngineError(
          "INVALID_EXPORT_PACKAGE",
          `Planned collection '${plan.resourceId}' is missing from the prepared import.`,
          {
            stage: "REGISTRATION",
            resourceType: "COLLECTION",
            resourceId:
              plan.resourceId,
          },
        );
      }

      if (plan.action === "REPLACE") {
        this.registry.unregisterCollection(
          collection.collectionId,
        );
      }

      try {
        this.registry.registerCollection(
          collection,
        );
      } catch (cause) {
        throw new StrategyLibraryImportEngineError(
          "REGISTRY_OPERATION_FAILED",
          `Failed to register strategy-library collection '${collection.collectionId}'.`,
          {
            stage: "REGISTRATION",
            resourceType: "COLLECTION",
            resourceId:
              collection.collectionId,
            collectionId:
              collection.collectionId,
            cause,
          },
        );
      }

      importedIds.push(
        collection.collectionId,
      );
    }
  }

  private applyReleasePlans(
    releases:
      readonly StrategyLibraryRelease[],
    plans:
      readonly StrategyLibraryImportResourcePlan[],
    importedIds:
      StrategyLibraryReleaseId[],
  ): void {
    const byId = new Map(
      releases.map(
        (release) =>
          [
            release.releaseId,
            release,
          ] as const,
      ),
    );

    for (const plan of plans) {
      if (plan.action === "SKIP") {
        continue;
      }

      const release =
        byId.get(plan.resourceId);

      if (release === undefined) {
        throw new StrategyLibraryImportEngineError(
          "INVALID_EXPORT_PACKAGE",
          `Planned release '${plan.resourceId}' is missing from the prepared import.`,
          {
            stage: "REGISTRATION",
            resourceType: "RELEASE",
            resourceId:
              plan.resourceId,
          },
        );
      }

      if (plan.action === "REPLACE") {
        this.registry.unregisterRelease(
          release.releaseId,
        );
      }

      try {
        this.registry.registerRelease(
          release,
        );
      } catch (cause) {
        throw new StrategyLibraryImportEngineError(
          "REGISTRY_OPERATION_FAILED",
          `Failed to register strategy-library release '${release.releaseId}'.`,
          {
            stage: "REGISTRATION",
            resourceType: "RELEASE",
            resourceId:
              release.releaseId,
            releaseId:
              release.releaseId,
            cause,
          },
        );
      }

      importedIds.push(
        release.releaseId,
      );
    }
  }

  private unregisterExistingEntry(
    entry: StrategyLibraryEntry,
  ): void {
    const existingById =
      this.registry
        .list()
        .find(
          (candidate) =>
            candidate.entryId ===
            entry.entryId,
        );

    if (existingById !== undefined) {
      this.registry.unregister(
        existingById.strategyId,
        existingById.strategyVersion,
      );
    }

    const existingByVersion =
      this.registry.get(
        entry.strategyId,
        entry.strategyVersion,
      );

    if (
      existingByVersion !== undefined &&
      existingByVersion.entryId !==
        existingById?.entryId
    ) {
      this.registry.unregister(
        existingByVersion.strategyId,
        existingByVersion.strategyVersion,
      );
    }
  }

  private captureBackup():
    RegistryBackup {
    return deepFreeze({
      entries: sortEntries(
        this.registry.list(),
      ),
      collections:
        sortCollections(
          this.registry.listCollections(),
        ),
      releases:
        sortReleases(
          this.registry.listReleases(),
        ),
    });
  }

  private restoreBackup(
    backup: RegistryBackup,
  ): void {
    for (
      const release of
      this.registry.listReleases()
    ) {
      this.registry.unregisterRelease(
        release.releaseId,
      );
    }

    for (
      const collection of
      this.registry.listCollections()
    ) {
      this.registry.unregisterCollection(
        collection.collectionId,
      );
    }

    for (
      const entry of
      this.registry.list()
    ) {
      this.registry.unregister(
        entry.strategyId,
        entry.strategyVersion,
      );
    }

    this.registry.registerMany(
      backup.entries,
    );

    for (
      const collection of
      backup.collections
    ) {
      this.registry.registerCollection(
        collection,
      );
    }

    for (
      const release of backup.releases
    ) {
      this.registry.registerRelease(
        release,
      );
    }
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
 * Factories
 * ============================================================================
 */

export function createStrategyLibraryImportEngine(
  registry:
    StrategyLibraryImportRegistry,
  options:
    StrategyLibraryImportEngineOptions = {},
): StrategyLibraryImportEngine {
  return new StrategyLibraryImportEngine(
    registry,
    options,
  );
}

export function importStrategyLibraryPackage(
  registry:
    StrategyLibraryImportRegistry,
  request:
    StrategyLibraryImportRequest,
  options:
    StrategyLibraryImportEngineOptions = {},
): StrategyLibraryImportResult {
  return createStrategyLibraryImportEngine(
    registry,
    options,
  ).import(request);
}

/* ============================================================================
 * Planning helpers
 * ============================================================================
 */

function resolveAction(
  exists: boolean,
  policy:
    StrategyLibraryImportConflictPolicy,
  duplicateReason: string,
): {
  readonly action:
    StrategyLibraryImportAction;

  readonly reason: string;

  readonly conflictValid: boolean;
} {
  if (!exists) {
    return Object.freeze({
      action: "CREATE",
      reason:
        "No existing resource conflicts with the import.",
      conflictValid: true,
    });
  }

  switch (policy) {
    case "SKIP":
      return Object.freeze({
        action: "SKIP",
        reason: duplicateReason,
        conflictValid: true,
      });

    case "REPLACE":
      return Object.freeze({
        action: "REPLACE",
        reason: duplicateReason,
        conflictValid: true,
      });

    case "REJECT":
      return Object.freeze({
        action: "SKIP",
        reason:
          `${duplicateReason} Conflict policy REJECT prevents import.`,
        conflictValid: false,
      });

    default:
      return assertNever(policy);
  }
}

function createResourcePlan(
  resourceType:
    StrategyLibraryImportResourceType,
  resourceId: string,
  report:
    StrategyLibraryValidationReport,
  actionResolution: {
    readonly action:
      StrategyLibraryImportAction;

    readonly reason: string;

    readonly conflictValid: boolean;
  },
  metadata: StrategyMetadata,
): StrategyLibraryImportResourcePlan {
  return deepFreeze({
    resourceType,
    resourceId,
    action:
      actionResolution.action,
    reason:
      actionResolution.reason,
    valid:
      report.valid &&
      actionResolution.conflictValid,
    validationReport:
      immutableCopy(report),
    metadata,
  });
}

function freezePlans(
  plans:
    readonly StrategyLibraryImportResourcePlan[],
): readonly StrategyLibraryImportResourcePlan[] {
  if (plans.length === 0) {
    return EMPTY_RESOURCE_PLANS;
  }

  return Object.freeze(
    [...plans]
      .sort((left, right) =>
        compareText(
          left.resourceId,
          right.resourceId,
        ),
      )
      .map(immutableCopy),
  );
}

function collectSkippedIds(
  plan: StrategyLibraryImportPlan,
): readonly string[] {
  return freezeSortedStrings(
    [
      ...plan.entryPlans,
      ...plan.collectionPlans,
      ...plan.releasePlans,
    ]
      .filter(
        (resourcePlan) =>
          resourcePlan.action === "SKIP",
      )
      .map(
        (resourcePlan) =>
          resourcePlan.resourceId,
      ),
  );
}

function createCounts(
  prepared: PreparedImport,
  plan: StrategyLibraryImportPlan,
  importedEntries: number,
  importedCollections: number,
  importedReleases: number,
): StrategyLibraryImportCounts {
  const plans = [
    ...plan.entryPlans,
    ...plan.collectionPlans,
    ...plan.releasePlans,
  ];

  return deepFreeze({
    sourceEntries:
      prepared.entries.length,
    sourceCollections:
      prepared.collections.length,
    sourceReleases:
      prepared.releases.length,
    plannedCreates:
      plans.filter(
        (item) =>
          item.action === "CREATE",
      ).length,
    plannedReplacements:
      plans.filter(
        (item) =>
          item.action === "REPLACE",
      ).length,
    plannedSkips:
      plans.filter(
        (item) =>
          item.action === "SKIP",
      ).length,
    importedEntries,
    importedCollections,
    importedReleases,
  });
}

/* ============================================================================
 * Guards
 * ============================================================================
 */

function assertRegistry(
  registry:
    StrategyLibraryImportRegistry,
): void {
  if (
    !isRecord(registry) ||
    typeof registry.register !==
      "function" ||
    typeof registry.registerMany !==
      "function" ||
    typeof registry.unregister !==
      "function" ||
    typeof registry.has !== "function" ||
    typeof registry.get !== "function" ||
    typeof registry.list !== "function" ||
    typeof registry.query !== "function" ||
    typeof registry.snapshot !==
      "function" ||
    typeof registry.registerCollection !==
      "function" ||
    typeof registry.unregisterCollection !==
      "function" ||
    typeof registry.getCollection !==
      "function" ||
    typeof registry.listCollections !==
      "function" ||
    typeof registry.registerRelease !==
      "function" ||
    typeof registry.unregisterRelease !==
      "function" ||
    typeof registry.getRelease !==
      "function" ||
    typeof registry.listReleases !==
      "function"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      "registry must implement StrategyLibraryImportRegistry.",
      {
        field: "registry",
      },
    );
  }
}

function assertOptions(
  options:
    StrategyLibraryImportEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }

  if (
    options.validator !== undefined &&
    (
      !isRecord(options.validator) ||
      typeof options.validator
        .validateEntry !== "function" ||
      typeof options.validator
        .validateCollection !== "function" ||
      typeof options.validator
        .validateRelease !== "function" ||
      typeof options.validator
        .assertValid !== "function"
    )
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      "options.validator must implement StrategyLibraryValidatorPort.",
      {
        field: "options.validator",
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
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      "options.clock must implement StrategyLibraryImportClock.",
      {
        field: "options.clock",
      },
    );
  }
}

function assertImportSource(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryImportSource {
  if (!isRecord(value)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_REQUEST",
      `${field} must be an import source object.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }

  if ("package" in value) {
    assertExportPackage(
      value.package,
      `${field}.package`,
    );

    return;
  }

  if (
    value.format !== "JSON" &&
    value.format !== "NDJSON"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_REQUEST",
      `${field}.format must be JSON or NDJSON.`,
      {
        stage: "PARSING",
        field: `${field}.format`,
      },
    );
  }

  if (
    typeof value.content !== "string"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_REQUEST",
      `${field}.content must be a string.`,
      {
        stage: "PARSING",
        field: `${field}.content`,
      },
    );
  }
}

function isPackageSource(
  source:
    StrategyLibraryImportSource,
): source is StrategyLibraryImportPackageSource {
  return (
    isRecord(source) &&
    "package" in source
  );
}

function assertExportPackage(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryExportPackage {
  if (!isRecord(value)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field} must be an export package object.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }

  if (!isExportManifest(value.manifest)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field}.manifest is invalid.`,
      {
        stage: "PARSING",
        field: `${field}.manifest`,
      },
    );
  }

  if (!Array.isArray(value.entries)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field}.entries must be an array.`,
      {
        stage: "PARSING",
        field: `${field}.entries`,
      },
    );
  }

  if (!Array.isArray(value.collections)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field}.collections must be an array.`,
      {
        stage: "PARSING",
        field: `${field}.collections`,
      },
    );
  }

  if (!Array.isArray(value.releases)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field}.releases must be an array.`,
      {
        stage: "PARSING",
        field: `${field}.releases`,
      },
    );
  }

  value.entries.forEach(
    (entry, index) =>
      assertEntry(
        entry,
        `${field}.entries[${index}]`,
      ),
  );

  value.collections.forEach(
    (collection, index) =>
      assertCollection(
        collection,
        `${field}.collections[${index}]`,
      ),
  );

  value.releases.forEach(
    (release, index) =>
      assertRelease(
        release,
        `${field}.releases[${index}]`,
      ),
  );
}

function isExportManifest(
  value: unknown,
): value is StrategyLibraryExportManifest {
  return (
    isRecord(value) &&
    typeof value.exportId === "string" &&
    typeof value.schemaVersion ===
      "string" &&
    (
      value.format === "JSON" ||
      value.format === "NDJSON"
    ) &&
    typeof value.generatedAt ===
      "number"
  );
}

function assertExportResource(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryExportResource {
  if (!isRecord(value)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field} must contain an export resource object.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }

  assertExportResourceType(
    value.resourceType,
    `${field}.resourceType`,
  );

  if (
    typeof value.resourceId !==
    "string" ||
    value.resourceId.trim().length === 0
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field}.resourceId must be a non-empty string.`,
      {
        stage: "PARSING",
        field: `${field}.resourceId`,
      },
    );
  }

  if (
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(
      value.sequence,
    ) ||
    value.sequence <= 0
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field}.sequence must be a positive safe integer.`,
      {
        stage: "PARSING",
        field: `${field}.sequence`,
      },
    );
  }

  if (
    typeof value.checksum !== "string"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field}.checksum must be a string.`,
      {
        stage: "PARSING",
        field: `${field}.checksum`,
      },
    );
  }

  if (!("content" in value)) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field}.content is required.`,
      {
        stage: "PARSING",
        field: `${field}.content`,
      },
    );
  }
}

function assertExportResourceType(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryExportResourceType {
  if (
    value !== "MANIFEST" &&
    value !== "STATISTICS" &&
    value !== "ENTRY" &&
    value !== "COLLECTION" &&
    value !== "RELEASE"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_NDJSON",
      `${field} contains an unsupported resource type.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }
}

function assertEntry(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryEntry {
  if (
    !isRecord(value) ||
    typeof value.entryId !== "string" ||
    typeof value.strategyId !== "string" ||
    typeof value.strategyVersion !==
      "string" ||
    !isRecord(value.manifest)
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field} is not a valid strategy-library entry shape.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }
}

function assertCollection(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryCollection {
  if (
    !isRecord(value) ||
    typeof value.collectionId !==
      "string" ||
    !Array.isArray(value.members)
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field} is not a valid strategy-library collection shape.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }
}

function assertRelease(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryRelease {
  if (
    !isRecord(value) ||
    typeof value.releaseId !== "string" ||
    !Array.isArray(value.entries)
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_EXPORT_PACKAGE",
      `${field} is not a valid strategy-library release shape.`,
      {
        stage: "PARSING",
        field,
      },
    );
  }
}

function assertImportMode(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryImportMode {
  if (
    value !== "APPLY" &&
    value !== "DRY_RUN"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_REQUEST",
      `${field} must be APPLY or DRY_RUN.`,
      {
        field,
      },
    );
  }
}

function assertConflictPolicy(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryImportConflictPolicy {
  if (
    value !== "REJECT" &&
    value !== "SKIP" &&
    value !== "REPLACE"
  ) {
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be REJECT, SKIP, or REPLACE.`,
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
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a boolean.`,
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
    throw new StrategyLibraryImportEngineError(
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
    throw new StrategyLibraryImportEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer timestamp.`,
      {
        field,
      },
    );
  }
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
  throw new StrategyLibraryImportEngineError(
    "INVALID_ARGUMENT",
    `Unsupported import value '${String(value)}'.`,
  );
}

/* ============================================================================
 * Resource mapping
 * ============================================================================
 */

function mapResourceType(
  value:
    StrategyLibraryExportResourceType,
): StrategyLibraryImportResourceType | undefined {
  switch (value) {
    case "ENTRY":
      return "ENTRY";

    case "COLLECTION":
      return "COLLECTION";

    case "RELEASE":
      return "RELEASE";

    case "MANIFEST":
    case "STATISTICS":
      return undefined;

    default:
      return assertNever(value);
  }
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

function freezeSortedStrings<
  TValue extends string,
>(
  values: readonly TValue[],
): readonly TValue[] {
  if (values.length === 0) {
    return EMPTY_STRINGS as readonly TValue[];
  }

  return Object.freeze(
    [...new Set(values)].sort(
      compareText,
    ),
  );
}

function compareText(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

/* ============================================================================
 * Serialization and checksums
 * ============================================================================
 */

function stableStringify(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeSerializableValue(value),
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
      clone[key] =
        cloneValue(value[key]);
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