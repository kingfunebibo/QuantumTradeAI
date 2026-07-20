/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 2: AI strategy contract validator.
 *
 * Centralized deterministic validation for all public Milestone 30 contracts.
 */

import {
  type AdaptiveOptimizationRequest,
  type AiEnsembleConfiguration,
  type AiFeatureDefinition,
  type AiFeatureObservation,
  type AiFeatureSnapshot,
  type AiFeatureValidationIssue,
  type AiFeatureValue,
  type AiFeatureVector,
  type AiGeneratedSignal,
  type AiInferenceRequest,
  type AiModelDescriptor,
  type AiModelRuntimeConfiguration,
  type AiSignalGenerationRequest,
  type AiStrategyInstrument,
  type AiStrategyMarketContext,
  type AiStrategyMetadata,
  type AiStrategyPrimitive,
  type ConfidenceCalibrationProfile,
  type MarketRegimeDetection,
  type MetaStrategyRequest,
  type OptimizationParameterDefinition,
  type WalkForwardFoldDefinition,
  type WalkForwardValidationRequest,
} from "./ai-strategy-contracts";

export type AiValidationSeverity = "INFO" | "WARNING" | "ERROR";

export interface AiContractValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: AiValidationSeverity;
}

export interface AiContractValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiContractValidationIssue[];
}

export interface AiStrategyValidatorOptions {
  readonly strictUnknownMetadataValues?: boolean;
  readonly maximumMetadataEntries?: number;
  readonly maximumFeatureCount?: number;
  readonly maximumEnsembleMembers?: number;
  readonly maximumOptimizationParameters?: number;
  readonly maximumWalkForwardFolds?: number;
  readonly maximumStringLength?: number;
}

export class AiStrategyValidationError extends Error {
  public readonly issues: readonly AiContractValidationIssue[];

