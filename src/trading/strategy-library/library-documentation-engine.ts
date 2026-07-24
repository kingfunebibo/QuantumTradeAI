/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/library-documentation-engine.ts
 *
 * Purpose:
 * Generates deterministic, immutable, machine-readable and human-readable
 * documentation for Professional Trading Strategy Library entries.
 *
 * Responsibilities:
 *
 * - resolve entries from the strategy-library registry
 * - generate structured documentation sections
 * - expose existing documentation references
 * - evaluate documentation coverage and completeness
 * - render Markdown, plain-text, and JSON documentation
 * - expose strategy explanation templates
 * - identify missing required documentation
 * - produce deterministic documentation summaries
 *
 * This engine does not mutate library entries, execute strategies, retrieve
 * remote documentation, or render untrusted templates dynamically.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyMetadata,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  type StrategyLibraryDocumentationId,
  type StrategyLibraryDocumentationReference,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryExplanationTemplate,
  type StrategyLibraryRegistryPort,
} from "./strategy-library-contracts";

/* ============================================================================
 * Documentation content types
 * ============================================================================
 */

export type StrategyLibraryDocumentationContentType =
  StrategyLibraryDocumentationReference["contentType"];

export type StrategyLibraryDocumentationFormat =
  | "STRUCTURED"
  | "MARKDOWN"
  | "PLAIN_TEXT"
  | "JSON";

export type StrategyLibraryDocumentationSectionType =
  | "IDENTITY"
  | "CLASSIFICATION"
  | "LIFECYCLE"
  | "OPERATIONAL_PROFILE"
  | "RISK_PROFILE"
  | "COMPATIBILITY_PROFILE"
  | "REGIME_PROFILE"
  | "DATA_REQUIREMENTS"
  | "INDICATOR_REQUIREMENTS"
  | "PERFORMANCE_EXPECTATIONS"
  | "DOCUMENTATION_REFERENCES"
  | "EXPLAINABILITY"
  | "REPLACEMENT_AND_MIGRATION"
  | "METADATA";

export type StrategyLibraryDocumentationCoverageStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "INCOMPLETE";

export type StrategyLibraryDocumentationIssueSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR";

/* ============================================================================
 * Errors
 * ============================================================================
 */

export type StrategyLibraryDocumentationEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_REQUEST"
  | "ENTRY_NOT_FOUND"
  | "DOCUMENTATION_NOT_FOUND"
  | "INVALID_FORMAT"
  | "GENERATION_FAILED";

