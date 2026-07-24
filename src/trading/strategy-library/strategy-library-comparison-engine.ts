/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-comparison-engine.ts
 *
 * Purpose:
 * Provides deterministic, immutable, explainable comparison of two or more
 * Professional Trading Strategy Library entries.
 *
 * The engine compares:
 *
 * - identity and classification
 * - lifecycle and verification maturity
 * - operational characteristics
 * - risk profiles
 * - market and execution compatibility
 * - regime suitability
 * - data and indicator requirements
 * - performance expectations
 * - optional target-context compatibility
 *
 * This engine does not activate, configure, allocate, or execute strategies.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyMetadata,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  type StrategyLibraryComplexity,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryOperationalStatus,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRiskLevel,
  type StrategyLibraryVerificationStatus,
} from "./strategy-library-contracts";

import {
  StrategyLibraryCompatibilityEngine,
  type StrategyLibraryCompatibilityContext,
  type StrategyLibraryCompatibilityResult,
} from "./strategy-library-compatibility-engine";

/* ============================================================================
 * Errors
 * ============================================================================
 */

export type StrategyLibraryComparisonEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_REQUEST"
  | "ENTRY_NOT_FOUND"
  | "DUPLICATE_ENTRY"
  | "INSUFFICIENT_ENTRIES"
  | "COMPARISON_FAILED";

