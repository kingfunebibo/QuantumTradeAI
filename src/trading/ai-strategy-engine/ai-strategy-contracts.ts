/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 1: AI strategy engine contracts.
 *
 * This module defines the immutable public domain model for:
 * - AI providers and models
 * - feature vectors and feature snapshots
 * - market-regime classification
 * - AI inference requests and responses
 * - signal generation and confidence calibration
 * - ensemble voting and meta-strategy decisions
 * - adaptive optimization and walk-forward validation
 * - attribution, audit, and runtime snapshots
 */

export type AiStrategyPrimitive = string | number | boolean | null;

export type AiStrategyMetadataValue =
  | AiStrategyPrimitive
  | readonly AiStrategyPrimitive[];

export type AiStrategyMetadata = Readonly<
  Record<string, AiStrategyMetadataValue>
>;

export const EMPTY_AI_STRATEGY_METADATA: AiStrategyMetadata = Object.freeze({});

export type AiStrategyIdentifier = string;
export type AiStrategyTimestamp = number;
export type AiStrategyConfidence = number;
export type AiStrategyScore = number;
export type AiStrategyProbability = number;

export type AiStrategyMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURES"
  | "OPTIONS";

export type AiStrategyDirection =
  | "LONG"
  | "SHORT"
  | "FLAT"
  | "HOLD";

export type AiStrategySignalAction =
  | "BUY"
  | "SELL"
  | "HOLD"
  | "CLOSE_LONG"
  | "CLOSE_SHORT"
  | "REDUCE_LONG"
  | "REDUCE_SHORT";

export type AiStrategyTimeframe =
  | "1s"
  | "5s"
  | "15s"
  | "30s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export interface AiStrategyInstrument {
  readonly exchangeId: string;
  readonly symbol: string;
  readonly normalizedSymbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly marketType: AiStrategyMarketType;
  readonly contractSize?: number;
  readonly pricePrecision?: number;
  readonly quantityPrecision?: number;
  readonly metadata: AiStrategyMetadata;
}

export interface AiStrategyMarketContext {
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly observedAt: AiStrategyTimestamp;
  readonly sequence: number;
  readonly markPrice?: number;
  readonly indexPrice?: number;
  readonly bestBid?: number;
  readonly bestAsk?: number;
  readonly lastPrice?: number;
  readonly volume?: number;
  readonly openInterest?: number;
  readonly fundingRate?: number;
  readonly metadata: AiStrategyMetadata;
}

export type AiFeatureValue = number | boolean | string | null;

export interface AiFeatureDefinition {
  readonly featureId: string;
  readonly displayName: string;
  readonly description?: string;
  readonly dataType: "NUMBER" | "BOOLEAN" | "CATEGORY";
  readonly category?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defaultValue?: AiFeatureValue;
  readonly required: boolean;
  readonly deterministic: boolean;
  readonly metadata: AiStrategyMetadata;
}

export interface AiFeatureObservation {
  readonly featureId: string;
  readonly value: AiFeatureValue;
  readonly observedAt: AiStrategyTimestamp;
  readonly source: string;
  readonly quality: AiFeatureQuality;
  readonly metadata: AiStrategyMetadata;
}

export type AiFeatureQuality =
  | "VALID"
  | "STALE"
  | "MISSING"
  | "IMPUTED"
  | "OUTLIER"
  | "INVALID";