export interface StrategyLibraryDocumentationEngineErrorDetails {
  readonly field?: string;
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly documentationId?: StrategyLibraryDocumentationId;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryDocumentationEngineError extends Error {
  public readonly code: StrategyLibraryDocumentationEngineErrorCode;
  public readonly field?: string;
  public readonly entryId?: StrategyLibraryEntryId;
  public readonly strategyId?: StrategyId;
  public readonly strategyVersion?: StrategyVersion;
  public readonly documentationId?: StrategyLibraryDocumentationId;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryDocumentationEngineErrorCode,
    message: string,
    details: StrategyLibraryDocumentationEngineErrorDetails = {},
  ) {
    super(message);

    this.name = "StrategyLibraryDocumentationEngineError";
    this.code = code;
    this.field = details.field;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.documentationId = details.documentationId;
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryDocumentationEngineError.prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and options
 * ============================================================================
 */

export interface StrategyLibraryDocumentationClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryDocumentationEngineOptions {
  readonly clock?: StrategyLibraryDocumentationClock;

  readonly requiredContentTypes?:
    readonly StrategyLibraryDocumentationContentType[];

  readonly includeMetadataSection?: boolean;

  readonly includeEmptySections?: boolean;

  readonly includeOptionalDocumentationIssues?: boolean;

  readonly documentationCoverageWarningThreshold?: number;

  readonly documentationCoverageErrorThreshold?: number;

  readonly markdownHeadingLevel?: number;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Request contracts
 * ============================================================================
 */

export interface StrategyLibraryDocumentationEntryReference {
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
}

export interface StrategyLibraryDocumentationGenerationRequest {
  readonly entry:
    | StrategyLibraryEntry
    | StrategyLibraryDocumentationEntryReference;

  readonly format?: StrategyLibraryDocumentationFormat;

  readonly sections?: readonly StrategyLibraryDocumentationSectionType[];

  readonly includeDocumentationReferences?: boolean;

  readonly includeExplanationTemplate?: boolean;

  readonly includeMetadata?: boolean;

  readonly requiredContentTypes?:
    readonly StrategyLibraryDocumentationContentType[];

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Structured documentation contracts
 * ============================================================================
 */

export interface StrategyLibraryDocumentationField {
  readonly name: string;
  readonly label: string;
  readonly value: unknown;
  readonly description?: string;
  readonly sensitive: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryDocumentationSection {
  readonly sectionId: string;
  readonly type: StrategyLibraryDocumentationSectionType;
  readonly title: string;
  readonly summary: string;
  readonly fields: readonly StrategyLibraryDocumentationField[];
  readonly empty: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryDocumentationIssue {
  readonly code: string;
  readonly severity: StrategyLibraryDocumentationIssueSeverity;
  readonly message: string;
  readonly contentType?: StrategyLibraryDocumentationContentType;
  readonly documentationId?: StrategyLibraryDocumentationId;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryDocumentationCoverageItem {
  readonly contentType: StrategyLibraryDocumentationContentType;
  readonly required: boolean;
  readonly present: boolean;
  readonly referenceCount: number;
  readonly references: readonly StrategyLibraryDocumentationReference[];
  readonly score: number;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryDocumentationCoverageReport {
  readonly status: StrategyLibraryDocumentationCoverageStatus;
  readonly score: number;
  readonly requiredTypeCount: number;
  readonly presentRequiredTypeCount: number;
  readonly missingRequiredContentTypes:
    readonly StrategyLibraryDocumentationContentType[];
  readonly items: readonly StrategyLibraryDocumentationCoverageItem[];
  readonly issues: readonly StrategyLibraryDocumentationIssue[];
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryGeneratedDocumentation {
  readonly entryId: StrategyLibraryEntryId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly StrategyLibraryDocumentationSection[];
  readonly documentationReferences:
    readonly StrategyLibraryDocumentationReference[];
  readonly explanationTemplate?: StrategyLibraryExplanationTemplate;
  readonly coverage: StrategyLibraryDocumentationCoverageReport;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryRenderedDocumentation {
  readonly entryId: StrategyLibraryEntryId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly format: StrategyLibraryDocumentationFormat;
  readonly content: string;
  readonly contentLength: number;
  readonly checksum: string;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryDocumentationGenerationResult {
  readonly request: StrategyLibraryDocumentationGenerationRequest;
  readonly documentation: StrategyLibraryGeneratedDocumentation;
  readonly rendered?: StrategyLibraryRenderedDocumentation;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface ResolvedDocumentationOptions {
  readonly clock: StrategyLibraryDocumentationClock;
  readonly requiredContentTypes:
    readonly StrategyLibraryDocumentationContentType[];
  readonly includeMetadataSection: boolean;
  readonly includeEmptySections: boolean;
  readonly includeOptionalDocumentationIssues: boolean;
  readonly documentationCoverageWarningThreshold: number;
  readonly documentationCoverageErrorThreshold: number;
  readonly markdownHeadingLevel: number;
  readonly metadata: StrategyMetadata;
}

interface NormalizedDocumentationRequest {
  readonly source: StrategyLibraryDocumentationGenerationRequest;
  readonly entry: StrategyLibraryEntry;
  readonly format: StrategyLibraryDocumentationFormat;
  readonly sections: readonly StrategyLibraryDocumentationSectionType[];
  readonly includeDocumentationReferences: boolean;
  readonly includeExplanationTemplate: boolean;
  readonly includeMetadata: boolean;
  readonly requiredContentTypes:
    readonly StrategyLibraryDocumentationContentType[];
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_CLOCK: StrategyLibraryDocumentationClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const ALL_DOCUMENTATION_CONTENT_TYPES:
  readonly StrategyLibraryDocumentationContentType[] =
  Object.freeze([
    "OVERVIEW",
    "PARAMETERS",
    "RISK",
    "BACKTESTING",
    "LIVE_TRADING",
    "EXAMPLE",
    "RESEARCH",
    "CHANGELOG",
  ]);

const DEFAULT_REQUIRED_CONTENT_TYPES:
  readonly StrategyLibraryDocumentationContentType[] =
  Object.freeze([
    "OVERVIEW",
    "PARAMETERS",
    "RISK",
  ]);

const ALL_SECTION_TYPES:
  readonly StrategyLibraryDocumentationSectionType[] =
  Object.freeze([
    "IDENTITY",
    "CLASSIFICATION",
    "LIFECYCLE",
    "OPERATIONAL_PROFILE",
    "RISK_PROFILE",
    "COMPATIBILITY_PROFILE",
    "REGIME_PROFILE",
    "DATA_REQUIREMENTS",
    "INDICATOR_REQUIREMENTS",
    "PERFORMANCE_EXPECTATIONS",
    "DOCUMENTATION_REFERENCES",
    "EXPLAINABILITY",
    "REPLACEMENT_AND_MIGRATION",
    "METADATA",
  ]);

const EMPTY_FIELDS:
  readonly StrategyLibraryDocumentationField[] =
  Object.freeze([]);

const EMPTY_SECTIONS:
  readonly StrategyLibraryDocumentationSection[] =
  Object.freeze([]);

const EMPTY_REFERENCES:
  readonly StrategyLibraryDocumentationReference[] =
  Object.freeze([]);

const EMPTY_ISSUES:
  readonly StrategyLibraryDocumentationIssue[] =
  Object.freeze([]);

const EMPTY_CONTENT_TYPES:
  readonly StrategyLibraryDocumentationContentType[] =
  Object.freeze([]);

const DEFAULT_OPTIONS: Omit<
  ResolvedDocumentationOptions,
  "clock" | "metadata"
> = Object.freeze({
  requiredContentTypes: DEFAULT_REQUIRED_CONTENT_TYPES,
  includeMetadataSection: false,
  includeEmptySections: false,
  includeOptionalDocumentationIssues: true,
  documentationCoverageWarningThreshold: 0.8,
  documentationCoverageErrorThreshold: 0.5,
  markdownHeadingLevel: 1,
});

/* ============================================================================
 * Documentation engine
 * ============================================================================
 */

export class StrategyLibraryDocumentationEngine {
  private readonly registry: StrategyLibraryRegistryPort;
  private readonly options: ResolvedDocumentationOptions;

  public constructor(
    registry: StrategyLibraryRegistryPort,
    options: StrategyLibraryDocumentationEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    const warningThreshold =
      options.documentationCoverageWarningThreshold ??
      DEFAULT_OPTIONS.documentationCoverageWarningThreshold;

    const errorThreshold =
      options.documentationCoverageErrorThreshold ??
      DEFAULT_OPTIONS.documentationCoverageErrorThreshold;

    assertUnitInterval(
      warningThreshold,
      "options.documentationCoverageWarningThreshold",
    );

    assertUnitInterval(
      errorThreshold,
      "options.documentationCoverageErrorThreshold",
    );

    if (errorThreshold > warningThreshold) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_ARGUMENT",
        "documentationCoverageErrorThreshold cannot exceed documentationCoverageWarningThreshold.",
        {
          field: "options.documentationCoverageErrorThreshold",
        },
      );
    }

    const headingLevel =
      options.markdownHeadingLevel ??
      DEFAULT_OPTIONS.markdownHeadingLevel;

    assertIntegerInRange(
      headingLevel,
      1,
      6,
      "options.markdownHeadingLevel",
    );

    this.registry = registry;

    this.options = deepFreeze({
      clock: options.clock ?? DEFAULT_CLOCK,
      requiredContentTypes: normalizeContentTypes(
        options.requiredContentTypes ??
          DEFAULT_OPTIONS.requiredContentTypes,
        "options.requiredContentTypes",
      ),
      includeMetadataSection:
        options.includeMetadataSection ??
        DEFAULT_OPTIONS.includeMetadataSection,
      includeEmptySections:
        options.includeEmptySections ??
        DEFAULT_OPTIONS.includeEmptySections,
      includeOptionalDocumentationIssues:
        options.includeOptionalDocumentationIssues ??
        DEFAULT_OPTIONS.includeOptionalDocumentationIssues,
      documentationCoverageWarningThreshold: warningThreshold,
      documentationCoverageErrorThreshold: errorThreshold,
      markdownHeadingLevel: headingLevel,
      metadata: immutableCopy(
        options.metadata ?? EMPTY_STRATEGY_METADATA,
      ),
    });

    assertTimestamp(
      this.options.clock.now(),
      "options.clock.now()",
    );
  }

  public generate(
    request: StrategyLibraryDocumentationGenerationRequest,
  ): StrategyLibraryDocumentationGenerationResult {
    const normalized = this.normalizeRequest(request);

    try {
      const generatedAt = this.now();

      const coverage = this.evaluateCoverageForEntry(
        normalized.entry,
        normalized.requiredContentTypes,
        normalized.metadata,
        generatedAt,
      );

      const sections = this.buildSections(
        normalized.entry,
        normalized,
      );

      const documentationReferences =
        normalized.includeDocumentationReferences
          ? sortDocumentationReferences(
              normalized.entry.documentation,
            )
          : EMPTY_REFERENCES;

      const title = createDocumentTitle(normalized.entry);
      const summary = createDocumentSummary(normalized.entry);

      const documentation: StrategyLibraryGeneratedDocumentation =
        deepFreeze({
          entryId: normalized.entry.entryId,
          strategyId: normalized.entry.strategyId,
          strategyVersion: normalized.entry.strategyVersion,
          title,
          summary,
          sections,
          documentationReferences,
          ...(normalized.includeExplanationTemplate &&
          normalized.entry.explanationTemplate !== undefined
            ? {
                explanationTemplate: immutableCopy(
                  normalized.entry.explanationTemplate,
                ),
              }
            : {}),
          coverage,
          generatedAt,
          metadata: normalized.metadata,
        });

      const rendered =
        normalized.format === "STRUCTURED"
          ? undefined
          : this.renderDocumentation(
              documentation,
              normalized.format,
              normalized.metadata,
              generatedAt,
            );

      return deepFreeze({
        request: immutableCopy(normalized.source),
        documentation,
        ...(rendered === undefined ? {} : { rendered }),
        generatedAt,
        metadata: normalized.metadata,
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryDocumentationEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryDocumentationEngineError(
        "GENERATION_FAILED",
        "Strategy-library documentation generation failed.",
        {
          entryId: normalized.entry.entryId,
          strategyId: normalized.entry.strategyId,
          strategyVersion: normalized.entry.strategyVersion,
          cause,
          metadata: normalized.metadata,
        },
      );
    }
  }

  public generateForEntry(
    entry: StrategyLibraryEntry,
    format: StrategyLibraryDocumentationFormat = "STRUCTURED",
  ): StrategyLibraryDocumentationGenerationResult {
    return this.generate({
      entry,
      format,
    });
  }

  public generateByStrategy(
    strategyId: StrategyId,
    strategyVersion?: StrategyVersion,
    format: StrategyLibraryDocumentationFormat = "STRUCTURED",
  ): StrategyLibraryDocumentationGenerationResult {
    return this.generate({
      entry: {
        strategyId,
        ...(strategyVersion === undefined
          ? {}
          : { strategyVersion }),
      },
      format,
    });
  }

  public generateByEntryId(
    entryId: StrategyLibraryEntryId,
    format: StrategyLibraryDocumentationFormat = "STRUCTURED",
  ): StrategyLibraryDocumentationGenerationResult {
    return this.generate({
      entry: { entryId },
      format,
    });
  }

  public evaluateCoverage(
    entry:
      | StrategyLibraryEntry
      | StrategyLibraryDocumentationEntryReference,
    requiredContentTypes:
      readonly StrategyLibraryDocumentationContentType[] =
      this.options.requiredContentTypes,
  ): StrategyLibraryDocumentationCoverageReport {
    const resolvedEntry = this.resolveEntry(entry, "entry");
    const normalizedRequired = normalizeContentTypes(
      requiredContentTypes,
      "requiredContentTypes",
    );

    return this.evaluateCoverageForEntry(
      resolvedEntry,
      normalizedRequired,
      this.options.metadata,
      this.now(),
    );
  }

  public listDocumentationReferences(
    entry:
      | StrategyLibraryEntry
      | StrategyLibraryDocumentationEntryReference,
    contentType?: StrategyLibraryDocumentationContentType,
  ): readonly StrategyLibraryDocumentationReference[] {
    const resolvedEntry = this.resolveEntry(entry, "entry");

    if (contentType !== undefined) {
      assertDocumentationContentType(
        contentType,
        "contentType",
      );
    }

    return sortDocumentationReferences(
      resolvedEntry.documentation.filter(
        (reference) =>
          contentType === undefined ||
          reference.contentType === contentType,
      ),
    );
  }

  public getDocumentationReference(
    entry:
      | StrategyLibraryEntry
      | StrategyLibraryDocumentationEntryReference,
    documentationId: StrategyLibraryDocumentationId,
  ): StrategyLibraryDocumentationReference {
    const resolvedEntry = this.resolveEntry(entry, "entry");

    const normalizedDocumentationId = normalizeRequiredString(
      documentationId,
      "documentationId",
    );

    const reference = resolvedEntry.documentation.find(
      (candidate) =>
        candidate.documentationId ===
        normalizedDocumentationId,
    );

    if (reference === undefined) {
      throw new StrategyLibraryDocumentationEngineError(
        "DOCUMENTATION_NOT_FOUND",
        `Documentation reference '${normalizedDocumentationId}' was not found for strategy-library entry '${resolvedEntry.entryId}'.`,
        {
          entryId: resolvedEntry.entryId,
          strategyId: resolvedEntry.strategyId,
          strategyVersion: resolvedEntry.strategyVersion,
          documentationId: normalizedDocumentationId,
        },
      );
    }

    return immutableCopy(reference);
  }

  public getExplanationTemplate(
    entry:
      | StrategyLibraryEntry
      | StrategyLibraryDocumentationEntryReference,
  ): StrategyLibraryExplanationTemplate | undefined {
    const resolvedEntry = this.resolveEntry(entry, "entry");

    return resolvedEntry.explanationTemplate === undefined
      ? undefined
      : immutableCopy(resolvedEntry.explanationTemplate);
  }

  private normalizeRequest(
    request: StrategyLibraryDocumentationGenerationRequest,
  ): NormalizedDocumentationRequest {
    if (!isRecord(request)) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_REQUEST",
        "documentation generation request must be an object.",
        {
          field: "request",
        },
      );
    }

    if (request.entry === undefined) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_REQUEST",
        "request.entry is required.",
        {
          field: "request.entry",
        },
      );
    }

    const entry = this.resolveEntry(
      request.entry,
      "request.entry",
    );

    const format = request.format ?? "STRUCTURED";
    assertDocumentationFormat(format, "request.format");

    const requestedSections =
      request.sections === undefined
        ? ALL_SECTION_TYPES
        : normalizeSectionTypes(
            request.sections,
            "request.sections",
          );

    const includeMetadata =
      request.includeMetadata ??
      this.options.includeMetadataSection;

    const sections = requestedSections.filter(
      (section) =>
        includeMetadata || section !== "METADATA",
    );

    const requiredContentTypes = normalizeContentTypes(
      request.requiredContentTypes ??
        this.options.requiredContentTypes,
      "request.requiredContentTypes",
    );

    return deepFreeze({
      source: immutableCopy(request),
      entry,
      format,
      sections: Object.freeze(sections),
      includeDocumentationReferences:
        request.includeDocumentationReferences ?? true,
      includeExplanationTemplate:
        request.includeExplanationTemplate ?? true,
      includeMetadata,
      requiredContentTypes,
      metadata: immutableCopy(
        request.metadata ?? this.options.metadata,
      ),
    });
  }

  private resolveEntry(
    value:
      | StrategyLibraryEntry
      | StrategyLibraryDocumentationEntryReference,
    field: string,
  ): StrategyLibraryEntry {
    if (!isRecord(value)) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_ARGUMENT",
        `${field} must be a strategy-library entry or entry reference.`,
        {
          field,
        },
      );
    }

    if (isStrategyLibraryEntry(value)) {
      return value;
    }

    const reference =
      value as StrategyLibraryDocumentationEntryReference;

    if (reference.entryId !== undefined) {
      const entryId = normalizeRequiredString(
        reference.entryId,
        `${field}.entryId`,
      );

      const found = this.registry
        .list()
        .find(
          (entry) =>
            entry.entryId === entryId,
        );

      if (found === undefined) {
        throw new StrategyLibraryDocumentationEngineError(
          "ENTRY_NOT_FOUND",
          `No strategy-library entry was found for entryId '${entryId}'.`,
          {
            field: `${field}.entryId`,
            entryId,
          },
        );
      }

      return found;
    }

    if (reference.strategyId === undefined) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_ARGUMENT",
        `${field} must contain entryId or strategyId.`,
        {
          field,
        },
      );
    }

    const strategyId = normalizeRequiredString(
      reference.strategyId,
      `${field}.strategyId`,
    );

    const strategyVersion =
      reference.strategyVersion === undefined
        ? undefined
        : normalizeRequiredString(
            reference.strategyVersion,
            `${field}.strategyVersion`,
          );

    const found = this.registry.get(
      strategyId,
      strategyVersion,
    );

    if (found === undefined) {
      throw new StrategyLibraryDocumentationEngineError(
        "ENTRY_NOT_FOUND",
        strategyVersion === undefined
          ? `No strategy-library entry was found for strategy '${strategyId}'.`
          : `No strategy-library entry was found for strategy '${strategyId}' version '${strategyVersion}'.`,
        {
          field,
          strategyId,
          strategyVersion,
        },
      );
    }

    return found;
  }

  private buildSections(
    entry: StrategyLibraryEntry,
    request: NormalizedDocumentationRequest,
  ): readonly StrategyLibraryDocumentationSection[] {
    const sections: StrategyLibraryDocumentationSection[] = [];

    for (const sectionType of request.sections) {
      const section = this.buildSection(
        sectionType,
        entry,
        request,
      );

      if (
        !section.empty ||
        this.options.includeEmptySections
      ) {
        sections.push(section);
      }
    }

    return sections.length === 0
      ? EMPTY_SECTIONS
      : Object.freeze(sections);
  }

  private buildSection(
    type: StrategyLibraryDocumentationSectionType,
    entry: StrategyLibraryEntry,
    request: NormalizedDocumentationRequest,
  ): StrategyLibraryDocumentationSection {
    switch (type) {
      case "IDENTITY":
        return createSection(
          type,
          "Strategy Identity",
          "Canonical strategy-library and framework identity.",
          [
            createField("entryId", "Entry ID", entry.entryId),
            createField(
              "schemaVersion",
              "Library Schema Version",
              entry.schemaVersion,
            ),
            createField(
              "strategyId",
              "Strategy ID",
              entry.strategyId,
            ),
            createField(
              "strategyVersion",
              "Strategy Version",
              entry.strategyVersion,
            ),
          ],
          request.metadata,
        );

      case "CLASSIFICATION":
        return createSection(
          type,
          "Classification",
          "Library classification, complexity, aliases, and search taxonomy.",
          [
            createField(
              "family",
              "Primary Family",
              entry.family,
            ),
            createField(
              "secondaryFamilies",
              "Secondary Families",
              entry.secondaryFamilies,
            ),
            createField(
              "complexity",
              "Complexity",
              entry.complexity,
            ),
            createField(
              "tags",
              "Tags",
              entry.tags,
            ),
            createField(
              "aliases",
              "Aliases",
              entry.aliases,
            ),
            createField(
              "searchKeywords",
              "Search Keywords",
              entry.searchKeywords,
            ),
          ],
          request.metadata,
        );

      case "LIFECYCLE":
        return createSection(
          type,
          "Lifecycle and Verification",
          "Operational status, verification maturity, availability, and lifecycle timestamps.",
          [
            createField(
              "status",
              "Operational Status",
              entry.status,
            ),
            createField(
              "verificationStatus",
              "Verification Status",
              entry.verificationStatus,
            ),
            createField(
              "availability",
              "Availability",
              entry.availability,
            ),
            createField(
              "introducedAt",
              "Introduced At",
              entry.introducedAt,
            ),
            createField(
              "updatedAt",
              "Updated At",
              entry.updatedAt,
            ),
            createField(
              "deprecatedAt",
              "Deprecated At",
              entry.deprecatedAt,
            ),
            createField(
              "retirementAt",
              "Retirement At",
              entry.retirementAt,
            ),
          ],
          request.metadata,
        );

      case "OPERATIONAL_PROFILE":
        return createSection(
          type,
          "Operational Profile",
          "Expected operating behavior and runtime characteristics.",
          [
            createField(
              "holdingPeriod",
              "Holding Period",
              entry.operationalProfile.holdingPeriod,
            ),
            createField(
              "frequency",
              "Trading Frequency",
              entry.operationalProfile.frequency,
            ),
            createField(
              "directionality",
              "Directionality",
              entry.operationalProfile.directionality,
            ),
            createField(
              "capitalStyle",
              "Capital Style",
              entry.operationalProfile.capitalStyle,
            ),
            createField(
              "intelligenceType",
              "Intelligence Type",
              entry.operationalProfile.intelligenceType,
            ),
            createField(
              "determinismMode",
              "Determinism Mode",
              entry.operationalProfile.determinismMode,
            ),
            createField(
              "expectedMinimumSignalsPerDay",
              "Expected Minimum Signals Per Day",
              entry.operationalProfile
                .expectedMinimumSignalsPerDay,
            ),
            createField(
              "expectedMaximumSignalsPerDay",
              "Expected Maximum Signals Per Day",
              entry.operationalProfile
                .expectedMaximumSignalsPerDay,
            ),
            createField(
              "requiresContinuousOperation",
              "Requires Continuous Operation",
              entry.operationalProfile
                .requiresContinuousOperation,
            ),
            createField(
              "requiresPersistentState",
              "Requires Persistent State",
              entry.operationalProfile
                .requiresPersistentState,
            ),
            createField(
              "supportsWarmStart",
              "Supports Warm Start",
              entry.operationalProfile.supportsWarmStart,
            ),
            createField(
              "supportsDeterministicReplay",
              "Supports Deterministic Replay",
              entry.operationalProfile
                .supportsDeterministicReplay,
            ),
          ],
          request.metadata,
        );

      case "RISK_PROFILE":
        return createSection(
          type,
          "Risk Profile",
          "Overall risk classification, dimensional assessments, warnings, and recommended limits.",
          [
            createField(
              "riskProfileId",
              "Risk Profile ID",
              entry.riskProfile.riskProfileId,
            ),
            createField(
              "overallRiskLevel",
              "Overall Risk Level",
              entry.riskProfile.overallRiskLevel,
            ),
            createField(
              "dimensions",
              "Risk Dimensions",
              entry.riskProfile.dimensions,
            ),
            createField(
              "maximumRecommendedLeverage",
              "Maximum Recommended Leverage",
              entry.riskProfile.maximumRecommendedLeverage,
            ),
            createField(
              "maximumRecommendedCapitalFraction",
              "Maximum Recommended Capital Fraction",
              entry.riskProfile
                .maximumRecommendedCapitalFraction,
            ),
            createField(
              "requiresStopLoss",
              "Requires Stop Loss",
              entry.riskProfile.requiresStopLoss,
            ),
            createField(
              "warnings",
              "Risk Warnings",
              entry.riskProfile.warnings,
            ),
          ],
          request.metadata,
        );

      case "COMPATIBILITY_PROFILE":
        return createSection(
          type,
          "Compatibility Profile",
          "Supported markets, trading modes, environments, timeframes, capital limits, and capabilities.",
          [
            createField(
              "compatibilityProfileId",
              "Compatibility Profile ID",
              entry.compatibilityProfile
                .compatibilityProfileId,
            ),
            createField(
              "marketTypes",
              "Market Types",
              entry.compatibilityProfile.marketTypes,
            ),
            createField(
              "tradingModes",
              "Trading Modes",
              entry.compatibilityProfile.tradingModes,
            ),
            createField(
              "environments",
              "Environments",
              entry.compatibilityProfile.environments,
            ),
            createField(
              "timeframes",
              "Timeframes",
              entry.compatibilityProfile.timeframes,
            ),
            createField(
              "minimumCapital",
              "Minimum Capital",
              entry.compatibilityProfile.minimumCapital,
            ),
            createField(
              "maximumCapital",
              "Maximum Capital",
              entry.compatibilityProfile.maximumCapital,
            ),
            createField(
              "supportsFractionalQuantity",
              "Supports Fractional Quantity",
              entry.compatibilityProfile
                .supportsFractionalQuantity,
            ),
            createField(
              "supportsLeverage",
              "Supports Leverage",
              entry.compatibilityProfile.supportsLeverage,
            ),
            createField(
              "supportsHedgeMode",
              "Supports Hedge Mode",
              entry.compatibilityProfile.supportsHedgeMode,
            ),
            createField(
              "supportsOneWayMode",
              "Supports One-Way Mode",
              entry.compatibilityProfile.supportsOneWayMode,
            ),
            createField(
              "requiresShortSelling",
              "Requires Short Selling",
              entry.compatibilityProfile.requiresShortSelling,
            ),
            createField(
              "requiredCapabilities",
              "Required Capabilities",
              entry.compatibilityProfile
                .requiredCapabilities,
            ),
          ],
          request.metadata,
        );

      case "REGIME_PROFILE":
        return createSection(
          type,
          "Market-Regime Suitability",
          "Defined suitability across market regimes.",
          [
            createField(
              "regimeProfiles",
              "Regime Profiles",
              entry.regimeProfiles,
            ),
          ],
          request.metadata,
        );

      case "DATA_REQUIREMENTS":
        return createSection(
          type,
          "Data Requirements",
          "Required and optional market or reference data.",
          [
            createField(
              "dataRequirements",
              "Data Requirements",
              entry.dataRequirements,
            ),
          ],
          request.metadata,
        );

      case "INDICATOR_REQUIREMENTS":
        return createSection(
          type,
          "Indicator Requirements",
          "Required and optional technical indicators.",
          [
            createField(
              "indicatorRequirements",
              "Indicator Requirements",
              entry.indicatorRequirements,
            ),
          ],
          request.metadata,
        );

      case "PERFORMANCE_EXPECTATIONS":
        return createSection(
          type,
          "Performance Expectations",
          "Informational performance ranges and targets declared by the strategy library.",
          [
            createField(
              "performanceExpectations",
              "Performance Expectations",
              entry.performanceExpectations,
            ),
          ],
          request.metadata,
        );

      case "DOCUMENTATION_REFERENCES":
        return createSection(
          type,
          "Documentation References",
          "Available overview, parameter, risk, backtesting, live-trading, example, research, and changelog references.",
          request.includeDocumentationReferences
            ? [
                createField(
                  "documentation",
                  "Documentation",
                  sortDocumentationReferences(
                    entry.documentation,
                  ),
                ),
              ]
            : EMPTY_FIELDS,
          request.metadata,
        );

      case "EXPLAINABILITY":
        return createSection(
          type,
          "Explainability Template",
          "Human-readable templates for signal, hold, risk, and parameter explanations.",
          request.includeExplanationTemplate &&
          entry.explanationTemplate !== undefined
            ? [
                createField(
                  "templateId",
                  "Template ID",
                  entry.explanationTemplate.templateId,
                ),
                createField(
                  "title",
                  "Title",
                  entry.explanationTemplate.title,
                ),
                createField(
                  "summary",
                  "Summary",
                  entry.explanationTemplate.summary,
                ),
                createField(
                  "signalExplanationTemplate",
                  "Signal Explanation Template",
                  entry.explanationTemplate
                    .signalExplanationTemplate,
                ),
                createField(
                  "holdExplanationTemplate",
                  "Hold Explanation Template",
                  entry.explanationTemplate
                    .holdExplanationTemplate,
                ),
                createField(
                  "riskExplanationTemplate",
                  "Risk Explanation Template",
                  entry.explanationTemplate
                    .riskExplanationTemplate,
                ),
                createField(
                  "parameterExplanationTemplate",
                  "Parameter Explanation Template",
                  entry.explanationTemplate
                    .parameterExplanationTemplate,
                ),
              ]
            : EMPTY_FIELDS,
          request.metadata,
        );

      case "REPLACEMENT_AND_MIGRATION":
        return createSection(
          type,
          "Replacement and Migration",
          "Replacement strategy information for deprecated or retired entries.",
          [
            createField(
              "replacementStrategyId",
              "Replacement Strategy ID",
              entry.replacementStrategyId,
            ),
            createField(
              "deprecatedAt",
              "Deprecated At",
              entry.deprecatedAt,
            ),
            createField(
              "retirementAt",
              "Retirement At",
              entry.retirementAt,
            ),
          ],
          request.metadata,
        );

      case "METADATA":
        return createSection(
          type,
          "Metadata",
          "Immutable strategy-library metadata.",
          request.includeMetadata
            ? [
                createField(
                  "entryMetadata",
                  "Entry Metadata",
                  entry.metadata,
                ),
                createField(
                  "manifestMetadata",
                  "Manifest Metadata",
                  readRecordProperty(
                    entry.manifest,
                    "metadata",
                  ),
                ),
              ]
            : EMPTY_FIELDS,
          request.metadata,
        );

      default:
        return assertNever(type);
    }
  }

  private evaluateCoverageForEntry(
    entry: StrategyLibraryEntry,
    requiredContentTypes:
      readonly StrategyLibraryDocumentationContentType[],
    metadata: StrategyMetadata,
    generatedAt: UnixTimestampMilliseconds,
  ): StrategyLibraryDocumentationCoverageReport {
    const requiredSet = new Set(requiredContentTypes);
    const items: StrategyLibraryDocumentationCoverageItem[] = [];
    const issues: StrategyLibraryDocumentationIssue[] = [];

    for (const contentType of ALL_DOCUMENTATION_CONTENT_TYPES) {
      const references = sortDocumentationReferences(
        entry.documentation.filter(
          (reference) =>
            reference.contentType === contentType,
        ),
      );

      const required =
        requiredSet.has(contentType) ||
        references.some(
          (reference) => reference.required,
        );

      const present = references.length > 0;
      const score = present ? 1 : 0;

      items.push(
        deepFreeze({
          contentType,
          required,
          present,
          referenceCount: references.length,
          references,
          score,
          metadata,
        }),
      );

      if (required && !present) {
        issues.push(
          createIssue(
            "MISSING_REQUIRED_DOCUMENTATION",
            "ERROR",
            `Required documentation type '${contentType}' is missing.`,
            metadata,
            {
              contentType,
            },
          ),
        );
      } else if (
        !required &&
        !present &&
        this.options.includeOptionalDocumentationIssues
      ) {
        issues.push(
          createIssue(
            "MISSING_OPTIONAL_DOCUMENTATION",
            "INFO",
            `Optional documentation type '${contentType}' is not available.`,
            metadata,
            {
              contentType,
            },
          ),
        );
      }

      for (const reference of references) {
        if (
          reference.uri === undefined ||
          reference.uri.trim().length === 0
        ) {
          issues.push(
            createIssue(
              "DOCUMENTATION_URI_NOT_DEFINED",
              reference.required ? "WARNING" : "INFO",
              `Documentation reference '${reference.documentationId}' does not define a URI.`,
              metadata,
              {
                contentType,
                documentationId:
                  reference.documentationId,
              },
            ),
          );
        }
      }
    }

    if (entry.explanationTemplate === undefined) {
      issues.push(
        createIssue(
          "EXPLANATION_TEMPLATE_MISSING",
          "WARNING",
          "The strategy entry does not define an explanation template.",
          metadata,
        ),
      );
    }

    const requiredItems = items.filter(
      (item) => item.required,
    );

    const presentRequiredItems = requiredItems.filter(
      (item) => item.present,
    );

    const score =
      requiredItems.length === 0
        ? 1
        : normalizeScore(
            presentRequiredItems.length /
              requiredItems.length,
          );

    const missingRequiredContentTypes =
      requiredItems
        .filter((item) => !item.present)
        .map((item) => item.contentType);

    const status =
      score >=
      this.options.documentationCoverageWarningThreshold
        ? "COMPLETE"
        : score >=
            this.options.documentationCoverageErrorThreshold
          ? "PARTIAL"
          : "INCOMPLETE";

    return deepFreeze({
      status,
      score,
      requiredTypeCount: requiredItems.length,
      presentRequiredTypeCount:
        presentRequiredItems.length,
      missingRequiredContentTypes:
        missingRequiredContentTypes.length === 0
          ? EMPTY_CONTENT_TYPES
          : Object.freeze(
              missingRequiredContentTypes,
            ),
      items: Object.freeze(items),
      issues:
        issues.length === 0
          ? EMPTY_ISSUES
          : Object.freeze(
              issues.sort(compareIssues),
            ),
      generatedAt,
      metadata,
    });
  }

  private renderDocumentation(
    documentation: StrategyLibraryGeneratedDocumentation,
    format: Exclude<
      StrategyLibraryDocumentationFormat,
      "STRUCTURED"
    >,
    metadata: StrategyMetadata,
    generatedAt: UnixTimestampMilliseconds,
  ): StrategyLibraryRenderedDocumentation {
    let content: string;

    switch (format) {
      case "MARKDOWN":
        content = renderMarkdown(
          documentation,
          this.options.markdownHeadingLevel,
        );
        break;

      case "PLAIN_TEXT":
        content = renderPlainText(documentation);
        break;

      case "JSON":
        content = stableStringify(
          documentation,
          2,
        );
        break;

      default:
        return assertNever(format);
    }

    return deepFreeze({
      entryId: documentation.entryId,
      strategyId: documentation.strategyId,
      strategyVersion:
        documentation.strategyVersion,
      format,
      content,
      contentLength: content.length,
      checksum: calculateDeterministicChecksum(content),
      generatedAt,
      metadata,
    });
  }

  private now(): UnixTimestampMilliseconds {
    const timestamp = this.options.clock.now();

    assertTimestamp(
      timestamp,
      "clock.now()",
    );

    return timestamp;
  }
}

/* ============================================================================
 * Factory
 * ============================================================================
 */

export function createStrategyLibraryDocumentationEngine(
  registry: StrategyLibraryRegistryPort,
  options: StrategyLibraryDocumentationEngineOptions = {},
): StrategyLibraryDocumentationEngine {
  return new StrategyLibraryDocumentationEngine(
    registry,
    options,
  );
}

/* ============================================================================
 * Section and issue construction
 * ============================================================================
 */

function createField(
  name: string,
  label: string,
  value: unknown,
  description?: string,
): StrategyLibraryDocumentationField {
  return deepFreeze({
    name,
    label,
    value: immutableCopy(value),
    ...(description === undefined
      ? {}
      : { description }),
    sensitive: false,
    metadata: EMPTY_STRATEGY_METADATA,
  });
}

function createSection(
  type: StrategyLibraryDocumentationSectionType,
  title: string,
  summary: string,
  fields:
    readonly StrategyLibraryDocumentationField[],
  metadata: StrategyMetadata,
): StrategyLibraryDocumentationSection {
  const meaningfulFields = fields.filter(
    (field) => !isEmptyValue(field.value),
  );

  return deepFreeze({
    sectionId: createSectionId(type),
    type,
    title,
    summary,
    fields:
      meaningfulFields.length === 0
        ? EMPTY_FIELDS
        : Object.freeze(meaningfulFields),
    empty: meaningfulFields.length === 0,
    metadata,
  });
}

function createIssue(
  code: string,
  severity: StrategyLibraryDocumentationIssueSeverity,
  message: string,
  metadata: StrategyMetadata,
  details: {
    readonly contentType?:
      StrategyLibraryDocumentationContentType;
    readonly documentationId?:
      StrategyLibraryDocumentationId;
  } = {},
): StrategyLibraryDocumentationIssue {
  return deepFreeze({
    code,
    severity,
    message,
    ...(details.contentType === undefined
      ? {}
      : {
          contentType: details.contentType,
        }),
    ...(details.documentationId === undefined
      ? {}
      : {
          documentationId:
            details.documentationId,
        }),
    metadata,
  });
}

function createSectionId(
  type: StrategyLibraryDocumentationSectionType,
): string {
  return `strategy-library-documentation:${type
    .toLowerCase()
    .replace(/_/g, "-")}`;
}

/* ============================================================================
 * Rendering
 * ============================================================================
 */

function renderMarkdown(
  documentation: StrategyLibraryGeneratedDocumentation,
  headingLevel: number,
): string {
  const lines: string[] = [];

  lines.push(
    `${"#".repeat(headingLevel)} ${escapeMarkdown(
      documentation.title,
    )}`,
  );

  lines.push("");
  lines.push(documentation.summary);
  lines.push("");

  lines.push(
    `- **Entry ID:** \`${documentation.entryId}\``,
  );
  lines.push(
    `- **Strategy ID:** \`${documentation.strategyId}\``,
  );
  lines.push(
    `- **Version:** \`${documentation.strategyVersion}\``,
  );
  lines.push(
    `- **Documentation coverage:** ${formatPercentage(
      documentation.coverage.score,
    )} (${documentation.coverage.status})`,
  );
  lines.push("");

  for (const section of documentation.sections) {
    lines.push(
      `${"#".repeat(
        Math.min(6, headingLevel + 1),
      )} ${escapeMarkdown(section.title)}`,
    );
    lines.push("");
    lines.push(section.summary);
    lines.push("");

    if (section.fields.length === 0) {
      lines.push("_No information available._");
      lines.push("");
      continue;
    }

    for (const field of section.fields) {
      lines.push(
        `- **${escapeMarkdown(
          field.label,
        )}:** ${formatMarkdownValue(field.value)}`,
      );
    }

    lines.push("");
  }

  lines.push(
    `${"#".repeat(
      Math.min(6, headingLevel + 1),
    )} Documentation Coverage`,
  );
  lines.push("");
  lines.push(
    `Coverage status: **${documentation.coverage.status}**`,
  );
  lines.push("");
  lines.push(
    `Coverage score: **${formatPercentage(
      documentation.coverage.score,
    )}**`,
  );
  lines.push("");

  for (const item of documentation.coverage.items) {
    lines.push(
      `- ${item.present ? "✓" : "✗"} **${
        item.contentType
      }** — ${
        item.required ? "required" : "optional"
      }; ${item.referenceCount} reference(s)`,
    );
  }

  if (documentation.coverage.issues.length > 0) {
    lines.push("");
    lines.push(
      `${"#".repeat(
        Math.min(6, headingLevel + 2),
      )} Documentation Issues`,
    );
    lines.push("");

    for (const issue of documentation.coverage.issues) {
      lines.push(
        `- **${issue.severity} — ${issue.code}:** ${issue.message}`,
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderPlainText(
  documentation: StrategyLibraryGeneratedDocumentation,
): string {
  const lines: string[] = [];

  lines.push(documentation.title);
  lines.push("=".repeat(documentation.title.length));
  lines.push("");
  lines.push(documentation.summary);
  lines.push("");
  lines.push(`Entry ID: ${documentation.entryId}`);
  lines.push(`Strategy ID: ${documentation.strategyId}`);
  lines.push(
    `Version: ${documentation.strategyVersion}`,
  );
  lines.push(
    `Documentation coverage: ${formatPercentage(
      documentation.coverage.score,
    )} (${documentation.coverage.status})`,
  );
  lines.push("");

  for (const section of documentation.sections) {
    lines.push(section.title.toUpperCase());
    lines.push("-".repeat(section.title.length));
    lines.push(section.summary);
    lines.push("");

    if (section.fields.length === 0) {
      lines.push("No information available.");
      lines.push("");
      continue;
    }

    for (const field of section.fields) {
      lines.push(
        `${field.label}: ${formatPlainTextValue(
          field.value,
        )}`,
      );
    }

    lines.push("");
  }

  lines.push("DOCUMENTATION COVERAGE");
  lines.push("----------------------");

  for (const item of documentation.coverage.items) {
    lines.push(
      `${item.present ? "[PRESENT]" : "[MISSING]"} ${
        item.contentType
      } — ${
        item.required ? "required" : "optional"
      } — ${item.referenceCount} reference(s)`,
    );
  }

  if (documentation.coverage.issues.length > 0) {
    lines.push("");
    lines.push("DOCUMENTATION ISSUES");
    lines.push("--------------------");

    for (const issue of documentation.coverage.issues) {
      lines.push(
        `${issue.severity} ${issue.code}: ${issue.message}`,
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function formatMarkdownValue(
  value: unknown,
): string {
  if (value === undefined) {
    return "_Not specified_";
  }

  if (value === null) {
    return "_None_";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return `\`${escapeMarkdown(String(value))}\``;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "_None_";
    }

    if (
      value.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
    ) {
      return value
        .map(
          (item) =>
            `\`${escapeMarkdown(String(item))}\``,
        )
        .join(", ");
    }
  }

  return `\`\`\`json\n${stableStringify(
    value,
    2,
  )}\n\`\`\``;
}

function formatPlainTextValue(
  value: unknown,
): string {
  if (value === undefined) {
    return "Not specified";
  }

  if (value === null) {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "None";
    }

    if (
      value.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
    ) {
      return value.map(String).join(", ");
    }
  }

  return stableStringify(value, 0);
}

function escapeMarkdown(value: string): string {
  return value.replace(
    /([\\`*_[\]<>])/g,
    "\\$1",
  );
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/* ============================================================================
 * Documentation helpers
 * ============================================================================
 */

function createDocumentTitle(
  entry: StrategyLibraryEntry,
): string {
  const displayName =
    readStringProperty(entry.manifest, "displayName") ??
    readStringProperty(entry.manifest, "name") ??
    humanizeIdentifier(entry.strategyId);

  return `${displayName} — Strategy Documentation`;
}

function createDocumentSummary(
  entry: StrategyLibraryEntry,
): string {
  const manifestDescription =
    readStringProperty(
      entry.manifest,
      "description",
    );

  if (
    manifestDescription !== undefined &&
    manifestDescription.trim().length > 0
  ) {
    return manifestDescription.trim();
  }

  return [
    `Strategy '${entry.strategyId}' version '${entry.strategyVersion}'`,
    `is classified as ${humanizeIdentifier(
      entry.family,
    ).toLowerCase()}`,
    `with ${humanizeIdentifier(
      entry.complexity,
    ).toLowerCase()} complexity,`,
    `${humanizeIdentifier(
      entry.status,
    ).toLowerCase()} operational status,`,
    `and ${humanizeIdentifier(
      entry.verificationStatus,
    ).toLowerCase()} verification status.`,
  ].join(" ");
}

function sortDocumentationReferences(
  references:
    readonly StrategyLibraryDocumentationReference[],
): readonly StrategyLibraryDocumentationReference[] {
  if (references.length === 0) {
    return EMPTY_REFERENCES;
  }

  return Object.freeze(
    [...references]
      .sort(compareDocumentationReferences)
      .map(immutableCopy),
  );
}

function compareDocumentationReferences(
  left: StrategyLibraryDocumentationReference,
  right: StrategyLibraryDocumentationReference,
): number {
  const leftType =
    ALL_DOCUMENTATION_CONTENT_TYPES.indexOf(
      left.contentType,
    );

  const rightType =
    ALL_DOCUMENTATION_CONTENT_TYPES.indexOf(
      right.contentType,
    );

  if (leftType !== rightType) {
    return leftType - rightType;
  }

  if (left.required !== right.required) {
    return left.required ? -1 : 1;
  }

  const titleOrder = left.title.localeCompare(
    right.title,
  );

  if (titleOrder !== 0) {
    return titleOrder;
  }

  return left.documentationId.localeCompare(
    right.documentationId,
  );
}

function compareIssues(
  left: StrategyLibraryDocumentationIssue,
  right: StrategyLibraryDocumentationIssue,
): number {
  const severityOrder:
    Readonly<
      Record<
        StrategyLibraryDocumentationIssueSeverity,
        number
      >
    > = Object.freeze({
    ERROR: 0,
    WARNING: 1,
    INFO: 2,
  });

  const severityDifference =
    severityOrder[left.severity] -
    severityOrder[right.severity];

  if (severityDifference !== 0) {
    return severityDifference;
  }

  const codeOrder = left.code.localeCompare(
    right.code,
  );

  if (codeOrder !== 0) {
    return codeOrder;
  }

  return left.message.localeCompare(
    right.message,
  );
}

function humanizeIdentifier(
  value: string,
): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    )
    .trim();
}

function isEmptyValue(
  value: unknown,
): boolean {
  if (
    value === undefined ||
    value === null
  ) {
    return true;
  }

  if (
    typeof value === "string" &&
    value.trim().length === 0
  ) {
    return true;
  }

  if (
    Array.isArray(value) &&
    value.length === 0
  ) {
    return true;
  }

  return false;
}

/* ============================================================================
 * Normalization and validation
 * ============================================================================
 */

function normalizeContentTypes(
  values:
    readonly StrategyLibraryDocumentationContentType[],
  field: string,
): readonly StrategyLibraryDocumentationContentType[] {
  if (!Array.isArray(values)) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be an array.`,
      {
        field,
      },
    );
  }

  const normalized:
    StrategyLibraryDocumentationContentType[] = [];

  const seen =
    new Set<StrategyLibraryDocumentationContentType>();

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const value = values[index];

    assertDocumentationContentType(
      value,
      `${field}[${index}]`,
    );

    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }

  normalized.sort(
    (left, right) =>
      ALL_DOCUMENTATION_CONTENT_TYPES.indexOf(left) -
      ALL_DOCUMENTATION_CONTENT_TYPES.indexOf(right),
  );

  return normalized.length === 0
    ? EMPTY_CONTENT_TYPES
    : Object.freeze(normalized);
}

function normalizeSectionTypes(
  values:
    readonly StrategyLibraryDocumentationSectionType[],
  field: string,
): readonly StrategyLibraryDocumentationSectionType[] {
  if (!Array.isArray(values)) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be an array.`,
      {
        field,
      },
    );
  }

  const normalized:
    StrategyLibraryDocumentationSectionType[] = [];

  const seen =
    new Set<StrategyLibraryDocumentationSectionType>();

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const value = values[index];

    assertSectionType(
      value,
      `${field}[${index}]`,
    );

    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }

  return Object.freeze(normalized);
}

function assertDocumentationContentType(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryDocumentationContentType {
  if (
    typeof value !== "string" ||
    !ALL_DOCUMENTATION_CONTENT_TYPES.includes(
      value as StrategyLibraryDocumentationContentType,
    )
  ) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a supported documentation content type.`,
      {
        field,
      },
    );
  }
}

function assertDocumentationFormat(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryDocumentationFormat {
  if (
    value !== "STRUCTURED" &&
    value !== "MARKDOWN" &&
    value !== "PLAIN_TEXT" &&
    value !== "JSON"
  ) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_FORMAT",
      `${field} must be STRUCTURED, MARKDOWN, PLAIN_TEXT, or JSON.`,
      {
        field,
      },
    );
  }
}

function assertSectionType(
  value: unknown,
  field: string,
): asserts value is StrategyLibraryDocumentationSectionType {
  if (
    typeof value !== "string" ||
    !ALL_SECTION_TYPES.includes(
      value as StrategyLibraryDocumentationSectionType,
    )
  ) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a supported documentation section type.`,
      {
        field,
      },
    );
  }
}

function assertRegistry(
  registry: StrategyLibraryRegistryPort,
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
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      "registry must implement StrategyLibraryRegistryPort.",
      {
        field: "registry",
      },
    );
  }
}

function assertOptions(
  options: StrategyLibraryDocumentationEngineOptions,
): void {
  if (!isRecord(options)) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }

  const booleanFields:
    readonly [
      keyof StrategyLibraryDocumentationEngineOptions,
      unknown,
    ][] = [
    [
      "includeMetadataSection",
      options.includeMetadataSection,
    ],
    [
      "includeEmptySections",
      options.includeEmptySections,
    ],
    [
      "includeOptionalDocumentationIssues",
      options.includeOptionalDocumentationIssues,
    ],
  ];

  for (const [field, value] of booleanFields) {
    if (
      value !== undefined &&
      typeof value !== "boolean"
    ) {
      throw new StrategyLibraryDocumentationEngineError(
        "INVALID_ARGUMENT",
        `options.${field} must be a boolean.`,
        {
          field: `options.${field}`,
        },
      );
    }
  }
}

function assertUnitInterval(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a finite number between 0 and 1.`,
      {
        field,
      },
    );
  }
}

function assertIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a safe integer between ${minimum} and ${maximum}.`,
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
    throw new StrategyLibraryDocumentationEngineError(
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
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a string.`,
      {
        field,
      },
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryDocumentationEngineError(
      "INVALID_ARGUMENT",
      `${field} must not be empty.`,
      {
        field,
      },
    );
  }

  return normalized;
}

function normalizeScore(
  value: number,
): number {
  assertUnitInterval(value, "score");
  return Number(value.toFixed(12));
}

function isStrategyLibraryEntry(
  value: unknown,
): value is StrategyLibraryEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.entryId === "string" &&
    typeof value.strategyId === "string" &&
    typeof value.strategyVersion === "string" &&
    isRecord(value.manifest) &&
    isRecord(value.operationalProfile) &&
    isRecord(value.riskProfile) &&
    isRecord(value.compatibilityProfile) &&
    Array.isArray(value.documentation)
  );
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
  throw new StrategyLibraryDocumentationEngineError(
    "INVALID_ARGUMENT",
    `Unsupported documentation value '${String(value)}'.`,
  );
}

/* ============================================================================
 * Safe property readers
 * ============================================================================
 */

function readRecordProperty(
  value: unknown,
  key: PropertyKey,
): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return value[key];
}

function readStringProperty(
  value: unknown,
  key: PropertyKey,
): string | undefined {
  const candidate = readRecordProperty(
    value,
    key,
  );

  return typeof candidate === "string"
    ? candidate
    : undefined;
}

/* ============================================================================
 * Stable serialization and checksum
 * ============================================================================
 */

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
      const key of Object.keys(value).sort()
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