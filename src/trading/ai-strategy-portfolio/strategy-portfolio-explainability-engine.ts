/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-portfolio-explainability-engine.ts
 *
 * Purpose:
 * Produces deterministic, immutable, evidence-based explanations for strategy
 * portfolio decisions by combining scoring, ranking, allocation, rotation, and
 * candidate classification data without depending on a non-deterministic model.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM,
  type AiStrategyAllocationResult,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyExplanationFactor,
  type AiStrategyExplanationSeverity,
  type AiStrategyExplanationWarning,
  type AiStrategyPortfolioDecisionId,
  type AiStrategyPortfolioExplainabilityPort,
  type AiStrategyPortfolioExplanation,
  type AiStrategyPortfolioId,
  type AiStrategyRankingEntry,
  type AiStrategyRankingResult,
  type AiStrategyRotationInstruction,
  type AiStrategyRotationPlan,
  type AiStrategyScore,
  type AiStrategyScoreResult,
  type AiStrategyTargetAllocation,
} from "./ai-strategy-portfolio-contracts";

const EPSILON = 1e-12;
const DEFAULT_NUMERICAL_PRECISION = 12;
const DEFAULT_MAXIMUM_RATIONALE_ITEMS = 16;
const DEFAULT_MAXIMUM_FACTOR_ITEMS = 24;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_HIGH_CONCENTRATION_THRESHOLD = 0.4;
const DEFAULT_HIGH_TURNOVER_THRESHOLD = 0.5;
const DEFAULT_LARGE_WEIGHT_CHANGE_THRESHOLD = 0.15;
const DEFAULT_MINIMUM_MEANINGFUL_WEIGHT = 0.0001;

export interface StrategyPortfolioExplainabilityEngineOptions {
  readonly explanationIdPrefix?: string;
  readonly numericalPrecision?: number;
  readonly maximumRationaleItems?: number;
  readonly maximumFactorItems?: number;
  readonly lowConfidenceThreshold?: number;
  readonly highConcentrationThreshold?: number;
  readonly highTurnoverThreshold?: number;
  readonly largeWeightChangeThreshold?: number;
  readonly minimumMeaningfulWeight?: number;
  readonly modelProviderId?: string;
  readonly modelId?: string;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly explanationIdPrefix: string;
  readonly numericalPrecision: number;
  readonly maximumRationaleItems: number;
  readonly maximumFactorItems: number;
  readonly lowConfidenceThreshold: number;
  readonly highConcentrationThreshold: number;
  readonly highTurnoverThreshold: number;
  readonly largeWeightChangeThreshold: number;
  readonly minimumMeaningfulWeight: number;
  readonly modelProviderId?: string;
  readonly modelId?: string;
  readonly metadata: StrategyMetadata;
}

