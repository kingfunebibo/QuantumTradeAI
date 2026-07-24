/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-validator.ts
 *
 * Purpose:
 * Deterministic validation for strategy-library entries, collections,
 * and releases. Manifest validation is delegated to the existing
 * Professional Trading Strategy Framework.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyContractValidator,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  DefaultStrategyContractValidator,
} from "../strategy-framework/strategy-validator";

import {
  STRATEGY_LIBRARY_SCHEMA_VERSION,
  STRATEGY_LIBRARY_SCORE_MAXIMUM,
  STRATEGY_LIBRARY_SCORE_MINIMUM,
  type StrategyLibraryCollection,
  type StrategyLibraryCollectionMember,
  type StrategyLibraryCompatibilityProfile,
  type StrategyLibraryDataRequirement,
  type StrategyLibraryDocumentationReference,
  type StrategyLibraryEntry,
  type StrategyLibraryExplanationTemplate,
  type StrategyLibraryIndicatorRequirement,
  type StrategyLibraryOperationalProfile,
  type StrategyLibraryPerformanceExpectation,
  type StrategyLibraryRegimeProfile,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseEntry,
  type StrategyLibraryRiskDimensionAssessment,
  type StrategyLibraryRiskProfile,
  type StrategyLibraryTimeframeCompatibility,
  type StrategyLibraryValidationCode,
  type StrategyLibraryValidationIssue,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidationSeverity,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

export interface StrategyLibraryValidatorOptions {
  readonly maximumClockSkewMilliseconds?: number;
  readonly maximumStringLength?: number;
  readonly maximumMetadataDepth?: number;
  readonly maximumMetadataEntries?: number;
  readonly maximumCollectionMembers?: number;
  readonly maximumReleaseEntries?: number;
  readonly rejectDuplicateTags?: boolean;
  readonly rejectDuplicateAliases?: boolean;
  readonly rejectDuplicateSearchKeywords?: boolean;
  readonly rejectDuplicateSecondaryFamilies?: boolean;
  readonly rejectDuplicateRequirements?: boolean;
  readonly requireManifestValidation?: boolean;
  readonly clock?: () => UnixTimestampMilliseconds;
  readonly manifestValidator?: StrategyContractValidator;
  readonly metadata?: StrategyMetadata;
}

interface ResolvedOptions {
  readonly maximumClockSkewMilliseconds: number;
  readonly maximumStringLength: number;
  readonly maximumMetadataDepth: number;
  readonly maximumMetadataEntries: number;
  readonly maximumCollectionMembers: number;
  readonly maximumReleaseEntries: number;
  readonly rejectDuplicateTags: boolean;
  readonly rejectDuplicateAliases: boolean;
  readonly rejectDuplicateSearchKeywords: boolean;
  readonly rejectDuplicateSecondaryFamilies: boolean;
  readonly rejectDuplicateRequirements: boolean;
  readonly requireManifestValidation: boolean;
  readonly clock: () => UnixTimestampMilliseconds;
  readonly manifestValidator: StrategyContractValidator;
  readonly metadata: StrategyMetadata;
}

const DEFAULTS = Object.freeze({
  maximumClockSkewMilliseconds: 60_000,
  maximumStringLength: 16_384,
  maximumMetadataDepth: 12,
  maximumMetadataEntries: 2_000,
  maximumCollectionMembers: 10_000,
  maximumReleaseEntries: 10_000,
  rejectDuplicateTags: true,
  rejectDuplicateAliases: true,
  rejectDuplicateSearchKeywords: true,
  rejectDuplicateSecondaryFamilies: true,
  rejectDuplicateRequirements: true,
  requireManifestValidation: true,
});

export class StrategyLibraryValidationError extends Error {
  public constructor(
    message: string,
    public readonly report: StrategyLibraryValidationReport,
  ) {
    super(message);
    this.name = "StrategyLibraryValidationError";
    Object.setPrototypeOf(this, StrategyLibraryValidationError.prototype);
  }
}

class Collector {
  private readonly values: StrategyLibraryValidationIssue[] = [];

  public constructor(private readonly metadata: StrategyMetadata) {}

  public add(
    path: string,
    code: StrategyLibraryValidationCode,
    severity: StrategyLibraryValidationSeverity,
    message: string,
  ): void {
    this.values.push(Object.freeze({
      path,
      code,
      severity,
      message,
      metadata: this.metadata,
    }));
  }

  public error(
    path: string,
    code: StrategyLibraryValidationCode,
    message: string,
  ): void {
    this.add(path, code, "ERROR", message);
  }

  public warning(
    path: string,
    code: StrategyLibraryValidationCode,
    message: string,
  ): void {
    this.add(path, code, "WARNING", message);
  }

  public report(
    validatedAt: UnixTimestampMilliseconds,
  ): StrategyLibraryValidationReport {
    const issues = Object.freeze([...this.values]);
    const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
    const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
    const infoCount = issues.filter((issue) => issue.severity === "INFO").length;

    return Object.freeze({
      valid: errorCount === 0,
      issues,
      errorCount,
      warningCount,
      infoCount,
      validatedAt,
      metadata: this.metadata,
    });
  }
}

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  return Object.freeze({
    ...(metadata ?? EMPTY_STRATEGY_METADATA),
  });
}

function isObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function requiredString(
  value: unknown,
  path: string,
  collector: Collector,
  maximumLength: number,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    collector.error(path, "EMPTY_IDENTIFIER", `${path} must be a non-empty string.`);
    return false;
  }

  if (value.length > maximumLength) {
    collector.error(
      path,
      "INVALID_RANGE",
      `${path} cannot exceed ${maximumLength} characters.`,
    );
    return false;
  }

  return true;
}

function optionalString(
  value: unknown,
  path: string,
  collector: Collector,
  maximumLength: number,
): value is string | undefined {
  return value === undefined ||
    requiredString(value, path, collector, maximumLength);
}

function identifier(
  value: unknown,
  path: string,
  collector: Collector,
  maximumLength: number,
): value is string {
  if (!requiredString(value, path, collector, maximumLength)) {
    return false;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    collector.error(
      path,
      "INVALID_IDENTIFIER",
      `${path} contains unsupported identifier characters.`,
    );
    return false;
  }

  return true;
}

