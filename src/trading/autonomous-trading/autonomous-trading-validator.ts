/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 2: Deterministic autonomous trading contract validator.
 *
 * Responsibilities:
 * - validate autonomous strategy configuration and runtime state
 * - validate lifecycle commands and transitions
 * - validate signals, arbitration, consensus, allocation, and risk contracts
 * - validate adaptive position sizing and order intents
 * - validate recovery, monitoring, learning, explainability, and snapshots
 * - return immutable, structured validation results
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousAuditRecord,
  type AutonomousCapitalAllocationDecision,
  type AutonomousCapitalAllocationRequest,
  type AutonomousConsensusDecision,
  type AutonomousConsensusParticipant,
  type AutonomousConsensusRequest,
  type AutonomousDecisionExplanation,
  type AutonomousDecisionFactor,
  type AutonomousLearningEvent,
  type AutonomousOrderIntent,
  type AutonomousOrchestrationRequest,
  type AutonomousOrchestrationResult,
  type AutonomousPerformanceAlert,
  type AutonomousPerformanceMonitoringSnapshot,
  type AutonomousPortfolioSnapshot,
  type AutonomousPositionSizingConstraints,
  type AutonomousPositionSizingDecision,
  type AutonomousPositionSizingRequest,
  type AutonomousRecoveryDecision,
  type AutonomousRecoveryPolicy,
  type AutonomousRecoveryRequest,
  type AutonomousRiskContext,
  type AutonomousSignalArbitrationDecision,
  type AutonomousSignalArbitrationRequest,
  type AutonomousSignalArbitrationWeights,
  type AutonomousSignalCandidate,
  type AutonomousStrategyAllocation,
  type AutonomousStrategyCapitalPolicy,
  type AutonomousStrategyConfiguration,
  type AutonomousStrategyIdentity,
  type AutonomousStrategyLifecycleCommand,
  type AutonomousStrategyLifecycleTransition,
  type AutonomousStrategyPerformanceSnapshot,
  type AutonomousStrategyRiskLimits,
  type AutonomousStrategyRuntimeState,
  type AutonomousStrategySchedule,
  type AutonomousStrategyUniverse,
  type AutonomousTradeApprovalDecision,
  type AutonomousTradeApprovalRequest,
  type AutonomousTradingEngineMetrics,
  type AutonomousTradingEngineSnapshot,
  type AutonomousTradingInstrument,
  type AutonomousTradingMetadata,
  type AutonomousTradingSignal,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";

export type AutonomousTradingValidationSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR";

export interface AutonomousTradingValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: AutonomousTradingValidationSeverity;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousTradingValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AutonomousTradingValidationIssue[];
}

export interface AutonomousTradingValidatorOptions {
  readonly rejectUnknownMetadataValues?: boolean;
  readonly requireNormalizedSymbols?: boolean;
  readonly maximumMetadataEntries?: number;
  readonly maximumStringLength?: number;
  readonly maximumCollectionLength?: number;
}

interface ResolvedAutonomousTradingValidatorOptions {
  readonly rejectUnknownMetadataValues: boolean;
  readonly requireNormalizedSymbols: boolean;
  readonly maximumMetadataEntries: number;
  readonly maximumStringLength: number;
  readonly maximumCollectionLength: number;
}

type MutableIssue = {
  path: string;
  code: string;
  message: string;
  severity: AutonomousTradingValidationSeverity;
  metadata: AutonomousTradingMetadata;
};

const DEFAULT_OPTIONS: Readonly<ResolvedAutonomousTradingValidatorOptions> =
  Object.freeze({
    rejectUnknownMetadataValues: true,
    requireNormalizedSymbols: true,
    maximumMetadataEntries: 256,
    maximumStringLength: 16_384,
    maximumCollectionLength: 10_000,
  });

