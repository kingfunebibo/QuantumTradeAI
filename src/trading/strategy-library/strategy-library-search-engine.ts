/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-search-engine.ts
 *
 * Purpose:
 * Provides deterministic, immutable, relevance-aware discovery over the
 * Professional Trading Strategy Library.
 *
 * The search engine complements the registry's structured query capability
 * with:
 *
 * - normalized full-text search
 * - deterministic relevance scoring
 * - exact, prefix, token, and phrase matching
 * - structured filters
 * - facet aggregation
 * - search suggestions
 * - pagination
 * - immutable result contracts
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyCapability,
  type StrategyEnvironment,
  type StrategyId,
  type StrategyMarketType,
  type StrategyMetadata,
  type StrategyTradingMode,
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
  type StrategyLibraryIntelligenceType,
  type StrategyLibraryMarketRegime,
  type StrategyLibraryOperationalStatus,
  type StrategyLibraryQuery,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRiskLevel,
  type StrategyLibrarySortDirection,
  type StrategyLibrarySortField,
  type StrategyLibraryTag,
  type StrategyLibraryVerificationStatus,
} from "./strategy-library-contracts";

/* ============================================================================
 * Error contracts
 * ============================================================================
 */

export type StrategyLibrarySearchEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_QUERY"
  | "INVALID_OFFSET"
  | "INVALID_LIMIT"
  | "INVALID_SCORE"
  | "SEARCH_FAILED";

