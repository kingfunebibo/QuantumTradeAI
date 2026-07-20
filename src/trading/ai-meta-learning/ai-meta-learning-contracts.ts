/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File:
 * src/trading/ai-meta-learning/ai-meta-learning-contracts.ts
 *
 * Foundational immutable domain contracts for the autonomous meta-learning
 * subsystem. The contracts in this file intentionally contain no runtime
 * dependencies so that every engine in the milestone can share a stable,
 * deterministic type surface.
 */

export type MetaLearningTimestamp = string;
export type MetaLearningId = string;
export type StrategyId = string;
export type PortfolioId = string;
export type MarketSymbol = string;
export type MarketTimeframe = string;

export type ReadonlyRecord<TKey extends PropertyKey, TValue> = Readonly<
  Record<TKey, TValue>
>;

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer TItem)[]
      ? readonly DeepReadonly<TItem>[]
      : T extends object
        ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
        : T;

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export interface MetaLearningClock {
  now(): MetaLearningTimestamp;
}

export interface MetaLearningIdGenerator {
  next(prefix: string): MetaLearningId;
}

export interface MetaLearningLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export type MetaLearningRunStatus =
  | "CREATED"
  | "VALIDATED"
  | "EXTRACTING_FEATURES"
  | "MINING_PATTERNS"
  | "LEARNING_REGIMES"
  | "LEARNING_WEIGHTS"
  | "APPLYING_FEEDBACK"
  | "EVOLVING_STRATEGIES"
  | "EVALUATING_LIFECYCLE"
  | "EXPLAINING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED";

export type MetaLearningDecision =
  | "APPLY"
  | "HOLD"
  | "DEFER"
  | "REJECT";

export type StrategyLifecycleState =
  | "CANDIDATE"
  | "EXPERIMENTAL"
  | "ACTIVE"
  | "PROBATION"
  | "DEGRADED"
  | "RETIRED"
  | "ARCHIVED";

export type StrategyEvolutionAction =
  | "NO_CHANGE"
  | "REWEIGHT"
  | "TUNE_PARAMETERS"
  | "CLONE"
  | "MUTATE"
  | "CROSSOVER"
  | "PROMOTE"
  | "DEMOTE"
  | "RETIRE"
  | "ARCHIVE";

export type StrategyPromotionDecision =
  | "PROMOTE"
  | "KEEP_CURRENT"
  | "DEFER"
  | "REJECT";

export type StrategyRetirementDecision =
  | "RETIRE"
  | "PLACE_ON_PROBATION"
  | "KEEP_ACTIVE"
  | "DEFER";

export type ReinforcementSignal =
  | "STRONGLY_POSITIVE"
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "STRONGLY_NEGATIVE";

export type PatternDirection =
  | "POSITIVE"
  | "NEGATIVE"
  | "MIXED"
  | "NEUTRAL";

export type PatternConfidenceBand =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type MarketRegime =
  | "BULL_TREND"
  | "BEAR_TREND"
  | "SIDEWAYS"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "RISK_ON"
  | "RISK_OFF"
  | "LIQUIDITY_STRESS"
  | "RECOVERY"
  | "UNKNOWN";

export type FeatureValueType =
  | "NUMBER"
  | "BOOLEAN"
  | "CATEGORY"
  | "VECTOR";

export type LearningObjective =
  | "MAXIMIZE_RISK_ADJUSTED_RETURN"
  | "MAXIMIZE_ABSOLUTE_RETURN"
  | "MINIMIZE_DRAWDOWN"
  | "MINIMIZE_TAIL_RISK"
  | "MAXIMIZE_STABILITY"
  | "MAXIMIZE_REGIME_ROBUSTNESS"
  | "BALANCED";

export interface MetaLearningNumericRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface MetaLearningValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "ERROR" | "WARNING";
  readonly receivedValue?: unknown;
}

export interface MetaLearningValidationResult {
  readonly valid: boolean;
  readonly issues: readonly MetaLearningValidationIssue[];
}

export interface StrategyParameterValue {
  readonly key: string;
  readonly value: number | string | boolean;
}

export interface StrategyParameterDefinition {
  readonly key: string;
  readonly valueType: "NUMBER" | "INTEGER" | "BOOLEAN" | "CATEGORY";
  readonly currentValue: number | string | boolean;
  readonly mutable: boolean;
  readonly numericRange?: MetaLearningNumericRange;
  readonly allowedValues?: readonly (string | number | boolean)[];
  readonly learningRate?: number;
}

