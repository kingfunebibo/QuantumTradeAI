/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-recommendation-engine.ts
 *
 * Purpose:
 * Produces deterministic, immutable, explainable strategy-library
 * recommendations by combining:
 *
 * - structured library discovery
 * - full-text search relevance
 * - environment compatibility
 * - operational readiness
 * - verification maturity
 * - risk suitability
 * - market-regime suitability
 * - user-defined preference weights
 *
 * This engine recommends strategy-library entries only. It does not create,
 * configure, activate, allocate capital to, or execute trading strategies.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  EMPTY_STRATEGY_LIBRARY_ENTRIES,
  STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT,
  STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT,
  type StrategyLibraryComplexity,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryFamily,
  type StrategyLibraryOperationalStatus,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRiskLevel,
  type StrategyLibraryVerificationStatus,
} from "./strategy-library-contracts";

import {
  StrategyLibrarySearchEngine,
  type StrategyLibrarySearchEngineOptions,
  type StrategyLibrarySearchHit,
  type StrategyLibrarySearchRequest,
} from "./strategy-library-search-engine";

import {
  StrategyLibraryCompatibilityEngine,
  type StrategyLibraryCompatibilityContext,
  type StrategyLibraryCompatibilityEngineOptions,
  type StrategyLibraryCompatibilityIssue,
  type StrategyLibraryCompatibilityResult,
} from "./strategy-library-compatibility-engine";

/* ============================================================================
 * Error contracts
 * ============================================================================
 */

export type StrategyLibraryRecommendationEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_REQUEST"
  | "INVALID_WEIGHT"
  | "INVALID_SCORE"
  | "RECOMMENDATION_FAILED";