export interface StrategyLibrarySearchEngineErrorDetails {
  readonly field?: string;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibrarySearchEngineError extends Error {
  public readonly code: StrategyLibrarySearchEngineErrorCode;

  public readonly field?: string;

  public readonly cause?: unknown;

  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibrarySearchEngineErrorCode,
    message: string,
    details: StrategyLibrarySearchEngineErrorDetails = {},
  ) {
    super(message);

    this.name = "StrategyLibrarySearchEngineError";
    this.code = code;
    this.field = details.field;
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibrarySearchEngineError.prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and configuration contracts
 * ============================================================================
 */

export interface StrategyLibrarySearchClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibrarySearchWeights {
  readonly exactEntryId: number;
  readonly exactStrategyId: number;
  readonly exactAlias: number;
  readonly exactTag: number;
  readonly exactKeyword: number;
  readonly exactManifestText: number;
  readonly prefixEntryId: number;
  readonly prefixStrategyId: number;
  readonly prefixAlias: number;
  readonly prefixTag: number;
  readonly prefixKeyword: number;
  readonly tokenEntryId: number;
  readonly tokenStrategyId: number;
  readonly tokenAlias: number;
  readonly tokenTag: number;
  readonly tokenKeyword: number;
  readonly tokenManifestText: number;
  readonly phraseManifestText: number;
  readonly verifiedBonus: number;
  readonly activeBonus: number;
}

export interface StrategyLibrarySearchEngineOptions {
  readonly clock?: StrategyLibrarySearchClock;
  readonly defaultLimit?: number;
  readonly maximumLimit?: number;
  readonly minimumTextLength?: number;
  readonly maximumTextLength?: number;
  readonly maximumSuggestions?: number;
  readonly requireAllTextTokens?: boolean;
  readonly weights?: Partial<StrategyLibrarySearchWeights>;
  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Search contracts
 * ============================================================================
 */

export type StrategyLibrarySearchMatchField =
  | "ENTRY_ID"
  | "STRATEGY_ID"
  | "MANIFEST"
  | "ALIAS"
  | "TAG"
  | "KEYWORD"
  | "FAMILY"
  | "SECONDARY_FAMILY";

export type StrategyLibrarySearchMatchType =
  | "EXACT"
  | "PREFIX"
  | "PHRASE"
  | "TOKEN"
  | "FILTER";

export interface StrategyLibrarySearchMatch {
  readonly field: StrategyLibrarySearchMatchField;
  readonly type: StrategyLibrarySearchMatchType;
  readonly value: string;
  readonly score: number;
}

export interface StrategyLibrarySearchHit {
  readonly entry: StrategyLibraryEntry;
  readonly score: number;
  readonly rank: number;
  readonly matches: readonly StrategyLibrarySearchMatch[];
}

export interface StrategyLibrarySearchRequest
  extends StrategyLibraryQuery {
  readonly minimumScore?: number;
  readonly includeMatches?: boolean;
}

export interface StrategyLibrarySearchFacetValue<T extends string> {
  readonly value: T;
  readonly count: number;
}

export interface StrategyLibrarySearchFacets {
  readonly families:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryFamily>[];

  readonly complexities:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryComplexity>[];

  readonly riskLevels:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryRiskLevel>[];

  readonly statuses:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryOperationalStatus>[];

  readonly verificationStatuses:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryVerificationStatus>[];

  readonly marketTypes:
    readonly StrategyLibrarySearchFacetValue<StrategyMarketType>[];

  readonly tradingModes:
    readonly StrategyLibrarySearchFacetValue<StrategyTradingMode>[];

  readonly environments:
    readonly StrategyLibrarySearchFacetValue<StrategyEnvironment>[];

  readonly intelligenceTypes:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryIntelligenceType>[];

  readonly regimes:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryMarketRegime>[];

  readonly tags:
    readonly StrategyLibrarySearchFacetValue<StrategyLibraryTag>[];
}

export interface StrategyLibrarySearchResult {
  readonly query: StrategyLibrarySearchRequest;
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hits: readonly StrategyLibrarySearchHit[];
  readonly entries: readonly StrategyLibraryEntry[];
  readonly facets: StrategyLibrarySearchFacets;
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export type StrategyLibrarySearchSuggestionType =
  | "STRATEGY_ID"
  | "ENTRY_ID"
  | "ALIAS"
  | "TAG"
  | "KEYWORD";

export interface StrategyLibrarySearchSuggestion {
  readonly type: StrategyLibrarySearchSuggestionType;
  readonly value: string;
  readonly score: number;
  readonly entryIds: readonly StrategyLibraryEntryId[];
}

export interface StrategyLibrarySearchSuggestionResult {
  readonly text: string;
  readonly suggestions: readonly StrategyLibrarySearchSuggestion[];
  readonly generatedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface NormalizedSearchRequest {
  readonly source: StrategyLibrarySearchRequest;
  readonly text?: string;
  readonly tokens: readonly string[];
  readonly offset: number;
  readonly limit: number;
  readonly minimumScore: number;
  readonly includeMatches: boolean;
}

interface EvaluatedEntry {
  readonly entry: StrategyLibraryEntry;
  readonly score: number;
  readonly matches: readonly StrategyLibrarySearchMatch[];
}

interface MutableSuggestion {
  readonly type: StrategyLibrarySearchSuggestionType;
  readonly value: string;
  score: number;
  readonly entryIds: Set<StrategyLibraryEntryId>;
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_SEARCH_WEIGHTS: StrategyLibrarySearchWeights =
  Object.freeze({
    exactEntryId: 1_000,
    exactStrategyId: 950,
    exactAlias: 850,
    exactTag: 700,
    exactKeyword: 650,
    exactManifestText: 600,

    prefixEntryId: 500,
    prefixStrategyId: 475,
    prefixAlias: 425,
    prefixTag: 350,
    prefixKeyword: 325,

    tokenEntryId: 250,
    tokenStrategyId: 240,
    tokenAlias: 220,
    tokenTag: 180,
    tokenKeyword: 170,
    tokenManifestText: 140,

    phraseManifestText: 300,

    verifiedBonus: 25,
    activeBonus: 15,
  });

const DEFAULT_SEARCH_CLOCK: StrategyLibrarySearchClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const EMPTY_SEARCH_MATCHES:
  readonly StrategyLibrarySearchMatch[] =
  Object.freeze([]);

const EMPTY_SEARCH_HITS:
  readonly StrategyLibrarySearchHit[] =
  Object.freeze([]);

const EMPTY_SEARCH_SUGGESTIONS:
  readonly StrategyLibrarySearchSuggestion[] =
  Object.freeze([]);

/* ============================================================================
 * Search engine
 * ============================================================================
 */

export class StrategyLibrarySearchEngine {
  private readonly registry: StrategyLibraryRegistryPort;

  private readonly clock: StrategyLibrarySearchClock;

  private readonly defaultLimit: number;

  private readonly maximumLimit: number;

  private readonly minimumTextLength: number;

  private readonly maximumTextLength: number;

  private readonly maximumSuggestions: number;

  private readonly requireAllTextTokens: boolean;

  private readonly weights: StrategyLibrarySearchWeights;

  private readonly metadata: StrategyMetadata;

  public constructor(
    registry: StrategyLibraryRegistryPort,
    options: StrategyLibrarySearchEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    const defaultLimit =
      options.defaultLimit ??
      STRATEGY_LIBRARY_DEFAULT_QUERY_LIMIT;

    const maximumLimit =
      options.maximumLimit ??
      STRATEGY_LIBRARY_MAXIMUM_QUERY_LIMIT;

    assertPositiveInteger(
      defaultLimit,
      "options.defaultLimit",
    );

    assertPositiveInteger(
      maximumLimit,
      "options.maximumLimit",
    );

    if (defaultLimit > maximumLimit) {
      throw new StrategyLibrarySearchEngineError(
        "INVALID_ARGUMENT",
        "options.defaultLimit cannot exceed options.maximumLimit.",
        {
          field: "options.defaultLimit",
        },
      );
    }

    const minimumTextLength =
      options.minimumTextLength ?? 1;

    const maximumTextLength =
      options.maximumTextLength ?? 1_000;

    const maximumSuggestions =
      options.maximumSuggestions ?? 20;

    assertNonNegativeInteger(
      minimumTextLength,
      "options.minimumTextLength",
    );

    assertPositiveInteger(
      maximumTextLength,
      "options.maximumTextLength",
    );

    assertPositiveInteger(
      maximumSuggestions,
      "options.maximumSuggestions",
    );

    if (minimumTextLength > maximumTextLength) {
      throw new StrategyLibrarySearchEngineError(
        "INVALID_ARGUMENT",
        "options.minimumTextLength cannot exceed options.maximumTextLength.",
        {
          field: "options.minimumTextLength",
        },
      );
    }

    this.registry = registry;
    this.clock =
      options.clock ??
      DEFAULT_SEARCH_CLOCK;

    this.defaultLimit = defaultLimit;
    this.maximumLimit = maximumLimit;
    this.minimumTextLength = minimumTextLength;
    this.maximumTextLength = maximumTextLength;
    this.maximumSuggestions = maximumSuggestions;

    this.requireAllTextTokens =
      options.requireAllTextTokens ?? false;

    this.weights =
      normalizeWeights(options.weights);

    this.metadata = immutableCopy(
      options.metadata ??
      EMPTY_STRATEGY_METADATA,
    );

    assertTimestamp(
      this.clock.now(),
      "options.clock.now()",
    );
  }

  public search(
    request: StrategyLibrarySearchRequest = {},
  ): StrategyLibrarySearchResult {
    try {
      const normalized =
        this.normalizeRequest(request);

      const candidates =
        this.getStructuredCandidates(
          normalized.source,
        );

      const evaluated =
        candidates
          .map((entry) =>
            this.evaluateEntry(
              entry,
              normalized,
            ),
          )
          .filter(
            (
              candidate,
            ): candidate is EvaluatedEntry =>
              candidate !== undefined,
          );

      const ordered =
        this.orderEvaluatedEntries(
          evaluated,
          normalized.source.sortBy,
          normalized.source.sortDirection,
          normalized.text !== undefined,
        );

      const total = ordered.length;

      const page =
        ordered.slice(
          normalized.offset,
          normalized.offset +
            normalized.limit,
        );

      const hits =
        Object.freeze(
          page.map(
            (candidate, index) =>
              deepFreeze<StrategyLibrarySearchHit>({
                entry: candidate.entry,
                score: candidate.score,
                rank:
                  normalized.offset +
                  index +
                  1,
                matches:
                  normalized.includeMatches
                    ? candidate.matches
                    : EMPTY_SEARCH_MATCHES,
              }),
          ),
        );

      const entries =
        hits.length === 0
          ? EMPTY_STRATEGY_LIBRARY_ENTRIES
          : Object.freeze(
              hits.map(
                (hit) => hit.entry,
              ),
            );

      return deepFreeze({
        query: immutableCopy(request),
        total,
        offset: normalized.offset,
        limit: normalized.limit,
        hits:
          hits.length === 0
            ? EMPTY_SEARCH_HITS
            : hits,
        entries,
        facets: this.buildFacets(
          ordered.map(
            (candidate) =>
              candidate.entry,
          ),
        ),
        generatedAt: this.now(),
        metadata: this.metadata,
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibrarySearchEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibrarySearchEngineError(
        "SEARCH_FAILED",
        "Strategy library search failed.",
        {
          cause,
          metadata: this.metadata,
        },
      );
    }
  }

  public findByText(
    text: string,
    limit?: number,
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      text,
      limit,
    }).entries;
  }

  public findByStrategyIds(
    strategyIds: readonly StrategyId[],
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      strategyIds,
      limit: this.maximumLimit,
    }).entries;
  }

  public findByFamily(
    family: StrategyLibraryFamily,
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      families: Object.freeze([
        family,
      ]),
      limit: this.maximumLimit,
    }).entries;
  }

  public findByRiskLevel(
    riskLevel: StrategyLibraryRiskLevel,
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      riskLevels: Object.freeze([
        riskLevel,
      ]),
      limit: this.maximumLimit,
    }).entries;
  }

