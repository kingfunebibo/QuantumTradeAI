/**
 * QuantumTradeAI
 * Milestone 34 — Autonomous AI Meta-Learning & Continuous Strategy Evolution
 *
 * File 9:
 * src/trading/ai-meta-learning/strategy-evolution-engine.ts
 *
 * Deterministic production-grade strategy evolution engine.
 */

import {
  type LearnedRegimeProfile,
  type PerformancePattern,
  type StrategyDescriptor,
  type StrategyEvolutionAction,
  type StrategyEvolutionCandidate,
  type StrategyEvolutionConstraints,
  type StrategyEvolutionEnginePort,
  type StrategyEvolutionRequest,
  type StrategyEvolutionResult,
  type StrategyLearningScore,
  type StrategyParameterDefinition,
  type StrategyParameterMutation,
  type StrategyParameterValue,
  type StrategyReinforcementState,
} from "./ai-meta-learning-contracts";

const EPSILON = 1e-12;
const DEFAULT_VALIDATION_STAGES = Object.freeze([
  "STATIC_CONTRACT_VALIDATION",
  "PARAMETER_BOUND_VALIDATION",
  "DETERMINISTIC_BACKTEST",
  "OUT_OF_SAMPLE_VALIDATION",
  "RISK_POLICY_VALIDATION",
  "PAPER_TRADING_VALIDATION",
]);

interface StrategyContext {
  readonly descriptor: StrategyDescriptor;
  readonly score?: StrategyLearningScore;
  readonly reinforcement?: StrategyReinforcementState;
  readonly positivePatterns: readonly PerformancePattern[];
  readonly negativePatterns: readonly PerformancePattern[];
  readonly regimePreference: number;
  readonly regimeConfidence: number;
  readonly quality: number;
  readonly riskPressure: number;
  readonly feedbackBias: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

interface RankedCandidate {
  readonly candidate: StrategyEvolutionCandidate;
  readonly priority: number;
}

export interface StrategyEvolutionEngineOptions {
  readonly scoreWeight?: number;
  readonly reinforcementWeight?: number;
  readonly regimeWeight?: number;
  readonly patternWeight?: number;
  readonly stabilityWeight?: number;
  readonly mutationStepScale?: number;
  readonly cloneQualityThreshold?: number;
  readonly crossoverQualityThreshold?: number;
  readonly weakStrategyThreshold?: number;
}

export class StrategyEvolutionEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "STRATEGY_EVOLUTION_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "StrategyEvolutionEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyEvolutionEngine implements StrategyEvolutionEnginePort {
  private readonly scoreWeight: number;
  private readonly reinforcementWeight: number;
  private readonly regimeWeight: number;
  private readonly patternWeight: number;
  private readonly stabilityWeight: number;
  private readonly mutationStepScale: number;
  private readonly cloneQualityThreshold: number;
  private readonly crossoverQualityThreshold: number;
  private readonly weakStrategyThreshold: number;

  public constructor(options: StrategyEvolutionEngineOptions = {}) {
    this.scoreWeight = nonNegative(options.scoreWeight ?? 0.3);
    this.reinforcementWeight = nonNegative(
      options.reinforcementWeight ?? 0.2,
    );
    this.regimeWeight = nonNegative(options.regimeWeight ?? 0.18);
    this.patternWeight = nonNegative(options.patternWeight ?? 0.14);
    this.stabilityWeight = nonNegative(options.stabilityWeight ?? 0.18);
    this.mutationStepScale = clamp01(options.mutationStepScale ?? 0.12);
    this.cloneQualityThreshold = clamp01(
      options.cloneQualityThreshold ?? 0.72,
    );
    this.crossoverQualityThreshold = clamp01(
      options.crossoverQualityThreshold ?? 0.66,
    );
    this.weakStrategyThreshold = clamp01(
      options.weakStrategyThreshold ?? 0.34,
    );
  }