export interface StrategyDescriptor {
  readonly strategyId: StrategyId;
  readonly name: string;
  readonly version: string;
  readonly lifecycleState: StrategyLifecycleState;
  readonly strategyFamily: string;
  readonly symbols: readonly MarketSymbol[];
  readonly timeframes: readonly MarketTimeframe[];
  readonly supportedRegimes: readonly MarketRegime[];
  readonly parameters: readonly StrategyParameterDefinition[];
  readonly tags: readonly string[];
  readonly createdAt: MetaLearningTimestamp;
  readonly updatedAt: MetaLearningTimestamp;
}

export interface StrategyPerformanceObservation {
  readonly observationId: MetaLearningId;
  readonly strategyId: StrategyId;
  readonly portfolioId?: PortfolioId;
  readonly symbol?: MarketSymbol;
  readonly timeframe?: MarketTimeframe;
  readonly regime: MarketRegime;
  readonly startedAt: MetaLearningTimestamp;
  readonly endedAt: MetaLearningTimestamp;
  readonly sampleSize: number;
  readonly trades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;
  readonly returnRate: number;
  readonly volatility: number;
  readonly maximumDrawdown: number;
  readonly averageDrawdown: number;
  readonly sharpeRatio: number;
  readonly sortinoRatio: number;
  readonly calmarRatio: number;
  readonly profitFactor: number;
  readonly winRate: number;
  readonly expectancy: number;
  readonly averageTradeReturn: number;
  readonly tailLoss: number;
  readonly valueAtRisk: number;
  readonly conditionalValueAtRisk: number;
  readonly turnover: number;
  readonly averageHoldingPeriodMs: number;
  readonly executionCost: number;
  readonly slippageCost: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StrategyRiskObservation {
  readonly strategyId: StrategyId;
  readonly timestamp: MetaLearningTimestamp;
  readonly riskScore: number;
  readonly concentrationRisk: number;
  readonly correlationRisk: number;
  readonly liquidityRisk: number;
  readonly leverageRisk: number;
  readonly volatilityRisk: number;
  readonly drawdownRisk: number;
  readonly tailRisk: number;
  readonly operationalRisk: number;
  readonly remainingRiskBudget: number;
  readonly breachedLimits: readonly string[];
}

export interface MarketContextSnapshot {
  readonly snapshotId: MetaLearningId;
  readonly timestamp: MetaLearningTimestamp;
  readonly symbol: MarketSymbol;
  readonly timeframe: MarketTimeframe;
  readonly regime: MarketRegime;
  readonly regimeConfidence: number;
  readonly trendStrength: number;
  readonly realizedVolatility: number;
  readonly impliedVolatility?: number;
  readonly liquidityScore: number;
  readonly spreadRate: number;
  readonly marketDepthScore: number;
  readonly momentumScore: number;
  readonly meanReversionScore: number;
  readonly riskOnScore: number;
  readonly stressScore: number;
  readonly features: Readonly<Record<string, number>>;
}

export interface StrategyLearningDataset {
  readonly datasetId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly descriptors: readonly StrategyDescriptor[];
  readonly performanceObservations: readonly StrategyPerformanceObservation[];
  readonly riskObservations: readonly StrategyRiskObservation[];
  readonly marketContexts: readonly MarketContextSnapshot[];
  readonly sourceVersion: string;
  readonly checksum?: string;
}

export interface ExtractedFeature {
  readonly name: string;
  readonly valueType: FeatureValueType;
  readonly numericValue?: number;
  readonly booleanValue?: boolean;
  readonly categoryValue?: string;
  readonly vectorValue?: readonly number[];
  readonly normalizedValue?: number;
  readonly importanceHint?: number;
  readonly source: string;
}

export interface StrategyFeatureVector {
  readonly featureVectorId: MetaLearningId;
  readonly strategyId: StrategyId;
  readonly observationId?: MetaLearningId;
  readonly regime: MarketRegime;
  readonly generatedAt: MetaLearningTimestamp;
  readonly features: readonly ExtractedFeature[];
  readonly qualityScore: number;
  readonly missingFeatureNames: readonly string[];
}

export interface FeatureExtractionRequest {
  readonly requestId: MetaLearningId;
  readonly timestamp: MetaLearningTimestamp;
  readonly dataset: StrategyLearningDataset;
  readonly includedFeatureNames?: readonly string[];
  readonly excludedFeatureNames?: readonly string[];
  readonly normalize: boolean;
}

export interface FeatureExtractionResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly rejectedObservationIds: readonly MetaLearningId[];
  readonly warnings: readonly string[];
}