export interface StrategyLibraryComparisonEngineErrorDetails {
  readonly field?: string;
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryComparisonEngineError extends Error {
  public readonly code: StrategyLibraryComparisonEngineErrorCode;
  public readonly field?: string;
  public readonly entryId?: StrategyLibraryEntryId;
  public readonly strategyId?: StrategyId;
  public readonly strategyVersion?: StrategyVersion;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryComparisonEngineErrorCode,
    message: string,
    details: StrategyLibraryComparisonEngineErrorDetails = {},
  ) {
    super(message);

    this.name = "StrategyLibraryComparisonEngineError";
    this.code = code;
    this.field = details.field;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryComparisonEngineError.prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and options
 * ============================================================================
 */

export interface StrategyLibraryComparisonClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryComparisonWeights {
  readonly operationalReadiness: number;
  readonly verificationMaturity: number;
  readonly riskSuitability: number;
  readonly compatibilityBreadth: number;
  readonly regimeBreadth: number;
  readonly dataSimplicity: number;
  readonly indicatorSimplicity: number;
  readonly performanceConfidence: number;
  readonly targetCompatibility: number;
}

export interface StrategyLibraryComparisonEngineOptions {
  readonly clock?: StrategyLibraryComparisonClock;
  readonly compatibilityEngine?: StrategyLibraryCompatibilityEngine;
  readonly weights?: Partial<StrategyLibraryComparisonWeights>;
  readonly preferredMaximumRiskLevel?: StrategyLibraryRiskLevel;
  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Request contracts
 * ============================================================================
 */

export interface StrategyLibraryComparisonEntryReference {
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
}

export interface StrategyLibraryComparisonRequest {
  readonly entries:
    readonly (
      | StrategyLibraryEntry
      | StrategyLibraryComparisonEntryReference
    )[];

  readonly compatibilityContext?: StrategyLibraryCompatibilityContext;

  readonly preferredMaximumRiskLevel?: StrategyLibraryRiskLevel;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Comparison dimensions
 * ============================================================================
 */

export type StrategyLibraryComparisonDimension =
  | "OPERATIONAL_READINESS"
  | "VERIFICATION_MATURITY"
  | "RISK_SUITABILITY"
  | "COMPATIBILITY_BREADTH"
  | "REGIME_BREADTH"
  | "DATA_SIMPLICITY"
  | "INDICATOR_SIMPLICITY"
  | "PERFORMANCE_CONFIDENCE"
  | "TARGET_COMPATIBILITY";

export interface StrategyLibraryComparisonDimensionScore {
  readonly dimension: StrategyLibraryComparisonDimension;
  readonly applicable: boolean;
  readonly score: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly explanation: string;
}

/* ============================================================================
 * Difference contracts
 * ============================================================================
 */

export type StrategyLibraryComparisonDifferenceCategory =
  | "IDENTITY"
  | "CLASSIFICATION"
  | "LIFECYCLE"
  | "OPERATIONAL"
  | "RISK"
  | "COMPATIBILITY"
  | "REGIME"
  | "DATA_REQUIREMENT"
  | "INDICATOR_REQUIREMENT"
  | "PERFORMANCE_EXPECTATION";

export interface StrategyLibraryComparisonDifference {
  readonly category: StrategyLibraryComparisonDifferenceCategory;
  readonly field: string;
  readonly values: Readonly<Record<StrategyLibraryEntryId, unknown>>;
  readonly equivalent: boolean;
  readonly explanation: string;
}

/* ============================================================================
 * Strengths and cautions
 * ============================================================================
 */

export type StrategyLibraryComparisonObservationType =
  | "STRENGTH"
  | "CAUTION"
  | "NEUTRAL";

export interface StrategyLibraryComparisonObservation {
  readonly type: StrategyLibraryComparisonObservationType;
  readonly code: string;
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Entry result contracts
 * ============================================================================
 */

export interface StrategyLibraryComparisonEntryResult {
  readonly rank: number;
  readonly entry: StrategyLibraryEntry;
  readonly score: number;
  readonly scoreComponents:
    readonly StrategyLibraryComparisonDimensionScore[];
  readonly strengths:
    readonly StrategyLibraryComparisonObservation[];
  readonly cautions:
    readonly StrategyLibraryComparisonObservation[];
  readonly compatibility?: StrategyLibraryCompatibilityResult;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryComparisonResult {
  readonly request: StrategyLibraryComparisonRequest;
  readonly comparedEntries: readonly StrategyLibraryEntry[];
  readonly results: readonly StrategyLibraryComparisonEntryResult[];
  readonly differences: readonly StrategyLibraryComparisonDifference[];
  readonly bestOverall?: StrategyLibraryComparisonEntryResult;
  readonly bestByDimension:
    Readonly<
      Partial<
        Record<
          StrategyLibraryComparisonDimension,
          StrategyLibraryEntryId
        >
      >
    >;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface ComparisonCandidate {
  readonly entry: StrategyLibraryEntry;
  readonly score: number;
  readonly scoreComponents:
    readonly StrategyLibraryComparisonDimensionScore[];
  readonly strengths:
    readonly StrategyLibraryComparisonObservation[];
  readonly cautions:
    readonly StrategyLibraryComparisonObservation[];
  readonly compatibility?: StrategyLibraryCompatibilityResult;
}

interface NormalizedComparisonRequest {
  readonly source: StrategyLibraryComparisonRequest;
  readonly entries: readonly StrategyLibraryEntry[];
  readonly compatibilityContext?: StrategyLibraryCompatibilityContext;
  readonly preferredMaximumRiskLevel: StrategyLibraryRiskLevel;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_COMPARISON_CLOCK: StrategyLibraryComparisonClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const DEFAULT_COMPARISON_WEIGHTS: StrategyLibraryComparisonWeights =
  Object.freeze({
    operationalReadiness: 0.14,
    verificationMaturity: 0.14,
    riskSuitability: 0.14,
    compatibilityBreadth: 0.13,
    regimeBreadth: 0.1,
    dataSimplicity: 0.08,
    indicatorSimplicity: 0.07,
    performanceConfidence: 0.1,
    targetCompatibility: 0.1,
  });

const OPERATIONAL_STATUS_SCORE:
  Readonly<Record<StrategyLibraryOperationalStatus, number>> =
  Object.freeze({
    DRAFT: 0.1,
    EXPERIMENTAL: 0.25,
    BACKTEST_READY: 0.5,
    PAPER_READY: 0.7,
    LIVE_READY: 1,
    DEPRECATED: 0.1,
    RETIRED: 0,
  });

const VERIFICATION_SCORE:
  Readonly<Record<StrategyLibraryVerificationStatus, number>> =
  Object.freeze({
    UNVERIFIED: 0,
    VALIDATED: 0.25,
    BACKTESTED: 0.5,
    PAPER_VERIFIED: 0.7,
    LIVE_VERIFIED: 0.9,
    CERTIFIED: 1,
  });

const RISK_ORDER:
  Readonly<Record<StrategyLibraryRiskLevel, number>> =
  Object.freeze({
    VERY_LOW: 0,
    LOW: 1,
    MODERATE: 2,
    HIGH: 3,
    VERY_HIGH: 4,
  });

const COMPLEXITY_SCORE:
  Readonly<Record<StrategyLibraryComplexity, number>> =
  Object.freeze({
    BEGINNER: 1,
    BASIC: 0.9,
    INTERMEDIATE: 0.75,
    ADVANCED: 0.55,
    EXPERT: 0.3,
    INSTITUTIONAL: 0.2,
  });

const EMPTY_OBSERVATIONS:
  readonly StrategyLibraryComparisonObservation[] =
  Object.freeze([]);

const EMPTY_DIFFERENCES:
  readonly StrategyLibraryComparisonDifference[] =
  Object.freeze([]);

const EMPTY_COMPONENTS:
  readonly StrategyLibraryComparisonDimensionScore[] =
  Object.freeze([]);

/* ============================================================================
 * Engine
 * ============================================================================
 */

export class StrategyLibraryComparisonEngine {
  private readonly registry: StrategyLibraryRegistryPort;
  private readonly clock: StrategyLibraryComparisonClock;
  private readonly compatibilityEngine: StrategyLibraryCompatibilityEngine;
  private readonly weights: StrategyLibraryComparisonWeights;
  private readonly preferredMaximumRiskLevel: StrategyLibraryRiskLevel;
  private readonly metadata: StrategyMetadata;

  public constructor(
    registry: StrategyLibraryRegistryPort,
    options: StrategyLibraryComparisonEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    this.registry = registry;
    this.clock = options.clock ?? DEFAULT_COMPARISON_CLOCK;
    this.weights = normalizeWeights(options.weights);
    this.preferredMaximumRiskLevel =
      options.preferredMaximumRiskLevel ?? "MODERATE";
    this.metadata = immutableCopy(
      options.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    this.compatibilityEngine =
      options.compatibilityEngine ??
      new StrategyLibraryCompatibilityEngine(registry);

    assertTimestamp(this.clock.now(), "clock.now()");
  }

  public compare(
    request: StrategyLibraryComparisonRequest,
  ): StrategyLibraryComparisonResult {
    const normalized = this.normalizeRequest(request);

    try {
      const candidates = normalized.entries.map((entry) =>
        this.evaluateEntry(entry, normalized),
      );

      const ordered = [...candidates].sort(compareCandidates);
      const generatedAt = this.now();

      const results = ordered.map(
        (
          candidate,
          index,
        ): StrategyLibraryComparisonEntryResult =>
          deepFreeze({
            rank: index + 1,
            entry: candidate.entry,
            score: candidate.score,
            scoreComponents: candidate.scoreComponents,
            strengths: candidate.strengths,
            cautions: candidate.cautions,
            ...(candidate.compatibility === undefined
              ? {}
              : {
                  compatibility: candidate.compatibility,
                }),
            generatedAt,
            metadata: normalized.metadata,
          }),
      );

      const differences = this.buildDifferences(normalized.entries);
      const bestByDimension = this.resolveBestByDimension(results);

      return deepFreeze({
        request: immutableCopy(normalized.source),
        comparedEntries: normalized.entries,
        results: Object.freeze(results),
        differences,
        ...(results[0] === undefined
          ? {}
          : {
              bestOverall: results[0],
            }),
        bestByDimension,
        generatedAt,
        metadata: normalized.metadata,
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryComparisonEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryComparisonEngineError(
        "COMPARISON_FAILED",
        "Strategy-library comparison failed.",
        {
          cause,
          metadata: normalized.metadata,
        },
      );
    }
  }

  public compareEntries(
    entries: readonly StrategyLibraryEntry[],
    compatibilityContext?: StrategyLibraryCompatibilityContext,
  ): StrategyLibraryComparisonResult {
    return this.compare({
      entries,
      ...(compatibilityContext === undefined
        ? {}
        : { compatibilityContext }),
    });
  }

  public compareByStrategy(
    references: readonly StrategyLibraryComparisonEntryReference[],
    compatibilityContext?: StrategyLibraryCompatibilityContext,
  ): StrategyLibraryComparisonResult {
    return this.compare({
      entries: references,
      ...(compatibilityContext === undefined
        ? {}
        : { compatibilityContext }),
    });
  }

  public comparePair(
    left:
      | StrategyLibraryEntry
      | StrategyLibraryComparisonEntryReference,
    right:
      | StrategyLibraryEntry
      | StrategyLibraryComparisonEntryReference,
    compatibilityContext?: StrategyLibraryCompatibilityContext,
  ): StrategyLibraryComparisonResult {
    return this.compare({
      entries: Object.freeze([left, right]),
      ...(compatibilityContext === undefined
        ? {}
        : { compatibilityContext }),
    });
  }

  private normalizeRequest(
    request: StrategyLibraryComparisonRequest,
  ): NormalizedComparisonRequest {
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      throw new StrategyLibraryComparisonEngineError(
        "INVALID_REQUEST",
        "comparison request must be an object.",
        { field: "request" },
      );
    }

    if (!Array.isArray(request.entries)) {
      throw new StrategyLibraryComparisonEngineError(
        "INVALID_REQUEST",
        "request.entries must be an array.",
        { field: "request.entries" },
      );
    }

    if (request.entries.length < 2) {
      throw new StrategyLibraryComparisonEngineError(
        "INSUFFICIENT_ENTRIES",
        "At least two strategy-library entries are required for comparison.",
        { field: "request.entries" },
      );
    }

    const resolved = request.entries.map((value, index) =>
      this.resolveEntry(value, index),
    );

    const seen = new Set<StrategyLibraryEntryId>();

    for (const entry of resolved) {
      if (seen.has(entry.entryId)) {
        throw new StrategyLibraryComparisonEngineError(
          "DUPLICATE_ENTRY",
          `Strategy-library entry '${entry.entryId}' was supplied more than once.`,
          {
            field: "request.entries",
            entryId: entry.entryId,
          },
        );
      }

      seen.add(entry.entryId);
    }

    if (
      request.compatibilityContext !== undefined &&
      (
        typeof request.compatibilityContext !== "object" ||
        request.compatibilityContext === null ||
        Array.isArray(request.compatibilityContext)
      )
    ) {
      throw new StrategyLibraryComparisonEngineError(
        "INVALID_REQUEST",
        "request.compatibilityContext must be an object.",
        {
          field: "request.compatibilityContext",
        },
      );
    }

    return deepFreeze({
      source: immutableCopy(request),
      entries: Object.freeze(resolved),
      ...(request.compatibilityContext === undefined
        ? {}
        : {
            compatibilityContext: immutableCopy(
              request.compatibilityContext,
            ),
          }),
      preferredMaximumRiskLevel:
        request.preferredMaximumRiskLevel ??
        this.preferredMaximumRiskLevel,
      metadata: immutableCopy(
        request.metadata ?? this.metadata,
      ),
    });
  }

  private resolveEntry(
    value:
      | StrategyLibraryEntry
      | StrategyLibraryComparisonEntryReference,
    index: number,
  ): StrategyLibraryEntry {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      throw new StrategyLibraryComparisonEngineError(
        "INVALID_REQUEST",
        `request.entries[${index}] must be an entry or entry reference.`,
        {
          field: `request.entries[${index}]`,
        },
      );
    }

    if (isLibraryEntry(value)) {
      return value;
    }

    const reference =
      value as StrategyLibraryComparisonEntryReference;

    if (reference.entryId !== undefined) {
      const entryId = normalizeIdentifier(
        reference.entryId,
        `request.entries[${index}].entryId`,
      );

      const found = this.registry
        .list()
        .find((entry) => entry.entryId === entryId);

      if (found === undefined) {
        throw new StrategyLibraryComparisonEngineError(
          "ENTRY_NOT_FOUND",
          `No strategy-library entry was found for entryId '${entryId}'.`,
          {
            field: `request.entries[${index}].entryId`,
            entryId,
          },
        );
      }

      return found;
    }

    if (reference.strategyId === undefined) {
      throw new StrategyLibraryComparisonEngineError(
        "INVALID_REQUEST",
        `request.entries[${index}] must contain entryId or strategyId.`,
        {
          field: `request.entries[${index}]`,
        },
      );
    }

    const strategyId = normalizeIdentifier(
      reference.strategyId,
      `request.entries[${index}].strategyId`,
    );

    const strategyVersion =
      reference.strategyVersion === undefined
        ? undefined
        : normalizeIdentifier(
            reference.strategyVersion,
            `request.entries[${index}].strategyVersion`,
          );

    const found = this.registry.get(
      strategyId,
      strategyVersion,
    );

    if (found === undefined) {
      throw new StrategyLibraryComparisonEngineError(
        "ENTRY_NOT_FOUND",
        strategyVersion === undefined
          ? `No strategy-library entry was found for strategy '${strategyId}'.`
          : `No strategy-library entry was found for strategy '${strategyId}' version '${strategyVersion}'.`,
        {
          field: `request.entries[${index}]`,
          strategyId,
          strategyVersion,
        },
      );
    }

    return found;
  }

  private evaluateEntry(
    entry: StrategyLibraryEntry,
    request: NormalizedComparisonRequest,
  ): ComparisonCandidate {
    const components:
      StrategyLibraryComparisonDimensionScore[] = [];

    const strengths:
      StrategyLibraryComparisonObservation[] = [];

    const cautions:
      StrategyLibraryComparisonObservation[] = [];

    this.addOperationalReadiness(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addVerificationMaturity(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addRiskSuitability(
      entry,
      request,
      components,
      strengths,
      cautions,
    );

    this.addCompatibilityBreadth(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addRegimeBreadth(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addDataSimplicity(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addIndicatorSimplicity(
      entry,
      components,
      strengths,
      cautions,
    );

    this.addPerformanceConfidence(
      entry,
      components,
      strengths,
      cautions,
    );

    const compatibility =
      request.compatibilityContext === undefined
        ? undefined
        : this.compatibilityEngine.evaluate(
            entry,
            request.compatibilityContext,
          );

    this.addTargetCompatibility(
      compatibility,
      components,
      strengths,
      cautions,
    );

    const applicable = components.filter(
      (component) => component.applicable,
    );

    const totalWeight = applicable.reduce(
      (sum, component) => sum + component.weight,
      0,
    );

    const weightedScore = applicable.reduce(
      (sum, component) => sum + component.weightedScore,
      0,
    );

    const score =
      totalWeight === 0
        ? 0
        : normalizeScore(weightedScore / totalWeight);

    return deepFreeze({
      entry,
      score,
      scoreComponents:
        components.length === 0
          ? EMPTY_COMPONENTS
          : Object.freeze(components),
      strengths:
        strengths.length === 0
          ? EMPTY_OBSERVATIONS
          : Object.freeze(strengths),
      cautions:
        cautions.length === 0
          ? EMPTY_OBSERVATIONS
          : Object.freeze(cautions),
      ...(compatibility === undefined
        ? {}
        : { compatibility }),
    });
  }

  private addOperationalReadiness(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const score =
      OPERATIONAL_STATUS_SCORE[entry.status];

    components.push(
      createComponent(
        "OPERATIONAL_READINESS",
        score,
        this.weights.operationalReadiness,
        true,
        `Operational status '${entry.status}' maps to score ${score}.`,
      ),
    );

    if (entry.status === "LIVE_READY") {
      strengths.push(
        createObservation(
          "STRENGTH",
          "LIVE_READY",
          "The strategy is classified as live ready.",
          this.metadata,
        ),
      );
    }

    if (
      entry.status === "DEPRECATED" ||
      entry.status === "RETIRED"
    ) {
      cautions.push(
        createObservation(
          "CAUTION",
          "NON_ACTIVE_LIFECYCLE",
          `The strategy lifecycle status is '${entry.status}'.`,
          this.metadata,
        ),
      );
    }
  }

  private addVerificationMaturity(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const score =
      VERIFICATION_SCORE[
        entry.verificationStatus
      ];

    components.push(
      createComponent(
        "VERIFICATION_MATURITY",
        score,
        this.weights.verificationMaturity,
        true,
        `Verification status '${entry.verificationStatus}' maps to score ${score}.`,
      ),
    );

    if (
      entry.verificationStatus === "LIVE_VERIFIED" ||
      entry.verificationStatus === "CERTIFIED"
    ) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "HIGH_VERIFICATION",
          `Verification maturity is '${entry.verificationStatus}'.`,
          this.metadata,
        ),
      );
    }

    if (
      entry.verificationStatus ===
      "UNVERIFIED"
    ) {
      cautions.push(
        createObservation(
          "CAUTION",
          "UNVERIFIED",
          "The strategy has not completed library verification.",
          this.metadata,
        ),
      );
    }
  }

  private addRiskSuitability(
    entry: StrategyLibraryEntry,
    request: NormalizedComparisonRequest,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const actual =
      RISK_ORDER[
        entry.riskProfile.overallRiskLevel
      ];

    const maximum =
      RISK_ORDER[
        request.preferredMaximumRiskLevel
      ];

    const compatible =
      actual <= maximum;

    const distance =
      Math.abs(actual - maximum);

    const score = compatible
      ? normalizeScore(
          1 - distance * 0.1,
        )
      : normalizeScore(
          Math.max(
            0,
            0.5 - distance * 0.2,
          ),
        );

    components.push(
      createComponent(
        "RISK_SUITABILITY",
        score,
        this.weights.riskSuitability,
        true,
        compatible
          ? `Risk level '${entry.riskProfile.overallRiskLevel}' is within the preferred maximum '${request.preferredMaximumRiskLevel}'.`
          : `Risk level '${entry.riskProfile.overallRiskLevel}' exceeds the preferred maximum '${request.preferredMaximumRiskLevel}'.`,
      ),
    );

    if (compatible) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "RISK_WITHIN_PREFERENCE",
          `Overall risk '${entry.riskProfile.overallRiskLevel}' is within the preferred limit.`,
          this.metadata,
        ),
      );
    } else {
      cautions.push(
        createObservation(
          "CAUTION",
          "RISK_ABOVE_PREFERENCE",
          `Overall risk '${entry.riskProfile.overallRiskLevel}' exceeds the preferred limit.`,
          this.metadata,
        ),
      );
    }

    for (
      const warning of
      entry.riskProfile.warnings
    ) {
      cautions.push(
        createObservation(
          "CAUTION",
          "RISK_PROFILE_WARNING",
          warning,
          this.metadata,
        ),
      );
    }
  }

  private addCompatibilityBreadth(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    _cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const profile =
      entry.compatibilityProfile;

    const marketBreadth =
      clampUnit(
        profile.marketTypes.length / 5,
      );

    const modeBreadth =
      clampUnit(
        profile.tradingModes.length / 4,
      );

    const environmentBreadth =
      clampUnit(
        profile.environments.length / 4,
      );

    const supportedTimeframes =
      profile.timeframes.filter(
        (timeframe) =>
          timeframe.supported,
      ).length;

    const timeframeBreadth =
      clampUnit(
        supportedTimeframes / 8,
      );

    const score =
      normalizeScore(
        (
          marketBreadth +
          modeBreadth +
          environmentBreadth +
          timeframeBreadth
        ) / 4,
      );

    components.push(
      createComponent(
        "COMPATIBILITY_BREADTH",
        score,
        this.weights.compatibilityBreadth,
        true,
        `Compatibility breadth includes ${profile.marketTypes.length} market types, ${profile.tradingModes.length} trading modes, ${profile.environments.length} environments, and ${supportedTimeframes} supported timeframes.`,
      ),
    );

    if (score >= 0.75) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "BROAD_COMPATIBILITY",
          "The strategy has broad market and execution compatibility.",
          this.metadata,
        ),
      );
    }
  }

  private addRegimeBreadth(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    if (
      entry.regimeProfiles.length === 0
    ) {
      components.push(
        createComponent(
          "REGIME_BREADTH",
          0,
          this.weights.regimeBreadth,
          true,
          "No market-regime profiles are defined.",
        ),
      );

      cautions.push(
        createObservation(
          "CAUTION",
          "NO_REGIME_PROFILES",
          "The strategy has no explicit market-regime profiles.",
          this.metadata,
        ),
      );

      return;
    }

    const positive =
      entry.regimeProfiles.filter(
        (profile) =>
          profile.compatibility ===
            "PREFERRED" ||
          profile.compatibility ===
            "SUPPORTED",
      );

    const unsupported =
      entry.regimeProfiles.filter(
        (profile) =>
          profile.compatibility ===
          "UNSUPPORTED",
      );

    const score =
      normalizeScore(
        positive.reduce(
          (sum, profile) =>
            sum + profile.score,
          0,
        ) /
          entry.regimeProfiles.length,
      );

    components.push(
      createComponent(
        "REGIME_BREADTH",
        score,
        this.weights.regimeBreadth,
        true,
        `${positive.length} of ${entry.regimeProfiles.length} regime profiles are preferred or supported.`,
      ),
    );

    if (positive.length >= 3) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "MULTI_REGIME_SUPPORT",
          `The strategy supports ${positive.length} positive market regimes.`,
          this.metadata,
        ),
      );
    }

    if (unsupported.length > 0) {
      cautions.push(
        createObservation(
          "CAUTION",
          "UNSUPPORTED_REGIMES",
          `The strategy is unsupported in ${unsupported.length} defined market regimes.`,
          this.metadata,
        ),
      );
    }
  }

  private addDataSimplicity(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const required =
      entry.dataRequirements.filter(
        (requirement) =>
          requirement.required,
      );

    const score =
      normalizeScore(
        1 -
          Math.min(
            required.length,
            10,
          ) /
            10,
      );

    components.push(
      createComponent(
        "DATA_SIMPLICITY",
        score,
        this.weights.dataSimplicity,
        true,
        `${required.length} mandatory data requirements are defined.`,
      ),
    );

    if (required.length <= 2) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "SIMPLE_DATA_REQUIREMENTS",
          "The strategy has a relatively small mandatory data footprint.",
          this.metadata,
        ),
      );
    }