  public evolve(request: StrategyEvolutionRequest): StrategyEvolutionResult {
    this.assertRequest(request);

    const warnings: string[] = [];
    const contexts = request.descriptors
      .map((descriptor) => this.buildContext(request, descriptor, warnings))
      .sort((left, right) =>
        left.descriptor.strategyId.localeCompare(
          right.descriptor.strategyId,
        ),
      );

    if (contexts.length === 0) {
      return freezeResult({
        requestId: request.requestId,
        generatedAt: request.generatedAt,
        candidates: [],
        unchangedStrategyIds: [],
        warnings: ["No strategy descriptors were available for evolution."],
      });
    }

    const ranked: RankedCandidate[] = [];

    for (const context of contexts) {
      const mutation = this.createMutationCandidate(
        request,
        context,
        ranked.length,
      );
      if (mutation) {
        ranked.push(mutation);
      }

      const clone = this.createCloneCandidate(
        request,
        context,
        ranked.length,
      );
      if (clone) {
        ranked.push(clone);
      }
    }

    for (const crossover of this.createCrossoverCandidates(
      request,
      contexts,
      ranked.length,
    )) {
      ranked.push(crossover);
    }

    const deduplicated = this.deduplicateCandidates(ranked);
    const accepted = deduplicated
      .filter(({ candidate }) =>
        this.meetsConstraints(candidate, request.constraints),
      )
      .sort(compareRankedCandidates)
      .slice(0, request.constraints.maximumCandidatesPerRun)
      .map(({ candidate }, index) =>
        this.reidentifyCandidate(request, candidate, index),
      );

    const rejectedCount = deduplicated.length - accepted.length;
    if (rejectedCount > 0) {
      warnings.push(
        `${rejectedCount} evolution candidate(s) were rejected by constraints, deduplication, or the run limit.`,
      );
    }

    if (!request.constraints.allowMutation) {
      warnings.push("Parameter mutation is disabled by evolution constraints.");
    }
    if (!request.constraints.allowCloning) {
      warnings.push("Strategy cloning is disabled by evolution constraints.");
    }
    if (!request.constraints.allowCrossover) {
      warnings.push("Strategy crossover is disabled by evolution constraints.");
    }

    const changed = new Set(
      accepted.flatMap((candidate) => candidate.parentStrategyIds),
    );
    const unchangedStrategyIds = contexts
      .map((context) => context.descriptor.strategyId)
      .filter((strategyId) => !changed.has(strategyId))
      .sort();

    if (accepted.length === 0) {
      warnings.push(
        "No evolution candidate satisfied the configured constraints.",
      );
    }

    return freezeResult({
      requestId: request.requestId,
      generatedAt: request.generatedAt,
      candidates: accepted,
      unchangedStrategyIds,
      warnings: Array.from(new Set(warnings)).sort(),
    });
  }

  private buildContext(
    request: StrategyEvolutionRequest,
    descriptor: StrategyDescriptor,
    warnings: string[],
  ): StrategyContext {
    const score = request.learningScores.find(
      (item) => item.strategyId === descriptor.strategyId,
    );
    const reinforcement = request.reinforcementStates.find(
      (item) => item.strategyId === descriptor.strategyId,
    );
    const patterns = request.patterns.filter((pattern) =>
      pattern.strategyIds.includes(descriptor.strategyId),
    );
    const positivePatterns = patterns.filter(
      (pattern) => pattern.direction === "POSITIVE",
    );
    const negativePatterns = patterns.filter(
      (pattern) => pattern.direction === "NEGATIVE",
    );

    if (!score) {
      warnings.push(
        `Strategy '${descriptor.strategyId}' has no learning score; neutral score evidence was used.`,
      );
    }
    if (!reinforcement) {
      warnings.push(
        `Strategy '${descriptor.strategyId}' has no reinforcement state; neutral feedback evidence was used.`,
      );
    }

    const regimeEvidence = request.regimeProfiles
      .flatMap((profile) =>
        profile.strategyEvidence.map((evidence) => ({
          profile,
          evidence,
        })),
      )
      .filter(
        ({ evidence }) => evidence.strategyId === descriptor.strategyId,
      );

    const regimePreference = weightedAverage(
      regimeEvidence.map(({ profile, evidence }) => ({
        value: evidence.score,
        weight: Math.max(EPSILON, evidence.confidence * profile.confidence),
      })),
      0.5,
    );
    const regimeConfidence = average(
      regimeEvidence.map(({ profile, evidence }) =>
        clamp01(evidence.confidence * profile.confidence),
      ),
      0.5,
    );

    const feedbackBias = reinforcement
      ? normalizeSigned(reinforcement.exponentiallyWeightedReward)
      : 0;
    const positivePatternSignal = weightedPatternImpact(positivePatterns);
    const negativePatternSignal = weightedPatternImpact(negativePatterns);
    const patternSignal = clamp(
      positivePatternSignal - negativePatternSignal,
      -1,
      1,
    );

    const normalizedScore = score?.normalizedScore ?? 0.5;
    const riskAdjustedScore = score?.riskAdjustedScore ?? 0.5;
    const stabilityScore = score?.stabilityScore ?? 0.5;
    const totalWeight =
      this.scoreWeight +
      this.reinforcementWeight +
      this.regimeWeight +
      this.patternWeight +
      this.stabilityWeight;

    const weightedQuality =
      average([normalizedScore, riskAdjustedScore], 0.5) *
        this.scoreWeight +
      signedToUnit(feedbackBias) * this.reinforcementWeight +
      regimePreference * this.regimeWeight +
      signedToUnit(patternSignal) * this.patternWeight +
      stabilityScore * this.stabilityWeight;

    const quality = clamp01(safeDivide(weightedQuality, totalWeight));
    const riskPressure = clamp01(
      average(
        [
          score?.drawdownPenalty ?? 0,
          score?.tailRiskPenalty ?? 0,
          score?.executionCostPenalty ?? 0,
          score?.sampleSizePenalty ?? 0,
        ],
        0,
      ),
    );
    const confidence = clamp01(
      (score?.confidence ?? 0.5) * 0.45 +
        (reinforcement?.confidence ?? 0.5) * 0.25 +
        regimeConfidence * 0.2 +
        patternConfidence(patterns) * 0.1,
    );

    const reasons: string[] = [];
    if (quality >= this.cloneQualityThreshold) {
      reasons.push("Strong learned quality supports controlled expansion.");
    }
    if (quality <= this.weakStrategyThreshold) {
      reasons.push("Weak learned quality supports corrective evolution.");
    }
    if (feedbackBias >= 0.25) {
      reasons.push("Positive reinforcement supports continued evolution.");
    } else if (feedbackBias <= -0.25) {
      reasons.push("Negative reinforcement supports corrective changes.");
    }
    if (regimePreference >= 0.7) {
      reasons.push("Learned regime evidence indicates strong applicability.");
    } else if (regimePreference <= 0.3) {
      reasons.push("Learned regime evidence indicates weak applicability.");
    }
    if (riskPressure >= 0.5) {
      reasons.push("Elevated penalty pressure constrains expected risk.");
    }
    if (reasons.length === 0) {
      reasons.push("Balanced evidence supports conservative evolution.");
    }

    return Object.freeze({
      descriptor,
      score,
      reinforcement,
      positivePatterns: Object.freeze([...positivePatterns]),
      negativePatterns: Object.freeze([...negativePatterns]),
      regimePreference,
      regimeConfidence,
      quality,
      riskPressure,
      feedbackBias,
      confidence,
      reasons: Object.freeze(Array.from(new Set(reasons))),
    });
  }