  public findByRegime(
    regime: StrategyLibraryMarketRegime,
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      regimes: Object.freeze([
        regime,
      ]),
      limit: this.maximumLimit,
    }).entries;
  }

  public findByCapability(
    capability: StrategyCapability,
  ): readonly StrategyLibraryEntry[] {
    return this.search({
      capabilities: Object.freeze([
        capability,
      ]),
      limit: this.maximumLimit,
    }).entries;
  }

  public suggest(
    text: string,
    limit = this.maximumSuggestions,
  ): StrategyLibrarySearchSuggestionResult {
    const normalizedText =
      normalizeTextInput(
        text,
        "text",
        this.maximumTextLength,
      );

    assertPositiveInteger(
      limit,
      "limit",
    );

    const effectiveLimit =
      Math.min(
        limit,
        this.maximumSuggestions,
      );

    if (
      normalizedText.length <
      this.minimumTextLength
    ) {
      return deepFreeze({
        text: normalizedText,
        suggestions:
          EMPTY_SEARCH_SUGGESTIONS,
        generatedAt: this.now(),
        metadata: this.metadata,
      });
    }

    const suggestions =
      new Map<
        string,
        MutableSuggestion
      >();

    for (
      const entry of this.registry.list()
    ) {
      this.collectSuggestion(
        suggestions,
        "STRATEGY_ID",
        entry.strategyId,
        entry.entryId,
        normalizedText,
      );

      this.collectSuggestion(
        suggestions,
        "ENTRY_ID",
        entry.entryId,
        entry.entryId,
        normalizedText,
      );

      for (const alias of entry.aliases) {
        this.collectSuggestion(
          suggestions,
          "ALIAS",
          alias,
          entry.entryId,
          normalizedText,
        );
      }

      for (const tag of entry.tags) {
        this.collectSuggestion(
          suggestions,
          "TAG",
          tag,
          entry.entryId,
          normalizedText,
        );
      }

      for (
        const keyword of
          entry.searchKeywords
      ) {
        this.collectSuggestion(
          suggestions,
          "KEYWORD",
          keyword,
          entry.entryId,
          normalizedText,
        );
      }
    }

    const values =
      [...suggestions.values()]
        .sort(compareSuggestions)
        .slice(0, effectiveLimit)
        .map(
          (
            suggestion,
          ): StrategyLibrarySearchSuggestion =>
            deepFreeze({
              type: suggestion.type,
              value: suggestion.value,
              score:
                normalizeScore(
                  suggestion.score,
                ),
              entryIds:
                Object.freeze(
                  [...suggestion.entryIds]
                    .sort(compareText),
                ),
            }),
        );

    return deepFreeze({
      text: normalizedText,
      suggestions:
        values.length === 0
          ? EMPTY_SEARCH_SUGGESTIONS
          : Object.freeze(values),
      generatedAt: this.now(),
      metadata: this.metadata,
    });
  }

  private normalizeRequest(
    request: StrategyLibrarySearchRequest,
  ): NormalizedSearchRequest {
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      throw new StrategyLibrarySearchEngineError(
        "INVALID_QUERY",
        "search request must be an object.",
      );
    }

    const text =
      request.text === undefined
        ? undefined
        : normalizeTextInput(
            request.text,
            "request.text",
            this.maximumTextLength,
          );

    const effectiveText =
      text === undefined ||
      text.length <
        this.minimumTextLength
        ? undefined
        : text;

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
      throw new StrategyLibrarySearchEngineError(
        "INVALID_LIMIT",
        `request.limit cannot exceed ${this.maximumLimit}.`,
        {
          field: "request.limit",
        },
      );
    }

    const minimumScore =
      request.minimumScore ?? 0;

    assertFiniteNonNegativeNumber(
      minimumScore,
      "request.minimumScore",
    );

    return deepFreeze({
      source: immutableCopy(request),
      text: effectiveText,
      tokens:
        effectiveText === undefined
          ? Object.freeze([])
          : tokenize(effectiveText),
      offset,
      limit,
      minimumScore,
      includeMatches:
        request.includeMatches ?? true,
    });
  }

  private getStructuredCandidates(
    request: StrategyLibrarySearchRequest,
  ): readonly StrategyLibraryEntry[] {
    const structuredQuery:
      StrategyLibraryQuery = {
        strategyIds:
          request.strategyIds,
        families:
          request.families,
        complexities:
          request.complexities,
        riskLevels:
          request.riskLevels,
        statuses:
          request.statuses,
        verificationStatuses:
          request.verificationStatuses,
        marketTypes:
          request.marketTypes,
        tradingModes:
          request.tradingModes,
        environments:
          request.environments,
        capabilities:
          request.capabilities,
        regimes:
          request.regimes,
        tags:
          request.tags,
        intelligenceTypes:
          request.intelligenceTypes,
        includeDeprecated:
          request.includeDeprecated,
        includeRetired:
          request.includeRetired,
        offset: 0,
        limit: this.maximumLimit,
      };

    return this.registry.query(
      structuredQuery,
    ).entries;
  }

  private evaluateEntry(
    entry: StrategyLibraryEntry,
    request: NormalizedSearchRequest,
  ): EvaluatedEntry | undefined {
    if (request.text === undefined) {
      return deepFreeze({
        entry,
        score: this.statusBonus(entry),
        matches: EMPTY_SEARCH_MATCHES,
      });
    }

    const matches:
      StrategyLibrarySearchMatch[] = [];

    const text = request.text;

    this.evaluateValue(
      matches,
      "ENTRY_ID",
      entry.entryId,
      text,
      request.tokens,
      this.weights.exactEntryId,
      this.weights.prefixEntryId,
      this.weights.tokenEntryId,
    );

    this.evaluateValue(
      matches,
      "STRATEGY_ID",
      entry.strategyId,
      text,
      request.tokens,
      this.weights.exactStrategyId,
      this.weights.prefixStrategyId,
      this.weights.tokenStrategyId,
    );

    for (const alias of entry.aliases) {
      this.evaluateValue(
        matches,
        "ALIAS",
        alias,
        text,
        request.tokens,
        this.weights.exactAlias,
        this.weights.prefixAlias,
        this.weights.tokenAlias,
      );
    }

    for (const tag of entry.tags) {
      this.evaluateValue(
        matches,
        "TAG",
        tag,
        text,
        request.tokens,
        this.weights.exactTag,
        this.weights.prefixTag,
        this.weights.tokenTag,
      );
    }

    for (
      const keyword of
        entry.searchKeywords
    ) {
      this.evaluateValue(
        matches,
        "KEYWORD",
        keyword,
        text,
        request.tokens,
        this.weights.exactKeyword,
        this.weights.prefixKeyword,
        this.weights.tokenKeyword,
      );
    }

    this.evaluateValue(
      matches,
      "FAMILY",
      entry.family,
      text,
      request.tokens,
      this.weights.exactKeyword,
      this.weights.prefixKeyword,
      this.weights.tokenKeyword,
    );

    for (
      const family of
        entry.secondaryFamilies
    ) {
      this.evaluateValue(
        matches,
        "SECONDARY_FAMILY",
        family,
        text,
        request.tokens,
        this.weights.exactKeyword,
        this.weights.prefixKeyword,
        this.weights.tokenKeyword,
      );
    }

    const manifestText =
      stableSearchText(entry.manifest);

    this.evaluateManifestText(
      matches,
      manifestText,
      text,
      request.tokens,
    );

    const matchedTokens =
      collectMatchedTokens(
        matches,
        request.tokens,
      );

    if (
      this.requireAllTextTokens &&
      matchedTokens.size <
        request.tokens.length
    ) {
      return undefined;
    }

    if (matches.length === 0) {
      return undefined;
    }

    const score =
      normalizeScore(
        matches.reduce(
          (total, match) =>
            total + match.score,
          0,
        ) +
          this.statusBonus(entry),
      );

    if (score < request.minimumScore) {
      return undefined;
    }

    return deepFreeze({
      entry,
      score,
      matches: Object.freeze(
        matches.sort(compareMatches),
      ),
    });
  }

  private evaluateValue(
    matches:
      StrategyLibrarySearchMatch[],
    field: StrategyLibrarySearchMatchField,
    rawValue: string,
    searchText: string,
    searchTokens: readonly string[],
    exactScore: number,
    prefixScore: number,
    tokenScore: number,
  ): void {
    const value =
      normalizeSearchText(rawValue);

    if (value.length === 0) {
      return;
    }

    if (value === searchText) {
      matches.push(
        createMatch(
          field,
          "EXACT",
          rawValue,
          exactScore,
        ),
      );

      return;
    }

    if (value.startsWith(searchText)) {
      matches.push(
        createMatch(
          field,
          "PREFIX",
          rawValue,
          prefixScore,
        ),
      );
    }

    const valueTokens =
      new Set(tokenize(value));

    let tokenMatches = 0;

    for (
      const token of searchTokens
    ) {
      if (
        valueTokens.has(token) ||
        value.includes(token)
      ) {
        tokenMatches += 1;
      }
    }

    if (tokenMatches > 0) {
      matches.push(
        createMatch(
          field,
          "TOKEN",
          rawValue,
          tokenScore *
            tokenMatches,
        ),
      );
    }
  }

  private evaluateManifestText(
    matches:
      StrategyLibrarySearchMatch[],
    manifestText: string,
    searchText: string,
    searchTokens: readonly string[],
  ): void {
    if (manifestText.length === 0) {
      return;
    }

    if (manifestText === searchText) {
      matches.push(
        createMatch(
          "MANIFEST",
          "EXACT",
          searchText,
          this.weights
            .exactManifestText,
        ),
      );

      return;
    }

    if (manifestText.includes(searchText)) {
      matches.push(
        createMatch(
          "MANIFEST",
          "PHRASE",
          searchText,
          this.weights
            .phraseManifestText,
        ),
      );
    }

    let tokenMatches = 0;

    for (
      const token of searchTokens
    ) {
      if (manifestText.includes(token)) {
        tokenMatches += 1;
      }
    }

    if (tokenMatches > 0) {
      matches.push(
        createMatch(
          "MANIFEST",
          "TOKEN",
          searchText,
          this.weights
            .tokenManifestText *
            tokenMatches,
        ),
      );
    }
  }

  private statusBonus(
    entry: StrategyLibraryEntry,
  ): number {
    let score = 0;

    if (
      entry.status !== "DEPRECATED" &&
      entry.status !== "RETIRED"
    ) {
      score +=
        this.weights.activeBonus;
    }

    if (
      entry.verificationStatus !==
      "UNVERIFIED"
    ) {
      score +=
        this.weights.verifiedBonus;
    }

    return score;
  }

  private orderEvaluatedEntries(
    entries: readonly EvaluatedEntry[],
    sortBy: StrategyLibrarySortField | undefined,
    sortDirection:
      | StrategyLibrarySortDirection
      | undefined,
    relevanceAvailable: boolean,
  ): readonly EvaluatedEntry[] {
    const direction =
      sortDirection === "DESCENDING"
        ? -1
        : 1;

    return Object.freeze(
      [...entries].sort(
        (left, right) => {
          if (
            relevanceAvailable &&
            sortBy === undefined &&
            left.score !== right.score
          ) {
            return right.score - left.score;
          }

          const structured =
            compareEntries(
              left.entry,
              right.entry,
              sortBy,
            );

          if (structured !== 0) {
            return structured * direction;
          }

          if (left.score !== right.score) {
            return right.score - left.score;
          }

          return left.entry.entryId.localeCompare(
            right.entry.entryId,
          );
        },
      ),
    );
  }

  private buildFacets(
    entries: readonly StrategyLibraryEntry[],
  ): StrategyLibrarySearchFacets {
    const families =
      new Map<StrategyLibraryFamily, number>();

    const complexities =
      new Map<StrategyLibraryComplexity, number>();

    const riskLevels =
      new Map<StrategyLibraryRiskLevel, number>();

    const statuses =
      new Map<
        StrategyLibraryOperationalStatus,
        number
      >();

    const verificationStatuses =
      new Map<
        StrategyLibraryVerificationStatus,
        number
      >();

    const marketTypes =
      new Map<StrategyMarketType, number>();

    const tradingModes =
      new Map<StrategyTradingMode, number>();

    const environments =
      new Map<StrategyEnvironment, number>();

    const intelligenceTypes =
      new Map<
        StrategyLibraryIntelligenceType,
        number
      >();

    const regimes =
      new Map<
        StrategyLibraryMarketRegime,
        number
      >();

    const tags =
      new Map<StrategyLibraryTag, number>();

    for (const entry of entries) {
      increment(families, entry.family);

      for (
        const secondaryFamily of
          entry.secondaryFamilies
      ) {
        increment(
          families,
          secondaryFamily,
        );
      }

      increment(
        complexities,
        entry.complexity,
      );

      increment(
        riskLevels,
        entry.riskProfile
          .overallRiskLevel,
      );

      increment(
        statuses,
        entry.status,
      );

      increment(
        verificationStatuses,
        entry.verificationStatus,
      );

      increment(
        intelligenceTypes,
        entry.operationalProfile
          .intelligenceType,
      );

      for (
        const marketType of
          entry.compatibilityProfile
            .marketTypes
      ) {
        increment(
          marketTypes,
          marketType,
        );
      }

      for (
        const tradingMode of
          entry.compatibilityProfile
            .tradingModes
      ) {
        increment(
          tradingModes,
          tradingMode,
        );
      }

      for (
        const environment of
          entry.compatibilityProfile
            .environments
      ) {
        increment(
          environments,
          environment,
        );
      }

      for (
        const regimeProfile of
          entry.regimeProfiles
      ) {
        increment(
          regimes,
          regimeProfile.regime,
        );
      }

      for (const tag of entry.tags) {
        increment(tags, tag);
      }
    }

    return deepFreeze({
      families: facetValues(families),
      complexities:
        facetValues(complexities),
      riskLevels:
        facetValues(riskLevels),
      statuses: facetValues(statuses),
      verificationStatuses:
        facetValues(
          verificationStatuses,
        ),
      marketTypes:
        facetValues(marketTypes),
      tradingModes:
        facetValues(tradingModes),
      environments:
        facetValues(environments),
      intelligenceTypes:
        facetValues(
          intelligenceTypes,
        ),
      regimes: facetValues(regimes),
      tags: facetValues(tags),
    });
  }

  private collectSuggestion(
    suggestions:
      Map<string, MutableSuggestion>,
    type: StrategyLibrarySearchSuggestionType,
    rawValue: string,
    entryId: StrategyLibraryEntryId,
    text: string,
  ): void {
    const normalizedValue =
      normalizeSearchText(rawValue);

    if (
      normalizedValue.length === 0 ||
      !normalizedValue.includes(text)
    ) {
      return;
    }

    const score =
      normalizedValue === text
        ? 1_000
        : normalizedValue.startsWith(text)
          ? 500
          : 250;

    const key =
      `${type}\u0000${normalizedValue}`;

    const existing =
      suggestions.get(key);

    if (existing === undefined) {
      suggestions.set(key, {
        type,
        value: rawValue.trim(),
        score,
        entryIds: new Set([
          entryId,
        ]),
      });

      return;
    }

    existing.score =
      Math.max(
        existing.score,
        score,
      );

    existing.entryIds.add(entryId);
  }

  private now(): UnixTimestampMilliseconds {
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

export function createStrategyLibrarySearchEngine(
  registry: StrategyLibraryRegistryPort,
  options: StrategyLibrarySearchEngineOptions = {},
): StrategyLibrarySearchEngine {
  return new StrategyLibrarySearchEngine(
    registry,
    options,
  );
}

/* ============================================================================
 * Comparison helpers
 * ============================================================================
 */

function compareEntries(
  left: StrategyLibraryEntry,
  right: StrategyLibraryEntry,
  sortBy: StrategyLibrarySortField | undefined,
): number {
  switch (sortBy) {
    case "NAME":
      return compareText(
        manifestSortText(left),
        manifestSortText(right),
      );

    case "STRATEGY_ID":
      return compareText(
        left.strategyId,
        right.strategyId,
      );

    case "FAMILY":
      return compareText(
        left.family,
        right.family,
      );

    case "COMPLEXITY":
      return compareText(
        left.complexity,
        right.complexity,
      );

    case "RISK":
      return compareText(
        left.riskProfile
          .overallRiskLevel,
        right.riskProfile
          .overallRiskLevel,
      );

    case "STATUS":
      return compareText(
        left.status,
        right.status,
      );

    case "VERIFICATION":
      return compareText(
        left.verificationStatus,
        right.verificationStatus,
      );

    case "CREATED_AT":
      return (
        left.introducedAt -
        right.introducedAt
      );

    case "UPDATED_AT":
      return (
        left.updatedAt -
        right.updatedAt
      );

    default:
      return compareText(
        left.entryId,
        right.entryId,
      );
  }
}

function compareMatches(
  left: StrategyLibrarySearchMatch,
  right: StrategyLibrarySearchMatch,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const fieldOrder =
    compareText(
      left.field,
      right.field,
    );

  if (fieldOrder !== 0) {
    return fieldOrder;
  }

  return compareText(
    left.value,
    right.value,
  );
}

function compareSuggestions(
  left: MutableSuggestion,
  right: MutableSuggestion,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (
    left.entryIds.size !==
    right.entryIds.size
  ) {
    return (
      right.entryIds.size -
      left.entryIds.size
    );
  }

  const valueOrder =
    compareText(
      left.value,
      right.value,
    );

  if (valueOrder !== 0) {
    return valueOrder;
  }

  return compareText(
    left.type,
    right.type,
  );
}

function compareText(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

/* ============================================================================
 * Match helpers
 * ============================================================================
 */

function createMatch(
  field: StrategyLibrarySearchMatchField,
  type: StrategyLibrarySearchMatchType,
  value: string,
  score: number,
): StrategyLibrarySearchMatch {
  return deepFreeze({
    field,
    type,
    value,
    score: normalizeScore(score),
  });
}

function collectMatchedTokens(
  matches:
    readonly StrategyLibrarySearchMatch[],
  tokens: readonly string[],
): ReadonlySet<string> {
  const matched =
    new Set<string>();

  for (const token of tokens) {
    for (const match of matches) {
      if (
        normalizeSearchText(
          match.value,
        ).includes(token)
      ) {
        matched.add(token);
        break;
      }
    }
  }

  return matched;
}

/* ============================================================================
 * Facet helpers
 * ============================================================================
 */

function increment<T extends string>(
  counts: Map<T, number>,
  value: T,
): void {
  counts.set(
    value,
    (counts.get(value) ?? 0) + 1,
  );
}

function facetValues<T extends string>(
  counts: ReadonlyMap<T, number>,
): readonly StrategyLibrarySearchFacetValue<T>[] {
  return Object.freeze(
    [...counts.entries()]
      .map(
        ([value, count]) =>
          deepFreeze({
            value,
            count,
          }),
      )
      .sort(
        (left, right) => {
          if (
            left.count !==
            right.count
          ) {
            return (
              right.count -
              left.count
            );
          }

          return compareText(
            left.value,
            right.value,
          );
        },
      ),
  );
}

/* ============================================================================
 * Normalization helpers
 * ============================================================================
 */

function normalizeWeights(
  overrides:
    | Partial<StrategyLibrarySearchWeights>
    | undefined,
): StrategyLibrarySearchWeights {
  if (
    overrides !== undefined &&
    (
      typeof overrides !== "object" ||
      overrides === null ||
      Array.isArray(overrides)
    )
  ) {
    throw new StrategyLibrarySearchEngineError(
      "INVALID_ARGUMENT",
      "options.weights must be an object.",
      {
        field: "options.weights",
      },
    );
  }

  const result: StrategyLibrarySearchWeights = {
    ...DEFAULT_SEARCH_WEIGHTS,
    ...overrides,
  };

  for (
    const [
      key,
      value,
    ] of Object.entries(result)
  ) {
    assertFiniteNonNegativeNumber(
      value,
      `options.weights.${key}`,
    );
  }

  return Object.freeze(result);
}

function normalizeTextInput(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibrarySearchEngineError(
      "INVALID_QUERY",
      `${field} must be a string.`,
      { field },
    );
  }

  const normalized =
    normalizeSearchText(value);

  if (
    normalized.length >
    maximumLength
  ) {
    throw new StrategyLibrarySearchEngineError(
      "INVALID_QUERY",
      `${field} cannot exceed ${maximumLength} characters.`,
      { field },
    );
  }

  return normalized;
}

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[_/\\|]+/g, " ")
    .replace(/[^\p{L}\p{N}.+\- ]/gu, " ")
    .replace(/\s+/g, " ");
}