interface CandidateContext {
  readonly candidate: AiStrategyCandidate;
  readonly score?: AiStrategyScore;
  readonly ranking?: AiStrategyRankingEntry;
  readonly allocation?: AiStrategyTargetAllocation;
  readonly rotation?: AiStrategyRotationInstruction;
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertIntegerAtLeast(value: number, minimum: number, field: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (
    value < AI_STRATEGY_PORTFOLIO_CONFIDENCE_MINIMUM ||
    value > AI_STRATEGY_PORTFOLIO_CONFIDENCE_MAXIMUM
  ) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function round(value: number, precision: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return Object.freeze({ ...metadata });
}

function mergeMetadata(
  base: StrategyMetadata,
  override: StrategyMetadata,
): StrategyMetadata {
  return freezeMetadata({ ...base, ...override });
}

function stableUnique(values: readonly string[]): readonly string[] {
  return freezeArray(
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function normalizeOptions(
  options: StrategyPortfolioExplainabilityEngineOptions,
): NormalizedOptions {
  const explanationIdPrefix = options.explanationIdPrefix ?? "strategy-explanation";
  const numericalPrecision =
    options.numericalPrecision ?? DEFAULT_NUMERICAL_PRECISION;
  const maximumRationaleItems =
    options.maximumRationaleItems ?? DEFAULT_MAXIMUM_RATIONALE_ITEMS;
  const maximumFactorItems =
    options.maximumFactorItems ?? DEFAULT_MAXIMUM_FACTOR_ITEMS;
  const lowConfidenceThreshold =
    options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  const highConcentrationThreshold =
    options.highConcentrationThreshold ?? DEFAULT_HIGH_CONCENTRATION_THRESHOLD;
  const highTurnoverThreshold =
    options.highTurnoverThreshold ?? DEFAULT_HIGH_TURNOVER_THRESHOLD;
  const largeWeightChangeThreshold =
    options.largeWeightChangeThreshold ?? DEFAULT_LARGE_WEIGHT_CHANGE_THRESHOLD;
  const minimumMeaningfulWeight =
    options.minimumMeaningfulWeight ?? DEFAULT_MINIMUM_MEANINGFUL_WEIGHT;

  assertNonEmptyString(explanationIdPrefix, "options.explanationIdPrefix");
  assertIntegerAtLeast(numericalPrecision, 0, "options.numericalPrecision");
  assertIntegerAtLeast(maximumRationaleItems, 1, "options.maximumRationaleItems");
  assertIntegerAtLeast(maximumFactorItems, 1, "options.maximumFactorItems");
  assertUnitInterval(lowConfidenceThreshold, "options.lowConfidenceThreshold");
  assertUnitInterval(highConcentrationThreshold, "options.highConcentrationThreshold");
  assertUnitInterval(highTurnoverThreshold, "options.highTurnoverThreshold");
  assertUnitInterval(largeWeightChangeThreshold, "options.largeWeightChangeThreshold");
  assertUnitInterval(minimumMeaningfulWeight, "options.minimumMeaningfulWeight");

  if (options.modelProviderId !== undefined) {
    assertNonEmptyString(options.modelProviderId, "options.modelProviderId");
  }
  if (options.modelId !== undefined) {
    assertNonEmptyString(options.modelId, "options.modelId");
  }

  return Object.freeze({
    explanationIdPrefix,
    numericalPrecision,
    maximumRationaleItems,
    maximumFactorItems,
    lowConfidenceThreshold,
    highConcentrationThreshold,
    highTurnoverThreshold,
    largeWeightChangeThreshold,
    minimumMeaningfulWeight,
    modelProviderId: options.modelProviderId,
    modelId: options.modelId,
    metadata: freezeMetadata(options.metadata ?? EMPTY_STRATEGY_METADATA),
  });
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : "unknown";
}

function candidateName(candidate: AiStrategyCandidate): string {
  const manifest = candidate.manifest as unknown as Readonly<Record<string, unknown>>;
  const displayName = manifest["displayName"];
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    return displayName.trim();
  }

  const name = manifest["name"];
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }

  return candidate.identity.strategyId;
}

function createFactor(
  name: string,
  category: string,
  contribution: number,
  description: string,
  evidence: readonly string[],
  metadata: StrategyMetadata,
  precision: number,
): AiStrategyExplanationFactor {
  return Object.freeze({
    name,
    category,
    contribution: round(contribution, precision),
    description,
    evidence: stableUnique(evidence),
    metadata: freezeMetadata(metadata),
  });
}

function createWarning(
  code: string,
  severity: AiStrategyExplanationSeverity,
  message: string,
  candidateIds: readonly AiStrategyCandidateId[],
  metadata: StrategyMetadata,
): AiStrategyExplanationWarning {
  return Object.freeze({
    code,
    severity,
    message,
    candidateIds: stableUnique(candidateIds),
    metadata: freezeMetadata(metadata),
  });
}

function buildCandidateContexts(
  candidates: readonly AiStrategyCandidate[],
  scoring: AiStrategyScoreResult,
  ranking: AiStrategyRankingResult,
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
): readonly CandidateContext[] {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.identity.candidateId, candidate] as const),
  );
  const scoreById = new Map(scoring.scores.map((score) => [score.candidateId, score] as const));
  const rankingById = new Map(
    ranking.entries.map((entry) => [entry.candidateId, entry] as const),
  );
  const allocationById = new Map(
    allocation.allocations.map((entry) => [entry.candidateId, entry] as const),
  );
  const rotationById = new Map(
    rotationPlan.instructions.map((entry) => [entry.candidateId, entry] as const),
  );

  const ids = stableUnique([
    ...candidateById.keys(),
    ...scoreById.keys(),
    ...rankingById.keys(),
    ...allocationById.keys(),
    ...rotationById.keys(),
  ]);

  return freezeArray(
    ids.flatMap((candidateId) => {
      const candidate = candidateById.get(candidateId);
      if (candidate === undefined) {
        return [];
      }

      return [
        Object.freeze({
          candidate,
          score: scoreById.get(candidateId),
          ranking: rankingById.get(candidateId),
          allocation: allocationById.get(candidateId),
          rotation: rotationById.get(candidateId),
        }),
      ];
    }),
  );
}