  private createMutationCandidate(
    request: StrategyEvolutionRequest,
    context: StrategyContext,
    ordinal: number,
  ): RankedCandidate | undefined {
    if (!request.constraints.allowMutation) {
      return undefined;
    }

    const mutableParameters = context.descriptor.parameters
      .filter((parameter) => parameter.mutable)
      .sort((left, right) => left.key.localeCompare(right.key));

    if (mutableParameters.length === 0) {
      return undefined;
    }

    const mutationPressure = clamp(
      (0.5 - context.quality) * 0.9 - context.feedbackBias * 0.35,
      -1,
      1,
    );
    const mutations = mutableParameters
      .map((parameter, index) =>
        this.mutateParameter(parameter, mutationPressure, context, index),
      )
      .filter(
        (mutation): mutation is StrategyParameterMutation =>
          mutation !== undefined,
      )
      .slice(0, request.constraints.maximumMutationsPerCandidate);

    if (mutations.length === 0) {
      return undefined;
    }

    const expectedImprovement = clamp01(
      Math.abs(mutationPressure) * 0.35 +
        (1 - context.quality) * 0.3 +
        context.confidence * 0.2 +
        (1 - context.riskPressure) * 0.15,
    );
    const expectedRiskChange = round(
      clamp(
        context.riskPressure * 0.18 -
          expectedImprovement * 0.12 +
          mutations.length * 0.01,
        -1,
        1,
      ),
    );
    const noveltyScore = clamp01(
      0.25 +
        mutations.length /
          Math.max(1, context.descriptor.parameters.length) *
          0.5 +
        Math.abs(mutationPressure) * 0.25,
    );
    const confidence = clamp01(
      context.confidence * 0.75 + expectedImprovement * 0.25,
    );

    const candidate = freezeCandidate({
      candidateId: candidateId(request.requestId, "mutation", ordinal),
      parentStrategyIds: [context.descriptor.strategyId],
      proposedStrategyId: proposedStrategyId(
        context.descriptor.strategyId,
        "mut",
        request.requestId,
        ordinal,
      ),
      action: "MUTATE",
      parameterMutations: mutations,
      expectedImprovement: round(expectedImprovement),
      expectedRiskChange,
      noveltyScore: round(noveltyScore),
      confidence: round(confidence),
      requiredValidationStages: DEFAULT_VALIDATION_STAGES,
      reasons: Array.from(
        new Set([
          ...context.reasons,
          `${mutations.length} mutable parameter(s) received deterministic bounded proposals.`,
        ]),
      ),
    });

    return Object.freeze({
      candidate,
      priority: candidatePriority(candidate),
    });
  }