export interface StrategyLibraryRecommendationEngineErrorDetails {
  readonly field?: string;
  readonly entryId?: StrategyLibraryEntryId;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryRecommendationEngineError extends Error {
  public readonly code:
    StrategyLibraryRecommendationEngineErrorCode;

  public readonly field?: string;

  public readonly entryId?:
    StrategyLibraryEntryId;

  public readonly cause?: unknown;

  public readonly metadata:
    StrategyMetadata;

  public constructor(
    code:
      StrategyLibraryRecommendationEngineErrorCode,
    message: string,
    details:
      StrategyLibraryRecommendationEngineErrorDetails = {},
  ) {
    super(message);

    this.name =
      "StrategyLibraryRecommendationEngineError";

    this.code = code;
    this.field = details.field;
    this.entryId = details.entryId;
    this.cause = details.cause;

    this.metadata = immutableCopy(
      details.metadata ??
        EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryRecommendationEngineError
        .prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and dependency contracts
 * ============================================================================
 */

export interface StrategyLibraryRecommendationClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryRecommendationEngineDependencies {
  readonly registry:
    StrategyLibraryRegistryPort;

  readonly searchEngine?:
    StrategyLibrarySearchEngine;

  readonly compatibilityEngine?:
    StrategyLibraryCompatibilityEngine;

  readonly clock?:
    StrategyLibraryRecommendationClock;
}

/* ============================================================================
 * Weight and option contracts
 * ============================================================================
 */

export interface StrategyLibraryRecommendationWeights {
  readonly searchRelevance: number;
  readonly compatibility: number;
  readonly operationalReadiness: number;
  readonly verification: number;
  readonly riskSuitability: number;
  readonly regimeSuitability: number;
  readonly complexitySuitability: number;
  readonly preferenceMatch: number;
}

export interface StrategyLibraryRecommendationEngineOptions {
  readonly defaultLimit?: number;
  readonly maximumLimit?: number;
  readonly minimumRecommendationScore?: number;
  readonly includeIncompatibleByDefault?: boolean;
  readonly requirePositiveCompatibility?: boolean;
  readonly searchEngineOptions?:
    StrategyLibrarySearchEngineOptions;
  readonly compatibilityEngineOptions?:
    StrategyLibraryCompatibilityEngineOptions;
  readonly weights?:
    Partial<StrategyLibraryRecommendationWeights>;
  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Preference contracts
 * ============================================================================
 */

export interface StrategyLibraryRecommendationPreferences {
  readonly preferredFamilies?:
    readonly StrategyLibraryFamily[];

  readonly excludedFamilies?:
    readonly StrategyLibraryFamily[];

  readonly preferredComplexities?:
    readonly StrategyLibraryComplexity[];

  readonly preferredRiskLevels?:
    readonly StrategyLibraryRiskLevel[];

  readonly preferredStatuses?:
    readonly StrategyLibraryOperationalStatus[];

  readonly preferredVerificationStatuses?:
    readonly StrategyLibraryVerificationStatus[];

  readonly preferredTags?:
    readonly string[];

  readonly excludedTags?:
    readonly string[];

  readonly preferLiveReady?: boolean;

  readonly preferCertified?: boolean;

  readonly preferLowerRisk?: boolean;

  readonly preferDeterministicReplay?: boolean;
}

/* ============================================================================
 * Request contracts
 * ============================================================================
 */

export interface StrategyLibraryRecommendationRequest {
  readonly search?:
    StrategyLibrarySearchRequest;

  readonly compatibility:
    StrategyLibraryCompatibilityContext;

  readonly preferences?:
    StrategyLibraryRecommendationPreferences;

  readonly includeIncompatible?: boolean;

  readonly minimumScore?: number;

  readonly offset?: number;

  readonly limit?: number;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Score contracts
 * ============================================================================
 */

export type StrategyLibraryRecommendationDimension =
  | "SEARCH_RELEVANCE"
  | "COMPATIBILITY"
  | "OPERATIONAL_READINESS"
  | "VERIFICATION"
  | "RISK_SUITABILITY"
  | "REGIME_SUITABILITY"
  | "COMPLEXITY_SUITABILITY"
  | "PREFERENCE_MATCH";

export interface StrategyLibraryRecommendationScoreComponent {
  readonly dimension:
    StrategyLibraryRecommendationDimension;

  readonly score: number;

  readonly weight: number;

  readonly weightedScore: number;

  readonly applicable: boolean;

  readonly explanation: string;
}

/* ============================================================================
 * Recommendation contracts
 * ============================================================================
 */

export type StrategyLibraryRecommendationDisposition =
  | "RECOMMENDED"
  | "CONDITIONALLY_RECOMMENDED"
  | "NOT_RECOMMENDED";

export type StrategyLibraryRecommendationReasonCode =
  | "SEARCH_MATCH"
  | "FULLY_COMPATIBLE"
  | "PARTIALLY_COMPATIBLE"
  | "INCOMPATIBLE"
  | "LIVE_READY"
  | "HIGH_VERIFICATION"
  | "RISK_MATCH"
  | "REGIME_MATCH"
  | "COMPLEXITY_MATCH"
  | "PREFERENCE_MATCH"
  | "EXCLUDED_FAMILY"
  | "EXCLUDED_TAG"
  | "BELOW_MINIMUM_SCORE";

export interface StrategyLibraryRecommendationReason {
  readonly code:
    StrategyLibraryRecommendationReasonCode;

  readonly positive: boolean;

  readonly message: string;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryRecommendation {
  readonly rank: number;

  readonly entry:
    StrategyLibraryEntry;

  readonly disposition:
    StrategyLibraryRecommendationDisposition;

  readonly score: number;

  readonly scoreComponents:
    readonly StrategyLibraryRecommendationScoreComponent[];

  readonly reasons:
    readonly StrategyLibraryRecommendationReason[];

  readonly compatibility:
    StrategyLibraryCompatibilityResult;

  readonly searchHit?:
    StrategyLibrarySearchHit;

  readonly recommendedCapitalFractionMaximum:
    number;

  readonly recommendedLeverageMaximum:
    number;

  readonly generatedAt:
    UnixTimestampMilliseconds;

  readonly metadata:
    StrategyMetadata;
}

export interface StrategyLibraryRecommendationResult {
  readonly request:
    StrategyLibraryRecommendationRequest;

  readonly totalCandidates: number;

  readonly totalRecommended: number;

  readonly offset: number;

  readonly limit: number;

  readonly recommendations:
    readonly StrategyLibraryRecommendation[];

  readonly entries:
    readonly StrategyLibraryEntry[];

  readonly generatedAt:
    UnixTimestampMilliseconds;

  readonly metadata:
    StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface NormalizedRecommendationRequest {
  readonly source:
    StrategyLibraryRecommendationRequest;

  readonly search:
    StrategyLibrarySearchRequest;

  readonly compatibility:
    StrategyLibraryCompatibilityContext;

  readonly preferences:
    StrategyLibraryRecommendationPreferences;

  readonly includeIncompatible: boolean;

  readonly minimumScore: number;

  readonly offset: number;

  readonly limit: number;

  readonly metadata:
    StrategyMetadata;
}

interface RecommendationCandidate {
  readonly entry:
    StrategyLibraryEntry;

  readonly searchHit?:
    StrategyLibrarySearchHit;

  readonly compatibility:
    StrategyLibraryCompatibilityResult;

  readonly score: number;

  readonly disposition:
    StrategyLibraryRecommendationDisposition;

  readonly scoreComponents:
    readonly StrategyLibraryRecommendationScoreComponent[];

  readonly reasons:
    readonly StrategyLibraryRecommendationReason[];
}

/* ============================================================================
 * Defaults and score maps
 * ============================================================================
 */

const DEFAULT_RECOMMENDATION_CLOCK:
  StrategyLibraryRecommendationClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const DEFAULT_RECOMMENDATION_WEIGHTS:
  StrategyLibraryRecommendationWeights =
  Object.freeze({
    searchRelevance: 0.1,
    compatibility: 0.35,
    operationalReadiness: 0.12,
    verification: 0.12,
    riskSuitability: 0.1,
    regimeSuitability: 0.08,
    complexitySuitability: 0.05,
    preferenceMatch: 0.08,
  });

const OPERATIONAL_STATUS_SCORE:
  Readonly<
    Record<
      StrategyLibraryOperationalStatus,
      number
    >
  > =
  Object.freeze({
    DRAFT: 0.1,
    EXPERIMENTAL: 0.25,
    BACKTEST_READY: 0.5,
    PAPER_READY: 0.7,
    LIVE_READY: 1,
    DEPRECATED: 0.1,
    RETIRED: 0,
  });

const VERIFICATION_STATUS_SCORE:
  Readonly<
    Record<
      StrategyLibraryVerificationStatus,
      number
    >
  > =
  Object.freeze({
    UNVERIFIED: 0,
    VALIDATED: 0.25,
    BACKTESTED: 0.5,
    PAPER_VERIFIED: 0.7,
    LIVE_VERIFIED: 0.9,
    CERTIFIED: 1,
  });

const RISK_LEVEL_SCORE:
  Readonly<
    Record<
      StrategyLibraryRiskLevel,
      number
    >
  > =
  Object.freeze({
    VERY_LOW: 1,
    LOW: 0.85,
    MODERATE: 0.65,
    HIGH: 0.35,
    VERY_HIGH: 0.1,
  });

const REGIME_DIMENSION =
  "REGIME" as const;

const EMPTY_RECOMMENDATIONS:
  readonly StrategyLibraryRecommendation[] =
  Object.freeze([]);

const EMPTY_SCORE_COMPONENTS:
  readonly StrategyLibraryRecommendationScoreComponent[] =
  Object.freeze([]);

const EMPTY_REASONS:
  readonly StrategyLibraryRecommendationReason[] =
  Object.freeze([]);

/* ============================================================================
 * Recommendation engine
 * ============================================================================
 */

export class StrategyLibraryRecommendationEngine {
  private readonly registry:
    StrategyLibraryRegistryPort;

  private readonly searchEngine:
    StrategyLibrarySearchEngine;

  private readonly compatibilityEngine:
    StrategyLibraryCompatibilityEngine;

  private readonly clock:
    StrategyLibraryRecommendationClock;

  private readonly defaultLimit: number;

  private readonly maximumLimit: number;

  private readonly minimumRecommendationScore:
    number;

  private readonly includeIncompatibleByDefault:
    boolean;

  private readonly requirePositiveCompatibility:
    boolean;

  private readonly weights:
    StrategyLibraryRecommendationWeights;

  private readonly metadata:
    StrategyMetadata;

  public constructor(
    dependencies:
      StrategyLibraryRecommendationEngineDependencies,
    options:
      StrategyLibraryRecommendationEngineOptions = {},
  ) {
    assertDependencies(dependencies);
    assertOptions(options);

    this.registry =
      dependencies.registry;

    this.clock =
      dependencies.clock ??
      DEFAULT_RECOMMENDATION_CLOCK;

    this.defaultLimit =
      options.defaultLimit ??
      STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT;

    this.maximumLimit =
      options.maximumLimit ??
      STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT;

    assertPositiveInteger(
      this.defaultLimit,
      "options.defaultLimit",
    );

    assertPositiveInteger(
      this.maximumLimit,
      "options.maximumLimit",
    );

    if (
      this.defaultLimit >
      this.maximumLimit
    ) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_ARGUMENT",
        "options.defaultLimit cannot exceed options.maximumLimit.",
        {
          field: "options.defaultLimit",
        },
      );
    }

    this.minimumRecommendationScore =
      options.minimumRecommendationScore ??
      0.5;

    assertUnitScore(
      this.minimumRecommendationScore,
      "options.minimumRecommendationScore",
    );

    this.includeIncompatibleByDefault =
      options.includeIncompatibleByDefault ??
      false;

    this.requirePositiveCompatibility =
      options.requirePositiveCompatibility ??
      true;

    this.weights =
      normalizeWeights(
        options.weights,
      );

    this.metadata = immutableCopy(
      options.metadata ??
        EMPTY_STRATEGY_METADATA,
    );

    this.searchEngine =
      dependencies.searchEngine ??
      new StrategyLibrarySearchEngine(
        this.registry,
        options.searchEngineOptions,
      );

    this.compatibilityEngine =
      dependencies.compatibilityEngine ??
      new StrategyLibraryCompatibilityEngine(
        this.registry,
        options.compatibilityEngineOptions,
      );

    assertTimestamp(
      this.clock.now(),
      "dependencies.clock.now()",
    );
  }

  public recommend(
    request:
      StrategyLibraryRecommendationRequest,
  ): StrategyLibraryRecommendationResult {
    const normalized =
      this.normalizeRequest(request);

    try {
      const searchResult =
        this.searchEngine.search({
          ...normalized.search,
          offset: 0,
          limit: this.maximumLimit,
          includeMatches: true,
        });

      const searchHitsByEntryId =
        new Map<
          StrategyLibraryEntryId,
          StrategyLibrarySearchHit
        >(
          searchResult.hits.map(
            (hit) => [
              hit.entry.entryId,
              hit,
            ],
          ),
        );

      const candidates =
        searchResult.entries.map(
          (entry) =>
            this.evaluateCandidate(
              entry,
              searchHitsByEntryId.get(
                entry.entryId,
              ),
              normalized,
            ),
        );

      const eligible =
        candidates.filter(
          (candidate) =>
            (
              normalized.includeIncompatible ||
              candidate.compatibility
                .compatible
            ) &&
            (
              !this.requirePositiveCompatibility ||
              candidate.compatibility
                .score > 0
            ) &&
            candidate.score >=
              normalized.minimumScore,
        );

      const ordered =
        [...eligible].sort(
          compareRecommendationCandidates,
        );

      const page =
        ordered.slice(
          normalized.offset,
          normalized.offset +
            normalized.limit,
        );

      const generatedAt =
        this.now();

      const recommendations =
        page.map(
          (
            candidate,
            index,
          ): StrategyLibraryRecommendation =>
            deepFreeze({
              rank:
                normalized.offset +
                index +
                1,
              entry: candidate.entry,
              disposition:
                candidate.disposition,
              score: candidate.score,
              scoreComponents:
                candidate.scoreComponents,
              reasons:
                candidate.reasons,
              compatibility:
                candidate.compatibility,
              ...(candidate.searchHit ===
              undefined
                ? {}
                : {
                    searchHit:
                      candidate.searchHit,
                  }),
              recommendedCapitalFractionMaximum:
                normalizeUnitValue(
                  candidate.entry
                    .riskProfile
                    .maximumRecommendedCapitalFraction,
                ),
              recommendedLeverageMaximum:
                normalizeNonNegativeNumber(
                  candidate.entry
                    .riskProfile
                    .maximumRecommendedLeverage,
                ),
              generatedAt,
              metadata:
                normalized.metadata,
            }),
        );

      const entries =
        recommendations.length === 0
          ? EMPTY_STRATEGY_LIBRARY_ENTRIES
          : Object.freeze(
              recommendations.map(
                (recommendation) =>
                  recommendation.entry,
              ),
            );

      return deepFreeze({
        request:
          immutableCopy(
            normalized.source,
          ),
        totalCandidates:
          candidates.length,
        totalRecommended:
          ordered.length,
        offset:
          normalized.offset,
        limit:
          normalized.limit,
        recommendations:
          recommendations.length === 0
            ? EMPTY_RECOMMENDATIONS
            : Object.freeze(
                recommendations,
              ),
        entries,
        generatedAt,
        metadata:
          normalized.metadata,
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryRecommendationEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryRecommendationEngineError(
        "RECOMMENDATION_FAILED",
        "Strategy-library recommendation generation failed.",
        {
          cause,
          metadata:
            normalized.metadata,
        },
      );
    }
  }

  public recommendEntries(
    request:
      StrategyLibraryRecommendationRequest,
  ): readonly StrategyLibraryEntry[] {
    return this.recommend(
      request,
    ).entries;
  }

  public recommendOne(
    request:
      StrategyLibraryRecommendationRequest,
  ): StrategyLibraryRecommendation | undefined {
    const result =
      this.recommend({
        ...request,
        offset: 0,
        limit: 1,
      });

    return result
      .recommendations[0];
  }

  public recommendFromRegistry(
    compatibility:
      StrategyLibraryCompatibilityContext,
    preferences:
      StrategyLibraryRecommendationPreferences = {},
  ): StrategyLibraryRecommendationResult {
    return this.recommend({
      search: {
        limit:
          this.maximumLimit,
      },
      compatibility,
      preferences,
    });
  }

  private normalizeRequest(
    request:
      StrategyLibraryRecommendationRequest,
  ): NormalizedRecommendationRequest {
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_REQUEST",
        "recommendation request must be an object.",
        {
          field: "request",
        },
      );
    }

    if (
      typeof request.compatibility !==
        "object" ||
      request.compatibility === null ||
      Array.isArray(
        request.compatibility,
      )
    ) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_REQUEST",
        "request.compatibility must be an object.",
        {
          field:
            "request.compatibility",
        },
      );
    }

    const search =
      request.search === undefined
        ? Object.freeze({})
        : immutableCopy(
            request.search,
          );

    if (
      typeof search !== "object" ||
      search === null ||
      Array.isArray(search)
    ) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_REQUEST",
        "request.search must be an object.",
        {
          field: "request.search",
        },
      );
    }

    const preferences =
      request.preferences ===
      undefined
        ? Object.freeze({})
        : normalizePreferences(
            request.preferences,
          );

    const offset =
      request.offset ?? 0;

    const limit =
      request.limit ??
      this.defaultLimit;

    assertNonNegativeInteger(
      offset,
      "request.offset",
    );

    assertPositiveInteger(
      limit,
      "request.limit",
    );

    if (limit > this.maximumLimit) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_REQUEST",
        `request.limit cannot exceed ${this.maximumLimit}.`,
        {
          field: "request.limit",
        },
      );
    }

    const minimumScore =
      request.minimumScore ??
      this.minimumRecommendationScore;

    assertUnitScore(
      minimumScore,
      "request.minimumScore",
    );

    return deepFreeze({
      source:
        immutableCopy(request),
      search,
      compatibility:
        immutableCopy(
          request.compatibility,
        ),
      preferences,
      includeIncompatible:
        request.includeIncompatible ??
        this.includeIncompatibleByDefault,
      minimumScore,
      offset,
      limit,
      metadata:
        immutableCopy(
          request.metadata ??
            this.metadata,
        ),
    });
  }