function weightedConfidence(
  allocations: readonly AiStrategyTargetAllocation[],
): number {
  const meaningful = allocations.filter((item) => item.targetWeight > EPSILON);
  const denominator = meaningful.reduce((sum, item) => sum + item.targetWeight, 0);

  if (denominator <= EPSILON) {
    return 0;
  }

  return clampUnit(
    meaningful.reduce(
      (sum, item) => sum + item.confidence * item.targetWeight,
      0,
    ) / denominator,
  );
}

function buildSummary(
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
  selectedCount: number,
  rejectedCount: number,
  precision: number,
): string {
  const allocatedPercent = round(allocation.totalAllocatedWeight * 100, Math.min(precision, 4));
  const cashPercent = round(allocation.cashReserveWeight * 100, Math.min(precision, 4));
  const instructionCount = rotationPlan.instructions.length;

  return (
    `Selected ${selectedCount} strategy${selectedCount === 1 ? "" : "ies"}, ` +
    `rejected ${rejectedCount}, allocated ${allocatedPercent}% of portfolio capital, ` +
    `retained ${cashPercent}% in cash, and produced ${instructionCount} rotation ` +
    `instruction${instructionCount === 1 ? "" : "s"}.`
  );
}

function buildRationale(
  contexts: readonly CandidateContext[],
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
  maximumItems: number,
  precision: number,
): readonly string[] {
  const rationale: string[] = [];

  const selected = contexts
    .filter((context) => (context.allocation?.targetWeight ?? 0) > EPSILON)
    .sort((left, right) => {
      const weightDifference =
        (right.allocation?.targetWeight ?? 0) -
        (left.allocation?.targetWeight ?? 0);
      if (Math.abs(weightDifference) > EPSILON) {
        return weightDifference;
      }
      return left.candidate.identity.candidateId.localeCompare(
        right.candidate.identity.candidateId,
      );
    });

  for (const context of selected) {
    const target = context.allocation;
    if (target === undefined) {
      continue;
    }

    rationale.push(
      `${candidateName(context.candidate)} received ${round(target.targetWeight * 100, Math.min(precision, 4))}% ` +
        `because its allocation score was ${round(target.score, Math.min(precision, 6))} ` +
        `with confidence ${round(target.confidence, Math.min(precision, 6))}.`,
    );
  }

  if (allocation.cashReserveWeight > EPSILON) {
    rationale.push(
      `${round(allocation.cashReserveWeight * 100, Math.min(precision, 4))}% was retained as cash reserve ` +
        `under the active allocation and risk constraints.`,
    );
  }

  if (rotationPlan.instructions.length === 0) {
    rationale.push("No strategy lifecycle rotation was required for this decision.");
  } else {
    rationale.push(
      `${rotationPlan.instructions.length} lifecycle change${rotationPlan.instructions.length === 1 ? " was" : "s were"} ` +
        `planned for reason ${rotationPlan.reason}.`,
    );
  }

  return freezeArray(rationale.slice(0, maximumItems));
}