export interface AiFeatureVector {
  readonly vectorId: string;
  readonly schemaVersion: string;
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly observedAt: AiStrategyTimestamp;
  readonly observations: readonly AiFeatureObservation[];
  readonly values: Readonly<Record<string, AiFeatureValue>>;
  readonly checksum?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiFeatureSnapshot {
  readonly snapshotId: string;
  readonly createdAt: AiStrategyTimestamp;
  readonly vectors: readonly AiFeatureVector[];
  readonly completeness: number;
  readonly valid: boolean;
  readonly issues: readonly AiFeatureValidationIssue[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiFeatureValidationIssue {
  readonly featureId?: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly metadata: AiStrategyMetadata;
}

export type AiModelFamily =
  | "RULE_BASED"
  | "LINEAR"
  | "TREE"
  | "BOOSTING"
  | "NEURAL_NETWORK"
  | "TRANSFORMER"
  | "REINFORCEMENT_LEARNING"
  | "LLM"
  | "ENSEMBLE"
  | "CUSTOM";

export type AiModelTask =
  | "CLASSIFICATION"
  | "REGRESSION"
  | "RANKING"
  | "FORECASTING"
  | "POLICY"
  | "EMBEDDING"
  | "GENERATION";

export type AiModelLifecycleStatus =
  | "DRAFT"
  | "VALIDATING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "SUSPENDED"
  | "RETIRED"
  | "FAILED";

export interface AiModelDescriptor {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly displayName: string;
  readonly description?: string;
  readonly family: AiModelFamily;
  readonly task: AiModelTask;
  readonly lifecycleStatus: AiModelLifecycleStatus;
  readonly deterministic: boolean;
  readonly supportsSeed: boolean;
  readonly supportsBatching: boolean;
  readonly supportedMarketTypes: readonly AiStrategyMarketType[];
  readonly supportedTimeframes: readonly AiStrategyTimeframe[];
  readonly requiredFeatures: readonly string[];
  readonly optionalFeatures: readonly string[];
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly trainedAt?: AiStrategyTimestamp;
  readonly trainingDatasetId?: string;
  readonly checksum?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRuntimeConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly timeoutMs: number;
  readonly deterministicSeed?: string;
  readonly minimumConfidence: number;
  readonly maximumInferenceAgeMs: number;
  readonly failClosed: boolean;
  readonly parameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly metadata: AiStrategyMetadata;
}

export type AiInferenceStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "REJECTED"
  | "TIMED_OUT"
  | "FAILED"
  | "CANCELLED";

export interface AiInferenceRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly marketContext: AiStrategyMarketContext;
  readonly featureVector: AiFeatureVector;
  readonly model: AiModelRuntimeConfiguration;
  readonly purpose: AiInferencePurpose;
  readonly metadata: AiStrategyMetadata;
}

export type AiInferencePurpose =
  | "SIGNAL_GENERATION"
  | "REGIME_DETECTION"
  | "CONFIDENCE_CALIBRATION"
  | "PARAMETER_OPTIMIZATION"
  | "RISK_ADVISORY"
  | "POSITION_SIZING"
  | "EXIT_TIMING"
  | "META_STRATEGY";

export interface AiInferencePrediction {
  readonly label?: string;
  readonly direction?: AiStrategyDirection;
  readonly score?: number;
  readonly probability?: number;
  readonly value?: number;
  readonly horizon?: number;
  readonly units?: string;
  readonly payload: Readonly<Record<string, AiStrategyPrimitive>>;
}

export interface AiFeatureContribution {
  readonly featureId: string;
  readonly contribution: number;
  readonly rank?: number;
  readonly direction?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  readonly metadata: AiStrategyMetadata;
}

export interface AiInferenceResponse {
  readonly requestId: string;
  readonly correlationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly status: AiInferenceStatus;
  readonly startedAt: AiStrategyTimestamp;
  readonly completedAt: AiStrategyTimestamp;
  readonly latencyMs: number;
  readonly prediction?: AiInferencePrediction;
  readonly confidence?: AiStrategyConfidence;
  readonly featureContributions: readonly AiFeatureContribution[];
  readonly warnings: readonly string[];
  readonly error?: AiInferenceError;
  readonly metadata: AiStrategyMetadata;
}

export interface AiInferenceError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly cause?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelProvider {
  readonly providerId: string;
  readonly displayName: string;
  readonly metadata: AiStrategyMetadata;

  listModels(): Promise<readonly AiModelDescriptor[]>;

  infer(request: AiInferenceRequest): Promise<AiInferenceResponse>;

  healthCheck?(): Promise<AiProviderHealth>;
}

export interface AiProviderHealth {
  readonly providerId: string;
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly checkedAt: AiStrategyTimestamp;
  readonly latencyMs?: number;
  readonly message?: string;
  readonly metadata: AiStrategyMetadata;
}

export type MarketRegime =
  | "STRONG_BULL"
  | "BULL"
  | "WEAK_BULL"
  | "RANGE"
  | "WEAK_BEAR"
  | "BEAR"
  | "STRONG_BEAR"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "LIQUIDITY_STRESS"
  | "TRENDING"
  | "MEAN_REVERTING"
  | "BREAKOUT"
  | "UNKNOWN";

export interface MarketRegimeProbability {
  readonly regime: MarketRegime;
  readonly probability: number;
}

export interface MarketRegimeDetection {
  readonly detectionId: string;
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly detectedAt: AiStrategyTimestamp;
  readonly validUntil: AiStrategyTimestamp;
  readonly primaryRegime: MarketRegime;
  readonly confidence: AiStrategyConfidence;
  readonly probabilities: readonly MarketRegimeProbability[];
  readonly supportingFeatures: readonly AiFeatureContribution[];
  readonly model: AiModelReference;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelReference {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion: string;
}

export type AiSignalSourceType =
  | "MODEL"
  | "ENSEMBLE"
  | "META_STRATEGY"
  | "LLM"
  | "REINFORCEMENT_LEARNING"
  | "HYBRID";

export interface AiGeneratedSignal {
  readonly signalId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly sourceType: AiSignalSourceType;
  readonly sourceId: string;
  readonly instrument: AiStrategyInstrument;
  readonly timeframe: AiStrategyTimeframe;
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly generatedAt: AiStrategyTimestamp;
  readonly validUntil: AiStrategyTimestamp;
  readonly confidence: AiStrategyConfidence;
  readonly rawConfidence: AiStrategyConfidence;
  readonly score: AiStrategyScore;
  readonly regime?: MarketRegimeDetection;
  readonly targetPrice?: number;
  readonly stopLossPrice?: number;
  readonly takeProfitPrice?: number;
  readonly suggestedQuantity?: number;
  readonly suggestedNotional?: number;
  readonly leverage?: number;
  readonly rationale: readonly string[];
  readonly featureContributions: readonly AiFeatureContribution[];
  readonly modelReferences: readonly AiModelReference[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiSignalGenerationRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly marketContext: AiStrategyMarketContext;
  readonly featureSnapshot: AiFeatureSnapshot;
  readonly regime?: MarketRegimeDetection;
  readonly modelConfigurations: readonly AiModelRuntimeConfiguration[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiSignalGenerationResult {
  readonly requestId: string;
  readonly correlationId: string;
  readonly status: "GENERATED" | "HOLD" | "REJECTED" | "FAILED";
  readonly signal?: AiGeneratedSignal;
  readonly inferenceResponses: readonly AiInferenceResponse[];
  readonly rejectionReasons: readonly string[];
  readonly generatedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export type ConfidenceCalibrationMethod =
  | "NONE"
  | "PLATT_SCALING"
  | "ISOTONIC"
  | "TEMPERATURE"
  | "BETA"
  | "HISTOGRAM"
  | "CUSTOM";

export interface ConfidenceCalibrationProfile {
  readonly profileId: string;
  readonly strategyId?: string;
  readonly model: AiModelReference;
  readonly method: ConfidenceCalibrationMethod;
  readonly trainedAt: AiStrategyTimestamp;
  readonly validFrom: AiStrategyTimestamp;
  readonly validUntil?: AiStrategyTimestamp;
  readonly sampleCount: number;
  readonly expectedCalibrationError?: number;
  readonly parameters: Readonly<Record<string, number>>;
  readonly metadata: AiStrategyMetadata;
}

export interface ConfidenceCalibrationRequest {
  readonly requestId: string;
  readonly rawConfidence: number;
  readonly model: AiModelReference;
  readonly regime?: MarketRegime;
  readonly profile?: ConfidenceCalibrationProfile;
  readonly timestamp: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface ConfidenceCalibrationResult {
  readonly requestId: string;
  readonly rawConfidence: number;
  readonly calibratedConfidence: number;
  readonly method: ConfidenceCalibrationMethod;
  readonly profileId?: string;
  readonly warnings: readonly string[];
  readonly calibratedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export type EnsembleVotingMethod =
  | "MAJORITY"
  | "WEIGHTED_MAJORITY"
  | "AVERAGE_SCORE"
  | "WEIGHTED_SCORE"
  | "UNANIMOUS"
  | "STACKING"
  | "CUSTOM";

export interface AiEnsembleMember {
  readonly memberId: string;
  readonly model: AiModelRuntimeConfiguration;
  readonly weight: number;
  readonly enabled: boolean;
  readonly minimumConfidence?: number;
  readonly allowedRegimes: readonly MarketRegime[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiEnsembleConfiguration {
  readonly ensembleId: string;
  readonly displayName: string;
  readonly version: string;
  readonly votingMethod: EnsembleVotingMethod;
  readonly members: readonly AiEnsembleMember[];
  readonly quorum: number;
  readonly minimumAgreement: number;
  readonly minimumConfidence: number;
  readonly rejectOnTie: boolean;
  readonly metadata: AiStrategyMetadata;
}

export interface AiEnsembleVote {
  readonly memberId: string;
  readonly model: AiModelReference;
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly score: number;
  readonly confidence: number;
  readonly weight: number;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiEnsembleDecision {
  readonly decisionId: string;
  readonly ensembleId: string;
  readonly correlationId: string;
  readonly decidedAt: AiStrategyTimestamp;
  readonly status: "ACCEPTED" | "REJECTED" | "TIED" | "INSUFFICIENT_QUORUM";
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly score: number;
  readonly confidence: number;
  readonly agreement: number;
  readonly votes: readonly AiEnsembleVote[];
  readonly rationale: readonly string[];
  readonly metadata: AiStrategyMetadata;
}

export interface MetaStrategyCandidate {
  readonly candidateId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly signal: AiGeneratedSignal;
  readonly performanceScore?: number;
  readonly riskScore?: number;
  readonly regimeSuitability?: number;
  readonly allocationWeight?: number;
  readonly metadata: AiStrategyMetadata;
}

export interface MetaStrategyRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly marketContext: AiStrategyMarketContext;
  readonly regime?: MarketRegimeDetection;
  readonly candidates: readonly MetaStrategyCandidate[];
  readonly constraints: MetaStrategyConstraints;
  readonly metadata: AiStrategyMetadata;
}

export interface MetaStrategyConstraints {
  readonly minimumConfidence: number;
  readonly maximumCandidates: number;
  readonly maximumLongAllocation: number;
  readonly maximumShortAllocation: number;
  readonly maximumGrossAllocation: number;
  readonly requireRegimeCompatibility: boolean;
  readonly metadata: AiStrategyMetadata;
}

export interface MetaStrategyAllocation {
  readonly candidateId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly weight: number;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface MetaStrategyDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly decidedAt: AiStrategyTimestamp;
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly confidence: number;
  readonly score: number;
  readonly allocations: readonly MetaStrategyAllocation[];
  readonly selectedSignalIds: readonly string[];
  readonly rationale: readonly string[];
  readonly metadata: AiStrategyMetadata;
}

export type OptimizationObjective =
  | "TOTAL_RETURN"
  | "RISK_ADJUSTED_RETURN"
  | "SHARPE_RATIO"
  | "SORTINO_RATIO"
  | "PROFIT_FACTOR"
  | "MAX_DRAWDOWN"
  | "WIN_RATE"
  | "CALMAR_RATIO"
  | "CUSTOM";

export type OptimizationAlgorithm =
  | "GRID_SEARCH"
  | "RANDOM_SEARCH"
  | "BAYESIAN"
  | "EVOLUTIONARY"
  | "REINFORCEMENT_LEARNING"
  | "CUSTOM";

export interface OptimizationParameterDefinition {
  readonly parameterId: string;
  readonly dataType: "NUMBER" | "INTEGER" | "BOOLEAN" | "CATEGORY";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly categories?: readonly string[];
  readonly defaultValue: AiStrategyPrimitive;
  readonly metadata: AiStrategyMetadata;
}

export interface AdaptiveOptimizationRequest {
  readonly requestId: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly algorithm: OptimizationAlgorithm;
  readonly objective: OptimizationObjective;
  readonly parameterDefinitions: readonly OptimizationParameterDefinition[];
  readonly currentParameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly trainingWindow: AiValidationWindow;
  readonly validationWindow: AiValidationWindow;
  readonly maximumTrials: number;
  readonly deterministicSeed?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiValidationWindow {
  readonly startTime: AiStrategyTimestamp;
  readonly endTime: AiStrategyTimestamp;
  readonly datasetId?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface OptimizationTrial {
  readonly trialId: string;
  readonly trialNumber: number;
  readonly parameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly objectiveValue: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly startedAt: AiStrategyTimestamp;
  readonly completedAt: AiStrategyTimestamp;
  readonly status: "SUCCEEDED" | "FAILED" | "REJECTED";
  readonly error?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AdaptiveOptimizationResult {
  readonly requestId: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly status: "SUCCEEDED" | "FAILED" | "PARTIAL";
  readonly objective: OptimizationObjective;
  readonly bestTrial?: OptimizationTrial;
  readonly trials: readonly OptimizationTrial[];
  readonly recommendedParameters: Readonly<
    Record<string, AiStrategyPrimitive>
  >;
  readonly startedAt: AiStrategyTimestamp;
  readonly completedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface WalkForwardFold {
  readonly foldId: string;
  readonly sequence: number;
  readonly trainingWindow: AiValidationWindow;
  readonly validationWindow: AiValidationWindow;
  readonly testWindow: AiValidationWindow;
  readonly parameters: Readonly<Record<string, AiStrategyPrimitive>>;
  readonly trainingMetrics: Readonly<Record<string, number>>;
  readonly validationMetrics: Readonly<Record<string, number>>;
  readonly testMetrics: Readonly<Record<string, number>>;
  readonly accepted: boolean;
  readonly rejectionReasons: readonly string[];
  readonly metadata: AiStrategyMetadata;
}

export interface WalkForwardValidationRequest {
  readonly requestId: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly datasetId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly folds: readonly WalkForwardFoldDefinition[];
  readonly objective: OptimizationObjective;
  readonly minimumAcceptanceScore: number;
  readonly deterministicSeed?: string;
  readonly metadata: AiStrategyMetadata;
}

export interface WalkForwardFoldDefinition {
  readonly foldId: string;
  readonly sequence: number;
  readonly trainingWindow: AiValidationWindow;
  readonly validationWindow: AiValidationWindow;
  readonly testWindow: AiValidationWindow;
  readonly metadata: AiStrategyMetadata;
}

export interface WalkForwardValidationResult {
  readonly requestId: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly status: "PASSED" | "FAILED" | "PARTIAL";
  readonly folds: readonly WalkForwardFold[];
  readonly aggregateMetrics: Readonly<Record<string, number>>;
  readonly stabilityScore: number;
  readonly acceptanceScore: number;
  readonly accepted: boolean;
  readonly rejectionReasons: readonly string[];
  readonly completedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export type AttributionDimension =
  | "MODEL"
  | "FEATURE"
  | "REGIME"
  | "STRATEGY"
  | "TIMEFRAME"
  | "INSTRUMENT"
  | "SIGNAL_ACTION"
  | "ENSEMBLE_MEMBER";

export interface AiPerformanceAttributionEntry {
  readonly dimension: AttributionDimension;
  readonly key: string;
  readonly sampleCount: number;
  readonly grossPnl: number;
  readonly netPnl: number;
  readonly fees: number;
  readonly winRate: number;
  readonly averageReturn: number;
  readonly contribution: number;
  readonly confidence: number;
  readonly metadata: AiStrategyMetadata;
}

export interface AiPerformanceAttribution {
  readonly attributionId: string;
  readonly strategyId?: string;
  readonly strategyInstanceId?: string;
  readonly periodStart: AiStrategyTimestamp;
  readonly periodEnd: AiStrategyTimestamp;
  readonly generatedAt: AiStrategyTimestamp;
  readonly entries: readonly AiPerformanceAttributionEntry[];
  readonly aggregateMetrics: Readonly<Record<string, number>>;
  readonly metadata: AiStrategyMetadata;
}

export type AiAuditEventType =
  | "PROVIDER_REGISTERED"
  | "PROVIDER_UNREGISTERED"
  | "MODEL_DISCOVERED"
  | "MODEL_ACTIVATED"
  | "MODEL_SUSPENDED"
  | "INFERENCE_REQUESTED"
  | "INFERENCE_COMPLETED"
  | "INFERENCE_FAILED"
  | "FEATURE_VECTOR_CREATED"
  | "REGIME_DETECTED"
  | "SIGNAL_GENERATED"
  | "SIGNAL_REJECTED"
  | "CONFIDENCE_CALIBRATED"
  | "ENSEMBLE_DECIDED"
  | "META_STRATEGY_DECIDED"
  | "OPTIMIZATION_COMPLETED"
  | "VALIDATION_COMPLETED"
  | "ATTRIBUTION_GENERATED";

export interface AiAuditEntry {
  readonly auditId: string;
  readonly eventType: AiAuditEventType;
  readonly timestamp: AiStrategyTimestamp;
  readonly correlationId?: string;
  readonly strategyId?: string;
  readonly strategyInstanceId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly entityId?: string;
  readonly message: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiStrategyEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly providers: readonly AiProviderSnapshot[];
  readonly models: readonly AiModelDescriptor[];
  readonly activeInferenceCount: number;
  readonly completedInferenceCount: number;
  readonly failedInferenceCount: number;
  readonly timedOutInferenceCount: number;
  readonly generatedSignalCount: number;
  readonly rejectedSignalCount: number;
  readonly auditHistory: readonly AiAuditEntry[];
  readonly metadata: AiStrategyMetadata;
}

export interface AiProviderSnapshot {
  readonly providerId: string;
  readonly displayName: string;
  readonly registeredAt: AiStrategyTimestamp;
  readonly modelCount: number;
  readonly health?: AiProviderHealth;
  readonly metadata: AiStrategyMetadata;
}

export interface AiStrategyEngineOptions {
  readonly defaultTimeoutMs?: number;
  readonly defaultMinimumConfidence?: number;
  readonly maximumInferenceHistory?: number;
  readonly maximumAuditHistory?: number;
  readonly strictFeatureValidation?: boolean;
  readonly rejectStaleFeatures?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly metadata?: AiStrategyMetadata;
}

export interface AiStrategyEngine {
  registerProvider(provider: AiModelProvider): void;

  unregisterProvider(providerId: string): boolean;

  listProviders(): readonly AiProviderSnapshot[];

  listModels(providerId?: string): Promise<readonly AiModelDescriptor[]>;

  infer(request: AiInferenceRequest): Promise<AiInferenceResponse>;

  generateSignal(
    request: AiSignalGenerationRequest,
  ): Promise<AiSignalGenerationResult>;

  snapshot(): AiStrategyEngineSnapshot;
}