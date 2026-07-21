/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 5:
 * src/trading/ai-decision-intelligence/candidate-scoring-engine.ts
 *
 * Deterministic, explainable and immutable multi-factor scoring of decision
 * candidates. The engine normalizes positive and penalty weights separately,
 * applies eligibility gates, and assigns stable ranks with deterministic ties.
 */

import type {
  DecisionCandidate,
  DecisionCandidateScoringEnginePort,
  DecisionCandidateScoringRequest,
  DecisionCandidateScoringResult,
  DecisionCandidateScoringWeights,
  DecisionIntelligenceId,
  DecisionPriority,
  DecisionUrgency,
  ScoredDecisionCandidate,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;
const SCORE_PRECISION = 12;

export interface CandidateScoringEngineOptions {
  readonly rejectExpiredCandidates?: boolean;
  readonly rejectHardConstraintViolations?: boolean;
  readonly rejectRiskBudgetBreaches?: boolean;
  readonly rejectNonFiniteValues?: boolean;
  readonly maximumAcceptedCost?: number;
  readonly maximumAcceptedRiskScore?: number;
  readonly minimumEvidenceCoverage?: number;
  readonly priorityInfluence?: number;
  readonly urgencyInfluence?: number;
  readonly warningPenaltyPerItem?: number;
  readonly hardConstraintPenalty?: number;
  readonly softConstraintPenalty?: number;
  readonly advisoryConstraintPenalty?: number;
  readonly riskBudgetBreachPenalty?: number;
  readonly breachedLimitPenaltyPerItem?: number;
  readonly deterministicTieTolerance?: number;
}

export interface CandidateScoreBreakdown {
  readonly expectedReturnContribution: number;
  readonly riskAdjustedReturnContribution: number;
  readonly drawdownProtectionContribution: number;
  readonly diversificationContribution: number;
  readonly regimeAlignmentContribution: number;
  readonly learningValueContribution: number;
  readonly executionQualityContribution: number;
  readonly operationalStabilityContribution: number;
  readonly confidenceContribution: number;
  readonly priorityContribution: number;
  readonly urgencyContribution: number;
  readonly costPenalty: number;
  readonly riskPenalty: number;
  readonly uncertaintyPenalty: number;
  readonly warningPenalty: number;
  readonly constraintPenalty: number;
  readonly grossScore: number;
  readonly penaltyScore: number;
  readonly finalScore: number;
}

export class CandidateScoringError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "CANDIDATE_SCORING_ERROR") {
    super(message);
    this.name = "CandidateScoringError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface NormalizedScoringWeights {
  readonly positive: Readonly<{
    expectedReturn: number;
    riskAdjustedReturn: number;
    drawdownProtection: number;
    diversification: number;
    regimeAlignment: number;
    learningValue: number;
    executionQuality: number;
    operationalStability: number;
    confidence: number;
  }>;
  readonly penalties: Readonly<{
    costPenalty: number;
    riskPenalty: number;
    uncertaintyPenalty: number;
  }>;
}

interface CandidateScoreEvaluation {
  readonly candidate: DecisionCandidate;
  readonly grossScore: number;
  readonly penaltyScore: number;
  readonly finalScore: number;
  readonly eligible: boolean;
  readonly rejectionReasons: readonly string[];
  readonly breakdown: CandidateScoreBreakdown;
}

export class CandidateScoringEngine implements DecisionCandidateScoringEnginePort {
  private readonly rejectExpiredCandidates: boolean;
  private readonly rejectHardConstraintViolations: boolean;
  private readonly rejectRiskBudgetBreaches: boolean;
  private readonly rejectNonFiniteValues: boolean;
  private readonly maximumAcceptedCost: number;
  private readonly maximumAcceptedRiskScore: number;
  private readonly minimumEvidenceCoverage: number;
  private readonly priorityInfluence: number;
  private readonly urgencyInfluence: number;
  private readonly warningPenaltyPerItem: number;
  private readonly hardConstraintPenalty: number;
  private readonly softConstraintPenalty: number;
  private readonly advisoryConstraintPenalty: number;
  private readonly riskBudgetBreachPenalty: number;
  private readonly breachedLimitPenaltyPerItem: number;
  private readonly deterministicTieTolerance: number;