export interface PerformancePattern {
  readonly patternId: MetaLearningId;
  readonly name: string;
  readonly description: string;
  readonly strategyIds: readonly StrategyId[];
  readonly regimes: readonly MarketRegime[];
  readonly direction: PatternDirection;
  readonly confidence: number;
  readonly confidenceBand: PatternConfidenceBand;
  readonly support: number;
  readonly sampleSize: number;
  readonly expectedImpact: number;
  readonly stabilityScore: number;
  readonly featureConditions: Readonly<Record<string, MetaLearningNumericRange>>;
  readonly evidenceObservationIds: readonly MetaLearningId[];
  readonly discoveredAt: MetaLearningTimestamp;
}

export interface PatternMiningRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly minimumSupport: number;
  readonly minimumConfidence: number;
  readonly minimumSampleSize: number;
  readonly maximumPatterns: number;
}

export interface PatternMiningResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly patterns: readonly PerformancePattern[];
  readonly rejectedPatternCount: number;
  readonly warnings: readonly string[];
}

export interface RegimeLearningEvidence {
  readonly strategyId: StrategyId;
  readonly regime: MarketRegime;
  readonly score: number;
  readonly confidence: number;
  readonly sampleSize: number;
  readonly observationIds: readonly MetaLearningId[];
}

export interface LearnedRegimeProfile {
  readonly profileId: MetaLearningId;
  readonly regime: MarketRegime;
  readonly generatedAt: MetaLearningTimestamp;
  readonly dominantFeatures: readonly string[];
  readonly preferredStrategyIds: readonly StrategyId[];
  readonly avoidedStrategyIds: readonly StrategyId[];
  readonly strategyEvidence: readonly RegimeLearningEvidence[];
  readonly transitionProbabilities: Readonly<Partial<Record<MarketRegime, number>>>;
  readonly confidence: number;
  readonly stabilityScore: number;
}

export interface MarketRegimeLearningRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly marketContexts: readonly MarketContextSnapshot[];
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly knownPatterns: readonly PerformancePattern[];
  readonly minimumSampleSize: number;
}

export interface MarketRegimeLearningResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly profiles: readonly LearnedRegimeProfile[];
  readonly unknownContextIds: readonly MetaLearningId[];
  readonly warnings: readonly string[];
}

export interface StrategyLearningScore {
  readonly strategyId: StrategyId;
  readonly objective: LearningObjective;
  readonly rawScore: number;
  readonly normalizedScore: number;
  readonly confidence: number;
  readonly stabilityScore: number;
  readonly regimeRobustnessScore: number;
  readonly riskAdjustedScore: number;
  readonly drawdownPenalty: number;
  readonly tailRiskPenalty: number;
  readonly executionCostPenalty: number;
  readonly sampleSizePenalty: number;
  readonly reasons: readonly string[];
}

export interface StrategyLearningRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly objective: LearningObjective;
  readonly descriptors: readonly StrategyDescriptor[];
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly featureVectors: readonly StrategyFeatureVector[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
  readonly patterns: readonly PerformancePattern[];
  readonly minimumSampleSize: number;
}

export interface StrategyLearningResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly scores: readonly StrategyLearningScore[];
  readonly bestStrategyIds: readonly StrategyId[];
  readonly underperformingStrategyIds: readonly StrategyId[];
  readonly warnings: readonly string[];
}

export interface AdaptiveStrategyWeight {
  readonly strategyId: StrategyId;
  readonly previousWeight: number;
  readonly proposedWeight: number;
  readonly boundedWeight: number;
  readonly delta: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface AdaptiveWeightLearningConstraints {
  readonly minimumStrategyWeight: number;
  readonly maximumStrategyWeight: number;
  readonly maximumWeightChange: number;
  readonly maximumPortfolioTurnover: number;
  readonly reserveWeight: number;
  readonly normalizeToOne: boolean;
}

export interface AdaptiveWeightLearningRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly currentWeights: Readonly<Record<StrategyId, number>>;
  readonly learningScores: readonly StrategyLearningScore[];
  readonly riskObservations: readonly StrategyRiskObservation[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
  readonly activeRegime: MarketRegime;
  readonly activeRegimeConfidence: number;
  readonly constraints: AdaptiveWeightLearningConstraints;
}

export interface AdaptiveWeightLearningResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly weights: readonly AdaptiveStrategyWeight[];
  readonly reserveWeight: number;
  readonly totalAllocatedWeight: number;
  readonly expectedTurnover: number;
  readonly confidence: number;
  readonly warnings: readonly string[];
}

