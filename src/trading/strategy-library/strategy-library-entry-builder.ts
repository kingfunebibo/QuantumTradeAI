/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-entry-builder.ts
 *
 * Purpose:
 * Builds deeply immutable strategy-library entries from framework manifests and
 * explicit library classification profiles. The builder centralizes identity,
 * timestamp, normalization, duplicate-removal, and lifecycle invariants while
 * leaving semantic validation to StrategyLibraryValidatorPort.
 */

import {
  STRATEGY_LIBRARY_SCHEMA_VERSION,
  type StrategyLibraryAvailability,
  type StrategyLibraryCompatibilityProfile,
  type StrategyLibraryComplexity,
  type StrategyLibraryDataRequirement,
  type StrategyLibraryDocumentationReference,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryExplanationTemplate,
  type StrategyLibraryFamily,
  type StrategyLibraryIndicatorRequirement,
  type StrategyLibraryOperationalProfile,
  type StrategyLibraryOperationalStatus,
  type StrategyLibraryPerformanceExpectation,
  type StrategyLibraryRegimeProfile,
  type StrategyLibraryRiskProfile,
  type StrategyLibraryTag,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
  type StrategyLibraryVerificationStatus,
} from "./strategy-library-contracts";
import type {
  StrategyId,
  StrategyManifest,
  StrategyMetadata,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

/* ========================================================================== *
 * Errors and dependencies
 * ========================================================================== */

export type StrategyLibraryEntryBuilderErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_IDENTIFIER"
  | "INVALID_TIMESTAMP"
  | "INVALID_TIMESTAMP_ORDER"
  | "MANIFEST_IDENTITY_MISMATCH"
  | "INVALID_LIFECYCLE_STATE"
  | "VALIDATION_FAILED";

export class StrategyLibraryEntryBuilderError extends Error {
  public readonly code: StrategyLibraryEntryBuilderErrorCode;
  public readonly validationReport?: StrategyLibraryValidationReport;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryEntryBuilderErrorCode,
    message: string,
    details: {
      readonly validationReport?: StrategyLibraryValidationReport;
      readonly metadata?: StrategyMetadata;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "StrategyLibraryEntryBuilderError";
    this.code = code;
    this.validationReport = details.validationReport;
    this.metadata = details.metadata ?? EMPTY_METADATA;
    Object.setPrototypeOf(this, StrategyLibraryEntryBuilderError.prototype);
  }
}

export interface StrategyLibraryEntryBuilderClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryEntryIdGenerator {
  create(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): StrategyLibraryEntryId;
}

export interface StrategyLibraryEntryBuilderDependencies {
  readonly validator?: StrategyLibraryValidatorPort;
  readonly clock?: StrategyLibraryEntryBuilderClock;
  readonly idGenerator?: StrategyLibraryEntryIdGenerator;
}

/* ========================================================================== *
 * Input contracts
 * ========================================================================== */

export interface StrategyLibraryEntryBuildRequest {
  readonly manifest: StrategyManifest;
  readonly family: StrategyLibraryFamily;
  readonly complexity: StrategyLibraryComplexity;
  readonly operationalProfile: StrategyLibraryOperationalProfile;
  readonly riskProfile: StrategyLibraryRiskProfile;
  readonly compatibilityProfile: StrategyLibraryCompatibilityProfile;

  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly secondaryFamilies?: readonly StrategyLibraryFamily[];
  readonly status?: StrategyLibraryOperationalStatus;
  readonly verificationStatus?: StrategyLibraryVerificationStatus;
  readonly availability?: StrategyLibraryAvailability;
  readonly tags?: readonly StrategyLibraryTag[];
  readonly aliases?: readonly string[];
  readonly searchKeywords?: readonly string[];
  readonly regimeProfiles?: readonly StrategyLibraryRegimeProfile[];
  readonly dataRequirements?: readonly StrategyLibraryDataRequirement[];
  readonly indicatorRequirements?: readonly StrategyLibraryIndicatorRequirement[];
  readonly performanceExpectations?: readonly StrategyLibraryPerformanceExpectation[];
  readonly documentation?: readonly StrategyLibraryDocumentationReference[];
  readonly explanationTemplate?: StrategyLibraryExplanationTemplate;
  readonly introducedAt?: UnixTimestampMilliseconds;
  readonly updatedAt?: UnixTimestampMilliseconds;
  readonly deprecatedAt?: UnixTimestampMilliseconds;
  readonly retirementAt?: UnixTimestampMilliseconds;
  readonly replacementStrategyId?: StrategyId;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyLibraryEntryUpdateRequest {
  readonly current: StrategyLibraryEntry;
  readonly patch: Readonly<
    Partial<
      Omit<
        StrategyLibraryEntryBuildRequest,
        "manifest" | "entryId" | "strategyId" | "strategyVersion" | "introducedAt"
      >
    > & {
      readonly manifest?: StrategyManifest;
      readonly updatedAt?: UnixTimestampMilliseconds;
    }
  >;
}

export interface StrategyLibraryEntryBuilderPort {
  build(request: StrategyLibraryEntryBuildRequest): StrategyLibraryEntry;
  update(request: StrategyLibraryEntryUpdateRequest): StrategyLibraryEntry;
  clone(entry: StrategyLibraryEntry): StrategyLibraryEntry;
}

/* ========================================================================== *
 * Defaults
 * ========================================================================== */

const EMPTY_METADATA: StrategyMetadata = Object.freeze({});
const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

const SYSTEM_CLOCK: StrategyLibraryEntryBuilderClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

const DEFAULT_ID_GENERATOR: StrategyLibraryEntryIdGenerator = Object.freeze({
  create: (
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): StrategyLibraryEntryId =>
    `strategy-library:${normalizeIdentifierPart(strategyId)}:${normalizeIdentifierPart(
      strategyVersion,
    )}`,
});

/* ========================================================================== *
 * Immutable helpers
 * ========================================================================== */

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = deepClone(nested);
    }
    return result as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (isObject(value) && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(deepClone(value));
}

function normalizeRequiredString(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryEntryBuilderError(
      "INVALID_IDENTIFIER",
      `${field} must be a string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new StrategyLibraryEntryBuilderError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return normalized;
}

function normalizeOptionalString(
  value: string | undefined,
  field: string,
): string | undefined {
  return value === undefined ? undefined : normalizeRequiredString(value, field);
}

function normalizeIdentifierPart(value: string): string {
  return normalizeRequiredString(value, "identifier")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertTimestamp(
  value: UnixTimestampMilliseconds,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new StrategyLibraryEntryBuilderError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite, non-negative timestamp.`,
    );
  }
}

