/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-validator.ts
 *
 * Purpose:
 * Provides deterministic validation for strategy manifests, configurations,
 * evaluation contexts, signals, order intents, and state updates.
 */

import {
  EMPTY_STRATEGY_METADATA,
  STRATEGY_CONFIDENCE_MAXIMUM,
  STRATEGY_CONFIDENCE_MINIMUM,
  STRATEGY_SCORE_MAXIMUM,
  STRATEGY_SCORE_MINIMUM,
  StrategyConfiguration,
  StrategyContractValidator,
  StrategyEvaluationContext,
  StrategyInstrument,
  StrategyManifest,
  StrategyMetadata,
  StrategyOrderIntent,
  StrategyParameterDescriptor,
  StrategySerializableValue,
  StrategySignal,
  StrategyStateSnapshot,
  StrategyStateUpdate,
  StrategyValidationIssue,
  StrategyValidationReport,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

export interface StrategyValidatorOptions {
  readonly rejectUnknownConfigurationParameters: boolean;
  readonly requireSeedForSeededStrategies: boolean;
  readonly maximumClockSkewMilliseconds: number;
  readonly maximumSignalLifetimeMilliseconds: number;
  readonly maximumOrderIntentLifetimeMilliseconds: number;
  readonly maximumStateMutationCount: number;
  readonly maximumStringLength: number;
  readonly maximumMetadataDepth: number;
}

export const DEFAULT_STRATEGY_VALIDATOR_OPTIONS: StrategyValidatorOptions =
  Object.freeze({
    rejectUnknownConfigurationParameters: true,
    requireSeedForSeededStrategies: true,
    maximumClockSkewMilliseconds: 60_000,
    maximumSignalLifetimeMilliseconds: 86_400_000,
    maximumOrderIntentLifetimeMilliseconds: 86_400_000,
    maximumStateMutationCount: 1_000,
    maximumStringLength: 16_384,
    maximumMetadataDepth: 16,
  });

class ValidationCollector {
  private readonly values: StrategyValidationIssue[] = [];

  public error(field: string, code: string, message: string): void {
    this.values.push(
      Object.freeze({
        severity: "ERROR",
        field,
        code,
        message,
        metadata: EMPTY_STRATEGY_METADATA,
      }),
    );
  }

  public warning(field: string, code: string, message: string): void {
    this.values.push(
      Object.freeze({
        severity: "WARNING",
        field,
        code,
        message,
        metadata: EMPTY_STRATEGY_METADATA,
      }),
    );
  }

  public report(validatedAt: UnixTimestampMilliseconds): StrategyValidationReport {
    const issues = Object.freeze([...this.values]);

    return Object.freeze({
      valid: !issues.some((issue) => issue.severity === "ERROR"),
      issues,
      validatedAt,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }
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

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRequiredString(
  value: unknown,
  field: string,
  collector: ValidationCollector,
  maximumLength: number,
): void {
  if (!isNonEmptyString(value)) {
    collector.error(field, "REQUIRED_STRING", `${field} must be a non-empty string.`);
    return;
  }

  if (value !== value.trim()) {
    collector.error(
      field,
      "STRING_WHITESPACE",
      `${field} cannot contain leading or trailing whitespace.`,
    );
  }

  if (value.length > maximumLength) {
    collector.error(
      field,
      "STRING_TOO_LONG",
      `${field} cannot exceed ${maximumLength} characters.`,
    );
  }
}

function validateOptionalString(
  value: unknown,
  field: string,
  collector: ValidationCollector,
  maximumLength: number,
): void {
  if (value !== undefined) {
    validateRequiredString(value, field, collector, maximumLength);
  }
}

function validateTimestamp(
  value: unknown,
  field: string,
  collector: ValidationCollector,
): void {
  if (!isNonNegativeInteger(value)) {
    collector.error(
      field,
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
  }
}

function validatePositiveOptionalNumber(
  value: unknown,
  field: string,
  collector: ValidationCollector,
): void {
  if (value !== undefined && !isPositiveNumber(value)) {
    collector.error(field, "INVALID_POSITIVE_NUMBER", `${field} must be greater than zero.`);
  }
}

function validateNonNegativeOptionalNumber(
  value: unknown,
  field: string,
  collector: ValidationCollector,
): void {
  if (value !== undefined && !isNonNegativeNumber(value)) {
    collector.error(
      field,
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be greater than or equal to zero.`,
    );
  }
}

function validateUniqueStrings(
  values: readonly string[],
  field: string,
  collector: ValidationCollector,
  allowEmpty: boolean,
): void {
  if (!allowEmpty && values.length === 0) {
    collector.error(field, "EMPTY_COLLECTION", `${field} cannot be empty.`);
  }

  const seen = new Set<string>();

  values.forEach((value, index) => {
    validateRequiredString(value, `${field}[${index}]`, collector, 512);

    if (seen.has(value)) {
      collector.error(field, "DUPLICATE_VALUE", `${field} cannot contain duplicate values.`);
    }

    seen.add(value);
  });
}

function validateSerializableValue(
  value: unknown,
  field: string,
  collector: ValidationCollector,
  maximumDepth: number,
  depth = 0,
  visited: Set<object> = new Set<object>(),
): void {
  if (depth > maximumDepth) {
    collector.error(field, "MAXIMUM_DEPTH_EXCEEDED", `${field} exceeds the maximum depth.`);
    return;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return;
  }

  if (typeof value === "number") {
    collector.error(field, "NON_FINITE_NUMBER", `${field} cannot contain NaN or Infinity.`);
    return;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      collector.error(field, "CYCLIC_VALUE", `${field} cannot contain cyclic references.`);
      return;
    }

    visited.add(value);
    value.forEach((item, index) =>
      validateSerializableValue(
        item,
        `${field}[${index}]`,
        collector,
        maximumDepth,
        depth + 1,
        visited,
      ),
    );
    visited.delete(value);
    return;
  }

  if (typeof value === "object" && value !== null) {
    if (visited.has(value)) {
      collector.error(field, "CYCLIC_VALUE", `${field} cannot contain cyclic references.`);
      return;
    }

    visited.add(value);
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((key) =>
        validateSerializableValue(
          (value as Record<string, unknown>)[key],
          `${field}.${key}`,
          collector,
          maximumDepth,
          depth + 1,
          visited,
        ),
      );
    visited.delete(value);
    return;
  }

  collector.error(field, "UNSUPPORTED_VALUE", `${field} contains a non-serializable value.`);
}

function validateMetadata(
  metadata: StrategyMetadata,
  field: string,
  collector: ValidationCollector,
  options: StrategyValidatorOptions,
): void {
  Object.keys(metadata)
    .sort()
    .forEach((key) =>
      validateSerializableValue(
        metadata[key],
        `${field}.${key}`,
        collector,
        options.maximumMetadataDepth,
      ),
    );
}

function validateInstrument(
  instrument: StrategyInstrument,
  field: string,
  collector: ValidationCollector,
  options: StrategyValidatorOptions,
): void {
  validateRequiredString(instrument.exchangeId, `${field}.exchangeId`, collector, 256);
  validateRequiredString(instrument.symbol, `${field}.symbol`, collector, 256);
  validateRequiredString(
    instrument.normalizedSymbol,
    `${field}.normalizedSymbol`,
    collector,
    256,
  );
  validateRequiredString(instrument.baseAsset, `${field}.baseAsset`, collector, 128);
  validateRequiredString(instrument.quoteAsset, `${field}.quoteAsset`, collector, 128);
  validateOptionalString(
    instrument.settlementAsset,
    `${field}.settlementAsset`,
    collector,
    128,
  );

  validatePositiveOptionalNumber(instrument.contractSize, `${field}.contractSize`, collector);
  validateNonNegativeOptionalNumber(
    instrument.pricePrecision,
    `${field}.pricePrecision`,
    collector,
  );
  validateNonNegativeOptionalNumber(
    instrument.quantityPrecision,
    `${field}.quantityPrecision`,
    collector,
  );
  validatePositiveOptionalNumber(
    instrument.minimumQuantity,
    `${field}.minimumQuantity`,
    collector,
  );
  validatePositiveOptionalNumber(
    instrument.maximumQuantity,
    `${field}.maximumQuantity`,
    collector,
  );
  validatePositiveOptionalNumber(
    instrument.minimumNotional,
    `${field}.minimumNotional`,
    collector,
  );
  validatePositiveOptionalNumber(instrument.tickSize, `${field}.tickSize`, collector);
  validatePositiveOptionalNumber(instrument.stepSize, `${field}.stepSize`, collector);

  if (
    instrument.minimumQuantity !== undefined &&
    instrument.maximumQuantity !== undefined &&
    instrument.minimumQuantity > instrument.maximumQuantity
  ) {
    collector.error(
      `${field}.minimumQuantity`,
      "INVALID_QUANTITY_RANGE",
      "minimumQuantity cannot exceed maximumQuantity.",
    );
  }

  validateMetadata(instrument.metadata, `${field}.metadata`, collector, options);
}

function validateParameterValue(
  value: unknown,
  descriptor: StrategyParameterDescriptor,
  field: string,
  collector: ValidationCollector,
): void {
  let typeIsValid = true;

  switch (descriptor.type) {
    case "STRING":
      typeIsValid = typeof value === "string";
      break;
    case "NUMBER":
      typeIsValid = isFiniteNumber(value);
      break;
    case "INTEGER":
      typeIsValid = typeof value === "number" && Number.isInteger(value);
      break;
    case "BOOLEAN":
      typeIsValid = typeof value === "boolean";
      break;
    case "ENUM":
      typeIsValid =
        descriptor.allowedValues !== undefined &&
        descriptor.allowedValues.some((candidate: unknown) => Object.is(candidate, value));
      break;
    case "STRING_ARRAY":
      typeIsValid = Array.isArray(value) && value.every((item) => typeof item === "string");
      break;
    case "NUMBER_ARRAY":
      typeIsValid = Array.isArray(value) && value.every((item) => isFiniteNumber(item));
      break;
    case "OBJECT":
      typeIsValid = typeof value === "object" && value !== null && !Array.isArray(value);
      break;
  }

  if (!typeIsValid) {
    collector.error(field, "INVALID_PARAMETER_TYPE", `${field} does not match ${descriptor.type}.`);
    return;
  }

  if (isFiniteNumber(value)) {
    if (descriptor.minimum !== undefined && value < descriptor.minimum) {
      collector.error(field, "PARAMETER_BELOW_MINIMUM", `${field} is below its minimum.`);
    }

    if (descriptor.maximum !== undefined && value > descriptor.maximum) {
      collector.error(field, "PARAMETER_ABOVE_MAXIMUM", `${field} exceeds its maximum.`);
    }
  }

  if (
    descriptor.allowedValues !== undefined &&
    descriptor.type !== "ENUM" &&
    !descriptor.allowedValues.some((candidate: unknown) => Object.is(candidate, value))
  ) {
    collector.error(field, "PARAMETER_NOT_ALLOWED", `${field} is not an allowed value.`);
  }
}

export class DefaultStrategyContractValidator implements StrategyContractValidator {
  public readonly options: StrategyValidatorOptions;

  public constructor(options: Partial<StrategyValidatorOptions> = {}) {
    const resolved = Object.freeze({
      ...DEFAULT_STRATEGY_VALIDATOR_OPTIONS,
      ...options,
    });

    this.validateOptions(resolved);
    this.options = resolved;
  }

  public validateManifest(
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(timestamp, collector);

    validateRequiredString(manifest.strategyId, "manifest.strategyId", collector, 256);
    validateRequiredString(manifest.name, "manifest.name", collector, 512);
    validateRequiredString(manifest.description, "manifest.description", collector, this.options.maximumStringLength);
    validateRequiredString(manifest.version, "manifest.version", collector, 128);
    validateRequiredString(manifest.author.name, "manifest.author.name", collector, 512);
    validateOptionalString(manifest.author.organization, "manifest.author.organization", collector, 512);
    validateOptionalString(manifest.author.email, "manifest.author.email", collector, 512);

    validateUniqueStrings(manifest.capabilities, "manifest.capabilities", collector, false);
    validateUniqueStrings(
      manifest.supportedMarketTypes,
      "manifest.supportedMarketTypes",
      collector,
      false,
    );
    validateUniqueStrings(
      manifest.supportedTradingModes,
      "manifest.supportedTradingModes",
      collector,
      false,
    );
    validateUniqueStrings(
      manifest.supportedEnvironments,
      "manifest.supportedEnvironments",
      collector,
      false,
    );

    const parameterKeys = new Set<string>();
    manifest.parameterSchema.forEach((descriptor, index) => {
      const field = `manifest.parameterSchema[${index}]`;
      validateRequiredString(descriptor.key, `${field}.key`, collector, 256);
      validateRequiredString(descriptor.displayName, `${field}.displayName`, collector, 512);
      validateRequiredString(descriptor.description, `${field}.description`, collector, this.options.maximumStringLength);

      if (parameterKeys.has(descriptor.key)) {
        collector.error(field, "DUPLICATE_PARAMETER_KEY", "Parameter keys must be unique.");
      }
      parameterKeys.add(descriptor.key);

      if (
        descriptor.minimum !== undefined &&
        descriptor.maximum !== undefined &&
        descriptor.minimum > descriptor.maximum
      ) {
        collector.error(`${field}.minimum`, "INVALID_PARAMETER_RANGE", "minimum cannot exceed maximum.");
      }

      if (descriptor.defaultValue !== undefined) {
        validateParameterValue(descriptor.defaultValue, descriptor, `${field}.defaultValue`, collector);
      }

      validateMetadata(descriptor.metadata, `${field}.metadata`, collector, this.options);
    });

    if (
      manifest.minimumEvaluationIntervalMilliseconds !== undefined &&
      !isNonNegativeInteger(manifest.minimumEvaluationIntervalMilliseconds)
    ) {
      collector.error(
        "manifest.minimumEvaluationIntervalMilliseconds",
        "INVALID_INTERVAL",
        "minimumEvaluationIntervalMilliseconds must be a non-negative integer.",
      );
    }

    if (
      manifest.maximumEvaluationDurationMilliseconds !== undefined &&
      !isPositiveInteger(manifest.maximumEvaluationDurationMilliseconds)
    ) {
      collector.error(
        "manifest.maximumEvaluationDurationMilliseconds",
        "INVALID_DURATION",
        "maximumEvaluationDurationMilliseconds must be a positive integer.",
      );
    }

    validateTimestamp(manifest.createdAt, "manifest.createdAt", collector);
    if (manifest.createdAt > validatedAt + this.options.maximumClockSkewMilliseconds) {
      collector.error(
        "manifest.createdAt",
        "CREATED_AT_IN_FUTURE",
        "manifest.createdAt is later than the permitted clock skew.",
      );
    }

    validateMetadata(manifest.author.metadata, "manifest.author.metadata", collector, this.options);
    validateMetadata(manifest.metadata, "manifest.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateConfiguration(
    configuration: StrategyConfiguration,
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(timestamp, collector);

    validateRequiredString(
      configuration.strategyInstanceId,
      "configuration.strategyInstanceId",
      collector,
      256,
    );
    validateRequiredString(configuration.strategyId, "configuration.strategyId", collector, 256);
    validateRequiredString(
      configuration.strategyVersion,
      "configuration.strategyVersion",
      collector,
      128,
    );

    if (configuration.strategyId !== manifest.strategyId) {
      collector.error(
        "configuration.strategyId",
        "STRATEGY_ID_MISMATCH",
        "configuration.strategyId must match manifest.strategyId.",
      );
    }

    if (configuration.strategyVersion !== manifest.version) {
      collector.error(
        "configuration.strategyVersion",
        "STRATEGY_VERSION_MISMATCH",
        "configuration.strategyVersion must match manifest.version.",
      );
    }

    if (!manifest.supportedEnvironments.includes(configuration.environment)) {
      collector.error(
        "configuration.environment",
        "UNSUPPORTED_ENVIRONMENT",
        "The selected environment is not supported by this strategy.",
      );
    }

    if (!manifest.supportedTradingModes.includes(configuration.tradingMode)) {
      collector.error(
        "configuration.tradingMode",
        "UNSUPPORTED_TRADING_MODE",
        "The selected trading mode is not supported by this strategy.",
      );
    }

    validateUniqueStrings(
      configuration.universe.exchanges,
      "configuration.universe.exchanges",
      collector,
      false,
    );

    const instrumentKeys = new Set<string>();
    configuration.universe.instruments.forEach((instrument, index) => {
      const field = `configuration.universe.instruments[${index}]`;
      validateInstrument(instrument, field, collector, this.options);

      if (!configuration.universe.exchanges.includes(instrument.exchangeId)) {
        collector.error(
          `${field}.exchangeId`,
          "UNDECLARED_EXCHANGE",
          "Instrument exchange must be declared in universe.exchanges.",
        );
      }

      if (!manifest.supportedMarketTypes.includes(instrument.marketType)) {
        collector.error(
          `${field}.marketType`,
          "UNSUPPORTED_MARKET_TYPE",
          "Instrument market type is not supported by this strategy.",
        );
      }

      const key = `${instrument.exchangeId}:${instrument.normalizedSymbol}:${instrument.marketType}`;
      if (instrumentKeys.has(key)) {
        collector.error(field, "DUPLICATE_INSTRUMENT", "Universe instruments must be unique.");
      }
      instrumentKeys.add(key);
    });

    configuration.universe.subscriptions.forEach((subscription, index) => {
      const field = `configuration.universe.subscriptions[${index}]`;
      validateInstrument(subscription.instrument, `${field}.instrument`, collector, this.options);
      validateUniqueStrings(subscription.timeframes, `${field}.timeframes`, collector, true);
      validateUniqueStrings(subscription.indicatorIds, `${field}.indicatorIds`, collector, true);

      if (!isNonNegativeInteger(subscription.minimumCandleHistory)) {
        collector.error(
          `${field}.minimumCandleHistory`,
          "INVALID_CANDLE_HISTORY",
          "minimumCandleHistory must be a non-negative integer.",
        );
      }
    });

    const descriptorMap = new Map<string, StrategyParameterDescriptor>();
    manifest.parameterSchema.forEach((descriptor) => descriptorMap.set(descriptor.key, descriptor));

    manifest.parameterSchema.forEach((descriptor) => {
      const supplied = configuration.parameters[descriptor.key];

      if (
        descriptor.required &&
        supplied === undefined &&
        descriptor.defaultValue === undefined
      ) {
        collector.error(
          `configuration.parameters.${descriptor.key}`,
          "MISSING_REQUIRED_PARAMETER",
          `Required parameter ${descriptor.key} is missing.`,
        );
      }

      if (supplied !== undefined) {
        validateParameterValue(
          supplied,
          descriptor,
          `configuration.parameters.${descriptor.key}`,
          collector,
        );
      }
    });

    if (this.options.rejectUnknownConfigurationParameters) {
      Object.keys(configuration.parameters)
        .sort()
        .forEach((key) => {
          if (!descriptorMap.has(key)) {
            collector.error(
              `configuration.parameters.${key}`,
              "UNKNOWN_PARAMETER",
              `Unknown configuration parameter: ${key}.`,
            );
          }
        });
    }

    if (
      manifest.determinismMode === "SEEDED" &&
      this.options.requireSeedForSeededStrategies &&
      !isNonEmptyString(configuration.deterministicSeed)
    ) {
      collector.error(
        "configuration.deterministicSeed",
        "MISSING_DETERMINISTIC_SEED",
        "SEEDED strategies require a deterministicSeed.",
      );
    }

    validateOptionalString(
      configuration.deterministicSeed,
      "configuration.deterministicSeed",
      collector,
      512,
    );
    validateUniqueStrings(configuration.tags, "configuration.tags", collector, true);
    validateMetadata(configuration.universe.metadata, "configuration.universe.metadata", collector, this.options);
    validateMetadata(configuration.executionPreferences.metadata, "configuration.executionPreferences.metadata", collector, this.options);
    validateMetadata(configuration.metadata, "configuration.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateEvaluationContext(
    context: StrategyEvaluationContext,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(context.evaluationTime, collector);

    validateRequiredString(context.evaluationId, "context.evaluationId", collector, 256);
    validateRequiredString(context.correlationId, "context.correlationId", collector, 256);
    validateRequiredString(context.strategyId, "context.strategyId", collector, 256);
    validateRequiredString(
      context.strategyInstanceId,
      "context.strategyInstanceId",
      collector,
      256,
    );
    validateRequiredString(context.strategyVersion, "context.strategyVersion", collector, 128);
    validateTimestamp(context.trigger.timestamp, "context.trigger.timestamp", collector);
    validateInstrument(context.market.instrument, "context.market.instrument", collector, this.options);
    validateTimestamp(context.market.timestamp, "context.market.timestamp", collector);

    if (context.market.timestamp > context.evaluationTime + this.options.maximumClockSkewMilliseconds) {
      collector.error(
        "context.market.timestamp",
        "MARKET_DATA_IN_FUTURE",
        "Market data cannot be materially later than evaluationTime.",
      );
    }

    if (context.state.strategyInstanceId !== context.strategyInstanceId) {
      collector.error(
        "context.state.strategyInstanceId",
        "STATE_INSTANCE_MISMATCH",
        "State instance must match the evaluation strategy instance.",
      );
    }

    if (!isNonNegativeInteger(context.state.version)) {
      collector.error(
        "context.state.version",
        "INVALID_STATE_VERSION",
        "State version must be a non-negative integer.",
      );
    }

    if (!isNonNegativeNumber(context.portfolio.totalEquity)) {
      collector.error(
        "context.portfolio.totalEquity",
        "INVALID_TOTAL_EQUITY",
        "Portfolio totalEquity must be non-negative.",
      );
    }

    if (!isNonNegativeNumber(context.portfolio.availableEquity)) {
      collector.error(
        "context.portfolio.availableEquity",
        "INVALID_AVAILABLE_EQUITY",
        "Portfolio availableEquity must be non-negative.",
      );
    }

    if (context.position !== undefined) {
      validateInstrument(context.position.instrument, "context.position.instrument", collector, this.options);
      if (!isNonNegativeNumber(context.position.quantity)) {
        collector.error(
          "context.position.quantity",
          "INVALID_POSITION_QUANTITY",
          "Position quantity must be non-negative.",
        );
      }
      if (!isPositiveNumber(context.position.entryPrice)) {
        collector.error(
          "context.position.entryPrice",
          "INVALID_ENTRY_PRICE",
          "Position entryPrice must be greater than zero.",
        );
      }
    }

    Object.keys(context.state.values)
      .sort()
      .forEach((key) =>
        validateSerializableValue(
          context.state.values[key],
          `context.state.values.${key}`,
          collector,
          this.options.maximumMetadataDepth,
        ),
      );

    validateMetadata(context.market.metadata, "context.market.metadata", collector, this.options);
    validateMetadata(context.portfolio.metadata, "context.portfolio.metadata", collector, this.options);
    validateMetadata(context.risk.metadata, "context.risk.metadata", collector, this.options);
    validateMetadata(context.state.metadata, "context.state.metadata", collector, this.options);
    validateMetadata(context.metadata, "context.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateSignal(
    signal: StrategySignal,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(timestamp, collector);

    validateRequiredString(signal.signalId, "signal.signalId", collector, 256);
    validateRequiredString(signal.evaluationId, "signal.evaluationId", collector, 256);
    validateRequiredString(signal.strategyId, "signal.strategyId", collector, 256);
    validateRequiredString(
      signal.strategyInstanceId,
      "signal.strategyInstanceId",
      collector,
      256,
    );
    validateRequiredString(signal.correlationId, "signal.correlationId", collector, 256);
    validateInstrument(signal.instrument, "signal.instrument", collector, this.options);

    if (
      !isFiniteNumber(signal.confidence) ||
      signal.confidence < STRATEGY_CONFIDENCE_MINIMUM ||
      signal.confidence > STRATEGY_CONFIDENCE_MAXIMUM
    ) {
      collector.error(
        "signal.confidence",
        "INVALID_CONFIDENCE",
        `confidence must be between ${STRATEGY_CONFIDENCE_MINIMUM} and ${STRATEGY_CONFIDENCE_MAXIMUM}.`,
      );
    }

    if (
      signal.score !== undefined &&
      (!isFiniteNumber(signal.score) ||
        signal.score < STRATEGY_SCORE_MINIMUM ||
        signal.score > STRATEGY_SCORE_MAXIMUM)
    ) {
      collector.error(
        "signal.score",
        "INVALID_SCORE",
        `score must be between ${STRATEGY_SCORE_MINIMUM} and ${STRATEGY_SCORE_MAXIMUM}.`,
      );
    }

    if (!isPositiveNumber(signal.referencePrice)) {
      collector.error(
        "signal.referencePrice",
        "INVALID_REFERENCE_PRICE",
        "referencePrice must be greater than zero.",
      );
    }

    validatePositiveOptionalNumber(signal.targetPrice, "signal.targetPrice", collector);
    validatePositiveOptionalNumber(signal.stopLossPrice, "signal.stopLossPrice", collector);
    validatePositiveOptionalNumber(signal.takeProfitPrice, "signal.takeProfitPrice", collector);
    validatePositiveOptionalNumber(signal.suggestedQuantity, "signal.suggestedQuantity", collector);
    validatePositiveOptionalNumber(signal.suggestedNotional, "signal.suggestedNotional", collector);
    validatePositiveOptionalNumber(signal.suggestedRiskAmount, "signal.suggestedRiskAmount", collector);
    validatePositiveOptionalNumber(signal.suggestedLeverage, "signal.suggestedLeverage", collector);
    validateRequiredString(signal.reason, "signal.reason", collector, this.options.maximumStringLength);

    validateTimestamp(signal.validity.generatedAt, "signal.validity.generatedAt", collector);
    validateTimestamp(signal.validity.validFrom, "signal.validity.validFrom", collector);

    if (signal.validity.validFrom < signal.validity.generatedAt) {
      collector.error(
        "signal.validity.validFrom",
        "INVALID_VALID_FROM",
        "validFrom cannot precede generatedAt.",
      );
    }

    if (signal.validity.validUntil !== undefined) {
      validateTimestamp(signal.validity.validUntil, "signal.validity.validUntil", collector);

      if (signal.validity.validUntil < signal.validity.validFrom) {
        collector.error(
          "signal.validity.validUntil",
          "INVALID_VALID_UNTIL",
          "validUntil cannot precede validFrom.",
        );
      }

      if (
        signal.validity.validUntil - signal.validity.generatedAt >
        this.options.maximumSignalLifetimeMilliseconds
      ) {
        collector.error(
          "signal.validity.validUntil",
          "SIGNAL_LIFETIME_EXCEEDED",
          "Signal lifetime exceeds the configured maximum.",
        );
      }
    }

    if (
      signal.validity.maximumExecutionDelayMilliseconds !== undefined &&
      !isPositiveInteger(signal.validity.maximumExecutionDelayMilliseconds)
    ) {
      collector.error(
        "signal.validity.maximumExecutionDelayMilliseconds",
        "INVALID_EXECUTION_DELAY",
        "maximumExecutionDelayMilliseconds must be a positive integer.",
      );
    }

    validateUniqueStrings(signal.tags, "signal.tags", collector, true);
    validateMetadata(signal.metadata, "signal.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateOrderIntent(
    orderIntent: StrategyOrderIntent,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(timestamp, collector);

    validateRequiredString(orderIntent.orderIntentId, "orderIntent.orderIntentId", collector, 256);
    validateOptionalString(orderIntent.signalId, "orderIntent.signalId", collector, 256);
    validateRequiredString(orderIntent.evaluationId, "orderIntent.evaluationId", collector, 256);
    validateRequiredString(orderIntent.strategyId, "orderIntent.strategyId", collector, 256);
    validateRequiredString(
      orderIntent.strategyInstanceId,
      "orderIntent.strategyInstanceId",
      collector,
      256,
    );
    validateRequiredString(orderIntent.correlationId, "orderIntent.correlationId", collector, 256);
    validateInstrument(orderIntent.instrument, "orderIntent.instrument", collector, this.options);

    if (!isPositiveNumber(orderIntent.quantity)) {
      collector.error(
        "orderIntent.quantity",
        "INVALID_QUANTITY",
        "Order intent quantity must be greater than zero.",
      );
    }

    validatePositiveOptionalNumber(orderIntent.limitPrice, "orderIntent.limitPrice", collector);
    validatePositiveOptionalNumber(orderIntent.stopPrice, "orderIntent.stopPrice", collector);
    validatePositiveOptionalNumber(orderIntent.leverage, "orderIntent.leverage", collector);
    validateOptionalString(orderIntent.clientOrderId, "orderIntent.clientOrderId", collector, 256);

    if (
      ["LIMIT", "STOP_LIMIT", "TAKE_PROFIT_LIMIT"].includes(orderIntent.orderType) &&
      !isPositiveNumber(orderIntent.limitPrice)
    ) {
      collector.error(
        "orderIntent.limitPrice",
        "MISSING_LIMIT_PRICE",
        `${orderIntent.orderType} requires a positive limitPrice.`,
      );
    }

    if (
      ["STOP_MARKET", "STOP_LIMIT", "TAKE_PROFIT_MARKET", "TAKE_PROFIT_LIMIT"].includes(
        orderIntent.orderType,
      ) &&
      !isPositiveNumber(orderIntent.stopPrice)
    ) {
      collector.error(
        "orderIntent.stopPrice",
        "MISSING_STOP_PRICE",
        `${orderIntent.orderType} requires a positive stopPrice.`,
      );
    }

    if (orderIntent.orderType === "MARKET" && orderIntent.postOnly) {
      collector.error(
        "orderIntent.postOnly",
        "MARKET_ORDER_POST_ONLY",
        "Market orders cannot be post-only.",
      );
    }

    if (orderIntent.postOnly && ["IOC", "FOK"].includes(orderIntent.timeInForce)) {
      collector.error(
        "orderIntent.timeInForce",
        "POST_ONLY_TIME_IN_FORCE_CONFLICT",
        "Post-only orders cannot use IOC or FOK.",
      );
    }

    if (orderIntent.closePosition && !orderIntent.reduceOnly) {
      collector.error(
        "orderIntent.reduceOnly",
        "CLOSE_POSITION_NOT_REDUCE_ONLY",
        "closePosition intents must also be reduceOnly.",
      );
    }

    if (orderIntent.protection !== undefined) {
      validatePositiveOptionalNumber(
        orderIntent.protection.stopLossPrice,
        "orderIntent.protection.stopLossPrice",
        collector,
      );
      validatePositiveOptionalNumber(
        orderIntent.protection.takeProfitPrice,
        "orderIntent.protection.takeProfitPrice",
        collector,
      );
      validatePositiveOptionalNumber(
        orderIntent.protection.trailingStopDistance,
        "orderIntent.protection.trailingStopDistance",
        collector,
      );
      validatePositiveOptionalNumber(
        orderIntent.protection.trailingStopActivationPrice,
        "orderIntent.protection.trailingStopActivationPrice",
        collector,
      );
      validatePositiveOptionalNumber(
        orderIntent.protection.breakEvenTriggerPrice,
        "orderIntent.protection.breakEvenTriggerPrice",
        collector,
      );
      validateMetadata(
        orderIntent.protection.metadata,
        "orderIntent.protection.metadata",
        collector,
        this.options,
      );
    }

    if (orderIntent.expiresAt !== undefined) {
      validateTimestamp(orderIntent.expiresAt, "orderIntent.expiresAt", collector);

      if (orderIntent.expiresAt <= validatedAt) {
        collector.error(
          "orderIntent.expiresAt",
          "ORDER_INTENT_EXPIRED",
          "expiresAt must be later than the validation timestamp.",
        );
      }

      if (
        orderIntent.expiresAt - validatedAt >
        this.options.maximumOrderIntentLifetimeMilliseconds
      ) {
        collector.error(
          "orderIntent.expiresAt",
          "ORDER_INTENT_LIFETIME_EXCEEDED",
          "Order intent lifetime exceeds the configured maximum.",
        );
      }
    }

    validateRequiredString(orderIntent.reason, "orderIntent.reason", collector, this.options.maximumStringLength);
    validateUniqueStrings(orderIntent.tags, "orderIntent.tags", collector, true);
    validateMetadata(orderIntent.metadata, "orderIntent.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  public validateStateUpdate(
    stateUpdate: StrategyStateUpdate,
    currentState: StrategyStateSnapshot,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.normalizeTimestamp(timestamp, collector);

    if (!isNonNegativeInteger(currentState.version)) {
      collector.error(
        "currentState.version",
        "INVALID_CURRENT_STATE_VERSION",
        "currentState.version must be a non-negative integer.",
      );
    }

    if (!isNonNegativeInteger(stateUpdate.expectedVersion)) {
      collector.error(
        "stateUpdate.expectedVersion",
        "INVALID_EXPECTED_VERSION",
        "expectedVersion must be a non-negative integer.",
      );
    } else if (stateUpdate.expectedVersion !== currentState.version) {
      collector.error(
        "stateUpdate.expectedVersion",
        "STATE_VERSION_CONFLICT",
        "expectedVersion must match currentState.version.",
      );
    }

    if (stateUpdate.mutations.length > this.options.maximumStateMutationCount) {
      collector.error(
        "stateUpdate.mutations",
        "MUTATION_LIMIT_EXCEEDED",
        `State updates cannot contain more than ${this.options.maximumStateMutationCount} mutations.`,
      );
    }

    stateUpdate.mutations.forEach((mutation, index) => {
      const field = `stateUpdate.mutations[${index}]`;
      validateRequiredString(mutation.path, `${field}.path`, collector, 1_024);

      if (
        mutation.path.startsWith(".") ||
        mutation.path.endsWith(".") ||
        mutation.path.includes("..")
      ) {
        collector.error(
          `${field}.path`,
          "INVALID_STATE_PATH",
          "State paths must be valid dot-delimited paths.",
        );
      }

      const requiresValue = !["DELETE", "CLEAR"].includes(mutation.operation);
      if (requiresValue && mutation.value === undefined) {
        collector.error(
          `${field}.value`,
          "MISSING_MUTATION_VALUE",
          `${mutation.operation} requires a value.`,
        );
      }

      if (!requiresValue && mutation.value !== undefined) {
        collector.warning(
          `${field}.value`,
          "IGNORED_MUTATION_VALUE",
          `${mutation.operation} should not include a value.`,
        );
      }

      if (mutation.operation === "INCREMENT" && !isFiniteNumber(mutation.value)) {
        collector.error(
          `${field}.value`,
          "INVALID_INCREMENT_VALUE",
          "INCREMENT requires a finite numeric value.",
        );
      }

      if (mutation.value !== undefined) {
        validateSerializableValue(
          mutation.value,
          `${field}.value`,
          collector,
          this.options.maximumMetadataDepth,
        );
      }

      if (mutation.expectedCurrentValue !== undefined) {
        validateSerializableValue(
          mutation.expectedCurrentValue,
          `${field}.expectedCurrentValue`,
          collector,
          this.options.maximumMetadataDepth,
        );
      }
    });

    if (stateUpdate.replaceState !== undefined) {
      Object.keys(stateUpdate.replaceState)
        .sort()
        .forEach((key) =>
          validateSerializableValue(
            stateUpdate.replaceState?.[key] as StrategySerializableValue,
            `stateUpdate.replaceState.${key}`,
            collector,
            this.options.maximumMetadataDepth,
          ),
        );

      if (stateUpdate.mutations.length > 0) {
        collector.error(
          "stateUpdate",
          "AMBIGUOUS_STATE_UPDATE",
          "replaceState and mutations cannot be used together.",
        );
      }
    }

    if (stateUpdate.replaceState === undefined && stateUpdate.mutations.length === 0) {
      collector.warning(
        "stateUpdate",
        "EMPTY_STATE_UPDATE",
        "The state update contains no changes.",
      );
    }

    validateMetadata(stateUpdate.metadata, "stateUpdate.metadata", collector, this.options);

    return collector.report(validatedAt);
  }

  private normalizeTimestamp(
    timestamp: UnixTimestampMilliseconds,
    collector: ValidationCollector,
  ): UnixTimestampMilliseconds {
    validateTimestamp(timestamp, "timestamp", collector);
    return isNonNegativeInteger(timestamp) ? timestamp : 0;
  }

  private validateOptions(options: StrategyValidatorOptions): void {
    if (!isNonNegativeInteger(options.maximumClockSkewMilliseconds)) {
      throw new Error("maximumClockSkewMilliseconds must be a non-negative integer.");
    }
    if (!isPositiveInteger(options.maximumSignalLifetimeMilliseconds)) {
      throw new Error("maximumSignalLifetimeMilliseconds must be a positive integer.");
    }
    if (!isPositiveInteger(options.maximumOrderIntentLifetimeMilliseconds)) {
      throw new Error("maximumOrderIntentLifetimeMilliseconds must be a positive integer.");
    }
    if (!isPositiveInteger(options.maximumStateMutationCount)) {
      throw new Error("maximumStateMutationCount must be a positive integer.");
    }
    if (!isPositiveInteger(options.maximumStringLength)) {
      throw new Error("maximumStringLength must be a positive integer.");
    }
    if (!isPositiveInteger(options.maximumMetadataDepth)) {
      throw new Error("maximumMetadataDepth must be a positive integer.");
    }
  }
}

export function createStrategyContractValidator(
  options: Partial<StrategyValidatorOptions> = {},
): StrategyContractValidator {
  return new DefaultStrategyContractValidator(options);
}