  private evaluateCandidate(
    entry: StrategyLibraryEntry,
    searchHit:
      StrategyLibrarySearchHit | undefined,
    request:
      NormalizedRecommendationRequest,
  ): RecommendationCandidate {
    const compatibility =
      this.compatibilityEngine.evaluate(
        entry,
        request.compatibility,
      );

    const components:
      StrategyLibraryRecommendationScoreComponent[] =
      [];

    const reasons:
      StrategyLibraryRecommendationReason[] =
      [];

    this.addSearchScore(
      components,
      reasons,
      searchHit,
    );

    this.addCompatibilityScore(
      components,
      reasons,
      compatibility,
    );

    this.addOperationalReadinessScore(
      components,
      reasons,
      entry,
    );

    this.addVerificationScore(
      components,
      reasons,
      entry,
    );

    this.addRiskScore(
      components,
      reasons,
      entry,
      request.preferences,
    );

    this.addRegimeScore(
      components,
      reasons,
      compatibility,
    );

    this.addComplexityScore(
      components,
      reasons,
      entry,
      request.preferences,
    );

    const excluded =
      this.addPreferenceScore(
        components,
        reasons,
        entry,
        request.preferences,
      );

    const applicableComponents =
      components.filter(
        (component) =>
          component.applicable,
      );

    const applicableWeight =
      applicableComponents.reduce(
        (
          total,
          component,
        ) =>
          total +
          component.weight,
        0,
      );

    const weightedScore =
      applicableComponents.reduce(
        (
          total,
          component,
        ) =>
          total +
          component.weightedScore,
        0,
      );

    const score =
      applicableWeight === 0
        ? 0
        : normalizeUnitValue(
            weightedScore /
              applicableWeight,
          );

    const disposition =
      this.resolveDisposition(
        compatibility,
        score,
        excluded,
        request.minimumScore,
      );

    if (
      score <
      request.minimumScore
    ) {
      reasons.push(
        createReason(
          "BELOW_MINIMUM_SCORE",
          false,
          `Recommendation score ${score} is below the requested minimum of ${request.minimumScore}.`,
          request.metadata,
        ),
      );
    }

    return deepFreeze({
      entry,
      ...(searchHit === undefined
        ? {}
        : { searchHit }),
      compatibility,
      score,
      disposition,
      scoreComponents:
        components.length === 0
          ? EMPTY_SCORE_COMPONENTS
          : Object.freeze(
              components.sort(
                compareScoreComponents,
              ),
            ),
      reasons:
        reasons.length === 0
          ? EMPTY_REASONS
          : Object.freeze(reasons),
    });
  }