  private mutateParameter(
    parameter: StrategyParameterDefinition,
    pressure: number,
    context: StrategyContext,
    index: number,
  ): StrategyParameterMutation | undefined {
    const direction = deterministicDirection(
      pressure,
      context.descriptor.strategyId,
      parameter.key,
      index,
    );
    const confidence = clamp01(context.confidence * (0.85 - index * 0.03));

    if (
      parameter.valueType === "NUMBER" ||
      parameter.valueType === "INTEGER"
    ) {
      if (typeof parameter.currentValue !== "number") {
        return undefined;
      }
      const range = parameter.numericRange;
      const baseScale = range
        ? Math.max(EPSILON, range.maximum - range.minimum)
        : Math.max(1, Math.abs(parameter.currentValue));
      const learningRate = clamp01(
        parameter.learningRate ?? this.mutationStepScale,
      );
      const magnitude =
        baseScale *
        learningRate *
        (0.4 + Math.min(1, Math.abs(pressure)) * 0.6);
      const proposed = parameter.currentValue + direction * magnitude;
      let bounded = range
        ? clamp(proposed, range.minimum, range.maximum)
        : proposed;
      if (parameter.valueType === "INTEGER") {
        bounded = Math.round(bounded);
      }
      if (Math.abs(bounded - parameter.currentValue) <= EPSILON) {
        return undefined;
      }
      return freezeMutation({
        key: parameter.key,
        previousValue: parameter.currentValue,
        proposedValue: round(proposed),
        boundedValue: round(bounded),
        confidence: round(confidence),
        reason: range
          ? "Deterministic learning pressure adjusted the parameter within its numeric bounds."
          : "Deterministic learning pressure adjusted the numeric parameter.",
      });
    }

    if (parameter.valueType === "BOOLEAN") {
      if (typeof parameter.currentValue !== "boolean") {
        return undefined;
      }
      if (Math.abs(pressure) < 0.2) {
        return undefined;
      }
      return freezeMutation({
        key: parameter.key,
        previousValue: parameter.currentValue,
        proposedValue: !parameter.currentValue,
        boundedValue: !parameter.currentValue,
        confidence: round(confidence * 0.8),
        reason: "Strong deterministic learning pressure toggled the boolean parameter.",
      });
    }

    if (parameter.valueType === "CATEGORY") {
      const allowed = [...(parameter.allowedValues ?? [])].sort(compareValues);
      if (allowed.length < 2) {
        return undefined;
      }
      const currentIndex = allowed.findIndex(
        (value) => value === parameter.currentValue,
      );
      const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        (normalizedIndex + (direction >= 0 ? 1 : allowed.length - 1)) %
        allowed.length;
      const value = allowed[nextIndex];
      if (value === parameter.currentValue) {
        return undefined;
      }
      return freezeMutation({
        key: parameter.key,
        previousValue: parameter.currentValue,
        proposedValue: value,
        boundedValue: value,
        confidence: round(confidence * 0.75),
        reason: "Deterministic learning pressure selected an adjacent allowed category.",
      });
    }

    return undefined;
  }

  private createCloneCandidate(
    request: StrategyEvolutionRequest,
    context: StrategyContext,
    ordinal: number,
  ): RankedCandidate | undefined {
    if (
      !request.constraints.allowCloning ||
      context.quality < this.cloneQualityThreshold ||
      context.confidence < request.constraints.minimumConfidence
    ) {
      return undefined;
    }

    const expectedImprovement = clamp01(
      (context.quality - 0.5) * 0.75 +
        Math.max(0, context.feedbackBias) * 0.15 +
        context.regimePreference * 0.1,
    );
    const expectedRiskChange = round(
      clamp(context.riskPressure * 0.1 - expectedImprovement * 0.04, -1, 1),
    );
    const candidate = freezeCandidate({
      candidateId: candidateId(request.requestId, "clone", ordinal),
      parentStrategyIds: [context.descriptor.strategyId],
      proposedStrategyId: proposedStrategyId(
        context.descriptor.strategyId,
        "clone",
        request.requestId,
        ordinal,
      ),
      action: "CLONE",
      parameterMutations: [],
      expectedImprovement: round(expectedImprovement),
      expectedRiskChange,
      noveltyScore: round(clamp01(0.2 + context.regimePreference * 0.2)),
      confidence: round(context.confidence),
      requiredValidationStages: DEFAULT_VALIDATION_STAGES,
      reasons: Array.from(
        new Set([
          ...context.reasons,
          "A controlled clone preserves a strong parent before later specialization.",
        ]),
      ),
    });

    return Object.freeze({ candidate, priority: candidatePriority(candidate) });
  }