  public constructor(options: CandidateScoringEngineOptions = {}) {
    this.rejectExpiredCandidates = options.rejectExpiredCandidates ?? true;
    this.rejectHardConstraintViolations =
      options.rejectHardConstraintViolations ?? true;
    this.rejectRiskBudgetBreaches = options.rejectRiskBudgetBreaches ?? false;
    this.rejectNonFiniteValues = options.rejectNonFiniteValues ?? true;
    this.maximumAcceptedCost = nonNegative(
      options.maximumAcceptedCost ?? Number.POSITIVE_INFINITY,
      "maximumAcceptedCost",
      true,
    );
    this.maximumAcceptedRiskScore = unit(
      options.maximumAcceptedRiskScore ?? 1,
      "maximumAcceptedRiskScore",
    );
    this.minimumEvidenceCoverage = unit(
      options.minimumEvidenceCoverage ?? 0,
      "minimumEvidenceCoverage",
    );
    this.priorityInfluence = unit(
      options.priorityInfluence ?? 0.035,
      "priorityInfluence",
    );
    this.urgencyInfluence = unit(
      options.urgencyInfluence ?? 0.025,
      "urgencyInfluence",
    );
    this.warningPenaltyPerItem = nonNegative(
      options.warningPenaltyPerItem ?? 0.01,
      "warningPenaltyPerItem",
    );
    this.hardConstraintPenalty = nonNegative(
      options.hardConstraintPenalty ?? 0.3,
      "hardConstraintPenalty",
    );
    this.softConstraintPenalty = nonNegative(
      options.softConstraintPenalty ?? 0.08,
      "softConstraintPenalty",
    );
    this.advisoryConstraintPenalty = nonNegative(
      options.advisoryConstraintPenalty ?? 0.02,
      "advisoryConstraintPenalty",
    );
    this.riskBudgetBreachPenalty = nonNegative(
      options.riskBudgetBreachPenalty ?? 0.35,
      "riskBudgetBreachPenalty",
    );
    this.breachedLimitPenaltyPerItem = nonNegative(
      options.breachedLimitPenaltyPerItem ?? 0.04,
      "breachedLimitPenaltyPerItem",
    );
    this.deterministicTieTolerance = nonNegative(
      options.deterministicTieTolerance ?? 1e-10,
      "deterministicTieTolerance",
    );
  }

  public score(input: DecisionCandidateScoringRequest): DecisionCandidateScoringResult {
    this.assertRequest(input);

    const normalizedWeights = normalizeWeights(input.weights);
    const warnings: string[] = [];
    const seenCandidateIds = new Set<string>();
    const evaluations: CandidateScoreEvaluation[] = [];

    for (const candidate of input.candidates) {
      if (seenCandidateIds.has(candidate.candidateId)) {
        throw new CandidateScoringError(
          `Duplicate candidateId: ${candidate.candidateId}`,
          "DUPLICATE_CANDIDATE_ID",
        );
      }

      seenCandidateIds.add(candidate.candidateId);
      evaluations.push(
        this.evaluateCandidate(
          candidate,
          input.generatedAt,
          input.minimumCandidateScore,
          normalizedWeights,
        ),
      );
    }

    const sorted = [...evaluations].sort((left, right) =>
      this.compareEvaluations(left, right),
    );

    const scored = sorted.map((evaluation, index) =>
      this.toScoredCandidate(evaluation, index + 1),
    );

    const eligibleCandidateIds = scored
      .filter((candidate) => candidate.eligible)
      .map((candidate) => candidate.candidateId);
    const rejectedCandidateIds = scored
      .filter((candidate) => !candidate.eligible)
      .map((candidate) => candidate.candidateId);

    if (input.candidates.length === 0) {
      warnings.push("No decision candidates were supplied for scoring.");
    }

    if (input.candidates.length > 0 && eligibleCandidateIds.length === 0) {
      warnings.push("All decision candidates were rejected by scoring gates.");
    }

    const eligibleNoAction = scored.find(
      (candidate) => candidate.type === "NO_ACTION" && candidate.eligible,
    );
    if (eligibleNoAction !== undefined && eligibleNoAction.rank === 1) {
      warnings.push("The NO_ACTION candidate is currently the highest-ranked option.");
    }

    return Object.freeze({
      requestId: input.requestId,
      generatedAt: input.generatedAt,
      candidates: Object.freeze(scored),
      eligibleCandidateIds: Object.freeze(eligibleCandidateIds),
      rejectedCandidateIds: Object.freeze(rejectedCandidateIds),
      warnings: Object.freeze(uniqueStrings(warnings)),
    });
  }

