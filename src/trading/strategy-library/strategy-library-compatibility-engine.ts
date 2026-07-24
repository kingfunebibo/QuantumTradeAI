/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-compatibility-engine.ts
 *
 * Purpose:
 * Provides deterministic and immutable compatibility evaluation for
 * Professional Trading Strategy Library entries.
 *
 * Compatibility is evaluated against:
 *
 * - market type
 * - trading mode
 * - execution environment
 * - timeframe and minimum history
 * - available capital
 * - leverage requirements
 * - hedge and one-way position modes
 * - short-selling availability
 * - required strategy capabilities
 * - market regime suitability
 * - maximum accepted risk
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyCapability,
  type StrategyEnvironment,
  type StrategyId,
  type StrategyMarketType,
  type StrategyMetadata,
  type StrategyTradingMode,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  EMPTY_STRATEGY_LIBRARY_ENTRIES,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryMarketRegime,
  type StrategyLibraryRegimeCompatibility,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRiskLevel,
} from "./strategy-library-contracts";

/* ============================================================================
 * Error contracts
 * ============================================================================
 */

export type StrategyLibraryCompatibilityEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "ENTRY_NOT_FOUND"
  | "INVALID_CONTEXT"
  | "INVALID_SCORE"
  | "EVALUATION_FAILED";