    if (required.length >= 7) {
      cautions.push(
        createObservation(
          "CAUTION",
          "COMPLEX_DATA_REQUIREMENTS",
          "The strategy depends on a large number of mandatory data sources.",
          this.metadata,
        ),
      );
    }
  }

  private addIndicatorSimplicity(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const required =
      entry.indicatorRequirements.filter(
        (requirement) =>
          requirement.required,
      );

    const complexityBase =
      COMPLEXITY_SCORE[
        entry.complexity
      ];

    const requirementScore =
      1 -
      Math.min(
        required.length,
        12,
      ) /
        12;

    const score =
      normalizeScore(
        (
          complexityBase +
          requirementScore
        ) / 2,
      );

    components.push(
      createComponent(
        "INDICATOR_SIMPLICITY",
        score,
        this.weights.indicatorSimplicity,
        true,
        `Complexity '${entry.complexity}' and ${required.length} required indicators produce simplicity score ${score}.`,
      ),
    );

    if (score >= 0.75) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "LOW_IMPLEMENTATION_COMPLEXITY",
          "The strategy has comparatively simple indicator requirements.",
          this.metadata,
        ),
      );
    }

    if (score <= 0.35) {
      cautions.push(
        createObservation(
          "CAUTION",
          "HIGH_IMPLEMENTATION_COMPLEXITY",
          "The strategy has comparatively complex indicator requirements.",
          this.metadata,
        ),
      );
    }
  }

  private addPerformanceConfidence(
    entry: StrategyLibraryEntry,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    const expectations =
      entry.performanceExpectations;

    if (expectations.length === 0) {
      components.push(
        createComponent(
          "PERFORMANCE_CONFIDENCE",
          0.25,
          this.weights.performanceConfidence,
          true,
          "No explicit performance expectations are defined.",
        ),
      );

      cautions.push(
        createObservation(
          "CAUTION",
          "NO_PERFORMANCE_EXPECTATIONS",
          "The strategy has no explicit performance expectation records.",
          this.metadata,
        ),
      );

      return;
    }

    const confidence =
      normalizeScore(
        Math.min(
          1,
          expectations.length / 5,
        ),
      );

    components.push(
      createComponent(
        "PERFORMANCE_CONFIDENCE",
        confidence,
        this.weights.performanceConfidence,
        true,
        `${expectations.length} performance expectation records are defined.`,
      ),
    );

    if (
      expectations.length >= 3
    ) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "DOCUMENTED_PERFORMANCE_EXPECTATIONS",
          "The strategy has multiple documented performance expectations.",
          this.metadata,
        ),
      );
    }
  }

  private addTargetCompatibility(
    compatibility:
      | StrategyLibraryCompatibilityResult
      | undefined,
    components: StrategyLibraryComparisonDimensionScore[],
    strengths: StrategyLibraryComparisonObservation[],
    cautions: StrategyLibraryComparisonObservation[],
  ): void {
    if (
      compatibility === undefined
    ) {
      components.push(
        createComponent(
          "TARGET_COMPATIBILITY",
          1,
          this.weights.targetCompatibility,
          false,
          "No target compatibility context was supplied.",
        ),
      );

      return;
    }

    components.push(
      createComponent(
        "TARGET_COMPATIBILITY",
        compatibility.score,
        this.weights.targetCompatibility,
        true,
        compatibility.compatible
          ? "The strategy is compatible with the supplied target context."
          : "The strategy has incompatibilities with the supplied target context.",
      ),
    );

    if (
      compatibility.compatible
    ) {
      strengths.push(
        createObservation(
          "STRENGTH",
          "TARGET_CONTEXT_COMPATIBLE",
          "All blocking target-context compatibility checks passed.",
          this.metadata,
        ),
      );
    } else {
      const blocking =
        compatibility.issues.filter(
          (issue) =>
            issue.blocking,
        );

      cautions.push(
        createObservation(
          "CAUTION",
          "TARGET_CONTEXT_INCOMPATIBLE",
          blocking.length === 0
            ? "The target compatibility score did not satisfy the configured threshold."
            : `${blocking.length} blocking target-context compatibility issues were found.`,
          this.metadata,
        ),
      );
    }
  }

  private buildDifferences(
    entries: readonly StrategyLibraryEntry[],
  ): readonly StrategyLibraryComparisonDifference[] {
    const differences:
      StrategyLibraryComparisonDifference[] =
      [];

    differences.push(
      buildDifference(
        entries,
        "IDENTITY",
        "strategyVersion",
        (entry) =>
          entry.strategyVersion,
        "Strategy versions are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "CLASSIFICATION",
        "family",
        (entry) => entry.family,
        "Primary strategy families are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "CLASSIFICATION",
        "complexity",
        (entry) =>
          entry.complexity,
        "Strategy complexity levels are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "LIFECYCLE",
        "status",
        (entry) => entry.status,
        "Operational lifecycle statuses are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "LIFECYCLE",
        "verificationStatus",
        (entry) =>
          entry.verificationStatus,
        "Verification maturity is compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "OPERATIONAL",
        "holdingPeriod",
        (entry) =>
          entry.operationalProfile
            .holdingPeriod,
        "Expected holding periods are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "OPERATIONAL",
        "frequency",
        (entry) =>
          entry.operationalProfile
            .frequency,
        "Expected strategy frequencies are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "OPERATIONAL",
        "directionality",
        (entry) =>
          entry.operationalProfile
            .directionality,
        "Strategy directional behavior is compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "RISK",
        "overallRiskLevel",
        (entry) =>
          entry.riskProfile
            .overallRiskLevel,
        "Overall risk levels are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "RISK",
        "maximumRecommendedLeverage",
        (entry) =>
          entry.riskProfile
            .maximumRecommendedLeverage,
        "Maximum recommended leverage is compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "RISK",
        "maximumRecommendedCapitalFraction",
        (entry) =>
          entry.riskProfile
            .maximumRecommendedCapitalFraction,
        "Maximum recommended capital fractions are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "COMPATIBILITY",
        "marketTypes",
        (entry) =>
          [
            ...entry
              .compatibilityProfile
              .marketTypes,
          ].sort(),
        "Supported market types are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "COMPATIBILITY",
        "tradingModes",
        (entry) =>
          [
            ...entry
              .compatibilityProfile
              .tradingModes,
          ].sort(),
        "Supported trading modes are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "COMPATIBILITY",
        "environments",
        (entry) =>
          [
            ...entry
              .compatibilityProfile
              .environments,
          ].sort(),
        "Supported execution environments are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "REGIME",
        "preferredRegimes",
        (entry) =>
          entry.regimeProfiles
            .filter(
              (profile) =>
                profile.compatibility ===
                "PREFERRED",
            )
            .map(
              (profile) =>
                profile.regime,
            )
            .sort(),
        "Preferred market regimes are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "DATA_REQUIREMENT",
        "requiredDataTypes",
        (entry) =>
          entry.dataRequirements
            .filter(
              (requirement) =>
                requirement.required,
            )
            .map(
              (requirement) =>
                requirement.type,
            )
            .sort(),
        "Mandatory data requirements are compared.",
      ),
    );

    differences.push(
      buildDifference(
        entries,
        "INDICATOR_REQUIREMENT",
        "requiredIndicators",
        (entry) =>
          entry.indicatorRequirements
            .filter(
              (requirement) =>
                requirement.required,
            )
            .map(
              (requirement) =>
                requirement.indicatorId,
            )
            .sort(),
        "Mandatory indicator requirements are compared.",
      ),
    );

    return differences.length === 0
      ? EMPTY_DIFFERENCES
      : Object.freeze(differences);
  }

  private resolveBestByDimension(
    results:
      readonly StrategyLibraryComparisonEntryResult[],
  ): Readonly<
    Partial<
      Record<
        StrategyLibraryComparisonDimension,
        StrategyLibraryEntryId
      >
    >
  > {
    const dimensions:
      readonly StrategyLibraryComparisonDimension[] =
      Object.freeze([
        "OPERATIONAL_READINESS",
        "VERIFICATION_MATURITY",
        "RISK_SUITABILITY",
        "COMPATIBILITY_BREADTH",
        "REGIME_BREADTH",
        "DATA_SIMPLICITY",
        "INDICATOR_SIMPLICITY",
        "PERFORMANCE_CONFIDENCE",
        "TARGET_COMPATIBILITY",
      ]);

    const winners:
      Partial<
        Record<
          StrategyLibraryComparisonDimension,
          StrategyLibraryEntryId
        >
      > = {};

    for (
      const dimension of dimensions
    ) {
      const ranked = results
        .map((result) => ({
          result,
          component:
            result.scoreComponents.find(
              (component) =>
                component.dimension ===
                  dimension &&
                component.applicable,
            ),
        }))
        .filter(
          (
            value,
          ): value is {
            readonly result:
              StrategyLibraryComparisonEntryResult;
            readonly component:
              StrategyLibraryComparisonDimensionScore;
          } =>
            value.component !==
            undefined,
        )
        .sort((left, right) => {
          if (
            left.component.score !==
            right.component.score
          ) {
            return (
              right.component.score -
              left.component.score
            );
          }

          return left.result.entry.entryId.localeCompare(
            right.result.entry.entryId,
          );
        });

      const winner = ranked[0];

      if (winner !== undefined) {
        winners[dimension] =
          winner.result.entry.entryId;
      }
    }

    return Object.freeze(winners);
  }

  private now():
    UnixTimestampMilliseconds {
    const timestamp =
      this.clock.now();

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

export function createStrategyLibraryComparisonEngine(
  registry: StrategyLibraryRegistryPort,
  options: StrategyLibraryComparisonEngineOptions = {},
): StrategyLibraryComparisonEngine {
  return new StrategyLibraryComparisonEngine(
    registry,
    options,
  );
}

/* ============================================================================
 * Construction helpers
 * ============================================================================
 */

function createComponent(
  dimension:
    StrategyLibraryComparisonDimension,
  score: number,
  weight: number,
  applicable: boolean,
  explanation: string,
): StrategyLibraryComparisonDimensionScore {
  assertUnitScore(
    score,
    "component.score",
  );

  assertFiniteNonNegativeNumber(
    weight,
    "component.weight",
  );

  return deepFreeze({
    dimension,
    applicable,
    score:
      normalizeScore(score),
    weight:
      normalizeNumber(weight),
    weightedScore:
      normalizeNumber(
        applicable
          ? score * weight
          : 0,
      ),
    explanation,
  });
}

function createObservation(
  type:
    StrategyLibraryComparisonObservationType,
  code: string,
  message: string,
  metadata: StrategyMetadata,
): StrategyLibraryComparisonObservation {
  return deepFreeze({
    type,
    code,
    message,
    metadata,
  });
}

function buildDifference(
  entries:
    readonly StrategyLibraryEntry[],
  category:
    StrategyLibraryComparisonDifferenceCategory,
  field: string,
  selector:
    (
      entry: StrategyLibraryEntry,
    ) => unknown,
  explanation: string,
): StrategyLibraryComparisonDifference {
  const values:
    Record<
      StrategyLibraryEntryId,
      unknown
    > = {};

  for (const entry of entries) {
    values[entry.entryId] =
      immutableCopy(
        selector(entry),
      );
  }

  const serialized =
    Object.values(values).map(
      stableSerialize,
    );

  const equivalent =
    serialized.every(
      (value) =>
        value === serialized[0],
    );

  return deepFreeze({
    category,
    field,
    values:
      Object.freeze(values),
    equivalent,
    explanation,
  });
}

/* ============================================================================
 * Comparison helpers
 * ============================================================================
 */

function compareCandidates(
  left: ComparisonCandidate,
  right: ComparisonCandidate,
): number {
  if (
    left.score !== right.score
  ) {
    return (
      right.score - left.score
    );
  }

  const verificationDifference =
    VERIFICATION_SCORE[
      right.entry.verificationStatus
    ] -
    VERIFICATION_SCORE[
      left.entry.verificationStatus
    ];

  if (
    verificationDifference !== 0
  ) {
    return verificationDifference;
  }

  const readinessDifference =
    OPERATIONAL_STATUS_SCORE[
      right.entry.status
    ] -
    OPERATIONAL_STATUS_SCORE[
      left.entry.status
    ];

  if (
    readinessDifference !== 0
  ) {
    return readinessDifference;
  }

  const riskDifference =
    RISK_ORDER[
      left.entry.riskProfile
        .overallRiskLevel
    ] -
    RISK_ORDER[
      right.entry.riskProfile
        .overallRiskLevel
    ];

  if (riskDifference !== 0) {
    return riskDifference;
  }

  const strategyOrder =
    left.entry.strategyId.localeCompare(
      right.entry.strategyId,
    );

  if (strategyOrder !== 0) {
    return strategyOrder;
  }

  const versionOrder =
    left.entry.strategyVersion.localeCompare(
      right.entry.strategyVersion,
    );

  if (versionOrder !== 0) {
    return versionOrder;
  }

  return left.entry.entryId.localeCompare(
    right.entry.entryId,
  );
}

/* ============================================================================
 * Normalization and validation
 * ============================================================================
 */

function normalizeWeights(
  weights:
    | Partial<StrategyLibraryComparisonWeights>
    | undefined,
): StrategyLibraryComparisonWeights {
  if (
    weights !== undefined &&
    (
      typeof weights !== "object" ||
      weights === null ||
      Array.isArray(weights)
    )
  ) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      "options.weights must be an object.",
      {
        field: "options.weights",
      },
    );
  }

  const normalized:
    StrategyLibraryComparisonWeights = {
    ...DEFAULT_COMPARISON_WEIGHTS,
    ...weights,
  };

  let total = 0;

  for (
    const [
      key,
      value,
    ] of Object.entries(normalized)
  ) {
    assertFiniteNonNegativeNumber(
      value,
      `options.weights.${key}`,
    );

    total += value;
  }

  if (total <= 0) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      "At least one comparison weight must be greater than zero.",
      {
        field: "options.weights",
      },
    );
  }

  return Object.freeze(normalized);
}