  public explainScore(
    candidate: DecisionCandidate,
    weights: DecisionCandidateScoringWeights,
    generatedAt: string,
    minimumCandidateScore = 0,
  ): CandidateScoreBreakdown {
    const evaluation = this.evaluateCandidate(
      candidate,
      generatedAt,
      unit(minimumCandidateScore, "minimumCandidateScore"),
      normalizeWeights(weights),
    );
    return evaluation.breakdown;
  }

  private evaluateCandidate(
    candidate: DecisionCandidate,
    generatedAt: string,
    minimumCandidateScore: number,
    weights: NormalizedScoringWeights,
  ): CandidateScoreEvaluation {
    const rejectionReasons: string[] = [];
    const invalidPaths = collectNonFinitePaths(candidate);

    if (this.rejectNonFiniteValues && invalidPaths.length > 0) {
      rejectionReasons.push(
        `Candidate contains non-finite numeric values: ${invalidPaths.join(", ")}.`,
      );
    }

    if (
      this.rejectExpiredCandidates &&
      candidate.expiresAt !== undefined &&
      timestamp(candidate.expiresAt) <= timestamp(generatedAt)
    ) {
      rejectionReasons.push("Candidate expired before or at the scoring time.");
    }

    if (candidate.confidence.evidenceCoverage < this.minimumEvidenceCoverage) {
      rejectionReasons.push(
        `Evidence coverage ${format(candidate.confidence.evidenceCoverage)} is below ` +
          `the required ${format(this.minimumEvidenceCoverage)}.`,
      );
    }

    if (candidate.costs.totalCost > this.maximumAcceptedCost) {
      rejectionReasons.push(
        `Total cost ${format(candidate.costs.totalCost)} exceeds the accepted maximum ` +
          `${format(this.maximumAcceptedCost)}.`,
      );
    }

    if (candidate.riskImpact.projectedRiskScore > this.maximumAcceptedRiskScore) {
      rejectionReasons.push(
        `Projected risk score ${format(candidate.riskImpact.projectedRiskScore)} exceeds ` +
          `${format(this.maximumAcceptedRiskScore)}.`,
      );
    }

    const violatedHardConstraints = candidate.constraints.filter(
      (constraint) => constraint.enabled && constraint.type === "HARD" &&
        constraintViolation(constraint),
    );

    if (this.rejectHardConstraintViolations && violatedHardConstraints.length > 0) {
      rejectionReasons.push(
        `Violated hard constraints: ${violatedHardConstraints
          .map((constraint) => constraint.name)
          .sort(compareText)
          .join(", ")}.`,
      );
    }

    if (this.rejectRiskBudgetBreaches && !candidate.riskImpact.withinRiskBudget) {
      rejectionReasons.push("Candidate is outside the available risk budget.");
    }

    const positive = weights.positive;
    const penalties = weights.penalties;

    const expectedReturnContribution =
      unitSafe(candidate.utility.expectedReturnUtility) * positive.expectedReturn;
    const riskAdjustedReturnContribution =
      unitSafe(candidate.utility.riskAdjustedUtility) * positive.riskAdjustedReturn;
    const drawdownProtectionContribution =
      unitSafe(candidate.utility.drawdownProtectionUtility) *
      positive.drawdownProtection;
    const diversificationContribution =
      unitSafe(candidate.utility.diversificationUtility) * positive.diversification;
    const regimeAlignmentContribution =
      unitSafe(candidate.utility.regimeAlignmentUtility) * positive.regimeAlignment;
    const learningValueContribution =
      unitSafe(candidate.utility.learningUtility) * positive.learningValue;
    const executionQualityContribution =
      unitSafe(candidate.utility.executionUtility) * positive.executionQuality;
    const operationalStabilityContribution =
      mean([
        unitSafe(candidate.utility.operationalUtility),
        unitSafe(candidate.utility.stabilityUtility),
      ]) * positive.operationalStability;
    const confidenceContribution =
      unitSafe(candidate.confidence.score) * positive.confidence;

    const priorityContribution =
      priorityScore(candidate.priority) * this.priorityInfluence;
    const urgencyContribution =
      urgencyScore(candidate.urgency) * this.urgencyInfluence;

    const baseGrossScore =
      expectedReturnContribution +
      riskAdjustedReturnContribution +
      drawdownProtectionContribution +
      diversificationContribution +
      regimeAlignmentContribution +
      learningValueContribution +
      executionQualityContribution +
      operationalStabilityContribution +
      confidenceContribution;

    const grossScore = unitSafe(
      baseGrossScore + priorityContribution + urgencyContribution,
    );

    const costSeverity = aggregateCostSeverity(candidate);
    const riskSeverity = aggregateRiskSeverity(candidate);
    const uncertaintySeverity = aggregateUncertaintySeverity(candidate);
    const warningPenalty = Math.min(
      1,
      uniqueStrings([
        ...candidate.warnings,
        ...candidate.riskImpact.warnings,
      ]).length * this.warningPenaltyPerItem,
    );
    const constraintPenalty = this.calculateConstraintPenalty(candidate);

    const costPenalty = costSeverity * penalties.costPenalty;
    const riskPenalty = riskSeverity * penalties.riskPenalty;
    const uncertaintyPenalty = uncertaintySeverity * penalties.uncertaintyPenalty;

    const penaltyScore = unitSafe(
      costPenalty +
        riskPenalty +
        uncertaintyPenalty +
        warningPenalty +
        constraintPenalty,
    );
    const finalScore = round(unitSafe(grossScore - penaltyScore));

    if (finalScore + EPSILON < minimumCandidateScore) {
      rejectionReasons.push(
        `Final score ${format(finalScore)} is below the minimum candidate score ` +
          `${format(minimumCandidateScore)}.`,
      );
    }

    const breakdown: CandidateScoreBreakdown = Object.freeze({
      expectedReturnContribution: round(expectedReturnContribution),
      riskAdjustedReturnContribution: round(riskAdjustedReturnContribution),
      drawdownProtectionContribution: round(drawdownProtectionContribution),
      diversificationContribution: round(diversificationContribution),
      regimeAlignmentContribution: round(regimeAlignmentContribution),
      learningValueContribution: round(learningValueContribution),
      executionQualityContribution: round(executionQualityContribution),
      operationalStabilityContribution: round(operationalStabilityContribution),
      confidenceContribution: round(confidenceContribution),
      priorityContribution: round(priorityContribution),
      urgencyContribution: round(urgencyContribution),
      costPenalty: round(costPenalty),
      riskPenalty: round(riskPenalty),
      uncertaintyPenalty: round(uncertaintyPenalty),
      warningPenalty: round(warningPenalty),
      constraintPenalty: round(constraintPenalty),
      grossScore: round(grossScore),
      penaltyScore: round(penaltyScore),
      finalScore,
    });

    return Object.freeze({
      candidate,
      grossScore: breakdown.grossScore,
      penaltyScore: breakdown.penaltyScore,
      finalScore,
      eligible: rejectionReasons.length === 0,
      rejectionReasons: Object.freeze(uniqueStrings(rejectionReasons)),
      breakdown,
    });
  }