function timestamp(
  value: unknown,
  path: string,
  collector: Collector,
): value is number {
  if (!isNonNegativeInteger(value)) {
    collector.error(
      path,
      "INVALID_TIMESTAMP",
      `${path} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
    return false;
  }

  return true;
}

function futureSafeTimestamp(
  value: unknown,
  path: string,
  collector: Collector,
  now: number,
  skew: number,
): value is number {
  if (!timestamp(value, path, collector)) {
    return false;
  }

  if (value > now + skew) {
    collector.error(
      path,
      "INVALID_TIMESTAMP",
      `${path} exceeds the permitted future clock skew.`,
    );
    return false;
  }

  return true;
}

function unitInterval(
  value: unknown,
  path: string,
  collector: Collector,
): value is number {
  if (
    !isFiniteNumber(value) ||
    value < STRATEGY_LIBRARY_SCORE_MINIMUM ||
    value > STRATEGY_LIBRARY_SCORE_MAXIMUM
  ) {
    collector.error(
      path,
      "INVALID_SCORE",
      `${path} must be between ${STRATEGY_LIBRARY_SCORE_MINIMUM} and ${STRATEGY_LIBRARY_SCORE_MAXIMUM}.`,
    );
    return false;
  }

  return true;
}

function uniqueStrings(
  values: unknown,
  path: string,
  collector: Collector,
  rejectDuplicates: boolean,
  maximumLength: number,
): void {
  if (!Array.isArray(values)) {
    collector.error(path, "INVALID_RANGE", `${path} must be an array.`);
    return;
  }

  const seen = new Set<string>();

  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;

    if (!requiredString(value, itemPath, collector, maximumLength)) {
      return;
    }

    const key = value.trim().toLowerCase();

    if (rejectDuplicates && seen.has(key)) {
      collector.error(itemPath, "DUPLICATE_VALUE", `${path} contains a duplicate value.`);
    }

    seen.add(key);
  });
}

function metadata(
  value: unknown,
  path: string,
  collector: Collector,
  options: ResolvedOptions,
): void {
  if (!isObject(value)) {
    collector.error(path, "INVALID_RANGE", `${path} must be a metadata object.`);
    return;
  }

  let entries = 0;

  const visit = (
    current: unknown,
    currentPath: string,
    depth: number,
  ): void => {
    if (depth > options.maximumMetadataDepth) {
      collector.error(
        currentPath,
        "INVALID_RANGE",
        `${path} exceeds the maximum metadata depth.`,
      );
      return;
    }

    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      return;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        collector.error(currentPath, "INVALID_RANGE", `${currentPath} must be finite.`);
      }
      return;
    }

    if (Array.isArray(current)) {
      entries += current.length;
      current.forEach((child, index) => {
        visit(child, `${currentPath}[${index}]`, depth + 1);
      });
      return;
    }

    if (isObject(current)) {
      const pairs = Object.entries(current);
      entries += pairs.length;
      pairs.forEach(([key, child]) => {
        if (key.trim().length === 0) {
          collector.error(currentPath, "EMPTY_IDENTIFIER", "Metadata keys cannot be empty.");
        }
        visit(child, `${currentPath}.${key}`, depth + 1);
      });
      return;
    }

    collector.error(
      currentPath,
      "INVALID_RANGE",
      `${currentPath} contains a non-serializable value.`,
    );
  };

  visit(value, path, 0);

  if (entries > options.maximumMetadataEntries) {
    collector.error(
      path,
      "INVALID_RANGE",
      `${path} exceeds the maximum metadata entry count.`,
    );
  }
}

export class StrategyLibraryValidator implements StrategyLibraryValidatorPort {
  private readonly options: ResolvedOptions;

  public constructor(options: StrategyLibraryValidatorOptions = {}) {
    const resolved: ResolvedOptions = Object.freeze({
      maximumClockSkewMilliseconds:
        options.maximumClockSkewMilliseconds ??
        DEFAULTS.maximumClockSkewMilliseconds,
      maximumStringLength:
        options.maximumStringLength ??
        DEFAULTS.maximumStringLength,
      maximumMetadataDepth:
        options.maximumMetadataDepth ??
        DEFAULTS.maximumMetadataDepth,
      maximumMetadataEntries:
        options.maximumMetadataEntries ??
        DEFAULTS.maximumMetadataEntries,
      maximumCollectionMembers:
        options.maximumCollectionMembers ??
        DEFAULTS.maximumCollectionMembers,
      maximumReleaseEntries:
        options.maximumReleaseEntries ??
        DEFAULTS.maximumReleaseEntries,
      rejectDuplicateTags:
        options.rejectDuplicateTags ??
        DEFAULTS.rejectDuplicateTags,
      rejectDuplicateAliases:
        options.rejectDuplicateAliases ??
        DEFAULTS.rejectDuplicateAliases,
      rejectDuplicateSearchKeywords:
        options.rejectDuplicateSearchKeywords ??
        DEFAULTS.rejectDuplicateSearchKeywords,
      rejectDuplicateSecondaryFamilies:
        options.rejectDuplicateSecondaryFamilies ??
        DEFAULTS.rejectDuplicateSecondaryFamilies,
      rejectDuplicateRequirements:
        options.rejectDuplicateRequirements ??
        DEFAULTS.rejectDuplicateRequirements,
      requireManifestValidation:
        options.requireManifestValidation ??
        DEFAULTS.requireManifestValidation,
      clock: options.clock ?? (() => Date.now()),
      manifestValidator:
        options.manifestValidator ??
        new DefaultStrategyContractValidator(),
      metadata: freezeMetadata(options.metadata),
    });

    this.assertOptions(resolved);
    this.options = resolved;
  }

  public validateEntry(
    entry: StrategyLibraryEntry,
  ): StrategyLibraryValidationReport {
    const validatedAt = this.now();
    const collector = this.collector();

    if (!isObject(entry)) {
      collector.error("entry", "INVALID_RANGE", "Strategy library entry must be an object.");
      return collector.report(validatedAt);
    }

    if (entry.schemaVersion !== STRATEGY_LIBRARY_SCHEMA_VERSION) {
      collector.error(
        "entry.schemaVersion",
        "INVALID_SCHEMA_VERSION",
        `Strategy library schema version must be '${STRATEGY_LIBRARY_SCHEMA_VERSION}'.`,
      );
    }

    identifier(entry.entryId, "entry.entryId", collector, 256);
    identifier(entry.strategyId, "entry.strategyId", collector, 256);
    requiredString(entry.strategyVersion, "entry.strategyVersion", collector, 128);

    this.validateManifest(entry, validatedAt, collector);

    if (entry.manifest.strategyId !== entry.strategyId) {
      collector.error(
        "entry.strategyId",
        "MANIFEST_ID_MISMATCH",
        "entry.strategyId must match manifest.strategyId.",
      );
    }

    if (entry.manifest.version !== entry.strategyVersion) {
      collector.error(
        "entry.strategyVersion",
        "MANIFEST_VERSION_MISMATCH",
        "entry.strategyVersion must match manifest.version.",
      );
    }

    requiredString(entry.family, "entry.family", collector, 128);
    uniqueStrings(
      entry.secondaryFamilies,
      "entry.secondaryFamilies",
      collector,
      this.options.rejectDuplicateSecondaryFamilies,
      128,
    );

    if (
      this.options.rejectDuplicateSecondaryFamilies &&
      entry.secondaryFamilies.includes(entry.family)
    ) {
      collector.error(
        "entry.secondaryFamilies",
        "DUPLICATE_VALUE",
        "The primary family cannot also appear as a secondary family.",
      );
    }

    requiredString(entry.complexity, "entry.complexity", collector, 128);
    requiredString(entry.status, "entry.status", collector, 128);
    requiredString(entry.verificationStatus, "entry.verificationStatus", collector, 128);
    requiredString(entry.availability, "entry.availability", collector, 128);

    uniqueStrings(
      entry.tags,
      "entry.tags",
      collector,
      this.options.rejectDuplicateTags,
      256,
    );
    uniqueStrings(
      entry.aliases,
      "entry.aliases",
      collector,
      this.options.rejectDuplicateAliases,
      512,
    );
    uniqueStrings(
      entry.searchKeywords,
      "entry.searchKeywords",
      collector,
      this.options.rejectDuplicateSearchKeywords,
      512,
    );

    this.validateOperationalProfile(entry.operationalProfile, "entry.operationalProfile", collector);
    this.validateRiskProfile(entry.riskProfile, "entry.riskProfile", collector);
    this.validateCompatibilityProfile(entry.compatibilityProfile, "entry.compatibilityProfile", collector);
    this.validateRegimeProfiles(entry.regimeProfiles, collector);
    this.validateDataRequirements(entry.dataRequirements, collector);
    this.validateIndicatorRequirements(entry.indicatorRequirements, collector);
    this.validatePerformanceExpectations(entry.performanceExpectations, collector);
    this.validateDocumentation(entry.documentation, collector);

    if (entry.explanationTemplate !== undefined) {
      this.validateExplanationTemplate(
        entry.explanationTemplate,
        "entry.explanationTemplate",
        collector,
      );
    }

    this.validateEntryTimestamps(entry, validatedAt, collector);

    if (entry.replacementStrategyId !== undefined) {
      identifier(
        entry.replacementStrategyId,
        "entry.replacementStrategyId",
        collector,
        256,
      );

      if (entry.replacementStrategyId === entry.strategyId) {
        collector.error(
          "entry.replacementStrategyId",
          "REPLACEMENT_EQUALS_STRATEGY",
          "A replacement strategy cannot reference itself.",
        );
      }
    }

    metadata(entry.metadata, "entry.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateCollection(
    collection: StrategyLibraryCollection,
  ): StrategyLibraryValidationReport {
    const validatedAt = this.now();
    const collector = this.collector();

    if (!isObject(collection)) {
      collector.error(
        "collection",
        "INVALID_COLLECTION",
        "Strategy library collection must be an object.",
      );
      return collector.report(validatedAt);
    }

    identifier(collection.collectionId, "collection.collectionId", collector, 256);
    requiredString(collection.name, "collection.name", collector, 512);
    requiredString(
      collection.description,
      "collection.description",
      collector,
      this.options.maximumStringLength,
    );

    if (!Array.isArray(collection.members)) {
      collector.error(
        "collection.members",
        "INVALID_COLLECTION",
        "collection.members must be an array.",
      );
    } else {
      if (collection.members.length > this.options.maximumCollectionMembers) {
        collector.error(
          "collection.members",
          "INVALID_RANGE",
          "Collection member count exceeds the configured maximum.",
        );
      }
      this.validateCollectionMembers(collection.members, collector);
    }

    uniqueStrings(
      collection.tags,
      "collection.tags",
      collector,
      this.options.rejectDuplicateTags,
      256,
    );

    futureSafeTimestamp(
      collection.createdAt,
      "collection.createdAt",
      collector,
      validatedAt,
      this.options.maximumClockSkewMilliseconds,
    );
    futureSafeTimestamp(
      collection.updatedAt,
      "collection.updatedAt",
      collector,
      validatedAt,
      this.options.maximumClockSkewMilliseconds,
    );

    if (collection.updatedAt < collection.createdAt) {
      collector.error(
        "collection.updatedAt",
        "INVALID_TIMESTAMP_ORDER",
        "collection.updatedAt cannot precede collection.createdAt.",
      );
    }

    metadata(collection.metadata, "collection.metadata", collector, this.options);
    return collector.report(validatedAt);
  }

  public validateRelease(
    release: StrategyLibraryRelease,
  ): StrategyLibraryValidationReport {
    const validatedAt = this.now();
    const collector = this.collector();

    if (!isObject(release)) {
      collector.error(
        "release",
        "INVALID_RELEASE",
        "Strategy library release must be an object.",
      );
      return collector.report(validatedAt);
    }

    identifier(release.releaseId, "release.releaseId", collector, 256);
    requiredString(release.version, "release.version", collector, 128);

    if (!Array.isArray(release.entries)) {
      collector.error(
        "release.entries",
        "INVALID_RELEASE",
        "release.entries must be an array.",
      );
    } else {
      if (release.entries.length > this.options.maximumReleaseEntries) {
        collector.error(
          "release.entries",
          "INVALID_RANGE",
          "Release entry count exceeds the configured maximum.",
        );
      }
      this.validateReleaseEntries(release.entries, collector);
    }

    futureSafeTimestamp(
      release.createdAt,
      "release.createdAt",
      collector,
      validatedAt,
      this.options.maximumClockSkewMilliseconds,
    );

    if (release.publishedAt !== undefined) {
      futureSafeTimestamp(
        release.publishedAt,
        "release.publishedAt",
        collector,
        validatedAt,
        this.options.maximumClockSkewMilliseconds,
      );
    }

    if (release.supersededAt !== undefined) {
      futureSafeTimestamp(
        release.supersededAt,
        "release.supersededAt",
        collector,
        validatedAt,
        this.options.maximumClockSkewMilliseconds,
      );
    }

    if (release.status === "PUBLISHED" && release.publishedAt === undefined) {
      collector.error(
        "release.publishedAt",
        "INVALID_RELEASE",
        "Published releases must define publishedAt.",
      );
    }

    if (release.status === "SUPERSEDED" && release.supersededAt === undefined) {
      collector.error(
        "release.supersededAt",
        "INVALID_RELEASE",
        "Superseded releases must define supersededAt.",
      );
    }

    if (
      release.publishedAt !== undefined &&
      release.publishedAt < release.createdAt
    ) {
      collector.error(
        "release.publishedAt",
        "INVALID_TIMESTAMP_ORDER",
        "release.publishedAt cannot precede release.createdAt.",
      );
    }

    if (
      release.supersededAt !== undefined &&
      release.supersededAt < release.createdAt
    ) {
      collector.error(
        "release.supersededAt",
        "INVALID_TIMESTAMP_ORDER",
        "release.supersededAt cannot precede release.createdAt.",
      );
    }

    if (
      release.publishedAt !== undefined &&
      release.supersededAt !== undefined &&
      release.supersededAt < release.publishedAt
    ) {
      collector.error(
        "release.supersededAt",
        "INVALID_TIMESTAMP_ORDER",
        "release.supersededAt cannot precede release.publishedAt.",
      );
    }

    metadata(release.metadata, "release.metadata", collector, this.options);
    return collector.report(validatedAt);
  }

  public assertValid(
    report: StrategyLibraryValidationReport,
    message = "Strategy library validation failed.",
  ): void {
    if (!report.valid) {
      throw new StrategyLibraryValidationError(message, report);
    }
  }

  private validateManifest(
    entry: StrategyLibraryEntry,
    validatedAt: UnixTimestampMilliseconds,
    collector: Collector,
  ): void {
    if (!this.options.requireManifestValidation) {
      return;
    }

    try {
      const report = this.options.manifestValidator.validateManifest(
        entry.manifest,
        validatedAt,
      );

      report.issues.forEach((issue) => {
        collector.add(
          `entry.manifest.${issue.field}`,
          "INVALID_MANIFEST",
          issue.severity,
          `[${issue.code}] ${issue.message}`,
        );
      });
    } catch (error) {
      collector.error(
        "entry.manifest",
        "INVALID_MANIFEST",
        error instanceof Error
          ? `Manifest validation failed: ${error.message}`
          : "Manifest validation failed with an unknown error.",
      );
    }
  }

  private validateOperationalProfile(
    profile: StrategyLibraryOperationalProfile,
    path: string,
    collector: Collector,
  ): void {
    if (!isObject(profile)) {
      collector.error(path, "INVALID_OPERATIONAL_PROFILE", `${path} must be an object.`);
      return;
    }

    requiredString(profile.holdingPeriod, `${path}.holdingPeriod`, collector, 128);
    requiredString(profile.frequency, `${path}.frequency`, collector, 128);
    requiredString(profile.directionality, `${path}.directionality`, collector, 128);
    requiredString(profile.capitalStyle, `${path}.capitalStyle`, collector, 128);
    requiredString(profile.intelligenceType, `${path}.intelligenceType`, collector, 128);
    requiredString(profile.determinismMode, `${path}.determinismMode`, collector, 128);

    if (
      profile.expectedMinimumSignalsPerDay !== undefined &&
      !isNonNegativeNumber(profile.expectedMinimumSignalsPerDay)
    ) {
      collector.error(
        `${path}.expectedMinimumSignalsPerDay`,
        "INVALID_OPERATIONAL_PROFILE",
        "Expected minimum signals per day must be non-negative.",
      );
    }

    if (
      profile.expectedMaximumSignalsPerDay !== undefined &&
      !isNonNegativeNumber(profile.expectedMaximumSignalsPerDay)
    ) {
      collector.error(
        `${path}.expectedMaximumSignalsPerDay`,
        "INVALID_OPERATIONAL_PROFILE",
        "Expected maximum signals per day must be non-negative.",
      );
    }

    if (
      profile.expectedMinimumSignalsPerDay !== undefined &&
      profile.expectedMaximumSignalsPerDay !== undefined &&
      profile.expectedMinimumSignalsPerDay > profile.expectedMaximumSignalsPerDay
    ) {
      collector.error(
        `${path}.expectedMinimumSignalsPerDay`,
        "INVALID_RANGE",
        "Expected minimum signals cannot exceed the maximum.",
      );
    }

    this.boolean(profile.requiresContinuousOperation, `${path}.requiresContinuousOperation`, collector, "INVALID_OPERATIONAL_PROFILE");
    this.boolean(profile.requiresPersistentState, `${path}.requiresPersistentState`, collector, "INVALID_OPERATIONAL_PROFILE");
    this.boolean(profile.supportsWarmStart, `${path}.supportsWarmStart`, collector, "INVALID_OPERATIONAL_PROFILE");
    this.boolean(profile.supportsDeterministicReplay, `${path}.supportsDeterministicReplay`, collector, "INVALID_OPERATIONAL_PROFILE");
    metadata(profile.metadata, `${path}.metadata`, collector, this.options);
  }

  private validateRiskProfile(
    profile: StrategyLibraryRiskProfile,
    path: string,
    collector: Collector,
  ): void {
    if (!isObject(profile)) {
      collector.error(path, "INVALID_RISK_PROFILE", `${path} must be an object.`);
      return;
    }

    identifier(profile.riskProfileId, `${path}.riskProfileId`, collector, 256);
    requiredString(profile.overallRiskLevel, `${path}.overallRiskLevel`, collector, 128);
    unitInterval(profile.overallRiskScore, `${path}.overallRiskScore`, collector);

    if (!isPositiveNumber(profile.maximumRecommendedLeverage)) {
      collector.error(
        `${path}.maximumRecommendedLeverage`,
        "INVALID_RISK_PROFILE",
        "Maximum recommended leverage must be positive.",
      );
    }

    unitInterval(
      profile.maximumRecommendedCapitalFraction,
      `${path}.maximumRecommendedCapitalFraction`,
      collector,
    );

    this.boolean(profile.requiresStopLoss, `${path}.requiresStopLoss`, collector, "INVALID_RISK_PROFILE");
    this.boolean(profile.supportsTrailingStop, `${path}.supportsTrailingStop`, collector, "INVALID_RISK_PROFILE");
    this.boolean(profile.supportsPositionScaling, `${path}.supportsPositionScaling`, collector, "INVALID_RISK_PROFILE");
    this.boolean(profile.supportsPartialExit, `${path}.supportsPartialExit`, collector, "INVALID_RISK_PROFILE");

    if (!Array.isArray(profile.dimensions)) {
      collector.error(
        `${path}.dimensions`,
        "INVALID_RISK_PROFILE",
        "Risk dimensions must be an array.",
      );
    } else {
      const dimensions = new Set<string>();

      profile.dimensions.forEach((value, index) => {
        const assessment = value as StrategyLibraryRiskDimensionAssessment;
        const assessmentPath = `${path}.dimensions[${index}]`;

        if (!isObject(assessment)) {
          collector.error(
            assessmentPath,
            "INVALID_RISK_PROFILE",
            `${assessmentPath} must be an object.`,
          );
          return;
        }

        requiredString(assessment.dimension, `${assessmentPath}.dimension`, collector, 128);
        requiredString(assessment.level, `${assessmentPath}.level`, collector, 128);
        unitInterval(assessment.score, `${assessmentPath}.score`, collector);
        requiredString(
          assessment.explanation,
          `${assessmentPath}.explanation`,
          collector,
          this.options.maximumStringLength,
        );
        uniqueStrings(
          assessment.mitigations,
          `${assessmentPath}.mitigations`,
          collector,
          true,
          this.options.maximumStringLength,
        );

        if (dimensions.has(assessment.dimension)) {
          collector.error(
            `${assessmentPath}.dimension`,
            "DUPLICATE_VALUE",
            "Risk dimensions must be unique.",
          );
        }

        dimensions.add(assessment.dimension);
        metadata(assessment.metadata, `${assessmentPath}.metadata`, collector, this.options);
      });
    }

    uniqueStrings(
      profile.warnings,
      `${path}.warnings`,
      collector,
      true,
      this.options.maximumStringLength,
    );
    metadata(profile.metadata, `${path}.metadata`, collector, this.options);
  }

  private validateCompatibilityProfile(
    profile: StrategyLibraryCompatibilityProfile,
    path: string,
    collector: Collector,
  ): void {
    if (!isObject(profile)) {
      collector.error(
        path,
        "INVALID_COMPATIBILITY_PROFILE",
        `${path} must be an object.`,
      );
      return;
    }

    identifier(
      profile.compatibilityProfileId,
      `${path}.compatibilityProfileId`,
      collector,
      256,
    );
    uniqueStrings(profile.marketTypes, `${path}.marketTypes`, collector, true, 128);
    uniqueStrings(profile.tradingModes, `${path}.tradingModes`, collector, true, 128);
    uniqueStrings(profile.environments, `${path}.environments`, collector, true, 128);

    if (!Array.isArray(profile.timeframes)) {
      collector.error(
        `${path}.timeframes`,
        "INVALID_COMPATIBILITY_PROFILE",
        "Compatibility timeframes must be an array.",
      );
    } else {
      const seen = new Set<string>();

      profile.timeframes.forEach((value, index) => {
        const timeframe = value as StrategyLibraryTimeframeCompatibility;
        const itemPath = `${path}.timeframes[${index}]`;

        if (!isObject(timeframe)) {
          collector.error(
            itemPath,
            "INVALID_COMPATIBILITY_PROFILE",
            `${itemPath} must be an object.`,
          );
          return;
        }

        if (requiredString(timeframe.timeframe, `${itemPath}.timeframe`, collector, 64)) {
          const key = timeframe.timeframe.trim().toLowerCase();
          if (seen.has(key)) {
            collector.error(
              `${itemPath}.timeframe`,
              "DUPLICATE_VALUE",
              "Timeframe compatibility entries must be unique.",
            );
          }
          seen.add(key);
        }

        this.boolean(timeframe.supported, `${itemPath}.supported`, collector, "INVALID_COMPATIBILITY_PROFILE");
        this.boolean(timeframe.preferred, `${itemPath}.preferred`, collector, "INVALID_COMPATIBILITY_PROFILE");

        if (!isNonNegativeInteger(timeframe.minimumHistory)) {
          collector.error(
            `${itemPath}.minimumHistory`,
            "INVALID_COMPATIBILITY_PROFILE",
            "Minimum timeframe history must be a non-negative integer.",
          );
        }

        optionalString(
          timeframe.explanation,
          `${itemPath}.explanation`,
          collector,
          this.options.maximumStringLength,
        );

        if (timeframe.preferred && !timeframe.supported) {
          collector.error(
            `${itemPath}.preferred`,
            "INVALID_COMPATIBILITY_PROFILE",
            "A preferred timeframe must also be supported.",
          );
        }
      });
    }

    if (
      profile.minimumCapital !== undefined &&
      !isNonNegativeNumber(profile.minimumCapital)
    ) {
      collector.error(
        `${path}.minimumCapital`,
        "INVALID_COMPATIBILITY_PROFILE",
        "Minimum capital must be non-negative.",
      );
    }

    if (
      profile.maximumCapital !== undefined &&
      !isPositiveNumber(profile.maximumCapital)
    ) {
      collector.error(
        `${path}.maximumCapital`,
        "INVALID_COMPATIBILITY_PROFILE",
        "Maximum capital must be positive.",
      );
    }

    if (
      profile.minimumCapital !== undefined &&
      profile.maximumCapital !== undefined &&
      profile.minimumCapital > profile.maximumCapital
    ) {
      collector.error(
        `${path}.minimumCapital`,
        "INVALID_RANGE",
        "Minimum capital cannot exceed maximum capital.",
      );
    }

    this.boolean(profile.supportsFractionalQuantity, `${path}.supportsFractionalQuantity`, collector, "INVALID_COMPATIBILITY_PROFILE");
    this.boolean(profile.supportsLeverage, `${path}.supportsLeverage`, collector, "INVALID_COMPATIBILITY_PROFILE");
    this.boolean(profile.supportsHedgeMode, `${path}.supportsHedgeMode`, collector, "INVALID_COMPATIBILITY_PROFILE");
    this.boolean(profile.supportsOneWayMode, `${path}.supportsOneWayMode`, collector, "INVALID_COMPATIBILITY_PROFILE");
    this.boolean(profile.requiresShortSelling, `${path}.requiresShortSelling`, collector, "INVALID_COMPATIBILITY_PROFILE");
    uniqueStrings(profile.requiredCapabilities, `${path}.requiredCapabilities`, collector, true, 128);
    metadata(profile.metadata, `${path}.metadata`, collector, this.options);
  }

  private validateRegimeProfiles(
    profiles: readonly StrategyLibraryRegimeProfile[],
    collector: Collector,
  ): void {
    if (!Array.isArray(profiles)) {
      collector.error(
        "entry.regimeProfiles",
        "INVALID_REGIME_PROFILE",
        "entry.regimeProfiles must be an array.",
      );
      return;
    }

    const regimes = new Set<string>();

    profiles.forEach((value, index) => {
      const profile = value as StrategyLibraryRegimeProfile;
      const path = `entry.regimeProfiles[${index}]`;

      if (!isObject(profile)) {
        collector.error(path, "INVALID_REGIME_PROFILE", `${path} must be an object.`);
        return;
      }

      requiredString(profile.regime, `${path}.regime`, collector, 128);
      requiredString(profile.compatibility, `${path}.compatibility`, collector, 128);
      unitInterval(profile.score, `${path}.score`, collector);
      requiredString(
        profile.rationale,
        `${path}.rationale`,
        collector,
        this.options.maximumStringLength,
      );

      if (regimes.has(profile.regime)) {
        collector.error(
          `${path}.regime`,
          "DUPLICATE_VALUE",
          "Regime profiles must be unique by regime.",
        );
      }

      regimes.add(profile.regime);
      metadata(profile.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validateDataRequirements(
    requirements: readonly StrategyLibraryDataRequirement[],
    collector: Collector,
  ): void {
    if (!Array.isArray(requirements)) {
      collector.error(
        "entry.dataRequirements",
        "INVALID_DATA_REQUIREMENT",
        "entry.dataRequirements must be an array.",
      );
      return;
    }

    const types = new Set<string>();

    requirements.forEach((value, index) => {
      const requirement = value as StrategyLibraryDataRequirement;
      const path = `entry.dataRequirements[${index}]`;

      if (!isObject(requirement)) {
        collector.error(path, "INVALID_DATA_REQUIREMENT", `${path} must be an object.`);
        return;
      }

      requiredString(requirement.type, `${path}.type`, collector, 128);
      this.boolean(requirement.required, `${path}.required`, collector, "INVALID_DATA_REQUIREMENT");

      if (!isNonNegativeInteger(requirement.minimumHistory)) {
        collector.error(
          `${path}.minimumHistory`,
          "INVALID_DATA_REQUIREMENT",
          "Minimum history must be a non-negative integer.",
        );
      }

      if (
        requirement.maximumAgeMilliseconds !== undefined &&
        !isNonNegativeInteger(requirement.maximumAgeMilliseconds)
      ) {
        collector.error(
          `${path}.maximumAgeMilliseconds`,
          "INVALID_DATA_REQUIREMENT",
          "Maximum age must be a non-negative integer.",
        );
      }

      if (
        requirement.minimumUpdateFrequencyMilliseconds !== undefined &&
        !isPositiveInteger(requirement.minimumUpdateFrequencyMilliseconds)
      ) {
        collector.error(
          `${path}.minimumUpdateFrequencyMilliseconds`,
          "INVALID_DATA_REQUIREMENT",
          "Minimum update frequency must be a positive integer.",
        );
      }

      requiredString(
        requirement.description,
        `${path}.description`,
        collector,
        this.options.maximumStringLength,
      );

      if (
        this.options.rejectDuplicateRequirements &&
        types.has(requirement.type)
      ) {
        collector.error(
          `${path}.type`,
          "DUPLICATE_VALUE",
          "Data requirement types must be unique.",
        );
      }

      types.add(requirement.type);
      metadata(requirement.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validateIndicatorRequirements(
    requirements: readonly StrategyLibraryIndicatorRequirement[],
    collector: Collector,
  ): void {
    if (!Array.isArray(requirements)) {
      collector.error(
        "entry.indicatorRequirements",
        "INVALID_INDICATOR_REQUIREMENT",
        "entry.indicatorRequirements must be an array.",
      );
      return;
    }

    const indicators = new Set<string>();

    requirements.forEach((value, index) => {
      const requirement = value as StrategyLibraryIndicatorRequirement;
      const path = `entry.indicatorRequirements[${index}]`;

      if (!isObject(requirement)) {
        collector.error(
          path,
          "INVALID_INDICATOR_REQUIREMENT",
          `${path} must be an object.`,
        );
        return;
      }

      identifier(requirement.indicatorId, `${path}.indicatorId`, collector, 256);
      requiredString(requirement.displayName, `${path}.displayName`, collector, 512);
      this.boolean(requirement.required, `${path}.required`, collector, "INVALID_INDICATOR_REQUIREMENT");

      if (!isNonNegativeInteger(requirement.minimumHistory)) {
        collector.error(
          `${path}.minimumHistory`,
          "INVALID_INDICATOR_REQUIREMENT",
          "Minimum indicator history must be a non-negative integer.",
        );
      }

      uniqueStrings(
        requirement.parameterNames,
        `${path}.parameterNames`,
        collector,
        true,
        256,
      );

      const normalized = requirement.indicatorId.trim().toLowerCase();

      if (
        this.options.rejectDuplicateRequirements &&
        indicators.has(normalized)
      ) {
        collector.error(
          `${path}.indicatorId`,
          "DUPLICATE_VALUE",
          "Indicator requirements must be unique.",
        );
      }

      indicators.add(normalized);
      metadata(requirement.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validatePerformanceExpectations(
    expectations: readonly StrategyLibraryPerformanceExpectation[],
    collector: Collector,
  ): void {
    if (!Array.isArray(expectations)) {
      collector.error(
        "entry.performanceExpectations",
        "INVALID_PERFORMANCE_EXPECTATION",
        "entry.performanceExpectations must be an array.",
      );
      return;
    }

    const metrics = new Set<string>();

    expectations.forEach((value, index) => {
      const expectation = value as StrategyLibraryPerformanceExpectation;
      const path = `entry.performanceExpectations[${index}]`;

      if (!isObject(expectation)) {
        collector.error(
          path,
          "INVALID_PERFORMANCE_EXPECTATION",
          `${path} must be an object.`,
        );
        return;
      }

      requiredString(expectation.metric, `${path}.metric`, collector, 128);

      const minimum =
        isFiniteNumber(expectation.minimum)
          ? expectation.minimum
          : undefined;
      const maximum =
        isFiniteNumber(expectation.maximum)
          ? expectation.maximum
          : undefined;
      const target =
        isFiniteNumber(expectation.target)
          ? expectation.target
          : undefined;

      if (
        expectation.minimum !== undefined &&
        expectation.minimum !== null &&
        minimum === undefined
      ) {
        collector.error(
          `${path}.minimum`,
          "INVALID_PERFORMANCE_EXPECTATION",
          "Performance minimum must be finite.",
        );
      }

      if (
        expectation.maximum !== undefined &&
        expectation.maximum !== null &&
        maximum === undefined
      ) {
        collector.error(
          `${path}.maximum`,
          "INVALID_PERFORMANCE_EXPECTATION",
          "Performance maximum must be finite.",
        );
      }

      if (
        expectation.target !== undefined &&
        expectation.target !== null &&
        target === undefined
      ) {
        collector.error(
          `${path}.target`,
          "INVALID_PERFORMANCE_EXPECTATION",
          "Performance target must be finite.",
        );
      }

      if (
        minimum !== undefined &&
        maximum !== undefined &&
        minimum > maximum
      ) {
        collector.error(
          `${path}.minimum`,
          "INVALID_RANGE",
          "Performance minimum cannot exceed maximum.",
        );
      }

      if (
        target !== undefined &&
        minimum !== undefined &&
        target < minimum
      ) {
        collector.warning(
          `${path}.target`,
          "INVALID_RANGE",
          "Performance target is below the stated minimum.",
        );
      }

      if (
        target !== undefined &&
        maximum !== undefined &&
        target > maximum
      ) {
        collector.warning(
          `${path}.target`,
          "INVALID_RANGE",
          "Performance target exceeds the stated maximum.",
        );
      }

      requiredString(expectation.unit, `${path}.unit`, collector, 128);
      this.boolean(
        expectation.informationalOnly,
        `${path}.informationalOnly`,
        collector,
        "INVALID_PERFORMANCE_EXPECTATION",
      );
      requiredString(
        expectation.explanation,
        `${path}.explanation`,
        collector,
        this.options.maximumStringLength,
      );

      if (metrics.has(expectation.metric)) {
        collector.error(
          `${path}.metric`,
          "DUPLICATE_VALUE",
          "Performance expectation metrics must be unique.",
        );
      }

      metrics.add(expectation.metric);
      metadata(expectation.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validateDocumentation(
    documentation: readonly StrategyLibraryDocumentationReference[],
    collector: Collector,
  ): void {
    if (!Array.isArray(documentation)) {
      collector.error(
        "entry.documentation",
        "INVALID_DOCUMENTATION_REFERENCE",
        "entry.documentation must be an array.",
      );
      return;
    }

    const ids = new Set<string>();

    documentation.forEach((value, index) => {
      const reference = value as StrategyLibraryDocumentationReference;
      const path = `entry.documentation[${index}]`;

      if (!isObject(reference)) {
        collector.error(
          path,
          "INVALID_DOCUMENTATION_REFERENCE",
          `${path} must be an object.`,
        );
        return;
      }

      identifier(reference.documentationId, `${path}.documentationId`, collector, 256);
      requiredString(reference.title, `${path}.title`, collector, 512);
      requiredString(
        reference.description,
        `${path}.description`,
        collector,
        this.options.maximumStringLength,
      );
      optionalString(
        reference.uri,
        `${path}.uri`,
        collector,
        this.options.maximumStringLength,
      );
      requiredString(reference.contentType, `${path}.contentType`, collector, 128);
      this.boolean(reference.required, `${path}.required`, collector, "INVALID_DOCUMENTATION_REFERENCE");

      const normalized = reference.documentationId.trim().toLowerCase();

      if (ids.has(normalized)) {
        collector.error(
          `${path}.documentationId`,
          "DUPLICATE_VALUE",
          "Documentation identifiers must be unique.",
        );
      }

      ids.add(normalized);
      metadata(reference.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validateExplanationTemplate(
    template: StrategyLibraryExplanationTemplate,
    path: string,
    collector: Collector,
  ): void {
    if (!isObject(template)) {
      collector.error(path, "INVALID_EXPLANATION_TEMPLATE", `${path} must be an object.`);
      return;
    }

    identifier(template.templateId, `${path}.templateId`, collector, 256);
    requiredString(template.title, `${path}.title`, collector, 512);
    requiredString(template.summary, `${path}.summary`, collector, this.options.maximumStringLength);
    requiredString(
      template.signalExplanationTemplate,
      `${path}.signalExplanationTemplate`,
      collector,
      this.options.maximumStringLength,
    );
    requiredString(
      template.holdExplanationTemplate,
      `${path}.holdExplanationTemplate`,
      collector,
      this.options.maximumStringLength,
    );
    requiredString(
      template.riskExplanationTemplate,
      `${path}.riskExplanationTemplate`,
      collector,
      this.options.maximumStringLength,
    );
    requiredString(
      template.parameterExplanationTemplate,
      `${path}.parameterExplanationTemplate`,
      collector,
      this.options.maximumStringLength,
    );
    metadata(template.metadata, `${path}.metadata`, collector, this.options);
  }

  private validateEntryTimestamps(
    entry: StrategyLibraryEntry,
    validatedAt: UnixTimestampMilliseconds,
    collector: Collector,
  ): void {
    futureSafeTimestamp(
      entry.introducedAt,
      "entry.introducedAt",
      collector,
      validatedAt,
      this.options.maximumClockSkewMilliseconds,
    );
    futureSafeTimestamp(
      entry.updatedAt,
      "entry.updatedAt",
      collector,
      validatedAt,
      this.options.maximumClockSkewMilliseconds,
    );

    if (entry.deprecatedAt !== undefined) {
      futureSafeTimestamp(
        entry.deprecatedAt,
        "entry.deprecatedAt",
        collector,
        validatedAt,
        this.options.maximumClockSkewMilliseconds,
      );
    }

    if (entry.retirementAt !== undefined) {
      futureSafeTimestamp(
        entry.retirementAt,
        "entry.retirementAt",
        collector,
        validatedAt,
        this.options.maximumClockSkewMilliseconds,
      );
    }

    if (entry.updatedAt < entry.introducedAt) {
      collector.error(
        "entry.updatedAt",
        "INVALID_TIMESTAMP_ORDER",
        "entry.updatedAt cannot precede entry.introducedAt.",
      );
    }

    if (
      entry.deprecatedAt !== undefined &&
      entry.deprecatedAt < entry.introducedAt
    ) {
      collector.error(
        "entry.deprecatedAt",
        "INVALID_TIMESTAMP_ORDER",
        "entry.deprecatedAt cannot precede entry.introducedAt.",
      );
    }

    if (
      entry.retirementAt !== undefined &&
      entry.retirementAt < entry.introducedAt
    ) {
      collector.error(
        "entry.retirementAt",
        "INVALID_TIMESTAMP_ORDER",
        "entry.retirementAt cannot precede entry.introducedAt.",
      );
    }

    if (
      entry.deprecatedAt !== undefined &&
      entry.retirementAt !== undefined &&
      entry.retirementAt < entry.deprecatedAt
    ) {
      collector.error(
        "entry.retirementAt",
        "INVALID_TIMESTAMP_ORDER",
        "entry.retirementAt cannot precede entry.deprecatedAt.",
      );
    }

    if (entry.status === "DEPRECATED" && entry.deprecatedAt === undefined) {
      collector.error(
        "entry.deprecatedAt",
        "DEPRECATED_WITHOUT_TIMESTAMP",
        "Deprecated strategies must define deprecatedAt.",
      );
    }

    if (entry.status === "RETIRED" && entry.retirementAt === undefined) {
      collector.error(
        "entry.retirementAt",
        "RETIRED_WITHOUT_TIMESTAMP",
        "Retired strategies must define retirementAt.",
      );
    }
  }

  private validateCollectionMembers(
    members: readonly StrategyLibraryCollectionMember[],
    collector: Collector,
  ): void {
    const entryIds = new Set<string>();
    const strategyIds = new Set<string>();
    const positions = new Set<number>();

    members.forEach((value, index) => {
      const member = value as StrategyLibraryCollectionMember;
      const path = `collection.members[${index}]`;

      if (!isObject(member)) {
        collector.error(path, "INVALID_COLLECTION", `${path} must be an object.`);
        return;
      }

      identifier(member.entryId, `${path}.entryId`, collector, 256);
      identifier(member.strategyId, `${path}.strategyId`, collector, 256);

      if (!isNonNegativeInteger(member.position)) {
        collector.error(
          `${path}.position`,
          "INVALID_COLLECTION",
          "Collection position must be a non-negative integer.",
        );
      }

      this.boolean(member.featured, `${path}.featured`, collector, "INVALID_COLLECTION");
      optionalString(
        member.reason,
        `${path}.reason`,
        collector,
        this.options.maximumStringLength,
      );

      if (entryIds.has(member.entryId)) {
        collector.error(
          `${path}.entryId`,
          "DUPLICATE_VALUE",
          "Collection entry identifiers must be unique.",
        );
      }

      if (strategyIds.has(member.strategyId)) {
        collector.warning(
          `${path}.strategyId`,
          "DUPLICATE_VALUE",
          "A strategy appears multiple times in this collection.",
        );
      }

      if (positions.has(member.position)) {
        collector.error(
          `${path}.position`,
          "DUPLICATE_VALUE",
          "Collection member positions must be unique.",
        );
      }

      entryIds.add(member.entryId);
      strategyIds.add(member.strategyId);
      positions.add(member.position);
      metadata(member.metadata, `${path}.metadata`, collector, this.options);
    });
  }

  private validateReleaseEntries(
    entries: readonly StrategyLibraryReleaseEntry[],
    collector: Collector,
  ): void {
    const entryIds = new Set<string>();
    const strategyVersions = new Set<string>();

    entries.forEach((value, index) => {
      const entry = value as StrategyLibraryReleaseEntry;
      const path = `release.entries[${index}]`;

      if (!isObject(entry)) {
        collector.error(path, "INVALID_RELEASE", `${path} must be an object.`);
        return;
      }

      identifier(entry.entryId, `${path}.entryId`, collector, 256);
      identifier(entry.strategyId, `${path}.strategyId`, collector, 256);
      requiredString(entry.strategyVersion, `${path}.strategyVersion`, collector, 128);
      optionalString(entry.checksum, `${path}.checksum`, collector, 512);
      optionalString(
        entry.notes,
        `${path}.notes`,
        collector,
        this.options.maximumStringLength,
      );

      if (entryIds.has(entry.entryId)) {
        collector.error(
          `${path}.entryId`,
          "DUPLICATE_VALUE",
          "Release entry identifiers must be unique.",
        );
      }

      const strategyVersionKey = `${entry.strategyId}@${entry.strategyVersion}`;

      if (strategyVersions.has(strategyVersionKey)) {
        collector.error(
          `${path}.strategyVersion`,
          "DUPLICATE_VALUE",
          "A strategy version cannot appear more than once in a release.",
        );
      }

      entryIds.add(entry.entryId);
      strategyVersions.add(strategyVersionKey);
    });
  }

  private boolean(
    value: unknown,
    path: string,
    collector: Collector,
    code: StrategyLibraryValidationCode,
  ): void {
    if (typeof value !== "boolean") {
      collector.error(path, code, `${path} must be boolean.`);
    }
  }

  private now(): UnixTimestampMilliseconds {
    const value = this.options.clock();

    if (!isNonNegativeInteger(value)) {
      throw new Error(
        "Strategy library validator clock must return a non-negative integer timestamp.",
      );
    }

    return value;
  }

  private collector(): Collector {
    return new Collector(this.options.metadata);
  }

  private assertOptions(options: ResolvedOptions): void {
    if (!isNonNegativeInteger(options.maximumClockSkewMilliseconds)) {
      throw new RangeError(
        "maximumClockSkewMilliseconds must be a non-negative integer.",
      );
    }

    const positiveIntegerOptions: readonly [string, number][] = Object.freeze([
      ["maximumStringLength", options.maximumStringLength],
      ["maximumMetadataDepth", options.maximumMetadataDepth],
      ["maximumMetadataEntries", options.maximumMetadataEntries],
      ["maximumCollectionMembers", options.maximumCollectionMembers],
      ["maximumReleaseEntries", options.maximumReleaseEntries],
    ]);

    positiveIntegerOptions.forEach(([name, value]) => {
      if (!isPositiveInteger(value)) {
        throw new RangeError(`${name} must be a positive integer.`);
      }
    });
  }
}

export function createStrategyLibraryValidator(
  options: StrategyLibraryValidatorOptions = {},
): StrategyLibraryValidator {
  return new StrategyLibraryValidator(options);
}

export function validateStrategyLibraryEntry(
  entry: StrategyLibraryEntry,
  options: StrategyLibraryValidatorOptions = {},
): StrategyLibraryValidationReport {
  return createStrategyLibraryValidator(options).validateEntry(entry);
}

export function validateStrategyLibraryCollection(
  collection: StrategyLibraryCollection,
  options: StrategyLibraryValidatorOptions = {},
): StrategyLibraryValidationReport {
  return createStrategyLibraryValidator(options).validateCollection(collection);
}

export function validateStrategyLibraryRelease(
  release: StrategyLibraryRelease,
  options: StrategyLibraryValidatorOptions = {},
): StrategyLibraryValidationReport {
  return createStrategyLibraryValidator(options).validateRelease(release);
}

export default StrategyLibraryValidator;