/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/ai-strategy-portfolio-validator.ts
 *
 * Purpose:
 * Provides deterministic, side-effect-free validation for AI-managed strategy
 * portfolios and their run requests. The validator never mutates supplied
 * contracts and reports all discovered issues in stable field order.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
  AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
  AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
  type AiStrategyAllocationConstraint,
  type AiStrategyAllocationPolicy,
  type AiStrategyCandidate,
  type AiStrategyDiversificationPolicy,
  type AiStrategyPortfolioConfiguration,
  type AiStrategyPortfolioRunRequest,
  type AiStrategyPortfolioSafetyPolicy,
  type AiStrategyPortfolioState,
  type AiStrategyPortfolioValidationIssue,
  type AiStrategyPortfolioValidationReport,
  type AiStrategyPortfolioValidatorPort,
  type AiStrategyRankingPolicy,
  type AiStrategyRegimeSnapshot,
  type AiStrategyRiskBudgetConstraint,
  type AiStrategyRotationPolicy,
  type AiStrategyScorePolicy,
} from "./ai-strategy-portfolio-contracts";

export interface AiStrategyPortfolioValidatorOptions {
  readonly maximumClockSkewMilliseconds?: number;
  readonly requireCandidateManifestMatch?: boolean;
  readonly requireCandidateConfigurationMatch?: boolean;
  readonly rejectDuplicateTags?: boolean;
  readonly rejectUnknownStateCandidates?: boolean;
  readonly requireProbabilityDistribution?: boolean;
  readonly probabilityTolerance?: number;
  readonly weightTolerance?: number;
  readonly maximumMetadataDepth?: number;
  readonly maximumMetadataEntries?: number;
  readonly clock?: () => UnixTimestampMilliseconds;
}

const DEFAULT_MAXIMUM_CLOCK_SKEW_MILLISECONDS = 60_000;
const DEFAULT_PROBABILITY_TOLERANCE = 1e-9;
const DEFAULT_WEIGHT_TOLERANCE = 1e-9;
const DEFAULT_MAXIMUM_METADATA_DEPTH = 12;
const DEFAULT_MAXIMUM_METADATA_ENTRIES = 2_000;

interface NormalizedValidatorOptions {
  readonly maximumClockSkewMilliseconds: number;
  readonly requireCandidateManifestMatch: boolean;
  readonly requireCandidateConfigurationMatch: boolean;
  readonly rejectDuplicateTags: boolean;
  readonly rejectUnknownStateCandidates: boolean;
  readonly requireProbabilityDistribution: boolean;
  readonly probabilityTolerance: number;
  readonly weightTolerance: number;
  readonly maximumMetadataDepth: number;
  readonly maximumMetadataEntries: number;
  readonly clock: () => UnixTimestampMilliseconds;
}

class ValidationCollector {
  private readonly issues: AiStrategyPortfolioValidationIssue[] = [];

  public error(
    field: string,
    code: string,
    message: string,
    candidateId?: string,
  ): void {
    this.add("ERROR", field, code, message, candidateId);
  }

  public warning(
    field: string,
    code: string,
    message: string,
    candidateId?: string,
  ): void {
    this.add("WARNING", field, code, message, candidateId);
  }