  private calculateConstraintPenalty(candidate: DecisionCandidate): number {
    let penalty = 0;

    for (const constraint of candidate.constraints) {
      if (!constraint.enabled || !constraintViolation(constraint)) {
        continue;
      }

      if (constraint.type === "HARD") {
        penalty += this.hardConstraintPenalty;
      } else if (constraint.type === "SOFT") {
        penalty += this.softConstraintPenalty;
      } else {
        penalty += this.advisoryConstraintPenalty;
      }
    }

    if (!candidate.riskImpact.withinRiskBudget) {
      penalty += this.riskBudgetBreachPenalty;
    }

    penalty +=
      candidate.riskImpact.breachedLimits.length *
      this.breachedLimitPenaltyPerItem;

    return unitSafe(penalty);
  }

  private compareEvaluations(
    left: CandidateScoreEvaluation,
    right: CandidateScoreEvaluation,
  ): number {
    if (left.eligible !== right.eligible) {
      return left.eligible ? -1 : 1;
    }

    if (
      Math.abs(left.finalScore - right.finalScore) >
      this.deterministicTieTolerance
    ) {
      return right.finalScore - left.finalScore;
    }

    const priorityDifference =
      priorityScore(right.candidate.priority) -
      priorityScore(left.candidate.priority);
    if (Math.abs(priorityDifference) > EPSILON) {
      return priorityDifference;
    }

    const urgencyDifference =
      urgencyScore(right.candidate.urgency) - urgencyScore(left.candidate.urgency);
    if (Math.abs(urgencyDifference) > EPSILON) {
      return urgencyDifference;
    }

    if (
      Math.abs(left.candidate.confidence.score - right.candidate.confidence.score) >
      this.deterministicTieTolerance
    ) {
      return right.candidate.confidence.score - left.candidate.confidence.score;
    }

    if (
      Math.abs(left.candidate.riskImpact.projectedRiskScore -
        right.candidate.riskImpact.projectedRiskScore) >
      this.deterministicTieTolerance
    ) {
      return (
        left.candidate.riskImpact.projectedRiskScore -
        right.candidate.riskImpact.projectedRiskScore
      );
    }

    const typeComparison = compareText(left.candidate.type, right.candidate.type);
    if (typeComparison !== 0) {
      return typeComparison;
    }

    return compareText(left.candidate.candidateId, right.candidate.candidateId);
  }