  private addSearchScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    hit:
      StrategyLibrarySearchHit | undefined,
  ): void {
    if (hit === undefined) {
      components.push(
        createScoreComponent(
          "SEARCH_RELEVANCE",
          1,
          this.weights
            .searchRelevance,
          false,
          "No explicit search relevance criterion was applied.",
        ),
      );

      return;
    }

    const normalizedScore =
      normalizeSearchScore(
        hit.score,
      );

    components.push(
      createScoreComponent(
        "SEARCH_RELEVANCE",
        normalizedScore,
        this.weights
          .searchRelevance,
        true,
        `Search relevance score was ${normalizedScore}.`,
      ),
    );

    reasons.push(
      createReason(
        "SEARCH_MATCH",
        true,
        `The entry matched the strategy-library search with rank ${hit.rank}.`,
        this.metadata,
      ),
    );
  }

  private addCompatibilityScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    compatibility:
      StrategyLibraryCompatibilityResult,
  ): void {
    components.push(
      createScoreComponent(
        "COMPATIBILITY",
        compatibility.score,
        this.weights.compatibility,
        true,
        compatibility.compatible
          ? "The strategy is compatible with the supplied operating context."
          : "The strategy has one or more incompatibilities with the supplied operating context.",
      ),
    );

    if (compatibility.compatible) {
      reasons.push(
        createReason(
          "FULLY_COMPATIBLE",
          true,
          "All blocking compatibility requirements were satisfied.",
          this.metadata,
        ),
      );

      return;
    }

    const blockingIssues =
      compatibility.issues.filter(
        (issue) =>
          issue.blocking,
      );

    reasons.push(
      createReason(
        compatibility.score > 0
          ? "PARTIALLY_COMPATIBLE"
          : "INCOMPATIBLE",
        false,
        blockingIssues.length === 0
          ? "The strategy did not meet the configured compatibility threshold."
          : summarizeBlockingIssues(
              blockingIssues,
            ),
        this.metadata,
      ),
    );
  }

  private addOperationalReadinessScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    entry:
      StrategyLibraryEntry,
  ): void {
    const score =
      OPERATIONAL_STATUS_SCORE[
        entry.status
      ];

    components.push(
      createScoreComponent(
        "OPERATIONAL_READINESS",
        score,
        this.weights
          .operationalReadiness,
        true,
        `Operational status '${entry.status}' maps to readiness score ${score}.`,
      ),
    );

    if (entry.status === "LIVE_READY") {
      reasons.push(
        createReason(
          "LIVE_READY",
          true,
          "The strategy is classified as live ready.",
          this.metadata,
        ),
      );
    }
  }

  private addVerificationScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    entry:
      StrategyLibraryEntry,
  ): void {
    const score =
      VERIFICATION_STATUS_SCORE[
        entry.verificationStatus
      ];

    components.push(
      createScoreComponent(
        "VERIFICATION",
        score,
        this.weights.verification,
        true,
        `Verification status '${entry.verificationStatus}' maps to score ${score}.`,
      ),
    );

    if (
      entry.verificationStatus ===
        "LIVE_VERIFIED" ||
      entry.verificationStatus ===
        "CERTIFIED"
    ) {
      reasons.push(
        createReason(
          "HIGH_VERIFICATION",
          true,
          `The strategy has high verification maturity: '${entry.verificationStatus}'.`,
          this.metadata,
        ),
      );
    }
  }

  private addRiskScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    entry:
      StrategyLibraryEntry,
    preferences:
      StrategyLibraryRecommendationPreferences,
  ): void {
    const preferred =
      preferences.preferredRiskLevels;

    const preferenceProvided =
      preferred !== undefined &&
      preferred.length > 0;

    const preferredMatch =
      preferenceProvided &&
      preferred.includes(
        entry.riskProfile
          .overallRiskLevel,
      );

    let score =
      RISK_LEVEL_SCORE[
        entry.riskProfile
          .overallRiskLevel
      ];

    if (preferredMatch) {
      score = 1;
    } else if (
      preferenceProvided
    ) {
      score *= 0.5;
    } else if (
      preferences.preferLowerRisk !==
        true
    ) {
      score = 0.75;
    }

    const normalized =
      normalizeUnitValue(score);

    components.push(
      createScoreComponent(
        "RISK_SUITABILITY",
        normalized,
        this.weights
          .riskSuitability,
        true,
        preferredMatch
          ? `Risk level '${entry.riskProfile.overallRiskLevel}' matches the preferred risk levels.`
          : `Risk suitability score for '${entry.riskProfile.overallRiskLevel}' is ${normalized}.`,
      ),
    );

    if (preferredMatch) {
      reasons.push(
        createReason(
          "RISK_MATCH",
          true,
          `Risk level '${entry.riskProfile.overallRiskLevel}' matches the recommendation preferences.`,
          this.metadata,
        ),
      );
    }
  }

  private addRegimeScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    compatibility:
      StrategyLibraryCompatibilityResult,
  ): void {
    const regimeDimension =
      compatibility.dimensions.find(
        (dimension) =>
          dimension.dimension ===
          REGIME_DIMENSION,
      );

    if (
      regimeDimension === undefined ||
      !regimeDimension.applicable
    ) {
      components.push(
        createScoreComponent(
          "REGIME_SUITABILITY",
          1,
          this.weights
            .regimeSuitability,
          false,
          "No market-regime criterion was supplied.",
        ),
      );

      return;
    }

    components.push(
      createScoreComponent(
        "REGIME_SUITABILITY",
        regimeDimension.score,
        this.weights
          .regimeSuitability,
        true,
        regimeDimension.explanation,
      ),
    );

    if (
      regimeDimension.compatible &&
      regimeDimension.score >= 0.8
    ) {
      reasons.push(
        createReason(
          "REGIME_MATCH",
          true,
          regimeDimension.explanation,
          this.metadata,
        ),
      );
    }
  }

  private addComplexityScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    entry:
      StrategyLibraryEntry,
    preferences:
      StrategyLibraryRecommendationPreferences,
  ): void {
    const preferred =
      preferences.preferredComplexities;

    if (
      preferred === undefined ||
      preferred.length === 0
    ) {
      components.push(
        createScoreComponent(
          "COMPLEXITY_SUITABILITY",
          1,
          this.weights
            .complexitySuitability,
          false,
          "No preferred strategy complexity was supplied.",
        ),
      );

      return;
    }

    const matched =
      preferred.includes(
        entry.complexity,
      );

    const score =
      matched ? 1 : 0.25;

    components.push(
      createScoreComponent(
        "COMPLEXITY_SUITABILITY",
        score,
        this.weights
          .complexitySuitability,
        true,
        matched
          ? `Complexity '${entry.complexity}' matches the preferred complexity levels.`
          : `Complexity '${entry.complexity}' does not match the preferred complexity levels.`,
      ),
    );

    if (matched) {
      reasons.push(
        createReason(
          "COMPLEXITY_MATCH",
          true,
          `Complexity '${entry.complexity}' matches the recommendation preferences.`,
          this.metadata,
        ),
      );
    }
  }

  private addPreferenceScore(
    components:
      StrategyLibraryRecommendationScoreComponent[],
    reasons:
      StrategyLibraryRecommendationReason[],
    entry:
      StrategyLibraryEntry,
    preferences:
      StrategyLibraryRecommendationPreferences,
  ): boolean {
    const excludedFamily =
      preferences.excludedFamilies
        ?.includes(entry.family) ??
      false;

    const normalizedEntryTags =
      new Set(
        entry.tags.map(
          normalizeComparableText,
        ),
      );

    const excludedTag =
      preferences.excludedTags
        ?.find((tag) =>
          normalizedEntryTags.has(
            normalizeComparableText(tag),
          ),
        );

    if (excludedFamily) {
      components.push(
        createScoreComponent(
          "PREFERENCE_MATCH",
          0,
          this.weights
            .preferenceMatch,
          true,
          `Family '${entry.family}' is explicitly excluded.`,
        ),
      );

      reasons.push(
        createReason(
          "EXCLUDED_FAMILY",
          false,
          `Family '${entry.family}' is excluded by the recommendation preferences.`,
          this.metadata,
        ),
      );

      return true;
    }

    if (excludedTag !== undefined) {
      components.push(
        createScoreComponent(
          "PREFERENCE_MATCH",
          0,
          this.weights
            .preferenceMatch,
          true,
          `Tag '${excludedTag}' is explicitly excluded.`,
        ),
      );

      reasons.push(
        createReason(
          "EXCLUDED_TAG",
          false,
          `Tag '${excludedTag}' is excluded by the recommendation preferences.`,
          this.metadata,
        ),
      );

      return true;
    }

    const checks: boolean[] = [];

    if (
      preferences.preferredFamilies !==
        undefined &&
      preferences.preferredFamilies
        .length > 0
    ) {
      checks.push(
        preferences.preferredFamilies.includes(
          entry.family,
        ) ||
          entry.secondaryFamilies.some(
            (family) =>
              preferences.preferredFamilies
                ?.includes(family) ??
              false,
          ),
      );
    }

    if (
      preferences.preferredStatuses !==
        undefined &&
      preferences.preferredStatuses
        .length > 0
    ) {
      checks.push(
        preferences.preferredStatuses.includes(
          entry.status,
        ),
      );
    }

    if (
      preferences
        .preferredVerificationStatuses !==
        undefined &&
      preferences
        .preferredVerificationStatuses
        .length > 0
    ) {
      checks.push(
        preferences
          .preferredVerificationStatuses
          .includes(
            entry.verificationStatus,
          ),
      );
    }

    if (
      preferences.preferredTags !==
        undefined &&
      preferences.preferredTags
        .length > 0
    ) {
      checks.push(
        preferences.preferredTags.some(
          (tag) =>
            normalizedEntryTags.has(
              normalizeComparableText(
                tag,
              ),
            ),
        ),
      );
    }

    if (
      preferences.preferLiveReady ===
      true
    ) {
      checks.push(
        entry.status ===
          "LIVE_READY",
      );
    }

    if (
      preferences.preferCertified ===
      true
    ) {
      checks.push(
        entry.verificationStatus ===
          "CERTIFIED",
      );
    }

    if (
      preferences
        .preferDeterministicReplay ===
      true
    ) {
      checks.push(
        entry.operationalProfile
          .supportsDeterministicReplay,
      );
    }

    if (checks.length === 0) {
      components.push(
        createScoreComponent(
          "PREFERENCE_MATCH",
          1,
          this.weights
            .preferenceMatch,
          false,
          "No additional recommendation preferences were supplied.",
        ),
      );

      return false;
    }

    const matched =
      checks.filter(Boolean).length;

    const score =
      normalizeUnitValue(
        matched /
          checks.length,
      );

    components.push(
      createScoreComponent(
        "PREFERENCE_MATCH",
        score,
        this.weights
          .preferenceMatch,
        true,
        `${matched} of ${checks.length} recommendation preferences were matched.`,
      ),
    );

    if (matched > 0) {
      reasons.push(
        createReason(
          "PREFERENCE_MATCH",
          true,
          `${matched} of ${checks.length} recommendation preferences were matched.`,
          this.metadata,
        ),
      );
    }

    return false;
  }

  private resolveDisposition(
    compatibility:
      StrategyLibraryCompatibilityResult,
    score: number,
    excluded: boolean,
    minimumScore: number,
  ): StrategyLibraryRecommendationDisposition {
    if (
      excluded ||
      score < minimumScore
    ) {
      return "NOT_RECOMMENDED";
    }

    if (
      compatibility.compatible &&
      score >= 0.75
    ) {
      return "RECOMMENDED";
    }

    if (
      compatibility.score > 0
    ) {
      return "CONDITIONALLY_RECOMMENDED";
    }

    return "NOT_RECOMMENDED";
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

export function createStrategyLibraryRecommendationEngine(
  dependencies:
    StrategyLibraryRecommendationEngineDependencies,
  options:
    StrategyLibraryRecommendationEngineOptions = {},
): StrategyLibraryRecommendationEngine {
  return new StrategyLibraryRecommendationEngine(
    dependencies,
    options,
  );
}

/* ============================================================================
 * Construction helpers
 * ============================================================================
 */

function createScoreComponent(
  dimension:
    StrategyLibraryRecommendationDimension,
  score: number,
  weight: number,
  applicable: boolean,
  explanation: string,
): StrategyLibraryRecommendationScoreComponent {
  assertUnitScore(
    score,
    "scoreComponent.score",
  );

  assertFiniteNonNegativeNumber(
    weight,
    "scoreComponent.weight",
  );

  return deepFreeze({
    dimension,
    score:
      normalizeUnitValue(score),
    weight:
      normalizeNonNegativeNumber(
        weight,
      ),
    weightedScore:
      normalizeNonNegativeNumber(
        applicable
          ? score * weight
          : 0,
      ),
    applicable,
    explanation,
  });
}

function createReason(
  code:
    StrategyLibraryRecommendationReasonCode,
  positive: boolean,
  message: string,
  metadata: StrategyMetadata,
): StrategyLibraryRecommendationReason {
  return deepFreeze({
    code,
    positive,
    message,
    metadata,
  });
}

/* ============================================================================
 * Comparison helpers
 * ============================================================================
 */

function compareRecommendationCandidates(
  left: RecommendationCandidate,
  right: RecommendationCandidate,
): number {
  const dispositionOrder =
    recommendationDispositionOrder(
      left.disposition,
    ) -
    recommendationDispositionOrder(
      right.disposition,
    );

  if (dispositionOrder !== 0) {
    return dispositionOrder;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (
    left.compatibility.score !==
    right.compatibility.score
  ) {
    return (
      right.compatibility.score -
      left.compatibility.score
    );
  }

  const verificationDifference =
    VERIFICATION_STATUS_SCORE[
      right.entry
        .verificationStatus
    ] -
    VERIFICATION_STATUS_SCORE[
      left.entry
        .verificationStatus
    ];

  if (
    verificationDifference !== 0
  ) {
    return verificationDifference;
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

function recommendationDispositionOrder(
  disposition:
    StrategyLibraryRecommendationDisposition,
): number {
  switch (disposition) {
    case "RECOMMENDED":
      return 0;

    case "CONDITIONALLY_RECOMMENDED":
      return 1;

    case "NOT_RECOMMENDED":
      return 2;
  }
}

function compareScoreComponents(
  left:
    StrategyLibraryRecommendationScoreComponent,
  right:
    StrategyLibraryRecommendationScoreComponent,
): number {
  if (
    left.weight !==
    right.weight
  ) {
    return (
      right.weight -
      left.weight
    );
  }

  return left.dimension.localeCompare(
    right.dimension,
  );
}

/* ============================================================================
 * Score helpers
 * ============================================================================
 */

function normalizeSearchScore(
  score: number,
): number {
  assertFiniteNonNegativeNumber(
    score,
    "searchHit.score",
  );

  if (score === 0) {
    return 0;
  }

  return normalizeUnitValue(
    score /
      (score + 500),
  );
}

function normalizeUnitValue(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_SCORE",
      "normalized value must be finite.",
    );
  }

  return Number(
    Math.min(
      1,
      Math.max(0, value),
    ).toFixed(12),
  );
}

function normalizeNonNegativeNumber(
  value: number,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_SCORE",
      "value must be finite and non-negative.",
    );
  }

  return Number(
    value.toFixed(12),
  );
}