export interface StrategyLibraryCompatibilityEngineErrorDetails {
  readonly entryId?: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly strategyVersion?: StrategyVersion;
  readonly field?: string;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryCompatibilityEngineError extends Error {
  public readonly code:
    StrategyLibraryCompatibilityEngineErrorCode;

  public readonly entryId?:
    StrategyLibraryEntryId;

  public readonly strategyId?:
    StrategyId;

  public readonly strategyVersion?:
    StrategyVersion;

  public readonly field?: string;

  public readonly cause?: unknown;

  public readonly metadata:
    StrategyMetadata;

  public constructor(
    code:
      StrategyLibraryCompatibilityEngineErrorCode,
    message: string,
    details:
      StrategyLibraryCompatibilityEngineErrorDetails = {},
  ) {
    super(message);

    this.name =
      "StrategyLibraryCompatibilityEngineError";

    this.code = code;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.strategyVersion =
      details.strategyVersion;
    this.field = details.field;
    this.cause = details.cause;

    this.metadata = immutableCopy(
      details.metadata ??
        EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryCompatibilityEngineError
        .prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Clock and option contracts
 * ============================================================================
 */

export interface StrategyLibraryCompatibilityClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryCompatibilityWeights {
  readonly marketType: number;
  readonly tradingMode: number;
  readonly environment: number;
  readonly timeframe: number;
  readonly capital: number;
  readonly leverage: number;
  readonly positionMode: number;
  readonly shortSelling: number;
  readonly capabilities: number;
  readonly regime: number;
  readonly risk: number;
}

export interface StrategyLibraryCompatibilityEngineOptions {
  readonly clock?:
    StrategyLibraryCompatibilityClock;

  readonly minimumCompatibleScore?: number;

  readonly rejectDeprecated?: boolean;

  readonly rejectRetired?: boolean;

  readonly requirePreferredTimeframe?: boolean;

  readonly treatUnknownRegimeAsNeutral?: boolean;

  readonly weights?:
    Partial<StrategyLibraryCompatibilityWeights>;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Compatibility context
 * ============================================================================
 */

export type StrategyLibraryPositionMode =
  | "ONE_WAY"
  | "HEDGE";

export interface StrategyLibraryCompatibilityContext {
  readonly marketType?: StrategyMarketType;

  readonly tradingMode?: StrategyTradingMode;

  readonly environment?: StrategyEnvironment;

  readonly timeframe?: string;

  readonly availableHistory?: number;

  readonly availableCapital?: number;

  readonly requestedLeverage?: number;

  readonly positionMode?:
    StrategyLibraryPositionMode;

  readonly fractionalQuantityAvailable?:
    boolean;

  readonly shortSellingAvailable?:
    boolean;

  readonly availableCapabilities?:
    readonly StrategyCapability[];

  readonly marketRegime?:
    StrategyLibraryMarketRegime;

  readonly maximumRiskLevel?:
    StrategyLibraryRiskLevel;

  readonly metadata?: StrategyMetadata;
}

/* ============================================================================
 * Result contracts
 * ============================================================================
 */

export type StrategyLibraryCompatibilityDimension =
  | "STATUS"
  | "MARKET_TYPE"
  | "TRADING_MODE"
  | "ENVIRONMENT"
  | "TIMEFRAME"
  | "HISTORY"
  | "CAPITAL"
  | "LEVERAGE"
  | "POSITION_MODE"
  | "FRACTIONAL_QUANTITY"
  | "SHORT_SELLING"
  | "CAPABILITY"
  | "REGIME"
  | "RISK";

export type StrategyLibraryCompatibilitySeverity =
  | "INFO"
  | "WARNING"
  | "ERROR";

export interface StrategyLibraryCompatibilityIssue {
  readonly dimension:
    StrategyLibraryCompatibilityDimension;

  readonly severity:
    StrategyLibraryCompatibilitySeverity;

  readonly code: string;

  readonly message: string;

  readonly blocking: boolean;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryCompatibilityDimensionScore {
  readonly dimension:
    StrategyLibraryCompatibilityDimension;

  readonly applicable: boolean;

  readonly compatible: boolean;

  readonly score: number;

  readonly weight: number;

  readonly weightedScore: number;

  readonly explanation: string;
}

export interface StrategyLibraryCompatibilityResult {
  readonly entry:
    StrategyLibraryEntry;

  readonly compatible: boolean;

  readonly score: number;

  readonly matchedWeight: number;

  readonly applicableWeight: number;

  readonly dimensions:
    readonly StrategyLibraryCompatibilityDimensionScore[];

  readonly issues:
    readonly StrategyLibraryCompatibilityIssue[];

  readonly evaluatedAt:
    UnixTimestampMilliseconds;

  readonly metadata:
    StrategyMetadata;
}

export interface StrategyLibraryCompatibilityRankingItem {
  readonly rank: number;

  readonly result:
    StrategyLibraryCompatibilityResult;
}

export interface StrategyLibraryCompatibilityRanking {
  readonly context:
    StrategyLibraryCompatibilityContext;

  readonly totalEvaluated: number;

  readonly totalCompatible: number;

  readonly items:
    readonly StrategyLibraryCompatibilityRankingItem[];

  readonly evaluatedAt:
    UnixTimestampMilliseconds;

  readonly metadata:
    StrategyMetadata;
}

/* ============================================================================
 * Internal contracts
 * ============================================================================
 */

interface MutableEvaluationState {
  readonly dimensions:
    StrategyLibraryCompatibilityDimensionScore[];

  readonly issues:
    StrategyLibraryCompatibilityIssue[];

  matchedWeight: number;

  applicableWeight: number;

  blockingIssueCount: number;
}

/* ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_COMPATIBILITY_CLOCK:
  StrategyLibraryCompatibilityClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

const DEFAULT_COMPATIBILITY_WEIGHTS:
  StrategyLibraryCompatibilityWeights =
  Object.freeze({
    marketType: 15,
    tradingMode: 10,
    environment: 10,
    timeframe: 10,
    capital: 10,
    leverage: 10,
    positionMode: 5,
    shortSelling: 5,
    capabilities: 10,
    regime: 10,
    risk: 5,
  });

const RISK_LEVEL_ORDER:
  Readonly<Record<StrategyLibraryRiskLevel, number>> =
  Object.freeze({
    VERY_LOW: 0,
    LOW: 1,
    MODERATE: 2,
    HIGH: 3,
    VERY_HIGH: 4,
  });

const REGIME_COMPATIBILITY_SCORE:
  Readonly<
    Record<
      StrategyLibraryRegimeCompatibility,
      number
    >
  > =
  Object.freeze({
    PREFERRED: 1,
    SUPPORTED: 0.8,
    NEUTRAL: 0.5,
    DISCOURAGED: 0.25,
    UNSUPPORTED: 0,
  });

const EMPTY_COMPATIBILITY_ISSUES:
  readonly StrategyLibraryCompatibilityIssue[] =
  Object.freeze([]);

const EMPTY_COMPATIBILITY_DIMENSIONS:
  readonly StrategyLibraryCompatibilityDimensionScore[] =
  Object.freeze([]);

const EMPTY_COMPATIBILITY_RANKING_ITEMS:
  readonly StrategyLibraryCompatibilityRankingItem[] =
  Object.freeze([]);

/* ============================================================================
 * Compatibility engine
 * ============================================================================
 */

export class StrategyLibraryCompatibilityEngine {
  private readonly registry:
    StrategyLibraryRegistryPort;

  private readonly clock:
    StrategyLibraryCompatibilityClock;

  private readonly minimumCompatibleScore:
    number;

  private readonly rejectDeprecated:
    boolean;

  private readonly rejectRetired:
    boolean;

  private readonly requirePreferredTimeframe:
    boolean;

  private readonly treatUnknownRegimeAsNeutral:
    boolean;

  private readonly weights:
    StrategyLibraryCompatibilityWeights;

  private readonly metadata:
    StrategyMetadata;

  public constructor(
    registry: StrategyLibraryRegistryPort,
    options:
      StrategyLibraryCompatibilityEngineOptions = {},
  ) {
    assertRegistry(registry);
    assertOptions(options);

    this.registry = registry;

    this.clock =
      options.clock ??
      DEFAULT_COMPATIBILITY_CLOCK;

    this.minimumCompatibleScore =
      options.minimumCompatibleScore ??
      0.6;

    assertUnitScore(
      this.minimumCompatibleScore,
      "options.minimumCompatibleScore",
    );

    this.rejectDeprecated =
      options.rejectDeprecated ?? true;

    this.rejectRetired =
      options.rejectRetired ?? true;

    this.requirePreferredTimeframe =
      options.requirePreferredTimeframe ??
      false;

    this.treatUnknownRegimeAsNeutral =
      options.treatUnknownRegimeAsNeutral ??
      true;

    this.weights =
      normalizeWeights(
        options.weights,
      );

    this.metadata = immutableCopy(
      options.metadata ??
        EMPTY_STRATEGY_METADATA,
    );

    assertTimestamp(
      this.clock.now(),
      "options.clock.now()",
    );
  }

  public evaluate(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
  ): StrategyLibraryCompatibilityResult {
    assertEntry(entry);

    const normalizedContext =
      normalizeContext(context);

    try {
      const state:
        MutableEvaluationState = {
          dimensions: [],
          issues: [],
          matchedWeight: 0,
          applicableWeight: 0,
          blockingIssueCount: 0,
        };

      this.evaluateStatus(
        entry,
        state,
      );

      this.evaluateMarketType(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateTradingMode(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateEnvironment(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateTimeframe(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateCapital(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateLeverage(
        entry,
        normalizedContext,
        state,
      );

      this.evaluatePositionMode(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateFractionalQuantity(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateShortSelling(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateCapabilities(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateRegime(
        entry,
        normalizedContext,
        state,
      );

      this.evaluateRisk(
        entry,
        normalizedContext,
        state,
      );

      const score =
        state.applicableWeight === 0
          ? 1
          : normalizeScore(
              state.matchedWeight /
                state.applicableWeight,
            );

      const compatible =
        state.blockingIssueCount === 0 &&
        score >=
          this.minimumCompatibleScore;

      return deepFreeze({
        entry,
        compatible,
        score,
        matchedWeight:
          normalizeNumber(
            state.matchedWeight,
          ),
        applicableWeight:
          normalizeNumber(
            state.applicableWeight,
          ),
        dimensions:
          state.dimensions.length === 0
            ? EMPTY_COMPATIBILITY_DIMENSIONS
            : Object.freeze(
                [...state.dimensions],
              ),
        issues:
          state.issues.length === 0
            ? EMPTY_COMPATIBILITY_ISSUES
            : Object.freeze(
                [...state.issues],
              ),
        evaluatedAt: this.now(),
        metadata: immutableCopy(
          normalizedContext.metadata ??
            this.metadata,
        ),
      });
    } catch (cause) {
      if (
        cause instanceof
        StrategyLibraryCompatibilityEngineError
      ) {
        throw cause;
      }

      throw new StrategyLibraryCompatibilityEngineError(
        "EVALUATION_FAILED",
        `Compatibility evaluation failed for strategy library entry '${entry.entryId}'.`,
        {
          entryId: entry.entryId,
          strategyId: entry.strategyId,
          strategyVersion:
            entry.strategyVersion,
          cause,
          metadata: this.metadata,
        },
      );
    }
  }

  public evaluateByStrategy(
    strategyId: StrategyId,
    strategyVersion:
      StrategyVersion | undefined,
    context:
      StrategyLibraryCompatibilityContext,
  ): StrategyLibraryCompatibilityResult {
    const normalizedStrategyId =
      normalizeIdentifier(
        strategyId,
        "strategyId",
      );

    const normalizedVersion =
      strategyVersion === undefined
        ? undefined
        : normalizeIdentifier(
            strategyVersion,
            "strategyVersion",
          );

    const entry =
      this.registry.get(
        normalizedStrategyId,
        normalizedVersion,
      );

    if (entry === undefined) {
      throw new StrategyLibraryCompatibilityEngineError(
        "ENTRY_NOT_FOUND",
        normalizedVersion === undefined
          ? `No strategy library entry was found for strategy '${normalizedStrategyId}'.`
          : `No strategy library entry was found for strategy '${normalizedStrategyId}' version '${normalizedVersion}'.`,
        {
          strategyId:
            normalizedStrategyId,
          strategyVersion:
            normalizedVersion,
          metadata: this.metadata,
        },
      );
    }

    return this.evaluate(
      entry,
      context,
    );
  }

  public isCompatible(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
  ): boolean {
    return this.evaluate(
      entry,
      context,
    ).compatible;
  }

  public rank(
    context:
      StrategyLibraryCompatibilityContext,
    entries:
      readonly StrategyLibraryEntry[] =
        this.registry.list(),
  ): StrategyLibraryCompatibilityRanking {
    const normalizedContext =
      normalizeContext(context);

    if (!Array.isArray(entries)) {
      throw new StrategyLibraryCompatibilityEngineError(
        "INVALID_ARGUMENT",
        "entries must be an array.",
        {
          field: "entries",
          metadata: this.metadata,
        },
      );
    }

    const results =
      entries
        .map((entry) =>
          this.evaluate(
            entry,
            normalizedContext,
          ),
        )
        .sort(compareCompatibilityResults);

    const items =
      results.map(
        (
          result,
          index,
        ): StrategyLibraryCompatibilityRankingItem =>
          deepFreeze({
            rank: index + 1,
            result,
          }),
      );

    return deepFreeze({
      context:
        immutableCopy(
          normalizedContext,
        ),
      totalEvaluated:
        results.length,
      totalCompatible:
        results.filter(
          (result) =>
            result.compatible,
        ).length,
      items:
        items.length === 0
          ? EMPTY_COMPATIBILITY_RANKING_ITEMS
          : Object.freeze(items),
      evaluatedAt: this.now(),
      metadata: this.metadata,
    });
  }

  public compatibleEntries(
    context:
      StrategyLibraryCompatibilityContext,
  ): readonly StrategyLibraryEntry[] {
    const ranking =
      this.rank(context);

    const entries =
      ranking.items
        .filter(
          (item) =>
            item.result.compatible,
        )
        .map(
          (item) =>
            item.result.entry,
        );

    return entries.length === 0
      ? EMPTY_STRATEGY_LIBRARY_ENTRIES
      : Object.freeze(entries);
  }

  private evaluateStatus(
    entry: StrategyLibraryEntry,
    state: MutableEvaluationState,
  ): void {
    if (
      entry.status === "RETIRED" &&
      this.rejectRetired
    ) {
      this.addDimension(
        state,
        "STATUS",
        true,
        false,
        0,
        0,
        `Entry status '${entry.status}' is not compatible.`,
      );

      this.addIssue(
        state,
        "STATUS",
        "ERROR",
        "RETIRED_ENTRY",
        `Strategy library entry '${entry.entryId}' is retired.`,
        true,
      );

      return;
    }

    if (
      entry.status === "DEPRECATED" &&
      this.rejectDeprecated
    ) {
      this.addDimension(
        state,
        "STATUS",
        true,
        false,
        0,
        0,
        `Entry status '${entry.status}' is not compatible.`,
      );

      this.addIssue(
        state,
        "STATUS",
        "ERROR",
        "DEPRECATED_ENTRY",
        `Strategy library entry '${entry.entryId}' is deprecated.`,
        true,
      );

      return;
    }

    this.addDimension(
      state,
      "STATUS",
      true,
      true,
      1,
      0,
      `Entry status '${entry.status}' is accepted.`,
    );
  }

  private evaluateMarketType(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const marketType =
      context.marketType;

    if (marketType === undefined) {
      this.addNotApplicable(
        state,
        "MARKET_TYPE",
        "No market type was provided.",
      );

      return;
    }

    const compatible =
      entry.compatibilityProfile
        .marketTypes
        .includes(marketType);

    this.addWeightedDimension(
      state,
      "MARKET_TYPE",
      compatible ? 1 : 0,
      this.weights.marketType,
      compatible,
      compatible
        ? `Market type '${marketType}' is supported.`
        : `Market type '${marketType}' is not supported.`,
    );

    if (!compatible) {
      this.addIssue(
        state,
        "MARKET_TYPE",
        "ERROR",
        "UNSUPPORTED_MARKET_TYPE",
        `Strategy '${entry.strategyId}' does not support market type '${marketType}'.`,
        true,
      );
    }
  }

  private evaluateTradingMode(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const tradingMode =
      context.tradingMode;

    if (tradingMode === undefined) {
      this.addNotApplicable(
        state,
        "TRADING_MODE",
        "No trading mode was provided.",
      );

      return;
    }

    const compatible =
      entry.compatibilityProfile
        .tradingModes
        .includes(tradingMode);

    this.addWeightedDimension(
      state,
      "TRADING_MODE",
      compatible ? 1 : 0,
      this.weights.tradingMode,
      compatible,
      compatible
        ? `Trading mode '${tradingMode}' is supported.`
        : `Trading mode '${tradingMode}' is not supported.`,
    );

    if (!compatible) {
      this.addIssue(
        state,
        "TRADING_MODE",
        "ERROR",
        "UNSUPPORTED_TRADING_MODE",
        `Strategy '${entry.strategyId}' does not support trading mode '${tradingMode}'.`,
        true,
      );
    }
  }

  private evaluateEnvironment(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const environment =
      context.environment;

    if (environment === undefined) {
      this.addNotApplicable(
        state,
        "ENVIRONMENT",
        "No execution environment was provided.",
      );

      return;
    }

    const compatible =
      entry.compatibilityProfile
        .environments
        .includes(environment);

    this.addWeightedDimension(
      state,
      "ENVIRONMENT",
      compatible ? 1 : 0,
      this.weights.environment,
      compatible,
      compatible
        ? `Environment '${environment}' is supported.`
        : `Environment '${environment}' is not supported.`,
    );

    if (!compatible) {
      this.addIssue(
        state,
        "ENVIRONMENT",
        "ERROR",
        "UNSUPPORTED_ENVIRONMENT",
        `Strategy '${entry.strategyId}' does not support environment '${environment}'.`,
        true,
      );
    }
  }

  private evaluateTimeframe(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const timeframe =
      context.timeframe;

    if (timeframe === undefined) {
      this.addNotApplicable(
        state,
        "TIMEFRAME",
        "No timeframe was provided.",
      );

      this.addNotApplicable(
        state,
        "HISTORY",
        "History compatibility requires a timeframe.",
      );

      return;
    }

    const normalizedTimeframe =
      normalizeIdentifier(
        timeframe,
        "context.timeframe",
      );

    const compatibility =
      entry.compatibilityProfile
        .timeframes
        .find(
          (candidate) =>
            normalizeComparableText(
              candidate.timeframe,
            ) ===
            normalizeComparableText(
              normalizedTimeframe,
            ),
        );

    if (
      compatibility === undefined ||
      !compatibility.supported
    ) {
      this.addWeightedDimension(
        state,
        "TIMEFRAME",
        0,
        this.weights.timeframe,
        false,
        `Timeframe '${normalizedTimeframe}' is not supported.`,
      );

      this.addIssue(
        state,
        "TIMEFRAME",
        "ERROR",
        "UNSUPPORTED_TIMEFRAME",
        `Strategy '${entry.strategyId}' does not support timeframe '${normalizedTimeframe}'.`,
        true,
      );

      this.addNotApplicable(
        state,
        "HISTORY",
        "History was not evaluated because the timeframe is unsupported.",
      );

      return;
    }

    const preferred =
      compatibility.preferred;

    const timeframeScore =
      preferred
        ? 1
        : this.requirePreferredTimeframe
          ? 0
          : 0.8;

    const timeframeCompatible =
      preferred ||
      !this.requirePreferredTimeframe;

    this.addWeightedDimension(
      state,
      "TIMEFRAME",
      timeframeScore,
      this.weights.timeframe,
      timeframeCompatible,
      preferred
        ? `Timeframe '${normalizedTimeframe}' is preferred.`
        : `Timeframe '${normalizedTimeframe}' is supported but not preferred.`,
    );

    if (!timeframeCompatible) {
      this.addIssue(
        state,
        "TIMEFRAME",
        "ERROR",
        "NON_PREFERRED_TIMEFRAME",
        `Timeframe '${normalizedTimeframe}' is supported but not preferred.`,
        true,
      );
    } else if (!preferred) {
      this.addIssue(
        state,
        "TIMEFRAME",
        "WARNING",
        "NON_PREFERRED_TIMEFRAME",
        `Timeframe '${normalizedTimeframe}' is supported but not preferred.`,
        false,
      );
    }

    const availableHistory =
      context.availableHistory;

    if (availableHistory === undefined) {
      this.addNotApplicable(
        state,
        "HISTORY",
        `Minimum required history is ${compatibility.minimumHistory}, but available history was not supplied.`,
      );

      return;
    }

    const enoughHistory =
      availableHistory >=
      compatibility.minimumHistory;

    this.addDimension(
      state,
      "HISTORY",
      true,
      enoughHistory,
      enoughHistory ? 1 : 0,
      0,
      enoughHistory
        ? `Available history ${availableHistory} satisfies the minimum requirement of ${compatibility.minimumHistory}.`
        : `Available history ${availableHistory} is below the minimum requirement of ${compatibility.minimumHistory}.`,
    );

    if (!enoughHistory) {
      this.addIssue(
        state,
        "HISTORY",
        "ERROR",
        "INSUFFICIENT_HISTORY",
        `Strategy '${entry.strategyId}' requires at least ${compatibility.minimumHistory} history units for timeframe '${normalizedTimeframe}'.`,
        true,
      );
    }
  }

  private evaluateCapital(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const capital =
      context.availableCapital;

    if (capital === undefined) {
      this.addNotApplicable(
        state,
        "CAPITAL",
        "No available capital was provided.",
      );

      return;
    }

    const minimum =
      entry.compatibilityProfile
        .minimumCapital;

    const maximum =
      entry.compatibilityProfile
        .maximumCapital;

    const aboveMinimum =
      minimum === undefined ||
      capital >= minimum;

    const belowMaximum =
      maximum === undefined ||
      capital <= maximum;

    const compatible =
      aboveMinimum &&
      belowMaximum;

    this.addWeightedDimension(
      state,
      "CAPITAL",
      compatible ? 1 : 0,
      this.weights.capital,
      compatible,
      compatible
        ? `Available capital ${capital} is within the supported range.`
        : `Available capital ${capital} is outside the supported range.`,
    );

    if (!aboveMinimum) {
      this.addIssue(
        state,
        "CAPITAL",
        "ERROR",
        "CAPITAL_BELOW_MINIMUM",
        `Available capital ${capital} is below the minimum required capital of ${String(minimum)}.`,
        true,
      );
    }

    if (!belowMaximum) {
      this.addIssue(
        state,
        "CAPITAL",
        "ERROR",
        "CAPITAL_ABOVE_MAXIMUM",
        `Available capital ${capital} exceeds the maximum supported capital of ${String(maximum)}.`,
        true,
      );
    }
  }

  private evaluateLeverage(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const leverage =
      context.requestedLeverage;

    if (leverage === undefined) {
      this.addNotApplicable(
        state,
        "LEVERAGE",
        "No requested leverage was provided.",
      );

      return;
    }

    const supportsLeverage =
      entry.compatibilityProfile
        .supportsLeverage;

    const maximumLeverage =
      entry.riskProfile
        .maximumRecommendedLeverage;

    const compatible =
      leverage <= 1 ||
      (
        supportsLeverage &&
        leverage <= maximumLeverage
      );

    this.addWeightedDimension(
      state,
      "LEVERAGE",
      compatible ? 1 : 0,
      this.weights.leverage,
      compatible,
      compatible
        ? `Requested leverage ${leverage} is supported.`
        : `Requested leverage ${leverage} is unsupported or exceeds the recommended maximum of ${maximumLeverage}.`,
    );

    if (
      leverage > 1 &&
      !supportsLeverage
    ) {
      this.addIssue(
        state,
        "LEVERAGE",
        "ERROR",
        "LEVERAGE_NOT_SUPPORTED",
        `Strategy '${entry.strategyId}' does not support leveraged operation.`,
        true,
      );

      return;
    }

    if (
      leverage >
      maximumLeverage
    ) {
      this.addIssue(
        state,
        "LEVERAGE",
        "ERROR",
        "LEVERAGE_EXCEEDS_RECOMMENDATION",
        `Requested leverage ${leverage} exceeds the maximum recommended leverage of ${maximumLeverage}.`,
        true,
      );
    }
  }

  private evaluatePositionMode(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const positionMode =
      context.positionMode;

    if (positionMode === undefined) {
      this.addNotApplicable(
        state,
        "POSITION_MODE",
        "No position mode was provided.",
      );

      return;
    }

    const compatible =
      positionMode === "HEDGE"
        ? entry.compatibilityProfile
            .supportsHedgeMode
        : entry.compatibilityProfile
            .supportsOneWayMode;

    this.addWeightedDimension(
      state,
      "POSITION_MODE",
      compatible ? 1 : 0,
      this.weights.positionMode,
      compatible,
      compatible
        ? `Position mode '${positionMode}' is supported.`
        : `Position mode '${positionMode}' is not supported.`,
    );

    if (!compatible) {
      this.addIssue(
        state,
        "POSITION_MODE",
        "ERROR",
        "UNSUPPORTED_POSITION_MODE",
        `Strategy '${entry.strategyId}' does not support position mode '${positionMode}'.`,
        true,
      );
    }
  }

  private evaluateFractionalQuantity(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const available =
      context.fractionalQuantityAvailable;

    if (available === undefined) {
      this.addNotApplicable(
        state,
        "FRACTIONAL_QUANTITY",
        "Fractional quantity availability was not provided.",
      );

      return;
    }

    const compatible =
      available ||
      !entry.compatibilityProfile
        .supportsFractionalQuantity;

    this.addDimension(
      state,
      "FRACTIONAL_QUANTITY",
      true,
      compatible,
      compatible ? 1 : 0,
      0,
      compatible
        ? "Fractional quantity requirements are satisfied."
        : "The strategy supports fractional quantity, but the environment does not.",
    );

    if (!compatible) {
      this.addIssue(
        state,
        "FRACTIONAL_QUANTITY",
        "WARNING",
        "FRACTIONAL_QUANTITY_UNAVAILABLE",
        "Fractional quantity support declared by the strategy is unavailable in the target environment.",
        false,
      );
    }
  }

  private evaluateShortSelling(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const available =
      context.shortSellingAvailable;

    if (available === undefined) {
      this.addNotApplicable(
        state,
        "SHORT_SELLING",
        "Short-selling availability was not provided.",
      );

      return;
    }

    const required =
      entry.compatibilityProfile
        .requiresShortSelling;

    const compatible =
      !required || available;

    this.addWeightedDimension(
      state,
      "SHORT_SELLING",
      compatible ? 1 : 0,
      this.weights.shortSelling,
      compatible,
      compatible
        ? "Short-selling requirements are satisfied."
        : "The strategy requires short selling, but it is unavailable.",
    );

    if (!compatible) {
      this.addIssue(
        state,
        "SHORT_SELLING",
        "ERROR",
        "SHORT_SELLING_REQUIRED",
        `Strategy '${entry.strategyId}' requires short-selling support.`,
        true,
      );
    }
  }

  private evaluateCapabilities(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const available =
      context.availableCapabilities;

    if (available === undefined) {
      this.addNotApplicable(
        state,
        "CAPABILITY",
        "No available capabilities were provided.",
      );

      return;
    }

    const availableSet =
      new Set(available);

    const missing =
      entry.compatibilityProfile
        .requiredCapabilities
        .filter(
          (capability) =>
            !availableSet.has(capability),
        );

    const requiredCount =
      entry.compatibilityProfile
        .requiredCapabilities.length;

    const matchedCount =
      requiredCount -
      missing.length;

    const score =
      requiredCount === 0
        ? 1
        : matchedCount /
          requiredCount;

    const compatible =
      missing.length === 0;

    this.addWeightedDimension(
      state,
      "CAPABILITY",
      score,
      this.weights.capabilities,
      compatible,
      compatible
        ? "All required capabilities are available."
        : `${missing.length} required capabilities are unavailable.`,
    );

    for (const capability of missing) {
      this.addIssue(
        state,
        "CAPABILITY",
        "ERROR",
        "MISSING_REQUIRED_CAPABILITY",
        `Required capability '${capability}' is unavailable.`,
        true,
      );
    }
  }

  private evaluateRegime(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const regime =
      context.marketRegime;

    if (regime === undefined) {
      this.addNotApplicable(
        state,
        "REGIME",
        "No market regime was provided.",
      );

      return;
    }

    const profile =
      entry.regimeProfiles.find(
        (candidate) =>
          candidate.regime === regime,
      );

    if (profile === undefined) {
      const neutral =
        regime === "UNKNOWN" &&
        this.treatUnknownRegimeAsNeutral;

      const score =
        neutral ? 0.5 : 0;

      this.addWeightedDimension(
        state,
        "REGIME",
        score,
        this.weights.regime,
        neutral,
        neutral
          ? "Unknown market regime is treated as neutral."
          : `No regime profile exists for '${regime}'.`,
      );

      if (!neutral) {
        this.addIssue(
          state,
          "REGIME",
          "WARNING",
          "REGIME_PROFILE_NOT_FOUND",
          `Strategy '${entry.strategyId}' has no compatibility profile for regime '${regime}'.`,
          false,
        );
      }

      return;
    }

    const score =
      normalizeScore(
        (
          REGIME_COMPATIBILITY_SCORE[
            profile.compatibility
          ] +
          profile.score
        ) / 2,
      );

    const compatible =
      profile.compatibility !==
        "UNSUPPORTED";

    this.addWeightedDimension(
      state,
      "REGIME",
      score,
      this.weights.regime,
      compatible,
      profile.rationale,
    );

    if (
      profile.compatibility ===
      "UNSUPPORTED"
    ) {
      this.addIssue(
        state,
        "REGIME",
        "ERROR",
        "UNSUPPORTED_MARKET_REGIME",
        `Strategy '${entry.strategyId}' is unsupported in regime '${regime}'.`,
        true,
      );
    } else if (
      profile.compatibility ===
      "DISCOURAGED"
    ) {
      this.addIssue(
        state,
        "REGIME",
        "WARNING",
        "DISCOURAGED_MARKET_REGIME",
        `Strategy '${entry.strategyId}' is discouraged in regime '${regime}'.`,
        false,
      );
    }
  }

  private evaluateRisk(
    entry: StrategyLibraryEntry,
    context:
      StrategyLibraryCompatibilityContext,
    state: MutableEvaluationState,
  ): void {
    const maximumRisk =
      context.maximumRiskLevel;

    if (maximumRisk === undefined) {
      this.addNotApplicable(
        state,
        "RISK",
        "No maximum accepted risk level was provided.",
      );

      return;
    }

    const strategyRisk =
      entry.riskProfile
        .overallRiskLevel;

    const compatible =
      RISK_LEVEL_ORDER[
        strategyRisk
      ] <=
      RISK_LEVEL_ORDER[
        maximumRisk
      ];

    this.addWeightedDimension(
      state,
      "RISK",
      compatible ? 1 : 0,
      this.weights.risk,
      compatible,
      compatible
        ? `Strategy risk '${strategyRisk}' is within the accepted maximum '${maximumRisk}'.`
        : `Strategy risk '${strategyRisk}' exceeds the accepted maximum '${maximumRisk}'.`,
    );

    if (!compatible) {
      this.addIssue(
        state,
        "RISK",
        "ERROR",
        "RISK_LEVEL_EXCEEDED",
        `Strategy risk level '${strategyRisk}' exceeds maximum accepted risk level '${maximumRisk}'.`,
        true,
      );
    }
  }

  private addWeightedDimension(
    state: MutableEvaluationState,
    dimension:
      StrategyLibraryCompatibilityDimension,
    score: number,
    weight: number,
    compatible: boolean,
    explanation: string,
  ): void {
    assertUnitScore(
      score,
      "dimension.score",
    );

    const weightedScore =
      score * weight;

    state.applicableWeight +=
      weight;

    state.matchedWeight +=
      weightedScore;

    this.addDimension(
      state,
      dimension,
      true,
      compatible,
      score,
      weight,
      explanation,
    );
  }

  private addNotApplicable(
    state: MutableEvaluationState,
    dimension:
      StrategyLibraryCompatibilityDimension,
    explanation: string,
  ): void {
    this.addDimension(
      state,
      dimension,
      false,
      true,
      1,
      0,
      explanation,
    );
  }

  private addDimension(
    state: MutableEvaluationState,
    dimension:
      StrategyLibraryCompatibilityDimension,
    applicable: boolean,
    compatible: boolean,
    score: number,
    weight: number,
    explanation: string,
  ): void {
    state.dimensions.push(
      deepFreeze({
        dimension,
        applicable,
        compatible,
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
      }),
    );
  }

  private addIssue(
    state: MutableEvaluationState,
    dimension:
      StrategyLibraryCompatibilityDimension,
    severity:
      StrategyLibraryCompatibilitySeverity,
    code: string,
    message: string,
    blocking: boolean,
  ): void {
    state.issues.push(
      deepFreeze({
        dimension,
        severity,
        code,
        message,
        blocking,
        metadata: this.metadata,
      }),
    );

    if (blocking) {
      state.blockingIssueCount += 1;
    }
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

export function createStrategyLibraryCompatibilityEngine(
  registry: StrategyLibraryRegistryPort,
  options:
    StrategyLibraryCompatibilityEngineOptions = {},
): StrategyLibraryCompatibilityEngine {
  return new StrategyLibraryCompatibilityEngine(
    registry,
    options,
  );
}

/* ============================================================================
 * Ranking helpers
 * ============================================================================
 */

function compareCompatibilityResults(
  left:
    StrategyLibraryCompatibilityResult,
  right:
    StrategyLibraryCompatibilityResult,
): number {
  if (
    left.compatible !==
    right.compatible
  ) {
    return left.compatible
      ? -1
      : 1;
  }

  if (
    left.score !==
    right.score
  ) {
    return (
      right.score -
      left.score
    );
  }

  const leftBlocking =
    left.issues.filter(
      (issue) =>
        issue.blocking,
    ).length;

  const rightBlocking =
    right.issues.filter(
      (issue) =>
        issue.blocking,
    ).length;

  if (
    leftBlocking !==
    rightBlocking
  ) {
    return (
      leftBlocking -
      rightBlocking
    );
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
 * Normalization
 * ============================================================================
 */

function normalizeContext(
  context:
    StrategyLibraryCompatibilityContext,
): StrategyLibraryCompatibilityContext {
  if (
    typeof context !== "object" ||
    context === null ||
    Array.isArray(context)
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_CONTEXT",
      "compatibility context must be an object.",
      {
        field: "context",
      },
    );
  }

  if (
    context.timeframe !== undefined
  ) {
    normalizeIdentifier(
      context.timeframe,
      "context.timeframe",
    );
  }

  if (
    context.availableHistory !== undefined
  ) {
    assertNonNegativeInteger(
      context.availableHistory,
      "context.availableHistory",
    );
  }

  if (
    context.availableCapital !== undefined
  ) {
    assertFiniteNonNegativeNumber(
      context.availableCapital,
      "context.availableCapital",
    );
  }

  if (
    context.requestedLeverage !== undefined
  ) {
    assertPositiveFiniteNumber(
      context.requestedLeverage,
      "context.requestedLeverage",
    );
  }

  if (
    context.availableCapabilities !==
      undefined &&
    !Array.isArray(
      context.availableCapabilities,
    )
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_CONTEXT",
      "context.availableCapabilities must be an array.",
      {
        field:
          "context.availableCapabilities",
      },
    );
  }

  return immutableCopy(context);
}

function normalizeWeights(
  weights:
    | Partial<StrategyLibraryCompatibilityWeights>
    | undefined,
): StrategyLibraryCompatibilityWeights {
  if (
    weights !== undefined &&
    (
      typeof weights !== "object" ||
      weights === null ||
      Array.isArray(weights)
    )
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      "options.weights must be an object.",
      {
        field: "options.weights",
      },
    );
  }

  const normalized:
    StrategyLibraryCompatibilityWeights = {
    ...DEFAULT_COMPATIBILITY_WEIGHTS,
    ...weights,
  };

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
  }

  return Object.freeze(normalized);
}

function normalizeIdentifier(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a string.`,
      { field },
    );
  }

  const normalized =
    value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must not be empty.`,
      { field },
    );
  }

  return normalized;
}

function normalizeComparableText(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US");
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
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_SCORE",
      "calculated compatibility value must be finite.",
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
    throw new StrategyLibraryCompatibilityEngineError(
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
    StrategyLibraryCompatibilityEngineOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      "options must be an object.",
      {
        field: "options",
      },
    );
  }
}

function assertEntry(
  entry: StrategyLibraryEntry,
): void {
  if (
    typeof entry !== "object" ||
    entry === null ||
    Array.isArray(entry)
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      "entry must be an object.",
      {
        field: "entry",
      },
    );
  }

  normalizeIdentifier(
    entry.entryId,
    "entry.entryId",
  );

  normalizeIdentifier(
    entry.strategyId,
    "entry.strategyId",
  );

  normalizeIdentifier(
    entry.strategyVersion,
    "entry.strategyVersion",
  );
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
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_SCORE",
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
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a finite non-negative number.`,
      { field },
    );
  }
}

function assertPositiveFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a finite positive number.`,
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
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer.`,
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
    throw new StrategyLibraryCompatibilityEngineError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative safe integer timestamp.`,
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