function normalizedUniqueStrings(
  values: readonly string[] | undefined,
  field: string,
): readonly string[] {
  if (values === undefined || values.length === 0) {
    return EMPTY_ARRAY;
  }

  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value, index) => {
    const normalized = normalizeRequiredString(value, `${field}[${index}]`);
    const key = normalized.toLocaleLowerCase("en-US");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });

  return Object.freeze(result);
}

function normalizedUniqueValues<T extends string>(
  values: readonly T[] | undefined,
): readonly T[] {
  if (values === undefined || values.length === 0) {
    return EMPTY_ARRAY;
  }
  return Object.freeze([...new Set(values)]);
}

function normalizedTags(
  values: readonly StrategyLibraryTag[] | undefined,
): readonly StrategyLibraryTag[] {
  return normalizedUniqueStrings(values, "tags").map((tag) =>
    tag.toLocaleLowerCase("en-US"),
  );
}

function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const output: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output as T;
}

/* ========================================================================== *
 * Builder implementation
 * ========================================================================== */

export class DefaultStrategyLibraryEntryBuilder
  implements StrategyLibraryEntryBuilderPort
{
  private readonly validator?: StrategyLibraryValidatorPort;
  private readonly clock: StrategyLibraryEntryBuilderClock;
  private readonly idGenerator: StrategyLibraryEntryIdGenerator;

  public constructor(
    dependencies: StrategyLibraryEntryBuilderDependencies = {},
  ) {
    this.validator = dependencies.validator;
    this.clock = dependencies.clock ?? SYSTEM_CLOCK;
    this.idGenerator = dependencies.idGenerator ?? DEFAULT_ID_GENERATOR;
  }

  public build(request: StrategyLibraryEntryBuildRequest): StrategyLibraryEntry {
    if (!isObject(request)) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_ARGUMENT",
        "request must be an object.",
      );
    }

    if (!isObject(request.manifest)) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_ARGUMENT",
        "request.manifest must be an object.",
      );
    }

    const now = this.clock.now();
    assertTimestamp(now, "clock.now()");

    const manifest = immutableClone(request.manifest);
    const strategyId = normalizeRequiredString(
      request.strategyId ?? manifest.strategyId,
      "strategyId",
    );
    const strategyVersion = normalizeRequiredString(
      request.strategyVersion ?? manifest.version,
      "strategyVersion",
    );

    this.assertManifestIdentity(manifest, strategyId, strategyVersion);

    const introducedAt = request.introducedAt ?? now;
    const updatedAt = request.updatedAt ?? introducedAt;
    this.assertLifecycleTimestamps(
      introducedAt,
      updatedAt,
      request.deprecatedAt,
      request.retirementAt,
    );

    const status = request.status ?? "DRAFT";
    this.assertStatusTimestamps(
      status,
      request.deprecatedAt,
      request.retirementAt,
    );

    const replacementStrategyId = normalizeOptionalString(
      request.replacementStrategyId,
      "replacementStrategyId",
    );
    if (replacementStrategyId === strategyId) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_LIFECYCLE_STATE",
        "replacementStrategyId cannot equal strategyId.",
      );
    }

    const entryId = normalizeRequiredString(
      request.entryId ?? this.idGenerator.create(strategyId, strategyVersion),
      "entryId",
    );

    const entry: StrategyLibraryEntry = {
      entryId,
      schemaVersion: STRATEGY_LIBRARY_SCHEMA_VERSION,
      strategyId,
      strategyVersion,
      manifest,
      family: request.family,
      secondaryFamilies: normalizedUniqueValues(request.secondaryFamilies).filter(
        (family) => family !== request.family,
      ),
      complexity: request.complexity,
      status,
      verificationStatus: request.verificationStatus ?? "UNVERIFIED",
      availability: request.availability ?? "INTERNAL",
      tags: normalizedTags(request.tags),
      aliases: normalizedUniqueStrings(request.aliases, "aliases"),
      searchKeywords: normalizedUniqueStrings(
        request.searchKeywords,
        "searchKeywords",
      ),
      operationalProfile: immutableClone(request.operationalProfile),
      riskProfile: immutableClone(request.riskProfile),
      compatibilityProfile: immutableClone(request.compatibilityProfile),
      regimeProfiles: immutableClone(request.regimeProfiles ?? EMPTY_ARRAY),
      dataRequirements: immutableClone(request.dataRequirements ?? EMPTY_ARRAY),
      indicatorRequirements: immutableClone(
        request.indicatorRequirements ?? EMPTY_ARRAY,
      ),
      performanceExpectations: immutableClone(
        request.performanceExpectations ?? EMPTY_ARRAY,
      ),
      documentation: immutableClone(request.documentation ?? EMPTY_ARRAY),
      explanationTemplate:
        request.explanationTemplate === undefined
          ? undefined
          : immutableClone(request.explanationTemplate),
      introducedAt,
      updatedAt,
      deprecatedAt: request.deprecatedAt,
      retirementAt: request.retirementAt,
      replacementStrategyId,
      metadata: immutableClone(request.metadata ?? EMPTY_METADATA),
    };

    const frozen = immutableClone(entry);
    this.validate(frozen);
    return frozen;
  }

  public update(request: StrategyLibraryEntryUpdateRequest): StrategyLibraryEntry {
    if (!isObject(request) || !isObject(request.current) || !isObject(request.patch)) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_ARGUMENT",
        "update request, current entry, and patch must be objects.",
      );
    }

    const current = request.current;
    const patch = request.patch;
    const manifest = patch.manifest ?? current.manifest;

    if (
      manifest.strategyId !== current.strategyId ||
      manifest.version !== current.strategyVersion
    ) {
      throw new StrategyLibraryEntryBuilderError(
        "MANIFEST_IDENTITY_MISMATCH",
        "An update cannot change strategyId or strategyVersion.",
      );
    }

    const merged = mergeDefined<StrategyLibraryEntryBuildRequest>(
      {
        manifest,
        entryId: current.entryId,
        strategyId: current.strategyId,
        strategyVersion: current.strategyVersion,
        family: current.family,
        secondaryFamilies: current.secondaryFamilies,
        complexity: current.complexity,
        status: current.status,
        verificationStatus: current.verificationStatus,
        availability: current.availability,
        tags: current.tags,
        aliases: current.aliases,
        searchKeywords: current.searchKeywords,
        operationalProfile: current.operationalProfile,
        riskProfile: current.riskProfile,
        compatibilityProfile: current.compatibilityProfile,
        regimeProfiles: current.regimeProfiles,
        dataRequirements: current.dataRequirements,
        indicatorRequirements: current.indicatorRequirements,
        performanceExpectations: current.performanceExpectations,
        documentation: current.documentation,
        explanationTemplate: current.explanationTemplate,
        introducedAt: current.introducedAt,
        updatedAt: current.updatedAt,
        deprecatedAt: current.deprecatedAt,
        retirementAt: current.retirementAt,
        replacementStrategyId: current.replacementStrategyId,
        metadata: current.metadata,
      },
      patch,
    );

    return this.build({
      ...merged,
      entryId: current.entryId,
      strategyId: current.strategyId,
      strategyVersion: current.strategyVersion,
      introducedAt: current.introducedAt,
      updatedAt: patch.updatedAt ?? this.clock.now(),
    });
  }

  public clone(entry: StrategyLibraryEntry): StrategyLibraryEntry {
    if (!isObject(entry)) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_ARGUMENT",
        "entry must be an object.",
      );
    }
    const cloned = immutableClone(entry);
    this.validate(cloned);
    return cloned;
  }

  private assertManifestIdentity(
    manifest: StrategyManifest,
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): void {
    if (manifest.strategyId !== strategyId || manifest.version !== strategyVersion) {
      throw new StrategyLibraryEntryBuilderError(
        "MANIFEST_IDENTITY_MISMATCH",
        "The entry identity must match manifest.strategyId and manifest.version.",
      );
    }
  }

  private assertLifecycleTimestamps(
    introducedAt: UnixTimestampMilliseconds,
    updatedAt: UnixTimestampMilliseconds,
    deprecatedAt?: UnixTimestampMilliseconds,
    retirementAt?: UnixTimestampMilliseconds,
  ): void {
    assertTimestamp(introducedAt, "introducedAt");
    assertTimestamp(updatedAt, "updatedAt");
    if (deprecatedAt !== undefined) assertTimestamp(deprecatedAt, "deprecatedAt");
    if (retirementAt !== undefined) assertTimestamp(retirementAt, "retirementAt");

    if (updatedAt < introducedAt) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_TIMESTAMP_ORDER",
        "updatedAt cannot precede introducedAt.",
      );
    }
    if (deprecatedAt !== undefined && deprecatedAt < introducedAt) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_TIMESTAMP_ORDER",
        "deprecatedAt cannot precede introducedAt.",
      );
    }
    if (retirementAt !== undefined && retirementAt < introducedAt) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_TIMESTAMP_ORDER",
        "retirementAt cannot precede introducedAt.",
      );
    }
    if (
      deprecatedAt !== undefined &&
      retirementAt !== undefined &&
      retirementAt < deprecatedAt
    ) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_TIMESTAMP_ORDER",
        "retirementAt cannot precede deprecatedAt.",
      );
    }
  }

  private assertStatusTimestamps(
    status: StrategyLibraryOperationalStatus,
    deprecatedAt?: UnixTimestampMilliseconds,
    retirementAt?: UnixTimestampMilliseconds,
  ): void {
    if (status === "DEPRECATED" && deprecatedAt === undefined) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_LIFECYCLE_STATE",
        "A deprecated entry requires deprecatedAt.",
      );
    }
    if (status === "RETIRED" && retirementAt === undefined) {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_LIFECYCLE_STATE",
        "A retired entry requires retirementAt.",
      );
    }
    if (retirementAt !== undefined && status !== "RETIRED") {
      throw new StrategyLibraryEntryBuilderError(
        "INVALID_LIFECYCLE_STATE",
        "retirementAt may only be set when status is RETIRED.",
      );
    }
  }

  private validate(entry: StrategyLibraryEntry): void {
    if (this.validator === undefined) return;
    const report = this.validator.validateEntry(entry);
    if (!report.valid) {
      throw new StrategyLibraryEntryBuilderError(
        "VALIDATION_FAILED",
        `Strategy library entry '${entry.entryId}' failed validation.`,
        { validationReport: immutableClone(report) },
      );
    }
  }
}

export function createStrategyLibraryEntryBuilder(
  dependencies: StrategyLibraryEntryBuilderDependencies = {},
): DefaultStrategyLibraryEntryBuilder {
  return new DefaultStrategyLibraryEntryBuilder(dependencies);
}

export function buildStrategyLibraryEntry(
  request: StrategyLibraryEntryBuildRequest,
  dependencies: StrategyLibraryEntryBuilderDependencies = {},
): StrategyLibraryEntry {
  return createStrategyLibraryEntryBuilder(dependencies).build(request);
}