  private createCrossoverCandidates(
    request: StrategyEvolutionRequest,
    contexts: readonly StrategyContext[],
    startOrdinal: number,
  ): readonly RankedCandidate[] {
    if (!request.constraints.allowCrossover) {
      return Object.freeze([]);
    }

    const eligible = contexts
      .filter(
        (context) =>
          context.quality >= this.crossoverQualityThreshold &&
          context.confidence >= request.constraints.minimumConfidence,
      )
      .sort((left, right) =>
        right.quality - left.quality ||
        left.descriptor.strategyId.localeCompare(
          right.descriptor.strategyId,
        ),
      );
    const output: RankedCandidate[] = [];

    for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < eligible.length;
        rightIndex += 1
      ) {
        const left = eligible[leftIndex];
        const right = eligible[rightIndex];
        if (!this.areCompatible(left.descriptor, right.descriptor)) {
          continue;
        }

        const ordinal = startOrdinal + output.length;
        const mutations = this.crossoverMutations(
          left.descriptor,
          right.descriptor,
          request.constraints.maximumMutationsPerCandidate,
          average([left.confidence, right.confidence], 0.5),
        );
        const diversity = descriptorDiversity(
          left.descriptor,
          right.descriptor,
        );
        const expectedImprovement = clamp01(
          average([left.quality, right.quality], 0.5) * 0.55 +
            diversity * 0.25 +
            average(
              [
                Math.max(0, left.feedbackBias),
                Math.max(0, right.feedbackBias),
              ],
              0,
            ) *
              0.2,
        );
        const expectedRiskChange = round(
          clamp(
            average([left.riskPressure, right.riskPressure], 0) * 0.16 -
              expectedImprovement * 0.08 +
              diversity * 0.04,
            -1,
            1,
          ),
        );
        const confidence = clamp01(
          average([left.confidence, right.confidence], 0.5) * 0.8 +
            Math.min(left.confidence, right.confidence) * 0.2,
        );
        const baseId = [
          left.descriptor.strategyId,
          right.descriptor.strategyId,
        ]
          .sort()
          .join("-");
        const candidate = freezeCandidate({
          candidateId: candidateId(request.requestId, "crossover", ordinal),
          parentStrategyIds: [
            left.descriptor.strategyId,
            right.descriptor.strategyId,
          ].sort(),
          proposedStrategyId: proposedStrategyId(
            baseId,
            "cross",
            request.requestId,
            ordinal,
          ),
          action: "CROSSOVER",
          parameterMutations: mutations,
          expectedImprovement: round(expectedImprovement),
          expectedRiskChange,
          noveltyScore: round(clamp01(0.45 + diversity * 0.55)),
          confidence: round(confidence),
          requiredValidationStages: DEFAULT_VALIDATION_STAGES,
          reasons: Array.from(
            new Set([
              "Compatible high-quality parents support deterministic crossover.",
              "Shared family, symbol, timeframe, or regime coverage reduces structural incompatibility.",
              ...left.reasons,
              ...right.reasons,
            ]),
          ),
        });
        output.push(
          Object.freeze({
            candidate,
            priority: candidatePriority(candidate),
          }),
        );
      }
    }