function tokenize(
  value: string,
): readonly string[] {
  const normalized =
    normalizeSearchText(value);

  if (normalized.length === 0) {
    return Object.freeze([]);
  }

  return Object.freeze(
    [...new Set(
      normalized
        .split(" ")
        .filter(
          (token) =>
            token.length > 0,
        ),
    )].sort(compareText),
  );
}

function stableSearchText(
  value: unknown,
): string {
  return normalizeSearchText(
    collectPrimitiveText(value)
      .sort(compareText)
      .join(" "),
  );
}

function collectPrimitiveText(
  value: unknown,
  visited: Set<object> =
    new Set<object>(),
): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (typeof value !== "object") {
    return [];
  }

  if (visited.has(value)) {
    return [];
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap(
      (item) =>
        collectPrimitiveText(
          item,
          visited,
        ),
    );
  }

  return Reflect.ownKeys(value)
    .sort((left, right) =>
      String(left).localeCompare(
        String(right),
      ),
    )
    .flatMap((key) =>
      collectPrimitiveText(
        (
          value as Record<
            PropertyKey,
            unknown
          >
        )[key],
        visited,
      ),
    );
}

function manifestSortText(
  entry: StrategyLibraryEntry,
): string {
  const manifestText =
    stableSearchText(entry.manifest);

  return manifestText.length > 0
    ? manifestText
    : entry.strategyId;
}

function normalizeScore(
  value: number,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new StrategyLibrarySearchEngineError(
      "INVALID_SCORE",
      "search score must be a finite non-negative number.",
    );
  }

  return Number(
    value.toFixed(12),
  );
}

/* ============================================================================
 * Validation helpers
 * ============================================================================
 */

function assertRegistry(
  registry: StrategyLibraryRegistryPort,
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
    throw new StrategyLibrarySearchEngineError(
      "INVALID_ARGUMENT",
      "registry must implement StrategyLibraryRegistryPort.",
      {
        field: "registry",
      },
    );
  }
}

function assertOptions(
  options: StrategyLibrarySearchEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibrarySearchEngineError(
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
    throw new StrategyLibrarySearchEngineError(
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
    throw new StrategyLibrarySearchEngineError(
      field.endsWith("offset")
        ? "INVALID_OFFSET"
        : "INVALID_ARGUMENT",
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
    throw new StrategyLibrarySearchEngineError(
      field.endsWith(
        "minimumScore",
      )
        ? "INVALID_SCORE"
        : "INVALID_ARGUMENT",
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
    throw new StrategyLibrarySearchEngineError(
      "INVALID_ARGUMENT",
      `${field} must return a non-negative safe integer timestamp.`,
      { field },
    );
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