function buildFactors(
  contexts: readonly CandidateContext[],
  scoring: AiStrategyScoreResult,
  ranking: AiStrategyRankingResult,
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
  options: NormalizedOptions,
): readonly AiStrategyExplanationFactor[] {
  const factors: AiStrategyExplanationFactor[] = [];
  const factorMetadata = mergeMetadata(options.metadata, {
    component: "strategy-portfolio-explainability-engine",
  });

  const eligibleRatio =
    scoring.scores.length === 0
      ? 0
      : scoring.eligibleCandidateIds.length / scoring.scores.length;
  factors.push(
    createFactor(
      "Candidate eligibility",
      "SCORING",
      eligibleRatio,
      "Share of scored candidates that passed the score policy.",
      [
        `${scoring.eligibleCandidateIds.length} eligible candidates`,
        `${scoring.rejectedCandidateIds.length} rejected candidates`,
      ],
      factorMetadata,
      options.numericalPrecision,
    ),
  );

  const selectedScores = scoring.scores.filter((score) =>
    ranking.selectedCandidateIds.includes(score.candidateId),
  );
  const averageSelectedScore =
    selectedScores.length === 0
      ? 0
      : selectedScores.reduce((sum, score) => sum + score.compositeScore, 0) /
        selectedScores.length;
  factors.push(
    createFactor(
      "Selected strategy quality",
      "SCORING",
      clampUnit(averageSelectedScore),
      "Average composite score of strategies selected by the ranking stage.",
      selectedScores.map(
        (score) => `${score.candidateId}: ${round(score.compositeScore, 6)}`,
      ),
      factorMetadata,
      options.numericalPrecision,
    ),
  );

  factors.push(
    createFactor(
      "Capital deployment",
      "ALLOCATION",
      clampUnit(allocation.totalAllocatedWeight),
      "Fraction of portfolio capital deployed across selected strategies.",
      [
        `Allocated weight: ${round(allocation.totalAllocatedWeight, 6)}`,
        `Cash reserve weight: ${round(allocation.cashReserveWeight, 6)}`,
        `Allocation method: ${allocation.method}`,
      ],
      factorMetadata,
      options.numericalPrecision,
    ),
  );

  const concentration = allocation.allocations.reduce(
    (maximum, item) => Math.max(maximum, item.targetWeight),
    0,
  );
  factors.push(
    createFactor(
      "Allocation diversification",
      "DIVERSIFICATION",
      clampUnit(1 - concentration),
      "Inverse of the largest individual strategy allocation.",
      [`Largest strategy weight: ${round(concentration, 6)}`],
      factorMetadata,
      options.numericalPrecision,
    ),
  );

  factors.push(
    createFactor(
      "Expected execution stability",
      "ROTATION",
      clampUnit(1 - allocation.expectedTurnover),
      "Lower expected turnover contributes positively to execution stability.",
      [
        `Expected turnover: ${round(allocation.expectedTurnover, 6)}`,
        `Rotation instructions: ${rotationPlan.instructions.length}`,
        `Approval required: ${String(rotationPlan.requiresApproval)}`,
      ],
      factorMetadata,
      options.numericalPrecision,
    ),
  );

  for (const context of contexts) {
    const target = context.allocation;
    if (
      target === undefined ||
      target.targetWeight < options.minimumMeaningfulWeight
    ) {
      continue;
    }

    const score = context.score;
    const evidence = [
      `Target weight: ${round(target.targetWeight, 6)}`,
      `Allocation score: ${round(target.score, 6)}`,
      `Allocation confidence: ${round(target.confidence, 6)}`,
      ...(score === undefined
        ? []
        : [
            `Composite score: ${round(score.compositeScore, 6)}`,
            `Score confidence: ${round(score.confidence, 6)}`,
          ]),
      ...target.reasons,
    ];

    factors.push(
      createFactor(
        `Strategy allocation: ${candidateName(context.candidate)}`,
        "STRATEGY",
        clampUnit(target.targetWeight * target.confidence),
        `Contribution of ${context.candidate.identity.candidateId} to the target portfolio.`,
        evidence,
        mergeMetadata(factorMetadata, {
          candidateId: context.candidate.identity.candidateId,
          strategyId: context.candidate.identity.strategyId,
        }),
        options.numericalPrecision,
      ),
    );
  }

  return freezeArray(
    factors
      .sort((left, right) => {
        const contributionDifference = right.contribution - left.contribution;
        if (Math.abs(contributionDifference) > EPSILON) {
          return contributionDifference;
        }
        return left.name.localeCompare(right.name);
      })
      .slice(0, options.maximumFactorItems),
  );
}

