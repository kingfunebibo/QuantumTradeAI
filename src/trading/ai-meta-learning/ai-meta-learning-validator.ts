/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File:
 * src/trading/ai-meta-learning/ai-meta-learning-validator.ts
 *
 * Production-grade deterministic validation for the autonomous meta-learning
 * subsystem. The validator performs structural, numeric, lifecycle, safety,
 * and cross-field consistency checks without mutating caller-owned data.
 */

import {
  MARKET_REGIMES,
  META_LEARNING_RUN_STATUSES,
  STRATEGY_LIFECYCLE_STATES,
  type AdaptiveStrategyWeight,
  type AdaptiveWeightLearningConstraints,
  type FeatureExtractionResult,
  type LearnedRegimeProfile,
  type MarketContextSnapshot,
  type MarketRegime,
  type MetaLearningActionPlan,
  type MetaLearningConfiguration,
  type MetaLearningRunRequest,
  type MetaLearningRunResult,
  type MetaLearningSafetyPolicy,
  type MetaLearningValidationIssue,
  type MetaLearningValidationResult,
  type MetaLearningValidatorPort,
  type PerformancePattern,
  type ReinforcementFeedbackResult,
  type StrategyDescriptor,
  type StrategyEvolutionConstraints,
  type StrategyEvolutionResult,
  type StrategyLearningDataset,
  type StrategyLearningResult,
  type StrategyPerformanceObservation,
  type StrategyPromotionPolicy,
  type StrategyPromotionResult,
  type StrategyRetirementPolicy,
  type StrategyRetirementResult,
  type StrategyRiskObservation,
  type StrategyFeatureVector,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-9;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const LEARNING_OBJECTIVES = new Set([
  "MAXIMIZE_RISK_ADJUSTED_RETURN",
  "MAXIMIZE_ABSOLUTE_RETURN",
  "MINIMIZE_DRAWDOWN",
  "MINIMIZE_TAIL_RISK",
  "MAXIMIZE_STABILITY",
  "MAXIMIZE_REGIME_ROBUSTNESS",
  "BALANCED",
]);

const META_LEARNING_DECISIONS = new Set([
  "APPLY",
  "HOLD",
  "DEFER",
  "REJECT",
]);

const EVOLUTION_ACTIONS = new Set([
  "NO_CHANGE",
  "REWEIGHT",
  "TUNE_PARAMETERS",
  "CLONE",
  "MUTATE",
  "CROSSOVER",
  "PROMOTE",
  "DEMOTE",
  "RETIRE",
  "ARCHIVE",
]);

const PROMOTION_DECISIONS = new Set([
  "PROMOTE",
  "KEEP_CURRENT",
  "DEFER",
  "REJECT",
]);

const RETIREMENT_DECISIONS = new Set([
  "RETIRE",
  "PLACE_ON_PROBATION",
  "KEEP_ACTIVE",
  "DEFER",
]);

const REINFORCEMENT_SIGNALS = new Set([
  "STRONGLY_POSITIVE",
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "STRONGLY_NEGATIVE",
]);

type IssueCollector = MetaLearningValidationIssue[];

export interface AiMetaLearningValidatorOptions {
  readonly maximumIssues?: number;
  readonly allowUnknownMetadataValues?: boolean;
}

export class AiMetaLearningValidationError extends Error {
  public readonly code: string;
  public readonly validation: MetaLearningValidationResult;

  public constructor(
    message: string,
    validation: MetaLearningValidationResult,
    code = "AI_META_LEARNING_VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "AiMetaLearningValidationError";
    this.code = code;
    this.validation = validation;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AiMetaLearningValidator implements MetaLearningValidatorPort {
  private readonly maximumIssues: number;
  private readonly allowUnknownMetadataValues: boolean;

  public constructor(options: AiMetaLearningValidatorOptions = {}) {
    this.maximumIssues =
      options.maximumIssues === undefined
        ? 500
        : Math.max(1, Math.trunc(options.maximumIssues));

    this.allowUnknownMetadataValues =
      options.allowUnknownMetadataValues ?? true;
  }

  public validateRequest(
    request: MetaLearningRunRequest,
  ): MetaLearningValidationResult {
    const issues: IssueCollector = [];

    this.validateRunRequest(request, "request", issues);

    return this.result(issues);
  }

  public validateResult(
    result: MetaLearningRunResult,
  ): MetaLearningValidationResult {
    const issues: IssueCollector = [];

    this.validateRunResult(result, "result", issues);

    return this.result(issues);
  }

  public assertValidRequest(request: MetaLearningRunRequest): void {
    const validation = this.validateRequest(request);

    if (!validation.valid) {
      throw new AiMetaLearningValidationError(
        "The AI meta-learning run request is invalid.",
        validation,
        "INVALID_META_LEARNING_RUN_REQUEST",
      );
    }
  }

  public assertValidResult(result: MetaLearningRunResult): void {
    const validation = this.validateResult(result);

    if (!validation.valid) {
      throw new AiMetaLearningValidationError(
        "The AI meta-learning run result is invalid.",
        validation,
        "INVALID_META_LEARNING_RUN_RESULT",
      );
    }
  }

  private validateRunRequest(
    request: MetaLearningRunRequest,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(request)) {
      this.error(issues, path, "TYPE_OBJECT", "Expected an object.", request);
      return;
    }

    this.nonEmptyString(request.requestId, `${path}.requestId`, issues);
    this.nonEmptyString(request.portfolioId, `${path}.portfolioId`, issues);
    this.timestamp(request.requestedAt, `${path}.requestedAt`, issues);
    this.marketRegime(request.activeRegime, `${path}.activeRegime`, issues);
    this.unitInterval(
      request.activeRegimeConfidence,
      `${path}.activeRegimeConfidence`,
      issues,
    );

    this.validateWeightRecord(
      request.currentStrategyWeights,
      `${path}.currentStrategyWeights`,
      issues,
    );

    this.array(
      request.previousReinforcementStates,
      `${path}.previousReinforcementStates`,
      issues,
      (value, index) => {
        const itemPath = `${path}.previousReinforcementStates[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a reinforcement state object.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);
        this.finiteNumber(
          value.cumulativeReward,
          `${itemPath}.cumulativeReward`,
          issues,
        );
        this.finiteNumber(
          value.exponentiallyWeightedReward,
          `${itemPath}.exponentiallyWeightedReward`,
          issues,
        );
        this.nonNegativeInteger(
          value.positiveFeedbackCount,
          `${itemPath}.positiveFeedbackCount`,
          issues,
        );
        this.nonNegativeInteger(
          value.negativeFeedbackCount,
          `${itemPath}.negativeFeedbackCount`,
          issues,
        );
        this.nonNegativeInteger(
          value.neutralFeedbackCount,
          `${itemPath}.neutralFeedbackCount`,
          issues,
        );
        this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
        this.timestamp(
          value.lastUpdatedAt,
          `${itemPath}.lastUpdatedAt`,
          issues,
        );
      },
    );

    this.validateDataset(request.dataset, `${path}.dataset`, issues);
    this.validateConfiguration(
      request.configuration,
      `${path}.configuration`,
      issues,
    );

    if (request.correlationId !== undefined) {
      this.nonEmptyString(
        request.correlationId,
        `${path}.correlationId`,
        issues,
      );
    }

    this.metadata(request.metadata, `${path}.metadata`, issues);

    this.validateUniqueIds(
      request.dataset.descriptors.map((item) => item.strategyId),
      `${path}.dataset.descriptors`,
      "strategyId",
      issues,
    );

    this.validateUniqueIds(
      request.previousReinforcementStates.map((item) => item.strategyId),
      `${path}.previousReinforcementStates`,
      "strategyId",
      issues,
    );

    const descriptorIds = new Set(
      request.dataset.descriptors.map((item) => item.strategyId),
    );

    for (const strategyId of Object.keys(request.currentStrategyWeights)) {
      if (!descriptorIds.has(strategyId)) {
        this.error(
          issues,
          `${path}.currentStrategyWeights.${strategyId}`,
          "UNKNOWN_STRATEGY_WEIGHT",
          `Weight references unknown strategy '${strategyId}'.`,
          request.currentStrategyWeights[strategyId],
        );
      }
    }

    for (const state of request.previousReinforcementStates) {
      if (!descriptorIds.has(state.strategyId)) {
        this.error(
          issues,
          `${path}.previousReinforcementStates`,
          "UNKNOWN_REINFORCEMENT_STRATEGY",
          `Reinforcement state references unknown strategy '${state.strategyId}'.`,
          state.strategyId,
        );
      }
    }

    const totalWeight = Object.values(request.currentStrategyWeights).reduce(
      (sum, weight) => sum + weight,
      0,
    );

    const expectedMaximum =
      1 - request.configuration.weightConstraints.reserveWeight;

    if (
      request.configuration.weightConstraints.normalizeToOne &&
      Math.abs(totalWeight - expectedMaximum) > 1e-6
    ) {
      this.warning(
        issues,
        `${path}.currentStrategyWeights`,
        "CURRENT_WEIGHT_TOTAL_MISMATCH",
        `Current strategy weights total ${totalWeight}, but the configured reserve implies ${expectedMaximum}.`,
        totalWeight,
      );
    }
  }

  private validateRunResult(
    result: MetaLearningRunResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(issues, path, "TYPE_OBJECT", "Expected an object.", result);
      return;
    }

    this.nonEmptyString(result.runId, `${path}.runId`, issues);
    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.nonEmptyString(result.portfolioId, `${path}.portfolioId`, issues);

    if (!META_LEARNING_RUN_STATUSES.includes(result.status)) {
      this.error(
        issues,
        `${path}.status`,
        "INVALID_RUN_STATUS",
        "Unsupported meta-learning run status.",
        result.status,
      );
    }

    if (!META_LEARNING_DECISIONS.has(result.decision)) {
      this.error(
        issues,
        `${path}.decision`,
        "INVALID_DECISION",
        "Unsupported meta-learning decision.",
        result.decision,
      );
    }

    this.timestamp(result.startedAt, `${path}.startedAt`, issues);
    this.timestamp(result.completedAt, `${path}.completedAt`, issues);
    this.validateChronology(
      result.startedAt,
      result.completedAt,
      `${path}.startedAt`,
      `${path}.completedAt`,
      issues,
    );

    if (result.status !== "COMPLETED") {
      this.error(
        issues,
        `${path}.status`,
        "NON_TERMINAL_SUCCESS_RESULT",
        "A successful run result must have status COMPLETED.",
        result.status,
      );
    }

    this.validateFeatureExtractionResult(
      result.featureExtraction,
      `${path}.featureExtraction`,
      issues,
    );
    this.validatePatternMiningResult(
      result.patternMining,
      `${path}.patternMining`,
      issues,
    );
    this.validateRegimeLearningResult(
      result.regimeLearning,
      `${path}.regimeLearning`,
      issues,
    );
    this.validateStrategyLearningResult(
      result.strategyLearning,
      `${path}.strategyLearning`,
      issues,
    );
    this.validateWeightLearningResult(
      result.weightLearning,
      `${path}.weightLearning`,
      issues,
    );
    this.validateFeedbackResult(
      result.reinforcementFeedback,
      `${path}.reinforcementFeedback`,
      issues,
    );
    this.validateEvolutionResult(
      result.strategyEvolution,
      `${path}.strategyEvolution`,
      issues,
    );
    this.validatePromotionResult(
      result.promotion,
      `${path}.promotion`,
      issues,
    );
    this.validateRetirementResult(
      result.retirement,
      `${path}.retirement`,
      issues,
    );

    this.validateExplainabilityResult(
      result.explainability,
      `${path}.explainability`,
      issues,
    );
    this.validateActionPlan(result.actionPlan, `${path}.actionPlan`, issues);

    if (!this.isRecord(result.validation)) {
      this.error(
        issues,
        `${path}.validation`,
        "TYPE_OBJECT",
        "Expected a validation result object.",
        result.validation,
      );
    } else {
      this.boolean(result.validation.valid, `${path}.validation.valid`, issues);
      this.array(
        result.validation.issues,
        `${path}.validation.issues`,
        issues,
        (value, index) => {
          const itemPath = `${path}.validation.issues[${index}]`;

          if (!this.isRecord(value)) {
            this.error(
              issues,
              itemPath,
              "TYPE_OBJECT",
              "Expected a validation issue object.",
              value,
            );
            return;
          }

          this.nonEmptyString(value.code, `${itemPath}.code`, issues);
          this.nonEmptyString(value.path, `${itemPath}.path`, issues);
          this.nonEmptyString(value.message, `${itemPath}.message`, issues);

          if (value.severity !== "ERROR" && value.severity !== "WARNING") {
            this.error(
              issues,
              `${itemPath}.severity`,
              "INVALID_SEVERITY",
              "Validation severity must be ERROR or WARNING.",
              value.severity,
            );
          }
        },
      );
    }

    this.stringArray(result.warnings, `${path}.warnings`, issues);
    this.metadata(result.metadata, `${path}.metadata`, issues);

    this.validateResultRequestLinkage(result, path, issues);
    this.validateResultStrategyConsistency(result, path, issues);
  }

  private validateDataset(
    dataset: StrategyLearningDataset,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(dataset)) {
      this.error(issues, path, "TYPE_OBJECT", "Expected a dataset object.", dataset);
      return;
    }

    this.nonEmptyString(dataset.datasetId, `${path}.datasetId`, issues);
    this.timestamp(dataset.generatedAt, `${path}.generatedAt`, issues);
    this.nonEmptyString(dataset.sourceVersion, `${path}.sourceVersion`, issues);

    if (dataset.checksum !== undefined) {
      this.nonEmptyString(dataset.checksum, `${path}.checksum`, issues);
    }

    this.array(dataset.descriptors, `${path}.descriptors`, issues, (value, index) =>
      this.validateDescriptor(value, `${path}.descriptors[${index}]`, issues),
    );

    this.array(
      dataset.performanceObservations,
      `${path}.performanceObservations`,
      issues,
      (value, index) =>
        this.validatePerformanceObservation(
          value,
          `${path}.performanceObservations[${index}]`,
          issues,
        ),
    );

    this.array(
      dataset.riskObservations,
      `${path}.riskObservations`,
      issues,
      (value, index) =>
        this.validateRiskObservation(
          value,
          `${path}.riskObservations[${index}]`,
          issues,
        ),
    );

    this.array(
      dataset.marketContexts,
      `${path}.marketContexts`,
      issues,
      (value, index) =>
        this.validateMarketContext(
          value,
          `${path}.marketContexts[${index}]`,
          issues,
        ),
    );

    if (dataset.descriptors.length === 0) {
      this.error(
        issues,
        `${path}.descriptors`,
        "EMPTY_STRATEGY_SET",
        "At least one strategy descriptor is required.",
        dataset.descriptors,
      );
    }

    const descriptorIds = new Set(
      dataset.descriptors.map((item) => item.strategyId),
    );

    for (const observation of dataset.performanceObservations) {
      if (!descriptorIds.has(observation.strategyId)) {
        this.error(
          issues,
          `${path}.performanceObservations`,
          "UNKNOWN_PERFORMANCE_STRATEGY",
          `Performance observation references unknown strategy '${observation.strategyId}'.`,
          observation.strategyId,
        );
      }
    }

    for (const observation of dataset.riskObservations) {
      if (!descriptorIds.has(observation.strategyId)) {
        this.error(
          issues,
          `${path}.riskObservations`,
          "UNKNOWN_RISK_STRATEGY",
          `Risk observation references unknown strategy '${observation.strategyId}'.`,
          observation.strategyId,
        );
      }
    }

    this.validateUniqueIds(
      dataset.performanceObservations.map((item) => item.observationId),
      `${path}.performanceObservations`,
      "observationId",
      issues,
    );

    this.validateUniqueIds(
      dataset.marketContexts.map((item) => item.snapshotId),
      `${path}.marketContexts`,
      "snapshotId",
      issues,
    );
  }

  private validateDescriptor(
    descriptor: StrategyDescriptor,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(descriptor)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy descriptor object.",
        descriptor,
      );
      return;
    }

    this.nonEmptyString(descriptor.strategyId, `${path}.strategyId`, issues);
    this.nonEmptyString(descriptor.name, `${path}.name`, issues);
    this.nonEmptyString(descriptor.version, `${path}.version`, issues);
    this.nonEmptyString(
      descriptor.strategyFamily,
      `${path}.strategyFamily`,
      issues,
    );

    if (!STRATEGY_LIFECYCLE_STATES.includes(descriptor.lifecycleState)) {
      this.error(
        issues,
        `${path}.lifecycleState`,
        "INVALID_LIFECYCLE_STATE",
        "Unsupported strategy lifecycle state.",
        descriptor.lifecycleState,
      );
    }

    this.stringArray(descriptor.symbols, `${path}.symbols`, issues, true);
    this.stringArray(descriptor.timeframes, `${path}.timeframes`, issues, true);
    this.stringArray(descriptor.tags, `${path}.tags`, issues);

    this.array(
      descriptor.supportedRegimes,
      `${path}.supportedRegimes`,
      issues,
      (value, index) =>
        this.marketRegime(
          value,
          `${path}.supportedRegimes[${index}]`,
          issues,
        ),
    );

    this.array(
      descriptor.parameters,
      `${path}.parameters`,
      issues,
      (value, index) => {
        const itemPath = `${path}.parameters[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a strategy parameter definition.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.key, `${itemPath}.key`, issues);

        if (
          value.valueType !== "NUMBER" &&
          value.valueType !== "INTEGER" &&
          value.valueType !== "BOOLEAN" &&
          value.valueType !== "CATEGORY"
        ) {
          this.error(
            issues,
            `${itemPath}.valueType`,
            "INVALID_PARAMETER_TYPE",
            "Unsupported strategy parameter value type.",
            value.valueType,
          );
        }

        this.boolean(value.mutable, `${itemPath}.mutable`, issues);

        const currentValueType = typeof value.currentValue;
        if (
          currentValueType !== "number" &&
          currentValueType !== "string" &&
          currentValueType !== "boolean"
        ) {
          this.error(
            issues,
            `${itemPath}.currentValue`,
            "INVALID_PARAMETER_VALUE",
            "Parameter value must be a number, string, or boolean.",
            value.currentValue,
          );
        }

        if (typeof value.currentValue === "number") {
          this.finiteNumber(
            value.currentValue,
            `${itemPath}.currentValue`,
            issues,
          );
        }

        if (value.numericRange !== undefined) {
          if (!this.isRecord(value.numericRange)) {
            this.error(
              issues,
              `${itemPath}.numericRange`,
              "TYPE_OBJECT",
              "Expected a numeric range object.",
              value.numericRange,
            );
          } else {
            this.finiteNumber(
              value.numericRange.minimum,
              `${itemPath}.numericRange.minimum`,
              issues,
            );
            this.finiteNumber(
              value.numericRange.maximum,
              `${itemPath}.numericRange.maximum`,
              issues,
            );

            if (value.numericRange.minimum > value.numericRange.maximum) {
              this.error(
                issues,
                `${itemPath}.numericRange`,
                "INVALID_NUMERIC_RANGE",
                "Parameter minimum cannot exceed maximum.",
                value.numericRange,
              );
            }

            if (
              typeof value.currentValue === "number" &&
              (value.currentValue < value.numericRange.minimum ||
                value.currentValue > value.numericRange.maximum)
            ) {
              this.error(
                issues,
                `${itemPath}.currentValue`,
                "PARAMETER_VALUE_OUT_OF_RANGE",
                "Current parameter value is outside its numeric range.",
                value.currentValue,
              );
            }
          }
        }

        if (value.allowedValues !== undefined) {
          this.array(
            value.allowedValues,
            `${itemPath}.allowedValues`,
            issues,
            (allowedValue, allowedIndex) => {
              const allowedType = typeof allowedValue;

              if (
                allowedType !== "number" &&
                allowedType !== "string" &&
                allowedType !== "boolean"
              ) {
                this.error(
                  issues,
                  `${itemPath}.allowedValues[${allowedIndex}]`,
                  "INVALID_ALLOWED_VALUE",
                  "Allowed value must be a number, string, or boolean.",
                  allowedValue,
                );
              }

              if (allowedType === "number") {
                this.finiteNumber(
                  allowedValue,
                  `${itemPath}.allowedValues[${allowedIndex}]`,
                  issues,
                );
              }
            },
          );

          if (!value.allowedValues.includes(value.currentValue)) {
            this.error(
              issues,
              `${itemPath}.currentValue`,
              "PARAMETER_VALUE_NOT_ALLOWED",
              "Current parameter value is absent from allowedValues.",
              value.currentValue,
            );
          }
        }

        if (value.learningRate !== undefined) {
          this.unitInterval(
            value.learningRate,
            `${itemPath}.learningRate`,
            issues,
          );
        }
      },
    );

    this.validateUniqueIds(
      descriptor.parameters.map((item) => item.key),
      `${path}.parameters`,
      "key",
      issues,
    );

    this.timestamp(descriptor.createdAt, `${path}.createdAt`, issues);
    this.timestamp(descriptor.updatedAt, `${path}.updatedAt`, issues);
    this.validateChronology(
      descriptor.createdAt,
      descriptor.updatedAt,
      `${path}.createdAt`,
      `${path}.updatedAt`,
      issues,
    );
  }

  private validatePerformanceObservation(
    observation: StrategyPerformanceObservation,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(observation)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a performance observation object.",
        observation,
      );
      return;
    }

    this.nonEmptyString(
      observation.observationId,
      `${path}.observationId`,
      issues,
    );
    this.nonEmptyString(observation.strategyId, `${path}.strategyId`, issues);

    if (observation.portfolioId !== undefined) {
      this.nonEmptyString(observation.portfolioId, `${path}.portfolioId`, issues);
    }
    if (observation.symbol !== undefined) {
      this.nonEmptyString(observation.symbol, `${path}.symbol`, issues);
    }
    if (observation.timeframe !== undefined) {
      this.nonEmptyString(observation.timeframe, `${path}.timeframe`, issues);
    }

    this.marketRegime(observation.regime, `${path}.regime`, issues);
    this.timestamp(observation.startedAt, `${path}.startedAt`, issues);
    this.timestamp(observation.endedAt, `${path}.endedAt`, issues);
    this.validateChronology(
      observation.startedAt,
      observation.endedAt,
      `${path}.startedAt`,
      `${path}.endedAt`,
      issues,
    );

    this.nonNegativeInteger(observation.sampleSize, `${path}.sampleSize`, issues);
    this.nonNegativeInteger(observation.trades, `${path}.trades`, issues);
    this.nonNegativeInteger(
      observation.winningTrades,
      `${path}.winningTrades`,
      issues,
    );
    this.nonNegativeInteger(
      observation.losingTrades,
      `${path}.losingTrades`,
      issues,
    );

    const finiteFields: readonly (keyof StrategyPerformanceObservation)[] = [
      "grossProfit",
      "grossLoss",
      "netProfit",
      "returnRate",
      "volatility",
      "maximumDrawdown",
      "averageDrawdown",
      "sharpeRatio",
      "sortinoRatio",
      "calmarRatio",
      "profitFactor",
      "winRate",
      "expectancy",
      "averageTradeReturn",
      "tailLoss",
      "valueAtRisk",
      "conditionalValueAtRisk",
      "turnover",
      "averageHoldingPeriodMs",
      "executionCost",
      "slippageCost",
    ];

    for (const field of finiteFields) {
      this.finiteNumber(observation[field], `${path}.${field}`, issues);
    }

    this.nonNegative(observation.volatility, `${path}.volatility`, issues);
    this.nonNegative(
      observation.maximumDrawdown,
      `${path}.maximumDrawdown`,
      issues,
    );
    this.nonNegative(
      observation.averageDrawdown,
      `${path}.averageDrawdown`,
      issues,
    );
    this.nonNegative(observation.turnover, `${path}.turnover`, issues);
    this.nonNegative(
      observation.averageHoldingPeriodMs,
      `${path}.averageHoldingPeriodMs`,
      issues,
    );
    this.nonNegative(
      observation.executionCost,
      `${path}.executionCost`,
      issues,
    );
    this.nonNegative(
      observation.slippageCost,
      `${path}.slippageCost`,
      issues,
    );
    this.unitInterval(observation.winRate, `${path}.winRate`, issues);

    if (
      observation.winningTrades + observation.losingTrades >
      observation.trades
    ) {
      this.error(
        issues,
        path,
        "TRADE_COUNTS_EXCEED_TOTAL",
        "Winning plus losing trades cannot exceed total trades.",
        {
          trades: observation.trades,
          winningTrades: observation.winningTrades,
          losingTrades: observation.losingTrades,
        },
      );
    }

    if (observation.trades > observation.sampleSize) {
      this.warning(
        issues,
        `${path}.trades`,
        "TRADES_EXCEED_SAMPLE_SIZE",
        "Trade count exceeds sample size.",
        observation.trades,
      );
    }

    if (
      observation.trades > 0 &&
      Math.abs(
        observation.winRate -
          observation.winningTrades / observation.trades,
      ) > 0.05
    ) {
      this.warning(
        issues,
        `${path}.winRate`,
        "WIN_RATE_INCONSISTENT",
        "Win rate materially differs from winningTrades / trades.",
        observation.winRate,
      );
    }

    this.metadata(observation.metadata, `${path}.metadata`, issues);
  }

  private validateRiskObservation(
    observation: StrategyRiskObservation,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(observation)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a risk observation object.",
        observation,
      );
      return;
    }

    this.nonEmptyString(observation.strategyId, `${path}.strategyId`, issues);
    this.timestamp(observation.timestamp, `${path}.timestamp`, issues);

    const unitFields: readonly (keyof StrategyRiskObservation)[] = [
      "riskScore",
      "concentrationRisk",
      "correlationRisk",
      "liquidityRisk",
      "leverageRisk",
      "volatilityRisk",
      "drawdownRisk",
      "tailRisk",
      "operationalRisk",
      "remainingRiskBudget",
    ];

    for (const field of unitFields) {
      this.unitInterval(observation[field], `${path}.${field}`, issues);
    }

    this.stringArray(
      observation.breachedLimits,
      `${path}.breachedLimits`,
      issues,
    );
  }

  private validateMarketContext(
    context: MarketContextSnapshot,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(context)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a market context object.",
        context,
      );
      return;
    }

    this.nonEmptyString(context.snapshotId, `${path}.snapshotId`, issues);
    this.timestamp(context.timestamp, `${path}.timestamp`, issues);
    this.nonEmptyString(context.symbol, `${path}.symbol`, issues);
    this.nonEmptyString(context.timeframe, `${path}.timeframe`, issues);
    this.marketRegime(context.regime, `${path}.regime`, issues);

    this.unitInterval(
      context.regimeConfidence,
      `${path}.regimeConfidence`,
      issues,
    );

    const finiteFields: readonly (keyof MarketContextSnapshot)[] = [
      "trendStrength",
      "realizedVolatility",
      "liquidityScore",
      "spreadRate",
      "marketDepthScore",
      "momentumScore",
      "meanReversionScore",
      "riskOnScore",
      "stressScore",
    ];

    for (const field of finiteFields) {
      this.finiteNumber(context[field], `${path}.${field}`, issues);
    }

    if (context.impliedVolatility !== undefined) {
      this.nonNegative(
        context.impliedVolatility,
        `${path}.impliedVolatility`,
        issues,
      );
    }

    this.nonNegative(
      context.realizedVolatility,
      `${path}.realizedVolatility`,
      issues,
    );
    this.nonNegative(context.spreadRate, `${path}.spreadRate`, issues);
    this.unitInterval(context.liquidityScore, `${path}.liquidityScore`, issues);
    this.unitInterval(
      context.marketDepthScore,
      `${path}.marketDepthScore`,
      issues,
    );
    this.unitInterval(context.riskOnScore, `${path}.riskOnScore`, issues);
    this.unitInterval(context.stressScore, `${path}.stressScore`, issues);
    this.numericRecord(context.features, `${path}.features`, issues);
  }

  private validateConfiguration(
    configuration: MetaLearningConfiguration,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(configuration)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a configuration object.",
        configuration,
      );
      return;
    }

    if (!LEARNING_OBJECTIVES.has(configuration.objective)) {
      this.error(
        issues,
        `${path}.objective`,
        "INVALID_LEARNING_OBJECTIVE",
        "Unsupported learning objective.",
        configuration.objective,
      );
    }

    this.positiveInteger(
      configuration.minimumObservationSampleSize,
      `${path}.minimumObservationSampleSize`,
      issues,
    );
    this.positiveInteger(
      configuration.maximumHistoricalObservations,
      `${path}.maximumHistoricalObservations`,
      issues,
    );
    this.boolean(
      configuration.featureNormalizationEnabled,
      `${path}.featureNormalizationEnabled`,
      issues,
    );
    this.unitInterval(
      configuration.patternMinimumSupport,
      `${path}.patternMinimumSupport`,
      issues,
    );
    this.unitInterval(
      configuration.patternMinimumConfidence,
      `${path}.patternMinimumConfidence`,
      issues,
    );
    this.positiveInteger(
      configuration.maximumPatterns,
      `${path}.maximumPatterns`,
      issues,
    );
    this.unitInterval(configuration.rewardDecay, `${path}.rewardDecay`, issues);
    this.finiteNumber(
      configuration.positiveRewardThreshold,
      `${path}.positiveRewardThreshold`,
      issues,
    );
    this.finiteNumber(
      configuration.negativeRewardThreshold,
      `${path}.negativeRewardThreshold`,
      issues,
    );

    if (
      configuration.negativeRewardThreshold >=
      configuration.positiveRewardThreshold
    ) {
      this.error(
        issues,
        path,
        "INVALID_REWARD_THRESHOLDS",
        "Negative reward threshold must be below positive reward threshold.",
        {
          negativeRewardThreshold: configuration.negativeRewardThreshold,
          positiveRewardThreshold: configuration.positiveRewardThreshold,
        },
      );
    }

    if (
      configuration.maximumHistoricalObservations <
      configuration.minimumObservationSampleSize
    ) {
      this.error(
        issues,
        `${path}.maximumHistoricalObservations`,
        "HISTORY_BELOW_MINIMUM_SAMPLE",
        "Maximum historical observations cannot be below the minimum sample size.",
        configuration.maximumHistoricalObservations,
      );
    }

    this.validateWeightConstraints(
      configuration.weightConstraints,
      `${path}.weightConstraints`,
      issues,
    );
    this.validateEvolutionConstraints(
      configuration.evolutionConstraints,
      `${path}.evolutionConstraints`,
      issues,
    );
    this.validatePromotionPolicy(
      configuration.promotionPolicy,
      `${path}.promotionPolicy`,
      issues,
    );
    this.validateRetirementPolicy(
      configuration.retirementPolicy,
      `${path}.retirementPolicy`,
      issues,
    );
    this.validateSafetyPolicy(
      configuration.safetyPolicy,
      `${path}.safetyPolicy`,
      issues,
    );
  }

  private validateWeightConstraints(
    constraints: AdaptiveWeightLearningConstraints,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(constraints)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected adaptive weight constraints.",
        constraints,
      );
      return;
    }

    this.unitInterval(
      constraints.minimumStrategyWeight,
      `${path}.minimumStrategyWeight`,
      issues,
    );
    this.unitInterval(
      constraints.maximumStrategyWeight,
      `${path}.maximumStrategyWeight`,
      issues,
    );
    this.unitInterval(
      constraints.maximumWeightChange,
      `${path}.maximumWeightChange`,
      issues,
    );
    this.unitInterval(
      constraints.maximumPortfolioTurnover,
      `${path}.maximumPortfolioTurnover`,
      issues,
    );
    this.unitInterval(constraints.reserveWeight, `${path}.reserveWeight`, issues);
    this.boolean(
      constraints.normalizeToOne,
      `${path}.normalizeToOne`,
      issues,
    );

    if (
      constraints.minimumStrategyWeight >
      constraints.maximumStrategyWeight
    ) {
      this.error(
        issues,
        path,
        "INVALID_WEIGHT_RANGE",
        "Minimum strategy weight cannot exceed maximum strategy weight.",
        constraints,
      );
    }

    if (
      constraints.maximumStrategyWeight >
      1 - constraints.reserveWeight + EPSILON
    ) {
      this.warning(
        issues,
        `${path}.maximumStrategyWeight`,
        "MAXIMUM_WEIGHT_EXCEEDS_ALLOCATABLE_CAPITAL",
        "Maximum strategy weight exceeds capital remaining after reserve.",
        constraints.maximumStrategyWeight,
      );
    }
  }

  private validateEvolutionConstraints(
    constraints: StrategyEvolutionConstraints,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(constraints)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected strategy evolution constraints.",
        constraints,
      );
      return;
    }

    this.boolean(constraints.allowCloning, `${path}.allowCloning`, issues);
    this.boolean(constraints.allowMutation, `${path}.allowMutation`, issues);
    this.boolean(constraints.allowCrossover, `${path}.allowCrossover`, issues);
    this.nonNegativeInteger(
      constraints.maximumCandidatesPerRun,
      `${path}.maximumCandidatesPerRun`,
      issues,
    );
    this.nonNegativeInteger(
      constraints.maximumMutationsPerCandidate,
      `${path}.maximumMutationsPerCandidate`,
      issues,
    );
    this.nonNegative(
      constraints.maximumExpectedRiskIncrease,
      `${path}.maximumExpectedRiskIncrease`,
      issues,
    );
    this.nonNegative(
      constraints.minimumExpectedImprovement,
      `${path}.minimumExpectedImprovement`,
      issues,
    );
    this.unitInterval(
      constraints.minimumConfidence,
      `${path}.minimumConfidence`,
      issues,
    );

    if (
      !constraints.allowCloning &&
      !constraints.allowMutation &&
      !constraints.allowCrossover &&
      constraints.maximumCandidatesPerRun > 0
    ) {
      this.warning(
        issues,
        path,
        "EVOLUTION_DISABLED_WITH_NONZERO_CAPACITY",
        "All evolution mechanisms are disabled while candidate capacity is non-zero.",
        constraints,
      );
    }
  }

  private validatePromotionPolicy(
    policy: StrategyPromotionPolicy,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(policy)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy promotion policy.",
        policy,
      );
      return;
    }

    this.unitInterval(
      policy.minimumPerformanceScore,
      `${path}.minimumPerformanceScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumStabilityScore,
      `${path}.minimumStabilityScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumRegimeRobustnessScore,
      `${path}.minimumRegimeRobustnessScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumSampleAdequacyScore,
      `${path}.minimumSampleAdequacyScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumConfidence,
      `${path}.minimumConfidence`,
      issues,
    );
    this.positiveInteger(
      policy.requiredConsecutiveSuccessfulRuns,
      `${path}.requiredConsecutiveSuccessfulRuns`,
      issues,
    );
  }

  private validateRetirementPolicy(
    policy: StrategyRetirementPolicy,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(policy)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy retirement policy.",
        policy,
      );
      return;
    }

    this.unitInterval(
      policy.minimumDegradationScore,
      `${path}.minimumDegradationScore`,
      issues,
    );
    this.nonNegative(
      policy.maximumAcceptableDrawdown,
      `${path}.maximumAcceptableDrawdown`,
      issues,
    );
    this.unitInterval(
      policy.maximumNegativeFeedbackScore,
      `${path}.maximumNegativeFeedbackScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumRegimeRelevanceScore,
      `${path}.minimumRegimeRelevanceScore`,
      issues,
    );
    this.unitInterval(
      policy.minimumConfidence,
      `${path}.minimumConfidence`,
      issues,
    );
    this.boolean(
      policy.probationBeforeRetirement,
      `${path}.probationBeforeRetirement`,
      issues,
    );
    this.positiveInteger(
      policy.requiredConsecutiveFailedRuns,
      `${path}.requiredConsecutiveFailedRuns`,
      issues,
    );
  }

  private validateSafetyPolicy(
    policy: MetaLearningSafetyPolicy,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(policy)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a meta-learning safety policy.",
        policy,
      );
      return;
    }

    this.boolean(policy.enabled, `${path}.enabled`, issues);
    this.boolean(policy.dryRun, `${path}.dryRun`, issues);
    this.boolean(
      policy.requireHumanApprovalForPromotion,
      `${path}.requireHumanApprovalForPromotion`,
      issues,
    );
    this.boolean(
      policy.requireHumanApprovalForRetirement,
      `${path}.requireHumanApprovalForRetirement`,
      issues,
    );
    this.boolean(
      policy.requireHumanApprovalForEvolution,
      `${path}.requireHumanApprovalForEvolution`,
      issues,
    );
    this.unitInterval(
      policy.minimumDecisionConfidence,
      `${path}.minimumDecisionConfidence`,
      issues,
    );
    this.nonNegativeInteger(
      policy.maximumStrategiesChangedPerRun,
      `${path}.maximumStrategiesChangedPerRun`,
      issues,
    );
    this.unitInterval(
      policy.maximumPortfolioTurnover,
      `${path}.maximumPortfolioTurnover`,
      issues,
    );
    this.nonNegative(
      policy.maximumAllowedRiskIncrease,
      `${path}.maximumAllowedRiskIncrease`,
      issues,
    );
    this.boolean(
      policy.rejectOnValidationWarning,
      `${path}.rejectOnValidationWarning`,
      issues,
    );
    this.boolean(
      policy.preserveAtLeastOneActiveStrategy,
      `${path}.preserveAtLeastOneActiveStrategy`,
      issues,
    );
  }

  private validateFeatureExtractionResult(
    result: FeatureExtractionResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a feature extraction result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.array(
      result.featureVectors,
      `${path}.featureVectors`,
      issues,
      (value, index) =>
        this.validateFeatureVector(
          value,
          `${path}.featureVectors[${index}]`,
          issues,
        ),
    );
    this.stringArray(
      result.rejectedObservationIds,
      `${path}.rejectedObservationIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);
  }

  private validateFeatureVector(
    vector: StrategyFeatureVector,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(vector)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy feature vector.",
        vector,
      );
      return;
    }

    this.nonEmptyString(
      vector.featureVectorId,
      `${path}.featureVectorId`,
      issues,
    );
    this.nonEmptyString(vector.strategyId, `${path}.strategyId`, issues);

    if (vector.observationId !== undefined) {
      this.nonEmptyString(
        vector.observationId,
        `${path}.observationId`,
        issues,
      );
    }

    this.marketRegime(vector.regime, `${path}.regime`, issues);
    this.timestamp(vector.generatedAt, `${path}.generatedAt`, issues);
    this.unitInterval(vector.qualityScore, `${path}.qualityScore`, issues);
    this.stringArray(
      vector.missingFeatureNames,
      `${path}.missingFeatureNames`,
      issues,
    );

    this.array(vector.features, `${path}.features`, issues, (value, index) => {
      const itemPath = `${path}.features[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected an extracted feature.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.name, `${itemPath}.name`, issues);
      this.nonEmptyString(value.source, `${itemPath}.source`, issues);

      if (
        value.valueType !== "NUMBER" &&
        value.valueType !== "BOOLEAN" &&
        value.valueType !== "CATEGORY" &&
        value.valueType !== "VECTOR"
      ) {
        this.error(
          issues,
          `${itemPath}.valueType`,
          "INVALID_FEATURE_VALUE_TYPE",
          "Unsupported feature value type.",
          value.valueType,
        );
      }

      if (value.numericValue !== undefined) {
        this.finiteNumber(
          value.numericValue,
          `${itemPath}.numericValue`,
          issues,
        );
      }
      if (value.booleanValue !== undefined) {
        this.boolean(value.booleanValue, `${itemPath}.booleanValue`, issues);
      }
      if (value.categoryValue !== undefined) {
        this.nonEmptyString(
          value.categoryValue,
          `${itemPath}.categoryValue`,
          issues,
        );
      }
      if (value.vectorValue !== undefined) {
        this.array(
          value.vectorValue,
          `${itemPath}.vectorValue`,
          issues,
          (entry, entryIndex) =>
            this.finiteNumber(
              entry,
              `${itemPath}.vectorValue[${entryIndex}]`,
              issues,
            ),
        );
      }
      if (value.normalizedValue !== undefined) {
        this.finiteNumber(
          value.normalizedValue,
          `${itemPath}.normalizedValue`,
          issues,
        );
      }
      if (value.importanceHint !== undefined) {
        this.unitInterval(
          value.importanceHint,
          `${itemPath}.importanceHint`,
          issues,
        );
      }
    });

    this.validateUniqueIds(
      vector.features.map((item) => item.name),
      `${path}.features`,
      "name",
      issues,
    );
  }

  private validatePatternMiningResult(
    result: { readonly requestId: string; readonly generatedAt: string; readonly patterns: readonly PerformancePattern[]; readonly rejectedPatternCount: number; readonly warnings: readonly string[] },
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a pattern mining result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.nonNegativeInteger(
      result.rejectedPatternCount,
      `${path}.rejectedPatternCount`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.patterns, `${path}.patterns`, issues, (value, index) => {
      const itemPath = `${path}.patterns[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a performance pattern.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.patternId, `${itemPath}.patternId`, issues);
      this.nonEmptyString(value.name, `${itemPath}.name`, issues);
      this.nonEmptyString(value.description, `${itemPath}.description`, issues);
      this.stringArray(value.strategyIds, `${itemPath}.strategyIds`, issues);
      this.array(value.regimes, `${itemPath}.regimes`, issues, (regime, i) =>
        this.marketRegime(regime, `${itemPath}.regimes[${i}]`, issues),
      );

      if (
        value.direction !== "POSITIVE" &&
        value.direction !== "NEGATIVE" &&
        value.direction !== "MIXED" &&
        value.direction !== "NEUTRAL"
      ) {
        this.error(
          issues,
          `${itemPath}.direction`,
          "INVALID_PATTERN_DIRECTION",
          "Unsupported pattern direction.",
          value.direction,
        );
      }

      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.unitInterval(value.support, `${itemPath}.support`, issues);
      this.nonNegativeInteger(
        value.sampleSize,
        `${itemPath}.sampleSize`,
        issues,
      );
      this.finiteNumber(
        value.expectedImpact,
        `${itemPath}.expectedImpact`,
        issues,
      );
      this.unitInterval(
        value.stabilityScore,
        `${itemPath}.stabilityScore`,
        issues,
      );
      this.rangeRecord(
        value.featureConditions,
        `${itemPath}.featureConditions`,
        issues,
      );
      this.stringArray(
        value.evidenceObservationIds,
        `${itemPath}.evidenceObservationIds`,
        issues,
      );
      this.timestamp(value.discoveredAt, `${itemPath}.discoveredAt`, issues);
    });
  }

  private validateRegimeLearningResult(
    result: { readonly requestId: string; readonly generatedAt: string; readonly profiles: readonly LearnedRegimeProfile[]; readonly unknownContextIds: readonly string[]; readonly warnings: readonly string[] },
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a market regime learning result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(
      result.unknownContextIds,
      `${path}.unknownContextIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.profiles, `${path}.profiles`, issues, (value, index) => {
      const itemPath = `${path}.profiles[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a learned regime profile.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.profileId, `${itemPath}.profileId`, issues);
      this.marketRegime(value.regime, `${itemPath}.regime`, issues);
      this.timestamp(value.generatedAt, `${itemPath}.generatedAt`, issues);
      this.stringArray(
        value.dominantFeatures,
        `${itemPath}.dominantFeatures`,
        issues,
      );
      this.stringArray(
        value.preferredStrategyIds,
        `${itemPath}.preferredStrategyIds`,
        issues,
      );
      this.stringArray(
        value.avoidedStrategyIds,
        `${itemPath}.avoidedStrategyIds`,
        issues,
      );
      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.unitInterval(
        value.stabilityScore,
        `${itemPath}.stabilityScore`,
        issues,
      );

      this.numericRecord(
        value.transitionProbabilities,
        `${itemPath}.transitionProbabilities`,
        issues,
        true,
      );

      this.array(
        value.strategyEvidence,
        `${itemPath}.strategyEvidence`,
        issues,
        (evidence, evidenceIndex) => {
          const evidencePath = `${itemPath}.strategyEvidence[${evidenceIndex}]`;

          if (!this.isRecord(evidence)) {
            this.error(
              issues,
              evidencePath,
              "TYPE_OBJECT",
              "Expected regime learning evidence.",
              evidence,
            );
            return;
          }

          this.nonEmptyString(
            evidence.strategyId,
            `${evidencePath}.strategyId`,
            issues,
          );
          this.marketRegime(
            evidence.regime,
            `${evidencePath}.regime`,
            issues,
          );
          this.finiteNumber(evidence.score, `${evidencePath}.score`, issues);
          this.unitInterval(
            evidence.confidence,
            `${evidencePath}.confidence`,
            issues,
          );
          this.nonNegativeInteger(
            evidence.sampleSize,
            `${evidencePath}.sampleSize`,
            issues,
          );
          this.stringArray(
            evidence.observationIds,
            `${evidencePath}.observationIds`,
            issues,
          );
        },
      );
    });
  }

  private validateStrategyLearningResult(
    result: StrategyLearningResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy learning result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(
      result.bestStrategyIds,
      `${path}.bestStrategyIds`,
      issues,
    );
    this.stringArray(
      result.underperformingStrategyIds,
      `${path}.underperformingStrategyIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.scores, `${path}.scores`, issues, (value, index) => {
      const itemPath = `${path}.scores[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a strategy learning score.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);

      if (!LEARNING_OBJECTIVES.has(value.objective)) {
        this.error(
          issues,
          `${itemPath}.objective`,
          "INVALID_LEARNING_OBJECTIVE",
          "Unsupported learning objective.",
          value.objective,
        );
      }

      this.finiteNumber(value.rawScore, `${itemPath}.rawScore`, issues);
      this.unitInterval(
        value.normalizedScore,
        `${itemPath}.normalizedScore`,
        issues,
      );
      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.unitInterval(
        value.stabilityScore,
        `${itemPath}.stabilityScore`,
        issues,
      );
      this.unitInterval(
        value.regimeRobustnessScore,
        `${itemPath}.regimeRobustnessScore`,
        issues,
      );
      this.unitInterval(
        value.riskAdjustedScore,
        `${itemPath}.riskAdjustedScore`,
        issues,
      );
      this.nonNegative(
        value.drawdownPenalty,
        `${itemPath}.drawdownPenalty`,
        issues,
      );
      this.nonNegative(
        value.tailRiskPenalty,
        `${itemPath}.tailRiskPenalty`,
        issues,
      );
      this.nonNegative(
        value.executionCostPenalty,
        `${itemPath}.executionCostPenalty`,
        issues,
      );
      this.nonNegative(
        value.sampleSizePenalty,
        `${itemPath}.sampleSizePenalty`,
        issues,
      );
      this.stringArray(value.reasons, `${itemPath}.reasons`, issues);
    });
  }

  private validateWeightLearningResult(
    result: {
      readonly requestId: string;
      readonly generatedAt: string;
      readonly weights: readonly AdaptiveStrategyWeight[];
      readonly reserveWeight: number;
      readonly totalAllocatedWeight: number;
      readonly expectedTurnover: number;
      readonly confidence: number;
      readonly warnings: readonly string[];
    },
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected an adaptive weight learning result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.unitInterval(result.reserveWeight, `${path}.reserveWeight`, issues);
    this.unitInterval(
      result.totalAllocatedWeight,
      `${path}.totalAllocatedWeight`,
      issues,
    );
    this.nonNegative(
      result.expectedTurnover,
      `${path}.expectedTurnover`,
      issues,
    );
    this.unitInterval(result.confidence, `${path}.confidence`, issues);
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.weights, `${path}.weights`, issues, (value, index) => {
      const itemPath = `${path}.weights[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected an adaptive strategy weight.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);
      this.unitInterval(
        value.previousWeight,
        `${itemPath}.previousWeight`,
        issues,
      );
      this.unitInterval(
        value.proposedWeight,
        `${itemPath}.proposedWeight`,
        issues,
      );
      this.unitInterval(value.boundedWeight, `${itemPath}.boundedWeight`, issues);
      this.finiteNumber(value.delta, `${itemPath}.delta`, issues);
      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.stringArray(value.reasons, `${itemPath}.reasons`, issues);

      if (
        Math.abs(
          value.delta - (value.boundedWeight - value.previousWeight),
        ) > 1e-6
      ) {
        this.warning(
          issues,
          `${itemPath}.delta`,
          "WEIGHT_DELTA_INCONSISTENT",
          "Weight delta differs from boundedWeight - previousWeight.",
          value.delta,
        );
      }
    });

    const weightTotal = result.weights.reduce(
      (sum, item) => sum + item.boundedWeight,
      0,
    );

    if (Math.abs(weightTotal - result.totalAllocatedWeight) > 1e-6) {
      this.error(
        issues,
        `${path}.totalAllocatedWeight`,
        "ALLOCATED_WEIGHT_TOTAL_INCONSISTENT",
        "totalAllocatedWeight does not equal the sum of bounded weights.",
        result.totalAllocatedWeight,
      );
    }

    if (
      Math.abs(
        result.totalAllocatedWeight + result.reserveWeight - 1,
      ) > 1e-6
    ) {
      this.warning(
        issues,
        path,
        "PORTFOLIO_WEIGHT_TOTAL_NOT_ONE",
        "Allocated weight plus reserve weight does not equal one.",
        {
          allocated: result.totalAllocatedWeight,
          reserve: result.reserveWeight,
        },
      );
    }
  }

  private validateFeedbackResult(
    result: ReinforcementFeedbackResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a reinforcement feedback result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.events, `${path}.events`, issues, (value, index) => {
      const itemPath = `${path}.events[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a reinforcement event.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.eventId, `${itemPath}.eventId`, issues);
      this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);
      this.timestamp(value.timestamp, `${itemPath}.timestamp`, issues);

      if (!REINFORCEMENT_SIGNALS.has(value.signal)) {
        this.error(
          issues,
          `${itemPath}.signal`,
          "INVALID_REINFORCEMENT_SIGNAL",
          "Unsupported reinforcement signal.",
          value.signal,
        );
      }

      this.finiteNumber(value.reward, `${itemPath}.reward`, issues);
      this.finiteNumber(value.rawOutcome, `${itemPath}.rawOutcome`, issues);
      this.finiteNumber(
        value.expectedOutcome,
        `${itemPath}.expectedOutcome`,
        issues,
      );
      this.finiteNumber(
        value.predictionError,
        `${itemPath}.predictionError`,
        issues,
      );
      this.marketRegime(value.regime, `${itemPath}.regime`, issues);
      this.nonEmptyString(value.source, `${itemPath}.source`, issues);
      this.nonEmptyString(
        value.explanation,
        `${itemPath}.explanation`,
        issues,
      );
      this.metadata(value.metadata, `${itemPath}.metadata`, issues);

      if (value.observationId !== undefined) {
        this.nonEmptyString(
          value.observationId,
          `${itemPath}.observationId`,
          issues,
        );
      }

      if (
        Math.abs(
          value.predictionError -
            (value.rawOutcome - value.expectedOutcome),
        ) > 1e-6
      ) {
        this.warning(
          issues,
          `${itemPath}.predictionError`,
          "PREDICTION_ERROR_INCONSISTENT",
          "Prediction error differs from rawOutcome - expectedOutcome.",
          value.predictionError,
        );
      }
    });

    this.array(result.states, `${path}.states`, issues, (value, index) => {
      const itemPath = `${path}.states[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a reinforcement state.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);
      this.finiteNumber(
        value.cumulativeReward,
        `${itemPath}.cumulativeReward`,
        issues,
      );
      this.finiteNumber(
        value.exponentiallyWeightedReward,
        `${itemPath}.exponentiallyWeightedReward`,
        issues,
      );
      this.nonNegativeInteger(
        value.positiveFeedbackCount,
        `${itemPath}.positiveFeedbackCount`,
        issues,
      );
      this.nonNegativeInteger(
        value.negativeFeedbackCount,
        `${itemPath}.negativeFeedbackCount`,
        issues,
      );
      this.nonNegativeInteger(
        value.neutralFeedbackCount,
        `${itemPath}.neutralFeedbackCount`,
        issues,
      );
      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.timestamp(
        value.lastUpdatedAt,
        `${itemPath}.lastUpdatedAt`,
        issues,
      );
    });
  }

  private validateEvolutionResult(
    result: StrategyEvolutionResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy evolution result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(
      result.unchangedStrategyIds,
      `${path}.unchangedStrategyIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(result.candidates, `${path}.candidates`, issues, (value, index) => {
      const itemPath = `${path}.candidates[${index}]`;

      if (!this.isRecord(value)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a strategy evolution candidate.",
          value,
        );
        return;
      }

      this.nonEmptyString(value.candidateId, `${itemPath}.candidateId`, issues);
      this.stringArray(
        value.parentStrategyIds,
        `${itemPath}.parentStrategyIds`,
        issues,
        true,
      );
      this.nonEmptyString(
        value.proposedStrategyId,
        `${itemPath}.proposedStrategyId`,
        issues,
      );

      if (!EVOLUTION_ACTIONS.has(value.action)) {
        this.error(
          issues,
          `${itemPath}.action`,
          "INVALID_EVOLUTION_ACTION",
          "Unsupported strategy evolution action.",
          value.action,
        );
      }

      this.finiteNumber(
        value.expectedImprovement,
        `${itemPath}.expectedImprovement`,
        issues,
      );
      this.finiteNumber(
        value.expectedRiskChange,
        `${itemPath}.expectedRiskChange`,
        issues,
      );
      this.unitInterval(value.noveltyScore, `${itemPath}.noveltyScore`, issues);
      this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
      this.stringArray(
        value.requiredValidationStages,
        `${itemPath}.requiredValidationStages`,
        issues,
      );
      this.stringArray(value.reasons, `${itemPath}.reasons`, issues);

      this.array(
        value.parameterMutations,
        `${itemPath}.parameterMutations`,
        issues,
        (mutation, mutationIndex) => {
          const mutationPath = `${itemPath}.parameterMutations[${mutationIndex}]`;

          if (!this.isRecord(mutation)) {
            this.error(
              issues,
              mutationPath,
              "TYPE_OBJECT",
              "Expected a parameter mutation.",
              mutation,
            );
            return;
          }

          this.nonEmptyString(mutation.key, `${mutationPath}.key`, issues);
          this.unitInterval(
            mutation.confidence,
            `${mutationPath}.confidence`,
            issues,
          );
          this.nonEmptyString(
            mutation.reason,
            `${mutationPath}.reason`,
            issues,
          );
        },
      );
    });
  }

  private validatePromotionResult(
    result: StrategyPromotionResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy promotion result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(
      result.promotedStrategyIds,
      `${path}.promotedStrategyIds`,
      issues,
    );
    this.stringArray(
      result.deferredStrategyIds,
      `${path}.deferredStrategyIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(
      result.assessments,
      `${path}.assessments`,
      issues,
      (value, index) => {
        const itemPath = `${path}.assessments[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a promotion assessment.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.currentState)) {
          this.error(
            issues,
            `${itemPath}.currentState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported current lifecycle state.",
            value.currentState,
          );
        }

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.proposedState)) {
          this.error(
            issues,
            `${itemPath}.proposedState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported proposed lifecycle state.",
            value.proposedState,
          );
        }

        if (!PROMOTION_DECISIONS.has(value.decision)) {
          this.error(
            issues,
            `${itemPath}.decision`,
            "INVALID_PROMOTION_DECISION",
            "Unsupported strategy promotion decision.",
            value.decision,
          );
        }

        this.unitInterval(
          value.performanceScore,
          `${itemPath}.performanceScore`,
          issues,
        );
        this.unitInterval(
          value.stabilityScore,
          `${itemPath}.stabilityScore`,
          issues,
        );
        this.unitInterval(
          value.regimeRobustnessScore,
          `${itemPath}.regimeRobustnessScore`,
          issues,
        );
        this.unitInterval(
          value.sampleAdequacyScore,
          `${itemPath}.sampleAdequacyScore`,
          issues,
        );
        this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
        this.stringArray(value.reasons, `${itemPath}.reasons`, issues);
      },
    );
  }

  private validateRetirementResult(
    result: StrategyRetirementResult,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy retirement result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.stringArray(
      result.retiredStrategyIds,
      `${path}.retiredStrategyIds`,
      issues,
    );
    this.stringArray(
      result.probationStrategyIds,
      `${path}.probationStrategyIds`,
      issues,
    );
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(
      result.assessments,
      `${path}.assessments`,
      issues,
      (value, index) => {
        const itemPath = `${path}.assessments[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a retirement assessment.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.currentState)) {
          this.error(
            issues,
            `${itemPath}.currentState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported current lifecycle state.",
            value.currentState,
          );
        }

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.proposedState)) {
          this.error(
            issues,
            `${itemPath}.proposedState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported proposed lifecycle state.",
            value.proposedState,
          );
        }

        if (!RETIREMENT_DECISIONS.has(value.decision)) {
          this.error(
            issues,
            `${itemPath}.decision`,
            "INVALID_RETIREMENT_DECISION",
            "Unsupported strategy retirement decision.",
            value.decision,
          );
        }

        this.unitInterval(
          value.degradationScore,
          `${itemPath}.degradationScore`,
          issues,
        );
        this.nonNegative(
          value.drawdownSeverity,
          `${itemPath}.drawdownSeverity`,
          issues,
        );
        this.unitInterval(
          value.negativeFeedbackScore,
          `${itemPath}.negativeFeedbackScore`,
          issues,
        );
        this.unitInterval(
          value.regimeObsolescenceScore,
          `${itemPath}.regimeObsolescenceScore`,
          issues,
        );
        this.unitInterval(value.confidence, `${itemPath}.confidence`, issues);
        this.stringArray(value.reasons, `${itemPath}.reasons`, issues);
      },
    );
  }

  private validateExplainabilityResult(
    result: MetaLearningRunResult["explainability"],
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(result)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a meta-learning explainability result.",
        result,
      );
      return;
    }

    this.nonEmptyString(result.requestId, `${path}.requestId`, issues);
    this.timestamp(result.generatedAt, `${path}.generatedAt`, issues);
    this.nonEmptyString(
      result.executiveSummary,
      `${path}.executiveSummary`,
      issues,
    );
    this.stringArray(result.portfolioRisks, `${path}.portfolioRisks`, issues);
    this.stringArray(
      result.appliedSafeguards,
      `${path}.appliedSafeguards`,
      issues,
    );
    this.unitInterval(result.confidence, `${path}.confidence`, issues);
    this.stringArray(result.warnings, `${path}.warnings`, issues);

    this.array(
      result.strategyExplanations,
      `${path}.strategyExplanations`,
      issues,
      (value, index) => {
        const itemPath = `${path}.strategyExplanations[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a strategy explanation.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);
        this.nonEmptyString(value.summary, `${itemPath}.summary`, issues);

        if (!META_LEARNING_DECISIONS.has(value.decision)) {
          this.error(
            issues,
            `${itemPath}.decision`,
            "INVALID_DECISION",
            "Unsupported explanation decision.",
            value.decision,
          );
        }

        if (!EVOLUTION_ACTIONS.has(value.evolutionAction)) {
          this.error(
            issues,
            `${itemPath}.evolutionAction`,
            "INVALID_EVOLUTION_ACTION",
            "Unsupported explanation evolution action.",
            value.evolutionAction,
          );
        }

        if (value.previousWeight !== undefined) {
          this.unitInterval(
            value.previousWeight,
            `${itemPath}.previousWeight`,
            issues,
          );
        }
        if (value.proposedWeight !== undefined) {
          this.unitInterval(
            value.proposedWeight,
            `${itemPath}.proposedWeight`,
            issues,
          );
        }

        this.stringArray(value.risks, `${itemPath}.risks`, issues);
        this.stringArray(value.safeguards, `${itemPath}.safeguards`, issues);

        this.array(value.factors, `${itemPath}.factors`, issues, (factor, i) => {
          const factorPath = `${itemPath}.factors[${i}]`;

          if (!this.isRecord(factor)) {
            this.error(
              issues,
              factorPath,
              "TYPE_OBJECT",
              "Expected an explanation factor.",
              factor,
            );
            return;
          }

          this.nonEmptyString(factor.factor, `${factorPath}.factor`, issues);
          this.unitInterval(
            factor.importance,
            `${factorPath}.importance`,
            issues,
          );
          this.finiteNumber(
            factor.contribution,
            `${factorPath}.contribution`,
            issues,
          );
          this.stringArray(factor.evidence, `${factorPath}.evidence`, issues);
        });
      },
    );
  }

  private validateActionPlan(
    plan: MetaLearningActionPlan,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(plan)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a meta-learning action plan.",
        plan,
      );
      return;
    }

    if (!META_LEARNING_DECISIONS.has(plan.decision)) {
      this.error(
        issues,
        `${path}.decision`,
        "INVALID_DECISION",
        "Unsupported action-plan decision.",
        plan.decision,
      );
    }

    this.timestamp(plan.generatedAt, `${path}.generatedAt`, issues);
    this.validateWeightRecord(
      plan.proposedWeights,
      `${path}.proposedWeights`,
      issues,
    );
    this.stringArray(plan.blockedActions, `${path}.blockedActions`, issues);
    this.stringArray(
      plan.requiredApprovals,
      `${path}.requiredApprovals`,
      issues,
    );
    this.nonNegative(
      plan.expectedPortfolioTurnover,
      `${path}.expectedPortfolioTurnover`,
      issues,
    );
    this.finiteNumber(
      plan.expectedRiskChange,
      `${path}.expectedRiskChange`,
      issues,
    );
    this.unitInterval(plan.confidence, `${path}.confidence`, issues);

    this.array(
      plan.lifecycleChanges,
      `${path}.lifecycleChanges`,
      issues,
      (value, index) => {
        const itemPath = `${path}.lifecycleChanges[${index}]`;

        if (!this.isRecord(value)) {
          this.error(
            issues,
            itemPath,
            "TYPE_OBJECT",
            "Expected a lifecycle change.",
            value,
          );
          return;
        }

        this.nonEmptyString(value.strategyId, `${itemPath}.strategyId`, issues);

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.previousState)) {
          this.error(
            issues,
            `${itemPath}.previousState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported previous lifecycle state.",
            value.previousState,
          );
        }

        if (!STRATEGY_LIFECYCLE_STATES.includes(value.proposedState)) {
          this.error(
            issues,
            `${itemPath}.proposedState`,
            "INVALID_LIFECYCLE_STATE",
            "Unsupported proposed lifecycle state.",
            value.proposedState,
          );
        }

        if (!EVOLUTION_ACTIONS.has(value.action)) {
          this.error(
            issues,
            `${itemPath}.action`,
            "INVALID_EVOLUTION_ACTION",
            "Unsupported lifecycle evolution action.",
            value.action,
          );
        }

        this.boolean(
          value.requiresApproval,
          `${itemPath}.requiresApproval`,
          issues,
        );
        this.nonEmptyString(value.reason, `${itemPath}.reason`, issues);
      },
    );

    this.array(
      plan.evolutionCandidates,
      `${path}.evolutionCandidates`,
      issues,
      () => undefined,
    );
  }

  private validateResultRequestLinkage(
    result: MetaLearningRunResult,
    path: string,
    issues: IssueCollector,
  ): void {
    const linkedResults: readonly {
      readonly name: string;
      readonly requestId: string;
    }[] = [
      { name: "featureExtraction", requestId: result.featureExtraction.requestId },
      { name: "patternMining", requestId: result.patternMining.requestId },
      { name: "regimeLearning", requestId: result.regimeLearning.requestId },
      { name: "strategyLearning", requestId: result.strategyLearning.requestId },
      { name: "weightLearning", requestId: result.weightLearning.requestId },
      {
        name: "reinforcementFeedback",
        requestId: result.reinforcementFeedback.requestId,
      },
      { name: "strategyEvolution", requestId: result.strategyEvolution.requestId },
      { name: "promotion", requestId: result.promotion.requestId },
      { name: "retirement", requestId: result.retirement.requestId },
      { name: "explainability", requestId: result.explainability.requestId },
    ];

    for (const linked of linkedResults) {
      if (linked.requestId !== result.requestId) {
        this.warning(
          issues,
          `${path}.${linked.name}.requestId`,
          "REQUEST_ID_LINKAGE_MISMATCH",
          `${linked.name}.requestId differs from the run requestId.`,
          linked.requestId,
        );
      }
    }
  }

  private validateResultStrategyConsistency(
    result: MetaLearningRunResult,
    path: string,
    issues: IssueCollector,
  ): void {
    const scoreIds = new Set(
      result.strategyLearning.scores.map((item) => item.strategyId),
    );
    const weightIds = new Set(
      result.weightLearning.weights.map((item) => item.strategyId),
    );

    for (const strategyId of weightIds) {
      if (!scoreIds.has(strategyId)) {
        this.warning(
          issues,
          `${path}.weightLearning.weights`,
          "WEIGHT_WITHOUT_LEARNING_SCORE",
          `Weight exists for strategy '${strategyId}' without a learning score.`,
          strategyId,
        );
      }
    }

    for (const strategyId of Object.keys(result.actionPlan.proposedWeights)) {
      if (!weightIds.has(strategyId)) {
        this.warning(
          issues,
          `${path}.actionPlan.proposedWeights.${strategyId}`,
          "ACTION_WEIGHT_WITHOUT_LEARNED_WEIGHT",
          `Action-plan weight exists for strategy '${strategyId}' without a learned weight.`,
          result.actionPlan.proposedWeights[strategyId],
        );
      }
    }

    if (
      result.actionPlan.decision === "APPLY" &&
      result.actionPlan.confidence <= 0
    ) {
      this.error(
        issues,
        `${path}.actionPlan.confidence`,
        "APPLY_WITH_ZERO_CONFIDENCE",
        "An APPLY action plan must have positive confidence.",
        result.actionPlan.confidence,
      );
    }
  }

  private validateWeightRecord(
    value: Readonly<Record<string, number>>,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(value)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a strategy weight record.",
        value,
      );
      return;
    }

    for (const [strategyId, weight] of Object.entries(value)) {
      if (strategyId.trim().length === 0) {
        this.error(
          issues,
          path,
          "EMPTY_STRATEGY_ID",
          "Strategy weight keys cannot be empty.",
          strategyId,
        );
      }

      this.unitInterval(weight, `${path}.${strategyId}`, issues);
    }
  }

  private validateUniqueIds(
    ids: readonly string[],
    path: string,
    field: string,
    issues: IssueCollector,
  ): void {
    const seen = new Set<string>();

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];

      if (seen.has(id)) {
        this.error(
          issues,
          `${path}[${index}].${field}`,
          "DUPLICATE_IDENTIFIER",
          `Duplicate ${field} '${id}'.`,
          id,
        );
      }

      seen.add(id);
    }
  }

  private timestamp(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      this.error(
        issues,
        path,
        "INVALID_TIMESTAMP",
        "Expected a non-empty ISO-8601 timestamp.",
        value,
      );
      return;
    }

    if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      this.error(
        issues,
        path,
        "INVALID_TIMESTAMP",
        "Timestamp must be an ISO-8601 UTC string.",
        value,
      );
    }
  }

  private validateChronology(
    start: string,
    end: string,
    startPath: string,
    endPath: string,
    issues: IssueCollector,
  ): void {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);

    if (
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      endTime < startTime
    ) {
      this.error(
        issues,
        endPath,
        "INVALID_CHRONOLOGY",
        `${endPath} cannot occur before ${startPath}.`,
        end,
      );
    }
  }

  private marketRegime(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!MARKET_REGIMES.includes(value as MarketRegime)) {
      this.error(
        issues,
        path,
        "INVALID_MARKET_REGIME",
        "Unsupported market regime.",
        value,
      );
    }
  }

  private stringArray(
    value: unknown,
    path: string,
    issues: IssueCollector,
    requireNonEmpty = false,
  ): void {
    this.array(value, path, issues, (entry, index) =>
      this.nonEmptyString(entry, `${path}[${index}]`, issues),
    );

    if (
      requireNonEmpty &&
      Array.isArray(value) &&
      value.length === 0
    ) {
      this.error(
        issues,
        path,
        "EMPTY_ARRAY",
        "Expected at least one entry.",
        value,
      );
    }
  }

  private array(
    value: unknown,
    path: string,
    issues: IssueCollector,
    validateEntry: (entry: any, index: number) => void,
  ): void {
    if (!Array.isArray(value)) {
      this.error(
        issues,
        path,
        "TYPE_ARRAY",
        "Expected an array.",
        value,
      );
      return;
    }

    for (let index = 0; index < value.length; index += 1) {
      validateEntry(value[index], index);

      if (this.issueLimitReached(issues)) {
        return;
      }
    }
  }

  private numericRecord(
    value: unknown,
    path: string,
    issues: IssueCollector,
    unitIntervalOnly = false,
  ): void {
    if (!this.isRecord(value)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a numeric record.",
        value,
      );
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      if (unitIntervalOnly) {
        this.unitInterval(entry, `${path}.${key}`, issues);
      } else {
        this.finiteNumber(entry, `${path}.${key}`, issues);
      }
    }
  }

  private rangeRecord(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(value)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a numeric-range record.",
        value,
      );
      return;
    }

    for (const [key, range] of Object.entries(value)) {
      const itemPath = `${path}.${key}`;

      if (!this.isRecord(range)) {
        this.error(
          issues,
          itemPath,
          "TYPE_OBJECT",
          "Expected a numeric range.",
          range,
        );
        continue;
      }

      this.finiteNumber(range.minimum, `${itemPath}.minimum`, issues);
      this.finiteNumber(range.maximum, `${itemPath}.maximum`, issues);

      if (
        typeof range.minimum === "number" &&
        typeof range.maximum === "number" &&
        range.minimum > range.maximum
      ) {
        this.error(
          issues,
          itemPath,
          "INVALID_NUMERIC_RANGE",
          "Range minimum cannot exceed maximum.",
          range,
        );
      }
    }
  }

  private metadata(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (!this.isRecord(value)) {
      this.error(
        issues,
        path,
        "TYPE_OBJECT",
        "Expected a metadata record.",
        value,
      );
      return;
    }

    if (!this.allowUnknownMetadataValues) {
      for (const [key, entry] of Object.entries(value)) {
        if (
          entry !== null &&
          typeof entry !== "string" &&
          typeof entry !== "number" &&
          typeof entry !== "boolean"
        ) {
          this.warning(
            issues,
            `${path}.${key}`,
            "COMPLEX_METADATA_VALUE",
            "Complex metadata values are disabled by validator options.",
            entry,
          );
        }
      }
    }
  }

  private nonEmptyString(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      this.error(
        issues,
        path,
        "NON_EMPTY_STRING_REQUIRED",
        "Expected a non-empty string.",
        value,
      );
    }
  }

  private boolean(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (typeof value !== "boolean") {
      this.error(
        issues,
        path,
        "BOOLEAN_REQUIRED",
        "Expected a boolean value.",
        value,
      );
    }
  }

  private finiteNumber(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.error(
        issues,
        path,
        "FINITE_NUMBER_REQUIRED",
        "Expected a finite number.",
        value,
      );
    }
  }

  private nonNegative(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    this.finiteNumber(value, path, issues);

    if (typeof value === "number" && Number.isFinite(value) && value < 0) {
      this.error(
        issues,
        path,
        "NON_NEGATIVE_NUMBER_REQUIRED",
        "Expected a non-negative number.",
        value,
      );
    }
  }

  private nonNegativeInteger(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      this.error(
        issues,
        path,
        "NON_NEGATIVE_INTEGER_REQUIRED",
        "Expected a non-negative integer.",
        value,
      );
    }
  }

  private positiveInteger(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      this.error(
        issues,
        path,
        "POSITIVE_INTEGER_REQUIRED",
        "Expected a positive integer.",
        value,
      );
    }
  }

  private unitInterval(
    value: unknown,
    path: string,
    issues: IssueCollector,
  ): void {
    this.finiteNumber(value, path, issues);

    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (value < 0 || value > 1)
    ) {
      this.error(
        issues,
        path,
        "UNIT_INTERVAL_REQUIRED",
        "Expected a number between 0 and 1 inclusive.",
        value,
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private result(
    issues: IssueCollector,
  ): MetaLearningValidationResult {
    const frozenIssues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );

    return Object.freeze({
      valid: !frozenIssues.some((issue) => issue.severity === "ERROR"),
      issues: frozenIssues,
    });
  }

  private error(
    issues: IssueCollector,
    path: string,
    code: string,
    message: string,
    receivedValue?: unknown,
  ): void {
    this.addIssue(
      issues,
      Object.freeze({
        code,
        path,
        message,
        severity: "ERROR",
        ...(receivedValue === undefined ? {} : { receivedValue }),
      }),
    );
  }

  private warning(
    issues: IssueCollector,
    path: string,
    code: string,
    message: string,
    receivedValue?: unknown,
  ): void {
    this.addIssue(
      issues,
      Object.freeze({
        code,
        path,
        message,
        severity: "WARNING",
        ...(receivedValue === undefined ? {} : { receivedValue }),
      }),
    );
  }

  private addIssue(
    issues: IssueCollector,
    issue: MetaLearningValidationIssue,
  ): void {
    if (!this.issueLimitReached(issues)) {
      issues.push(issue);
    }
  }

  private issueLimitReached(issues: IssueCollector): boolean {
    return issues.length >= this.maximumIssues;
  }
}

export function createAiMetaLearningValidator(
  options: AiMetaLearningValidatorOptions = {},
): AiMetaLearningValidator {
  return new AiMetaLearningValidator(options);
}

export function validateMetaLearningRunRequest(
  request: MetaLearningRunRequest,
  options: AiMetaLearningValidatorOptions = {},
): MetaLearningValidationResult {
  return createAiMetaLearningValidator(options).validateRequest(request);
}

export function validateMetaLearningRunResult(
  result: MetaLearningRunResult,
  options: AiMetaLearningValidatorOptions = {},
): MetaLearningValidationResult {
  return createAiMetaLearningValidator(options).validateResult(result);
}

export function assertValidMetaLearningRunRequest(
  request: MetaLearningRunRequest,
  options: AiMetaLearningValidatorOptions = {},
): void {
  createAiMetaLearningValidator(options).assertValidRequest(request);
}

export function assertValidMetaLearningRunResult(
  result: MetaLearningRunResult,
  options: AiMetaLearningValidatorOptions = {},
): void {
  createAiMetaLearningValidator(options).assertValidResult(result);
}