const DAY_MINUTES = 24 * 60;
const DAYS_PER_WEEK = 7;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isProbability(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isTimestamp(value: unknown): value is AutonomousTradingTimestamp {
  return isNonNegativeFiniteNumber(value);
}

function freezeIssue(issue: MutableIssue): AutonomousTradingValidationIssue {
  return Object.freeze({
    path: issue.path,
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    metadata: issue.metadata,
  });
}

function freezeResult(
  issues: readonly MutableIssue[],
): AutonomousTradingValidationResult {
  const immutableIssues = Object.freeze(issues.map(freezeIssue));
  return Object.freeze({
    valid: !immutableIssues.some((issue) => issue.severity === "ERROR"),
    issues: immutableIssues,
  });
}

export class AutonomousTradingValidationError extends Error {
  public readonly issues: readonly AutonomousTradingValidationIssue[];

  public constructor(
    message: string,
    issues: readonly AutonomousTradingValidationIssue[],
  ) {
    super(message);
    this.name = "AutonomousTradingValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class AutonomousTradingContractValidator {
  private readonly options: ResolvedAutonomousTradingValidatorOptions;

  public constructor(options: AutonomousTradingValidatorOptions = {}) {
    const maximumMetadataEntries =
      options.maximumMetadataEntries ?? DEFAULT_OPTIONS.maximumMetadataEntries;
    const maximumStringLength =
      options.maximumStringLength ?? DEFAULT_OPTIONS.maximumStringLength;
    const maximumCollectionLength =
      options.maximumCollectionLength ?? DEFAULT_OPTIONS.maximumCollectionLength;

    if (!isPositiveInteger(maximumMetadataEntries)) {
      throw new RangeError("maximumMetadataEntries must be a positive integer.");
    }
    if (!isPositiveInteger(maximumStringLength)) {
      throw new RangeError("maximumStringLength must be a positive integer.");
    }
    if (!isPositiveInteger(maximumCollectionLength)) {
      throw new RangeError("maximumCollectionLength must be a positive integer.");
    }

    this.options = Object.freeze({
      rejectUnknownMetadataValues:
        options.rejectUnknownMetadataValues ??
        DEFAULT_OPTIONS.rejectUnknownMetadataValues,
      requireNormalizedSymbols:
        options.requireNormalizedSymbols ??
        DEFAULT_OPTIONS.requireNormalizedSymbols,
      maximumMetadataEntries,
      maximumStringLength,
      maximumCollectionLength,
    });
  }

  public assertValid(
    result: AutonomousTradingValidationResult,
    message = "Autonomous trading contract validation failed.",
  ): void {
    if (!result.valid) {
      throw new AutonomousTradingValidationError(message, result.issues);
    }
  }

  public validateInstrument(
    value: AutonomousTradingInstrument,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateInstrumentInto(value, "instrument", issues);
    return freezeResult(issues);
  }

  public validateStrategyConfiguration(
    value: AutonomousStrategyConfiguration,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateStrategyConfigurationInto(value, "strategy", issues);
    return freezeResult(issues);
  }

  public validateStrategyRuntimeState(
    value: AutonomousStrategyRuntimeState,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateRuntimeStateInto(value, "runtimeState", issues);
    return freezeResult(issues);
  }

  public validateLifecycleCommand(
    value: AutonomousStrategyLifecycleCommand,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateLifecycleCommandInto(value, "command", issues);
    return freezeResult(issues);
  }

  public validateLifecycleTransition(
    value: AutonomousStrategyLifecycleTransition,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateLifecycleTransitionInto(value, "transition", issues);
    return freezeResult(issues);
  }

  public validateTradingSignal(
    value: AutonomousTradingSignal,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateTradingSignalInto(value, "signal", issues);
    return freezeResult(issues);
  }

  public validateSignalArbitrationRequest(
    value: AutonomousSignalArbitrationRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateSignalArbitrationRequestInto(
      value,
      "arbitrationRequest",
      issues,
    );
    return freezeResult(issues);
  }

  public validateSignalArbitrationDecision(
    value: AutonomousSignalArbitrationDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateSignalArbitrationDecisionInto(
      value,
      "arbitrationDecision",
      issues,
    );
    return freezeResult(issues);
  }

  public validateConsensusRequest(
    value: AutonomousConsensusRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateConsensusRequestInto(value, "consensusRequest", issues);
    return freezeResult(issues);
  }

  public validateConsensusDecision(
    value: AutonomousConsensusDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateConsensusDecisionInto(value, "consensusDecision", issues);
    return freezeResult(issues);
  }

  public validatePortfolioSnapshot(
    value: AutonomousPortfolioSnapshot,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validatePortfolioSnapshotInto(value, "portfolio", issues);
    return freezeResult(issues);
  }

  public validateCapitalAllocationRequest(
    value: AutonomousCapitalAllocationRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateCapitalAllocationRequestInto(
      value,
      "allocationRequest",
      issues,
    );
    return freezeResult(issues);
  }

  public validateCapitalAllocationDecision(
    value: AutonomousCapitalAllocationDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateCapitalAllocationDecisionInto(
      value,
      "allocationDecision",
      issues,
    );
    return freezeResult(issues);
  }

  public validateTradeApprovalRequest(
    value: AutonomousTradeApprovalRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateTradeApprovalRequestInto(value, "approvalRequest", issues);
    return freezeResult(issues);
  }

  public validateTradeApprovalDecision(
    value: AutonomousTradeApprovalDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateTradeApprovalDecisionInto(value, "approvalDecision", issues);
    return freezeResult(issues);
  }

  public validatePositionSizingRequest(
    value: AutonomousPositionSizingRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validatePositionSizingRequestInto(value, "sizingRequest", issues);
    return freezeResult(issues);
  }

  public validatePositionSizingDecision(
    value: AutonomousPositionSizingDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validatePositionSizingDecisionInto(value, "sizingDecision", issues);
    return freezeResult(issues);
  }

  public validateOrderIntent(
    value: AutonomousOrderIntent,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateOrderIntentInto(value, "orderIntent", issues);
    return freezeResult(issues);
  }

  public validateOrchestrationRequest(
    value: AutonomousOrchestrationRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateOrchestrationRequestInto(value, "orchestrationRequest", issues);
    return freezeResult(issues);
  }

  public validateOrchestrationResult(
    value: AutonomousOrchestrationResult,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateOrchestrationResultInto(value, "orchestrationResult", issues);
    return freezeResult(issues);
  }

  public validateRecoveryRequest(
    value: AutonomousRecoveryRequest,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateRecoveryRequestInto(value, "recoveryRequest", issues);
    return freezeResult(issues);
  }

  public validateRecoveryDecision(
    value: AutonomousRecoveryDecision,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateRecoveryDecisionInto(value, "recoveryDecision", issues);
    return freezeResult(issues);
  }

  public validatePerformanceMonitoringSnapshot(
    value: AutonomousPerformanceMonitoringSnapshot,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validatePerformanceMonitoringSnapshotInto(
      value,
      "performanceSnapshot",
      issues,
    );
    return freezeResult(issues);
  }

  public validateLearningEvent(
    value: AutonomousLearningEvent,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateLearningEventInto(value, "learningEvent", issues);
    return freezeResult(issues);
  }

  public validateDecisionExplanation(
    value: AutonomousDecisionExplanation,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateDecisionExplanationInto(value, "explanation", issues);
    return freezeResult(issues);
  }

  public validateAuditRecord(
    value: AutonomousAuditRecord,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateAuditRecordInto(value, "auditRecord", issues);
    return freezeResult(issues);
  }

  public validateEngineSnapshot(
    value: AutonomousTradingEngineSnapshot,
  ): AutonomousTradingValidationResult {
    const issues: MutableIssue[] = [];
    this.validateEngineSnapshotInto(value, "engineSnapshot", issues);
    return freezeResult(issues);
  }

  private addIssue(
    issues: MutableIssue[],
    path: string,
    code: string,
    message: string,
    severity: AutonomousTradingValidationSeverity = "ERROR",
  ): void {
    issues.push({
      path,
      code,
      message,
      severity,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });
  }

  private validateNonEmptyString(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      this.addIssue(
        issues,
        path,
        "REQUIRED_STRING",
        `${path} must be a non-empty string.`,
      );
      return;
    }

    if (value.length > this.options.maximumStringLength) {
      this.addIssue(
        issues,
        path,
        "STRING_TOO_LONG",
        `${path} exceeds the maximum allowed length.`,
      );
    }
  }

  private validateOptionalString(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (value !== undefined) {
      this.validateNonEmptyString(value, path, issues);
    }
  }

  private validateTimestamp(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isTimestamp(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_TIMESTAMP",
        `${path} must be a non-negative finite timestamp.`,
      );
    }
  }

  private validateOptionalTimestamp(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (value !== undefined) {
      this.validateTimestamp(value, path, issues);
    }
  }

  private validateNumber(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isFiniteNumber(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_NUMBER",
        `${path} must be a finite number.`,
      );
    }
  }

  private validateNonNegativeNumber(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isNonNegativeFiniteNumber(value)) {
      this.addIssue(
        issues,
        path,
        "NEGATIVE_OR_INVALID_NUMBER",
        `${path} must be a non-negative finite number.`,
      );
    }
  }

  private validatePositiveNumber(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isPositiveFiniteNumber(value)) {
      this.addIssue(
        issues,
        path,
        "NON_POSITIVE_NUMBER",
        `${path} must be a positive finite number.`,
      );
    }
  }

  private validateProbability(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isProbability(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_PROBABILITY",
        `${path} must be between 0 and 1 inclusive.`,
      );
    }
  }

  private validateNonNegativeInteger(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isNonNegativeInteger(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_NON_NEGATIVE_INTEGER",
        `${path} must be a non-negative integer.`,
      );
    }
  }

  private validatePositiveInteger(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isPositiveInteger(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_POSITIVE_INTEGER",
        `${path} must be a positive integer.`,
      );
    }
  }

  private validateBoolean(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (typeof value !== "boolean") {
      this.addIssue(
        issues,
        path,
        "INVALID_BOOLEAN",
        `${path} must be a boolean.`,
      );
    }
  }

  private validateStringArray(
    value: unknown,
    path: string,
    issues: MutableIssue[],
    allowEmpty = true,
  ): void {
    if (!Array.isArray(value)) {
      this.addIssue(issues, path, "INVALID_ARRAY", `${path} must be an array.`);
      return;
    }

    if (!allowEmpty && value.length === 0) {
      this.addIssue(
        issues,
        path,
        "EMPTY_ARRAY",
        `${path} must contain at least one value.`,
      );
    }

    if (value.length > this.options.maximumCollectionLength) {
      this.addIssue(
        issues,
        path,
        "ARRAY_TOO_LARGE",
        `${path} exceeds the maximum collection length.`,
      );
    }

    const seen = new Set<string>();
    value.forEach((entry, index) => {
      this.validateNonEmptyString(entry, `${path}[${index}]`, issues);
      if (typeof entry === "string") {
        if (seen.has(entry)) {
          this.addIssue(
            issues,
            `${path}[${index}]`,
            "DUPLICATE_VALUE",
            `${path} contains duplicate value "${entry}".`,
            "WARNING",
          );
        }
        seen.add(entry);
      }
    });
  }

  private validateMetadata(
    value: unknown,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isRecord(value)) {
      this.addIssue(
        issues,
        path,
        "INVALID_METADATA",
        `${path} must be a metadata object.`,
      );
      return;
    }

    const entries = Object.entries(value);
    if (entries.length > this.options.maximumMetadataEntries) {
      this.addIssue(
        issues,
        path,
        "METADATA_TOO_LARGE",
        `${path} exceeds the maximum metadata entry count.`,
      );
    }

    for (const [key, metadataValue] of entries) {
      const valuePath = `${path}.${key}`;
      if (key.trim().length === 0) {
        this.addIssue(
          issues,
          valuePath,
          "EMPTY_METADATA_KEY",
          "Metadata keys must be non-empty.",
        );
      }

      const primitive =
        metadataValue === null ||
        typeof metadataValue === "string" ||
        typeof metadataValue === "boolean" ||
        isFiniteNumber(metadataValue);

      const primitiveArray =
        Array.isArray(metadataValue) &&
        metadataValue.length <= this.options.maximumCollectionLength &&
        metadataValue.every(
          (entry) =>
            entry === null ||
            typeof entry === "string" ||
            typeof entry === "boolean" ||
            isFiniteNumber(entry),
        );

      if (
        this.options.rejectUnknownMetadataValues &&
        !primitive &&
        !primitiveArray
      ) {
        this.addIssue(
          issues,
          valuePath,
          "UNSUPPORTED_METADATA_VALUE",
          `${valuePath} contains an unsupported metadata value.`,
        );
      }
    }
  }

  private validateInstrumentInto(
    value: AutonomousTradingInstrument,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!isRecord(value)) {
      this.addIssue(issues, path, "INVALID_INSTRUMENT", `${path} is invalid.`);
      return;
    }

    this.validateNonEmptyString(value.exchangeId, `${path}.exchangeId`, issues);
    this.validateNonEmptyString(value.symbol, `${path}.symbol`, issues);
    this.validateNonEmptyString(
      value.normalizedSymbol,
      `${path}.normalizedSymbol`,
      issues,
    );
    this.validateNonEmptyString(value.baseAsset, `${path}.baseAsset`, issues);
    this.validateNonEmptyString(value.quoteAsset, `${path}.quoteAsset`, issues);
    this.validateOptionalString(
      value.settlementAsset,
      `${path}.settlementAsset`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      this.options.requireNormalizedSymbols &&
      typeof value.normalizedSymbol === "string" &&
      value.normalizedSymbol !== value.normalizedSymbol.toUpperCase()
    ) {
      this.addIssue(
        issues,
        `${path}.normalizedSymbol`,
        "NON_CANONICAL_SYMBOL",
        "normalizedSymbol should use canonical uppercase formatting.",
        "WARNING",
      );
    }

    if (
      typeof value.baseAsset === "string" &&
      typeof value.quoteAsset === "string" &&
      value.baseAsset === value.quoteAsset
    ) {
      this.addIssue(
        issues,
        path,
        "IDENTICAL_BASE_AND_QUOTE",
        "baseAsset and quoteAsset must differ.",
      );
    }
  }

  private validateIdentityInto(
    value: AutonomousStrategyIdentity,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(
      value.strategyVersion,
      `${path}.strategyVersion`,
      issues,
    );
    this.validateNonEmptyString(
      value.displayName,
      `${path}.displayName`,
      issues,
    );
    this.validateOptionalString(value.description, `${path}.description`, issues);
    this.validateOptionalString(value.ownerId, `${path}.ownerId`, issues);
    this.validateStringArray(value.tags, `${path}.tags`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateScheduleInto(
    value: AutonomousStrategySchedule,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateBoolean(value.enabled, `${path}.enabled`, issues);
    this.validateOptionalTimestamp(value.startAt, `${path}.startAt`, issues);
    this.validateOptionalTimestamp(value.stopAt, `${path}.stopAt`, issues);
    this.validateNonNegativeNumber(value.cooldownMs, `${path}.cooldownMs`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.maximumRuntimeMs !== undefined) {
      this.validatePositiveNumber(
        value.maximumRuntimeMs,
        `${path}.maximumRuntimeMs`,
        issues,
      );
    }

    if (
      isTimestamp(value.startAt) &&
      isTimestamp(value.stopAt) &&
      value.startAt > value.stopAt
    ) {
      this.addIssue(
        issues,
        `${path}.stopAt`,
        "INVALID_SCHEDULE_RANGE",
        "stopAt cannot precede startAt.",
      );
    }

    if (value.activeDaysOfWeek !== undefined) {
      if (!Array.isArray(value.activeDaysOfWeek)) {
        this.addIssue(
          issues,
          `${path}.activeDaysOfWeek`,
          "INVALID_ARRAY",
          "activeDaysOfWeek must be an array.",
        );
      } else {
        const seen = new Set<number>();
        value.activeDaysOfWeek.forEach((day, index) => {
          if (!isInteger(day) || day < 0 || day >= DAYS_PER_WEEK) {
            this.addIssue(
              issues,
              `${path}.activeDaysOfWeek[${index}]`,
              "INVALID_DAY_OF_WEEK",
              "Day of week must be an integer from 0 through 6.",
            );
          }
          if (seen.has(day)) {
            this.addIssue(
              issues,
              `${path}.activeDaysOfWeek[${index}]`,
              "DUPLICATE_DAY",
              "activeDaysOfWeek contains a duplicate day.",
              "WARNING",
            );
          }
          seen.add(day);
        });
      }
    }

    const startMinute = value.activeStartMinuteUtc;
    const endMinute = value.activeEndMinuteUtc;
    if (
      startMinute !== undefined &&
      (!isInteger(startMinute) || startMinute < 0 || startMinute >= DAY_MINUTES)
    ) {
      this.addIssue(
        issues,
        `${path}.activeStartMinuteUtc`,
        "INVALID_MINUTE_OF_DAY",
        "activeStartMinuteUtc must be between 0 and 1439.",
      );
    }
    if (
      endMinute !== undefined &&
      (!isInteger(endMinute) || endMinute < 0 || endMinute >= DAY_MINUTES)
    ) {
      this.addIssue(
        issues,
        `${path}.activeEndMinuteUtc`,
        "INVALID_MINUTE_OF_DAY",
        "activeEndMinuteUtc must be between 0 and 1439.",
      );
    }
  }

  private validateUniverseInto(
    value: AutonomousStrategyUniverse,
    path: string,
    issues: MutableIssue[],
  ): void {
    if (!Array.isArray(value.instruments) || value.instruments.length === 0) {
      this.addIssue(
        issues,
        `${path}.instruments`,
        "EMPTY_INSTRUMENT_UNIVERSE",
        "At least one instrument is required.",
      );
    } else {
      value.instruments.forEach((instrument, index) =>
        this.validateInstrumentInto(
          instrument,
          `${path}.instruments[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.timeframes) || value.timeframes.length === 0) {
      this.addIssue(
        issues,
        `${path}.timeframes`,
        "EMPTY_TIMEFRAME_UNIVERSE",
        "At least one timeframe is required.",
      );
    }

    if (value.includeExchanges !== undefined) {
      this.validateStringArray(
        value.includeExchanges,
        `${path}.includeExchanges`,
        issues,
      );
    }
    if (value.excludeExchanges !== undefined) {
      this.validateStringArray(
        value.excludeExchanges,
        `${path}.excludeExchanges`,
        issues,
      );
    }
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateRiskLimitsInto(
    value: AutonomousStrategyRiskLimits,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonNegativeNumber(
      value.maximumGrossExposure,
      `${path}.maximumGrossExposure`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumNetExposure,
      `${path}.maximumNetExposure`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumPositionNotional,
      `${path}.maximumPositionNotional`,
      issues,
    );
    this.validateNonNegativeInteger(
      value.maximumOpenPositions,
      `${path}.maximumOpenPositions`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumDailyLoss,
      `${path}.maximumDailyLoss`,
      issues,
    );
    this.validateProbability(
      value.maximumDrawdown,
      `${path}.maximumDrawdown`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumLeverage,
      `${path}.maximumLeverage`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumOrderNotional,
      `${path}.maximumOrderNotional`,
      issues,
    );
    this.validateProbability(
      value.minimumLiquidityScore,
      `${path}.minimumLiquidityScore`,
      issues,
    );
    this.validateProbability(
      value.minimumSignalConfidence,
      `${path}.minimumSignalConfidence`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumSignalAgeMs,
      `${path}.maximumSignalAgeMs`,
      issues,
    );
    this.validateNonNegativeInteger(
      value.maximumConsecutiveLosses,
      `${path}.maximumConsecutiveLosses`,
      issues,
    );
    this.validateBoolean(
      value.stopTradingOnBreach,
      `${path}.stopTradingOnBreach`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      isNonNegativeFiniteNumber(value.maximumNetExposure) &&
      isNonNegativeFiniteNumber(value.maximumGrossExposure) &&
      value.maximumNetExposure > value.maximumGrossExposure
    ) {
      this.addIssue(
        issues,
        `${path}.maximumNetExposure`,
        "NET_EXPOSURE_EXCEEDS_GROSS",
        "maximumNetExposure cannot exceed maximumGrossExposure.",
      );
    }
  }

  private validateCapitalPolicyInto(
    value: AutonomousStrategyCapitalPolicy,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonNegativeNumber(
      value.minimumCapital,
      `${path}.minimumCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumCapital,
      `${path}.maximumCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.targetCapital,
      `${path}.targetCapital`,
      issues,
    );
    this.validateProbability(
      value.minimumAllocationWeight,
      `${path}.minimumAllocationWeight`,
      issues,
    );
    this.validateProbability(
      value.maximumAllocationWeight,
      `${path}.maximumAllocationWeight`,
      issues,
    );
    this.validateProbability(
      value.rebalanceThreshold,
      `${path}.rebalanceThreshold`,
      issues,
    );
    this.validateProbability(value.reserveRatio, `${path}.reserveRatio`, issues);
    this.validateBoolean(
      value.allowBorrowedCapital,
      `${path}.allowBorrowedCapital`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      isNonNegativeFiniteNumber(value.minimumCapital) &&
      isNonNegativeFiniteNumber(value.maximumCapital) &&
      value.minimumCapital > value.maximumCapital
    ) {
      this.addIssue(
        issues,
        `${path}.minimumCapital`,
        "MINIMUM_EXCEEDS_MAXIMUM",
        "minimumCapital cannot exceed maximumCapital.",
      );
    }

    if (
      isNonNegativeFiniteNumber(value.targetCapital) &&
      isNonNegativeFiniteNumber(value.minimumCapital) &&
      isNonNegativeFiniteNumber(value.maximumCapital) &&
      (value.targetCapital < value.minimumCapital ||
        value.targetCapital > value.maximumCapital)
    ) {
      this.addIssue(
        issues,
        `${path}.targetCapital`,
        "TARGET_OUTSIDE_CAPITAL_RANGE",
        "targetCapital must fall within the configured capital range.",
      );
    }

    if (
      isProbability(value.minimumAllocationWeight) &&
      isProbability(value.maximumAllocationWeight) &&
      value.minimumAllocationWeight > value.maximumAllocationWeight
    ) {
      this.addIssue(
        issues,
        `${path}.minimumAllocationWeight`,
        "MINIMUM_WEIGHT_EXCEEDS_MAXIMUM",
        "minimumAllocationWeight cannot exceed maximumAllocationWeight.",
      );
    }
  }

  private validateStrategyConfigurationInto(
    value: AutonomousStrategyConfiguration,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateIdentityInto(value.identity, `${path}.identity`, issues);
    this.validateUniverseInto(value.universe, `${path}.universe`, issues);
    this.validateScheduleInto(value.schedule, `${path}.schedule`, issues);
    this.validateRiskLimitsInto(value.riskLimits, `${path}.riskLimits`, issues);
    this.validateCapitalPolicyInto(
      value.capitalPolicy,
      `${path}.capitalPolicy`,
      issues,
    );
    this.validateBoolean(value.enabled, `${path}.enabled`, issues);
    this.validateTimestamp(value.createdAt, `${path}.createdAt`, issues);
    this.validateTimestamp(value.updatedAt, `${path}.updatedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      isTimestamp(value.createdAt) &&
      isTimestamp(value.updatedAt) &&
      value.updatedAt < value.createdAt
    ) {
      this.addIssue(
        issues,
        `${path}.updatedAt`,
        "UPDATED_BEFORE_CREATED",
        "updatedAt cannot precede createdAt.",
      );
    }
  }

  private validateRuntimeStateInto(
    value: AutonomousStrategyRuntimeState,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(
      value.strategyVersion,
      `${path}.strategyVersion`,
      issues,
    );
    this.validateOptionalTimestamp(value.startedAt, `${path}.startedAt`, issues);
    this.validateOptionalTimestamp(value.stoppedAt, `${path}.stoppedAt`, issues);
    this.validateOptionalTimestamp(
      value.lastHeartbeatAt,
      `${path}.lastHeartbeatAt`,
      issues,
    );
    this.validateOptionalTimestamp(
      value.lastDecisionAt,
      `${path}.lastDecisionAt`,
      issues,
    );
    this.validateOptionalTimestamp(
      value.lastSignalAt,
      `${path}.lastSignalAt`,
      issues,
    );
    this.validateNonNegativeInteger(
      value.consecutiveFailureCount,
      `${path}.consecutiveFailureCount`,
      issues,
    );
    this.validateNonNegativeInteger(
      value.consecutiveLossCount,
      `${path}.consecutiveLossCount`,
      issues,
    );
    this.validateNonNegativeInteger(
      value.activePositionCount,
      `${path}.activePositionCount`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.allocatedCapital,
      `${path}.allocatedCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.usedCapital,
      `${path}.usedCapital`,
      issues,
    );
    this.validateNumber(value.realizedPnl, `${path}.realizedPnl`, issues);
    this.validateNumber(value.unrealizedPnl, `${path}.unrealizedPnl`, issues);
    this.validateProbability(value.drawdown, `${path}.drawdown`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      isNonNegativeFiniteNumber(value.usedCapital) &&
      isNonNegativeFiniteNumber(value.allocatedCapital) &&
      value.usedCapital > value.allocatedCapital
    ) {
      this.addIssue(
        issues,
        `${path}.usedCapital`,
        "USED_CAPITAL_EXCEEDS_ALLOCATION",
        "usedCapital cannot exceed allocatedCapital.",
        "WARNING",
      );
    }
  }

  private validateLifecycleCommandInto(
    value: AutonomousStrategyLifecycleCommand,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.commandId, `${path}.commandId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateNonEmptyString(
      value.requestedBy,
      `${path}.requestedBy`,
      issues,
    );
    this.validateOptionalString(value.reason, `${path}.reason`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateLifecycleTransitionInto(
    value: AutonomousStrategyLifecycleTransition,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(
      value.transitionId,
      `${path}.transitionId`,
      issues,
    );
    this.validateNonEmptyString(value.commandId, `${path}.commandId`, issues);
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateBoolean(value.accepted, `${path}.accepted`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(
      value.transitionedAt,
      `${path}.transitionedAt`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.accepted && value.fromState === value.toState) {
      this.addIssue(
        issues,
        `${path}.toState`,
        "NO_STATE_CHANGE",
        "An accepted lifecycle transition should change state.",
        "WARNING",
      );
    }
  }

  private validateTradingSignalInto(
    value: AutonomousTradingSignal,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.signalId, `${path}.signalId`, issues);
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(
      value.strategyVersion,
      `${path}.strategyVersion`,
      issues,
    );
    this.validateInstrumentInto(value.instrument, `${path}.instrument`, issues);
    this.validateProbability(value.confidence, `${path}.confidence`, issues);
    this.validateNumber(value.strength, `${path}.strength`, issues);
    this.validateTimestamp(value.generatedAt, `${path}.generatedAt`, issues);
    this.validateOptionalTimestamp(value.expiresAt, `${path}.expiresAt`, issues);
    this.validateNonEmptyString(value.rationale, `${path}.rationale`, issues);
    this.validateOptionalString(value.modelId, `${path}.modelId`, issues);
    this.validateOptionalString(
      value.modelVersion,
      `${path}.modelVersion`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    for (const [key, price] of [
      ["referencePrice", value.referencePrice],
      ["targetPrice", value.targetPrice],
      ["stopPrice", value.stopPrice],
      ["takeProfitPrice", value.takeProfitPrice],
    ] as const) {
      if (price !== undefined) {
        this.validatePositiveNumber(price, `${path}.${key}`, issues);
      }
    }

    if (
      isTimestamp(value.generatedAt) &&
      isTimestamp(value.expiresAt) &&
      value.expiresAt <= value.generatedAt
    ) {
      this.addIssue(
        issues,
        `${path}.expiresAt`,
        "INVALID_SIGNAL_EXPIRY",
        "expiresAt must be later than generatedAt.",
      );
    }

    if (value.action === "HOLD" && value.direction !== "FLAT") {
      this.addIssue(
        issues,
        `${path}.direction`,
        "HOLD_DIRECTION_MISMATCH",
        "HOLD signals should normally use FLAT direction.",
        "WARNING",
      );
    }
  }

  private validateCandidateInto(
    value: AutonomousSignalCandidate,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(
      value.candidateId,
      `${path}.candidateId`,
      issues,
    );
    this.validateTradingSignalInto(value.signal, `${path}.signal`, issues);
    this.validateProbability(
      value.historicalReliability,
      `${path}.historicalReliability`,
      issues,
    );
    this.validateProbability(
      value.regimeCompatibility,
      `${path}.regimeCompatibility`,
      issues,
    );
    this.validateProbability(
      value.portfolioCompatibility,
      `${path}.portfolioCompatibility`,
      issues,
    );
    this.validateProbability(
      value.riskCompatibility,
      `${path}.riskCompatibility`,
      issues,
    );
    this.validateProbability(
      value.liquidityCompatibility,
      `${path}.liquidityCompatibility`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.latencyPenalty,
      `${path}.latencyPenalty`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateWeightsInto(
    value: AutonomousSignalArbitrationWeights,
    path: string,
    issues: MutableIssue[],
  ): void {
    const values = [
      value.confidence,
      value.strength,
      value.strategyPriority,
      value.strategyHealth,
      value.historicalReliability,
      value.regimeCompatibility,
      value.portfolioCompatibility,
      value.riskCompatibility,
      value.liquidityCompatibility,
      value.latencyPenalty,
    ];

    values.forEach((weight, index) =>
      this.validateNonNegativeNumber(weight, `${path}[${index}]`, issues),
    );

    if (
      values.every(isNonNegativeFiniteNumber) &&
      values.reduce((sum, current) => sum + current, 0) <= 0
    ) {
      this.addIssue(
        issues,
        path,
        "ZERO_TOTAL_WEIGHT",
        "At least one arbitration weight must be positive.",
      );
    }
  }

  private validateSignalArbitrationRequestInto(
    value: AutonomousSignalArbitrationRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateInstrumentInto(value.instrument, `${path}.instrument`, issues);
    this.validateWeightsInto(value.weights, `${path}.weights`, issues);
    this.validateNonNegativeNumber(
      value.minimumWinningScore,
      `${path}.minimumWinningScore`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.minimumScoreSeparation,
      `${path}.minimumScoreSeparation`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumCandidateAgeMs,
      `${path}.maximumCandidateAgeMs`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
      this.addIssue(
        issues,
        `${path}.candidates`,
        "EMPTY_CANDIDATES",
        "At least one signal candidate is required.",
      );
      return;
    }

    const ids = new Set<string>();
    value.candidates.forEach((candidate, index) => {
      this.validateCandidateInto(
        candidate,
        `${path}.candidates[${index}]`,
        issues,
      );
      if (ids.has(candidate.candidateId)) {
        this.addIssue(
          issues,
          `${path}.candidates[${index}].candidateId`,
          "DUPLICATE_CANDIDATE_ID",
          "Candidate identifiers must be unique.",
        );
      }
      ids.add(candidate.candidateId);
    });
  }

  private validateSignalArbitrationDecisionInto(
    value: AutonomousSignalArbitrationDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateInstrumentInto(value.instrument, `${path}.instrument`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.selectedSignal !== undefined) {
      this.validateTradingSignalInto(
        value.selectedSignal,
        `${path}.selectedSignal`,
        issues,
      );
    }

    if (!Array.isArray(value.candidateScores)) {
      this.addIssue(
        issues,
        `${path}.candidateScores`,
        "INVALID_ARRAY",
        "candidateScores must be an array.",
      );
    } else {
      value.candidateScores.forEach((score, index) => {
        const scorePath = `${path}.candidateScores[${index}]`;
        this.validateNonEmptyString(
          score.candidateId,
          `${scorePath}.candidateId`,
          issues,
        );
        this.validateNonEmptyString(
          score.signalId,
          `${scorePath}.signalId`,
          issues,
        );
        this.validateNonEmptyString(
          score.strategyId,
          `${scorePath}.strategyId`,
          issues,
        );
        this.validateNumber(score.rawScore, `${scorePath}.rawScore`, issues);
        this.validateProbability(
          score.normalizedScore,
          `${scorePath}.normalizedScore`,
          issues,
        );
        this.validateBoolean(score.accepted, `${scorePath}.accepted`, issues);
        this.validateStringArray(
          score.rejectionReasons,
          `${scorePath}.rejectionReasons`,
          issues,
        );
        this.validateMetadata(score.metadata, `${scorePath}.metadata`, issues);
      });
    }

    if (value.outcome === "SELECTED" && value.selectedSignal === undefined) {
      this.addIssue(
        issues,
        `${path}.selectedSignal`,
        "MISSING_SELECTED_SIGNAL",
        "A SELECTED outcome requires selectedSignal.",
      );
    }
  }

  private validateConsensusParticipantInto(
    value: AutonomousConsensusParticipant,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(
      value.participantId,
      `${path}.participantId`,
      issues,
    );
    this.validateProbability(value.confidence, `${path}.confidence`, issues);
    this.validateNonNegativeNumber(value.weight, `${path}.weight`, issues);
    this.validateNonEmptyString(value.rationale, `${path}.rationale`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateConsensusRequestInto(
    value: AutonomousConsensusRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateTradingSignalInto(value.signal, `${path}.signal`, issues);
    this.validateProbability(
      value.requiredApprovalRatio,
      `${path}.requiredApprovalRatio`,
      issues,
    );
    this.validatePositiveInteger(
      value.requiredQuorum,
      `${path}.requiredQuorum`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.participants) || value.participants.length === 0) {
      this.addIssue(
        issues,
        `${path}.participants`,
        "EMPTY_PARTICIPANTS",
        "At least one consensus participant is required.",
      );
    } else {
      value.participants.forEach((participant, index) =>
        this.validateConsensusParticipantInto(
          participant,
          `${path}.participants[${index}]`,
          issues,
        ),
      );

      if (
        isPositiveInteger(value.requiredQuorum) &&
        value.requiredQuorum > value.participants.length
      ) {
        this.addIssue(
          issues,
          `${path}.requiredQuorum`,
          "QUORUM_EXCEEDS_PARTICIPANTS",
          "requiredQuorum cannot exceed participant count.",
        );
      }
    }
  }

  private validateConsensusDecisionInto(
    value: AutonomousConsensusDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateBoolean(value.approved, `${path}.approved`, issues);
    this.validateProbability(
      value.approvalRatio,
      `${path}.approvalRatio`,
      issues,
    );
    this.validateProbability(
      value.participationRatio,
      `${path}.participationRatio`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.weightedApprovalScore,
      `${path}.weightedApprovalScore`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.weightedRejectionScore,
      `${path}.weightedRejectionScore`,
      issues,
    );
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.participants)) {
      this.addIssue(
        issues,
        `${path}.participants`,
        "INVALID_ARRAY",
        "participants must be an array.",
      );
    } else {
      value.participants.forEach((participant, index) =>
        this.validateConsensusParticipantInto(
          participant,
          `${path}.participants[${index}]`,
          issues,
        ),
      );
    }
  }

  private validatePortfolioSnapshotInto(
    value: AutonomousPortfolioSnapshot,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.snapshotId, `${path}.snapshotId`, issues);
    this.validateTimestamp(value.capturedAt, `${path}.capturedAt`, issues);
    this.validateNonNegativeNumber(value.totalEquity, `${path}.totalEquity`, issues);
    this.validateNonNegativeNumber(
      value.availableCapital,
      `${path}.availableCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.reservedCapital,
      `${path}.reservedCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.grossExposure,
      `${path}.grossExposure`,
      issues,
    );
    this.validateNumber(value.netExposure, `${path}.netExposure`, issues);
    this.validateNonNegativeNumber(
      value.longExposure,
      `${path}.longExposure`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.shortExposure,
      `${path}.shortExposure`,
      issues,
    );
    this.validateNumber(value.realizedPnl, `${path}.realizedPnl`, issues);
    this.validateNumber(value.unrealizedPnl, `${path}.unrealizedPnl`, issues);
    this.validateProbability(value.drawdown, `${path}.drawdown`, issues);
    this.validateNonNegativeInteger(
      value.openPositionCount,
      `${path}.openPositionCount`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      isNonNegativeFiniteNumber(value.grossExposure) &&
      isNonNegativeFiniteNumber(value.longExposure) &&
      isNonNegativeFiniteNumber(value.shortExposure) &&
      Math.abs(value.grossExposure - (value.longExposure + value.shortExposure)) >
        1e-8
    ) {
      this.addIssue(
        issues,
        `${path}.grossExposure`,
        "GROSS_EXPOSURE_MISMATCH",
        "grossExposure should equal longExposure plus shortExposure.",
        "WARNING",
      );
    }
  }

  private validatePerformanceSnapshotInto(
    value: AutonomousStrategyPerformanceSnapshot,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateTimestamp(value.capturedAt, `${path}.capturedAt`, issues);

    const finiteFields: readonly [string, number | undefined][] = [
      ["totalReturn", value.totalReturn],
      ["annualizedReturn", value.annualizedReturn],
      ["realizedPnl", value.realizedPnl],
      ["unrealizedPnl", value.unrealizedPnl],
      ["volatility", value.volatility],
      ["downsideVolatility", value.downsideVolatility],
      ["sharpeRatio", value.sharpeRatio],
      ["sortinoRatio", value.sortinoRatio],
      ["maximumDrawdown", value.maximumDrawdown],
      ["winRate", value.winRate],
      ["profitFactor", value.profitFactor],
      ["expectancy", value.expectancy],
      ["averageTradeDurationMs", value.averageTradeDurationMs],
      ["recentPerformanceScore", value.recentPerformanceScore],
      ["stabilityScore", value.stabilityScore],
    ];

    finiteFields.forEach(([name, numberValue]) => {
      if (numberValue !== undefined) {
        this.validateNumber(numberValue, `${path}.${name}`, issues);
      }
    });

    this.validateNonNegativeInteger(
      value.tradeCount,
      `${path}.tradeCount`,
      issues,
    );
    this.validateProbability(value.winRate, `${path}.winRate`, issues);
    this.validateProbability(
      value.maximumDrawdown,
      `${path}.maximumDrawdown`,
      issues,
    );
    this.validateProbability(
      value.recentPerformanceScore,
      `${path}.recentPerformanceScore`,
      issues,
    );
    this.validateProbability(
      value.stabilityScore,
      `${path}.stabilityScore`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateCapitalAllocationRequestInto(
    value: AutonomousCapitalAllocationRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    const constraints = value.constraints;
    this.validateNonNegativeNumber(
      constraints.totalCapital,
      `${path}.constraints.totalCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      constraints.reserveCapital,
      `${path}.constraints.reserveCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      constraints.maximumAllocatedCapital,
      `${path}.constraints.maximumAllocatedCapital`,
      issues,
    );
    this.validateProbability(
      constraints.maximumStrategyConcentration,
      `${path}.constraints.maximumStrategyConcentration`,
      issues,
    );
    this.validateNonNegativeNumber(
      constraints.maximumCorrelatedExposure,
      `${path}.constraints.maximumCorrelatedExposure`,
      issues,
    );
    this.validateNonNegativeNumber(
      constraints.minimumCashBuffer,
      `${path}.constraints.minimumCashBuffer`,
      issues,
    );
    this.validateBoolean(
      constraints.allowPartialAllocation,
      `${path}.constraints.allowPartialAllocation`,
      issues,
    );
    this.validateMetadata(
      constraints.metadata,
      `${path}.constraints.metadata`,
      issues,
    );

    if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
      this.addIssue(
        issues,
        `${path}.candidates`,
        "EMPTY_ALLOCATION_CANDIDATES",
        "At least one allocation candidate is required.",
      );
      return;
    }

    value.candidates.forEach((candidate, index) => {
      const candidatePath = `${path}.candidates[${index}]`;
      this.validateNonEmptyString(
        candidate.strategyId,
        `${candidatePath}.strategyId`,
        issues,
      );
      this.validateNonNegativeNumber(
        candidate.requestedCapital,
        `${candidatePath}.requestedCapital`,
        issues,
      );
      this.validateNonNegativeNumber(
        candidate.minimumCapital,
        `${candidatePath}.minimumCapital`,
        issues,
      );
      this.validateNonNegativeNumber(
        candidate.maximumCapital,
        `${candidatePath}.maximumCapital`,
        issues,
      );
      this.validateProbability(
        candidate.minimumWeight,
        `${candidatePath}.minimumWeight`,
        issues,
      );
      this.validateProbability(
        candidate.maximumWeight,
        `${candidatePath}.maximumWeight`,
        issues,
      );
      this.validateProbability(
        candidate.riskScore,
        `${candidatePath}.riskScore`,
        issues,
      );
      this.validateNonNegativeNumber(
        candidate.currentAllocation,
        `${candidatePath}.currentAllocation`,
        issues,
      );
      this.validatePerformanceSnapshotInto(
        candidate.performance,
        `${candidatePath}.performance`,
        issues,
      );
      this.validateMetadata(
        candidate.metadata,
        `${candidatePath}.metadata`,
        issues,
      );

      if (candidate.minimumCapital > candidate.maximumCapital) {
        this.addIssue(
          issues,
          `${candidatePath}.minimumCapital`,
          "MINIMUM_EXCEEDS_MAXIMUM",
          "minimumCapital cannot exceed maximumCapital.",
        );
      }
      if (candidate.minimumWeight > candidate.maximumWeight) {
        this.addIssue(
          issues,
          `${candidatePath}.minimumWeight`,
          "MINIMUM_WEIGHT_EXCEEDS_MAXIMUM",
          "minimumWeight cannot exceed maximumWeight.",
        );
      }
    });
  }

  private validateStrategyAllocationInto(
    value: AutonomousStrategyAllocation,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonNegativeNumber(
      value.requestedCapital,
      `${path}.requestedCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.allocatedCapital,
      `${path}.allocatedCapital`,
      issues,
    );
    this.validateProbability(
      value.allocationWeight,
      `${path}.allocationWeight`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.previousAllocation,
      `${path}.previousAllocation`,
      issues,
    );
    this.validateNumber(
      value.allocationChange,
      `${path}.allocationChange`,
      issues,
    );
    this.validateBoolean(value.approved, `${path}.approved`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateCapitalAllocationDecisionInto(
    value: AutonomousCapitalAllocationDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.totalAllocatedCapital,
      `${path}.totalAllocatedCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.reserveCapital,
      `${path}.reserveCapital`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.unallocatedCapital,
      `${path}.unallocatedCapital`,
      issues,
    );
    this.validateProbability(
      value.concentration,
      `${path}.concentration`,
      issues,
    );
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.allocations)) {
      this.addIssue(
        issues,
        `${path}.allocations`,
        "INVALID_ARRAY",
        "allocations must be an array.",
      );
    } else {
      value.allocations.forEach((allocation, index) =>
        this.validateStrategyAllocationInto(
          allocation,
          `${path}.allocations[${index}]`,
          issues,
        ),
      );
    }
  }

  private validateRiskContextInto(
    value: AutonomousRiskContext,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validatePortfolioSnapshotInto(
      value.portfolio,
      `${path}.portfolio`,
      issues,
    );
    this.validateRuntimeStateInto(value.strategy, `${path}.strategy`, issues);
    this.validateRiskLimitsInto(
      value.strategyLimits,
      `${path}.strategyLimits`,
      issues,
    );

    const nonNegativeFields: readonly [string, number][] = [
      ["currentPositionNotional", value.currentPositionNotional],
      ["projectedPositionNotional", value.projectedPositionNotional],
      ["currentInstrumentExposure", value.currentInstrumentExposure],
      ["projectedInstrumentExposure", value.projectedInstrumentExposure],
      ["estimatedOrderNotional", value.estimatedOrderNotional],
      ["estimatedLeverage", value.estimatedLeverage],
      ["estimatedSlippageBps", value.estimatedSlippageBps],
      ["marketVolatility", value.marketVolatility],
    ];
    nonNegativeFields.forEach(([name, numberValue]) =>
      this.validateNonNegativeNumber(numberValue, `${path}.${name}`, issues),
    );
    this.validateProbability(
      value.liquidityScore,
      `${path}.liquidityScore`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateTradeApprovalRequestInto(
    value: AutonomousTradeApprovalRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateTradingSignalInto(value.signal, `${path}.signal`, issues);
    this.validateConsensusDecisionInto(
      value.consensus,
      `${path}.consensus`,
      issues,
    );
    this.validateRiskContextInto(
      value.riskContext,
      `${path}.riskContext`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateTradeApprovalDecisionInto(
    value: AutonomousTradeApprovalDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.approvedNotional,
      `${path}.approvedNotional`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumPermittedNotional,
      `${path}.maximumPermittedNotional`,
      issues,
    );
    if (value.requiredRiskReduction !== undefined) {
      this.validateNonNegativeNumber(
        value.requiredRiskReduction,
        `${path}.requiredRiskReduction`,
        issues,
      );
    }
    this.validateStringArray(value.violations, `${path}.violations`, issues);
    this.validateStringArray(value.warnings, `${path}.warnings`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.approvedNotional > value.maximumPermittedNotional) {
      this.addIssue(
        issues,
        `${path}.approvedNotional`,
        "APPROVAL_EXCEEDS_MAXIMUM",
        "approvedNotional cannot exceed maximumPermittedNotional.",
      );
    }
    if (value.status === "REJECTED" && value.approvedNotional !== 0) {
      this.addIssue(
        issues,
        `${path}.approvedNotional`,
        "REJECTED_WITH_NONZERO_NOTIONAL",
        "Rejected approvals must have zero approvedNotional.",
      );
    }
  }

  private validateSizingConstraintsInto(
    value: AutonomousPositionSizingConstraints,
    path: string,
    issues: MutableIssue[],
  ): void {
    const nonNegativeFields: readonly [string, number][] = [
      ["minimumNotional", value.minimumNotional],
      ["maximumNotional", value.maximumNotional],
      ["maximumLeverage", value.maximumLeverage],
      ["minimumQuantity", value.minimumQuantity],
      ["maximumQuantity", value.maximumQuantity],
    ];
    nonNegativeFields.forEach(([name, numberValue]) =>
      this.validateNonNegativeNumber(numberValue, `${path}.${name}`, issues),
    );
    this.validateProbability(
      value.maximumPortfolioFraction,
      `${path}.maximumPortfolioFraction`,
      issues,
    );
    this.validateProbability(
      value.maximumRiskPerTrade,
      `${path}.maximumRiskPerTrade`,
      issues,
    );
    this.validatePositiveNumber(value.lotSize, `${path}.lotSize`, issues);
    this.validatePositiveNumber(
      value.quantityStep,
      `${path}.quantityStep`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.minimumNotional > value.maximumNotional) {
      this.addIssue(
        issues,
        `${path}.minimumNotional`,
        "MINIMUM_EXCEEDS_MAXIMUM",
        "minimumNotional cannot exceed maximumNotional.",
      );
    }
    if (value.minimumQuantity > value.maximumQuantity) {
      this.addIssue(
        issues,
        `${path}.minimumQuantity`,
        "MINIMUM_EXCEEDS_MAXIMUM",
        "minimumQuantity cannot exceed maximumQuantity.",
      );
    }
  }

  private validatePositionSizingRequestInto(
    value: AutonomousPositionSizingRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateTradingSignalInto(value.signal, `${path}.signal`, issues);
    this.validateTradeApprovalDecisionInto(
      value.approval,
      `${path}.approval`,
      issues,
    );

    const nonNegativeFields: readonly [string, number][] = [
      ["portfolioEquity", value.portfolioEquity],
      ["availableCapital", value.availableCapital],
      ["allocatedStrategyCapital", value.allocatedStrategyCapital],
      ["volatility", value.volatility],
    ];
    nonNegativeFields.forEach(([name, numberValue]) =>
      this.validateNonNegativeNumber(numberValue, `${path}.${name}`, issues),
    );
    this.validatePositiveNumber(
      value.currentPrice,
      `${path}.currentPrice`,
      issues,
    );
    if (value.stopPrice !== undefined) {
      this.validatePositiveNumber(value.stopPrice, `${path}.stopPrice`, issues);
    }
    this.validateProbability(value.confidence, `${path}.confidence`, issues);
    this.validateProbability(
      value.historicalWinRate,
      `${path}.historicalWinRate`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.historicalPayoffRatio,
      `${path}.historicalPayoffRatio`,
      issues,
    );
    this.validateProbability(value.drawdown, `${path}.drawdown`, issues);
    this.validateSizingConstraintsInto(
      value.constraints,
      `${path}.constraints`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validatePositionSizingDecisionInto(
    value: AutonomousPositionSizingDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );

    const nonNegativeFields: readonly [string, number][] = [
      ["quantity", value.quantity],
      ["notional", value.notional],
      ["estimatedRiskAmount", value.estimatedRiskAmount],
      ["leverage", value.leverage],
      ["confidenceAdjustment", value.confidenceAdjustment],
      ["volatilityAdjustment", value.volatilityAdjustment],
      ["drawdownAdjustment", value.drawdownAdjustment],
    ];
    nonNegativeFields.forEach(([name, numberValue]) =>
      this.validateNonNegativeNumber(numberValue, `${path}.${name}`, issues),
    );
    this.validateProbability(
      value.capitalFraction,
      `${path}.capitalFraction`,
      issues,
    );
    this.validateProbability(
      value.estimatedRiskFraction,
      `${path}.estimatedRiskFraction`,
      issues,
    );
    this.validateBoolean(value.constrained, `${path}.constrained`, issues);
    this.validateStringArray(
      value.constraintsApplied,
      `${path}.constraintsApplied`,
      issues,
    );
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateOrderIntentInto(
    value: AutonomousOrderIntent,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.intentId, `${path}.intentId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(value.signalId, `${path}.signalId`, issues);
    this.validateInstrumentInto(value.instrument, `${path}.instrument`, issues);
    this.validatePositiveNumber(value.quantity, `${path}.quantity`, issues);
    this.validatePositiveNumber(value.notional, `${path}.notional`, issues);
    if (value.limitPrice !== undefined) {
      this.validatePositiveNumber(
        value.limitPrice,
        `${path}.limitPrice`,
        issues,
      );
    }
    if (value.stopPrice !== undefined) {
      this.validatePositiveNumber(value.stopPrice, `${path}.stopPrice`, issues);
    }
    this.validateBoolean(value.reduceOnly, `${path}.reduceOnly`, issues);
    this.validateBoolean(value.postOnly, `${path}.postOnly`, issues);
    this.validateTimestamp(value.createdAt, `${path}.createdAt`, issues);
    this.validateOptionalTimestamp(value.expiresAt, `${path}.expiresAt`, issues);
    this.validateNonEmptyString(value.rationale, `${path}.rationale`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (
      (value.orderType === "LIMIT" || value.orderType === "STOP_LIMIT") &&
      value.limitPrice === undefined
    ) {
      this.addIssue(
        issues,
        `${path}.limitPrice`,
        "MISSING_LIMIT_PRICE",
        `${value.orderType} orders require limitPrice.`,
      );
    }
    if (
      (value.orderType === "STOP" || value.orderType === "STOP_LIMIT") &&
      value.stopPrice === undefined
    ) {
      this.addIssue(
        issues,
        `${path}.stopPrice`,
        "MISSING_STOP_PRICE",
        `${value.orderType} orders require stopPrice.`,
      );
    }
    if (value.postOnly && value.orderType !== "LIMIT") {
      this.addIssue(
        issues,
        `${path}.postOnly`,
        "POST_ONLY_REQUIRES_LIMIT",
        "postOnly is only valid for LIMIT orders.",
      );
    }
  }

  private validateOrchestrationRequestInto(
    value: AutonomousOrchestrationRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validatePortfolioSnapshotInto(
      value.portfolio,
      `${path}.portfolio`,
      issues,
    );
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.signals) || value.signals.length === 0) {
      this.addIssue(
        issues,
        `${path}.signals`,
        "EMPTY_SIGNALS",
        "At least one signal is required.",
      );
    } else {
      value.signals.forEach((signal, index) =>
        this.validateTradingSignalInto(
          signal,
          `${path}.signals[${index}]`,
          issues,
        ),
      );
    }
  }

  private validateOrchestrationResultInto(
    value: AutonomousOrchestrationResult,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(
      value.orchestrationId,
      `${path}.orchestrationId`,
      issues,
    );
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.startedAt, `${path}.startedAt`, issues);
    this.validateTimestamp(value.completedAt, `${path}.completedAt`, issues);
    this.validateNonNegativeNumber(value.latencyMs, `${path}.latencyMs`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.arbitration !== undefined) {
      this.validateSignalArbitrationDecisionInto(
        value.arbitration,
        `${path}.arbitration`,
        issues,
      );
    }
    if (value.consensus !== undefined) {
      this.validateConsensusDecisionInto(
        value.consensus,
        `${path}.consensus`,
        issues,
      );
    }
    if (value.approval !== undefined) {
      this.validateTradeApprovalDecisionInto(
        value.approval,
        `${path}.approval`,
        issues,
      );
    }
    if (value.sizing !== undefined) {
      this.validatePositionSizingDecisionInto(
        value.sizing,
        `${path}.sizing`,
        issues,
      );
    }
    if (value.orderIntent !== undefined) {
      this.validateOrderIntentInto(
        value.orderIntent,
        `${path}.orderIntent`,
        issues,
      );
    }

    if (
      isTimestamp(value.startedAt) &&
      isTimestamp(value.completedAt) &&
      value.completedAt < value.startedAt
    ) {
      this.addIssue(
        issues,
        `${path}.completedAt`,
        "COMPLETED_BEFORE_STARTED",
        "completedAt cannot precede startedAt.",
      );
    }
  }

  private validateRecoveryPolicyInto(
    value: AutonomousRecoveryPolicy,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonNegativeInteger(
      value.maximumRetryAttempts,
      `${path}.maximumRetryAttempts`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.initialBackoffMs,
      `${path}.initialBackoffMs`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumBackoffMs,
      `${path}.maximumBackoffMs`,
      issues,
    );
    this.validatePositiveNumber(
      value.backoffMultiplier,
      `${path}.backoffMultiplier`,
      issues,
    );
    this.validatePositiveNumber(
      value.heartbeatTimeoutMs,
      `${path}.heartbeatTimeoutMs`,
      issues,
    );
    this.validatePositiveNumber(
      value.recoveryTimeoutMs,
      `${path}.recoveryTimeoutMs`,
      issues,
    );
    this.validateBoolean(value.failClosed, `${path}.failClosed`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.actions) || value.actions.length === 0) {
      this.addIssue(
        issues,
        `${path}.actions`,
        "EMPTY_RECOVERY_ACTIONS",
        "At least one recovery action is required.",
      );
    }
    if (value.initialBackoffMs > value.maximumBackoffMs) {
      this.addIssue(
        issues,
        `${path}.initialBackoffMs`,
        "INITIAL_BACKOFF_EXCEEDS_MAXIMUM",
        "initialBackoffMs cannot exceed maximumBackoffMs.",
      );
    }
  }

  private validateRecoveryRequestInto(
    value: AutonomousRecoveryRequest,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(
      value.failureCode,
      `${path}.failureCode`,
      issues,
    );
    this.validateNonEmptyString(
      value.failureMessage,
      `${path}.failureMessage`,
      issues,
    );
    this.validateNonNegativeInteger(value.attempt, `${path}.attempt`, issues);
    this.validateRecoveryPolicyInto(value.policy, `${path}.policy`, issues);
    this.validateTimestamp(value.requestedAt, `${path}.requestedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateRecoveryDecisionInto(
    value: AutonomousRecoveryDecision,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.requestId, `${path}.requestId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateBoolean(value.shouldRetry, `${path}.shouldRetry`, issues);
    this.validateOptionalTimestamp(
      value.nextRetryAt,
      `${path}.nextRetryAt`,
      issues,
    );
    this.validateBoolean(value.terminal, `${path}.terminal`, issues);
    this.validateNonEmptyString(value.reason, `${path}.reason`, issues);
    this.validateTimestamp(value.decidedAt, `${path}.decidedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (value.shouldRetry && value.nextRetryAt === undefined) {
      this.addIssue(
        issues,
        `${path}.nextRetryAt`,
        "MISSING_RETRY_TIMESTAMP",
        "A retry decision requires nextRetryAt.",
      );
    }
    if (value.terminal && value.shouldRetry) {
      this.addIssue(
        issues,
        path,
        "TERMINAL_RETRY_CONFLICT",
        "A terminal recovery decision cannot request another retry.",
      );
    }
  }

  private validatePerformanceAlertInto(
    value: AutonomousPerformanceAlert,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.alertId, `${path}.alertId`, issues);
    this.validateNonEmptyString(value.strategyId, `${path}.strategyId`, issues);
    this.validateNonEmptyString(value.code, `${path}.code`, issues);
    this.validateNonEmptyString(value.message, `${path}.message`, issues);
    if (value.observedValue !== undefined) {
      this.validateNumber(
        value.observedValue,
        `${path}.observedValue`,
        issues,
      );
    }
    if (value.thresholdValue !== undefined) {
      this.validateNumber(
        value.thresholdValue,
        `${path}.thresholdValue`,
        issues,
      );
    }
    this.validateTimestamp(value.createdAt, `${path}.createdAt`, issues);
    this.validateBoolean(value.acknowledged, `${path}.acknowledged`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validatePerformanceMonitoringSnapshotInto(
    value: AutonomousPerformanceMonitoringSnapshot,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.snapshotId, `${path}.snapshotId`, issues);
    this.validateTimestamp(value.capturedAt, `${path}.capturedAt`, issues);
    this.validatePortfolioSnapshotInto(
      value.portfolio,
      `${path}.portfolio`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.strategyPerformance)) {
      this.addIssue(
        issues,
        `${path}.strategyPerformance`,
        "INVALID_ARRAY",
        "strategyPerformance must be an array.",
      );
    } else {
      value.strategyPerformance.forEach((performance, index) =>
        this.validatePerformanceSnapshotInto(
          performance,
          `${path}.strategyPerformance[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.alerts)) {
      this.addIssue(
        issues,
        `${path}.alerts`,
        "INVALID_ARRAY",
        "alerts must be an array.",
      );
    } else {
      value.alerts.forEach((alert, index) =>
        this.validatePerformanceAlertInto(
          alert,
          `${path}.alerts[${index}]`,
          issues,
        ),
      );
    }

    const countFields: readonly [string, number][] = [
      ["healthyStrategyCount", value.healthyStrategyCount],
      ["degradedStrategyCount", value.degradedStrategyCount],
      ["unhealthyStrategyCount", value.unhealthyStrategyCount],
      ["runningStrategyCount", value.runningStrategyCount],
      ["pausedStrategyCount", value.pausedStrategyCount],
      ["failedStrategyCount", value.failedStrategyCount],
    ];
    countFields.forEach(([name, count]) =>
      this.validateNonNegativeInteger(count, `${path}.${name}`, issues),
    );
  }

  private validateLearningEventInto(
    value: AutonomousLearningEvent,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.eventId, `${path}.eventId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateOptionalString(value.strategyId, `${path}.strategyId`, issues);
    this.validateOptionalString(value.modelId, `${path}.modelId`, issues);
    this.validateTimestamp(value.occurredAt, `${path}.occurredAt`, issues);
    if (!isRecord(value.payload)) {
      this.addIssue(
        issues,
        `${path}.payload`,
        "INVALID_PAYLOAD",
        "payload must be an object.",
      );
    }
    this.validateStringArray(value.labels, `${path}.labels`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateDecisionFactorInto(
    value: AutonomousDecisionFactor,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.factorId, `${path}.factorId`, issues);
    this.validateNonEmptyString(value.name, `${path}.name`, issues);
    if (value.weight !== undefined) {
      this.validateNumber(value.weight, `${path}.weight`, issues);
    }
    if (value.contribution !== undefined) {
      this.validateNumber(
        value.contribution,
        `${path}.contribution`,
        issues,
      );
    }
    this.validateOptionalString(
      value.description,
      `${path}.description`,
      issues,
    );
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateDecisionExplanationInto(
    value: AutonomousDecisionExplanation,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(
      value.explanationId,
      `${path}.explanationId`,
      issues,
    );
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.decisionId, `${path}.decisionId`, issues);
    this.validateNonEmptyString(value.summary, `${path}.summary`, issues);
    this.validateStringArray(
      value.rationale,
      `${path}.rationale`,
      issues,
      false,
    );
    this.validateStringArray(value.warnings, `${path}.warnings`, issues);
    this.validateTimestamp(value.createdAt, `${path}.createdAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.factors)) {
      this.addIssue(
        issues,
        `${path}.factors`,
        "INVALID_ARRAY",
        "factors must be an array.",
      );
    } else {
      value.factors.forEach((factor, index) =>
        this.validateDecisionFactorInto(
          factor,
          `${path}.factors[${index}]`,
          issues,
        ),
      );
    }
  }

  private validateAuditRecordInto(
    value: AutonomousAuditRecord,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateNonEmptyString(value.recordId, `${path}.recordId`, issues);
    this.validateNonEmptyString(
      value.correlationId,
      `${path}.correlationId`,
      issues,
    );
    this.validateNonEmptyString(value.entityId, `${path}.entityId`, issues);
    this.validateNonEmptyString(value.action, `${path}.action`, issues);
    this.validateNonEmptyString(value.actor, `${path}.actor`, issues);
    this.validateTimestamp(value.occurredAt, `${path}.occurredAt`, issues);
    if (value.previousState !== undefined && !isRecord(value.previousState)) {
      this.addIssue(
        issues,
        `${path}.previousState`,
        "INVALID_STATE",
        "previousState must be an object.",
      );
    }
    if (value.currentState !== undefined && !isRecord(value.currentState)) {
      this.addIssue(
        issues,
        `${path}.currentState`,
        "INVALID_STATE",
        "currentState must be an object.",
      );
    }
    if (value.explanation !== undefined) {
      this.validateDecisionExplanationInto(
        value.explanation,
        `${path}.explanation`,
        issues,
      );
    }
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);
  }

  private validateEngineMetricsInto(
    value: AutonomousTradingEngineMetrics,
    path: string,
    issues: MutableIssue[],
  ): void {
    const integerFields: readonly [string, number][] = [
      ["orchestrationRequestCount", value.orchestrationRequestCount],
      ["completedOrchestrationCount", value.completedOrchestrationCount],
      ["rejectedOrchestrationCount", value.rejectedOrchestrationCount],
      ["failedOrchestrationCount", value.failedOrchestrationCount],
      ["generatedOrderIntentCount", value.generatedOrderIntentCount],
      ["lifecycleTransitionCount", value.lifecycleTransitionCount],
      ["recoveryAttemptCount", value.recoveryAttemptCount],
      ["successfulRecoveryCount", value.successfulRecoveryCount],
      ["activeStrategyCount", value.activeStrategyCount],
    ];
    integerFields.forEach(([name, count]) =>
      this.validateNonNegativeInteger(count, `${path}.${name}`, issues),
    );
    this.validateNonNegativeNumber(
      value.averageOrchestrationLatencyMs,
      `${path}.averageOrchestrationLatencyMs`,
      issues,
    );
    this.validateNonNegativeNumber(
      value.maximumOrchestrationLatencyMs,
      `${path}.maximumOrchestrationLatencyMs`,
      issues,
    );

    const terminalCount =
      value.completedOrchestrationCount +
      value.rejectedOrchestrationCount +
      value.failedOrchestrationCount;
    if (terminalCount > value.orchestrationRequestCount) {
      this.addIssue(
        issues,
        path,
        "TERMINAL_COUNT_EXCEEDS_REQUESTS",
        "Terminal orchestration count cannot exceed request count.",
      );
    }
  }

  private validateEngineSnapshotInto(
    value: AutonomousTradingEngineSnapshot,
    path: string,
    issues: MutableIssue[],
  ): void {
    this.validateTimestamp(value.capturedAt, `${path}.capturedAt`, issues);
    this.validateMetadata(value.metadata, `${path}.metadata`, issues);

    if (!Array.isArray(value.strategies)) {
      this.addIssue(
        issues,
        `${path}.strategies`,
        "INVALID_ARRAY",
        "strategies must be an array.",
      );
    } else {
      value.strategies.forEach((strategy, index) =>
        this.validateStrategyConfigurationInto(
          strategy,
          `${path}.strategies[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.runtimeStates)) {
      this.addIssue(
        issues,
        `${path}.runtimeStates`,
        "INVALID_ARRAY",
        "runtimeStates must be an array.",
      );
    } else {
      value.runtimeStates.forEach((state, index) =>
        this.validateRuntimeStateInto(
          state,
          `${path}.runtimeStates[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.allocations)) {
      this.addIssue(
        issues,
        `${path}.allocations`,
        "INVALID_ARRAY",
        "allocations must be an array.",
      );
    } else {
      value.allocations.forEach((allocation, index) =>
        this.validateStrategyAllocationInto(
          allocation,
          `${path}.allocations[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.recentOrchestrations)) {
      this.addIssue(
        issues,
        `${path}.recentOrchestrations`,
        "INVALID_ARRAY",
        "recentOrchestrations must be an array.",
      );
    } else {
      value.recentOrchestrations.forEach((result, index) =>
        this.validateOrchestrationResultInto(
          result,
          `${path}.recentOrchestrations[${index}]`,
          issues,
        ),
      );
    }

    if (!Array.isArray(value.recentRecoveries)) {
      this.addIssue(
        issues,
        `${path}.recentRecoveries`,
        "INVALID_ARRAY",
        "recentRecoveries must be an array.",
      );
    } else {
      value.recentRecoveries.forEach((decision, index) =>
        this.validateRecoveryDecisionInto(
          decision,
          `${path}.recentRecoveries[${index}]`,
          issues,
        ),
      );
    }

    this.validatePerformanceMonitoringSnapshotInto(
      value.performance,
      `${path}.performance`,
      issues,
    );
    this.validateEngineMetricsInto(value.metrics, `${path}.metrics`, issues);
  }
}

export function createAutonomousTradingContractValidator(
  options: AutonomousTradingValidatorOptions = {},
): AutonomousTradingContractValidator {
  return new AutonomousTradingContractValidator(options);
}

export function mergeAutonomousTradingValidationResults(
  ...results: readonly AutonomousTradingValidationResult[]
): AutonomousTradingValidationResult {
  return freezeResult(
    results.flatMap((result) =>
      result.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
        metadata: issue.metadata,
      })),
    ),
  );
}

export function hasAutonomousTradingValidationErrors(
  result: AutonomousTradingValidationResult,
): boolean {
  return result.issues.some((issue) => issue.severity === "ERROR");
}

export function filterAutonomousTradingValidationIssues(
  result: AutonomousTradingValidationResult,
  severity: AutonomousTradingValidationSeverity,
): readonly AutonomousTradingValidationIssue[] {
  return Object.freeze(
    result.issues.filter((issue) => issue.severity === severity),
  );
}