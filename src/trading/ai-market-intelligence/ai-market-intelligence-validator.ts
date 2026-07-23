/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * Deterministic, immutable validation for all AI market-intelligence contracts.
 */

import {
  AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
  AnomalySeverity,
  ConfidenceQuality,
  FeatureValueType,
  MarketDataQuality,
  MarketDirection,
  MarketIntelligencePipelineStage,
  MarketIntelligenceRunStatus,
  PredictionHorizon,
  ValidationSeverity,
  type AiMarketIntelligenceConfiguration,
  type AiMarketIntelligenceValidator,
  type AnomalyDetectionConfiguration,
  type ConfidenceAggregationConfiguration,
  type CorrelationIntelligenceConfiguration,
  type ExplainabilityConfiguration,
  type FeatureExtractionConfiguration,
  type JsonValue,
  type LiquidityPredictionConfiguration,
  type MarketAnomaly,
  type MarketCandle,
  type MarketCorrelationIntelligence,
  type MarketDataProvenance,
  type MarketDataQualityAssessment,
  type MarketFeature,
  type MarketFeatureVector,
  type MarketIdentity,
  type MarketIntelligenceInput,
  type MarketIntelligenceReport,
  type MarketIntelligenceRequest,
  type MarketIntelligenceRunTrace,
  type MarketRegimeIntelligence,
  type OrderBookSnapshot,
  type OrderFlowConfiguration,
  type OrderFlowIntelligence,
  type PredictionConfidenceEngine,
  type PredictionWindow,
  type PriceMovementPrediction,
  type PricePredictionConfiguration,
  type PublicationConfiguration,
  type ReferenceMarketInput,
  type RegimeIntelligenceConfiguration,
  type TimeRange,
  type UnifiedPredictionConfidence,
  type ValidationIssue,
  type ValidationResult,
  type VolatilityForecast,
  type VolatilityForecastConfiguration,
} from "./ai-market-intelligence-contracts";

const ROOT = "$";
const PERCENTAGE_TOLERANCE = 1e-9;
const PROBABILITY_SUM_TOLERANCE = 1e-6;

export interface AiMarketIntelligenceValidatorOptions {
  readonly failFast?: boolean;
  readonly maximumIssues?: number;
  readonly requireFrozenValues?: boolean;
  readonly validateDeterministicFingerprints?: boolean;
}

interface ResolvedValidatorOptions {
  readonly failFast: boolean;
  readonly maximumIssues: number;
  readonly requireFrozenValues: boolean;
  readonly validateDeterministicFingerprints: boolean;
}

interface ValidationContext {
  readonly options: ResolvedValidatorOptions;
  readonly issues: ValidationIssue[];
}

const DEFAULT_OPTIONS: ResolvedValidatorOptions = Object.freeze({
  failFast: false,
  maximumIssues: 500,
  requireFrozenValues: false,
  validateDeterministicFingerprints: true,
});

function resolveOptions(
  options?: AiMarketIntelligenceValidatorOptions,
): ResolvedValidatorOptions {
  const maximumIssues = options?.maximumIssues ?? DEFAULT_OPTIONS.maximumIssues;

  if (!Number.isSafeInteger(maximumIssues) || maximumIssues <= 0) {
    throw new TypeError("maximumIssues must be a positive safe integer.");
  }

  return Object.freeze({
    failFast: options?.failFast ?? DEFAULT_OPTIONS.failFast,
    maximumIssues,
    requireFrozenValues:
      options?.requireFrozenValues ?? DEFAULT_OPTIONS.requireFrozenValues,
    validateDeterministicFingerprints:
      options?.validateDeterministicFingerprints ??
      DEFAULT_OPTIONS.validateDeterministicFingerprints,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNormalized(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isPercentage(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -100 && value <= 100_000;
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isCorrelation(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -1 && value <= 1;
}

function isEnumValue<T extends string>(
  enumObject: Readonly<Record<string, T>>,
  value: unknown,
): value is T {
  return isString(value) && Object.values(enumObject).includes(value as T);
}

function asJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function path(parent: string, child: string | number): string {
  return typeof child === "number"
    ? `${parent}[${child}]`
    : parent === ROOT
      ? `${ROOT}.${child}`
      : `${parent}.${child}`;
}

function addIssue(
  context: ValidationContext,
  code: string,
  issuePath: string,
  severity: ValidationSeverity,
  message: string,
  actualValue?: unknown,
  expected?: string,
): void {
  if (context.issues.length >= context.options.maximumIssues) {
    return;
  }

  context.issues.push(
    Object.freeze({
      code,
      path: issuePath,
      severity,
      message,
      ...(asJsonValue(actualValue) === undefined
        ? {}
        : { actualValue: asJsonValue(actualValue) }),
      ...(expected === undefined ? {} : { expected }),
    }),
  );

  if (
    context.options.failFast &&
    (severity === ValidationSeverity.ERROR ||
      severity === ValidationSeverity.FATAL)
  ) {
    return;
  }
}

function requireRecord(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    addIssue(
      context,
      "EXPECTED_OBJECT",
      valuePath,
      ValidationSeverity.FATAL,
      "Value must be an object.",
      value,
      "object",
    );
    return false;
  }

  if (context.options.requireFrozenValues && !Object.isFrozen(value)) {
    addIssue(
      context,
      "VALUE_NOT_FROZEN",
      valuePath,
      ValidationSeverity.ERROR,
      "Object must be frozen to preserve immutable domain semantics.",
    );
  }

  return true;
}

function requireArray(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
  allowEmpty = true,
): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    addIssue(
      context,
      "EXPECTED_ARRAY",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be an array.",
      value,
      "array",
    );
    return false;
  }

  if (!allowEmpty && value.length === 0) {
    addIssue(
      context,
      "ARRAY_MUST_NOT_BE_EMPTY",
      valuePath,
      ValidationSeverity.ERROR,
      "Array must contain at least one item.",
    );
  }

  if (context.options.requireFrozenValues && !Object.isFrozen(value)) {
    addIssue(
      context,
      "ARRAY_NOT_FROZEN",
      valuePath,
      ValidationSeverity.ERROR,
      "Array must be frozen to preserve immutable domain semantics.",
    );
  }

  return true;
}

function requireString(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is string {
  if (!isNonEmptyString(value)) {
    addIssue(
      context,
      "EXPECTED_NON_EMPTY_STRING",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a non-empty string.",
      value,
      "non-empty string",
    );
    return false;
  }

  return true;
}

function requireFiniteNumber(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isFiniteNumber(value)) {
    addIssue(
      context,
      "EXPECTED_FINITE_NUMBER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a finite number.",
      value,
      "finite number",
    );
    return false;
  }

  return true;
}

function requireNonNegativeNumber(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isNonNegativeNumber(value)) {
    addIssue(
      context,
      "EXPECTED_NON_NEGATIVE_NUMBER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a finite non-negative number.",
      value,
      "number >= 0",
    );
    return false;
  }

  return true;
}

function requirePositiveNumber(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isPositiveNumber(value)) {
    addIssue(
      context,
      "EXPECTED_POSITIVE_NUMBER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a finite positive number.",
      value,
      "number > 0",
    );
    return false;
  }

  return true;
}

function requireSafeNonNegativeInteger(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isSafeNonNegativeInteger(value)) {
    addIssue(
      context,
      "EXPECTED_NON_NEGATIVE_SAFE_INTEGER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a non-negative safe integer.",
      value,
      "safe integer >= 0",
    );
    return false;
  }

  return true;
}

function requireSafePositiveInteger(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isSafePositiveInteger(value)) {
    addIssue(
      context,
      "EXPECTED_POSITIVE_SAFE_INTEGER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a positive safe integer.",
      value,
      "safe integer > 0",
    );
    return false;
  }

  return true;
}

function requireNormalized(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isNormalized(value)) {
    addIssue(
      context,
      "EXPECTED_NORMALIZED_NUMBER",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be between zero and one inclusive.",
      value,
      "0 <= value <= 1",
    );
    return false;
  }

  return true;
}