export interface ReinforcementFeedbackEvent {
  readonly eventId: MetaLearningId;
  readonly strategyId: StrategyId;
  readonly timestamp: MetaLearningTimestamp;
  readonly signal: ReinforcementSignal;
  readonly reward: number;
  readonly rawOutcome: number;
  readonly expectedOutcome: number;
  readonly predictionError: number;
  readonly regime: MarketRegime;
  readonly source: string;
  readonly observationId?: MetaLearningId;
  readonly explanation: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StrategyReinforcementState {
  readonly strategyId: StrategyId;
  readonly cumulativeReward: number;
  readonly exponentiallyWeightedReward: number;
  readonly positiveFeedbackCount: number;
  readonly negativeFeedbackCount: number;
  readonly neutralFeedbackCount: number;
  readonly confidence: number;
  readonly lastUpdatedAt: MetaLearningTimestamp;
}

export interface ReinforcementFeedbackRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly learningScores: readonly StrategyLearningScore[];
  readonly previousStates: readonly StrategyReinforcementState[];
  readonly rewardDecay: number;
  readonly positiveThreshold: number;
  readonly negativeThreshold: number;
}

export interface ReinforcementFeedbackResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly events: readonly ReinforcementFeedbackEvent[];
  readonly states: readonly StrategyReinforcementState[];
  readonly warnings: readonly string[];
}

export interface StrategyParameterMutation {
  readonly key: string;
  readonly previousValue: number | string | boolean;
  readonly proposedValue: number | string | boolean;
  readonly boundedValue: number | string | boolean;
  readonly confidence: number;
  readonly reason: string;
}

export interface StrategyEvolutionCandidate {
  readonly candidateId: MetaLearningId;
  readonly parentStrategyIds: readonly StrategyId[];
  readonly proposedStrategyId: StrategyId;
  readonly action: StrategyEvolutionAction;
  readonly parameterMutations: readonly StrategyParameterMutation[];
  readonly expectedImprovement: number;
  readonly expectedRiskChange: number;
  readonly noveltyScore: number;
  readonly confidence: number;
  readonly requiredValidationStages: readonly string[];
  readonly reasons: readonly string[];
}

export interface StrategyEvolutionConstraints {
  readonly allowCloning: boolean;
  readonly allowMutation: boolean;
  readonly allowCrossover: boolean;
  readonly maximumCandidatesPerRun: number;
  readonly maximumMutationsPerCandidate: number;
  readonly maximumExpectedRiskIncrease: number;
  readonly minimumExpectedImprovement: number;
  readonly minimumConfidence: number;
}

export interface StrategyEvolutionRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly descriptors: readonly StrategyDescriptor[];
  readonly learningScores: readonly StrategyLearningScore[];
  readonly patterns: readonly PerformancePattern[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
  readonly reinforcementStates: readonly StrategyReinforcementState[];
  readonly constraints: StrategyEvolutionConstraints;
}

export interface StrategyEvolutionResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly candidates: readonly StrategyEvolutionCandidate[];
  readonly unchangedStrategyIds: readonly StrategyId[];
  readonly warnings: readonly string[];
}

export interface StrategyPromotionAssessment {
  readonly strategyId: StrategyId;
  readonly currentState: StrategyLifecycleState;
  readonly proposedState: StrategyLifecycleState;
  readonly decision: StrategyPromotionDecision;
  readonly performanceScore: number;
  readonly stabilityScore: number;
  readonly regimeRobustnessScore: number;
  readonly sampleAdequacyScore: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface StrategyPromotionPolicy {
  readonly minimumPerformanceScore: number;
  readonly minimumStabilityScore: number;
  readonly minimumRegimeRobustnessScore: number;
  readonly minimumSampleAdequacyScore: number;
  readonly minimumConfidence: number;
  readonly requiredConsecutiveSuccessfulRuns: number;
}

export interface StrategyPromotionRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly descriptors: readonly StrategyDescriptor[];
  readonly learningScores: readonly StrategyLearningScore[];
  readonly reinforcementStates: readonly StrategyReinforcementState[];
  readonly policy: StrategyPromotionPolicy;
}