    return Object.freeze(output);
  }

  private crossoverMutations(
    left: StrategyDescriptor,
    right: StrategyDescriptor,
    maximum: number,
    confidence: number,
  ): readonly StrategyParameterMutation[] {
    const rightByKey = new Map(
      right.parameters.map((parameter) => [parameter.key, parameter]),
    );
    const mutations: StrategyParameterMutation[] = [];

    for (const leftParameter of [...left.parameters].sort((a, b) =>
      a.key.localeCompare(b.key),
    )) {
      if (!leftParameter.mutable) {
        continue;
      }
      const rightParameter = rightByKey.get(leftParameter.key);
      if (
        !rightParameter ||
        rightParameter.valueType !== leftParameter.valueType ||
        rightParameter.currentValue === leftParameter.currentValue
      ) {
        continue;
      }

      const proposed = crossoverValue(leftParameter, rightParameter);
      if (proposed === undefined || proposed === leftParameter.currentValue) {
        continue;
      }
      mutations.push(
        freezeMutation({
          key: leftParameter.key,
          previousValue: leftParameter.currentValue,
          proposedValue: proposed,
          boundedValue: proposed,
          confidence: round(clamp01(confidence)),
          reason: "The crossover deterministically combined compatible parent parameter values.",
        }),
      );
      if (mutations.length >= maximum) {
        break;
      }
    }

    return Object.freeze(mutations);
  }

  private areCompatible(
    left: StrategyDescriptor,
    right: StrategyDescriptor,
  ): boolean {
    if (left.strategyId === right.strategyId) {
      return false;
    }
    if (left.strategyFamily === right.strategyFamily) {
      return true;
    }
    return (
      intersects(left.symbols, right.symbols) &&
      (intersects(left.timeframes, right.timeframes) ||
        intersects(left.supportedRegimes, right.supportedRegimes))
    );
  }

  private meetsConstraints(
    candidate: StrategyEvolutionCandidate,
    constraints: StrategyEvolutionConstraints,
  ): boolean {
    return (
      candidate.expectedImprovement + EPSILON >=
        constraints.minimumExpectedImprovement &&
      candidate.confidence + EPSILON >= constraints.minimumConfidence &&
      candidate.expectedRiskChange <=
        constraints.maximumExpectedRiskIncrease + EPSILON &&
      candidate.parameterMutations.length <=
        constraints.maximumMutationsPerCandidate
    );
  }

  private deduplicateCandidates(
    candidates: readonly RankedCandidate[],
  ): readonly RankedCandidate[] {
    const byKey = new Map<string, RankedCandidate>();
    for (const item of candidates) {
      const key = [
        item.candidate.action,
        [...item.candidate.parentStrategyIds].sort().join("|"),
        item.candidate.parameterMutations
          .map((mutation) => `${mutation.key}:${String(mutation.boundedValue)}`)
          .sort()
          .join("|"),
      ].join("::");
      const existing = byKey.get(key);
      if (!existing || compareRankedCandidates(item, existing) < 0) {
        byKey.set(key, item);
      }
    }
    return Object.freeze([...byKey.values()]);
  }

  private reidentifyCandidate(
    request: StrategyEvolutionRequest,
    candidate: StrategyEvolutionCandidate,
    ordinal: number,
  ): StrategyEvolutionCandidate {
    const suffix = actionSuffix(candidate.action);
    return freezeCandidate({
      ...candidate,
      candidateId: candidateId(request.requestId, suffix, ordinal),
      proposedStrategyId: proposedStrategyId(
        candidate.parentStrategyIds.join("-"),
        suffix,
        request.requestId,
        ordinal,
      ),
    });
  }

  private assertRequest(request: StrategyEvolutionRequest): void {
    if (request === null || typeof request !== "object") {
      throw new StrategyEvolutionEngineError(
        "Strategy evolution request must be an object.",
        "INVALID_STRATEGY_EVOLUTION_REQUEST",
      );
    }
    assertNonEmptyString(request.requestId, "requestId");
    assertTimestamp(request.generatedAt, "generatedAt");
    assertArray(request.descriptors, "descriptors");
    assertArray(request.learningScores, "learningScores");
    assertArray(request.patterns, "patterns");
    assertArray(request.regimeProfiles, "regimeProfiles");
    assertArray(request.reinforcementStates, "reinforcementStates");
    this.assertConstraints(request.constraints);

    assertUnique(
      request.descriptors.map((item) => item.strategyId),
      "descriptors contain duplicate strategyId values.",
      "DUPLICATE_EVOLUTION_DESCRIPTOR",
    );
    assertUnique(
      request.learningScores.map((item) => item.strategyId),
      "learningScores contain duplicate strategyId values.",
      "DUPLICATE_EVOLUTION_LEARNING_SCORE",
    );
    assertUnique(
      request.reinforcementStates.map((item) => item.strategyId),
      "reinforcementStates contain duplicate strategyId values.",
      "DUPLICATE_EVOLUTION_REINFORCEMENT_STATE",
    );

    for (const descriptor of request.descriptors) {
      this.assertDescriptor(descriptor);
    }
    for (const score of request.learningScores) {
      assertNonEmptyString(score.strategyId, "learningScores.strategyId");
      for (const [field, value] of Object.entries({
        normalizedScore: score.normalizedScore,
        confidence: score.confidence,
        stabilityScore: score.stabilityScore,
        regimeRobustnessScore: score.regimeRobustnessScore,
        riskAdjustedScore: score.riskAdjustedScore,
        drawdownPenalty: score.drawdownPenalty,
        tailRiskPenalty: score.tailRiskPenalty,
        executionCostPenalty: score.executionCostPenalty,
        sampleSizePenalty: score.sampleSizePenalty,
      })) {
        assertUnitInterval(value, `learningScores.${field}`);
      }
    }
    for (const state of request.reinforcementStates) {
      assertNonEmptyString(
        state.strategyId,
        "reinforcementStates.strategyId",
      );
      assertFinite(
        state.cumulativeReward,
        "reinforcementStates.cumulativeReward",
      );
      assertFinite(
        state.exponentiallyWeightedReward,
        "reinforcementStates.exponentiallyWeightedReward",
      );
      assertUnitInterval(state.confidence, "reinforcementStates.confidence");
      assertTimestamp(
        state.lastUpdatedAt,
        "reinforcementStates.lastUpdatedAt",
      );
    }
  }

  private assertDescriptor(descriptor: StrategyDescriptor): void {
    if (descriptor === null || typeof descriptor !== "object") {
      throw new StrategyEvolutionEngineError(
        "Each descriptor must be an object.",
        "INVALID_EVOLUTION_DESCRIPTOR",
      );
    }
    assertNonEmptyString(descriptor.strategyId, "descriptors.strategyId");
    assertNonEmptyString(descriptor.name, "descriptors.name");
    assertNonEmptyString(descriptor.version, "descriptors.version");
    assertNonEmptyString(
      descriptor.strategyFamily,
      "descriptors.strategyFamily",
    );
    assertArray(descriptor.parameters, "descriptors.parameters");
    assertUnique(
      descriptor.parameters.map((parameter) => parameter.key),
      `Descriptor '${descriptor.strategyId}' contains duplicate parameter keys.`,
      "DUPLICATE_EVOLUTION_PARAMETER",
    );

    for (const parameter of descriptor.parameters) {
      assertNonEmptyString(parameter.key, "descriptors.parameters.key");
      if (parameter.numericRange) {
        assertFinite(
          parameter.numericRange.minimum,
          "parameters.numericRange.minimum",
        );
        assertFinite(
          parameter.numericRange.maximum,
          "parameters.numericRange.maximum",
        );
        if (
          parameter.numericRange.minimum > parameter.numericRange.maximum
        ) {
          throw new StrategyEvolutionEngineError(
            `Parameter '${parameter.key}' has an invalid numeric range.`,
            "INVALID_EVOLUTION_PARAMETER_RANGE",
          );
        }
      }
      if (parameter.learningRate !== undefined) {
        assertUnitInterval(
          parameter.learningRate,
          "parameters.learningRate",
        );
      }
    }
  }

  private assertConstraints(
    constraints: StrategyEvolutionConstraints,
  ): void {
    if (constraints === null || typeof constraints !== "object") {
      throw new StrategyEvolutionEngineError(
        "constraints must be an object.",
        "INVALID_STRATEGY_EVOLUTION_CONSTRAINTS",
      );
    }
    assertPositiveInteger(
      constraints.maximumCandidatesPerRun,
      "maximumCandidatesPerRun",
    );
    assertNonNegativeInteger(
      constraints.maximumMutationsPerCandidate,
      "maximumMutationsPerCandidate",
    );
    assertFinite(
      constraints.maximumExpectedRiskIncrease,
      "maximumExpectedRiskIncrease",
    );
    assertUnitInterval(
      constraints.minimumExpectedImprovement,
      "minimumExpectedImprovement",
    );
    assertUnitInterval(constraints.minimumConfidence, "minimumConfidence");
  }
}