function requireCorrelation(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is number {
  if (!isCorrelation(value)) {
    addIssue(
      context,
      "EXPECTED_CORRELATION",
      valuePath,
      ValidationSeverity.ERROR,
      "Correlation coefficient must be between -1 and 1 inclusive.",
      value,
      "-1 <= value <= 1",
    );
    return false;
  }

  return true;
}

function requireBoolean(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is boolean {
  if (typeof value !== "boolean") {
    addIssue(
      context,
      "EXPECTED_BOOLEAN",
      valuePath,
      ValidationSeverity.ERROR,
      "Value must be a boolean.",
      value,
      "boolean",
    );
    return false;
  }

  return true;
}

function validateStringArray(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): void {
  if (!requireArray(context, value, valuePath)) return;

  value.forEach((entry, index) => {
    requireString(context, entry, path(valuePath, index));
  });
}

function validateUniqueStrings(
  context: ValidationContext,
  values: readonly string[],
  valuePath: string,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (seen.has(value)) {
      addIssue(
        context,
        "DUPLICATE_VALUE",
        path(valuePath, index),
        ValidationSeverity.ERROR,
        `Duplicate value "${value}" is not permitted.`,
        value,
      );
    }
    seen.add(value);
  });
}

function validateTimeRange(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is TimeRange {
  if (!requireRecord(context, value, valuePath)) return false;

  const startValid = requireSafeNonNegativeInteger(
    context,
    value.startTimeMs,
    path(valuePath, "startTimeMs"),
  );
  const endValid = requireSafeNonNegativeInteger(
    context,
    value.endTimeMs,
    path(valuePath, "endTimeMs"),
  );

  if (
    startValid &&
    endValid &&
    (value.endTimeMs as number) <= (value.startTimeMs as number)
  ) {
    addIssue(
      context,
      "INVALID_TIME_RANGE",
      valuePath,
      ValidationSeverity.ERROR,
      "endTimeMs must be greater than startTimeMs.",
    );
  }

  return startValid && endValid;
}

function validatePredictionWindow(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is PredictionWindow {
  if (!requireRecord(context, value, valuePath)) return false;

  if (!Object.values(PredictionHorizon).includes(value.horizon as PredictionHorizon)) {
    addIssue(
      context,
      "INVALID_PREDICTION_HORIZON",
      path(valuePath, "horizon"),
      ValidationSeverity.ERROR,
      "Unsupported prediction horizon.",
      value.horizon,
    );
  }

  const durationValid = requireSafePositiveInteger(
    context,
    value.durationMs,
    path(valuePath, "durationMs"),
  );
  const startValid = requireSafeNonNegativeInteger(
    context,
    value.startTimeMs,
    path(valuePath, "startTimeMs"),
  );
  const endValid = requireSafeNonNegativeInteger(
    context,
    value.endTimeMs,
    path(valuePath, "endTimeMs"),
  );

  if (startValid && endValid && durationValid) {
    const calculatedDuration =
      (value.endTimeMs as number) - (value.startTimeMs as number);

    if (calculatedDuration !== value.durationMs) {
      addIssue(
        context,
        "PREDICTION_WINDOW_DURATION_MISMATCH",
        valuePath,
        ValidationSeverity.ERROR,
        "durationMs must equal endTimeMs minus startTimeMs.",
      );
    }
  }

  return durationValid && startValid && endValid;
}

function validateMarketIdentity(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketIdentity {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.symbol, path(valuePath, "symbol"));
  requireString(context, value.baseAsset, path(valuePath, "baseAsset"));
  requireString(context, value.quoteAsset, path(valuePath, "quoteAsset"));
  requireString(context, value.venueId, path(valuePath, "venueId"));
  requireString(context, value.venueType, path(valuePath, "venueType"));
  requireString(context, value.instrumentType, path(valuePath, "instrumentType"));

  if (
    isNonEmptyString(value.baseAsset) &&
    isNonEmptyString(value.quoteAsset) &&
    value.baseAsset === value.quoteAsset
  ) {
    addIssue(
      context,
      "IDENTICAL_BASE_AND_QUOTE_ASSET",
      valuePath,
      ValidationSeverity.ERROR,
      "baseAsset and quoteAsset must differ.",
    );
  }

  return true;
}

function validateProvenance(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketDataProvenance {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.sourceId, path(valuePath, "sourceId"));
  requireString(context, value.sourceType, path(valuePath, "sourceType"));
  requireSafeNonNegativeInteger(
    context,
    value.receivedAtMs,
    path(valuePath, "receivedAtMs"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.eventTimeMs,
    path(valuePath, "eventTimeMs"),
  );

  if (
    isSafeNonNegativeInteger(value.receivedAtMs) &&
    isSafeNonNegativeInteger(value.eventTimeMs) &&
    value.receivedAtMs < value.eventTimeMs
  ) {
    addIssue(
      context,
      "PROVENANCE_RECEIVED_BEFORE_EVENT",
      valuePath,
      ValidationSeverity.WARNING,
      "receivedAtMs precedes eventTimeMs.",
    );
  }

  if (value.sequenceNumber !== undefined) {
    requireSafeNonNegativeInteger(
      context,
      value.sequenceNumber,
      path(valuePath, "sequenceNumber"),
    );
  }

  if (value.checksum !== undefined) {
    requireString(context, value.checksum, path(valuePath, "checksum"));
  }

  return true;
}

function validateDataQuality(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketDataQualityAssessment {
  if (!requireRecord(context, value, valuePath)) return false;

  if (!Object.values(MarketDataQuality).includes(value.quality as MarketDataQuality)) {
    addIssue(
      context,
      "INVALID_DATA_QUALITY",
      path(valuePath, "quality"),
      ValidationSeverity.ERROR,
      "Unsupported market data quality value.",
      value.quality,
    );
  }

  requireNormalized(
    context,
    value.completenessScore,
    path(valuePath, "completenessScore"),
  );
  requireNormalized(
    context,
    value.freshnessScore,
    path(valuePath, "freshnessScore"),
  );
  requireNormalized(
    context,
    value.consistencyScore,
    path(valuePath, "consistencyScore"),
  );
  requireNormalized(
    context,
    value.orderingScore,
    path(valuePath, "orderingScore"),
  );
  requireNormalized(
    context,
    value.duplicateRate,
    path(valuePath, "duplicateRate"),
  );
  requireNormalized(
    context,
    value.missingValueRate,
    path(valuePath, "missingValueRate"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.staleByMs,
    path(valuePath, "staleByMs"),
  );
  validateStringArray(context, value.warnings, path(valuePath, "warnings"));

  return true;
}

function validateCandle(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketCandle {
  if (!requireRecord(context, value, valuePath)) return false;

  const openTimeValid = requireSafeNonNegativeInteger(
    context,
    value.openTimeMs,
    path(valuePath, "openTimeMs"),
  );
  const closeTimeValid = requireSafeNonNegativeInteger(
    context,
    value.closeTimeMs,
    path(valuePath, "closeTimeMs"),
  );

  requirePositiveNumber(context, value.open, path(valuePath, "open"));
  requirePositiveNumber(context, value.high, path(valuePath, "high"));
  requirePositiveNumber(context, value.low, path(valuePath, "low"));
  requirePositiveNumber(context, value.close, path(valuePath, "close"));
  requireNonNegativeNumber(context, value.volume, path(valuePath, "volume"));
  requireBoolean(context, value.isClosed, path(valuePath, "isClosed"));
  validateProvenance(context, value.provenance, path(valuePath, "provenance"));

  if (
    isPositiveNumber(value.high) &&
    isPositiveNumber(value.low) &&
    value.high < value.low
  ) {
    addIssue(
      context,
      "CANDLE_HIGH_BELOW_LOW",
      valuePath,
      ValidationSeverity.ERROR,
      "Candle high cannot be below candle low.",
    );
  }

  if (
    isPositiveNumber(value.high) &&
    isPositiveNumber(value.low) &&
    isPositiveNumber(value.open) &&
    (value.open > value.high || value.open < value.low)
  ) {
    addIssue(
      context,
      "CANDLE_OPEN_OUTSIDE_RANGE",
      path(valuePath, "open"),
      ValidationSeverity.ERROR,
      "Candle open must lie between low and high.",
    );
  }

  if (
    isPositiveNumber(value.high) &&
    isPositiveNumber(value.low) &&
    isPositiveNumber(value.close) &&
    (value.close > value.high || value.close < value.low)
  ) {
    addIssue(
      context,
      "CANDLE_CLOSE_OUTSIDE_RANGE",
      path(valuePath, "close"),
      ValidationSeverity.ERROR,
      "Candle close must lie between low and high.",
    );
  }

  if (
    openTimeValid &&
    closeTimeValid &&
    (value.closeTimeMs as number) <= (value.openTimeMs as number)
  ) {
    addIssue(
      context,
      "INVALID_CANDLE_TIME_RANGE",
      valuePath,
      ValidationSeverity.ERROR,
      "closeTimeMs must be greater than openTimeMs.",
    );
  }

  return true;
}

function validateOrderBook(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is OrderBookSnapshot {
  if (!requireRecord(context, value, valuePath)) return false;

  requireSafeNonNegativeInteger(
    context,
    value.eventTimeMs,
    path(valuePath, "eventTimeMs"),
  );
  validateProvenance(context, value.provenance, path(valuePath, "provenance"));

  for (const side of ["bids", "asks"] as const) {
    const levels = value[side];

    if (!requireArray(context, levels, path(valuePath, side))) continue;

    levels.forEach((entry, index) => {
      const levelPath = path(path(valuePath, side), index);
      if (!requireRecord(context, entry, levelPath)) return;

      requirePositiveNumber(context, entry.price, path(levelPath, "price"));
      requireNonNegativeNumber(context, entry.quantity, path(levelPath, "quantity"));

      if (entry.orderCount !== undefined) {
        requireSafeNonNegativeInteger(
          context,
          entry.orderCount,
          path(levelPath, "orderCount"),
        );
      }
    });
  }

  if (
    isPositiveNumber(value.bestBid) &&
    isPositiveNumber(value.bestAsk) &&
    value.bestBid > value.bestAsk
  ) {
    addIssue(
      context,
      "CROSSED_ORDER_BOOK",
      valuePath,
      ValidationSeverity.WARNING,
      "bestBid exceeds bestAsk.",
    );
  }

  return true;
}

function validateReferenceMarket(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is ReferenceMarketInput {
  if (!requireRecord(context, value, valuePath)) return false;

  validateMarketIdentity(context, value.market, path(valuePath, "market"));
  requireString(context, value.timeframe, path(valuePath, "timeframe"));
  validateDataQuality(
    context,
    value.qualityAssessment,
    path(valuePath, "qualityAssessment"),
  );

  if (requireArray(context, value.candles, path(valuePath, "candles"), false)) {
    let previousOpenTime = -1;

    value.candles.forEach((candle, index) => {
      const candlePath = path(path(valuePath, "candles"), index);
      validateCandle(context, candle, candlePath);

      if (isRecord(candle) && isSafeNonNegativeInteger(candle.openTimeMs)) {
        if (candle.openTimeMs <= previousOpenTime) {
          addIssue(
            context,
            "NON_MONOTONIC_CANDLE_ORDER",
            candlePath,
            ValidationSeverity.ERROR,
            "Candles must be strictly ordered by openTimeMs.",
          );
        }
        previousOpenTime = candle.openTimeMs;
      }
    });
  }

  return true;
}

function validateInputInternal(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketIntelligenceInput {
  if (!requireRecord(context, value, valuePath)) return false;

  validateMarketIdentity(context, value.market, path(valuePath, "market"));
  requireString(context, value.timeframe, path(valuePath, "timeframe"));

  const analysisTimeValid = requireSafeNonNegativeInteger(
    context,
    value.analysisTimeMs,
    path(valuePath, "analysisTimeMs"),
  );
  const observationRangeValid = validateTimeRange(
    context,
    value.observationWindow,
    path(valuePath, "observationWindow"),
  );

  validateDataQuality(
    context,
    value.qualityAssessment,
    path(valuePath, "qualityAssessment"),
  );

  if (requireArray(context, value.candles, path(valuePath, "candles"), false)) {
    let previousOpenTime = -1;

    value.candles.forEach((candle, index) => {
      const candlePath = path(path(valuePath, "candles"), index);
      validateCandle(context, candle, candlePath);

      if (isRecord(candle) && isSafeNonNegativeInteger(candle.openTimeMs)) {
        if (candle.openTimeMs <= previousOpenTime) {
          addIssue(
            context,
            "NON_MONOTONIC_CANDLE_ORDER",
            candlePath,
            ValidationSeverity.ERROR,
            "Candles must be strictly ordered by openTimeMs.",
          );
        }
        previousOpenTime = candle.openTimeMs;
      }
    });
  }

  if (value.orderBooks !== undefined) {
    if (requireArray(context, value.orderBooks, path(valuePath, "orderBooks"))) {
      value.orderBooks.forEach((entry, index) =>
        validateOrderBook(
          context,
          entry,
          path(path(valuePath, "orderBooks"), index),
        ),
      );
    }
  }

  for (const optionalArray of [
    "trades",
    "fundingRates",
    "openInterest",
    "liquidations",
    "marketBreadth",
  ] as const) {
    if (value[optionalArray] !== undefined) {
      requireArray(context, value[optionalArray], path(valuePath, optionalArray));
    }
  }

  if (value.referenceMarkets !== undefined) {
    if (
      requireArray(
        context,
        value.referenceMarkets,
        path(valuePath, "referenceMarkets"),
      )
    ) {
      value.referenceMarkets.forEach((entry, index) =>
        validateReferenceMarket(
          context,
          entry,
          path(path(valuePath, "referenceMarkets"), index),
        ),
      );
    }
  }

  if (
    analysisTimeValid &&
    observationRangeValid &&
    isRecord(value.observationWindow) &&
    (value.analysisTimeMs as number) <
      (value.observationWindow.endTimeMs as number)
  ) {
    addIssue(
      context,
      "ANALYSIS_TIME_PRECEDES_OBSERVATION_END",
      path(valuePath, "analysisTimeMs"),
      ValidationSeverity.ERROR,
      "analysisTimeMs must not precede observationWindow.endTimeMs.",
    );
  }

  return true;
}

function validateFeatureExtractionConfiguration(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is FeatureExtractionConfiguration {
  if (!requireRecord(context, value, valuePath)) return false;

  requireArray(
    context,
    value.enabledCategories,
    path(valuePath, "enabledCategories"),
    false,
  );
  requireArray(context, value.definitions, path(valuePath, "definitions"), false);
  requireBoolean(
    context,
    value.rejectMissingRequiredFeatures,
    path(valuePath, "rejectMissingRequiredFeatures"),
  );
  requireNormalized(
    context,
    value.maximumMissingFeatureRatio,
    path(valuePath, "maximumMissingFeatureRatio"),
  );
  requireNormalized(
    context,
    value.minimumFeatureQuality,
    path(valuePath, "minimumFeatureQuality"),
  );
  requireBoolean(
    context,
    value.includeRawFeatures,
    path(valuePath, "includeRawFeatures"),
  );

  if (Array.isArray(value.definitions)) {
    const names: string[] = [];

    value.definitions.forEach((definition, index) => {
      const definitionPath = path(path(valuePath, "definitions"), index);
      if (!requireRecord(context, definition, definitionPath)) return;

      if (
        requireString(
          context,
          definition.featureName,
          path(definitionPath, "featureName"),
        )
      ) {
        names.push(definition.featureName);
      }

      requireString(context, definition.category, path(definitionPath, "category"));
      requireString(context, definition.valueType, path(definitionPath, "valueType"));
      requireString(
        context,
        definition.normalization,
        path(definitionPath, "normalization"),
      );
      requireString(
        context,
        definition.description,
        path(definitionPath, "description"),
      );
      requireSafeNonNegativeInteger(
        context,
        definition.lookbackPeriods,
        path(definitionPath, "lookbackPeriods"),
      );
      requireBoolean(
        context,
        definition.deterministic,
        path(definitionPath, "deterministic"),
      );
      requireArray(
        context,
        definition.requiredSources,
        path(definitionPath, "requiredSources"),
      );
    });

    validateUniqueStrings(context, names, path(valuePath, "definitions"));
  }

  return true;
}

function validateModelVersionedConfiguration(
  context: ValidationContext,
  value: Readonly<Record<string, unknown>>,
  valuePath: string,
): void {
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));
}

function validateConfigurationInternal(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is AiMarketIntelligenceConfiguration {
  if (!requireRecord(context, value, valuePath)) return false;

  if (value.schemaVersion !== AI_MARKET_INTELLIGENCE_SCHEMA_VERSION) {
    addIssue(
      context,
      "UNSUPPORTED_SCHEMA_VERSION",
      path(valuePath, "schemaVersion"),
      ValidationSeverity.ERROR,
      "Unsupported AI market-intelligence schema version.",
      value.schemaVersion,
      AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
    );
  }

  validateFeatureExtractionConfiguration(
    context,
    value.featureExtraction,
    path(valuePath, "featureExtraction"),
  );

  const modelConfigurations = [
    ["regimeIntelligence", value.regimeIntelligence],
    ["volatilityForecasting", value.volatilityForecasting],
    ["liquidityPrediction", value.liquidityPrediction],
    ["orderFlow", value.orderFlow],
    ["correlationIntelligence", value.correlationIntelligence],
    ["anomalyDetection", value.anomalyDetection],
    ["pricePrediction", value.pricePrediction],
    ["explainability", value.explainability],
  ] as const;

  modelConfigurations.forEach(([name, configuration]) => {
    const configurationPath = path(valuePath, name);
    if (requireRecord(context, configuration, configurationPath)) {
      validateModelVersionedConfiguration(
        context,
        configuration,
        configurationPath,
      );
    }
  });

  if (isRecord(value.regimeIntelligence)) {
    requireNormalized(
      context,
      value.regimeIntelligence.minimumConfidence,
      path(path(valuePath, "regimeIntelligence"), "minimumConfidence"),
    );
    requireNormalized(
      context,
      value.regimeIntelligence.transitionThreshold,
      path(path(valuePath, "regimeIntelligence"), "transitionThreshold"),
    );
    requireNormalized(
      context,
      value.regimeIntelligence.persistenceThreshold,
      path(path(valuePath, "regimeIntelligence"), "persistenceThreshold"),
    );
    requireSafePositiveInteger(
      context,
      value.regimeIntelligence.minimumRegimeDurationMs,
      path(path(valuePath, "regimeIntelligence"), "minimumRegimeDurationMs"),
    );
    requireArray(
      context,
      value.regimeIntelligence.enabledRegimes,
      path(path(valuePath, "regimeIntelligence"), "enabledRegimes"),
      false,
    );
  }

  if (isRecord(value.volatilityForecasting)) {
    requireBoolean(
      context,
      value.volatilityForecasting.enabled,
      path(path(valuePath, "volatilityForecasting"), "enabled"),
    );
    requireNormalized(
      context,
      value.volatilityForecasting.confidenceLevel,
      path(path(valuePath, "volatilityForecasting"), "confidenceLevel"),
    );
    requireNormalized(
      context,
      value.volatilityForecasting.minimumConfidence,
      path(path(valuePath, "volatilityForecasting"), "minimumConfidence"),
    );
    validatePredictionWindowArray(
      context,
      value.volatilityForecasting.horizons,
      path(path(valuePath, "volatilityForecasting"), "horizons"),
    );
  }

  if (isRecord(value.liquidityPrediction)) {
    requireBoolean(
      context,
      value.liquidityPrediction.enabled,
      path(path(valuePath, "liquidityPrediction"), "enabled"),
    );
    requirePositiveNumber(
      context,
      value.liquidityPrediction.targetNotional,
      path(path(valuePath, "liquidityPrediction"), "targetNotional"),
    );
    requireSafePositiveInteger(
      context,
      value.liquidityPrediction.depthLevels,
      path(path(valuePath, "liquidityPrediction"), "depthLevels"),
    );
    requireNormalized(
      context,
      value.liquidityPrediction.minimumFillProbability,
      path(path(valuePath, "liquidityPrediction"), "minimumFillProbability"),
    );
    requireNonNegativeNumber(
      context,
      value.liquidityPrediction.maximumAcceptableSpreadBps,
      path(
        path(valuePath, "liquidityPrediction"),
        "maximumAcceptableSpreadBps",
      ),
    );
    requireNonNegativeNumber(
      context,
      value.liquidityPrediction.maximumAcceptableImpactBps,
      path(
        path(valuePath, "liquidityPrediction"),
        "maximumAcceptableImpactBps",
      ),
    );
    validatePredictionWindowArray(
      context,
      value.liquidityPrediction.horizons,
      path(path(valuePath, "liquidityPrediction"), "horizons"),
    );
  }

  if (isRecord(value.orderFlow)) {
    requireBoolean(
      context,
      value.orderFlow.enabled,
      path(path(valuePath, "orderFlow"), "enabled"),
    );
    requireSafePositiveInteger(
      context,
      value.orderFlow.tradeLookbackCount,
      path(path(valuePath, "orderFlow"), "tradeLookbackCount"),
    );
    requireSafePositiveInteger(
      context,
      value.orderFlow.orderBookDepthLevels,
      path(path(valuePath, "orderFlow"), "orderBookDepthLevels"),
    );
    requireNonNegativeNumber(
      context,
      value.orderFlow.blockTradeNotionalThreshold,
      path(path(valuePath, "orderFlow"), "blockTradeNotionalThreshold"),
    );
    requireNormalized(
      context,
      value.orderFlow.institutionalFootprintThreshold,
      path(path(valuePath, "orderFlow"), "institutionalFootprintThreshold"),
    );
    requireNormalized(
      context,
      value.orderFlow.reversalProbabilityThreshold,
      path(path(valuePath, "orderFlow"), "reversalProbabilityThreshold"),
    );
  }

  if (isRecord(value.correlationIntelligence)) {
    requireBoolean(
      context,
      value.correlationIntelligence.enabled,
      path(path(valuePath, "correlationIntelligence"), "enabled"),
    );
    requireSafePositiveInteger(
      context,
      value.correlationIntelligence.minimumObservations,
      path(path(valuePath, "correlationIntelligence"), "minimumObservations"),
    );
    requireSafePositiveInteger(
      context,
      value.correlationIntelligence.rollingWindowSize,
      path(path(valuePath, "correlationIntelligence"), "rollingWindowSize"),
    );
    requireNonNegativeNumber(
      context,
      value.correlationIntelligence.breakdownDeviationThreshold,
      path(
        path(valuePath, "correlationIntelligence"),
        "breakdownDeviationThreshold",
      ),
    );
    requireCorrelation(
      context,
      value.correlationIntelligence.clusterThreshold,
      path(path(valuePath, "correlationIntelligence"), "clusterThreshold"),
    );
    requireNormalized(
      context,
      value.correlationIntelligence.significanceThreshold,
      path(path(valuePath, "correlationIntelligence"), "significanceThreshold"),
    );
  }

  if (isRecord(value.anomalyDetection)) {
    requireBoolean(
      context,
      value.anomalyDetection.enabled,
      path(path(valuePath, "anomalyDetection"), "enabled"),
    );
    requireBoolean(
      context,
      value.anomalyDetection.retainResolvedAnomalies,
      path(path(valuePath, "anomalyDetection"), "retainResolvedAnomalies"),
    );
    requireSafePositiveInteger(
      context,
      value.anomalyDetection.maximumActiveAnomalies,
      path(path(valuePath, "anomalyDetection"), "maximumActiveAnomalies"),
    );

    if (
      requireArray(
        context,
        value.anomalyDetection.thresholds,
        path(path(valuePath, "anomalyDetection"), "thresholds"),
      )
    ) {
      value.anomalyDetection.thresholds.forEach((threshold, index) => {
        const thresholdPath = path(
          path(path(valuePath, "anomalyDetection"), "thresholds"),
          index,
        );
        if (!requireRecord(context, threshold, thresholdPath)) return;

        requireString(context, threshold.type, path(thresholdPath, "type"));
        requireBoolean(context, threshold.enabled, path(thresholdPath, "enabled"));
        requireFiniteNumber(
          context,
          threshold.warningThreshold,
          path(thresholdPath, "warningThreshold"),
        );
        requireFiniteNumber(
          context,
          threshold.criticalThreshold,
          path(thresholdPath, "criticalThreshold"),
        );
        requireNormalized(
          context,
          threshold.minimumProbability,
          path(thresholdPath, "minimumProbability"),
        );
        requireNormalized(
          context,
          threshold.minimumConfidence,
          path(thresholdPath, "minimumConfidence"),
        );

        if (
          isFiniteNumber(threshold.warningThreshold) &&
          isFiniteNumber(threshold.criticalThreshold) &&
          threshold.criticalThreshold < threshold.warningThreshold
        ) {
          addIssue(
            context,
            "ANOMALY_THRESHOLD_ORDER_INVALID",
            thresholdPath,
            ValidationSeverity.ERROR,
            "criticalThreshold must be greater than or equal to warningThreshold.",
          );
        }
      });
    }
  }

  if (isRecord(value.pricePrediction)) {
    requireBoolean(
      context,
      value.pricePrediction.enabled,
      path(path(valuePath, "pricePrediction"), "enabled"),
    );
    requireNormalized(
      context,
      value.pricePrediction.minimumConfidence,
      path(path(valuePath, "pricePrediction"), "minimumConfidence"),
    );
    requireNonNegativeNumber(
      context,
      value.pricePrediction.neutralReturnBandPercentage,
      path(path(valuePath, "pricePrediction"), "neutralReturnBandPercentage"),
    );
    requireNormalized(
      context,
      value.pricePrediction.strongDirectionThreshold,
      path(path(valuePath, "pricePrediction"), "strongDirectionThreshold"),
    );
    validatePredictionWindowArray(
      context,
      value.pricePrediction.horizons,
      path(path(valuePath, "pricePrediction"), "horizons"),
    );
  }

  validateConfidenceConfiguration(
    context,
    value.confidenceAggregation,
    path(valuePath, "confidenceAggregation"),
  );
  validatePublicationConfiguration(
    context,
    value.publication,
    path(valuePath, "publication"),
  );

  requireBoolean(context, value.failFast, path(valuePath, "failFast"));
  requireBoolean(
    context,
    value.requireDeterministicFingerprint,
    path(valuePath, "requireDeterministicFingerprint"),
  );
  requireSafePositiveInteger(
    context,
    value.maximumInputAgeMs,
    path(valuePath, "maximumInputAgeMs"),
  );
  requireSafePositiveInteger(
    context,
    value.maximumPipelineDurationMs,
    path(valuePath, "maximumPipelineDurationMs"),
  );

  return true;
}

function validatePredictionWindowArray(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): void {
  if (!requireArray(context, value, valuePath, false)) return;

  value.forEach((entry, index) =>
    validatePredictionWindow(context, entry, path(valuePath, index)),
  );
}

function validateConfidenceConfiguration(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is ConfidenceAggregationConfiguration {
  if (!requireRecord(context, value, valuePath)) return false;

  if (requireRecord(context, value.componentWeights, path(valuePath, "componentWeights"))) {
    let weightTotal = 0;

    Object.entries(value.componentWeights).forEach(([name, weight]) => {
      if (requireNormalized(context, weight, path(path(valuePath, "componentWeights"), name))) {
        weightTotal += weight;
      }
    });

    if (Math.abs(weightTotal - 1) > PERCENTAGE_TOLERANCE) {
      addIssue(
        context,
        "CONFIDENCE_WEIGHT_SUM_INVALID",
        path(valuePath, "componentWeights"),
        ValidationSeverity.ERROR,
        "Confidence component weights must sum to exactly one.",
        weightTotal,
        "1",
      );
    }
  }

  requireNormalized(
    context,
    value.minimumDataQuality,
    path(valuePath, "minimumDataQuality"),
  );
  requireNonNegativeNumber(
    context,
    value.disagreementPenalty,
    path(valuePath, "disagreementPenalty"),
  );
  requireNonNegativeNumber(
    context,
    value.anomalyPenalty,
    path(valuePath, "anomalyPenalty"),
  );
  requireNonNegativeNumber(
    context,
    value.regimeInstabilityPenalty,
    path(valuePath, "regimeInstabilityPenalty"),
  );
  requireNormalized(
    context,
    value.minimumPublishableConfidence,
    path(valuePath, "minimumPublishableConfidence"),
  );
  requireString(
    context,
    value.calibrationVersion,
    path(valuePath, "calibrationVersion"),
  );

  return true;
}

function validatePublicationConfiguration(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is PublicationConfiguration {
  if (!requireRecord(context, value, valuePath)) return false;

  requireBoolean(context, value.enabled, path(valuePath, "enabled"));
  requireArray(context, value.topics, path(valuePath, "topics"));
  requireBoolean(
    context,
    value.publishOnlyActionableReports,
    path(valuePath, "publishOnlyActionableReports"),
  );
  requireNormalized(
    context,
    value.minimumConfidence,
    path(valuePath, "minimumConfidence"),
  );
  requireBoolean(
    context,
    value.publishWarnings,
    path(valuePath, "publishWarnings"),
  );

  return true;
}

function validateFeature(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketFeature {
  if (!requireRecord(context, value, valuePath)) return false;

  if (requireRecord(context, value.definition, path(valuePath, "definition"))) {
    requireString(
      context,
      value.definition.featureName,
      path(path(valuePath, "definition"), "featureName"),
    );
    requireString(
      context,
      value.definition.category,
      path(path(valuePath, "definition"), "category"),
    );
    requireString(
      context,
      value.definition.valueType,
      path(path(valuePath, "definition"), "valueType"),
    );
  }

  if (requireRecord(context, value.value, path(valuePath, "value"))) {
    if (
      value.value.type === FeatureValueType.SCALAR &&
      !isFiniteNumber(value.value.value)
    ) {
      addIssue(
        context,
        "INVALID_SCALAR_FEATURE",
        path(path(valuePath, "value"), "value"),
        ValidationSeverity.ERROR,
        "Scalar feature value must be finite.",
      );
    }

    if (value.value.type === FeatureValueType.VECTOR) {
      if (
        requireArray(
          context,
          value.value.values,
          path(path(valuePath, "value"), "values"),
          false,
        )
      ) {
        value.value.values.forEach((entry, index) =>
          requireFiniteNumber(
            context,
            entry,
            path(path(path(valuePath, "value"), "values"), index),
          ),
        );
      }
    }

    if (
      value.value.type === FeatureValueType.BOOLEAN &&
      typeof value.value.value !== "boolean"
    ) {
      addIssue(
        context,
        "INVALID_BOOLEAN_FEATURE",
        path(path(valuePath, "value"), "value"),
        ValidationSeverity.ERROR,
        "Boolean feature value must be a boolean.",
      );
    }

    if (
      value.value.type === FeatureValueType.CATEGORICAL &&
      !isNonEmptyString(value.value.value)
    ) {
      addIssue(
        context,
        "INVALID_CATEGORICAL_FEATURE",
        path(path(valuePath, "value"), "value"),
        ValidationSeverity.ERROR,
        "Categorical feature value must be a non-empty string.",
      );
    }
  }

  requireSafeNonNegativeInteger(
    context,
    value.observedAtMs,
    path(valuePath, "observedAtMs"),
  );
  requireNormalized(context, value.qualityScore, path(valuePath, "qualityScore"));
  requireBoolean(context, value.isMissing, path(valuePath, "isMissing"));
  requireArray(context, value.provenance, path(valuePath, "provenance"));

  if (value.isMissing === true && !isNonEmptyString(value.missingReason)) {
    addIssue(
      context,
      "MISSING_FEATURE_REASON_REQUIRED",
      path(valuePath, "missingReason"),
      ValidationSeverity.ERROR,
      "missingReason is required when isMissing is true.",
    );
  }

  return true;
}

function validateFeatureVectorInternal(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketFeatureVector {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.id, path(valuePath, "id"));

  if (value.schemaVersion !== AI_MARKET_INTELLIGENCE_SCHEMA_VERSION) {
    addIssue(
      context,
      "UNSUPPORTED_SCHEMA_VERSION",
      path(valuePath, "schemaVersion"),
      ValidationSeverity.ERROR,
      "Unsupported feature-vector schema version.",
      value.schemaVersion,
      AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
    );
  }

  validateMarketIdentity(context, value.market, path(valuePath, "market"));
  requireString(context, value.timeframe, path(valuePath, "timeframe"));
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  validateTimeRange(
    context,
    value.observationWindow,
    path(valuePath, "observationWindow"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.featureCount,
    path(valuePath, "featureCount"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.missingFeatureCount,
    path(valuePath, "missingFeatureCount"),
  );
  requireNormalized(context, value.qualityScore, path(valuePath, "qualityScore"));

  if (
    context.options.validateDeterministicFingerprints &&
    !isNonEmptyString(value.deterministicFingerprint)
  ) {
    addIssue(
      context,
      "DETERMINISTIC_FINGERPRINT_REQUIRED",
      path(valuePath, "deterministicFingerprint"),
      ValidationSeverity.ERROR,
      "A deterministic fingerprint is required.",
    );
  }

  if (requireArray(context, value.features, path(valuePath, "features"))) {
    const featureNames: string[] = [];
    let actualMissingCount = 0;

    value.features.forEach((feature, index) => {
      const featurePath = path(path(valuePath, "features"), index);
      validateFeature(context, feature, featurePath);

      if (
        isRecord(feature) &&
        isRecord(feature.definition) &&
        isNonEmptyString(feature.definition.featureName)
      ) {
        featureNames.push(feature.definition.featureName);
      }

      if (isRecord(feature) && feature.isMissing === true) {
        actualMissingCount += 1;
      }
    });

    validateUniqueStrings(context, featureNames, path(valuePath, "features"));

    if (
      isSafeNonNegativeInteger(value.featureCount) &&
      value.featureCount !== value.features.length
    ) {
      addIssue(
        context,
        "FEATURE_COUNT_MISMATCH",
        path(valuePath, "featureCount"),
        ValidationSeverity.ERROR,
        "featureCount must equal features.length.",
      );
    }

    if (
      isSafeNonNegativeInteger(value.missingFeatureCount) &&
      value.missingFeatureCount !== actualMissingCount
    ) {
      addIssue(
        context,
        "MISSING_FEATURE_COUNT_MISMATCH",
        path(valuePath, "missingFeatureCount"),
        ValidationSeverity.ERROR,
        "missingFeatureCount does not match the number of missing features.",
      );
    }
  }

  return true;
}

function validateProbabilityDistribution(
  context: ValidationContext,
  values: readonly unknown[],
  valuePath: string,
): void {
  let sum = 0;
  let allValid = true;

  values.forEach((value, index) => {
    if (requireNormalized(context, value, path(valuePath, index))) {
      sum += value;
    } else {
      allValid = false;
    }
  });

  if (allValid && Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) {
    addIssue(
      context,
      "PROBABILITY_DISTRIBUTION_SUM_INVALID",
      valuePath,
      ValidationSeverity.ERROR,
      "Probability distribution must sum to one.",
      sum,
      "1",
    );
  }
}

function validateRegime(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketRegimeIntelligence {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.primaryRegime, path(valuePath, "primaryRegime"));
  requireString(
    context,
    value.transitionState,
    path(valuePath, "transitionState"),
  );
  requireNormalized(context, value.confidence, path(valuePath, "confidence"));
  requireNormalized(
    context,
    value.regimeStrength,
    path(valuePath, "regimeStrength"),
  );
  requireNormalized(
    context,
    value.persistenceProbability,
    path(valuePath, "persistenceProbability"),
  );
  requireNormalized(
    context,
    value.transitionProbability,
    path(valuePath, "transitionProbability"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.detectedAtMs,
    path(valuePath, "detectedAtMs"),
  );
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));

  if (
    requireArray(
      context,
      value.regimeProbabilities,
      path(valuePath, "regimeProbabilities"),
      false,
    )
  ) {
    const probabilities: unknown[] = [];

    value.regimeProbabilities.forEach((entry, index) => {
      const entryPath = path(path(valuePath, "regimeProbabilities"), index);
      if (!requireRecord(context, entry, entryPath)) return;
      requireString(context, entry.regime, path(entryPath, "regime"));
      probabilities.push(entry.probability);
    });

    validateProbabilityDistribution(
      context,
      probabilities,
      path(valuePath, "regimeProbabilities"),
    );
  }

  requireArray(context, value.evidence, path(valuePath, "evidence"));

  return true;
}

function validateVolatilityForecast(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is VolatilityForecast {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.predictionId, path(valuePath, "predictionId"));
  validatePredictionWindow(context, value.window, path(valuePath, "window"));
  requireString(context, value.currentState, path(valuePath, "currentState"));
  requireString(context, value.forecastState, path(valuePath, "forecastState"));
  requireNonNegativeNumber(
    context,
    value.currentRealizedVolatility,
    path(valuePath, "currentRealizedVolatility"),
  );
  requireNonNegativeNumber(
    context,
    value.forecastRealizedVolatility,
    path(valuePath, "forecastRealizedVolatility"),
  );
  requireNormalized(
    context,
    value.expansionProbability,
    path(valuePath, "expansionProbability"),
  );
  requireNormalized(
    context,
    value.contractionProbability,
    path(valuePath, "contractionProbability"),
  );
  requireNormalized(context, value.confidence, path(valuePath, "confidence"));
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  requireArray(context, value.drivers, path(valuePath, "drivers"));

  if (requireRecord(context, value.interval, path(valuePath, "interval"))) {
    requireFiniteNumber(
      context,
      value.interval.lowerBound,
      path(path(valuePath, "interval"), "lowerBound"),
    );
    requireFiniteNumber(
      context,
      value.interval.expectedValue,
      path(path(valuePath, "interval"), "expectedValue"),
    );
    requireFiniteNumber(
      context,
      value.interval.upperBound,
      path(path(valuePath, "interval"), "upperBound"),
    );
    requireNormalized(
      context,
      value.interval.confidenceLevel,
      path(path(valuePath, "interval"), "confidenceLevel"),
    );

    if (
      isFiniteNumber(value.interval.lowerBound) &&
      isFiniteNumber(value.interval.expectedValue) &&
      isFiniteNumber(value.interval.upperBound) &&
      (value.interval.lowerBound > value.interval.expectedValue ||
        value.interval.expectedValue > value.interval.upperBound)
    ) {
      addIssue(
        context,
        "FORECAST_INTERVAL_ORDER_INVALID",
        path(valuePath, "interval"),
        ValidationSeverity.ERROR,
        "Forecast interval must satisfy lowerBound <= expectedValue <= upperBound.",
      );
    }
  }

  return true;
}

function validateOrderFlow(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is OrderFlowIntelligence {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.bias, path(valuePath, "bias"));
  requireString(
    context,
    value.participantActivity,
    path(valuePath, "participantActivity"),
  );

  for (const key of [
    "buyPressure",
    "sellPressure",
    "aggressiveBuyRatio",
    "aggressiveSellRatio",
    "absorptionScore",
    "exhaustionScore",
    "institutionalFootprintScore",
    "reversalProbability",
    "continuationProbability",
    "confidence",
  ] as const) {
    requireNormalized(context, value[key], path(valuePath, key));
  }

  requireFiniteNumber(
    context,
    value.bidAskImbalance,
    path(valuePath, "bidAskImbalance"),
  );
  requireFiniteNumber(
    context,
    value.cumulativeVolumeDelta,
    path(valuePath, "cumulativeVolumeDelta"),
  );
  requireArray(context, value.metrics, path(valuePath, "metrics"));
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));

  return true;
}

function validateCorrelationIntelligence(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketCorrelationIntelligence {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.matrixId, path(valuePath, "matrixId"));
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  validateTimeRange(context, value.window, path(valuePath, "window"));

  for (const key of [
    "concentrationScore",
    "diversificationScore",
    "systemicRiskScore",
    "confidence",
  ] as const) {
    requireNormalized(context, value[key], path(valuePath, key));
  }

  requireCorrelation(
    context,
    value.averageMarketCorrelation,
    path(valuePath, "averageMarketCorrelation"),
  );
  requireArray(context, value.pairs, path(valuePath, "pairs"));
  requireArray(context, value.clusters, path(valuePath, "clusters"));
  requireArray(context, value.breakdowns, path(valuePath, "breakdowns"));
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));

  return true;
}

function validateAnomaly(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketAnomaly {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.id, path(valuePath, "id"));
  requireString(context, value.type, path(valuePath, "type"));
  requireString(context, value.severity, path(valuePath, "severity"));
  requireSafeNonNegativeInteger(
    context,
    value.detectedAtMs,
    path(valuePath, "detectedAtMs"),
  );
  requireBoolean(context, value.active, path(valuePath, "active"));
  requireNormalized(context, value.probability, path(valuePath, "probability"));
  requireNormalized(context, value.confidence, path(valuePath, "confidence"));
  requireArray(
    context,
    value.affectedMarkets,
    path(valuePath, "affectedMarkets"),
    false,
  );
  requireArray(context, value.evidence, path(valuePath, "evidence"), false);
  requireString(
    context,
    value.recommendedAction,
    path(valuePath, "recommendedAction"),
  );
  requireString(context, value.summary, path(valuePath, "summary"));
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));

  if (
    value.active === true &&
    value.endedAtMs !== undefined
  ) {
    addIssue(
      context,
      "ACTIVE_ANOMALY_HAS_END_TIME",
      path(valuePath, "endedAtMs"),
      ValidationSeverity.WARNING,
      "An active anomaly normally should not have endedAtMs.",
    );
  }

  return true;
}

function validatePricePrediction(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is PriceMovementPrediction {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.predictionId, path(valuePath, "predictionId"));
  validateMarketIdentity(context, value.market, path(valuePath, "market"));
  validatePredictionWindow(context, value.window, path(valuePath, "window"));
  requireString(context, value.direction, path(valuePath, "direction"));
  requireNormalized(context, value.confidence, path(valuePath, "confidence"));
  requireNormalized(
    context,
    value.continuationProbability,
    path(valuePath, "continuationProbability"),
  );
  requireNormalized(
    context,
    value.reversalProbability,
    path(valuePath, "reversalProbability"),
  );
  requireString(
    context,
    value.actionability,
    path(valuePath, "actionability"),
  );
  requireString(context, value.modelVersion, path(valuePath, "modelVersion"));
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  requireArray(context, value.drivers, path(valuePath, "drivers"));

  if (
    requireRecord(
      context,
      value.directionProbabilities,
      path(valuePath, "directionProbabilities"),
    )
  ) {
    validateProbabilityDistribution(
      context,
      [
        value.directionProbabilities.bearish,
        value.directionProbabilities.neutral,
        value.directionProbabilities.bullish,
      ],
      path(valuePath, "directionProbabilities"),
    );
  }

  if (requireRecord(context, value.target, path(valuePath, "target"))) {
    requirePositiveNumber(
      context,
      value.target.expectedPrice,
      path(path(valuePath, "target"), "expectedPrice"),
    );
    requirePositiveNumber(
      context,
      value.target.lowerPrice,
      path(path(valuePath, "target"), "lowerPrice"),
    );
    requirePositiveNumber(
      context,
      value.target.upperPrice,
      path(path(valuePath, "target"), "upperPrice"),
    );

    if (
      isPositiveNumber(value.target.lowerPrice) &&
      isPositiveNumber(value.target.expectedPrice) &&
      isPositiveNumber(value.target.upperPrice) &&
      (value.target.lowerPrice > value.target.expectedPrice ||
        value.target.expectedPrice > value.target.upperPrice)
    ) {
      addIssue(
        context,
        "PRICE_TARGET_ORDER_INVALID",
        path(valuePath, "target"),
        ValidationSeverity.ERROR,
        "Price target must satisfy lowerPrice <= expectedPrice <= upperPrice.",
      );
    }
  }

  return true;
}

function validateUnifiedConfidence(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is UnifiedPredictionConfidence {
  if (!requireRecord(context, value, valuePath)) return false;

  requireNormalized(context, value.confidence, path(valuePath, "confidence"));

  if (!Object.values(ConfidenceQuality).includes(value.quality as ConfidenceQuality)) {
    addIssue(
      context,
      "INVALID_CONFIDENCE_QUALITY",
      path(valuePath, "quality"),
      ValidationSeverity.ERROR,
      "Unsupported confidence quality.",
      value.quality,
    );
  }

  requireFiniteNumber(
    context,
    value.dataQualityAdjustment,
    path(valuePath, "dataQualityAdjustment"),
  );
  requireFiniteNumber(
    context,
    value.regimeStabilityAdjustment,
    path(valuePath, "regimeStabilityAdjustment"),
  );
  requireFiniteNumber(
    context,
    value.anomalyAdjustment,
    path(valuePath, "anomalyAdjustment"),
  );
  requireNormalized(
    context,
    value.calibrationScore,
    path(valuePath, "calibrationScore"),
  );
  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );

  if (requireArray(context, value.components, path(valuePath, "components"))) {
    let effectiveWeightTotal = 0;

    value.components.forEach((component, index) => {
      const componentPath = path(path(valuePath, "components"), index);
      if (!requireRecord(context, component, componentPath)) return;

      requireString(
        context,
        component.componentName,
        path(componentPath, "componentName"),
      );
      requireNormalized(
        context,
        component.rawConfidence,
        path(componentPath, "rawConfidence"),
      );
      if (
        requireNormalized(
          context,
          component.effectiveWeight,
          path(componentPath, "effectiveWeight"),
        ) &&
        component.excluded !== true
      ) {
        effectiveWeightTotal += component.effectiveWeight;
      }
      requireBoolean(
        context,
        component.excluded,
        path(componentPath, "excluded"),
      );
    });

    if (effectiveWeightTotal > 1 + PERCENTAGE_TOLERANCE) {
      addIssue(
        context,
        "EFFECTIVE_CONFIDENCE_WEIGHT_EXCEEDS_ONE",
        path(valuePath, "components"),
        ValidationSeverity.ERROR,
        "Non-excluded effective confidence weights cannot exceed one.",
        effectiveWeightTotal,
      );
    }
  }

  if (requireRecord(context, value.agreement, path(valuePath, "agreement"))) {
    requireNormalized(
      context,
      value.agreement.agreementScore,
      path(path(valuePath, "agreement"), "agreementScore"),
    );
    validateStringArray(
      context,
      value.agreement.conflictingComponents,
      path(path(valuePath, "agreement"), "conflictingComponents"),
    );
    validateStringArray(
      context,
      value.agreement.supportingComponents,
      path(path(valuePath, "agreement"), "supportingComponents"),
    );
  }

  return true;
}

function validateTrace(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketIntelligenceRunTrace {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.runId, path(valuePath, "runId"));
  requireString(context, value.requestId, path(valuePath, "requestId"));

  if (
    !Object.values(MarketIntelligenceRunStatus).includes(
      value.status as MarketIntelligenceRunStatus,
    )
  ) {
    addIssue(
      context,
      "INVALID_RUN_STATUS",
      path(valuePath, "status"),
      ValidationSeverity.ERROR,
      "Unsupported market-intelligence run status.",
      value.status,
    );
  }

  requireSafeNonNegativeInteger(
    context,
    value.createdAtMs,
    path(valuePath, "createdAtMs"),
  );
  requireArray(
    context,
    value.stageTimings,
    path(valuePath, "stageTimings"),
  );
  requireArray(
    context,
    value.completedStages,
    path(valuePath, "completedStages"),
  );
  validateStringArray(context, value.warnings, path(valuePath, "warnings"));
  validateStringArray(context, value.errors, path(valuePath, "errors"));

  if (
    value.failedStage !== undefined &&
    !Object.values(MarketIntelligencePipelineStage).includes(
      value.failedStage as MarketIntelligencePipelineStage,
    )
  ) {
    addIssue(
      context,
      "INVALID_FAILED_STAGE",
      path(valuePath, "failedStage"),
      ValidationSeverity.ERROR,
      "Unsupported failed pipeline stage.",
      value.failedStage,
    );
  }

  return true;
}

function validateReportInternal(
  context: ValidationContext,
  value: unknown,
  valuePath: string,
): value is MarketIntelligenceReport {
  if (!requireRecord(context, value, valuePath)) return false;

  requireString(context, value.id, path(valuePath, "id"));
  requireString(context, value.requestId, path(valuePath, "requestId"));
  requireString(context, value.runId, path(valuePath, "runId"));

  if (value.schemaVersion !== AI_MARKET_INTELLIGENCE_SCHEMA_VERSION) {
    addIssue(
      context,
      "UNSUPPORTED_SCHEMA_VERSION",
      path(valuePath, "schemaVersion"),
      ValidationSeverity.ERROR,
      "Unsupported report schema version.",
      value.schemaVersion,
      AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
    );
  }

  requireSafeNonNegativeInteger(
    context,
    value.generatedAtMs,
    path(valuePath, "generatedAtMs"),
  );
  validateMarketIdentity(context, value.market, path(valuePath, "market"));
  requireString(context, value.timeframe, path(valuePath, "timeframe"));
  validateTimeRange(
    context,
    value.observationWindow,
    path(valuePath, "observationWindow"),
  );
  validatePredictionWindowArray(
    context,
    value.predictionWindows,
    path(valuePath, "predictionWindows"),
  );
  validateFeatureVectorInternal(
    context,
    value.featureVector,
    path(valuePath, "featureVector"),
  );
  validateRegime(context, value.regime, path(valuePath, "regime"));

  if (
    requireArray(
      context,
      value.volatilityForecasts,
      path(valuePath, "volatilityForecasts"),
    )
  ) {
    value.volatilityForecasts.forEach((entry, index) =>
      validateVolatilityForecast(
        context,
        entry,
        path(path(valuePath, "volatilityForecasts"), index),
      ),
    );
  }

  requireArray(
    context,
    value.liquidityPredictions,
    path(valuePath, "liquidityPredictions"),
  );
  validateOrderFlow(context, value.orderFlow, path(valuePath, "orderFlow"));
  validateCorrelationIntelligence(
    context,
    value.correlations,
    path(valuePath, "correlations"),
  );

  if (requireArray(context, value.anomalies, path(valuePath, "anomalies"))) {
    value.anomalies.forEach((entry, index) =>
      validateAnomaly(
        context,
        entry,
        path(path(valuePath, "anomalies"), index),
      ),
    );
  }

  if (
    requireArray(
      context,
      value.pricePredictions,
      path(valuePath, "pricePredictions"),
    )
  ) {
    value.pricePredictions.forEach((entry, index) =>
      validatePricePrediction(
        context,
        entry,
        path(path(valuePath, "pricePredictions"), index),
      ),
    );
  }

  validateUnifiedConfidence(
    context,
    value.confidence,
    path(valuePath, "confidence"),
  );
  validateDataQuality(
    context,
    value.dataQuality,
    path(valuePath, "dataQuality"),
  );
  validateStringArray(context, value.warnings, path(valuePath, "warnings"));

  if (
    context.options.validateDeterministicFingerprints &&
    !isNonEmptyString(value.deterministicFingerprint)
  ) {
    addIssue(
      context,
      "DETERMINISTIC_FINGERPRINT_REQUIRED",
      path(valuePath, "deterministicFingerprint"),
      ValidationSeverity.ERROR,
      "A deterministic report fingerprint is required.",
    );
  }

  if (requireRecord(context, value.summary, path(valuePath, "summary"))) {
    requireString(
      context,
      value.summary.direction,
      path(path(valuePath, "summary"), "direction"),
    );
    requireString(
      context,
      value.summary.regime,
      path(path(valuePath, "summary"), "regime"),
    );
    requireNormalized(
      context,
      value.summary.overallConfidence,
      path(path(valuePath, "summary"), "overallConfidence"),
    );
    requireString(
      context,
      value.summary.headline,
      path(path(valuePath, "summary"), "headline"),
    );
  }

  if (isRecord(value.featureVector) && isRecord(value.market)) {
    if (
      value.featureVector.market !== undefined &&
      isRecord(value.featureVector.market) &&
      value.featureVector.market.symbol !== value.market.symbol
    ) {
      addIssue(
        context,
        "REPORT_FEATURE_MARKET_MISMATCH",
        path(valuePath, "featureVector.market.symbol"),
        ValidationSeverity.ERROR,
        "Feature-vector market must match report market.",
      );
    }
  }

  if (
    isRecord(value.summary) &&
    isNormalized(value.summary.overallConfidence) &&
    isRecord(value.confidence) &&
    isNormalized(value.confidence.confidence) &&
    Math.abs(value.summary.overallConfidence - value.confidence.confidence) >
      PERCENTAGE_TOLERANCE
  ) {
    addIssue(
      context,
      "REPORT_CONFIDENCE_MISMATCH",
      path(valuePath, "summary.overallConfidence"),
      ValidationSeverity.ERROR,
      "Summary confidence must equal unified prediction confidence.",
    );
  }

  return true;
}

function createResult<TValue>(
  value: TValue | undefined,
  context: ValidationContext,
): ValidationResult<TValue> {
  const issues = Object.freeze([...context.issues]);
  const errorCount = issues.filter(
    (issue) =>
      issue.severity === ValidationSeverity.ERROR ||
      issue.severity === ValidationSeverity.FATAL,
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === ValidationSeverity.WARNING,
  ).length;

  return Object.freeze({
    valid: errorCount === 0,
    ...(errorCount === 0 && value !== undefined ? { value } : {}),
    issues,
    errorCount,
    warningCount,
  });
}

export class DefaultAiMarketIntelligenceValidator
  implements AiMarketIntelligenceValidator
{
  private readonly options: ResolvedValidatorOptions;

  public constructor(options?: AiMarketIntelligenceValidatorOptions) {
    this.options = resolveOptions(options);
  }

  public validateRequest(
    request: MarketIntelligenceRequest,
  ): ValidationResult<MarketIntelligenceRequest> {
    const context: ValidationContext = {
      options: this.options,
      issues: [],
    };

    if (requireRecord(context, request, ROOT)) {
      requireString(context, request.requestId, path(ROOT, "requestId"));
      requireSafeNonNegativeInteger(
        context,
        request.requestedAtMs,
        path(ROOT, "requestedAtMs"),
      );

      validateInputInternal(context, request.input, path(ROOT, "input"));
      validatePredictionWindowArray(
        context,
        request.predictionWindows,
        path(ROOT, "predictionWindows"),
      );
      validateConfigurationInternal(
        context,
        request.configuration,
        path(ROOT, "configuration"),
      );

      if (request.correlationUniverse !== undefined) {
        if (
          requireArray(
            context,
            request.correlationUniverse,
            path(ROOT, "correlationUniverse"),
          )
        ) {
          request.correlationUniverse.forEach((entry, index) =>
            validateReferenceMarket(
              context,
              entry,
              path(path(ROOT, "correlationUniverse"), index),
            ),
          );
        }
      }

      if (request.tags !== undefined) {
        validateStringArray(context, request.tags, path(ROOT, "tags"));
        if (Array.isArray(request.tags)) {
          validateUniqueStrings(context, request.tags, path(ROOT, "tags"));
        }
      }

      if (
        isRecord(request.input) &&
        isSafeNonNegativeInteger(request.requestedAtMs) &&
        isSafeNonNegativeInteger(request.input.analysisTimeMs) &&
        request.requestedAtMs < request.input.analysisTimeMs
      ) {
        addIssue(
          context,
          "REQUEST_TIME_PRECEDES_ANALYSIS_TIME",
          path(ROOT, "requestedAtMs"),
          ValidationSeverity.WARNING,
          "requestedAtMs precedes input.analysisTimeMs.",
        );
      }
    }

    return createResult(request, context);
  }

  public validateConfiguration(
    configuration: AiMarketIntelligenceConfiguration,
  ): ValidationResult<AiMarketIntelligenceConfiguration> {
    const context: ValidationContext = {
      options: this.options,
      issues: [],
    };

    validateConfigurationInternal(context, configuration, ROOT);
    return createResult(configuration, context);
  }

  public validateInput(
    input: MarketIntelligenceInput,
  ): ValidationResult<MarketIntelligenceInput> {
    const context: ValidationContext = {
      options: this.options,
      issues: [],
    };

    validateInputInternal(context, input, ROOT);
    return createResult(input, context);
  }

  public validateFeatureVector(
    featureVector: MarketFeatureVector,
  ): ValidationResult<MarketFeatureVector> {
    const context: ValidationContext = {
      options: this.options,
      issues: [],
    };

    validateFeatureVectorInternal(context, featureVector, ROOT);
    return createResult(featureVector, context);
  }

  public validateReport(
    report: MarketIntelligenceReport,
  ): ValidationResult<MarketIntelligenceReport> {
    const context: ValidationContext = {
      options: this.options,
      issues: [],
    };

    validateReportInternal(context, report, ROOT);
    return createResult(report, context);
  }
}

export function createAiMarketIntelligenceValidator(
  options?: AiMarketIntelligenceValidatorOptions,
): DefaultAiMarketIntelligenceValidator {
  return new DefaultAiMarketIntelligenceValidator(options);
}

export function validateAiMarketIntelligenceRequest(
  request: MarketIntelligenceRequest,
  options?: AiMarketIntelligenceValidatorOptions,
): ValidationResult<MarketIntelligenceRequest> {
  return createAiMarketIntelligenceValidator(options).validateRequest(request);
}

export function validateAiMarketIntelligenceConfiguration(
  configuration: AiMarketIntelligenceConfiguration,
  options?: AiMarketIntelligenceValidatorOptions,
): ValidationResult<AiMarketIntelligenceConfiguration> {
  return createAiMarketIntelligenceValidator(options).validateConfiguration(
    configuration,
  );
}

export function validateMarketIntelligenceInput(
  input: MarketIntelligenceInput,
  options?: AiMarketIntelligenceValidatorOptions,
): ValidationResult<MarketIntelligenceInput> {
  return createAiMarketIntelligenceValidator(options).validateInput(input);
}

export function validateMarketFeatureVector(
  featureVector: MarketFeatureVector,
  options?: AiMarketIntelligenceValidatorOptions,
): ValidationResult<MarketFeatureVector> {
  return createAiMarketIntelligenceValidator(options).validateFeatureVector(
    featureVector,
  );
}

export function validateMarketIntelligenceReport(
  report: MarketIntelligenceReport,
  options?: AiMarketIntelligenceValidatorOptions,
): ValidationResult<MarketIntelligenceReport> {
  return createAiMarketIntelligenceValidator(options).validateReport(report);
}

export function assertValidMarketIntelligenceRequest(
  request: MarketIntelligenceRequest,
  options?: AiMarketIntelligenceValidatorOptions,
): void {
  const result = validateAiMarketIntelligenceRequest(request, options);

  if (!result.valid) {
    throw new TypeError(
      `Invalid AI market-intelligence request: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}

export function assertValidMarketIntelligenceConfiguration(
  configuration: AiMarketIntelligenceConfiguration,
  options?: AiMarketIntelligenceValidatorOptions,
): void {
  const result = validateAiMarketIntelligenceConfiguration(
    configuration,
    options,
  );

  if (!result.valid) {
    throw new TypeError(
      `Invalid AI market-intelligence configuration: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}

export function assertValidMarketFeatureVector(
  featureVector: MarketFeatureVector,
  options?: AiMarketIntelligenceValidatorOptions,
): void {
  const result = validateMarketFeatureVector(featureVector, options);

  if (!result.valid) {
    throw new TypeError(
      `Invalid market feature vector: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}

export function assertValidMarketIntelligenceReport(
  report: MarketIntelligenceReport,
  options?: AiMarketIntelligenceValidatorOptions,
): void {
  const result = validateMarketIntelligenceReport(report, options);

  if (!result.valid) {
    throw new TypeError(
      `Invalid market-intelligence report: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}