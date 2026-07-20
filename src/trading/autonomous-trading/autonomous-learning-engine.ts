/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 14: Autonomous learning engine.
 *
 * Responsibilities:
 * - ingest and validate autonomous learning events
 * - execute deterministic event hooks
 * - aggregate strategy and model outcome statistics
 * - detect performance degradation and model drift
 * - generate bounded adaptation recommendations
 * - retain immutable event, processing, and recommendation history
 * - expose deterministic metrics and snapshots
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousLearningEvent,
  type AutonomousLearningEventType,
  type AutonomousLearningHook,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export type AutonomousLearningProcessingStatus =
  | "PROCESSED"
  | "PARTIAL"
  | "FAILED"
  | "DUPLICATE"
  | "IGNORED";

export type AutonomousLearningRecommendationAction =
  | "NO_ACTION"
  | "RECALIBRATE_MODEL"
  | "RETRAIN_MODEL"
  | "REDUCE_STRATEGY_WEIGHT"
  | "INCREASE_STRATEGY_WEIGHT"
  | "PAUSE_STRATEGY"
  | "REVIEW_RISK_LIMITS"
  | "REVIEW_ALLOCATION"
  | "REVIEW_MARKET_REGIME"
  | "MANUAL_REVIEW";

export type AutonomousLearningRecommendationSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export interface AutonomousLearningHookExecution {
  readonly executionId: string;
  readonly eventId: string;
  readonly hookId: string;
  readonly status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly startedAt: AutonomousTradingTimestamp;
  readonly completedAt: AutonomousTradingTimestamp;
  readonly latencyMs: number;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningProcessingResult {
  readonly resultId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly strategyId?: string;
  readonly modelId?: string;
  readonly eventType: AutonomousLearningEventType;
  readonly status: AutonomousLearningProcessingStatus;
  readonly hookExecutions: readonly AutonomousLearningHookExecution[];
  readonly generatedRecommendationIds: readonly string[];
  readonly processedAt: AutonomousTradingTimestamp;
  readonly latencyMs: number;
  readonly reason: string;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningRecommendation {
  readonly recommendationId: string;
  readonly correlationId: string;
  readonly strategyId?: string;
  readonly modelId?: string;
  readonly sourceEventId: string;
  readonly action: AutonomousLearningRecommendationAction;
  readonly severity: AutonomousLearningRecommendationSeverity;
  readonly confidence: number;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly createdAt: AutonomousTradingTimestamp;
  readonly expiresAt?: AutonomousTradingTimestamp;
  readonly acknowledged: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousStrategyLearningProfile {
  readonly strategyId: string;
  readonly eventCount: number;
  readonly signalOutcomeCount: number;
  readonly positiveSignalOutcomeCount: number;
  readonly negativeSignalOutcomeCount: number;
  readonly tradeOutcomeCount: number;
  readonly winningTradeCount: number;
  readonly losingTradeCount: number;
  readonly breakevenTradeCount: number;
  readonly cumulativeRealizedPnl: number;
  readonly averageTradePnl: number;
  readonly winRate: number;
  readonly cumulativeReward: number;
  readonly averageReward: number;
  readonly riskBreachCount: number;
  readonly degradationEventCount: number;
  readonly regimeChangeCount: number;
  readonly allocationChangeCount: number;
  readonly manualFeedbackCount: number;
  readonly positiveFeedbackCount: number;
  readonly negativeFeedbackCount: number;
  readonly recentOutcomeScore: number;
  readonly stabilityScore: number;
  readonly degradationScore: number;
  readonly lastEventAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousModelLearningProfile {
  readonly modelId: string;
  readonly eventCount: number;
  readonly signalOutcomeCount: number;
  readonly correctPredictionCount: number;
  readonly incorrectPredictionCount: number;
  readonly predictionAccuracy: number;
  readonly driftEventCount: number;
  readonly currentDriftScore: number;
  readonly maximumDriftScore: number;
  readonly cumulativeReward: number;
  readonly averageReward: number;
  readonly degradationScore: number;
  readonly lastEventAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningEngineMetrics {
  readonly registeredHookCount: number;
  readonly enabledHookCount: number;
  readonly eventCount: number;
  readonly processedEventCount: number;
  readonly partialEventCount: number;
  readonly failedEventCount: number;
  readonly duplicateEventCount: number;
  readonly ignoredEventCount: number;
  readonly hookExecutionCount: number;
  readonly successfulHookExecutionCount: number;
  readonly failedHookExecutionCount: number;
  readonly skippedHookExecutionCount: number;
  readonly recommendationCount: number;
  readonly criticalRecommendationCount: number;
  readonly strategyProfileCount: number;
  readonly modelProfileCount: number;
  readonly averageProcessingLatencyMs: number;
  readonly maximumProcessingLatencyMs: number;
}

export interface AutonomousLearningEngineSnapshot {
  readonly capturedAt: AutonomousTradingTimestamp;
  readonly hooks: readonly AutonomousLearningHookDescriptor[];
  readonly strategyProfiles: readonly AutonomousStrategyLearningProfile[];
  readonly modelProfiles: readonly AutonomousModelLearningProfile[];
  readonly recentEvents: readonly AutonomousLearningEvent[];
  readonly recentResults: readonly AutonomousLearningProcessingResult[];
  readonly recommendations: readonly AutonomousLearningRecommendation[];
  readonly metrics: AutonomousLearningEngineMetrics;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningHookDescriptor {
  readonly hookId: string;
  readonly eventTypes: readonly AutonomousLearningEventType[];
  readonly enabled: boolean;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousLearningEventQuery {
  readonly correlationId?: string;
  readonly strategyId?: string;
  readonly modelId?: string;
  readonly eventType?: AutonomousLearningEventType;
  readonly label?: string;
  readonly fromOccurredAt?: AutonomousTradingTimestamp;
  readonly toOccurredAt?: AutonomousTradingTimestamp;
  readonly limit?: number;
}

export interface AutonomousLearningRecommendationQuery {
  readonly strategyId?: string;
  readonly modelId?: string;
  readonly action?: AutonomousLearningRecommendationAction;
  readonly severity?: AutonomousLearningRecommendationSeverity;
  readonly acknowledged?: boolean;
  readonly fromCreatedAt?: AutonomousTradingTimestamp;
  readonly toCreatedAt?: AutonomousTradingTimestamp;
  readonly limit?: number;
}

export interface AutonomousLearningEngineThresholds {
  readonly warningModelDriftScore: number;
  readonly criticalModelDriftScore: number;
  readonly warningStrategyDegradationScore: number;
  readonly criticalStrategyDegradationScore: number;
  readonly minimumWinRate: number;
  readonly strongWinRate: number;
  readonly minimumPredictionAccuracy: number;
  readonly strongPredictionAccuracy: number;
  readonly minimumSamplesForRecommendation: number;
  readonly negativeRewardThreshold: number;
  readonly positiveRewardThreshold: number;
}

export interface AutonomousLearningEngineOptions {
  readonly maximumHistoryEntries?: number;
  readonly maximumRecommendationEntries?: number;
  readonly maximumEventAgeMs?: number;
  readonly recommendationTtlMs?: number;
  readonly stopOnHookFailure?: boolean;
  readonly rejectDuplicateEvents?: boolean;
  readonly thresholds?: Partial<AutonomousLearningEngineThresholds>;
  readonly metadata?: AutonomousTradingMetadata;
}

interface ResolvedAutonomousLearningEngineOptions {
  readonly maximumHistoryEntries: number;
  readonly maximumRecommendationEntries: number;
  readonly maximumEventAgeMs: number;
  readonly recommendationTtlMs: number;
  readonly stopOnHookFailure: boolean;
  readonly rejectDuplicateEvents: boolean;
  readonly thresholds: AutonomousLearningEngineThresholds;
  readonly metadata: AutonomousTradingMetadata;
}

interface MutableStrategyProfile {
  strategyId: string;
  eventCount: number;
  signalOutcomeCount: number;
  positiveSignalOutcomeCount: number;
  negativeSignalOutcomeCount: number;
  tradeOutcomeCount: number;
  winningTradeCount: number;
  losingTradeCount: number;
  breakevenTradeCount: number;
  cumulativeRealizedPnl: number;
  cumulativeReward: number;
  riskBreachCount: number;
  degradationEventCount: number;
  regimeChangeCount: number;
  allocationChangeCount: number;
  manualFeedbackCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  recentOutcomeScore: number;
  stabilityScore: number;
  degradationScore: number;
  lastEventAt: number;
  metadata: AutonomousTradingMetadata;
}

interface MutableModelProfile {
  modelId: string;
  eventCount: number;
  signalOutcomeCount: number;
  correctPredictionCount: number;
  incorrectPredictionCount: number;
  driftEventCount: number;
  currentDriftScore: number;
  maximumDriftScore: number;
  cumulativeReward: number;
  degradationScore: number;
  lastEventAt: number;
  metadata: AutonomousTradingMetadata;
}

interface MutableLearningMetrics {
  eventCount: number;
  processedEventCount: number;
  partialEventCount: number;
  failedEventCount: number;
  duplicateEventCount: number;
  ignoredEventCount: number;
  hookExecutionCount: number;
  successfulHookExecutionCount: number;
  failedHookExecutionCount: number;
  skippedHookExecutionCount: number;
  recommendationCount: number;
  criticalRecommendationCount: number;
  totalProcessingLatencyMs: number;
  maximumProcessingLatencyMs: number;
}

const DEFAULT_THRESHOLDS: AutonomousLearningEngineThresholds = Object.freeze({
  warningModelDriftScore: 0.4,
  criticalModelDriftScore: 0.7,
  warningStrategyDegradationScore: 0.4,
  criticalStrategyDegradationScore: 0.7,
  minimumWinRate: 0.4,
  strongWinRate: 0.6,
  minimumPredictionAccuracy: 0.5,
  strongPredictionAccuracy: 0.7,
  minimumSamplesForRecommendation: 10,
  negativeRewardThreshold: -0.25,
  positiveRewardThreshold: 0.25,
});

const DEFAULT_OPTIONS = Object.freeze({
  maximumHistoryEntries: 10_000,
  maximumRecommendationEntries: 5_000,
  maximumEventAgeMs: 86_400_000,
  recommendationTtlMs: 86_400_000,
  stopOnHookFailure: false,
  rejectDuplicateEvents: false,
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

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite timestamp.`);
  }
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive.`);
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

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneUnknown));
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = cloneUnknown(nested);
    }
    return Object.freeze(output);
  }
  return value;
}

function freezeEvent(event: AutonomousLearningEvent): AutonomousLearningEvent {
  return Object.freeze({
    ...event,
    payload: cloneUnknown(event.payload) as Readonly<Record<string, unknown>>,
    labels: Object.freeze([...event.labels]),
    metadata: freezeMetadata(event.metadata),
  });
}

function freezeHookDescriptor(
  hook: AutonomousLearningHook,
): AutonomousLearningHookDescriptor {
  return Object.freeze({
    hookId: hook.hookId,
    eventTypes: Object.freeze([...hook.eventTypes]),
    enabled: hook.enabled,
    metadata: freezeMetadata(hook.metadata),
  });
}

function freezeHookExecution(
  execution: AutonomousLearningHookExecution,
): AutonomousLearningHookExecution {
  return Object.freeze({
    ...execution,
    metadata: freezeMetadata(execution.metadata),
  });
}

function freezeResult(
  result: AutonomousLearningProcessingResult,
): AutonomousLearningProcessingResult {
  return Object.freeze({
    ...result,
    hookExecutions: Object.freeze(
      result.hookExecutions.map(freezeHookExecution),
    ),
    generatedRecommendationIds: Object.freeze([
      ...result.generatedRecommendationIds,
    ]),
    metadata: freezeMetadata(result.metadata),
  });
}

function freezeRecommendation(
  recommendation: AutonomousLearningRecommendation,
): AutonomousLearningRecommendation {
  return Object.freeze({
    ...recommendation,
    evidence: Object.freeze([...recommendation.evidence]),
    metadata: freezeMetadata(recommendation.metadata),
  });
}

function numericPayload(
  event: AutonomousLearningEvent,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function booleanPayload(
  event: AutonomousLearningEvent,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function stringPayload(
  event: AutonomousLearningEvent,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function compareEvents(
  left: AutonomousLearningEvent,
  right: AutonomousLearningEvent,
): number {
  return (
    left.occurredAt - right.occurredAt ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareRecommendations(
  left: AutonomousLearningRecommendation,
  right: AutonomousLearningRecommendation,
): number {
  return (
    left.createdAt - right.createdAt ||
    left.recommendationId.localeCompare(right.recommendationId)
  );
}

export class AutonomousLearningEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousLearningEngineOptions;
  private readonly hooks = new Map<string, AutonomousLearningHook>();
  private readonly events: AutonomousLearningEvent[] = [];
  private readonly results: AutonomousLearningProcessingResult[] = [];
  private readonly recommendations: AutonomousLearningRecommendation[] = [];
  private readonly strategyProfiles = new Map<string, MutableStrategyProfile>();
  private readonly modelProfiles = new Map<string, MutableModelProfile>();
  private readonly eventIds = new Set<string>();
  private readonly metricsState: MutableLearningMetrics = {
    eventCount: 0,
    processedEventCount: 0,
    partialEventCount: 0,
    failedEventCount: 0,
    duplicateEventCount: 0,
    ignoredEventCount: 0,
    hookExecutionCount: 0,
    successfulHookExecutionCount: 0,
    failedHookExecutionCount: 0,
    skippedHookExecutionCount: 0,
    recommendationCount: 0,
    criticalRecommendationCount: 0,
    totalProcessingLatencyMs: 0,
    maximumProcessingLatencyMs: 0,
  };

  private resultSequence = 0;
  private hookExecutionSequence = 0;
  private recommendationSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousLearningEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const maximumHistoryEntries =
      options.maximumHistoryEntries ?? DEFAULT_OPTIONS.maximumHistoryEntries;
    const maximumRecommendationEntries =
      options.maximumRecommendationEntries ??
      DEFAULT_OPTIONS.maximumRecommendationEntries;
    const maximumEventAgeMs =
      options.maximumEventAgeMs ?? DEFAULT_OPTIONS.maximumEventAgeMs;
    const recommendationTtlMs =
      options.recommendationTtlMs ?? DEFAULT_OPTIONS.recommendationTtlMs;

    assertPositiveInteger(maximumHistoryEntries, "maximumHistoryEntries");
    assertPositiveInteger(
      maximumRecommendationEntries,
      "maximumRecommendationEntries",
    );
    assertTimestamp(maximumEventAgeMs, "maximumEventAgeMs");
    assertTimestamp(recommendationTtlMs, "recommendationTtlMs");

    const thresholds = Object.freeze({
      ...DEFAULT_THRESHOLDS,
      ...options.thresholds,
    });
    this.validateThresholds(thresholds);

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      maximumHistoryEntries,
      maximumRecommendationEntries,
      maximumEventAgeMs,
      recommendationTtlMs,
      stopOnHookFailure:
        options.stopOnHookFailure ?? DEFAULT_OPTIONS.stopOnHookFailure,
      rejectDuplicateEvents:
        options.rejectDuplicateEvents ?? DEFAULT_OPTIONS.rejectDuplicateEvents,
      thresholds,
      metadata: freezeMetadata(options.metadata),
    });
  }

  public registerHook(hook: AutonomousLearningHook): void {
    this.validateHook(hook);
    if (this.hooks.has(hook.hookId)) {
      throw new Error(`Learning hook '${hook.hookId}' is already registered.`);
    }
    this.hooks.set(
      hook.hookId,
      Object.freeze({
        ...hook,
        eventTypes: Object.freeze([...hook.eventTypes]),
        metadata: freezeMetadata(hook.metadata),
      }),
    );
  }

  public replaceHook(hook: AutonomousLearningHook): void {
    this.validateHook(hook);
    this.hooks.set(
      hook.hookId,
      Object.freeze({
        ...hook,
        eventTypes: Object.freeze([...hook.eventTypes]),
        metadata: freezeMetadata(hook.metadata),
      }),
    );
  }

  public unregisterHook(hookId: string): boolean {
    assertNonEmptyString(hookId, "hookId");
    return this.hooks.delete(hookId);
  }

  public listHooks(): readonly AutonomousLearningHookDescriptor[] {
    return Object.freeze(
      [...this.hooks.values()]
        .sort((left, right) => left.hookId.localeCompare(right.hookId))
        .map(freezeHookDescriptor),
    );
  }

  public async ingest(
    event: AutonomousLearningEvent,
  ): Promise<AutonomousLearningProcessingResult> {
    const startedAt = this.clock.now();
    assertTimestamp(startedAt, "clock.now()");

    const validation = this.validator.validateLearningEvent(event);
    this.validator.assertValid(validation, "Learning event is invalid.");
    this.validateEventSemantics(event, startedAt);

    if (this.eventIds.has(event.eventId)) {
      this.metricsState.eventCount += 1;
      this.metricsState.duplicateEventCount += 1;
      if (this.options.rejectDuplicateEvents) {
        throw new Error(`Learning event '${event.eventId}' is a duplicate.`);
      }
      return this.recordResult({
        event,
        status: "DUPLICATE",
        hookExecutions: [],
        recommendationIds: [],
        startedAt,
        reason: "Duplicate learning event ignored.",
      });
    }

    const storedEvent = freezeEvent(event);
    this.eventIds.add(storedEvent.eventId);
    this.events.push(storedEvent);
    this.events.sort(compareEvents);
    this.metricsState.eventCount += 1;

    const hookExecutions: AutonomousLearningHookExecution[] = [];
    let hookFailureCount = 0;

    for (const hook of [...this.hooks.values()].sort((left, right) =>
      left.hookId.localeCompare(right.hookId),
    )) {
      if (!hook.enabled || !hook.eventTypes.includes(event.eventType)) {
        hookExecutions.push(
          this.createSkippedHookExecution(
            event,
            hook,
            "Hook is disabled or does not subscribe to this event type.",
          ),
        );
        continue;
      }

      const execution = await this.executeHook(hook, storedEvent);
      hookExecutions.push(execution);
      if (execution.status === "FAILED") {
        hookFailureCount += 1;
        if (this.options.stopOnHookFailure) {
          break;
        }
      }
    }

    this.updateProfiles(storedEvent);
    const generated = this.generateRecommendations(storedEvent);

    const status: AutonomousLearningProcessingStatus =
      hookFailureCount === 0
        ? "PROCESSED"
        : hookFailureCount < hookExecutions.length
          ? "PARTIAL"
          : "FAILED";

    return this.recordResult({
      event: storedEvent,
      status,
      hookExecutions,
      recommendationIds: generated.map(
        (recommendation) => recommendation.recommendationId,
      ),
      startedAt,
      reason:
        status === "PROCESSED"
          ? "Learning event processed successfully."
          : status === "PARTIAL"
            ? "Learning event processed with one or more hook failures."
            : "Learning event processing failed.",
    });
  }

  public ingestMany(
    events: readonly AutonomousLearningEvent[],
  ): Promise<readonly AutonomousLearningProcessingResult[]> {
    return this.ingestSequentially(events);
  }

  public getStrategyProfile(
    strategyId: string,
  ): AutonomousStrategyLearningProfile | undefined {
    assertNonEmptyString(strategyId, "strategyId");
    const profile = this.strategyProfiles.get(strategyId);
    return profile === undefined
      ? undefined
      : this.freezeStrategyProfile(profile);
  }

  public getModelProfile(
    modelId: string,
  ): AutonomousModelLearningProfile | undefined {
    assertNonEmptyString(modelId, "modelId");
    const profile = this.modelProfiles.get(modelId);
    return profile === undefined ? undefined : this.freezeModelProfile(profile);
  }

  public listStrategyProfiles(): readonly AutonomousStrategyLearningProfile[] {
    return Object.freeze(
      [...this.strategyProfiles.values()]
        .sort((left, right) =>
          left.strategyId.localeCompare(right.strategyId),
        )
        .map((profile) => this.freezeStrategyProfile(profile)),
    );
  }

  public listModelProfiles(): readonly AutonomousModelLearningProfile[] {
    return Object.freeze(
      [...this.modelProfiles.values()]
        .sort((left, right) => left.modelId.localeCompare(right.modelId))
        .map((profile) => this.freezeModelProfile(profile)),
    );
  }

  public queryEvents(
    query: AutonomousLearningEventQuery = {},
  ): readonly AutonomousLearningEvent[] {
    this.validateEventQuery(query);
    const limit = query.limit ?? this.options.maximumHistoryEntries;
    return Object.freeze(
      this.events
        .filter((event) => {
          if (
            query.correlationId !== undefined &&
            event.correlationId !== query.correlationId
          ) return false;
          if (
            query.strategyId !== undefined &&
            event.strategyId !== query.strategyId
          ) return false;
          if (
            query.modelId !== undefined &&
            event.modelId !== query.modelId
          ) return false;
          if (
            query.eventType !== undefined &&
            event.eventType !== query.eventType
          ) return false;
          if (
            query.label !== undefined &&
            !event.labels.includes(query.label)
          ) return false;
          if (
            query.fromOccurredAt !== undefined &&
            event.occurredAt < query.fromOccurredAt
          ) return false;
          if (
            query.toOccurredAt !== undefined &&
            event.occurredAt > query.toOccurredAt
          ) return false;
          return true;
        })
        .sort(compareEvents)
        .slice(-limit),
    );
  }

  public queryRecommendations(
    query: AutonomousLearningRecommendationQuery = {},
  ): readonly AutonomousLearningRecommendation[] {
    this.validateRecommendationQuery(query);
    const limit = query.limit ?? this.options.maximumRecommendationEntries;
    return Object.freeze(
      this.recommendations
        .filter((recommendation) => {
          if (
            query.strategyId !== undefined &&
            recommendation.strategyId !== query.strategyId
          ) return false;
          if (
            query.modelId !== undefined &&
            recommendation.modelId !== query.modelId
          ) return false;
          if (
            query.action !== undefined &&
            recommendation.action !== query.action
          ) return false;
          if (
            query.severity !== undefined &&
            recommendation.severity !== query.severity
          ) return false;
          if (
            query.acknowledged !== undefined &&
            recommendation.acknowledged !== query.acknowledged
          ) return false;
          if (
            query.fromCreatedAt !== undefined &&
            recommendation.createdAt < query.fromCreatedAt
          ) return false;
          if (
            query.toCreatedAt !== undefined &&
            recommendation.createdAt > query.toCreatedAt
          ) return false;
          return true;
        })
        .sort(compareRecommendations)
        .slice(-limit),
    );
  }

  public acknowledgeRecommendation(
    recommendationId: string,
    acknowledgedAt = this.clock.now(),
  ): AutonomousLearningRecommendation {
    assertNonEmptyString(recommendationId, "recommendationId");
    assertTimestamp(acknowledgedAt, "acknowledgedAt");

    const index = this.recommendations.findIndex(
      (recommendation) =>
        recommendation.recommendationId === recommendationId,
    );
    if (index < 0) {
      throw new Error(
        `Learning recommendation '${recommendationId}' was not found.`,
      );
    }

    const current = this.recommendations[index]!;
    if (current.acknowledged) {
      return current;
    }

    const updated = freezeRecommendation({
      ...current,
      acknowledged: true,
      metadata: freezeMetadata({
        ...current.metadata,
        acknowledgedAt,
      }),
    });
    this.recommendations[index] = updated;
    return updated;
  }

  public metrics(): AutonomousLearningEngineMetrics {
    const state = this.metricsState;
    return Object.freeze({
      registeredHookCount: this.hooks.size,
      enabledHookCount: [...this.hooks.values()].filter(
        (hook) => hook.enabled,
      ).length,
      eventCount: state.eventCount,
      processedEventCount: state.processedEventCount,
      partialEventCount: state.partialEventCount,
      failedEventCount: state.failedEventCount,
      duplicateEventCount: state.duplicateEventCount,
      ignoredEventCount: state.ignoredEventCount,
      hookExecutionCount: state.hookExecutionCount,
      successfulHookExecutionCount: state.successfulHookExecutionCount,
      failedHookExecutionCount: state.failedHookExecutionCount,
      skippedHookExecutionCount: state.skippedHookExecutionCount,
      recommendationCount: state.recommendationCount,
      criticalRecommendationCount: state.criticalRecommendationCount,
      strategyProfileCount: this.strategyProfiles.size,
      modelProfileCount: this.modelProfiles.size,
      averageProcessingLatencyMs:
        state.eventCount === 0
          ? 0
          : state.totalProcessingLatencyMs / state.eventCount,
      maximumProcessingLatencyMs: state.maximumProcessingLatencyMs,
    });
  }

  public snapshot(
    capturedAt = this.clock.now(),
  ): AutonomousLearningEngineSnapshot {
    assertTimestamp(capturedAt, "capturedAt");
    return Object.freeze({
      capturedAt,
      hooks: this.listHooks(),
      strategyProfiles: this.listStrategyProfiles(),
      modelProfiles: this.listModelProfiles(),
      recentEvents: Object.freeze([...this.events]),
      recentResults: Object.freeze([...this.results]),
      recommendations: Object.freeze([...this.recommendations]),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  public clearHistory(preserveProfiles = false): void {
    this.events.length = 0;
    this.results.length = 0;
    this.recommendations.length = 0;
    this.eventIds.clear();
    if (!preserveProfiles) {
      this.strategyProfiles.clear();
      this.modelProfiles.clear();
    }
    Object.assign(this.metricsState, {
      eventCount: 0,
      processedEventCount: 0,
      partialEventCount: 0,
      failedEventCount: 0,
      duplicateEventCount: 0,
      ignoredEventCount: 0,
      hookExecutionCount: 0,
      successfulHookExecutionCount: 0,
      failedHookExecutionCount: 0,
      skippedHookExecutionCount: 0,
      recommendationCount: 0,
      criticalRecommendationCount: 0,
      totalProcessingLatencyMs: 0,
      maximumProcessingLatencyMs: 0,
    });
  }

  private async ingestSequentially(
    events: readonly AutonomousLearningEvent[],
  ): Promise<readonly AutonomousLearningProcessingResult[]> {
    const results: AutonomousLearningProcessingResult[] = [];
    for (const event of events) {
      results.push(await this.ingest(event));
    }
    return Object.freeze(results);
  }

  private async executeHook(
    hook: AutonomousLearningHook,
    event: AutonomousLearningEvent,
  ): Promise<AutonomousLearningHookExecution> {
    const startedAt = this.clock.now();
    this.metricsState.hookExecutionCount += 1;
    try {
      await hook.process(event);
      const completedAt = this.clock.now();
      const execution = freezeHookExecution({
        executionId: this.idFactory.create(
          "autonomous-learning-hook-execution",
          completedAt,
          this.hookExecutionSequence++,
        ),
        eventId: event.eventId,
        hookId: hook.hookId,
        status: "SUCCEEDED",
        startedAt,
        completedAt,
        latencyMs: Math.max(0, completedAt - startedAt),
        reason: "Learning hook completed successfully.",
        metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
      });
      this.metricsState.successfulHookExecutionCount += 1;
      return execution;
    } catch (error) {
      const completedAt = this.clock.now();
      const execution = freezeHookExecution({
        executionId: this.idFactory.create(
          "autonomous-learning-hook-execution",
          completedAt,
          this.hookExecutionSequence++,
        ),
        eventId: event.eventId,
        hookId: hook.hookId,
        status: "FAILED",
        startedAt,
        completedAt,
        latencyMs: Math.max(0, completedAt - startedAt),
        reason:
          error instanceof Error
            ? error.message
            : "Unknown learning hook failure.",
        metadata: freezeMetadata({
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      });
      this.metricsState.failedHookExecutionCount += 1;
      return execution;
    }
  }

  private createSkippedHookExecution(
    event: AutonomousLearningEvent,
    hook: AutonomousLearningHook,
    reason: string,
  ): AutonomousLearningHookExecution {
    const now = this.clock.now();
    this.metricsState.hookExecutionCount += 1;
    this.metricsState.skippedHookExecutionCount += 1;
    return freezeHookExecution({
      executionId: this.idFactory.create(
        "autonomous-learning-hook-execution",
        now,
        this.hookExecutionSequence++,
      ),
      eventId: event.eventId,
      hookId: hook.hookId,
      status: "SKIPPED",
      startedAt: now,
      completedAt: now,
      latencyMs: 0,
      reason,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });
  }

  private updateProfiles(event: AutonomousLearningEvent): void {
    if (event.strategyId !== undefined) {
      this.updateStrategyProfile(
        this.getOrCreateStrategyProfile(event.strategyId, event.occurredAt),
        event,
      );
    }
    if (event.modelId !== undefined) {
      this.updateModelProfile(
        this.getOrCreateModelProfile(event.modelId, event.occurredAt),
        event,
      );
    }
  }

  private updateStrategyProfile(
    profile: MutableStrategyProfile,
    event: AutonomousLearningEvent,
  ): void {
    profile.eventCount += 1;
    profile.lastEventAt = Math.max(profile.lastEventAt, event.occurredAt);

    const reward =
      numericPayload(event, ["reward", "score", "outcomeScore"]) ?? 0;
    profile.cumulativeReward += reward;
    profile.recentOutcomeScore = clamp(
      profile.recentOutcomeScore * 0.8 + clamp((reward + 1) / 2) * 0.2,
    );

    switch (event.eventType) {
      case "SIGNAL_OUTCOME": {
        profile.signalOutcomeCount += 1;
        const correct =
          booleanPayload(event, ["correct", "successful", "profitable"]) ??
          reward > 0;
        if (correct) {
          profile.positiveSignalOutcomeCount += 1;
        } else {
          profile.negativeSignalOutcomeCount += 1;
        }
        break;
      }
      case "TRADE_OUTCOME": {
        profile.tradeOutcomeCount += 1;
        const pnl =
          numericPayload(event, [
            "realizedPnl",
            "pnl",
            "netPnl",
            "profit",
          ]) ?? 0;
        profile.cumulativeRealizedPnl += pnl;
        if (pnl > 0) profile.winningTradeCount += 1;
        else if (pnl < 0) profile.losingTradeCount += 1;
        else profile.breakevenTradeCount += 1;
        break;
      }
      case "RISK_BREACH":
        profile.riskBreachCount += 1;
        break;
      case "STRATEGY_DEGRADATION":
        profile.degradationEventCount += 1;
        profile.degradationScore = Math.max(
          profile.degradationScore,
          clamp(
            numericPayload(event, [
              "degradationScore",
              "severityScore",
              "score",
            ]) ?? 0.5,
          ),
        );
        break;
      case "REGIME_CHANGE":
        profile.regimeChangeCount += 1;
        break;
      case "ALLOCATION_CHANGE":
        profile.allocationChangeCount += 1;
        break;
      case "MANUAL_FEEDBACK": {
        profile.manualFeedbackCount += 1;
        const sentiment =
          stringPayload(event, ["sentiment", "feedback"]) ?? "";
        const positive =
          booleanPayload(event, ["positive", "approved"]) ??
          sentiment.toLowerCase() === "positive";
        if (positive) profile.positiveFeedbackCount += 1;
        else profile.negativeFeedbackCount += 1;
        break;
      }
      case "MODEL_DRIFT":
        profile.degradationScore = Math.max(
          profile.degradationScore,
          clamp(numericPayload(event, ["driftScore", "score"]) ?? 0),
        );
        break;
      default:
        this.assertNever(event.eventType);
    }

    const successCount =
      profile.winningTradeCount + profile.positiveSignalOutcomeCount;
    const failureCount =
      profile.losingTradeCount + profile.negativeSignalOutcomeCount;
    const outcomeCount = successCount + failureCount;
    const outcomeBalance =
      outcomeCount === 0
        ? 0.5
        : successCount / outcomeCount;
    profile.stabilityScore = clamp(
      1 -
        profile.degradationScore * 0.5 -
        Math.min(1, profile.riskBreachCount / 10) * 0.25 -
        Math.abs(0.5 - outcomeBalance) * 0.5,
    );
  }

  private updateModelProfile(
    profile: MutableModelProfile,
    event: AutonomousLearningEvent,
  ): void {
    profile.eventCount += 1;
    profile.lastEventAt = Math.max(profile.lastEventAt, event.occurredAt);

    const reward =
      numericPayload(event, ["reward", "score", "outcomeScore"]) ?? 0;
    profile.cumulativeReward += reward;

    if (event.eventType === "SIGNAL_OUTCOME") {
      profile.signalOutcomeCount += 1;
      const correct =
        booleanPayload(event, ["correct", "successful", "profitable"]) ??
        reward > 0;
      if (correct) profile.correctPredictionCount += 1;
      else profile.incorrectPredictionCount += 1;
    }

    if (event.eventType === "MODEL_DRIFT") {
      profile.driftEventCount += 1;
      const drift = clamp(
        numericPayload(event, [
          "driftScore",
          "populationStabilityIndex",
          "score",
        ]) ?? 0,
      );
      profile.currentDriftScore = drift;
      profile.maximumDriftScore = Math.max(
        profile.maximumDriftScore,
        drift,
      );
    }

    profile.degradationScore = clamp(
      Math.max(
        profile.currentDriftScore,
        profile.signalOutcomeCount === 0
          ? 0
          : 1 -
              ratio(
                profile.correctPredictionCount,
                profile.signalOutcomeCount,
              ),
      ),
    );
  }

  private generateRecommendations(
    event: AutonomousLearningEvent,
  ): readonly AutonomousLearningRecommendation[] {
    const generated: AutonomousLearningRecommendation[] = [];
    const t = this.options.thresholds;

    if (event.modelId !== undefined) {
      const profile = this.modelProfiles.get(event.modelId)!;
      if (profile.currentDriftScore >= t.criticalModelDriftScore) {
        generated.push(
          this.createRecommendation(
            event,
            "RETRAIN_MODEL",
            "CRITICAL",
            profile.currentDriftScore,
            "Model drift reached the critical threshold.",
            [
              `Current drift score: ${profile.currentDriftScore.toFixed(6)}`,
              `Maximum drift score: ${profile.maximumDriftScore.toFixed(6)}`,
            ],
          ),
        );
      } else if (profile.currentDriftScore >= t.warningModelDriftScore) {
        generated.push(
          this.createRecommendation(
            event,
            "RECALIBRATE_MODEL",
            "WARNING",
            profile.currentDriftScore,
            "Model drift reached the warning threshold.",
            [
              `Current drift score: ${profile.currentDriftScore.toFixed(6)}`,
            ],
          ),
        );
      }

      if (
        profile.signalOutcomeCount >= t.minimumSamplesForRecommendation
      ) {
        const accuracy = ratio(
          profile.correctPredictionCount,
          profile.signalOutcomeCount,
        );
        if (accuracy < t.minimumPredictionAccuracy) {
          generated.push(
            this.createRecommendation(
              event,
              "RETRAIN_MODEL",
              "WARNING",
              clamp(1 - accuracy),
              "Model prediction accuracy is below the minimum threshold.",
              [
                `Prediction accuracy: ${accuracy.toFixed(6)}`,
                `Signal samples: ${profile.signalOutcomeCount}`,
              ],
            ),
          );
        }
      }
    }

    if (event.strategyId !== undefined) {
      const profile = this.strategyProfiles.get(event.strategyId)!;
      if (
        profile.degradationScore >=
        t.criticalStrategyDegradationScore
      ) {
        generated.push(
          this.createRecommendation(
            event,
            "PAUSE_STRATEGY",
            "CRITICAL",
            profile.degradationScore,
            "Strategy degradation reached the critical threshold.",
            [
              `Degradation score: ${profile.degradationScore.toFixed(6)}`,
              `Risk breaches: ${profile.riskBreachCount}`,
            ],
          ),
        );
      } else if (
        profile.degradationScore >=
        t.warningStrategyDegradationScore
      ) {
        generated.push(
          this.createRecommendation(
            event,
            "REDUCE_STRATEGY_WEIGHT",
            "WARNING",
            profile.degradationScore,
            "Strategy degradation reached the warning threshold.",
            [
              `Degradation score: ${profile.degradationScore.toFixed(6)}`,
            ],
          ),
        );
      }

      if (
        profile.tradeOutcomeCount >= t.minimumSamplesForRecommendation
      ) {
        const winRate = ratio(
          profile.winningTradeCount,
          profile.tradeOutcomeCount,
        );
        if (winRate < t.minimumWinRate) {
          generated.push(
            this.createRecommendation(
              event,
              "REDUCE_STRATEGY_WEIGHT",
              "WARNING",
              clamp(1 - winRate),
              "Strategy win rate is below the minimum threshold.",
              [
                `Win rate: ${winRate.toFixed(6)}`,
                `Trade samples: ${profile.tradeOutcomeCount}`,
              ],
            ),
          );
        } else if (
          winRate >= t.strongWinRate &&
          profile.cumulativeRealizedPnl > 0 &&
          profile.riskBreachCount === 0
        ) {
          generated.push(
            this.createRecommendation(
              event,
              "INCREASE_STRATEGY_WEIGHT",
              "INFO",
              winRate,
              "Strategy exhibits strong risk-adjusted outcome evidence.",
              [
                `Win rate: ${winRate.toFixed(6)}`,
                `Cumulative PnL: ${profile.cumulativeRealizedPnl.toFixed(6)}`,
              ],
            ),
          );
        }
      }

      if (event.eventType === "RISK_BREACH") {
        generated.push(
          this.createRecommendation(
            event,
            "REVIEW_RISK_LIMITS",
            "WARNING",
            0.75,
            "A risk breach requires policy and limit review.",
            [`Risk breach count: ${profile.riskBreachCount}`],
          ),
        );
      } else if (event.eventType === "ALLOCATION_CHANGE") {
        generated.push(
          this.createRecommendation(
            event,
            "REVIEW_ALLOCATION",
            "INFO",
            0.6,
            "Capital allocation changed and should be evaluated against outcomes.",
            [`Allocation change count: ${profile.allocationChangeCount}`],
          ),
        );
      } else if (event.eventType === "REGIME_CHANGE") {
        generated.push(
          this.createRecommendation(
            event,
            "REVIEW_MARKET_REGIME",
            "INFO",
            0.7,
            "Market regime changed and strategy assumptions should be reviewed.",
            [`Regime change count: ${profile.regimeChangeCount}`],
          ),
        );
      }
    }

    this.recommendations.push(...generated);
    this.recommendations.sort(compareRecommendations);
    this.metricsState.recommendationCount += generated.length;
    this.metricsState.criticalRecommendationCount += generated.filter(
      (recommendation) => recommendation.severity === "CRITICAL",
    ).length;
    this.trimHistory();
    return Object.freeze(generated);
  }

  private createRecommendation(
    event: AutonomousLearningEvent,
    action: AutonomousLearningRecommendationAction,
    severity: AutonomousLearningRecommendationSeverity,
    confidence: number,
    reason: string,
    evidence: readonly string[],
  ): AutonomousLearningRecommendation {
    const createdAt = this.clock.now();
    return freezeRecommendation({
      recommendationId: this.idFactory.create(
        "autonomous-learning-recommendation",
        createdAt,
        this.recommendationSequence++,
      ),
      correlationId: event.correlationId,
      strategyId: event.strategyId,
      modelId: event.modelId,
      sourceEventId: event.eventId,
      action,
      severity,
      confidence: clamp(confidence),
      reason,
      evidence,
      createdAt,
      expiresAt:
        this.options.recommendationTtlMs === 0
          ? undefined
          : createdAt + this.options.recommendationTtlMs,
      acknowledged: false,
      metadata: freezeMetadata({
        sourceEventType: event.eventType,
        ...event.metadata,
      }),
    });
  }

  private recordResult(input: {
    readonly event: AutonomousLearningEvent;
    readonly status: AutonomousLearningProcessingStatus;
    readonly hookExecutions: readonly AutonomousLearningHookExecution[];
    readonly recommendationIds: readonly string[];
    readonly startedAt: number;
    readonly reason: string;
  }): AutonomousLearningProcessingResult {
    const processedAt = this.clock.now();
    const latencyMs = Math.max(0, processedAt - input.startedAt);
    const result = freezeResult({
      resultId: this.idFactory.create(
        "autonomous-learning-result",
        processedAt,
        this.resultSequence++,
      ),
      eventId: input.event.eventId,
      correlationId: input.event.correlationId,
      strategyId: input.event.strategyId,
      modelId: input.event.modelId,
      eventType: input.event.eventType,
      status: input.status,
      hookExecutions: input.hookExecutions,
      generatedRecommendationIds: input.recommendationIds,
      processedAt,
      latencyMs,
      reason: input.reason,
      metadata: freezeMetadata(input.event.metadata),
    });

    this.results.push(result);
    this.metricsState.totalProcessingLatencyMs += latencyMs;
    this.metricsState.maximumProcessingLatencyMs = Math.max(
      this.metricsState.maximumProcessingLatencyMs,
      latencyMs,
    );

    switch (input.status) {
      case "PROCESSED":
        this.metricsState.processedEventCount += 1;
        break;
      case "PARTIAL":
        this.metricsState.partialEventCount += 1;
        break;
      case "FAILED":
        this.metricsState.failedEventCount += 1;
        break;
      case "DUPLICATE":
        break;
      case "IGNORED":
        this.metricsState.ignoredEventCount += 1;
        break;
      default:
        this.assertNever(input.status);
    }

    this.trimHistory();
    return result;
  }

  private getOrCreateStrategyProfile(
    strategyId: string,
    occurredAt: number,
  ): MutableStrategyProfile {
    const existing = this.strategyProfiles.get(strategyId);
    if (existing !== undefined) return existing;

    const created: MutableStrategyProfile = {
      strategyId,
      eventCount: 0,
      signalOutcomeCount: 0,
      positiveSignalOutcomeCount: 0,
      negativeSignalOutcomeCount: 0,
      tradeOutcomeCount: 0,
      winningTradeCount: 0,
      losingTradeCount: 0,
      breakevenTradeCount: 0,
      cumulativeRealizedPnl: 0,
      cumulativeReward: 0,
      riskBreachCount: 0,
      degradationEventCount: 0,
      regimeChangeCount: 0,
      allocationChangeCount: 0,
      manualFeedbackCount: 0,
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 0,
      recentOutcomeScore: 0.5,
      stabilityScore: 1,
      degradationScore: 0,
      lastEventAt: occurredAt,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    };
    this.strategyProfiles.set(strategyId, created);
    return created;
  }

  private getOrCreateModelProfile(
    modelId: string,
    occurredAt: number,
  ): MutableModelProfile {
    const existing = this.modelProfiles.get(modelId);
    if (existing !== undefined) return existing;

    const created: MutableModelProfile = {
      modelId,
      eventCount: 0,
      signalOutcomeCount: 0,
      correctPredictionCount: 0,
      incorrectPredictionCount: 0,
      driftEventCount: 0,
      currentDriftScore: 0,
      maximumDriftScore: 0,
      cumulativeReward: 0,
      degradationScore: 0,
      lastEventAt: occurredAt,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    };
    this.modelProfiles.set(modelId, created);
    return created;
  }

  private freezeStrategyProfile(
    profile: MutableStrategyProfile,
  ): AutonomousStrategyLearningProfile {
    return Object.freeze({
      strategyId: profile.strategyId,
      eventCount: profile.eventCount,
      signalOutcomeCount: profile.signalOutcomeCount,
      positiveSignalOutcomeCount: profile.positiveSignalOutcomeCount,
      negativeSignalOutcomeCount: profile.negativeSignalOutcomeCount,
      tradeOutcomeCount: profile.tradeOutcomeCount,
      winningTradeCount: profile.winningTradeCount,
      losingTradeCount: profile.losingTradeCount,
      breakevenTradeCount: profile.breakevenTradeCount,
      cumulativeRealizedPnl: profile.cumulativeRealizedPnl,
      averageTradePnl:
        profile.tradeOutcomeCount === 0
          ? 0
          : profile.cumulativeRealizedPnl / profile.tradeOutcomeCount,
      winRate: ratio(
        profile.winningTradeCount,
        profile.tradeOutcomeCount,
      ),
      cumulativeReward: profile.cumulativeReward,
      averageReward:
        profile.eventCount === 0
          ? 0
          : profile.cumulativeReward / profile.eventCount,
      riskBreachCount: profile.riskBreachCount,
      degradationEventCount: profile.degradationEventCount,
      regimeChangeCount: profile.regimeChangeCount,
      allocationChangeCount: profile.allocationChangeCount,
      manualFeedbackCount: profile.manualFeedbackCount,
      positiveFeedbackCount: profile.positiveFeedbackCount,
      negativeFeedbackCount: profile.negativeFeedbackCount,
      recentOutcomeScore: profile.recentOutcomeScore,
      stabilityScore: profile.stabilityScore,
      degradationScore: profile.degradationScore,
      lastEventAt: profile.lastEventAt,
      metadata: profile.metadata,
    });
  }

  private freezeModelProfile(
    profile: MutableModelProfile,
  ): AutonomousModelLearningProfile {
    return Object.freeze({
      modelId: profile.modelId,
      eventCount: profile.eventCount,
      signalOutcomeCount: profile.signalOutcomeCount,
      correctPredictionCount: profile.correctPredictionCount,
      incorrectPredictionCount: profile.incorrectPredictionCount,
      predictionAccuracy: ratio(
        profile.correctPredictionCount,
        profile.signalOutcomeCount,
      ),
      driftEventCount: profile.driftEventCount,
      currentDriftScore: profile.currentDriftScore,
      maximumDriftScore: profile.maximumDriftScore,
      cumulativeReward: profile.cumulativeReward,
      averageReward:
        profile.eventCount === 0
          ? 0
          : profile.cumulativeReward / profile.eventCount,
      degradationScore: profile.degradationScore,
      lastEventAt: profile.lastEventAt,
      metadata: profile.metadata,
    });
  }

  private validateHook(hook: AutonomousLearningHook): void {
    if (!hook || typeof hook !== "object") {
      throw new TypeError("hook must be an object.");
    }
    assertNonEmptyString(hook.hookId, "hook.hookId");
    if (!Array.isArray(hook.eventTypes) || hook.eventTypes.length === 0) {
      throw new Error("hook.eventTypes must contain at least one event type.");
    }
    if (new Set(hook.eventTypes).size !== hook.eventTypes.length) {
      throw new Error("hook.eventTypes must be unique.");
    }
    if (typeof hook.enabled !== "boolean") {
      throw new TypeError("hook.enabled must be boolean.");
    }
    if (typeof hook.process !== "function") {
      throw new TypeError("hook.process must be a function.");
    }
  }

  private validateEventSemantics(
    event: AutonomousLearningEvent,
    now: number,
  ): void {
    if (event.occurredAt > now) {
      throw new Error("Learning event cannot occur in the future.");
    }
    if (now - event.occurredAt > this.options.maximumEventAgeMs) {
      throw new Error(
        `Learning event is stale by ${now - event.occurredAt}ms.`,
      );
    }
    if (
      event.strategyId === undefined &&
      event.modelId === undefined &&
      event.eventType !== "MANUAL_FEEDBACK" &&
      event.eventType !== "REGIME_CHANGE"
    ) {
      throw new Error(
        "Learning event requires a strategyId or modelId for this event type.",
      );
    }
    if (new Set(event.labels).size !== event.labels.length) {
      throw new Error("Learning event labels must be unique.");
    }
  }

  private validateThresholds(
    thresholds: AutonomousLearningEngineThresholds,
  ): void {
    const probabilities: readonly [string, number][] = [
      ["warningModelDriftScore", thresholds.warningModelDriftScore],
      ["criticalModelDriftScore", thresholds.criticalModelDriftScore],
      [
        "warningStrategyDegradationScore",
        thresholds.warningStrategyDegradationScore,
      ],
      [
        "criticalStrategyDegradationScore",
        thresholds.criticalStrategyDegradationScore,
      ],
      ["minimumWinRate", thresholds.minimumWinRate],
      ["strongWinRate", thresholds.strongWinRate],
      ["minimumPredictionAccuracy", thresholds.minimumPredictionAccuracy],
      ["strongPredictionAccuracy", thresholds.strongPredictionAccuracy],
    ];
    probabilities.forEach(([name, value]) =>
      assertProbability(value, `thresholds.${name}`),
    );
    assertPositiveInteger(
      thresholds.minimumSamplesForRecommendation,
      "thresholds.minimumSamplesForRecommendation",
    );
    if (
      thresholds.criticalModelDriftScore <
      thresholds.warningModelDriftScore
    ) {
      throw new Error(
        "criticalModelDriftScore cannot be below warningModelDriftScore.",
      );
    }
    if (
      thresholds.criticalStrategyDegradationScore <
      thresholds.warningStrategyDegradationScore
    ) {
      throw new Error(
        "criticalStrategyDegradationScore cannot be below warningStrategyDegradationScore.",
      );
    }
    if (thresholds.strongWinRate < thresholds.minimumWinRate) {
      throw new Error("strongWinRate cannot be below minimumWinRate.");
    }
    if (
      thresholds.strongPredictionAccuracy <
      thresholds.minimumPredictionAccuracy
    ) {
      throw new Error(
        "strongPredictionAccuracy cannot be below minimumPredictionAccuracy.",
      );
    }
  }

  private validateEventQuery(query: AutonomousLearningEventQuery): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (
      query.fromOccurredAt !== undefined &&
      query.toOccurredAt !== undefined &&
      query.fromOccurredAt > query.toOccurredAt
    ) {
      throw new RangeError(
        "query.fromOccurredAt cannot exceed query.toOccurredAt.",
      );
    }
  }

  private validateRecommendationQuery(
    query: AutonomousLearningRecommendationQuery,
  ): void {
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "query.limit");
    }
    if (
      query.fromCreatedAt !== undefined &&
      query.toCreatedAt !== undefined &&
      query.fromCreatedAt > query.toCreatedAt
    ) {
      throw new RangeError(
        "query.fromCreatedAt cannot exceed query.toCreatedAt.",
      );
    }
  }

  private trimHistory(): void {
    while (this.events.length > this.options.maximumHistoryEntries) {
      const removed = this.events.shift();
      if (removed !== undefined) {
        this.eventIds.delete(removed.eventId);
      }
    }
    while (this.results.length > this.options.maximumHistoryEntries) {
      this.results.shift();
    }
    while (
      this.recommendations.length >
      this.options.maximumRecommendationEntries
    ) {
      this.recommendations.shift();
    }
  }

  private assertNever(value: never): never {
    throw new Error(`Unsupported learning value '${String(value)}'.`);
  }
}

export function createAutonomousLearningEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousLearningEngineOptions = {},
): AutonomousLearningEngine {
  return new AutonomousLearningEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}