  private toScoredCandidate(
    evaluation: CandidateScoreEvaluation,
    rank: number,
  ): ScoredDecisionCandidate {
    return Object.freeze({
      ...evaluation.candidate,
      grossScore: evaluation.grossScore,
      penaltyScore: evaluation.penaltyScore,
      finalScore: evaluation.finalScore,
      rank,
      eligible: evaluation.eligible,
      rejectionReasons: evaluation.rejectionReasons,
    });
  }

  private assertRequest(input: DecisionCandidateScoringRequest): void {
    if (input === null || typeof input !== "object") {
      throw new CandidateScoringError(
        "Decision candidate scoring request is required.",
        "INVALID_SCORING_REQUEST",
      );
    }

    nonEmpty(input.requestId, "requestId");
    timestamp(input.generatedAt);
    unit(input.minimumCandidateScore, "minimumCandidateScore");

    if (!Array.isArray(input.candidates)) {
      throw new CandidateScoringError(
        "candidates must be an array.",
        "INVALID_CANDIDATES",
      );
    }

    assertWeights(input.weights);
  }
}

function normalizeWeights(
  weights: DecisionCandidateScoringWeights,
): NormalizedScoringWeights {
  assertWeights(weights);

  const positiveValues = {
    expectedReturn: weights.expectedReturn,
    riskAdjustedReturn: weights.riskAdjustedReturn,
    drawdownProtection: weights.drawdownProtection,
    diversification: weights.diversification,
    regimeAlignment: weights.regimeAlignment,
    learningValue: weights.learningValue,
    executionQuality: weights.executionQuality,
    operationalStability: weights.operationalStability,
    confidence: weights.confidence,
  };
  const penaltyValues = {
    costPenalty: weights.costPenalty,
    riskPenalty: weights.riskPenalty,
    uncertaintyPenalty: weights.uncertaintyPenalty,
  };

  const positiveTotal = sum(Object.values(positiveValues));
  const penaltyTotal = sum(Object.values(penaltyValues));

  if (positiveTotal <= EPSILON) {
    throw new CandidateScoringError(
      "At least one positive scoring weight must be greater than zero.",
      "ZERO_POSITIVE_WEIGHT_TOTAL",
    );
  }

  const normalizePositive = (value: number): number => value / positiveTotal;
  const normalizePenalty = (value: number): number =>
    penaltyTotal <= EPSILON ? 0 : value / penaltyTotal;

  return Object.freeze({
    positive: Object.freeze({
      expectedReturn: normalizePositive(positiveValues.expectedReturn),
      riskAdjustedReturn: normalizePositive(positiveValues.riskAdjustedReturn),
      drawdownProtection: normalizePositive(positiveValues.drawdownProtection),
      diversification: normalizePositive(positiveValues.diversification),
      regimeAlignment: normalizePositive(positiveValues.regimeAlignment),
      learningValue: normalizePositive(positiveValues.learningValue),
      executionQuality: normalizePositive(positiveValues.executionQuality),
      operationalStability: normalizePositive(
        positiveValues.operationalStability,
      ),
      confidence: normalizePositive(positiveValues.confidence),
    }),
    penalties: Object.freeze({
      costPenalty: normalizePenalty(penaltyValues.costPenalty),
      riskPenalty: normalizePenalty(penaltyValues.riskPenalty),
      uncertaintyPenalty: normalizePenalty(penaltyValues.uncertaintyPenalty),
    }),
  });
}