export interface StrategyPromotionResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly assessments: readonly StrategyPromotionAssessment[];
  readonly promotedStrategyIds: readonly StrategyId[];
  readonly deferredStrategyIds: readonly StrategyId[];
  readonly warnings: readonly string[];
}

export interface StrategyRetirementAssessment {
  readonly strategyId: StrategyId;
  readonly currentState: StrategyLifecycleState;
  readonly proposedState: StrategyLifecycleState;
  readonly decision: StrategyRetirementDecision;
  readonly degradationScore: number;
  readonly drawdownSeverity: number;
  readonly negativeFeedbackScore: number;
  readonly regimeObsolescenceScore: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface StrategyRetirementPolicy {
  readonly minimumDegradationScore: number;
  readonly maximumAcceptableDrawdown: number;
  readonly maximumNegativeFeedbackScore: number;
  readonly minimumRegimeRelevanceScore: number;
  readonly minimumConfidence: number;
  readonly probationBeforeRetirement: boolean;
  readonly requiredConsecutiveFailedRuns: number;
}

export interface StrategyRetirementRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly descriptors: readonly StrategyDescriptor[];
  readonly observations: readonly StrategyPerformanceObservation[];
  readonly learningScores: readonly StrategyLearningScore[];
  readonly reinforcementStates: readonly StrategyReinforcementState[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
  readonly policy: StrategyRetirementPolicy;
}

export interface StrategyRetirementResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly assessments: readonly StrategyRetirementAssessment[];
  readonly retiredStrategyIds: readonly StrategyId[];
  readonly probationStrategyIds: readonly StrategyId[];
  readonly warnings: readonly string[];
}

export interface MetaLearningExplanationFactor {
  readonly factor: string;
  readonly direction: PatternDirection;
  readonly importance: number;
  readonly contribution: number;
  readonly evidence: readonly string[];
}

export interface StrategyMetaLearningExplanation {
  readonly strategyId: StrategyId;
  readonly summary: string;
  readonly decision: MetaLearningDecision;
  readonly evolutionAction: StrategyEvolutionAction;
  readonly previousWeight?: number;
  readonly proposedWeight?: number;
  readonly factors: readonly MetaLearningExplanationFactor[];
  readonly risks: readonly string[];
  readonly safeguards: readonly string[];
}

export interface MetaLearningExplainabilityRequest {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly learningResult: StrategyLearningResult;
  readonly weightLearningResult: AdaptiveWeightLearningResult;
  readonly feedbackResult: ReinforcementFeedbackResult;
  readonly evolutionResult: StrategyEvolutionResult;
  readonly promotionResult: StrategyPromotionResult;
  readonly retirementResult: StrategyRetirementResult;
  readonly patterns: readonly PerformancePattern[];
  readonly regimeProfiles: readonly LearnedRegimeProfile[];
}

export interface MetaLearningExplainabilityResult {
  readonly requestId: MetaLearningId;
  readonly generatedAt: MetaLearningTimestamp;
  readonly executiveSummary: string;
  readonly strategyExplanations: readonly StrategyMetaLearningExplanation[];
  readonly portfolioRisks: readonly string[];
  readonly appliedSafeguards: readonly string[];
  readonly confidence: number;
  readonly warnings: readonly string[];
}

export interface MetaLearningSafetyPolicy {
  readonly enabled: boolean;
  readonly dryRun: boolean;
  readonly requireHumanApprovalForPromotion: boolean;
  readonly requireHumanApprovalForRetirement: boolean;
  readonly requireHumanApprovalForEvolution: boolean;
  readonly minimumDecisionConfidence: number;
  readonly maximumStrategiesChangedPerRun: number;
  readonly maximumPortfolioTurnover: number;
  readonly maximumAllowedRiskIncrease: number;
  readonly rejectOnValidationWarning: boolean;
  readonly preserveAtLeastOneActiveStrategy: boolean;
}