function buildWarnings(
  contexts: readonly CandidateContext[],
  scoring: AiStrategyScoreResult,
  allocation: AiStrategyAllocationResult,
  rotationPlan: AiStrategyRotationPlan,
  confidence: number,
  options: NormalizedOptions,
): readonly AiStrategyExplanationWarning[] {
  const warnings: AiStrategyExplanationWarning[] = [];
  const warningMetadata = mergeMetadata(options.metadata, {
    component: "strategy-portfolio-explainability-engine",
  });

  if (confidence < options.lowConfidenceThreshold) {
    warnings.push(
      createWarning(
        "LOW_PORTFOLIO_CONFIDENCE",
        "WARNING",
        `Weighted portfolio confidence ${round(confidence, 6)} is below the configured threshold ${round(options.lowConfidenceThreshold, 6)}.`,
        allocation.allocations
          .filter((item) => item.targetWeight > EPSILON)
          .map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  const concentrated = allocation.allocations.filter(
    (item) => item.targetWeight > options.highConcentrationThreshold,
  );
  if (concentrated.length > 0) {
    warnings.push(
      createWarning(
        "HIGH_STRATEGY_CONCENTRATION",
        "WARNING",
        "One or more strategies exceed the configured concentration threshold.",
        concentrated.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  if (allocation.expectedTurnover > options.highTurnoverThreshold) {
    warnings.push(
      createWarning(
        "HIGH_EXPECTED_TURNOVER",
        "WARNING",
        `Expected turnover ${round(allocation.expectedTurnover, 6)} exceeds the configured threshold ${round(options.highTurnoverThreshold, 6)}.`,
        rotationPlan.instructions.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  const largeChanges = allocation.allocations.filter(
    (item) => Math.abs(item.weightChange) > options.largeWeightChangeThreshold,
  );
  if (largeChanges.length > 0) {
    warnings.push(
      createWarning(
        "LARGE_ALLOCATION_CHANGE",
        rotationPlan.requiresApproval ? "CRITICAL" : "WARNING",
        "One or more strategy weights change materially from the current portfolio.",
        largeChanges.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  if (rotationPlan.requiresApproval) {
    warnings.push(
      createWarning(
        "ROTATION_APPROVAL_REQUIRED",
        "CRITICAL",
        "The rotation plan requires approval before execution.",
        rotationPlan.instructions.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  if (allocation.warnings.length > 0) {
    warnings.push(
      createWarning(
        "ALLOCATION_WARNINGS_PRESENT",
        "WARNING",
        allocation.warnings.join(" "),
        allocation.allocations.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  if (rotationPlan.warnings.length > 0) {
    warnings.push(
      createWarning(
        "ROTATION_WARNINGS_PRESENT",
        "WARNING",
        rotationPlan.warnings.join(" "),
        rotationPlan.instructions.map((item) => item.candidateId),
        warningMetadata,
      ),
    );
  }

  const operationallyUnavailable = contexts.filter((context) =>
    ["SUSPENDED", "DISABLED", "INELIGIBLE"].includes(context.candidate.status),
  );
  if (operationallyUnavailable.length > 0) {
    warnings.push(
      createWarning(
        "CANDIDATE_OPERATIONAL_RESTRICTIONS",
        "WARNING",
        "Some evaluated candidates are suspended, disabled, or ineligible.",
        operationallyUnavailable.map(
          (context) => context.candidate.identity.candidateId,
        ),
        warningMetadata,
      ),
    );
  }

  if (scoring.scores.length === 0) {
    warnings.push(
      createWarning(
        "NO_STRATEGIES_SCORED",
        "CRITICAL",
        "The scoring stage produced no strategy scores.",
        [],
        warningMetadata,
      ),
    );
  }

  return freezeArray(
    warnings.sort((left, right) => {
      const severityOrder: Readonly<Record<AiStrategyExplanationSeverity, number>> = {
        CRITICAL: 0,
        WARNING: 1,
        INFO: 2,
      };
      const difference = severityOrder[left.severity] - severityOrder[right.severity];
      return difference !== 0 ? difference : left.code.localeCompare(right.code);
    }),
  );
}

function deterministicFallbackCandidateIds(
  candidates: readonly AiStrategyCandidate[],
  selectedCandidateIds: readonly AiStrategyCandidateId[],
): readonly AiStrategyCandidateId[] {
  const selected = new Set(selectedCandidateIds);

  return freezeArray(
    candidates
      .filter(
        (candidate) =>
          selected.has(candidate.identity.candidateId) &&
          candidate.classification.intelligenceType.startsWith("DETERMINISTIC_"),
      )
      .map((candidate) => candidate.identity.candidateId)
      .sort((left, right) => left.localeCompare(right)),
  );
}

export class StrategyPortfolioExplainabilityEngine
  implements AiStrategyPortfolioExplainabilityPort
{
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyPortfolioExplainabilityEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public explain(
    decisionId: AiStrategyPortfolioDecisionId,
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    scoring: AiStrategyScoreResult,
    ranking: AiStrategyRankingResult,
    allocation: AiStrategyAllocationResult,
    rotationPlan: AiStrategyRotationPlan,
  ): AiStrategyPortfolioExplanation {
    assertNonEmptyString(decisionId, "decisionId");
    assertNonEmptyString(portfolioId, "portfolioId");
    assertFiniteNumber(timestamp, "timestamp");

    if (allocation.portfolioId !== portfolioId) {
      throw new Error("allocation.portfolioId must match portfolioId.");
    }
    if (rotationPlan.portfolioId !== portfolioId) {
      throw new Error("rotationPlan.portfolioId must match portfolioId.");
    }
    if (scoring.runId !== ranking.runId || scoring.runId !== allocation.runId) {
      throw new Error("scoring, ranking, and allocation must belong to the same runId.");
    }
    if (rotationPlan.runId !== allocation.runId) {
      throw new Error("rotationPlan.runId must match allocation.runId.");
    }

    const contexts = buildCandidateContexts(
      candidates,
      scoring,
      ranking,
      allocation,
      rotationPlan,
    );

    const selectedCandidateIds = stableUnique(
      allocation.allocations
        .filter((item) => item.targetWeight >= this.options.minimumMeaningfulWeight)
        .map((item) => item.candidateId),
    );
    const rejectedCandidateIds = stableUnique([
      ...scoring.rejectedCandidateIds,
      ...ranking.entries
        .filter((entry) => !entry.selected && !entry.reserve)
        .map((entry) => entry.candidateId),
    ]).filter((candidateId) => !selectedCandidateIds.includes(candidateId));

    const confidence = round(
      weightedConfidence(allocation.allocations),
      this.options.numericalPrecision,
    );
    const factors = buildFactors(
      contexts,
      scoring,
      ranking,
      allocation,
      rotationPlan,
      this.options,
    );
    const warnings = buildWarnings(
      contexts,
      scoring,
      allocation,
      rotationPlan,
      confidence,
      this.options,
    );

    const metadata = mergeMetadata(this.options.metadata, {
      component: "strategy-portfolio-explainability-engine",
      deterministic: true,
      runId: allocation.runId,
      allocationId: allocation.allocationId,
      rotationId: rotationPlan.rotationId,
    });

    const explanation: AiStrategyPortfolioExplanation = {
      explanationId:
        `${sanitizeIdentifier(this.options.explanationIdPrefix)}-` +
        `${sanitizeIdentifier(portfolioId)}-${sanitizeIdentifier(decisionId)}`,
      decisionId,
      portfolioId,
      createdAt: timestamp,
      summary: buildSummary(
        allocation,
        rotationPlan,
        selectedCandidateIds.length,
        rejectedCandidateIds.length,
        this.options.numericalPrecision,
      ),
      rationale: buildRationale(
        contexts,
        allocation,
        rotationPlan,
        this.options.maximumRationaleItems,
        this.options.numericalPrecision,
      ),
      factors,
      warnings,
      selectedCandidateIds: freezeArray(selectedCandidateIds),
      rejectedCandidateIds: freezeArray(rejectedCandidateIds),
      deterministicFallbackCandidateIds: deterministicFallbackCandidateIds(
        candidates,
        selectedCandidateIds,
      ),
      ...(this.options.modelProviderId === undefined
        ? {}
        : { modelProviderId: this.options.modelProviderId }),
      ...(this.options.modelId === undefined
        ? {}
        : { modelId: this.options.modelId }),
      confidence,
      metadata,
    };

    return Object.freeze(explanation);
  }
}

export const AiStrategyPortfolioExplainabilityEngine =
  StrategyPortfolioExplainabilityEngine;