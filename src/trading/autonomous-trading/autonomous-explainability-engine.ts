/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 15: Autonomous explainability engine.
 *
 * Responsibilities:
 * - generate deterministic explanations for autonomous trading decisions
 * - normalize weighted decision factors and rank material contributors
 * - preserve warnings, rationale, decision lineage, and correlation context
 * - create immutable audit records with optional before-and-after state
 * - retain bounded explanation and audit histories
 * - provide deterministic query, metrics, and snapshot APIs
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousAuditRecord,
  type AutonomousDecisionExplanation,
  type AutonomousDecisionExplanationType,
  type AutonomousDecisionFactor,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export type AutonomousExplainabilityEntityType =
  AutonomousAuditRecord["entityType"];

export type AutonomousExplainabilitySeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export interface AutonomousDecisionFactorInput {
  readonly factorId?: string;
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly weight?: number;
  readonly contribution?: number;
  readonly description?: string;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousExplanationRequest {
  readonly correlationId: string;
  readonly decisionId: string;
  readonly decisionType: AutonomousDecisionExplanationType;
  readonly outcome: string;
  readonly summary?: string;
  readonly rationale?: readonly string[];
  readonly factors?: readonly AutonomousDecisionFactorInput[];
  readonly warnings?: readonly string[];
  readonly strategyId?: string;
  readonly signalId?: string;
  readonly instrument?: string;
  readonly actor?: string;
  readonly occurredAt?: AutonomousTradingTimestamp;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousAuditRecordRequest {
  readonly correlationId: string;
  readonly entityType: AutonomousExplainabilityEntityType;
  readonly entityId: string;
  readonly action: string;
  readonly actor?: string;
  readonly occurredAt?: AutonomousTradingTimestamp;
  readonly previousState?: Readonly<Record<string, unknown>>;
  readonly currentState?: Readonly<Record<string, unknown>>;
  readonly explanation?: AutonomousDecisionExplanation;
  readonly explanationRequest?: AutonomousExplanationRequest;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousExplanationQuery {
  readonly correlationId?: string;
  readonly decisionId?: string;
  readonly decisionType?: AutonomousDecisionExplanationType;
  readonly strategyId?: string;
  readonly signalId?: string;
  readonly fromCreatedAt?: AutonomousTradingTimestamp;
  readonly toCreatedAt?: AutonomousTradingTimestamp;
  readonly minimumWarningCount?: number;
  readonly limit?: number;
}

export interface AutonomousAuditRecordQuery {
  readonly correlationId?: string;
  readonly entityType?: AutonomousExplainabilityEntityType;
  readonly entityId?: string;
  readonly action?: string;
  readonly actor?: string;
  readonly decisionType?: AutonomousDecisionExplanationType;
  readonly fromOccurredAt?: AutonomousTradingTimestamp;
  readonly toOccurredAt?: AutonomousTradingTimestamp;
  readonly limit?: number;
}

export interface AutonomousExplainabilityEngineMetrics {
  readonly explanationCount: number;
  readonly auditRecordCount: number;
  readonly factorCount: number;
  readonly warningCount: number;
  readonly criticalExplanationCount: number;
  readonly explanationsByType: Readonly<
    Record<AutonomousDecisionExplanationType, number>
  >;
  readonly auditRecordsByEntityType: Readonly<
    Record<AutonomousExplainabilityEntityType, number>
  >;
  readonly averageFactorCount: number;
  readonly averageWarningCount: number;
  readonly maximumFactorCount: number;
  readonly maximumWarningCount: number;
}

export interface AutonomousExplainabilityEngineSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly explanations: readonly AutonomousDecisionExplanation[];
  readonly auditRecords: readonly AutonomousAuditRecord[];
  readonly metrics: AutonomousExplainabilityEngineMetrics;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousExplainabilityEngineOptions {
  readonly maximumExplanationEntries?: number;
  readonly maximumAuditEntries?: number;
  readonly maximumFactorsPerExplanation?: number;
  readonly maximumRationaleEntries?: number;
  readonly maximumWarningsPerExplanation?: number;
  readonly maximumSummaryLength?: number;
  readonly maximumTextEntryLength?: number;
  readonly defaultActor?: string;
  readonly normalizeFactorContributions?: boolean;
  readonly inferRationaleFromFactors?: boolean;
  readonly deduplicateTextEntries?: boolean;
  readonly criticalWarningThreshold?: number;
  readonly numericalTolerance?: number;
  readonly metadata?: AutonomousTradingMetadata;
}

interface ResolvedAutonomousExplainabilityEngineOptions {
  readonly maximumExplanationEntries: number;
  readonly maximumAuditEntries: number;
  readonly maximumFactorsPerExplanation: number;
  readonly maximumRationaleEntries: number;
  readonly maximumWarningsPerExplanation: number;
  readonly maximumSummaryLength: number;
  readonly maximumTextEntryLength: number;
  readonly defaultActor: string;
  readonly normalizeFactorContributions: boolean;
  readonly inferRationaleFromFactors: boolean;
  readonly deduplicateTextEntries: boolean;
  readonly criticalWarningThreshold: number;
  readonly numericalTolerance: number;
  readonly metadata: AutonomousTradingMetadata;
}

interface MutableExplainabilityMetrics {
  explanationCount: number;
  auditRecordCount: number;
  factorCount: number;
  warningCount: number;
  criticalExplanationCount: number;
  explanationsByType: Record<AutonomousDecisionExplanationType, number>;
  auditRecordsByEntityType: Record<AutonomousExplainabilityEntityType, number>;
  maximumFactorCount: number;
  maximumWarningCount: number;
}

const EXPLANATION_TYPES: readonly AutonomousDecisionExplanationType[] =
  Object.freeze([
    "SIGNAL",
    "ARBITRATION",
    "CONSENSUS",
    "RISK",
    "POSITION_SIZING",
    "CAPITAL_ALLOCATION",
    "RECOVERY",
    "ORDER_INTENT",
    "ORCHESTRATION",
  ]);

const ENTITY_TYPES: readonly AutonomousExplainabilityEntityType[] =
  Object.freeze([
    "STRATEGY",
    "SIGNAL",
    "DECISION",
    "ORDER_INTENT",
    "RECOVERY",
    "ALLOCATION",
  ]);

const DEFAULT_OPTIONS = Object.freeze({
  maximumExplanationEntries: 10_000,
  maximumAuditEntries: 20_000,
  maximumFactorsPerExplanation: 128,
  maximumRationaleEntries: 64,
  maximumWarningsPerExplanation: 64,
  maximumSummaryLength: 2_000,
  maximumTextEntryLength: 1_000,
  defaultActor: "AUTONOMOUS_EXPLAINABILITY_ENGINE",
  normalizeFactorContributions: true,
  inferRationaleFromFactors: true,
  deduplicateTextEntries: true,
  criticalWarningThreshold: 3,
  numericalTolerance: 1e-9,
});

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite timestamp.`);
  }
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const result: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    result[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(result);
}

function mergeMetadata(
  ...sources: readonly (AutonomousTradingMetadata | undefined)[]
): AutonomousTradingMetadata {
  const result: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const source of sources) {
    if (source === undefined) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      result[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
    }
  }
  return Object.freeze(result);
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneUnknown));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = cloneUnknown(nested);
    }
    return Object.freeze(result);
  }
  return value;
}

function freezeState(
  state: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  return state === undefined
    ? undefined
    : (cloneUnknown(state) as Readonly<Record<string, unknown>>);
}

function freezeFactor(
  factor: AutonomousDecisionFactor,
): AutonomousDecisionFactor {
  return Object.freeze({
    ...factor,
    metadata: freezeMetadata(factor.metadata),
  });
}

function freezeExplanation(
  explanation: AutonomousDecisionExplanation,
): AutonomousDecisionExplanation {
  return Object.freeze({
    ...explanation,
    rationale: Object.freeze([...explanation.rationale]),
    factors: Object.freeze(explanation.factors.map(freezeFactor)),
    warnings: Object.freeze([...explanation.warnings]),
    metadata: freezeMetadata(explanation.metadata),
  });
}

function freezeAuditRecord(record: AutonomousAuditRecord): AutonomousAuditRecord {
  return Object.freeze({
    ...record,
    previousState: freezeState(record.previousState),
    currentState: freezeState(record.currentState),
    explanation:
      record.explanation === undefined
        ? undefined
        : freezeExplanation(record.explanation),
    metadata: freezeMetadata(record.metadata),
  });
}

function createExplanationTypeCounts(): Record<
  AutonomousDecisionExplanationType,
  number
> {
  return {
    SIGNAL: 0,
    ARBITRATION: 0,
    CONSENSUS: 0,
    RISK: 0,
    POSITION_SIZING: 0,
    CAPITAL_ALLOCATION: 0,
    RECOVERY: 0,
    ORDER_INTENT: 0,
    ORCHESTRATION: 0,
  };
}

function createEntityTypeCounts(): Record<
  AutonomousExplainabilityEntityType,
  number
> {
  return {
    STRATEGY: 0,
    SIGNAL: 0,
    DECISION: 0,
    ORDER_INTENT: 0,
    RECOVERY: 0,
    ALLOCATION: 0,
  };
}

function compareExplanations(
  left: AutonomousDecisionExplanation,
  right: AutonomousDecisionExplanation,
): number {
  return (
    left.createdAt - right.createdAt ||
    left.explanationId.localeCompare(right.explanationId)
  );
}

function compareAuditRecords(
  left: AutonomousAuditRecord,
  right: AutonomousAuditRecord,
): number {
  return (
    left.occurredAt - right.occurredAt ||
    left.recordId.localeCompare(right.recordId)
  );
}

export class AutonomousExplainabilityEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousExplainabilityEngineOptions;
  private readonly explanations: AutonomousDecisionExplanation[] = [];
  private readonly auditRecords: AutonomousAuditRecord[] = [];
  private readonly explanationById = new Map<
    string,
    AutonomousDecisionExplanation
  >();
  private readonly explanationIdsByDecision = new Map<string, string[]>();
  private readonly auditRecordById = new Map<string, AutonomousAuditRecord>();
  private readonly metrics: MutableExplainabilityMetrics = {
    explanationCount: 0,
    auditRecordCount: 0,
    factorCount: 0,
    warningCount: 0,
    criticalExplanationCount: 0,
    explanationsByType: createExplanationTypeCounts(),
    auditRecordsByEntityType: createEntityTypeCounts(),
    maximumFactorCount: 0,
    maximumWarningCount: 0,
  };
  private explanationSequence = 0;
  private factorSequence = 0;
  private auditSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousExplainabilityEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const resolved: ResolvedAutonomousExplainabilityEngineOptions = {
      maximumExplanationEntries:
        options.maximumExplanationEntries ??
        DEFAULT_OPTIONS.maximumExplanationEntries,
      maximumAuditEntries:
        options.maximumAuditEntries ?? DEFAULT_OPTIONS.maximumAuditEntries,
      maximumFactorsPerExplanation:
        options.maximumFactorsPerExplanation ??
        DEFAULT_OPTIONS.maximumFactorsPerExplanation,
      maximumRationaleEntries:
        options.maximumRationaleEntries ??
        DEFAULT_OPTIONS.maximumRationaleEntries,
      maximumWarningsPerExplanation:
        options.maximumWarningsPerExplanation ??
        DEFAULT_OPTIONS.maximumWarningsPerExplanation,
      maximumSummaryLength:
        options.maximumSummaryLength ?? DEFAULT_OPTIONS.maximumSummaryLength,
      maximumTextEntryLength:
        options.maximumTextEntryLength ??
        DEFAULT_OPTIONS.maximumTextEntryLength,
      defaultActor: options.defaultActor ?? DEFAULT_OPTIONS.defaultActor,
      normalizeFactorContributions:
        options.normalizeFactorContributions ??
        DEFAULT_OPTIONS.normalizeFactorContributions,
      inferRationaleFromFactors:
        options.inferRationaleFromFactors ??
        DEFAULT_OPTIONS.inferRationaleFromFactors,
      deduplicateTextEntries:
        options.deduplicateTextEntries ??
        DEFAULT_OPTIONS.deduplicateTextEntries,
      criticalWarningThreshold:
        options.criticalWarningThreshold ??
        DEFAULT_OPTIONS.criticalWarningThreshold,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
      metadata: freezeMetadata(options.metadata),
    };

    assertPositiveInteger(
      resolved.maximumExplanationEntries,
      "maximumExplanationEntries",
    );
    assertPositiveInteger(resolved.maximumAuditEntries, "maximumAuditEntries");
    assertPositiveInteger(
      resolved.maximumFactorsPerExplanation,
      "maximumFactorsPerExplanation",
    );
    assertPositiveInteger(
      resolved.maximumRationaleEntries,
      "maximumRationaleEntries",
    );
    assertPositiveInteger(
      resolved.maximumWarningsPerExplanation,
      "maximumWarningsPerExplanation",
    );
    assertPositiveInteger(resolved.maximumSummaryLength, "maximumSummaryLength");
    assertPositiveInteger(
      resolved.maximumTextEntryLength,
      "maximumTextEntryLength",
    );
    assertNonEmptyString(resolved.defaultActor, "defaultActor");
    assertNonNegativeInteger(
      resolved.criticalWarningThreshold,
      "criticalWarningThreshold",
    );
    assertPositiveFinite(resolved.numericalTolerance, "numericalTolerance");

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public explain(
    request: AutonomousExplanationRequest,
  ): AutonomousDecisionExplanation {
    this.validateExplanationRequest(request);

    const createdAt = request.occurredAt ?? this.clock.now();
    assertTimestamp(createdAt, "createdAt");

    const factors = this.buildFactors(request.factors ?? [], createdAt);
    const warnings = this.normalizeTextEntries(
      request.warnings ?? [],
      this.options.maximumWarningsPerExplanation,
      "warnings",
    );
    const suppliedRationale = this.normalizeTextEntries(
      request.rationale ?? [],
      this.options.maximumRationaleEntries,
      "rationale",
    );
    const inferredRationale =
      suppliedRationale.length === 0 && this.options.inferRationaleFromFactors
        ? this.inferRationale(request, factors)
        : [];
    const rationale = Object.freeze(
      suppliedRationale.length > 0 ? suppliedRationale : inferredRationale,
    );

    const summary = this.buildSummary(request, factors, warnings);
    const severity = this.resolveSeverity(warnings.length, factors);

    const explanation = freezeExplanation({
      explanationId: this.idFactory.create(
        "autonomous-decision-explanation",
        createdAt,
        this.explanationSequence++,
      ),
      correlationId: request.correlationId.trim(),
      decisionId: request.decisionId.trim(),
      decisionType: request.decisionType,
      summary,
      rationale,
      factors,
      warnings,
      createdAt,
      metadata: mergeMetadata(this.options.metadata, request.metadata, {
        outcome: request.outcome.trim(),
        severity,
        strategyId: request.strategyId?.trim() ?? null,
        signalId: request.signalId?.trim() ?? null,
        instrument: request.instrument?.trim() ?? null,
        actor: request.actor?.trim() ?? this.options.defaultActor,
        factorCount: factors.length,
        warningCount: warnings.length,
      }),
    });

    this.validator.assertValid(
      this.validator.validateDecisionExplanation(explanation),
      "Generated autonomous decision explanation is invalid.",
    );

    this.recordExplanation(explanation);
    return explanation;
  }

  public createAuditRecord(
    request: AutonomousAuditRecordRequest,
  ): AutonomousAuditRecord {
    this.validateAuditRequest(request);

    const occurredAt = request.occurredAt ?? this.clock.now();
    assertTimestamp(occurredAt, "occurredAt");

    if (
      request.explanation !== undefined &&
      request.explanationRequest !== undefined
    ) {
      throw new Error(
        "Provide either explanation or explanationRequest, but not both.",
      );
    }

    const explanation =
      request.explanation !== undefined
        ? freezeExplanation(request.explanation)
        : request.explanationRequest !== undefined
          ? this.explain({
              ...request.explanationRequest,
              correlationId: request.correlationId,
              decisionId: request.explanationRequest.decisionId,
              occurredAt,
            })
          : undefined;

    if (explanation !== undefined) {
      this.validator.assertValid(
        this.validator.validateDecisionExplanation(explanation),
        "Audit explanation is invalid.",
      );
      if (explanation.correlationId !== request.correlationId) {
        throw new Error(
          "Audit record and explanation correlationId values must match.",
        );
      }
    }

    const record = freezeAuditRecord({
      recordId: this.idFactory.create(
        "autonomous-audit-record",
        occurredAt,
        this.auditSequence++,
      ),
      correlationId: request.correlationId.trim(),
      entityType: request.entityType,
      entityId: request.entityId.trim(),
      action: request.action.trim(),
      actor: request.actor?.trim() ?? this.options.defaultActor,
      occurredAt,
      previousState: freezeState(request.previousState),
      currentState: freezeState(request.currentState),
      explanation,
      metadata: mergeMetadata(this.options.metadata, request.metadata, {
        hasPreviousState: request.previousState !== undefined,
        hasCurrentState: request.currentState !== undefined,
        hasExplanation: explanation !== undefined,
      }),
    });

    this.validator.assertValid(
      this.validator.validateAuditRecord(record),
      "Generated autonomous audit record is invalid.",
    );

    this.recordAuditRecord(record);
    return record;
  }

  public explainAndAudit(
    explanationRequest: AutonomousExplanationRequest,
    auditRequest: Omit<
      AutonomousAuditRecordRequest,
      "correlationId" | "occurredAt" | "explanation" | "explanationRequest"
    >,
  ): Readonly<{
    explanation: AutonomousDecisionExplanation;
    auditRecord: AutonomousAuditRecord;
  }> {
    const occurredAt = explanationRequest.occurredAt ?? this.clock.now();
    assertTimestamp(occurredAt, "occurredAt");

    const explanation = this.explain({
      ...explanationRequest,
      occurredAt,
    });
    const auditRecord = this.createAuditRecord({
      ...auditRequest,
      correlationId: explanation.correlationId,
      occurredAt,
      explanation,
    });

    return Object.freeze({ explanation, auditRecord });
  }

  public getExplanation(
    explanationId: string,
  ): AutonomousDecisionExplanation | undefined {
    assertNonEmptyString(explanationId, "explanationId");
    return this.explanationById.get(explanationId);
  }

  public getLatestExplanationForDecision(
    decisionId: string,
  ): AutonomousDecisionExplanation | undefined {
    assertNonEmptyString(decisionId, "decisionId");
    const ids = this.explanationIdsByDecision.get(decisionId);
    const latestId = ids?.[ids.length - 1];
    return latestId === undefined
      ? undefined
      : this.explanationById.get(latestId);
  }

  public getAuditRecord(recordId: string): AutonomousAuditRecord | undefined {
    assertNonEmptyString(recordId, "recordId");
    return this.auditRecordById.get(recordId);
  }

  public queryExplanations(
    query: AutonomousExplanationQuery = {},
  ): readonly AutonomousDecisionExplanation[] {
    this.validateExplanationQuery(query);
    const limit = query.limit ?? this.options.maximumExplanationEntries;

    return Object.freeze(
      this.explanations
        .filter((explanation) => {
          if (
            query.correlationId !== undefined &&
            explanation.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.decisionId !== undefined &&
            explanation.decisionId !== query.decisionId
          ) {
            return false;
          }
          if (
            query.decisionType !== undefined &&
            explanation.decisionType !== query.decisionType
          ) {
            return false;
          }
          if (
            query.strategyId !== undefined &&
            explanation.metadata.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.signalId !== undefined &&
            explanation.metadata.signalId !== query.signalId
          ) {
            return false;
          }
          if (
            query.fromCreatedAt !== undefined &&
            explanation.createdAt < query.fromCreatedAt
          ) {
            return false;
          }
          if (
            query.toCreatedAt !== undefined &&
            explanation.createdAt > query.toCreatedAt
          ) {
            return false;
          }
          if (
            query.minimumWarningCount !== undefined &&
            explanation.warnings.length < query.minimumWarningCount
          ) {
            return false;
          }
          return true;
        })
        .sort(compareExplanations)
        .slice(-limit),
    );
  }

  public queryAuditRecords(
    query: AutonomousAuditRecordQuery = {},
  ): readonly AutonomousAuditRecord[] {
    this.validateAuditQuery(query);
    const limit = query.limit ?? this.options.maximumAuditEntries;

    return Object.freeze(
      this.auditRecords
        .filter((record) => {
          if (
            query.correlationId !== undefined &&
            record.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.entityType !== undefined &&
            record.entityType !== query.entityType
          ) {
            return false;
          }
          if (
            query.entityId !== undefined &&
            record.entityId !== query.entityId
          ) {
            return false;
          }
          if (query.action !== undefined && record.action !== query.action) {
            return false;
          }
          if (query.actor !== undefined && record.actor !== query.actor) {
            return false;
          }
          if (
            query.decisionType !== undefined &&
            record.explanation?.decisionType !== query.decisionType
          ) {
            return false;
          }
          if (
            query.fromOccurredAt !== undefined &&
            record.occurredAt < query.fromOccurredAt
          ) {
            return false;
          }
          if (
            query.toOccurredAt !== undefined &&
            record.occurredAt > query.toOccurredAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareAuditRecords)
        .slice(-limit),
    );
  }

  public getMetrics(): AutonomousExplainabilityEngineMetrics {
    const explanationCount = this.metrics.explanationCount;
    return Object.freeze({
      explanationCount,
      auditRecordCount: this.metrics.auditRecordCount,
      factorCount: this.metrics.factorCount,
      warningCount: this.metrics.warningCount,
      criticalExplanationCount: this.metrics.criticalExplanationCount,
      explanationsByType: Object.freeze({
        ...this.metrics.explanationsByType,
      }),
      auditRecordsByEntityType: Object.freeze({
        ...this.metrics.auditRecordsByEntityType,
      }),
      averageFactorCount:
        explanationCount === 0
          ? 0
          : this.metrics.factorCount / explanationCount,
      averageWarningCount:
        explanationCount === 0
          ? 0
          : this.metrics.warningCount / explanationCount,
      maximumFactorCount: this.metrics.maximumFactorCount,
      maximumWarningCount: this.metrics.maximumWarningCount,
    });
  }

  public snapshot(): AutonomousExplainabilityEngineSnapshot {
    const capturedAt = this.clock.now();
    assertTimestamp(capturedAt, "clock.now()");

    return Object.freeze({
      capturedAt,
      explanations: Object.freeze([...this.explanations]),
      auditRecords: Object.freeze([...this.auditRecords]),
      metrics: this.getMetrics(),
      metadata: mergeMetadata(this.options.metadata, {
        explanationRetentionLimit: this.options.maximumExplanationEntries,
        auditRetentionLimit: this.options.maximumAuditEntries,
      }),
    });
  }

  public clearHistory(): void {
    this.explanations.length = 0;
    this.auditRecords.length = 0;
    this.explanationById.clear();
    this.explanationIdsByDecision.clear();
    this.auditRecordById.clear();
  }

  private buildFactors(
    inputs: readonly AutonomousDecisionFactorInput[],
    createdAt: number,
  ): readonly AutonomousDecisionFactor[] {
    if (inputs.length > this.options.maximumFactorsPerExplanation) {
      throw new RangeError(
        `factors cannot contain more than ${this.options.maximumFactorsPerExplanation} entries.`,
      );
    }

    const factors = inputs.map((input, index) => {
      this.validateFactorInput(input, index);
      return freezeFactor({
        factorId:
          input.factorId?.trim() ??
          this.idFactory.create(
            "autonomous-decision-factor",
            createdAt,
            this.factorSequence++,
          ),
        name: input.name.trim(),
        value: input.value,
        weight: input.weight,
        contribution: input.contribution,
        description: input.description?.trim(),
        metadata: freezeMetadata(input.metadata),
      });
    });

    const normalized = this.options.normalizeFactorContributions
      ? this.normalizeContributions(factors)
      : factors;

    return Object.freeze(
      [...normalized].sort((left, right) => {
        const contributionDifference =
          Math.abs(right.contribution ?? 0) -
          Math.abs(left.contribution ?? 0);
        if (
          Math.abs(contributionDifference) > this.options.numericalTolerance
        ) {
          return contributionDifference;
        }
        const weightDifference =
          Math.abs(right.weight ?? 0) - Math.abs(left.weight ?? 0);
        if (Math.abs(weightDifference) > this.options.numericalTolerance) {
          return weightDifference;
        }
        return left.factorId.localeCompare(right.factorId);
      }),
    );
  }

  private normalizeContributions(
    factors: readonly AutonomousDecisionFactor[],
  ): readonly AutonomousDecisionFactor[] {
    const explicitTotal = factors.reduce(
      (sum, factor) => sum + Math.abs(factor.contribution ?? 0),
      0,
    );
    if (explicitTotal <= this.options.numericalTolerance) {
      return factors;
    }

    return Object.freeze(
      factors.map((factor) =>
        factor.contribution === undefined
          ? factor
          : freezeFactor({
              ...factor,
              contribution: factor.contribution / explicitTotal,
              metadata: mergeMetadata(factor.metadata, {
                originalContribution: factor.contribution,
                contributionNormalized: true,
              }),
            }),
      ),
    );
  }

  private inferRationale(
    request: AutonomousExplanationRequest,
    factors: readonly AutonomousDecisionFactor[],
  ): readonly string[] {
    const rationale: string[] = [];
    rationale.push(
      `${request.decisionType} decision produced outcome "${request.outcome.trim()}".`,
    );

    for (const factor of factors.slice(0, 5)) {
      const contribution = factor.contribution;
      const descriptor =
        contribution === undefined
          ? "was considered"
          : contribution > this.options.numericalTolerance
            ? "supported the outcome"
            : contribution < -this.options.numericalTolerance
              ? "opposed the outcome"
              : "had neutral impact";
      rationale.push(
        `${factor.name} (${String(factor.value)}) ${descriptor}.`,
      );
    }

    if (request.strategyId !== undefined) {
      rationale.push(`Decision lineage includes strategy ${request.strategyId}.`);
    }
    if (request.signalId !== undefined) {
      rationale.push(`Decision lineage includes signal ${request.signalId}.`);
    }

    return Object.freeze(
      this.normalizeTextEntries(
        rationale,
        this.options.maximumRationaleEntries,
        "rationale",
      ),
    );
  }

  private buildSummary(
    request: AutonomousExplanationRequest,
    factors: readonly AutonomousDecisionFactor[],
    warnings: readonly string[],
  ): string {
    const supplied = request.summary?.trim();
    const summary =
      supplied !== undefined && supplied.length > 0
        ? supplied
        : `${request.decisionType} decision ${request.decisionId.trim()} produced outcome "${request.outcome.trim()}" using ${factors.length} factor(s) with ${warnings.length} warning(s).`;

    if (summary.length > this.options.maximumSummaryLength) {
      throw new RangeError(
        `summary cannot exceed ${this.options.maximumSummaryLength} characters.`,
      );
    }
    return summary;
  }

  private resolveSeverity(
    warningCount: number,
    factors: readonly AutonomousDecisionFactor[],
  ): AutonomousExplainabilitySeverity {
    const hasStrongNegativeContribution = factors.some(
      (factor) =>
        (factor.contribution ?? 0) < -0.5 - this.options.numericalTolerance,
    );
    if (
      warningCount >= this.options.criticalWarningThreshold ||
      hasStrongNegativeContribution
    ) {
      return "CRITICAL";
    }
    return warningCount > 0 ? "WARNING" : "INFO";
  }

  private normalizeTextEntries(
    values: readonly string[],
    maximumEntries: number,
    name: string,
  ): readonly string[] {
    if (!Array.isArray(values)) {
      throw new TypeError(`${name} must be an array.`);
    }
    if (values.length > maximumEntries) {
      throw new RangeError(
        `${name} cannot contain more than ${maximumEntries} entries.`,
      );
    }

    const result: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      assertNonEmptyString(value, `${name}[${index}]`);
      const normalized = value.trim();
      if (normalized.length > this.options.maximumTextEntryLength) {
        throw new RangeError(
          `${name}[${index}] cannot exceed ${this.options.maximumTextEntryLength} characters.`,
        );
      }
      const fingerprint = normalized.toLocaleLowerCase();
      if (this.options.deduplicateTextEntries && seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      result.push(normalized);
    }
    return Object.freeze(result);
  }

  private recordExplanation(
    explanation: AutonomousDecisionExplanation,
  ): void {
    this.explanations.push(explanation);
    this.explanationById.set(explanation.explanationId, explanation);

    const decisionIds =
      this.explanationIdsByDecision.get(explanation.decisionId) ?? [];
    decisionIds.push(explanation.explanationId);
    this.explanationIdsByDecision.set(explanation.decisionId, decisionIds);

    this.metrics.explanationCount += 1;
    this.metrics.factorCount += explanation.factors.length;
    this.metrics.warningCount += explanation.warnings.length;
    this.metrics.explanationsByType[explanation.decisionType] += 1;
    this.metrics.maximumFactorCount = Math.max(
      this.metrics.maximumFactorCount,
      explanation.factors.length,
    );
    this.metrics.maximumWarningCount = Math.max(
      this.metrics.maximumWarningCount,
      explanation.warnings.length,
    );
    if (explanation.metadata.severity === "CRITICAL") {
      this.metrics.criticalExplanationCount += 1;
    }

    this.trimExplanationHistory();
  }

  private recordAuditRecord(record: AutonomousAuditRecord): void {
    this.auditRecords.push(record);
    this.auditRecordById.set(record.recordId, record);
    this.metrics.auditRecordCount += 1;
    this.metrics.auditRecordsByEntityType[record.entityType] += 1;
    this.trimAuditHistory();
  }

  private trimExplanationHistory(): void {
    while (
      this.explanations.length > this.options.maximumExplanationEntries
    ) {
      const removed = this.explanations.shift();
      if (removed === undefined) {
        break;
      }
      this.explanationById.delete(removed.explanationId);
      const ids = this.explanationIdsByDecision.get(removed.decisionId);
      if (ids !== undefined) {
        const retained = ids.filter((id) => id !== removed.explanationId);
        if (retained.length === 0) {
          this.explanationIdsByDecision.delete(removed.decisionId);
        } else {
          this.explanationIdsByDecision.set(removed.decisionId, retained);
        }
      }
    }
  }

  private trimAuditHistory(): void {
    while (this.auditRecords.length > this.options.maximumAuditEntries) {
      const removed = this.auditRecords.shift();
      if (removed === undefined) {
        break;
      }
      this.auditRecordById.delete(removed.recordId);
    }
  }

  private validateExplanationRequest(
    request: AutonomousExplanationRequest,
  ): void {
    if (request === null || typeof request !== "object") {
      throw new TypeError("request must be an object.");
    }
    assertNonEmptyString(request.correlationId, "request.correlationId");
    assertNonEmptyString(request.decisionId, "request.decisionId");
    assertNonEmptyString(request.outcome, "request.outcome");
    if (!EXPLANATION_TYPES.includes(request.decisionType)) {
      throw new RangeError("request.decisionType is unsupported.");
    }
    if (request.summary !== undefined) {
      assertNonEmptyString(request.summary, "request.summary");
    }
    if (request.strategyId !== undefined) {
      assertNonEmptyString(request.strategyId, "request.strategyId");
    }
    if (request.signalId !== undefined) {
      assertNonEmptyString(request.signalId, "request.signalId");
    }
    if (request.instrument !== undefined) {
      assertNonEmptyString(request.instrument, "request.instrument");
    }
    if (request.actor !== undefined) {
      assertNonEmptyString(request.actor, "request.actor");
    }
    if (request.occurredAt !== undefined) {
      assertTimestamp(request.occurredAt, "request.occurredAt");
    }
  }

  private validateFactorInput(
    factor: AutonomousDecisionFactorInput,
    index: number,
  ): void {
    if (factor === null || typeof factor !== "object") {
      throw new TypeError(`factors[${index}] must be an object.`);
    }
    if (factor.factorId !== undefined) {
      assertNonEmptyString(factor.factorId, `factors[${index}].factorId`);
    }
    assertNonEmptyString(factor.name, `factors[${index}].name`);
    if (
      factor.value !== null &&
      typeof factor.value !== "string" &&
      typeof factor.value !== "number" &&
      typeof factor.value !== "boolean"
    ) {
      throw new TypeError(
        `factors[${index}].value must be a string, number, boolean, or null.`,
      );
    }
    if (typeof factor.value === "number" && !Number.isFinite(factor.value)) {
      throw new RangeError(`factors[${index}].value must be finite.`);
    }
    if (factor.weight !== undefined && !Number.isFinite(factor.weight)) {
      throw new RangeError(`factors[${index}].weight must be finite.`);
    }
    if (
      factor.contribution !== undefined &&
      !Number.isFinite(factor.contribution)
    ) {
      throw new RangeError(
        `factors[${index}].contribution must be finite.`,
      );
    }
    if (factor.description !== undefined) {
      assertNonEmptyString(
        factor.description,
        `factors[${index}].description`,
      );
    }
  }

  private validateAuditRequest(request: AutonomousAuditRecordRequest): void {
    if (request === null || typeof request !== "object") {
      throw new TypeError("request must be an object.");
    }
    assertNonEmptyString(request.correlationId, "request.correlationId");
    assertNonEmptyString(request.entityId, "request.entityId");
    assertNonEmptyString(request.action, "request.action");
    if (!ENTITY_TYPES.includes(request.entityType)) {
      throw new RangeError("request.entityType is unsupported.");
    }
    if (request.actor !== undefined) {
      assertNonEmptyString(request.actor, "request.actor");
    }
    if (request.occurredAt !== undefined) {
      assertTimestamp(request.occurredAt, "request.occurredAt");
    }
  }

  private validateExplanationQuery(query: AutonomousExplanationQuery): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (query.minimumWarningCount !== undefined) {
      assertNonNegativeInteger(
        query.minimumWarningCount,
        "query.minimumWarningCount",
      );
    }
    if (query.fromCreatedAt !== undefined) {
      assertTimestamp(query.fromCreatedAt, "query.fromCreatedAt");
    }
    if (query.toCreatedAt !== undefined) {
      assertTimestamp(query.toCreatedAt, "query.toCreatedAt");
    }
    if (
      query.fromCreatedAt !== undefined &&
      query.toCreatedAt !== undefined &&
      query.fromCreatedAt > query.toCreatedAt
    ) {
      throw new RangeError("query.fromCreatedAt cannot exceed toCreatedAt.");
    }
  }

  private validateAuditQuery(query: AutonomousAuditRecordQuery): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (query.fromOccurredAt !== undefined) {
      assertTimestamp(query.fromOccurredAt, "query.fromOccurredAt");
    }
    if (query.toOccurredAt !== undefined) {
      assertTimestamp(query.toOccurredAt, "query.toOccurredAt");
    }
    if (
      query.fromOccurredAt !== undefined &&
      query.toOccurredAt !== undefined &&
      query.fromOccurredAt > query.toOccurredAt
    ) {
      throw new RangeError("query.fromOccurredAt cannot exceed toOccurredAt.");
    }
  }
}

export function createAutonomousExplainabilityEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousExplainabilityEngineOptions = {},
): AutonomousExplainabilityEngine {
  return new AutonomousExplainabilityEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}