export interface MetaLearningConfiguration {
  readonly objective: LearningObjective;
  readonly minimumObservationSampleSize: number;
  readonly maximumHistoricalObservations: number;
  readonly featureNormalizationEnabled: boolean;
  readonly patternMinimumSupport: number;
  readonly patternMinimumConfidence: number;
  readonly maximumPatterns: number;
  readonly rewardDecay: number;
  readonly positiveRewardThreshold: number;
  readonly negativeRewardThreshold: number;
  readonly weightConstraints: AdaptiveWeightLearningConstraints;
  readonly evolutionConstraints: StrategyEvolutionConstraints;
  readonly promotionPolicy: StrategyPromotionPolicy;
  readonly retirementPolicy: StrategyRetirementPolicy;
  readonly safetyPolicy: MetaLearningSafetyPolicy;
}

export interface MetaLearningRunRequest {
  readonly requestId: MetaLearningId;
  readonly portfolioId: PortfolioId;
  readonly requestedAt: MetaLearningTimestamp;
  readonly activeRegime: MarketRegime;
  readonly activeRegimeConfidence: number;
  readonly currentStrategyWeights: Readonly<Record<StrategyId, number>>;
  readonly previousReinforcementStates: readonly StrategyReinforcementState[];
  readonly dataset: StrategyLearningDataset;
  readonly configuration: MetaLearningConfiguration;
  readonly correlationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MetaLearningLifecycleChange {
  readonly strategyId: StrategyId;
  readonly previousState: StrategyLifecycleState;
  readonly proposedState: StrategyLifecycleState;
  readonly action: StrategyEvolutionAction;
  readonly requiresApproval: boolean;
  readonly reason: string;
}

export interface MetaLearningActionPlan {
  readonly decision: MetaLearningDecision;
  readonly generatedAt: MetaLearningTimestamp;
  readonly proposedWeights: Readonly<Record<StrategyId, number>>;
  readonly lifecycleChanges: readonly MetaLearningLifecycleChange[];
  readonly evolutionCandidates: readonly StrategyEvolutionCandidate[];
  readonly blockedActions: readonly string[];
  readonly requiredApprovals: readonly string[];
  readonly expectedPortfolioTurnover: number;
  readonly expectedRiskChange: number;
  readonly confidence: number;
}

export interface MetaLearningRunResult {
  readonly runId: MetaLearningId;
  readonly requestId: MetaLearningId;
  readonly portfolioId: PortfolioId;
  readonly status: MetaLearningRunStatus;
  readonly decision: MetaLearningDecision;
  readonly startedAt: MetaLearningTimestamp;
  readonly completedAt: MetaLearningTimestamp;
  readonly featureExtraction: FeatureExtractionResult;
  readonly patternMining: PatternMiningResult;
  readonly regimeLearning: MarketRegimeLearningResult;
  readonly strategyLearning: StrategyLearningResult;
  readonly weightLearning: AdaptiveWeightLearningResult;
  readonly reinforcementFeedback: ReinforcementFeedbackResult;
  readonly strategyEvolution: StrategyEvolutionResult;
  readonly promotion: StrategyPromotionResult;
  readonly retirement: StrategyRetirementResult;
  readonly explainability: MetaLearningExplainabilityResult;
  readonly actionPlan: MetaLearningActionPlan;
  readonly validation: MetaLearningValidationResult;
  readonly warnings: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MetaLearningRunFailure {
  readonly runId: MetaLearningId;
  readonly requestId: MetaLearningId;
  readonly portfolioId: PortfolioId;
  readonly status: "REJECTED" | "FAILED";
  readonly startedAt: MetaLearningTimestamp;
  readonly completedAt: MetaLearningTimestamp;
  readonly stage: MetaLearningRunStatus;
  readonly errorCode: string;
  readonly message: string;
  readonly validation?: MetaLearningValidationResult;
  readonly recoverable: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type MetaLearningExecutionOutcome =
  | MetaLearningRunResult
  | MetaLearningRunFailure;

export interface MetaLearningManagerSnapshot {
  readonly generatedAt: MetaLearningTimestamp;
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly rejectedRuns: number;
  readonly failedRuns: number;
  readonly lastRunId?: MetaLearningId;
  readonly lastCompletedAt?: MetaLearningTimestamp;
  readonly activeStrategyCount: number;
  readonly candidateStrategyCount: number;
  readonly probationStrategyCount: number;
  readonly retiredStrategyCount: number;
  readonly learnedPatternCount: number;
  readonly learnedRegimeProfileCount: number;
  readonly cumulativePromotions: number;
  readonly cumulativeRetirements: number;
  readonly cumulativeEvolutionCandidates: number;
}

export interface StrategyFeatureExtractorPort {
  extract(request: FeatureExtractionRequest): FeatureExtractionResult;
}

export interface PerformancePatternMinerPort {
  mine(request: PatternMiningRequest): PatternMiningResult;
}

export interface MarketRegimeLearningEnginePort {
  learn(request: MarketRegimeLearningRequest): MarketRegimeLearningResult;
}

export interface StrategyLearningEnginePort {
  learn(request: StrategyLearningRequest): StrategyLearningResult;
}

export interface AdaptiveWeightLearningEnginePort {
  learn(request: AdaptiveWeightLearningRequest): AdaptiveWeightLearningResult;
}

export interface ReinforcementFeedbackEnginePort {
  apply(request: ReinforcementFeedbackRequest): ReinforcementFeedbackResult;
}

export interface StrategyEvolutionEnginePort {
  evolve(request: StrategyEvolutionRequest): StrategyEvolutionResult;
}

export interface StrategyPromotionEnginePort {
  evaluate(request: StrategyPromotionRequest): StrategyPromotionResult;
}

export interface StrategyRetirementEnginePort {
  evaluate(request: StrategyRetirementRequest): StrategyRetirementResult;
}

export interface MetaLearningExplainabilityEnginePort {
  explain(
    request: MetaLearningExplainabilityRequest,
  ): MetaLearningExplainabilityResult;
}

export interface MetaLearningValidatorPort {
  validateRequest(request: MetaLearningRunRequest): MetaLearningValidationResult;
  validateResult(result: MetaLearningRunResult): MetaLearningValidationResult;
}

export interface AiMetaLearningManagerPort {
  execute(request: MetaLearningRunRequest): MetaLearningExecutionOutcome;
  snapshot(): MetaLearningManagerSnapshot;
}

export interface MetaLearningEvent {
  readonly eventId: MetaLearningId;
  readonly runId: MetaLearningId;
  readonly requestId: MetaLearningId;
  readonly portfolioId: PortfolioId;
  readonly timestamp: MetaLearningTimestamp;
  readonly type:
    | "RUN_STARTED"
    | "RUN_VALIDATED"
    | "FEATURES_EXTRACTED"
    | "PATTERNS_MINED"
    | "REGIMES_LEARNED"
    | "STRATEGIES_SCORED"
    | "WEIGHTS_LEARNED"
    | "FEEDBACK_APPLIED"
    | "STRATEGIES_EVOLVED"
    | "LIFECYCLE_EVALUATED"
    | "EXPLANATION_GENERATED"
    | "RUN_COMPLETED"
    | "RUN_REJECTED"
    | "RUN_FAILED";
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface MetaLearningEventPublisher {
  publish(event: MetaLearningEvent): void;
}

export interface MetaLearningPersistencePort {
  saveOutcome(outcome: MetaLearningExecutionOutcome): void;
  saveSnapshot(snapshot: MetaLearningManagerSnapshot): void;
}

export interface MetaLearningManagerDependencies {
  readonly clock: MetaLearningClock;
  readonly idGenerator: MetaLearningIdGenerator;
  readonly validator: MetaLearningValidatorPort;
  readonly featureExtractor: StrategyFeatureExtractorPort;
  readonly patternMiner: PerformancePatternMinerPort;
  readonly regimeLearningEngine: MarketRegimeLearningEnginePort;
  readonly strategyLearningEngine: StrategyLearningEnginePort;
  readonly adaptiveWeightLearningEngine: AdaptiveWeightLearningEnginePort;
  readonly reinforcementFeedbackEngine: ReinforcementFeedbackEnginePort;
  readonly strategyEvolutionEngine: StrategyEvolutionEnginePort;
  readonly strategyPromotionEngine: StrategyPromotionEnginePort;
  readonly strategyRetirementEngine: StrategyRetirementEnginePort;
  readonly explainabilityEngine: MetaLearningExplainabilityEnginePort;
  readonly eventPublisher?: MetaLearningEventPublisher;
  readonly persistence?: MetaLearningPersistencePort;
  readonly logger?: MetaLearningLogger;
}

export const DEFAULT_ADAPTIVE_WEIGHT_LEARNING_CONSTRAINTS: AdaptiveWeightLearningConstraints =
  Object.freeze({
    minimumStrategyWeight: 0,
    maximumStrategyWeight: 0.35,
    maximumWeightChange: 0.1,
    maximumPortfolioTurnover: 0.25,
    reserveWeight: 0.05,
    normalizeToOne: true,
  });

export const DEFAULT_STRATEGY_EVOLUTION_CONSTRAINTS: StrategyEvolutionConstraints =
  Object.freeze({
    allowCloning: true,
    allowMutation: true,
    allowCrossover: false,
    maximumCandidatesPerRun: 5,
    maximumMutationsPerCandidate: 3,
    maximumExpectedRiskIncrease: 0.05,
    minimumExpectedImprovement: 0.02,
    minimumConfidence: 0.7,
  });

export const DEFAULT_STRATEGY_PROMOTION_POLICY: StrategyPromotionPolicy =
  Object.freeze({
    minimumPerformanceScore: 0.65,
    minimumStabilityScore: 0.65,
    minimumRegimeRobustnessScore: 0.6,
    minimumSampleAdequacyScore: 0.7,
    minimumConfidence: 0.75,
    requiredConsecutiveSuccessfulRuns: 3,
  });

export const DEFAULT_STRATEGY_RETIREMENT_POLICY: StrategyRetirementPolicy =
  Object.freeze({
    minimumDegradationScore: 0.75,
    maximumAcceptableDrawdown: 0.25,
    maximumNegativeFeedbackScore: 0.7,
    minimumRegimeRelevanceScore: 0.25,
    minimumConfidence: 0.8,
    probationBeforeRetirement: true,
    requiredConsecutiveFailedRuns: 3,
  });

export const DEFAULT_META_LEARNING_SAFETY_POLICY: MetaLearningSafetyPolicy =
  Object.freeze({
    enabled: true,
    dryRun: true,
    requireHumanApprovalForPromotion: true,
    requireHumanApprovalForRetirement: true,
    requireHumanApprovalForEvolution: true,
    minimumDecisionConfidence: 0.7,
    maximumStrategiesChangedPerRun: 5,
    maximumPortfolioTurnover: 0.25,
    maximumAllowedRiskIncrease: 0.05,
    rejectOnValidationWarning: false,
    preserveAtLeastOneActiveStrategy: true,
  });

export const DEFAULT_META_LEARNING_CONFIGURATION: MetaLearningConfiguration =
  Object.freeze({
    objective: "BALANCED",
    minimumObservationSampleSize: 30,
    maximumHistoricalObservations: 10_000,
    featureNormalizationEnabled: true,
    patternMinimumSupport: 0.1,
    patternMinimumConfidence: 0.65,
    maximumPatterns: 100,
    rewardDecay: 0.9,
    positiveRewardThreshold: 0.02,
    negativeRewardThreshold: -0.02,
    weightConstraints: DEFAULT_ADAPTIVE_WEIGHT_LEARNING_CONSTRAINTS,
    evolutionConstraints: DEFAULT_STRATEGY_EVOLUTION_CONSTRAINTS,
    promotionPolicy: DEFAULT_STRATEGY_PROMOTION_POLICY,
    retirementPolicy: DEFAULT_STRATEGY_RETIREMENT_POLICY,
    safetyPolicy: DEFAULT_META_LEARNING_SAFETY_POLICY,
  });

export const META_LEARNING_RUN_STATUSES: readonly MetaLearningRunStatus[] =
  Object.freeze([
    "CREATED",
    "VALIDATED",
    "EXTRACTING_FEATURES",
    "MINING_PATTERNS",
    "LEARNING_REGIMES",
    "LEARNING_WEIGHTS",
    "APPLYING_FEEDBACK",
    "EVOLVING_STRATEGIES",
    "EVALUATING_LIFECYCLE",
    "EXPLAINING",
    "COMPLETED",
    "REJECTED",
    "FAILED",
  ]);

export const MARKET_REGIMES: readonly MarketRegime[] = Object.freeze([
  "BULL_TREND",
  "BEAR_TREND",
  "SIDEWAYS",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "RISK_ON",
  "RISK_OFF",
  "LIQUIDITY_STRESS",
  "RECOVERY",
  "UNKNOWN",
]);

export const STRATEGY_LIFECYCLE_STATES: readonly StrategyLifecycleState[] =
  Object.freeze([
    "CANDIDATE",
    "EXPERIMENTAL",
    "ACTIVE",
    "PROBATION",
    "DEGRADED",
    "RETIRED",
    "ARCHIVED",
  ]);