function summarizeBlockingIssues(
  issues:
    readonly StrategyLibraryCompatibilityIssue[],
): string {
  const messages =
    issues
      .map((issue) =>
        issue.message.trim(),
      )
      .filter(
        (message) =>
          message.length > 0,
      )
      .sort(
        (left, right) =>
          left.localeCompare(right),
      );

  if (messages.length === 0) {
    return "The strategy has blocking compatibility issues.";
  }

  return `Blocking compatibility issues: ${messages.join(
    " ",
  )}`;
}

/* ============================================================================
 * Normalization helpers
 * ============================================================================
 */

function normalizePreferences(
  preferences:
    StrategyLibraryRecommendationPreferences,
): StrategyLibraryRecommendationPreferences {
  if (
    typeof preferences !== "object" ||
    preferences === null ||
    Array.isArray(preferences)
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_REQUEST",
      "request.preferences must be an object.",
      {
        field:
          "request.preferences",
      },
    );
  }

  validateOptionalArray(
    preferences.preferredFamilies,
    "request.preferences.preferredFamilies",
  );

  validateOptionalArray(
    preferences.excludedFamilies,
    "request.preferences.excludedFamilies",
  );

  validateOptionalArray(
    preferences.preferredComplexities,
    "request.preferences.preferredComplexities",
  );

  validateOptionalArray(
    preferences.preferredRiskLevels,
    "request.preferences.preferredRiskLevels",
  );

  validateOptionalArray(
    preferences.preferredStatuses,
    "request.preferences.preferredStatuses",
  );

  validateOptionalArray(
    preferences
      .preferredVerificationStatuses,
    "request.preferences.preferredVerificationStatuses",
  );

  validateOptionalStringArray(
    preferences.preferredTags,
    "request.preferences.preferredTags",
  );

  validateOptionalStringArray(
    preferences.excludedTags,
    "request.preferences.excludedTags",
  );

  return immutableCopy(
    preferences,
  );
}