  public report(
    validatedAt: UnixTimestampMilliseconds,
  ): AiStrategyPortfolioValidationReport {
    const sorted = [...this.issues].sort((left, right) => {
      const fieldComparison = left.field.localeCompare(right.field);
      if (fieldComparison !== 0) {
        return fieldComparison;
      }

      const severityComparison = left.severity.localeCompare(right.severity);
      if (severityComparison !== 0) {
        return severityComparison;
      }

      return left.code.localeCompare(right.code);
    });

    const errorCount = sorted.filter(
      (issue) => issue.severity === "ERROR",
    ).length;

    return Object.freeze({
      valid: errorCount === 0,
      validatedAt,
      issues: Object.freeze(sorted.map((issue) => Object.freeze(issue))),
      errorCount,
      warningCount: sorted.length - errorCount,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }

  private add(
    severity: "ERROR" | "WARNING",
    field: string,
    code: string,
    message: string,
    candidateId?: string,
  ): void {
    this.issues.push({
      severity,
      code,
      field,
      message,
      candidateId,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function validateRequiredString(
  value: unknown,
  field: string,
  collector: ValidationCollector,
): void {
  if (!isNonEmptyString(value)) {
    collector.error(
      field,
      "REQUIRED_STRING",
      `${field} must be a non-empty string.`,
    );
  }
}

function validateOptionalPositiveNumber(
  value: number | undefined,
  field: string,
  collector: ValidationCollector,
): void {
  if (value !== undefined && (!isFiniteNumber(value) || value <= 0)) {
    collector.error(
      field,
      "INVALID_POSITIVE_NUMBER",
      `${field} must be greater than zero.`,
    );
  }
}

function validateOptionalNonNegativeNumber(
  value: number | undefined,
  field: string,
  collector: ValidationCollector,
): void {
  if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
    collector.error(
      field,
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} cannot be negative.`,
    );
  }
}

function validateRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
  collector: ValidationCollector,
): void {
  if (!isFiniteNumber(value) || value < minimum || value > maximum) {
    collector.error(
      field,
      "VALUE_OUT_OF_RANGE",
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function validateTimestamp(
  value: UnixTimestampMilliseconds,
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
    const itemField = `${field}[${index}]`;
    validateRequiredString(value, itemField, collector);

    if (seen.has(value)) {
      collector.error(
        itemField,
        "DUPLICATE_VALUE",
        `${field} must contain unique values.`,
      );
    }
    seen.add(value);
  });
}

function validateUniqueValues<T extends string>(
  values: readonly T[],
  field: string,
  collector: ValidationCollector,
  allowEmpty: boolean,
): void {
  validateUniqueStrings(values, field, collector, allowEmpty);
}

function validateMetadata(
  metadata: StrategyMetadata,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  let entries = 0;
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number, path: string): void => {
    if (depth > options.maximumMetadataDepth) {
      collector.error(
        path,
        "METADATA_DEPTH_EXCEEDED",
        `${field} exceeds the maximum metadata depth of ${options.maximumMetadataDepth}.`,
      );
      return;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        collector.error(
          path,
          "NON_FINITE_METADATA_NUMBER",
          `${path} must be finite.`,
        );
      }
      return;
    }

    if (Array.isArray(value)) {
      if (visited.has(value)) {
        collector.error(
          path,
          "CYCLIC_METADATA",
          `${field} cannot contain cycles.`,
        );
        return;
      }

      visited.add(value);
      value.forEach((item, index) => {
        entries += 1;
        visit(item, depth + 1, `${path}[${index}]`);
      });
      visited.delete(value);
      return;
    }

    if (typeof value === "object") {
      if (visited.has(value)) {
        collector.error(
          path,
          "CYCLIC_METADATA",
          `${field} cannot contain cycles.`,
        );
        return;
      }

      visited.add(value);
      Object.entries(value as Readonly<Record<string, unknown>>).forEach(
        ([key, child]) => {
          entries += 1;
          if (!isNonEmptyString(key)) {
            collector.error(
              path,
              "EMPTY_METADATA_KEY",
              `${field} contains an empty key.`,
            );
          }
          visit(child, depth + 1, `${path}.${key}`);
        },
      );
      visited.delete(value);
      return;
    }

    collector.error(
      path,
      "UNSUPPORTED_METADATA_VALUE",
      `${path} contains a non-serializable value.`,
    );
  };

  visit(metadata, 0, field);

  if (entries > options.maximumMetadataEntries) {
    collector.error(
      field,
      "METADATA_ENTRY_LIMIT_EXCEEDED",
      `${field} exceeds the maximum of ${options.maximumMetadataEntries} entries.`,
    );
  }
}

function validateScorePolicy(
  policy: AiStrategyScorePolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRange(
    policy.minimumCompositeScore,
    AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
    `${field}.minimumCompositeScore`,
    collector,
  );
  validateRange(
    policy.minimumConfidence,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
    `${field}.minimumConfidence`,
    collector,
  );
  validateRange(
    policy.missingMetricPenalty,
    AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
    `${field}.missingMetricPenalty`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    policy.maximumDrawdown,
    `${field}.maximumDrawdown`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    policy.minimumProfitFactor,
    `${field}.minimumProfitFactor`,
    collector,
  );

  if (
    policy.minimumTradeCount !== undefined &&
    !isNonNegativeInteger(policy.minimumTradeCount)
  ) {
    collector.error(
      `${field}.minimumTradeCount`,
      "INVALID_TRADE_COUNT",
      `${field}.minimumTradeCount must be a non-negative integer.`,
    );
  }

  if (
    policy.minimumSharpeRatio !== undefined &&
    !isFiniteNumber(policy.minimumSharpeRatio)
  ) {
    collector.error(
      `${field}.minimumSharpeRatio`,
      "INVALID_SHARPE_RATIO",
      `${field}.minimumSharpeRatio must be finite.`,
    );
  }

  if (policy.weights.length === 0) {
    collector.error(
      `${field}.weights`,
      "EMPTY_SCORE_WEIGHTS",
      "At least one score weight is required.",
    );
  }

  const dimensions = new Set<string>();
  let enabledWeight = 0;
  policy.weights.forEach((weight, index) => {
    const weightField = `${field}.weights[${index}]`;
    validateRange(
      weight.weight,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
      `${weightField}.weight`,
      collector,
    );

    if (dimensions.has(weight.dimension)) {
      collector.error(
        `${weightField}.dimension`,
        "DUPLICATE_SCORE_DIMENSION",
        `Score dimension '${weight.dimension}' is duplicated.`,
      );
    }
    dimensions.add(weight.dimension);

    if (weight.enabled) {
      enabledWeight += weight.weight;
    }

    validateMetadata(
      weight.metadata,
      `${weightField}.metadata`,
      collector,
      options,
    );
  });

  if (enabledWeight <= options.weightTolerance) {
    collector.error(
      `${field}.weights`,
      "NO_ENABLED_SCORE_WEIGHT",
      "Enabled score weights must have positive total weight.",
    );
  }

  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateRankingPolicy(
  policy: AiStrategyRankingPolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  if (!isPositiveInteger(policy.maximumSelectedStrategies)) {
    collector.error(
      `${field}.maximumSelectedStrategies`,
      "INVALID_SELECTED_LIMIT",
      "maximumSelectedStrategies must be a positive integer.",
    );
  }

  if (!isNonNegativeInteger(policy.maximumReserveStrategies)) {
    collector.error(
      `${field}.maximumReserveStrategies`,
      "INVALID_RESERVE_LIMIT",
      "maximumReserveStrategies must be a non-negative integer.",
    );
  }

  if (
    policy.maximumStrategiesPerFamily !== undefined &&
    !isPositiveInteger(policy.maximumStrategiesPerFamily)
  ) {
    collector.error(
      `${field}.maximumStrategiesPerFamily`,
      "INVALID_FAMILY_LIMIT",
      "maximumStrategiesPerFamily must be a positive integer when provided.",
    );
  }

  validateRange(
    policy.minimumAdjustedScore,
    AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
    `${field}.minimumAdjustedScore`,
    collector,
  );
  validateRange(
    policy.minimumConfidence,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
    `${field}.minimumConfidence`,
    collector,
  );
  validateUniqueValues(
    policy.tieBreakerDimensions,
    `${field}.tieBreakerDimensions`,
    collector,
    true,
  );
  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateDiversificationPolicy(
  policy: AiStrategyDiversificationPolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRange(
    policy.maximumPairwiseCorrelation,
    AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM,
    AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM,
    `${field}.maximumPairwiseCorrelation`,
    collector,
  );
  validateRange(
    policy.maximumAverageCorrelation,
    AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM,
    AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM,
    `${field}.maximumAverageCorrelation`,
    collector,
  );
  validateRange(
    policy.maximumFamilyWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumFamilyWeight`,
    collector,
  );
  validateRange(
    policy.correlationPenaltyWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.correlationPenaltyWeight`,
    collector,
  );

  if (!isPositiveInteger(policy.minimumFamilyCount)) {
    collector.error(
      `${field}.minimumFamilyCount`,
      "INVALID_MINIMUM_FAMILY_COUNT",
      "minimumFamilyCount must be a positive integer.",
    );
  }

  if (!isPositiveInteger(policy.minimumIntelligenceTypeCount)) {
    collector.error(
      `${field}.minimumIntelligenceTypeCount`,
      "INVALID_MINIMUM_INTELLIGENCE_TYPE_COUNT",
      "minimumIntelligenceTypeCount must be a positive integer.",
    );
  }

  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateAllocationConstraint(
  constraint: AiStrategyAllocationConstraint,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRequiredString(
    constraint.candidateId,
    `${field}.candidateId`,
    collector,
  );
  validateRange(
    constraint.minimumWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.minimumWeight`,
    collector,
  );
  validateRange(
    constraint.maximumWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumWeight`,
    collector,
  );

  if (constraint.minimumWeight > constraint.maximumWeight) {
    collector.error(
      field,
      "INVALID_WEIGHT_BOUNDS",
      `${field}.minimumWeight cannot exceed maximumWeight.`,
      constraint.candidateId,
    );
  }

  validateOptionalNonNegativeNumber(
    constraint.minimumCapital,
    `${field}.minimumCapital`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    constraint.maximumCapital,
    `${field}.maximumCapital`,
    collector,
  );

  if (
    constraint.minimumCapital !== undefined &&
    constraint.maximumCapital !== undefined &&
    constraint.minimumCapital > constraint.maximumCapital
  ) {
    collector.error(
      field,
      "INVALID_CAPITAL_BOUNDS",
      `${field}.minimumCapital cannot exceed maximumCapital.`,
      constraint.candidateId,
    );
  }

  if (constraint.lockedWeight !== undefined) {
    validateRange(
      constraint.lockedWeight,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
      `${field}.lockedWeight`,
      collector,
    );

    if (
      constraint.lockedWeight < constraint.minimumWeight ||
      constraint.lockedWeight > constraint.maximumWeight
    ) {
      collector.error(
        `${field}.lockedWeight`,
        "LOCKED_WEIGHT_OUTSIDE_BOUNDS",
        "lockedWeight must be within the configured minimum and maximum weights.",
        constraint.candidateId,
      );
    }
  }

  validateMetadata(
    constraint.metadata,
    `${field}.metadata`,
    collector,
    options,
  );
}

function validateAllocationPolicy(
  policy: AiStrategyAllocationPolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  if (!isNonNegativeInteger(policy.rebalanceThresholdBps)) {
    collector.error(
      `${field}.rebalanceThresholdBps`,
      "INVALID_REBALANCE_THRESHOLD",
      "rebalanceThresholdBps must be a non-negative integer.",
    );
  }

  validateRange(
    policy.minimumAllocationWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.minimumAllocationWeight`,
    collector,
  );
  validateRange(
    policy.maximumAllocationWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumAllocationWeight`,
    collector,
  );

  if (policy.minimumAllocationWeight > policy.maximumAllocationWeight) {
    collector.error(
      field,
      "INVALID_ALLOCATION_WEIGHT_BOUNDS",
      "minimumAllocationWeight cannot exceed maximumAllocationWeight.",
    );
  }

  validateOptionalPositiveNumber(
    policy.scoreExponent,
    `${field}.scoreExponent`,
    collector,
  );
  validateRange(
    policy.confidenceWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.confidenceWeight`,
    collector,
  );
  validateRange(
    policy.regimeFitnessWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.regimeFitnessWeight`,
    collector,
  );
  validateRange(
    policy.diversificationWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.diversificationWeight`,
    collector,
  );
  validateRange(
    policy.turnoverPenaltyWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.turnoverPenaltyWeight`,
    collector,
  );

  const candidateIds = new Set<string>();
  policy.constraints.forEach((constraint, index) => {
    const constraintField = `${field}.constraints[${index}]`;
    validateAllocationConstraint(
      constraint,
      constraintField,
      collector,
      options,
    );

    if (candidateIds.has(constraint.candidateId)) {
      collector.error(
        `${constraintField}.candidateId`,
        "DUPLICATE_ALLOCATION_CONSTRAINT",
        `Candidate '${constraint.candidateId}' has multiple allocation constraints.`,
        constraint.candidateId,
      );
    }
    candidateIds.add(constraint.candidateId);
  });

  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateRotationPolicy(
  policy: AiStrategyRotationPolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  if (!isNonNegativeInteger(policy.minimumTimeBetweenRotationsMilliseconds)) {
    collector.error(
      `${field}.minimumTimeBetweenRotationsMilliseconds`,
      "INVALID_ROTATION_INTERVAL",
      "minimumTimeBetweenRotationsMilliseconds must be a non-negative integer.",
    );
  }
  if (!isNonNegativeInteger(policy.minimumWeightChangeBps)) {
    collector.error(
      `${field}.minimumWeightChangeBps`,
      "INVALID_WEIGHT_CHANGE_THRESHOLD",
      "minimumWeightChangeBps must be a non-negative integer.",
    );
  }
  validateRange(
    policy.maximumRotationTurnover,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumRotationTurnover`,
    collector,
  );
  if (!isPositiveInteger(policy.maximumInstructionsPerRun)) {
    collector.error(
      `${field}.maximumInstructionsPerRun`,
      "INVALID_INSTRUCTION_LIMIT",
      "maximumInstructionsPerRun must be a positive integer.",
    );
  }
  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateSafetyPolicy(
  policy: AiStrategyPortfolioSafetyPolicy,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRange(
    policy.maximumAiNativeWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumAiNativeWeight`,
    collector,
  );
  validateRange(
    policy.maximumAiAssistedWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumAiAssistedWeight`,
    collector,
  );
  validateRange(
    policy.maximumNonDeterministicWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumNonDeterministicWeight`,
    collector,
  );

  if (!isPositiveInteger(policy.maximumPerformanceAgeMilliseconds)) {
    collector.error(
      `${field}.maximumPerformanceAgeMilliseconds`,
      "INVALID_PERFORMANCE_AGE",
      "maximumPerformanceAgeMilliseconds must be a positive integer.",
    );
  }

  if (!policy.prohibitAiRiskOverride) {
    collector.warning(
      `${field}.prohibitAiRiskOverride`,
      "AI_RISK_OVERRIDE_ALLOWED",
      "Allowing AI to override deterministic risk controls is unsafe.",
    );
  }
  if (!policy.prohibitKillSwitchOverride) {
    collector.warning(
      `${field}.prohibitKillSwitchOverride`,
      "KILL_SWITCH_OVERRIDE_ALLOWED",
      "Allowing kill-switch overrides weakens the safety boundary.",
    );
  }
  if (!policy.prohibitCircuitBreakerOverride) {
    collector.warning(
      `${field}.prohibitCircuitBreakerOverride`,
      "CIRCUIT_BREAKER_OVERRIDE_ALLOWED",
      "Allowing circuit-breaker overrides weakens the safety boundary.",
    );
  }

  validateMetadata(policy.metadata, `${field}.metadata`, collector, options);
}

function validateRiskBudgetConstraint(
  constraint: AiStrategyRiskBudgetConstraint,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRange(
    constraint.maximumStrategyWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumStrategyWeight`,
    collector,
  );
  validateRange(
    constraint.maximumFamilyWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumFamilyWeight`,
    collector,
  );
  validateRange(
    constraint.maximumIntelligenceTypeWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumIntelligenceTypeWeight`,
    collector,
  );
  validateRange(
    constraint.maximumHighRiskWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.maximumHighRiskWeight`,
    collector,
  );
  validateRange(
    constraint.minimumCashReserveWeight,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
    AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
    `${field}.minimumCashReserveWeight`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    constraint.maximumPortfolioDrawdown,
    `${field}.maximumPortfolioDrawdown`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    constraint.volatilityTarget,
    `${field}.volatilityTarget`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    constraint.maximumTurnover,
    `${field}.maximumTurnover`,
    collector,
  );
  validateMetadata(
    constraint.metadata,
    `${field}.metadata`,
    collector,
    options,
  );
}

function validateConfiguration(
  configuration: AiStrategyPortfolioConfiguration,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRequiredString(
    configuration.portfolioId,
    `${field}.portfolioId`,
    collector,
  );
  validateRequiredString(configuration.name, `${field}.name`, collector);
  validateRequiredString(
    configuration.reportingCurrency,
    `${field}.reportingCurrency`,
    collector,
  );
  validateOptionalPositiveNumber(
    configuration.totalCapital,
    `${field}.totalCapital`,
    collector,
  );

  validateUniqueValues(
    configuration.allowedFamilies,
    `${field}.allowedFamilies`,
    collector,
    false,
  );
  validateUniqueValues(
    configuration.allowedIntelligenceTypes,
    `${field}.allowedIntelligenceTypes`,
    collector,
    false,
  );
  validateUniqueValues(
    configuration.allowedAutomationLevels,
    `${field}.allowedAutomationLevels`,
    collector,
    false,
  );
  validateUniqueValues(
    configuration.allowedMarketTypes,
    `${field}.allowedMarketTypes`,
    collector,
    false,
  );

  validateScorePolicy(
    configuration.scorePolicy,
    `${field}.scorePolicy`,
    collector,
    options,
  );
  validateRankingPolicy(
    configuration.rankingPolicy,
    `${field}.rankingPolicy`,
    collector,
    options,
  );
  validateDiversificationPolicy(
    configuration.diversificationPolicy,
    `${field}.diversificationPolicy`,
    collector,
    options,
  );
  validateAllocationPolicy(
    configuration.allocationPolicy,
    `${field}.allocationPolicy`,
    collector,
    options,
  );
  validateRotationPolicy(
    configuration.rotationPolicy,
    `${field}.rotationPolicy`,
    collector,
    options,
  );
  validateSafetyPolicy(
    configuration.safetyPolicy,
    `${field}.safetyPolicy`,
    collector,
    options,
  );
  validateMetadata(
    configuration.metadata,
    `${field}.metadata`,
    collector,
    options,
  );
}

function validateRegime(
  regime: AiStrategyRegimeSnapshot,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
): void {
  validateRequiredString(regime.regimeId, `${field}.regimeId`, collector);
  validateTimestamp(regime.timestamp, `${field}.timestamp`, collector);
  validateRequiredString(regime.source, `${field}.source`, collector);
  validateRange(
    regime.confidence,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
    `${field}.confidence`,
    collector,
  );
  validateRange(
    regime.volatilityScore,
    0,
    1,
    `${field}.volatilityScore`,
    collector,
  );
  validateRange(regime.trendScore, -1, 1, `${field}.trendScore`, collector);
  validateRange(
    regime.liquidityScore,
    0,
    1,
    `${field}.liquidityScore`,
    collector,
  );
  validateRange(regime.stressScore, 0, 1, `${field}.stressScore`, collector);

  if (
    regime.expectedDurationMilliseconds !== undefined &&
    !isPositiveInteger(regime.expectedDurationMilliseconds)
  ) {
    collector.error(
      `${field}.expectedDurationMilliseconds`,
      "INVALID_REGIME_DURATION",
      "expectedDurationMilliseconds must be a positive integer when provided.",
    );
  }

  const regimes = new Set<string>();
  let probabilitySum = 0;
  regime.probabilities.forEach((entry, index) => {
    const probabilityField = `${field}.probabilities[${index}]`;
    validateRange(
      entry.probability,
      0,
      1,
      `${probabilityField}.probability`,
      collector,
    );
    if (regimes.has(entry.regime)) {
      collector.error(
        `${probabilityField}.regime`,
        "DUPLICATE_REGIME_PROBABILITY",
        `Regime '${entry.regime}' is duplicated.`,
      );
    }
    regimes.add(entry.regime);
    probabilitySum += entry.probability;
  });

  if (regime.probabilities.length === 0) {
    collector.error(
      `${field}.probabilities`,
      "EMPTY_REGIME_PROBABILITIES",
      "At least one regime probability is required.",
    );
  } else if (
    options.requireProbabilityDistribution &&
    Math.abs(probabilitySum - 1) > options.probabilityTolerance
  ) {
    collector.error(
      `${field}.probabilities`,
      "INVALID_PROBABILITY_DISTRIBUTION",
      `Regime probabilities must sum to 1 within tolerance ${options.probabilityTolerance}.`,
    );
  }

  if (!regimes.has(regime.primaryRegime)) {
    collector.warning(
      `${field}.primaryRegime`,
      "PRIMARY_REGIME_NOT_IN_DISTRIBUTION",
      "primaryRegime is not present in the probability distribution.",
    );
  }

  validateMetadata(regime.metadata, `${field}.metadata`, collector, options);
}

function validateCandidate(
  candidate: AiStrategyCandidate,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
  requestTimestamp: UnixTimestampMilliseconds,
): void {
  const candidateId = candidate.identity.candidateId;
  validateRequiredString(
    candidateId,
    `${field}.identity.candidateId`,
    collector,
  );
  validateRequiredString(
    candidate.identity.strategyId,
    `${field}.identity.strategyId`,
    collector,
  );
  validateRequiredString(
    candidate.identity.strategyInstanceId,
    `${field}.identity.strategyInstanceId`,
    collector,
  );
  validateRequiredString(
    candidate.identity.strategyVersion,
    `${field}.identity.strategyVersion`,
    collector,
  );

  if (options.requireCandidateManifestMatch) {
    if (candidate.manifest.strategyId !== candidate.identity.strategyId) {
      collector.error(
        `${field}.manifest.strategyId`,
        "MANIFEST_STRATEGY_ID_MISMATCH",
        "Candidate manifest strategyId must match candidate identity.",
        candidateId,
      );
    }
    if (candidate.manifest.version !== candidate.identity.strategyVersion) {
      collector.error(
        `${field}.manifest.version`,
        "MANIFEST_VERSION_MISMATCH",
        "Candidate manifest version must match candidate identity.",
        candidateId,
      );
    }
  }

  if (options.requireCandidateConfigurationMatch) {
    if (candidate.configuration.strategyId !== candidate.identity.strategyId) {
      collector.error(
        `${field}.configuration.strategyId`,
        "CONFIGURATION_STRATEGY_ID_MISMATCH",
        "Candidate configuration strategyId must match candidate identity.",
        candidateId,
      );
    }
    if (
      candidate.configuration.strategyInstanceId !==
      candidate.identity.strategyInstanceId
    ) {
      collector.error(
        `${field}.configuration.strategyInstanceId`,
        "CONFIGURATION_INSTANCE_ID_MISMATCH",
        "Candidate configuration strategyInstanceId must match candidate identity.",
        candidateId,
      );
    }
    if (
      candidate.configuration.strategyVersion !==
      candidate.identity.strategyVersion
    ) {
      collector.error(
        `${field}.configuration.strategyVersion`,
        "CONFIGURATION_VERSION_MISMATCH",
        "Candidate configuration strategyVersion must match candidate identity.",
        candidateId,
      );
    }
  }

  if (
    !candidate.manifest.supportedEnvironments.includes(
      candidate.configuration.environment,
    )
  ) {
    collector.error(
      `${field}.configuration.environment`,
      "UNSUPPORTED_CANDIDATE_ENVIRONMENT",
      "Candidate configuration environment is not supported by its manifest.",
      candidateId,
    );
  }

  if (
    !candidate.manifest.supportedTradingModes.includes(
      candidate.configuration.tradingMode,
    )
  ) {
    collector.error(
      `${field}.configuration.tradingMode`,
      "UNSUPPORTED_CANDIDATE_TRADING_MODE",
      "Candidate configuration tradingMode is not supported by its manifest.",
      candidateId,
    );
  }

  validateUniqueStrings(
    candidate.classification.tags,
    `${field}.classification.tags`,
    collector,
    true,
  );

  if (!options.rejectDuplicateTags) {
    // Duplicate-tag issues are removed by using a separate pass only when enabled.
    // The baseline call above still validates that every tag is non-empty.
  }

  validateUniqueValues(
    candidate.compatibility.supportedEnvironments,
    `${field}.compatibility.supportedEnvironments`,
    collector,
    false,
  );
  validateUniqueValues(
    candidate.compatibility.supportedTradingModes,
    `${field}.compatibility.supportedTradingModes`,
    collector,
    false,
  );
  validateUniqueValues(
    candidate.compatibility.supportedMarketTypes,
    `${field}.compatibility.supportedMarketTypes`,
    collector,
    false,
  );
  validateUniqueValues(
    candidate.compatibility.requiredCapabilities,
    `${field}.compatibility.requiredCapabilities`,
    collector,
    true,
  );
  validateUniqueValues(
    candidate.compatibility.supportedRegimes,
    `${field}.compatibility.supportedRegimes`,
    collector,
    true,
  );
  validateUniqueValues(
    candidate.compatibility.excludedRegimes,
    `${field}.compatibility.excludedRegimes`,
    collector,
    true,
  );

  const supportedRegimes = new Set(candidate.compatibility.supportedRegimes);
  candidate.compatibility.excludedRegimes.forEach((regime) => {
    if (supportedRegimes.has(regime)) {
      collector.error(
        `${field}.compatibility.excludedRegimes`,
        "CONFLICTING_REGIME_COMPATIBILITY",
        `Regime '${regime}' cannot be both supported and excluded.`,
        candidateId,
      );
    }
  });

  validateOptionalNonNegativeNumber(
    candidate.compatibility.minimumCapital,
    `${field}.compatibility.minimumCapital`,
    collector,
  );
  validateOptionalNonNegativeNumber(
    candidate.compatibility.maximumCapital,
    `${field}.compatibility.maximumCapital`,
    collector,
  );

  if (
    candidate.compatibility.minimumCapital !== undefined &&
    candidate.compatibility.maximumCapital !== undefined &&
    candidate.compatibility.minimumCapital >
      candidate.compatibility.maximumCapital
  ) {
    collector.error(
      `${field}.compatibility`,
      "INVALID_COMPATIBILITY_CAPITAL_BOUNDS",
      "minimumCapital cannot exceed maximumCapital.",
      candidateId,
    );
  }

  if (
    candidate.compatibility.minimumEvaluationHistory !== undefined &&
    !isNonNegativeInteger(candidate.compatibility.minimumEvaluationHistory)
  ) {
    collector.error(
      `${field}.compatibility.minimumEvaluationHistory`,
      "INVALID_MINIMUM_EVALUATION_HISTORY",
      "minimumEvaluationHistory must be a non-negative integer.",
      candidateId,
    );
  }

  if (
    candidate.compatibility.maximumConcurrentInstances !== undefined &&
    !isPositiveInteger(candidate.compatibility.maximumConcurrentInstances)
  ) {
    collector.error(
      `${field}.compatibility.maximumConcurrentInstances`,
      "INVALID_MAXIMUM_CONCURRENT_INSTANCES",
      "maximumConcurrentInstances must be a positive integer.",
      candidateId,
    );
  }

  validateTimestamp(candidate.discoveredAt, `${field}.discoveredAt`, collector);
  if (candidate.discoveredAt > requestTimestamp) {
    collector.error(
      `${field}.discoveredAt`,
      "CANDIDATE_DISCOVERED_IN_FUTURE",
      "Candidate discoveredAt cannot be later than the run timestamp.",
      candidateId,
    );
  }

  if (candidate.lastEvaluatedAt !== undefined) {
    validateTimestamp(
      candidate.lastEvaluatedAt,
      `${field}.lastEvaluatedAt`,
      collector,
    );
    if (candidate.lastEvaluatedAt > requestTimestamp) {
      collector.error(
        `${field}.lastEvaluatedAt`,
        "CANDIDATE_EVALUATED_IN_FUTURE",
        "Candidate lastEvaluatedAt cannot be later than the run timestamp.",
        candidateId,
      );
    }
  }

  validateMetadata(
    candidate.classification.metadata,
    `${field}.classification.metadata`,
    collector,
    options,
  );
  validateMetadata(
    candidate.compatibility.metadata,
    `${field}.compatibility.metadata`,
    collector,
    options,
  );
  validateMetadata(candidate.metadata, `${field}.metadata`, collector, options);
}

function validateState(
  state: AiStrategyPortfolioState,
  field: string,
  collector: ValidationCollector,
  options: NormalizedValidatorOptions,
  knownCandidateIds: ReadonlySet<string>,
): void {
  validateRequiredString(state.portfolioId, `${field}.portfolioId`, collector);
  if (!isNonNegativeInteger(state.version)) {
    collector.error(
      `${field}.version`,
      "INVALID_STATE_VERSION",
      "State version must be a non-negative integer.",
    );
  }
  validateTimestamp(state.timestamp, `${field}.timestamp`, collector);

  validateUniqueStrings(
    state.activeCandidateIds,
    `${field}.activeCandidateIds`,
    collector,
    true,
  );
  validateUniqueStrings(
    state.reserveCandidateIds,
    `${field}.reserveCandidateIds`,
    collector,
    true,
  );
  validateUniqueStrings(
    state.suspendedCandidateIds,
    `${field}.suspendedCandidateIds`,
    collector,
    true,
  );

  const membership = new Map<string, string>();
  const registerMembership = (
    candidateId: string,
    collection: string,
  ): void => {
    const existing = membership.get(candidateId);
    if (existing !== undefined) {
      collector.error(
        `${field}.${collection}`,
        "CANDIDATE_IN_MULTIPLE_STATE_COLLECTIONS",
        `Candidate '${candidateId}' appears in both ${existing} and ${collection}.`,
        candidateId,
      );
    } else {
      membership.set(candidateId, collection);
    }

    if (
      options.rejectUnknownStateCandidates &&
      !knownCandidateIds.has(candidateId)
    ) {
      collector.error(
        `${field}.${collection}`,
        "UNKNOWN_STATE_CANDIDATE",
        `State references unknown candidate '${candidateId}'.`,
        candidateId,
      );
    }
  };

  state.activeCandidateIds.forEach((id) =>
    registerMembership(id, "activeCandidateIds"),
  );
  state.reserveCandidateIds.forEach((id) =>
    registerMembership(id, "reserveCandidateIds"),
  );
  state.suspendedCandidateIds.forEach((id) =>
    registerMembership(id, "suspendedCandidateIds"),
  );

  const allocationIds = new Set<string>();
  let totalWeight = 0;
  state.allocations.forEach((allocation, index) => {
    const allocationField = `${field}.allocations[${index}]`;
    validateRequiredString(
      allocation.candidateId,
      `${allocationField}.candidateId`,
      collector,
    );
    validateRange(
      allocation.weight,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MINIMUM,
      AI_STRATEGY_PORTFOLIO_WEIGHT_MAXIMUM,
      `${allocationField}.weight`,
      collector,
    );
    validateOptionalNonNegativeNumber(
      allocation.capital,
      `${allocationField}.capital`,
      collector,
    );

    if (allocationIds.has(allocation.candidateId)) {
      collector.error(
        `${allocationField}.candidateId`,
        "DUPLICATE_STATE_ALLOCATION",
        `Candidate '${allocation.candidateId}' has multiple state allocations.`,
        allocation.candidateId,
      );
    }
    allocationIds.add(allocation.candidateId);
    totalWeight += allocation.weight;

    if (
      options.rejectUnknownStateCandidates &&
      !knownCandidateIds.has(allocation.candidateId)
    ) {
      collector.error(
        `${allocationField}.candidateId`,
        "UNKNOWN_ALLOCATION_CANDIDATE",
        `Allocation references unknown candidate '${allocation.candidateId}'.`,
        allocation.candidateId,
      );
    }

    if (
      allocation.active &&
      !state.activeCandidateIds.includes(allocation.candidateId)
    ) {
      collector.warning(
        `${allocationField}.active`,
        "ACTIVE_ALLOCATION_NOT_IN_ACTIVE_SET",
        "An active allocation should normally be present in activeCandidateIds.",
        allocation.candidateId,
      );
    }

    validateMetadata(
      allocation.metadata,
      `${allocationField}.metadata`,
      collector,
      options,
    );
  });

  if (totalWeight > 1 + options.weightTolerance) {
    collector.error(
      `${field}.allocations`,
      "STATE_WEIGHT_EXCEEDS_ONE",
      `State allocation weights total ${totalWeight}, which exceeds 1.`,
    );
  }

  if (state.lastRotationAt !== undefined) {
    validateTimestamp(
      state.lastRotationAt,
      `${field}.lastRotationAt`,
      collector,
    );
    if (state.lastRotationAt > state.timestamp) {
      collector.error(
        `${field}.lastRotationAt`,
        "ROTATION_AFTER_STATE_TIMESTAMP",
        "lastRotationAt cannot be later than the state timestamp.",
      );
    }
  }

  validateMetadata(state.metadata, `${field}.metadata`, collector, options);
}

export class AiStrategyPortfolioValidator implements AiStrategyPortfolioValidatorPort {
  private readonly options: NormalizedValidatorOptions;

  public constructor(options: AiStrategyPortfolioValidatorOptions = {}) {
    this.options = Object.freeze({
      maximumClockSkewMilliseconds:
        options.maximumClockSkewMilliseconds ??
        DEFAULT_MAXIMUM_CLOCK_SKEW_MILLISECONDS,
      requireCandidateManifestMatch:
        options.requireCandidateManifestMatch ?? true,
      requireCandidateConfigurationMatch:
        options.requireCandidateConfigurationMatch ?? true,
      rejectDuplicateTags: options.rejectDuplicateTags ?? true,
      rejectUnknownStateCandidates:
        options.rejectUnknownStateCandidates ?? true,
      requireProbabilityDistribution:
        options.requireProbabilityDistribution ?? true,
      probabilityTolerance:
        options.probabilityTolerance ?? DEFAULT_PROBABILITY_TOLERANCE,
      weightTolerance: options.weightTolerance ?? DEFAULT_WEIGHT_TOLERANCE,
      maximumMetadataDepth:
        options.maximumMetadataDepth ?? DEFAULT_MAXIMUM_METADATA_DEPTH,
      maximumMetadataEntries:
        options.maximumMetadataEntries ?? DEFAULT_MAXIMUM_METADATA_ENTRIES,
      clock: options.clock ?? (() => Date.now()),
    });

    if (!isNonNegativeInteger(this.options.maximumClockSkewMilliseconds)) {
      throw new Error(
        "maximumClockSkewMilliseconds must be a non-negative integer.",
      );
    }
    if (
      !isFiniteNumber(this.options.probabilityTolerance) ||
      this.options.probabilityTolerance < 0
    ) {
      throw new Error(
        "probabilityTolerance must be a non-negative finite number.",
      );
    }
    if (
      !isFiniteNumber(this.options.weightTolerance) ||
      this.options.weightTolerance < 0
    ) {
      throw new Error("weightTolerance must be a non-negative finite number.");
    }
    if (!isPositiveInteger(this.options.maximumMetadataDepth)) {
      throw new Error("maximumMetadataDepth must be a positive integer.");
    }
    if (!isPositiveInteger(this.options.maximumMetadataEntries)) {
      throw new Error("maximumMetadataEntries must be a positive integer.");
    }
  }

  public validateConfiguration(
    configuration: AiStrategyPortfolioConfiguration,
    timestamp: UnixTimestampMilliseconds = this.options.clock(),
  ): AiStrategyPortfolioValidationReport {
    const collector = new ValidationCollector();
    validateTimestamp(timestamp, "timestamp", collector);
    validateConfiguration(
      configuration,
      "configuration",
      collector,
      this.options,
    );
    return collector.report(timestamp);
  }

  public validateState(
    state: AiStrategyPortfolioState,
    candidateIds: readonly string[] = [],
    timestamp: UnixTimestampMilliseconds = this.options.clock(),
  ): AiStrategyPortfolioValidationReport {
    const collector = new ValidationCollector();
    validateTimestamp(timestamp, "timestamp", collector);
    validateState(
      state,
      "state",
      collector,
      this.options,
      new Set(candidateIds),
    );
    return collector.report(timestamp);
  }

  public validateCandidate(
    candidate: AiStrategyCandidate,
    timestamp: UnixTimestampMilliseconds = this.options.clock(),
  ): AiStrategyPortfolioValidationReport {
    const collector = new ValidationCollector();
    validateTimestamp(timestamp, "timestamp", collector);
    validateCandidate(
      candidate,
      "candidate",
      collector,
      this.options,
      timestamp,
    );
    return collector.report(timestamp);
  }

  public validateRunRequest(
    request: AiStrategyPortfolioRunRequest,
  ): AiStrategyPortfolioValidationReport {
    const collector = new ValidationCollector();
    const validatedAt = this.options.clock();

    validateTimestamp(validatedAt, "validatedAt", collector);
    validateRequiredString(request.runId, "request.runId", collector);
    validateRequiredString(
      request.correlationId,
      "request.correlationId",
      collector,
    );
    validateTimestamp(request.timestamp, "request.timestamp", collector);

    if (
      isNonNegativeInteger(request.timestamp) &&
      request.timestamp >
        validatedAt + this.options.maximumClockSkewMilliseconds
    ) {
      collector.error(
        "request.timestamp",
        "RUN_TIMESTAMP_IN_FUTURE",
        "Run timestamp exceeds the permitted clock skew.",
      );
    }

    validateConfiguration(
      request.configuration,
      "request.configuration",
      collector,
      this.options,
    );

    if (request.candidates.length === 0) {
      collector.error(
        "request.candidates",
        "EMPTY_CANDIDATE_SET",
        "A strategy-portfolio run requires at least one candidate.",
      );
    }

    const candidateIds = new Set<string>();
    const instanceIds = new Set<string>();
    request.candidates.forEach((candidate, index) => {
      const field = `request.candidates[${index}]`;
      validateCandidate(
        candidate,
        field,
        collector,
        this.options,
        request.timestamp,
      );

      if (candidateIds.has(candidate.identity.candidateId)) {
        collector.error(
          `${field}.identity.candidateId`,
          "DUPLICATE_CANDIDATE_ID",
          `Candidate ID '${candidate.identity.candidateId}' is duplicated.`,
          candidate.identity.candidateId,
        );
      }
      candidateIds.add(candidate.identity.candidateId);

      if (instanceIds.has(candidate.identity.strategyInstanceId)) {
        collector.error(
          `${field}.identity.strategyInstanceId`,
          "DUPLICATE_STRATEGY_INSTANCE_ID",
          `Strategy instance '${candidate.identity.strategyInstanceId}' is duplicated.`,
          candidate.identity.candidateId,
        );
      }
      instanceIds.add(candidate.identity.strategyInstanceId);

      if (
        !request.configuration.allowedFamilies.includes(
          candidate.classification.family,
        )
      ) {
        collector.error(
          `${field}.classification.family`,
          "DISALLOWED_STRATEGY_FAMILY",
          `Strategy family '${candidate.classification.family}' is not allowed by the portfolio.`,
          candidate.identity.candidateId,
        );
      }

      if (
        !request.configuration.allowedIntelligenceTypes.includes(
          candidate.classification.intelligenceType,
        )
      ) {
        collector.error(
          `${field}.classification.intelligenceType`,
          "DISALLOWED_INTELLIGENCE_TYPE",
          `Intelligence type '${candidate.classification.intelligenceType}' is not allowed by the portfolio.`,
          candidate.identity.candidateId,
        );
      }

      if (
        !request.configuration.allowedAutomationLevels.includes(
          candidate.classification.automationLevel,
        )
      ) {
        collector.error(
          `${field}.classification.automationLevel`,
          "DISALLOWED_AUTOMATION_LEVEL",
          `Automation level '${candidate.classification.automationLevel}' is not allowed by the portfolio.`,
          candidate.identity.candidateId,
        );
      }

      const hasAllowedMarket =
        candidate.compatibility.supportedMarketTypes.some((marketType) =>
          request.configuration.allowedMarketTypes.includes(marketType),
        );
      if (!hasAllowedMarket) {
        collector.error(
          `${field}.compatibility.supportedMarketTypes`,
          "NO_ALLOWED_MARKET_TYPE",
          "Candidate does not support any market type allowed by the portfolio.",
          candidate.identity.candidateId,
        );
      }

      if (
        !candidate.compatibility.supportedEnvironments.includes(
          request.configuration.environment,
        )
      ) {
        collector.error(
          `${field}.compatibility.supportedEnvironments`,
          "PORTFOLIO_ENVIRONMENT_NOT_SUPPORTED",
          "Candidate does not support the portfolio environment.",
          candidate.identity.candidateId,
        );
      }
    });

    validateState(
      request.state,
      "request.state",
      collector,
      this.options,
      candidateIds,
    );

    if (request.configuration.portfolioId !== request.state.portfolioId) {
      collector.error(
        "request.state.portfolioId",
        "PORTFOLIO_ID_MISMATCH",
        "State portfolioId must match configuration portfolioId.",
      );
    }

    if (request.state.timestamp > request.timestamp) {
      collector.error(
        "request.state.timestamp",
        "STATE_TIMESTAMP_AFTER_RUN",
        "State timestamp cannot be later than the run timestamp.",
      );
    }

    if (request.regime.timestamp > request.timestamp) {
      collector.error(
        "request.regime.timestamp",
        "REGIME_TIMESTAMP_AFTER_RUN",
        "Regime timestamp cannot be later than the run timestamp.",
      );
    }
    validateRegime(request.regime, "request.regime", collector, this.options);

    const observations = new Set<string>();
    request.returnObservations.forEach((observation, index) => {
      const field = `request.returnObservations[${index}]`;
      validateRequiredString(
        observation.candidateId,
        `${field}.candidateId`,
        collector,
      );
      validateTimestamp(observation.timestamp, `${field}.timestamp`, collector);
      if (!isFiniteNumber(observation.returnValue)) {
        collector.error(
          `${field}.returnValue`,
          "INVALID_RETURN_OBSERVATION",
          "returnValue must be finite.",
          observation.candidateId,
        );
      }
      if (!candidateIds.has(observation.candidateId)) {
        collector.error(
          `${field}.candidateId`,
          "UNKNOWN_RETURN_OBSERVATION_CANDIDATE",
          `Return observation references unknown candidate '${observation.candidateId}'.`,
          observation.candidateId,
        );
      }
      if (observation.timestamp > request.timestamp) {
        collector.error(
          `${field}.timestamp`,
          "RETURN_OBSERVATION_IN_FUTURE",
          "Return observation timestamp cannot exceed the run timestamp.",
          observation.candidateId,
        );
      }

      const key = `${observation.candidateId}\u0000${observation.timestamp}`;
      if (observations.has(key)) {
        collector.error(
          field,
          "DUPLICATE_RETURN_OBSERVATION",
          "A candidate may have only one return observation per timestamp.",
          observation.candidateId,
        );
      }
      observations.add(key);
    });

    if (request.performanceAttribution !== undefined) {
      const attribution = request.performanceAttribution;
      validateRequiredString(
        attribution.attributionId,
        "request.performanceAttribution.attributionId",
        collector,
      );
      if (attribution.portfolioId !== request.configuration.portfolioId) {
        collector.error(
          "request.performanceAttribution.portfolioId",
          "ATTRIBUTION_PORTFOLIO_ID_MISMATCH",
          "Performance attribution portfolioId must match the run portfolio.",
        );
      }
      validateTimestamp(
        attribution.periodStart,
        "request.performanceAttribution.periodStart",
        collector,
      );
      validateTimestamp(
        attribution.periodEnd,
        "request.performanceAttribution.periodEnd",
        collector,
      );
      if (attribution.periodStart > attribution.periodEnd) {
        collector.error(
          "request.performanceAttribution",
          "INVALID_ATTRIBUTION_PERIOD",
          "Performance attribution periodStart cannot exceed periodEnd.",
        );
      }
      if (attribution.periodEnd > request.timestamp) {
        collector.error(
          "request.performanceAttribution.periodEnd",
          "ATTRIBUTION_PERIOD_IN_FUTURE",
          "Performance attribution cannot end after the run timestamp.",
        );
      }
    }

    const allocationConstraintIds = new Set(
      request.configuration.allocationPolicy.constraints.map(
        (constraint) => constraint.candidateId,
      ),
    );
    allocationConstraintIds.forEach((candidateId) => {
      if (!candidateIds.has(candidateId)) {
        collector.error(
          "request.configuration.allocationPolicy.constraints",
          "UNKNOWN_ALLOCATION_CONSTRAINT_CANDIDATE",
          `Allocation constraint references unknown candidate '${candidateId}'.`,
          candidateId,
        );
      }
    });

    const deterministicCandidates = request.candidates.filter(
      (candidate) =>
        candidate.classification.intelligenceType ===
          "DETERMINISTIC_RULE_BASED" ||
        candidate.classification.intelligenceType === "DETERMINISTIC_ARBITRAGE",
    );

    if (
      request.configuration.safetyPolicy.requireDeterministicFallback &&
      deterministicCandidates.length === 0
    ) {
      collector.error(
        "request.candidates",
        "MISSING_DETERMINISTIC_FALLBACK",
        "The safety policy requires at least one deterministic fallback strategy.",
      );
    }

    if (
      request.configuration.operatingMode === "RULE_BASED_ONLY" &&
      request.candidates.some(
        (candidate) =>
          candidate.classification.intelligenceType === "AI_NATIVE" ||
          candidate.classification.intelligenceType === "AI_ASSISTED",
      )
    ) {
      collector.warning(
        "request.candidates",
        "AI_CANDIDATES_IGNORED_IN_RULE_BASED_MODE",
        "AI candidates are present but cannot be allocated in RULE_BASED_ONLY mode.",
      );
    }

    validateMetadata(
      request.metadata,
      "request.metadata",
      collector,
      this.options,
    );
    return collector.report(validatedAt);
  }
}

export default AiStrategyPortfolioValidator;