export function createStrategyEvolutionEngine(
  options: StrategyEvolutionEngineOptions = {},
): StrategyEvolutionEngine {
  return new StrategyEvolutionEngine(options);
}

function actionSuffix(action: StrategyEvolutionAction): string {
  switch (action) {
    case "MUTATE":
      return "mutation";
    case "CLONE":
      return "clone";
    case "CROSSOVER":
      return "crossover";
    default:
      return action.toLowerCase().replace(/_/g, "-");
  }
}

function candidatePriority(candidate: StrategyEvolutionCandidate): number {
  return round(
    candidate.expectedImprovement * 0.42 +
      candidate.confidence * 0.28 +
      candidate.noveltyScore * 0.18 -
      Math.max(0, candidate.expectedRiskChange) * 0.12,
  );
}

function compareRankedCandidates(
  left: RankedCandidate,
  right: RankedCandidate,
): number {
  return (
    right.priority - left.priority ||
    right.candidate.expectedImprovement -
      left.candidate.expectedImprovement ||
    right.candidate.confidence - left.candidate.confidence ||
    left.candidate.action.localeCompare(right.candidate.action) ||
    left.candidate.parentStrategyIds
      .join("|")
      .localeCompare(right.candidate.parentStrategyIds.join("|")) ||
    left.candidate.proposedStrategyId.localeCompare(
      right.candidate.proposedStrategyId,
    )
  );
}

function crossoverValue(
  left: StrategyParameterDefinition,
  right: StrategyParameterDefinition,
): number | string | boolean | undefined {
  if (
    (left.valueType === "NUMBER" || left.valueType === "INTEGER") &&
    typeof left.currentValue === "number" &&
    typeof right.currentValue === "number"
  ) {
    let value = (left.currentValue + right.currentValue) / 2;
    if (left.numericRange) {
      value = clamp(
        value,
        left.numericRange.minimum,
        left.numericRange.maximum,
      );
    }
    return left.valueType === "INTEGER" ? Math.round(value) : round(value);
  }
  if (left.valueType === "BOOLEAN") {
    return right.currentValue;
  }
  if (left.valueType === "CATEGORY") {
    const allowed = left.allowedValues ?? [];
    return allowed.includes(right.currentValue)
      ? right.currentValue
      : left.currentValue;
  }
  return undefined;
}

function descriptorDiversity(
  left: StrategyDescriptor,
  right: StrategyDescriptor,
): number {
  const familyDifference =
    left.strategyFamily === right.strategyFamily ? 0 : 1;
  const tagDifference = 1 - jaccard(left.tags, right.tags);
  const regimeDifference =
    1 - jaccard(left.supportedRegimes, right.supportedRegimes);
  const parameterDifference =
    1 -
    jaccard(
      left.parameters.map((parameter) => parameter.key),
      right.parameters.map((parameter) => parameter.key),
    );
  return clamp01(
    familyDifference * 0.25 +
      tagDifference * 0.25 +
      regimeDifference * 0.25 +
      parameterDifference * 0.25,
  );
}