  public constructor(
    message: string,
    issues: readonly AiContractValidationIssue[],
  ) {
    super(message);
    this.name = "AiStrategyValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

const MODEL_FAMILIES = new Set<string>([
  "RULE_BASED",
  "LINEAR",
  "TREE",
  "BOOSTING",
  "NEURAL_NETWORK",
  "TRANSFORMER",
  "REINFORCEMENT_LEARNING",
  "LLM",
  "ENSEMBLE",
  "CUSTOM",
]);

const MODEL_TASKS = new Set<string>([
  "CLASSIFICATION",
  "REGRESSION",
  "RANKING",
  "FORECASTING",
  "POLICY",
  "EMBEDDING",
  "GENERATION",
]);

const MODEL_STATUSES = new Set<string>([
  "DRAFT",
  "VALIDATING",
  "READY",
  "ACTIVE",
  "DEGRADED",
  "SUSPENDED",
  "RETIRED",
  "FAILED",
]);

const MARKET_TYPES = new Set<string>([
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "FUTURES",
  "OPTIONS",
]);

const TIMEFRAMES = new Set<string>([
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

const FEATURE_QUALITIES = new Set<string>([
  "VALID",
  "STALE",
  "MISSING",
  "IMPUTED",
  "OUTLIER",
  "INVALID",
]);

const INFERENCE_PURPOSES = new Set<string>([
  "SIGNAL_GENERATION",
  "REGIME_DETECTION",
  "CONFIDENCE_CALIBRATION",
  "PARAMETER_OPTIMIZATION",
  "RISK_ADVISORY",
  "POSITION_SIZING",
  "EXIT_TIMING",
  "META_STRATEGY",
]);

const SIGNAL_ACTIONS = new Set<string>([
  "BUY",
  "SELL",
  "HOLD",
  "CLOSE_LONG",
  "CLOSE_SHORT",
  "REDUCE_LONG",
  "REDUCE_SHORT",
]);

const DIRECTIONS = new Set<string>(["LONG", "SHORT", "FLAT", "HOLD"]);

const REGIMES = new Set<string>([
  "STRONG_BULL",
  "BULL",
  "WEAK_BULL",
  "RANGE",
  "WEAK_BEAR",
  "BEAR",
  "STRONG_BEAR",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "LIQUIDITY_STRESS",
  "TRENDING",
  "MEAN_REVERTING",
  "BREAKOUT",
  "UNKNOWN",
]);

const VOTING_METHODS = new Set<string>([
  "MAJORITY",
  "WEIGHTED_MAJORITY",
  "AVERAGE_SCORE",
  "WEIGHTED_SCORE",
  "UNANIMOUS",
  "STACKING",
  "CUSTOM",
]);

const OPTIMIZATION_ALGORITHMS = new Set<string>([
  "GRID_SEARCH",
  "RANDOM_SEARCH",
  "BAYESIAN",
  "EVOLUTIONARY",
  "REINFORCEMENT_LEARNING",
  "CUSTOM",
]);

const OPTIMIZATION_OBJECTIVES = new Set<string>([
  "TOTAL_RETURN",
  "RISK_ADJUSTED_RETURN",
  "SHARPE_RATIO",
  "SORTINO_RATIO",
  "PROFIT_FACTOR",
  "MAX_DRAWDOWN",
  "WIN_RATE",
  "CALMAR_RATIO",
  "CUSTOM",
]);

const CALIBRATION_METHODS = new Set<string>([
  "NONE",
  "PLATT_SCALING",
  "ISOTONIC",
  "TEMPERATURE",
  "BETA",
  "HISTOGRAM",
  "CUSTOM",
]);

const DEFAULT_OPTIONS: Required<AiStrategyValidatorOptions> = Object.freeze({
  strictUnknownMetadataValues: true,
  maximumMetadataEntries: 128,
  maximumFeatureCount: 2_048,
  maximumEnsembleMembers: 256,
  maximumOptimizationParameters: 256,
  maximumWalkForwardFolds: 1_024,
  maximumStringLength: 16_384,
});

type IssueCollector = AiContractValidationIssue[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addIssue(
  issues: IssueCollector,
  path: string,
  code: string,
  message: string,
  severity: AiValidationSeverity = "ERROR",
): void {
  issues.push(Object.freeze({ path, code, message, severity }));
}

function requireRecord(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    addIssue(issues, path, "EXPECTED_OBJECT", `${path} must be an object.`);
    return false;
  }

  return true;
}

function requireString(
  value: unknown,
  path: string,
  issues: IssueCollector,
  maximumLength: number,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    addIssue(
      issues,
      path,
      "EXPECTED_NON_EMPTY_STRING",
      `${path} must be a non-empty string.`,
    );
    return false;
  }

  if (value.length > maximumLength) {
    addIssue(
      issues,
      path,
      "STRING_TOO_LONG",
      `${path} cannot exceed ${maximumLength} characters.`,
    );
    return false;
  }

  return true;
}

function optionalString(
  value: unknown,
  path: string,
  issues: IssueCollector,
  maximumLength: number,
): boolean {
  return (
    value === undefined ||
    requireString(value, path, issues, maximumLength)
  );
}

function requireBoolean(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is boolean {
  if (typeof value !== "boolean") {
    addIssue(issues, path, "EXPECTED_BOOLEAN", `${path} must be a boolean.`);
    return false;
  }

  return true;
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is number {
  if (!isFiniteNumber(value)) {
    addIssue(
      issues,
      path,
      "EXPECTED_FINITE_NUMBER",
      `${path} must be a finite number.`,
    );
    return false;
  }

  return true;
}

function optionalFiniteNumber(
  value: unknown,
  path: string,
  issues: IssueCollector,
): boolean {
  return (
    value === undefined ||
    requireFiniteNumber(value, path, issues)
  );
}

function requireInteger(
  value: unknown,
  path: string,
  issues: IssueCollector,
  minimum?: number,
): value is number {
  if (!Number.isInteger(value)) {
    addIssue(issues, path, "EXPECTED_INTEGER", `${path} must be an integer.`);
    return false;
  }

  if (minimum !== undefined && (value as number) < minimum) {
    addIssue(
      issues,
      path,
      "INTEGER_BELOW_MINIMUM",
      `${path} must be greater than or equal to ${minimum}.`,
    );
    return false;
  }

  return true;
}

function requireTimestamp(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is number {
  if (!requireFiniteNumber(value, path, issues)) {
    return false;
  }

  if (value < 0) {
    addIssue(
      issues,
      path,
      "NEGATIVE_TIMESTAMP",
      `${path} cannot be negative.`,
    );
    return false;
  }

  return true;
}

function requireRange(
  value: unknown,
  path: string,
  issues: IssueCollector,
  minimum: number,
  maximum: number,
): value is number {
  if (!requireFiniteNumber(value, path, issues)) {
    return false;
  }

  if (value < minimum || value > maximum) {
    addIssue(
      issues,
      path,
      "OUT_OF_RANGE",
      `${path} must be between ${minimum} and ${maximum}.`,
    );
    return false;
  }

  return true;
}

function requireEnum(
  value: unknown,
  allowed: ReadonlySet<string>,
  path: string,
  issues: IssueCollector,
): value is string {
  if (typeof value !== "string" || !allowed.has(value)) {
    addIssue(
      issues,
      path,
      "UNSUPPORTED_VALUE",
      `${path} contains an unsupported value.`,
    );
    return false;
  }

  return true;
}

function requireArray(
  value: unknown,
  path: string,
  issues: IssueCollector,
  maximumLength?: number,
): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "EXPECTED_ARRAY", `${path} must be an array.`);
    return false;
  }

  if (maximumLength !== undefined && value.length > maximumLength) {
    addIssue(
      issues,
      path,
      "ARRAY_TOO_LARGE",
      `${path} cannot contain more than ${maximumLength} entries.`,
    );
    return false;
  }

  return true;
}

function validatePrimitive(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is AiStrategyPrimitive {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  addIssue(
    issues,
    path,
    "INVALID_PRIMITIVE",
    `${path} must be a string, finite number, boolean, or null.`,
  );
  return false;
}

function validateMetadata(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiStrategyMetadata {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length > options.maximumMetadataEntries) {
    addIssue(
      issues,
      path,
      "METADATA_TOO_LARGE",
      `${path} cannot contain more than ${options.maximumMetadataEntries} entries.`,
    );
  }

  for (const [key, entryValue] of entries) {
    const entryPath = `${path}.${key}`;

    if (Array.isArray(entryValue)) {
      for (let index = 0; index < entryValue.length; index += 1) {
        validatePrimitive(entryValue[index], `${entryPath}[${index}]`, issues);
      }
      continue;
    }

    if (!validatePrimitive(entryValue, entryPath, issues)) {
      if (!options.strictUnknownMetadataValues) {
        issues.pop();
        addIssue(
          issues,
          entryPath,
          "IGNORED_METADATA_VALUE",
          `${entryPath} uses a non-standard metadata value.`,
          "WARNING",
        );
      }
    }
  }

  return true;
}

function validateUniqueStrings(
  values: readonly unknown[],
  path: string,
  issues: IssueCollector,
  maximumLength: number,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireString(value, itemPath, issues, maximumLength)) {
      return;
    }

    if (seen.has(value)) {
      addIssue(
        issues,
        itemPath,
        "DUPLICATE_VALUE",
        `${itemPath} duplicates an earlier value.`,
      );
    }

    seen.add(value);
  });
}

function validateInstrumentInternal(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiStrategyInstrument {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  requireString(value.exchangeId, `${path}.exchangeId`, issues, options.maximumStringLength);
  requireString(value.symbol, `${path}.symbol`, issues, options.maximumStringLength);
  requireString(
    value.normalizedSymbol,
    `${path}.normalizedSymbol`,
    issues,
    options.maximumStringLength,
  );
  requireString(value.baseAsset, `${path}.baseAsset`, issues, options.maximumStringLength);
  requireString(value.quoteAsset, `${path}.quoteAsset`, issues, options.maximumStringLength);
  requireEnum(value.marketType, MARKET_TYPES, `${path}.marketType`, issues);

  for (const key of [
    "contractSize",
    "pricePrecision",
    "quantityPrecision",
  ] as const) {
    if (optionalFiniteNumber(value[key], `${path}.${key}`, issues) && value[key] !== undefined) {
      if ((value[key] as number) < 0) {
        addIssue(
          issues,
          `${path}.${key}`,
          "NEGATIVE_VALUE",
          `${path}.${key} cannot be negative.`,
        );
      }
    }
  }

  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateMarketContextInternal(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiStrategyMarketContext {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  validateInstrumentInternal(value.instrument, `${path}.instrument`, issues, options);
  requireEnum(value.timeframe, TIMEFRAMES, `${path}.timeframe`, issues);
  requireTimestamp(value.observedAt, `${path}.observedAt`, issues);
  requireInteger(value.sequence, `${path}.sequence`, issues, 0);

  for (const key of [
    "markPrice",
    "indexPrice",
    "bestBid",
    "bestAsk",
    "lastPrice",
    "volume",
    "openInterest",
    "fundingRate",
  ] as const) {
    optionalFiniteNumber(value[key], `${path}.${key}`, issues);
  }

  if (
    isFiniteNumber(value.bestBid) &&
    isFiniteNumber(value.bestAsk) &&
    value.bestBid > value.bestAsk
  ) {
    addIssue(
      issues,
      path,
      "CROSSED_MARKET",
      `${path}.bestBid cannot exceed ${path}.bestAsk.`,
    );
  }

  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateFeatureValue(
  value: unknown,
  path: string,
  issues: IssueCollector,
): value is AiFeatureValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  addIssue(
    issues,
    path,
    "INVALID_FEATURE_VALUE",
    `${path} must be a string, finite number, boolean, or null.`,
  );
  return false;
}

function validateFeatureObservationInternal(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiFeatureObservation {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  requireString(value.featureId, `${path}.featureId`, issues, options.maximumStringLength);
  validateFeatureValue(value.value, `${path}.value`, issues);
  requireTimestamp(value.observedAt, `${path}.observedAt`, issues);
  requireString(value.source, `${path}.source`, issues, options.maximumStringLength);
  requireEnum(value.quality, FEATURE_QUALITIES, `${path}.quality`, issues);
  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateFeatureVectorInternal(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiFeatureVector {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  requireString(value.vectorId, `${path}.vectorId`, issues, options.maximumStringLength);
  requireString(
    value.schemaVersion,
    `${path}.schemaVersion`,
    issues,
    options.maximumStringLength,
  );
  validateInstrumentInternal(value.instrument, `${path}.instrument`, issues, options);
  requireEnum(value.timeframe, TIMEFRAMES, `${path}.timeframe`, issues);
  requireTimestamp(value.observedAt, `${path}.observedAt`, issues);

  const observationIds = new Set<string>();
  if (
    requireArray(
      value.observations,
      `${path}.observations`,
      issues,
      options.maximumFeatureCount,
    )
  ) {
    value.observations.forEach((observation, index) => {
      const observationPath = `${path}.observations[${index}]`;
      validateFeatureObservationInternal(
        observation,
        observationPath,
        issues,
        options,
      );

      if (isRecord(observation) && typeof observation.featureId === "string") {
        if (observationIds.has(observation.featureId)) {
          addIssue(
            issues,
            `${observationPath}.featureId`,
            "DUPLICATE_FEATURE",
            `${observationPath}.featureId duplicates an earlier observation.`,
          );
        }
        observationIds.add(observation.featureId);
      }
    });
  }

  if (requireRecord(value.values, `${path}.values`, issues)) {
    const entries = Object.entries(value.values);
    if (entries.length > options.maximumFeatureCount) {
      addIssue(
        issues,
        `${path}.values`,
        "TOO_MANY_FEATURES",
        `${path}.values cannot contain more than ${options.maximumFeatureCount} features.`,
      );
    }

    for (const [featureId, featureValue] of entries) {
      validateFeatureValue(featureValue, `${path}.values.${featureId}`, issues);
    }

    for (const featureId of observationIds) {
      if (!(featureId in value.values)) {
        addIssue(
          issues,
          `${path}.values`,
          "OBSERVATION_VALUE_MISSING",
          `${path}.values is missing feature "${featureId}".`,
          "WARNING",
        );
      }
    }
  }

  optionalString(value.checksum, `${path}.checksum`, issues, options.maximumStringLength);
  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateModelRuntimeConfigurationInternal(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is AiModelRuntimeConfiguration {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  requireString(value.providerId, `${path}.providerId`, issues, options.maximumStringLength);
  requireString(value.modelId, `${path}.modelId`, issues, options.maximumStringLength);
  optionalString(
    value.modelVersion,
    `${path}.modelVersion`,
    issues,
    options.maximumStringLength,
  );

  if (requireInteger(value.timeoutMs, `${path}.timeoutMs`, issues, 1)) {
    if ((value.timeoutMs as number) > 3_600_000) {
      addIssue(
        issues,
        `${path}.timeoutMs`,
        "TIMEOUT_TOO_LARGE",
        `${path}.timeoutMs cannot exceed one hour.`,
      );
    }
  }

  optionalString(
    value.deterministicSeed,
    `${path}.deterministicSeed`,
    issues,
    options.maximumStringLength,
  );
  requireRange(
    value.minimumConfidence,
    `${path}.minimumConfidence`,
    issues,
    0,
    1,
  );
  requireInteger(
    value.maximumInferenceAgeMs,
    `${path}.maximumInferenceAgeMs`,
    issues,
    0,
  );
  requireBoolean(value.failClosed, `${path}.failClosed`, issues);

  if (requireRecord(value.parameters, `${path}.parameters`, issues)) {
    for (const [key, parameter] of Object.entries(value.parameters)) {
      validatePrimitive(parameter, `${path}.parameters.${key}`, issues);
    }
  }

  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateValidationWindow(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): boolean {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  const startValid = requireTimestamp(value.startTime, `${path}.startTime`, issues);
  const endValid = requireTimestamp(value.endTime, `${path}.endTime`, issues);

  if (
    startValid &&
    endValid &&
    (value.startTime as number) >= (value.endTime as number)
  ) {
    addIssue(
      issues,
      path,
      "INVALID_WINDOW",
      `${path}.startTime must be earlier than ${path}.endTime.`,
    );
  }

  optionalString(value.datasetId, `${path}.datasetId`, issues, options.maximumStringLength);
  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function validateOptimizationParameter(
  value: unknown,
  path: string,
  issues: IssueCollector,
  options: Required<AiStrategyValidatorOptions>,
): value is OptimizationParameterDefinition {
  if (!requireRecord(value, path, issues)) {
    return false;
  }

  requireString(value.parameterId, `${path}.parameterId`, issues, options.maximumStringLength);
  requireEnum(
    value.dataType,
    new Set(["NUMBER", "INTEGER", "BOOLEAN", "CATEGORY"]),
    `${path}.dataType`,
    issues,
  );
  optionalFiniteNumber(value.minimum, `${path}.minimum`, issues);
  optionalFiniteNumber(value.maximum, `${path}.maximum`, issues);
  optionalFiniteNumber(value.step, `${path}.step`, issues);

  if (
    isFiniteNumber(value.minimum) &&
    isFiniteNumber(value.maximum) &&
    value.minimum > value.maximum
  ) {
    addIssue(
      issues,
      path,
      "INVALID_PARAMETER_RANGE",
      `${path}.minimum cannot exceed ${path}.maximum.`,
    );
  }

  if (isFiniteNumber(value.step) && value.step <= 0) {
    addIssue(
      issues,
      `${path}.step`,
      "INVALID_STEP",
      `${path}.step must be greater than zero.`,
    );
  }

  if (value.categories !== undefined) {
    if (requireArray(value.categories, `${path}.categories`, issues)) {
      validateUniqueStrings(
        value.categories,
        `${path}.categories`,
        issues,
        options.maximumStringLength,
      );
    }
  }

  validatePrimitive(value.defaultValue, `${path}.defaultValue`, issues);
  validateMetadata(value.metadata, `${path}.metadata`, issues, options);
  return true;
}

function finish(issues: IssueCollector): AiContractValidationResult {
  const frozenIssues = Object.freeze([...issues]);
  return Object.freeze({
    valid: !frozenIssues.some((issue) => issue.severity === "ERROR"),
    issues: frozenIssues,
  });
}

export class AiStrategyContractValidator {
  private readonly options: Required<AiStrategyValidatorOptions>;

  public constructor(options: AiStrategyValidatorOptions = {}) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });
  }

  public validateInstrument(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    validateInstrumentInternal(value, "instrument", issues, this.options);
    return finish(issues);
  }

  public validateMarketContext(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    validateMarketContextInternal(value, "marketContext", issues, this.options);
    return finish(issues);
  }

  public validateFeatureDefinition(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "featureDefinition";

    if (requireRecord(value, path, issues)) {
      requireString(value.featureId, `${path}.featureId`, issues, this.options.maximumStringLength);
      requireString(value.displayName, `${path}.displayName`, issues, this.options.maximumStringLength);
      optionalString(value.description, `${path}.description`, issues, this.options.maximumStringLength);
      requireEnum(
        value.dataType,
        new Set(["NUMBER", "BOOLEAN", "CATEGORY"]),
        `${path}.dataType`,
        issues,
      );
      optionalString(value.category, `${path}.category`, issues, this.options.maximumStringLength);
      optionalFiniteNumber(value.minimum, `${path}.minimum`, issues);
      optionalFiniteNumber(value.maximum, `${path}.maximum`, issues);

      if (
        isFiniteNumber(value.minimum) &&
        isFiniteNumber(value.maximum) &&
        value.minimum > value.maximum
      ) {
        addIssue(
          issues,
          path,
          "INVALID_FEATURE_RANGE",
          `${path}.minimum cannot exceed ${path}.maximum.`,
        );
      }

      if (value.defaultValue !== undefined) {
        validateFeatureValue(value.defaultValue, `${path}.defaultValue`, issues);
      }

      requireBoolean(value.required, `${path}.required`, issues);
      requireBoolean(value.deterministic, `${path}.deterministic`, issues);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateFeatureObservation(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    validateFeatureObservationInternal(
      value,
      "featureObservation",
      issues,
      this.options,
    );
    return finish(issues);
  }

  public validateFeatureVector(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    validateFeatureVectorInternal(value, "featureVector", issues, this.options);
    return finish(issues);
  }

  public validateFeatureSnapshot(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "featureSnapshot";

    if (requireRecord(value, path, issues)) {
      requireString(value.snapshotId, `${path}.snapshotId`, issues, this.options.maximumStringLength);
      requireTimestamp(value.createdAt, `${path}.createdAt`, issues);

      if (
        requireArray(
          value.vectors,
          `${path}.vectors`,
          issues,
          this.options.maximumFeatureCount,
        )
      ) {
        value.vectors.forEach((vector, index) => {
          validateFeatureVectorInternal(
            vector,
            `${path}.vectors[${index}]`,
            issues,
            this.options,
          );
        });
      }

      requireRange(value.completeness, `${path}.completeness`, issues, 0, 1);
      requireBoolean(value.valid, `${path}.valid`, issues);

      if (requireArray(value.issues, `${path}.issues`, issues)) {
        value.issues.forEach((issue, index) => {
          const issuePath = `${path}.issues[${index}]`;
          if (!requireRecord(issue, issuePath, issues)) {
            return;
          }

          optionalString(
            issue.featureId,
            `${issuePath}.featureId`,
            issues,
            this.options.maximumStringLength,
          );
          requireString(issue.code, `${issuePath}.code`, issues, this.options.maximumStringLength);
          requireString(issue.message, `${issuePath}.message`, issues, this.options.maximumStringLength);
          requireEnum(
            issue.severity,
            new Set(["INFO", "WARNING", "ERROR"]),
            `${issuePath}.severity`,
            issues,
          );
          validateMetadata(
            issue.metadata,
            `${issuePath}.metadata`,
            issues,
            this.options,
          );
        });
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateModelDescriptor(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "modelDescriptor";

    if (requireRecord(value, path, issues)) {
      for (const key of [
        "providerId",
        "modelId",
        "modelVersion",
        "displayName",
        "inputSchemaVersion",
        "outputSchemaVersion",
      ] as const) {
        requireString(value[key], `${path}.${key}`, issues, this.options.maximumStringLength);
      }

      optionalString(value.description, `${path}.description`, issues, this.options.maximumStringLength);
      requireEnum(value.family, MODEL_FAMILIES, `${path}.family`, issues);
      requireEnum(value.task, MODEL_TASKS, `${path}.task`, issues);
      requireEnum(
        value.lifecycleStatus,
        MODEL_STATUSES,
        `${path}.lifecycleStatus`,
        issues,
      );
      requireBoolean(value.deterministic, `${path}.deterministic`, issues);
      requireBoolean(value.supportsSeed, `${path}.supportsSeed`, issues);
      requireBoolean(value.supportsBatching, `${path}.supportsBatching`, issues);

      if (requireArray(value.supportedMarketTypes, `${path}.supportedMarketTypes`, issues)) {
        value.supportedMarketTypes.forEach((entry, index) => {
          requireEnum(
            entry,
            MARKET_TYPES,
            `${path}.supportedMarketTypes[${index}]`,
            issues,
          );
        });
      }

      if (requireArray(value.supportedTimeframes, `${path}.supportedTimeframes`, issues)) {
        value.supportedTimeframes.forEach((entry, index) => {
          requireEnum(
            entry,
            TIMEFRAMES,
            `${path}.supportedTimeframes[${index}]`,
            issues,
          );
        });
      }

      if (requireArray(value.requiredFeatures, `${path}.requiredFeatures`, issues)) {
        validateUniqueStrings(
          value.requiredFeatures,
          `${path}.requiredFeatures`,
          issues,
          this.options.maximumStringLength,
        );
      }

      if (requireArray(value.optionalFeatures, `${path}.optionalFeatures`, issues)) {
        validateUniqueStrings(
          value.optionalFeatures,
          `${path}.optionalFeatures`,
          issues,
          this.options.maximumStringLength,
        );
      }

      optionalFiniteNumber(value.trainedAt, `${path}.trainedAt`, issues);
      optionalString(value.trainingDatasetId, `${path}.trainingDatasetId`, issues, this.options.maximumStringLength);
      optionalString(value.checksum, `${path}.checksum`, issues, this.options.maximumStringLength);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateModelRuntimeConfiguration(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    validateModelRuntimeConfigurationInternal(
      value,
      "modelConfiguration",
      issues,
      this.options,
    );
    return finish(issues);
  }

  public validateInferenceRequest(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "inferenceRequest";

    if (requireRecord(value, path, issues)) {
      for (const key of [
        "requestId",
        "correlationId",
        "strategyId",
        "strategyInstanceId",
      ] as const) {
        requireString(value[key], `${path}.${key}`, issues, this.options.maximumStringLength);
      }

      requireTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
      validateMarketContextInternal(
        value.marketContext,
        `${path}.marketContext`,
        issues,
        this.options,
      );
      validateFeatureVectorInternal(
        value.featureVector,
        `${path}.featureVector`,
        issues,
        this.options,
      );
      validateModelRuntimeConfigurationInternal(
        value.model,
        `${path}.model`,
        issues,
        this.options,
      );
      requireEnum(value.purpose, INFERENCE_PURPOSES, `${path}.purpose`, issues);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);

      if (
        isRecord(value.marketContext) &&
        isRecord(value.featureVector) &&
        typeof value.marketContext.timeframe === "string" &&
        typeof value.featureVector.timeframe === "string" &&
        value.marketContext.timeframe !== value.featureVector.timeframe
      ) {
        addIssue(
          issues,
          path,
          "TIMEFRAME_MISMATCH",
          "The market context and feature vector must use the same timeframe.",
        );
      }
    }

    return finish(issues);
  }

  public validateRegimeDetection(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "regimeDetection";

    if (requireRecord(value, path, issues)) {
      requireString(value.detectionId, `${path}.detectionId`, issues, this.options.maximumStringLength);
      validateInstrumentInternal(value.instrument, `${path}.instrument`, issues, this.options);
      requireEnum(value.timeframe, TIMEFRAMES, `${path}.timeframe`, issues);
      const detectedValid = requireTimestamp(value.detectedAt, `${path}.detectedAt`, issues);
      const validUntilValid = requireTimestamp(value.validUntil, `${path}.validUntil`, issues);

      if (
        detectedValid &&
        validUntilValid &&
        (value.validUntil as number) < (value.detectedAt as number)
      ) {
        addIssue(
          issues,
          `${path}.validUntil`,
          "INVALID_EXPIRY",
          `${path}.validUntil cannot precede ${path}.detectedAt.`,
        );
      }

      requireEnum(value.primaryRegime, REGIMES, `${path}.primaryRegime`, issues);
      requireRange(value.confidence, `${path}.confidence`, issues, 0, 1);

      let probabilityTotal = 0;
      if (requireArray(value.probabilities, `${path}.probabilities`, issues)) {
        const seen = new Set<string>();
        value.probabilities.forEach((entry, index) => {
          const entryPath = `${path}.probabilities[${index}]`;
          if (!requireRecord(entry, entryPath, issues)) {
            return;
          }

          if (requireEnum(entry.regime, REGIMES, `${entryPath}.regime`, issues)) {
            if (seen.has(entry.regime)) {
              addIssue(
                issues,
                `${entryPath}.regime`,
                "DUPLICATE_REGIME",
                `${entryPath}.regime duplicates an earlier regime.`,
              );
            }
            seen.add(entry.regime);
          }

          if (
            requireRange(entry.probability, `${entryPath}.probability`, issues, 0, 1)
          ) {
            probabilityTotal += entry.probability;
          }
        });
      }

      if (probabilityTotal > 1.000001) {
        addIssue(
          issues,
          `${path}.probabilities`,
          "INVALID_PROBABILITY_TOTAL",
          "Regime probabilities cannot sum to more than 1.",
        );
      }

      if (requireArray(value.supportingFeatures, `${path}.supportingFeatures`, issues)) {
        value.supportingFeatures.forEach((entry, index) => {
          const entryPath = `${path}.supportingFeatures[${index}]`;
          if (!requireRecord(entry, entryPath, issues)) {
            return;
          }
          requireString(entry.featureId, `${entryPath}.featureId`, issues, this.options.maximumStringLength);
          requireFiniteNumber(entry.contribution, `${entryPath}.contribution`, issues);
        });
      }

      if (requireRecord(value.model, `${path}.model`, issues)) {
        requireString(value.model.providerId, `${path}.model.providerId`, issues, this.options.maximumStringLength);
        requireString(value.model.modelId, `${path}.model.modelId`, issues, this.options.maximumStringLength);
        requireString(value.model.modelVersion, `${path}.model.modelVersion`, issues, this.options.maximumStringLength);
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateGeneratedSignal(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "generatedSignal";

    if (requireRecord(value, path, issues)) {
      for (const key of [
        "signalId",
        "correlationId",
        "strategyId",
        "strategyInstanceId",
        "sourceId",
      ] as const) {
        requireString(value[key], `${path}.${key}`, issues, this.options.maximumStringLength);
      }

      requireEnum(
        value.sourceType,
        new Set([
          "MODEL",
          "ENSEMBLE",
          "META_STRATEGY",
          "LLM",
          "REINFORCEMENT_LEARNING",
          "HYBRID",
        ]),
        `${path}.sourceType`,
        issues,
      );
      validateInstrumentInternal(value.instrument, `${path}.instrument`, issues, this.options);
      requireEnum(value.timeframe, TIMEFRAMES, `${path}.timeframe`, issues);
      requireEnum(value.action, SIGNAL_ACTIONS, `${path}.action`, issues);
      requireEnum(value.direction, DIRECTIONS, `${path}.direction`, issues);

      const generatedValid = requireTimestamp(value.generatedAt, `${path}.generatedAt`, issues);
      const validUntilValid = requireTimestamp(value.validUntil, `${path}.validUntil`, issues);
      if (
        generatedValid &&
        validUntilValid &&
        (value.validUntil as number) < (value.generatedAt as number)
      ) {
        addIssue(
          issues,
          `${path}.validUntil`,
          "INVALID_EXPIRY",
          `${path}.validUntil cannot precede ${path}.generatedAt.`,
        );
      }

      requireRange(value.confidence, `${path}.confidence`, issues, 0, 1);
      requireRange(value.rawConfidence, `${path}.rawConfidence`, issues, 0, 1);
      requireFiniteNumber(value.score, `${path}.score`, issues);

      if (value.regime !== undefined) {
        const result = this.validateRegimeDetection(value.regime);
        result.issues.forEach((issue) =>
          addIssue(
            issues,
            `${path}.regime.${issue.path}`,
            issue.code,
            issue.message,
            issue.severity,
          ),
        );
      }

      for (const key of [
        "targetPrice",
        "stopLossPrice",
        "takeProfitPrice",
        "suggestedQuantity",
        "suggestedNotional",
        "leverage",
      ] as const) {
        if (optionalFiniteNumber(value[key], `${path}.${key}`, issues) && isFiniteNumber(value[key])) {
          if (value[key] < 0) {
            addIssue(
              issues,
              `${path}.${key}`,
              "NEGATIVE_VALUE",
              `${path}.${key} cannot be negative.`,
            );
          }
        }
      }

      if (requireArray(value.rationale, `${path}.rationale`, issues)) {
        value.rationale.forEach((entry, index) => {
          requireString(
            entry,
            `${path}.rationale[${index}]`,
            issues,
            this.options.maximumStringLength,
          );
        });
      }

      if (requireArray(value.featureContributions, `${path}.featureContributions`, issues)) {
        value.featureContributions.forEach((entry, index) => {
          const entryPath = `${path}.featureContributions[${index}]`;
          if (!requireRecord(entry, entryPath, issues)) {
            return;
          }
          requireString(entry.featureId, `${entryPath}.featureId`, issues, this.options.maximumStringLength);
          requireFiniteNumber(entry.contribution, `${entryPath}.contribution`, issues);
        });
      }

      if (requireArray(value.modelReferences, `${path}.modelReferences`, issues)) {
        value.modelReferences.forEach((entry, index) => {
          const entryPath = `${path}.modelReferences[${index}]`;
          if (!requireRecord(entry, entryPath, issues)) {
            return;
          }
          requireString(entry.providerId, `${entryPath}.providerId`, issues, this.options.maximumStringLength);
          requireString(entry.modelId, `${entryPath}.modelId`, issues, this.options.maximumStringLength);
          requireString(entry.modelVersion, `${entryPath}.modelVersion`, issues, this.options.maximumStringLength);
        });
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateSignalGenerationRequest(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "signalGenerationRequest";

    if (requireRecord(value, path, issues)) {
      for (const key of [
        "requestId",
        "correlationId",
        "strategyId",
        "strategyInstanceId",
      ] as const) {
        requireString(value[key], `${path}.${key}`, issues, this.options.maximumStringLength);
      }

      requireTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
      validateMarketContextInternal(
        value.marketContext,
        `${path}.marketContext`,
        issues,
        this.options,
      );

      const snapshotResult = this.validateFeatureSnapshot(value.featureSnapshot);
      snapshotResult.issues.forEach((issue) =>
        addIssue(
          issues,
          `${path}.featureSnapshot.${issue.path}`,
          issue.code,
          issue.message,
          issue.severity,
        ),
      );

      if (value.regime !== undefined) {
        const regimeResult = this.validateRegimeDetection(value.regime);
        regimeResult.issues.forEach((issue) =>
          addIssue(
            issues,
            `${path}.regime.${issue.path}`,
            issue.code,
            issue.message,
            issue.severity,
          ),
        );
      }

      if (requireArray(value.modelConfigurations, `${path}.modelConfigurations`, issues)) {
        if (value.modelConfigurations.length === 0) {
          addIssue(
            issues,
            `${path}.modelConfigurations`,
            "EMPTY_MODEL_SET",
            `${path}.modelConfigurations must contain at least one model.`,
          );
        }

        value.modelConfigurations.forEach((configuration, index) => {
          validateModelRuntimeConfigurationInternal(
            configuration,
            `${path}.modelConfigurations[${index}]`,
            issues,
            this.options,
          );
        });
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateEnsembleConfiguration(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "ensembleConfiguration";

    if (requireRecord(value, path, issues)) {
      requireString(value.ensembleId, `${path}.ensembleId`, issues, this.options.maximumStringLength);
      requireString(value.displayName, `${path}.displayName`, issues, this.options.maximumStringLength);
      requireString(value.version, `${path}.version`, issues, this.options.maximumStringLength);
      requireEnum(value.votingMethod, VOTING_METHODS, `${path}.votingMethod`, issues);

      let enabledCount = 0;
      if (
        requireArray(
          value.members,
          `${path}.members`,
          issues,
          this.options.maximumEnsembleMembers,
        )
      ) {
        if (value.members.length === 0) {
          addIssue(
            issues,
            `${path}.members`,
            "EMPTY_ENSEMBLE",
            `${path}.members must contain at least one member.`,
          );
        }

        const memberIds = new Set<string>();
        value.members.forEach((member, index) => {
          const memberPath = `${path}.members[${index}]`;
          if (!requireRecord(member, memberPath, issues)) {
            return;
          }

          if (
            requireString(
              member.memberId,
              `${memberPath}.memberId`,
              issues,
              this.options.maximumStringLength,
            )
          ) {
            if (memberIds.has(member.memberId)) {
              addIssue(
                issues,
                `${memberPath}.memberId`,
                "DUPLICATE_MEMBER",
                `${memberPath}.memberId duplicates an earlier member.`,
              );
            }
            memberIds.add(member.memberId);
          }

          validateModelRuntimeConfigurationInternal(
            member.model,
            `${memberPath}.model`,
            issues,
            this.options,
          );
          if (
            requireFiniteNumber(member.weight, `${memberPath}.weight`, issues) &&
            member.weight < 0
          ) {
            addIssue(
              issues,
              `${memberPath}.weight`,
              "NEGATIVE_WEIGHT",
              `${memberPath}.weight cannot be negative.`,
            );
          }

          if (requireBoolean(member.enabled, `${memberPath}.enabled`, issues) && member.enabled) {
            enabledCount += 1;
          }

          if (member.minimumConfidence !== undefined) {
            requireRange(
              member.minimumConfidence,
              `${memberPath}.minimumConfidence`,
              issues,
              0,
              1,
            );
          }

          if (requireArray(member.allowedRegimes, `${memberPath}.allowedRegimes`, issues)) {
            member.allowedRegimes.forEach((regime, regimeIndex) => {
              requireEnum(
                regime,
                REGIMES,
                `${memberPath}.allowedRegimes[${regimeIndex}]`,
                issues,
              );
            });
          }

          validateMetadata(
            member.metadata,
            `${memberPath}.metadata`,
            issues,
            this.options,
          );
        });
      }

      if (requireInteger(value.quorum, `${path}.quorum`, issues, 1) && value.quorum > enabledCount) {
        addIssue(
          issues,
          `${path}.quorum`,
          "QUORUM_EXCEEDS_ENABLED_MEMBERS",
          `${path}.quorum cannot exceed the number of enabled members.`,
        );
      }

      requireRange(value.minimumAgreement, `${path}.minimumAgreement`, issues, 0, 1);
      requireRange(value.minimumConfidence, `${path}.minimumConfidence`, issues, 0, 1);
      requireBoolean(value.rejectOnTie, `${path}.rejectOnTie`, issues);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateMetaStrategyRequest(value: unknown): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "metaStrategyRequest";

    if (requireRecord(value, path, issues)) {
      requireString(value.requestId, `${path}.requestId`, issues, this.options.maximumStringLength);
      requireString(value.correlationId, `${path}.correlationId`, issues, this.options.maximumStringLength);
      requireTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
      validateMarketContextInternal(
        value.marketContext,
        `${path}.marketContext`,
        issues,
        this.options,
      );

      if (value.regime !== undefined) {
        const regimeResult = this.validateRegimeDetection(value.regime);
        regimeResult.issues.forEach((issue) =>
          addIssue(
            issues,
            `${path}.regime.${issue.path}`,
            issue.code,
            issue.message,
            issue.severity,
          ),
        );
      }

      if (requireArray(value.candidates, `${path}.candidates`, issues)) {
        const candidateIds = new Set<string>();
        value.candidates.forEach((candidate, index) => {
          const candidatePath = `${path}.candidates[${index}]`;
          if (!requireRecord(candidate, candidatePath, issues)) {
            return;
          }

          if (
            requireString(
              candidate.candidateId,
              `${candidatePath}.candidateId`,
              issues,
              this.options.maximumStringLength,
            )
          ) {
            if (candidateIds.has(candidate.candidateId)) {
              addIssue(
                issues,
                `${candidatePath}.candidateId`,
                "DUPLICATE_CANDIDATE",
                `${candidatePath}.candidateId duplicates an earlier candidate.`,
              );
            }
            candidateIds.add(candidate.candidateId);
          }

          requireString(candidate.strategyId, `${candidatePath}.strategyId`, issues, this.options.maximumStringLength);
          requireString(candidate.strategyInstanceId, `${candidatePath}.strategyInstanceId`, issues, this.options.maximumStringLength);

          const signalResult = this.validateGeneratedSignal(candidate.signal);
          signalResult.issues.forEach((issue) =>
            addIssue(
              issues,
              `${candidatePath}.signal.${issue.path}`,
              issue.code,
              issue.message,
              issue.severity,
            ),
          );

          for (const key of [
            "performanceScore",
            "riskScore",
            "regimeSuitability",
            "allocationWeight",
          ] as const) {
            optionalFiniteNumber(candidate[key], `${candidatePath}.${key}`, issues);
          }

          validateMetadata(
            candidate.metadata,
            `${candidatePath}.metadata`,
            issues,
            this.options,
          );
        });
      }

      if (requireRecord(value.constraints, `${path}.constraints`, issues)) {
        requireRange(
          value.constraints.minimumConfidence,
          `${path}.constraints.minimumConfidence`,
          issues,
          0,
          1,
        );
        requireInteger(
          value.constraints.maximumCandidates,
          `${path}.constraints.maximumCandidates`,
          issues,
          1,
        );
        requireRange(
          value.constraints.maximumLongAllocation,
          `${path}.constraints.maximumLongAllocation`,
          issues,
          0,
          1,
        );
        requireRange(
          value.constraints.maximumShortAllocation,
          `${path}.constraints.maximumShortAllocation`,
          issues,
          0,
          1,
        );
        requireRange(
          value.constraints.maximumGrossAllocation,
          `${path}.constraints.maximumGrossAllocation`,
          issues,
          0,
          2,
        );
        requireBoolean(
          value.constraints.requireRegimeCompatibility,
          `${path}.constraints.requireRegimeCompatibility`,
          issues,
        );
        validateMetadata(
          value.constraints.metadata,
          `${path}.constraints.metadata`,
          issues,
          this.options,
        );
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateOptimizationRequest(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "optimizationRequest";

    if (requireRecord(value, path, issues)) {
      requireString(value.requestId, `${path}.requestId`, issues, this.options.maximumStringLength);
      requireString(value.strategyId, `${path}.strategyId`, issues, this.options.maximumStringLength);
      requireString(value.strategyVersion, `${path}.strategyVersion`, issues, this.options.maximumStringLength);
      requireTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
      requireEnum(value.algorithm, OPTIMIZATION_ALGORITHMS, `${path}.algorithm`, issues);
      requireEnum(value.objective, OPTIMIZATION_OBJECTIVES, `${path}.objective`, issues);

      const parameterIds = new Set<string>();
      if (
        requireArray(
          value.parameterDefinitions,
          `${path}.parameterDefinitions`,
          issues,
          this.options.maximumOptimizationParameters,
        )
      ) {
        value.parameterDefinitions.forEach((parameter, index) => {
          const parameterPath = `${path}.parameterDefinitions[${index}]`;
          validateOptimizationParameter(
            parameter,
            parameterPath,
            issues,
            this.options,
          );

          if (isRecord(parameter) && typeof parameter.parameterId === "string") {
            if (parameterIds.has(parameter.parameterId)) {
              addIssue(
                issues,
                `${parameterPath}.parameterId`,
                "DUPLICATE_PARAMETER",
                `${parameterPath}.parameterId duplicates an earlier parameter.`,
              );
            }
            parameterIds.add(parameter.parameterId);
          }
        });
      }

      if (requireRecord(value.currentParameters, `${path}.currentParameters`, issues)) {
        for (const [key, parameter] of Object.entries(value.currentParameters)) {
          validatePrimitive(parameter, `${path}.currentParameters.${key}`, issues);

          if (!parameterIds.has(key)) {
            addIssue(
              issues,
              `${path}.currentParameters.${key}`,
              "UNDECLARED_PARAMETER",
              `Current parameter "${key}" has no matching definition.`,
              "WARNING",
            );
          }
        }
      }

      validateValidationWindow(
        value.trainingWindow,
        `${path}.trainingWindow`,
        issues,
        this.options,
      );
      validateValidationWindow(
        value.validationWindow,
        `${path}.validationWindow`,
        issues,
        this.options,
      );
      requireInteger(value.maximumTrials, `${path}.maximumTrials`, issues, 1);
      optionalString(value.deterministicSeed, `${path}.deterministicSeed`, issues, this.options.maximumStringLength);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateWalkForwardRequest(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "walkForwardRequest";

    if (requireRecord(value, path, issues)) {
      requireString(value.requestId, `${path}.requestId`, issues, this.options.maximumStringLength);
      requireString(value.strategyId, `${path}.strategyId`, issues, this.options.maximumStringLength);
      requireString(value.strategyVersion, `${path}.strategyVersion`, issues, this.options.maximumStringLength);
      requireString(value.datasetId, `${path}.datasetId`, issues, this.options.maximumStringLength);
      requireTimestamp(value.requestedAt, `${path}.requestedAt`, issues);

      if (
        requireArray(
          value.folds,
          `${path}.folds`,
          issues,
          this.options.maximumWalkForwardFolds,
        )
      ) {
        if (value.folds.length === 0) {
          addIssue(
            issues,
            `${path}.folds`,
            "EMPTY_FOLDS",
            `${path}.folds must contain at least one fold.`,
          );
        }

        const foldIds = new Set<string>();
        const sequences = new Set<number>();

        value.folds.forEach((fold, index) => {
          const foldPath = `${path}.folds[${index}]`;
          if (!requireRecord(fold, foldPath, issues)) {
            return;
          }

          if (
            requireString(
              fold.foldId,
              `${foldPath}.foldId`,
              issues,
              this.options.maximumStringLength,
            )
          ) {
            if (foldIds.has(fold.foldId)) {
              addIssue(
                issues,
                `${foldPath}.foldId`,
                "DUPLICATE_FOLD",
                `${foldPath}.foldId duplicates an earlier fold.`,
              );
            }
            foldIds.add(fold.foldId);
          }

          if (requireInteger(fold.sequence, `${foldPath}.sequence`, issues, 0)) {
            if (sequences.has(fold.sequence)) {
              addIssue(
                issues,
                `${foldPath}.sequence`,
                "DUPLICATE_SEQUENCE",
                `${foldPath}.sequence duplicates an earlier fold sequence.`,
              );
            }
            sequences.add(fold.sequence);
          }

          validateValidationWindow(
            fold.trainingWindow,
            `${foldPath}.trainingWindow`,
            issues,
            this.options,
          );
          validateValidationWindow(
            fold.validationWindow,
            `${foldPath}.validationWindow`,
            issues,
            this.options,
          );
          validateValidationWindow(
            fold.testWindow,
            `${foldPath}.testWindow`,
            issues,
            this.options,
          );
          validateMetadata(fold.metadata, `${foldPath}.metadata`, issues, this.options);

          if (
            isRecord(fold.trainingWindow) &&
            isRecord(fold.validationWindow) &&
            isRecord(fold.testWindow) &&
            isFiniteNumber(fold.trainingWindow.endTime) &&
            isFiniteNumber(fold.validationWindow.startTime) &&
            isFiniteNumber(fold.validationWindow.endTime) &&
            isFiniteNumber(fold.testWindow.startTime)
          ) {
            if (fold.trainingWindow.endTime > fold.validationWindow.startTime) {
              addIssue(
                issues,
                foldPath,
                "OVERLAPPING_TRAINING_VALIDATION",
                "Training and validation windows cannot overlap.",
              );
            }

            if (fold.validationWindow.endTime > fold.testWindow.startTime) {
              addIssue(
                issues,
                foldPath,
                "OVERLAPPING_VALIDATION_TEST",
                "Validation and test windows cannot overlap.",
              );
            }
          }
        });
      }

      requireEnum(value.objective, OPTIMIZATION_OBJECTIVES, `${path}.objective`, issues);
      requireFiniteNumber(
        value.minimumAcceptanceScore,
        `${path}.minimumAcceptanceScore`,
        issues,
      );
      optionalString(value.deterministicSeed, `${path}.deterministicSeed`, issues, this.options.maximumStringLength);
      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public validateCalibrationProfile(
    value: unknown,
  ): AiContractValidationResult {
    const issues: IssueCollector = [];
    const path = "calibrationProfile";

    if (requireRecord(value, path, issues)) {
      requireString(value.profileId, `${path}.profileId`, issues, this.options.maximumStringLength);
      optionalString(value.strategyId, `${path}.strategyId`, issues, this.options.maximumStringLength);

      if (requireRecord(value.model, `${path}.model`, issues)) {
        requireString(value.model.providerId, `${path}.model.providerId`, issues, this.options.maximumStringLength);
        requireString(value.model.modelId, `${path}.model.modelId`, issues, this.options.maximumStringLength);
        requireString(value.model.modelVersion, `${path}.model.modelVersion`, issues, this.options.maximumStringLength);
      }

      requireEnum(value.method, CALIBRATION_METHODS, `${path}.method`, issues);
      requireTimestamp(value.trainedAt, `${path}.trainedAt`, issues);
      requireTimestamp(value.validFrom, `${path}.validFrom`, issues);
      if (value.validUntil !== undefined) {
        requireTimestamp(value.validUntil, `${path}.validUntil`, issues);
      }

      if (
        isFiniteNumber(value.validUntil) &&
        isFiniteNumber(value.validFrom) &&
        value.validUntil < value.validFrom
      ) {
        addIssue(
          issues,
          `${path}.validUntil`,
          "INVALID_VALIDITY_RANGE",
          `${path}.validUntil cannot precede ${path}.validFrom.`,
        );
      }

      requireInteger(value.sampleCount, `${path}.sampleCount`, issues, 0);
      if (value.expectedCalibrationError !== undefined) {
        requireRange(
          value.expectedCalibrationError,
          `${path}.expectedCalibrationError`,
          issues,
          0,
          1,
        );
      }

      if (requireRecord(value.parameters, `${path}.parameters`, issues)) {
        for (const [key, parameter] of Object.entries(value.parameters)) {
          requireFiniteNumber(parameter, `${path}.parameters.${key}`, issues);
        }
      }

      validateMetadata(value.metadata, `${path}.metadata`, issues, this.options);
    }

    return finish(issues);
  }

  public assertValid(
    result: AiContractValidationResult,
    message = "AI strategy contract validation failed.",
  ): void {
    if (!result.valid) {
      throw new AiStrategyValidationError(message, result.issues);
    }
  }

  public assertInferenceRequest(
    value: unknown,
  ): asserts value is AiInferenceRequest {
    this.assertValid(
      this.validateInferenceRequest(value),
      "AI inference request validation failed.",
    );
  }

  public assertFeatureVector(value: unknown): asserts value is AiFeatureVector {
    this.assertValid(
      this.validateFeatureVector(value),
      "AI feature vector validation failed.",
    );
  }

  public assertGeneratedSignal(
    value: unknown,
  ): asserts value is AiGeneratedSignal {
    this.assertValid(
      this.validateGeneratedSignal(value),
      "AI-generated signal validation failed.",
    );
  }

  public assertEnsembleConfiguration(
    value: unknown,
  ): asserts value is AiEnsembleConfiguration {
    this.assertValid(
      this.validateEnsembleConfiguration(value),
      "AI ensemble configuration validation failed.",
    );
  }

  public assertOptimizationRequest(
    value: unknown,
  ): asserts value is AdaptiveOptimizationRequest {
    this.assertValid(
      this.validateOptimizationRequest(value),
      "Adaptive optimization request validation failed.",
    );
  }

  public assertWalkForwardRequest(
    value: unknown,
  ): asserts value is WalkForwardValidationRequest {
    this.assertValid(
      this.validateWalkForwardRequest(value),
      "Walk-forward validation request validation failed.",
    );
  }
}

export function createAiStrategyContractValidator(
  options: AiStrategyValidatorOptions = {},
): AiStrategyContractValidator {
  return new AiStrategyContractValidator(options);
}

export function toFeatureValidationIssues(
  result: AiContractValidationResult,
): readonly AiFeatureValidationIssue[] {
  return Object.freeze(
    result.issues.map((issue) =>
      Object.freeze({
        code: issue.code,
        message: `${issue.path}: ${issue.message}`,
        severity: issue.severity,
        metadata: Object.freeze({}),
      }),
    ),
  );
}