function normalizeIdentifier(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a string.`,
      { field },
    );
  }

  const normalized =
    value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      `${field} must not be empty.`,
      { field },
    );
  }

  return normalized;
}

function normalizeScore(
  value: number,
): number {
  assertUnitScore(
    value,
    "score",
  );

  return Number(
    value.toFixed(12),
  );
}

function normalizeNumber(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      "calculated value must be finite.",
    );
  }

  return Number(
    value.toFixed(12),
  );
}

function clampUnit(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      "value must be finite.",
    );
  }

  return Math.min(
    1,
    Math.max(0, value),
  );
}

function isLibraryEntry(
  value:
    | StrategyLibraryEntry
    | StrategyLibraryComparisonEntryReference,
): value is StrategyLibraryEntry {
  const candidate =
    value as Partial<StrategyLibraryEntry>;

  return (
    typeof candidate.entryId ===
      "string" &&
    typeof candidate.strategyId ===
      "string" &&
    typeof candidate.strategyVersion ===
      "string" &&
    typeof candidate.manifest ===
      "object" &&
    candidate.manifest !== null &&
    typeof candidate.operationalProfile ===
      "object" &&
    candidate.operationalProfile !==
      null &&
    typeof candidate.riskProfile ===
      "object" &&
    candidate.riskProfile !== null &&
    typeof candidate.compatibilityProfile ===
      "object" &&
    candidate.compatibilityProfile !==
      null
  );
}

function assertRegistry(
  registry:
    StrategyLibraryRegistryPort,
): void {
  if (
    typeof registry !== "object" ||
    registry === null ||
    typeof registry.register !==
      "function" ||
    typeof registry.registerMany !==
      "function" ||
    typeof registry.unregister !==
      "function" ||
    typeof registry.has !==
      "function" ||
    typeof registry.get !==
      "function" ||
    typeof registry.list !==
      "function" ||
    typeof registry.query !==
      "function" ||
    typeof registry.snapshot !==
      "function"
  ) {
    throw new StrategyLibraryComparisonEngineError(
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
    StrategyLibraryComparisonEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }
}

function assertUnitScore(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }
}

function assertFiniteNonNegativeNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a finite non-negative number.`,
      { field },
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
    throw new StrategyLibraryComparisonEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer timestamp.`,
      { field },
    );
  }
}

/* ============================================================================
 * Serialization and immutability
 * ============================================================================
 */

function stableSerialize(
  value: unknown,
): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableSerialize)
      .join(",")}]`;
  }

  if (
    typeof value === "object"
  ) {
    const record =
      value as Record<
        string,
        unknown
      >;

    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(
            key,
          )}:${stableSerialize(
            record[key],
          )}`,
      )
      .join(",")}}`;
  }

  return (
    JSON.stringify(value) ??
    String(value)
  );
}

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
      (item) =>
        cloneValue(item),
    ) as unknown as T;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const clone:
      Record<PropertyKey, unknown> = {};

    for (
      const key of Reflect.ownKeys(value)
    ) {
      clone[key] =
        cloneValue(
          (
            value as Record<
              PropertyKey,
              unknown
            >
          )[key],
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