function weightedPatternImpact(
  patterns: readonly PerformancePattern[],
): number {
  return weightedAverage(
    patterns.map((pattern) => ({
      value: clamp01(Math.abs(pattern.expectedImpact)),
      weight: Math.max(
        EPSILON,
        pattern.confidence * pattern.stabilityScore * pattern.support,
      ),
    })),
    0,
  );
}

function patternConfidence(patterns: readonly PerformancePattern[]): number {
  return weightedAverage(
    patterns.map((pattern) => ({
      value: pattern.confidence,
      weight: Math.max(EPSILON, pattern.support),
    })),
    patterns.length === 0 ? 0.5 : 0,
  );
}

function deterministicDirection(
  pressure: number,
  strategyId: string,
  parameterKey: string,
  index: number,
): number {
  if (pressure > EPSILON) {
    return 1;
  }
  if (pressure < -EPSILON) {
    return -1;
  }
  return stableHash(`${strategyId}|${parameterKey}|${index}`) % 2 === 0
    ? 1
    : -1;
}

function candidateId(
  requestId: string,
  kind: string,
  ordinal: number,
): string {
  return `${sanitize(requestId)}-${kind}-${String(ordinal + 1).padStart(3, "0")}`;
}

function proposedStrategyId(
  base: string,
  kind: string,
  requestId: string,
  ordinal: number,
): string {
  const token = stableHash(`${requestId}|${base}|${kind}|${ordinal}`)
    .toString(36)
    .padStart(7, "0")
    .slice(-7);
  return `${sanitize(base)}-${kind}-${token}`;
}

function sanitize(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.length > 0 ? sanitized : "strategy";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function freezeMutation(
  mutation: StrategyParameterMutation,
): StrategyParameterMutation {
  return Object.freeze({ ...mutation });
}

function freezeCandidate(
  candidate: StrategyEvolutionCandidate,
): StrategyEvolutionCandidate {
  return Object.freeze({
    ...candidate,
    parentStrategyIds: Object.freeze([...candidate.parentStrategyIds]),
    parameterMutations: Object.freeze(
      candidate.parameterMutations.map(freezeMutation),
    ),
    requiredValidationStages: Object.freeze([
      ...candidate.requiredValidationStages,
    ]),
    reasons: Object.freeze([...candidate.reasons]),
  });
}

function freezeResult(result: StrategyEvolutionResult): StrategyEvolutionResult {
  return Object.freeze({
    ...result,
    candidates: Object.freeze(result.candidates.map(freezeCandidate)),
    unchangedStrategyIds: Object.freeze([...result.unchangedStrategyIds]),
    warnings: Object.freeze([...result.warnings]),
  });
}

function intersects<T>(left: readonly T[], right: readonly T[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function jaccard<T>(left: readonly T[], right: readonly T[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

function compareValues(
  left: string | number | boolean,
  right: string | number | boolean,
): number {
  return String(left).localeCompare(String(right));
}

function normalizeSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp(value / (1 + Math.abs(value)), -1, 1);
}

function signedToUnit(value: number): number {
  return clamp01((value + 1) / 2);
}

function weightedAverage(
  values: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
  fallback: number,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const item of values) {
    if (
      !Number.isFinite(item.value) ||
      !Number.isFinite(item.weight) ||
      item.weight <= 0
    ) {
      continue;
    }
    numerator += item.value * item.weight;
    denominator += item.weight;
  }
  return denominator <= EPSILON ? fallback : numerator / denominator;
}

function average(values: readonly number[], fallback: number): number {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0
    ? fallback
    : finite.reduce((total, value) => total + value, 0) / finite.length;
}

function safeDivide(numerator: number, denominator: number): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) <= EPSILON
  ) {
    return 0;
  }
  return numerator / denominator;
}

function assertNonEmptyString(value: unknown, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a non-empty string.`,
      "INVALID_STRATEGY_EVOLUTION_STRING",
    );
  }
}

function assertTimestamp(value: unknown, fieldName: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a valid timestamp.`,
      "INVALID_STRATEGY_EVOLUTION_TIMESTAMP",
    );
  }
}

function assertArray(value: unknown, fieldName: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be an array.`,
      "INVALID_STRATEGY_EVOLUTION_ARRAY",
    );
  }
}

function assertUnique(
  values: readonly string[],
  message: string,
  code: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new StrategyEvolutionEngineError(message, code);
  }
}

function assertFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a finite number.`,
      "INVALID_STRATEGY_EVOLUTION_NUMBER",
    );
  }
}

function assertUnitInterval(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a finite number between 0 and 1.`,
      "INVALID_STRATEGY_EVOLUTION_RANGE",
    );
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a positive integer.`,
      "INVALID_STRATEGY_EVOLUTION_INTEGER",
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyEvolutionEngineError(
      `${fieldName} must be a non-negative integer.`,
      "INVALID_STRATEGY_EVOLUTION_INTEGER",
    );
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}