function normalizeWeights(
  weights:
    | Partial<StrategyLibraryRecommendationWeights>
    | undefined,
): StrategyLibraryRecommendationWeights {
  if (
    weights !== undefined &&
    (
      typeof weights !== "object" ||
      weights === null ||
      Array.isArray(weights)
    )
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_WEIGHT",
      "options.weights must be an object.",
      {
        field:
          "options.weights",
      },
    );
  }

  const normalized:
    StrategyLibraryRecommendationWeights = {
    ...DEFAULT_RECOMMENDATION_WEIGHTS,
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
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_WEIGHT",
      "At least one recommendation weight must be greater than zero.",
      {
        field:
          "options.weights",
      },
    );
  }

  return Object.freeze(normalized);
}

function normalizeComparableText(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US");
}

/* ============================================================================
 * Validation helpers
 * ============================================================================
 */

function assertDependencies(
  dependencies:
    StrategyLibraryRecommendationEngineDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null ||
    Array.isArray(dependencies)
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      "dependencies must be an object.",
      {
        field: "dependencies",
      },
    );
  }

  assertRegistry(
    dependencies.registry,
  );

  if (
    dependencies.searchEngine !==
      undefined &&
    !(
      dependencies.searchEngine instanceof
      StrategyLibrarySearchEngine
    )
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      "dependencies.searchEngine must be a StrategyLibrarySearchEngine.",
      {
        field:
          "dependencies.searchEngine",
      },
    );
  }

  if (
    dependencies.compatibilityEngine !==
      undefined &&
    !(
      dependencies.compatibilityEngine instanceof
      StrategyLibraryCompatibilityEngine
    )
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      "dependencies.compatibilityEngine must be a StrategyLibraryCompatibilityEngine.",
      {
        field:
          "dependencies.compatibilityEngine",
      },
    );
  }
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
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      "dependencies.registry must implement StrategyLibraryRegistryPort.",
      {
        field:
          "dependencies.registry",
      },
    );
  }
}

function assertOptions(
  options:
    StrategyLibraryRecommendationEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a positive safe integer.`,
      { field },
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer.`,
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
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_SCORE",
      `${field} must be a finite non-negative number.`,
      { field },
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
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_SCORE",
      `${field} must be between 0 and 1.`,
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
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_ARGUMENT",
      `${field} must return a non-negative safe integer timestamp.`,
      { field },
    );
  }
}

function validateOptionalArray<T>(
  value: readonly T[] | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    !Array.isArray(value)
  ) {
    throw new StrategyLibraryRecommendationEngineError(
      "INVALID_REQUEST",
      `${field} must be an array.`,
      { field },
    );
  }
}

function validateOptionalStringArray(
  value:
    readonly string[] | undefined,
  field: string,
): void {
  validateOptionalArray(
    value,
    field,
  );

  if (value === undefined) {
    return;
  }

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item = value[index];

    if (
      typeof item !== "string" ||
      item.trim().length === 0
    ) {
      throw new StrategyLibraryRecommendationEngineError(
        "INVALID_REQUEST",
        `${field}[${index}] must be a non-empty string.`,
        {
          field:
            `${field}[${index}]`,
        },
      );
    }
  }
}

/* ============================================================================
 * Immutability helpers
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