function aggregateCostSeverity(candidate: DecisionCandidate): number {
  const total = nonNegativeSafe(candidate.costs.totalCost);
  const components = [
    candidate.costs.expectedTransactionCost,
    candidate.costs.expectedSlippageCost,
    candidate.costs.expectedMarketImpactCost,
    candidate.costs.expectedTurnoverCost,
    candidate.costs.operationalCost,
    candidate.costs.opportunityCost,
    candidate.costs.modelRiskCost,
  ].map(nonNegativeSafe);

  return unitSafe(Math.max(total, mean(components)));
}

function aggregateRiskSeverity(candidate: DecisionCandidate): number {
  const impact = candidate.riskImpact;
  const positiveDeltas = [
    impact.riskDelta,
    impact.concentrationRiskDelta,
    impact.correlationRiskDelta,
    impact.liquidityRiskDelta,
    impact.leverageRiskDelta,
    impact.volatilityRiskDelta,
    impact.drawdownRiskDelta,
    impact.tailRiskDelta,
    impact.operationalRiskDelta,
  ].map((value) => unitSafe(Math.max(0, finiteSafe(value))));

  const projected = unitSafe(impact.projectedRiskScore);
  const deltaSeverity = mean(positiveDeltas);
  const budgetSeverity = impact.withinRiskBudget ? 0 : 1;
  const breachSeverity = Math.min(1, impact.breachedLimits.length * 0.2);

  return unitSafe(
    projected * 0.45 +
      deltaSeverity * 0.3 +
      budgetSeverity * 0.15 +
      breachSeverity * 0.1,
  );
}

function aggregateUncertaintySeverity(candidate: DecisionCandidate): number {
  const confidence = candidate.confidence;
  const explicitUncertainty = unitSafe(confidence.uncertainty);
  const inverseCoverage = 1 - unitSafe(confidence.evidenceCoverage);
  const inverseConsistency = 1 - unitSafe(confidence.evidenceConsistency);
  const inverseAgreement = 1 - unitSafe(confidence.modelAgreement);
  const inverseDataQuality = 1 - unitSafe(confidence.dataQuality);
  const inverseRegimeCertainty = 1 - unitSafe(confidence.regimeCertainty);
  const inverseRiskCertainty = 1 - unitSafe(confidence.riskCertainty);

  return unitSafe(
    explicitUncertainty * 0.35 +
      inverseCoverage * 0.15 +
      inverseConsistency * 0.12 +
      inverseAgreement * 0.12 +
      inverseDataQuality * 0.1 +
      inverseRegimeCertainty * 0.08 +
      inverseRiskCertainty * 0.08,
  );
}

function constraintViolation(
  constraint: DecisionCandidate["constraints"][number],
): boolean {
  const metadataViolation = constraint.metadata["violated"];
  if (typeof metadataViolation === "boolean") {
    return metadataViolation;
  }

  const actualValue = constraint.metadata["actualValue"];
  if (typeof actualValue === "number" && Number.isFinite(actualValue)) {
    if (constraint.minimum !== undefined && actualValue < constraint.minimum) {
      return true;
    }
    if (constraint.maximum !== undefined && actualValue > constraint.maximum) {
      return true;
    }
  }

  if (
    constraint.expectedValue !== undefined &&
    actualValue !== undefined &&
    actualValue !== constraint.expectedValue
  ) {
    return true;
  }

  return false;
}

function collectNonFinitePaths(candidate: DecisionCandidate): string[] {
  const paths: string[] = [];

  const inspect = (value: unknown, path: string, seen: Set<object>): void => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        paths.push(path);
      }
      return;
    }

    if (value === null || typeof value !== "object") {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspect(entry, `${path}[${index}]`, seen));
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      inspect(entry, path.length === 0 ? key : `${path}.${key}`, seen);
    }
  };

  inspect(candidate, "candidate", new Set<object>());
  return paths.sort(compareText);
}

function assertWeights(weights: DecisionCandidateScoringWeights): void {
  if (weights === null || typeof weights !== "object") {
    throw new CandidateScoringError(
      "Scoring weights are required.",
      "INVALID_SCORING_WEIGHTS",
    );
  }

  const entries: readonly [string, number][] = [
    ["expectedReturn", weights.expectedReturn],
    ["riskAdjustedReturn", weights.riskAdjustedReturn],
    ["drawdownProtection", weights.drawdownProtection],
    ["diversification", weights.diversification],
    ["regimeAlignment", weights.regimeAlignment],
    ["learningValue", weights.learningValue],
    ["executionQuality", weights.executionQuality],
    ["operationalStability", weights.operationalStability],
    ["confidence", weights.confidence],
    ["costPenalty", weights.costPenalty],
    ["riskPenalty", weights.riskPenalty],
    ["uncertaintyPenalty", weights.uncertaintyPenalty],
  ];

  for (const [name, value] of entries) {
    nonNegative(value, `weights.${name}`);
  }
}

function priorityScore(priority: DecisionPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 1;
    case "VERY_HIGH":
      return 0.85;
    case "HIGH":
      return 0.7;
    case "MEDIUM":
      return 0.45;
    case "LOW":
      return 0.2;
  }
}

function urgencyScore(urgency: DecisionUrgency): number {
  switch (urgency) {
    case "IMMEDIATE":
      return 1;
    case "HIGH":
      return 0.8;
    case "NORMAL":
      return 0.55;
    case "LOW":
      return 0.3;
    case "INFORMATIONAL":
      return 0.1;
  }
}

function unit(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CandidateScoringError(
      `${name} must be a finite number between 0 and 1.`,
      "INVALID_UNIT_VALUE",
    );
  }
  return value;
}

function unitSafe(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function finiteSafe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeSafe(value: number): number {
  return Math.max(0, finiteSafe(value));
}

function nonNegative(
  value: number,
  name: string,
  allowPositiveInfinity = false,
): number {
  const valid =
    (Number.isFinite(value) || (allowPositiveInfinity && value === Infinity)) &&
    value >= 0;
  if (!valid) {
    throw new CandidateScoringError(
      `${name} must be a non-negative number.`,
      "INVALID_NON_NEGATIVE_VALUE",
    );
  }
  return value;
}

function nonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CandidateScoringError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING_VALUE",
    );
  }
  return value;
}

function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) {
    throw new CandidateScoringError(
      `Invalid timestamp: ${value}`,
      "INVALID_TIMESTAMP",
    );
  }
  return result;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(SCORE_PRECISION));
}

function format(value: number): string {
  if (value === Number.POSITIVE_INFINITY) {
    return "Infinity";
  }
  return round(value).toString();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort(
    compareText,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const createCandidateScoringEngine = (
  options: CandidateScoringEngineOptions = {},
): CandidateScoringEngine => new CandidateScoringEngine(options);

export type CandidateScoringCandidateId = DecisionIntelligenceId;