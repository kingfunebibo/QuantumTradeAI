/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-ranking-engine.ts
 *
 * Purpose:
 * Deterministically transforms strategy scores into a stable, explainable,
 * policy-constrained ranking for downstream diversification and allocation.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyFamily,
  type AiStrategyRankingEnginePort,
  type AiStrategyRankingEntry,
  type AiStrategyRankingMethod,
  type AiStrategyRankingPolicy,
  type AiStrategyRankingResult,
  type AiStrategyRegimeFitness,
  type AiStrategyScore,
  type AiStrategyScoreDimension,
} from "./ai-strategy-portfolio-contracts";

export interface StrategyRankingEngineOptions {
  readonly rankingIdPrefix?: string;
  readonly regimeWeight?: number;
  readonly confidenceWeight?: number;
  readonly riskAdjustedWeight?: number;
  readonly deterministicFallbackBonus?: number;
  readonly familyDiversificationBonus?: number;
  readonly ineligibleScore?: number;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly rankingIdPrefix: string;
  readonly regimeWeight: number;
  readonly confidenceWeight: number;
  readonly riskAdjustedWeight: number;
  readonly deterministicFallbackBonus: number;
  readonly familyDiversificationBonus: number;
  readonly ineligibleScore: number;
  readonly metadata: StrategyMetadata;
}

interface RankingWorkingItem {
  readonly candidate: AiStrategyCandidate;
  readonly score: AiStrategyScore;
  readonly regimeFitness?: AiStrategyRegimeFitness;
  readonly adjustedScore: number;
  readonly tieBreakValues: readonly number[];
  readonly baseReasons: readonly string[];
}

const DEFAULT_REGIME_WEIGHT = 0.2;
const DEFAULT_CONFIDENCE_WEIGHT = 0.15;
const DEFAULT_RISK_ADJUSTED_WEIGHT = 0.25;
const DEFAULT_DETERMINISTIC_FALLBACK_BONUS = 0.015;
const DEFAULT_FAMILY_DIVERSIFICATION_BONUS = 0.01;
const DEFAULT_INELIGIBLE_SCORE = 0;
const EPSILON = 1e-12;

const STATUS_ORDER: Readonly<Record<string, number>> = Object.freeze({
  SELECTED: 0,
  RESERVE: 1,
  ELIGIBLE: 2,
  DISCOVERED: 3,
  SUSPENDED: 4,
  QUARANTINED: 5,
  INELIGIBLE: 6,
  RETIRED: 7,
});

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertIntegerAtLeast(
  value: number,
  minimum: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (
    value < AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM ||
    value > AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM
  ) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM;
  }
  return Math.min(
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
    Math.max(AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM, value),
  );
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function stableText(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Number.POSITIVE_INFINITY) return "Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableText).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableText(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function freezeMetadata(
  ...sources: readonly (StrategyMetadata | undefined)[]
): StrategyMetadata {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (source === undefined) continue;
    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }
  return Object.freeze(merged) as StrategyMetadata;
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function isDeterministicFallback(candidate: AiStrategyCandidate): boolean {
  const intelligenceType = candidate.classification.intelligenceType;
  return (
    intelligenceType === "DETERMINISTIC_RULE_BASED" ||
    intelligenceType === "DETERMINISTIC_ARBITRAGE"
  );
}

function componentScore(
  score: AiStrategyScore,
  dimension: AiStrategyScoreDimension,
): number {
  return (
    score.components.find((component) => component.dimension === dimension)
      ?.normalizedScore ?? 0
  );
}

function componentConfidence(
  score: AiStrategyScore,
  dimension: AiStrategyScoreDimension,
): number {
  return (
    score.components.find((component) => component.dimension === dimension)
      ?.confidence ?? 0
  );
}

function riskAdjustedScore(score: AiStrategyScore): number {
  const riskAdjusted = componentScore(score, "RISK_ADJUSTED_RETURN");
  const drawdown = componentScore(score, "DRAWDOWN");
  const robustness = componentScore(score, "ROBUSTNESS");
  const consistency = componentScore(score, "CONSISTENCY");

  return clampUnit(
    riskAdjusted * 0.4 +
      drawdown * 0.25 +
      robustness * 0.2 +
      consistency * 0.15,
  );
}

function ensembleConsensusScore(score: AiStrategyScore): number {
  const dimensions: readonly AiStrategyScoreDimension[] = Object.freeze([
    "RETURN",
    "RISK_ADJUSTED_RETURN",
    "DRAWDOWN",
    "CONSISTENCY",
    "REGIME_FIT",
    "EXECUTION_QUALITY",
    "ROBUSTNESS",
    "OPERATIONAL_HEALTH",
  ]);

  const values = dimensions.map((dimension) => componentScore(score, dimension));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  const agreement = clampUnit(1 - Math.sqrt(variance));

  return clampUnit(mean * 0.75 + agreement * 0.25);
}

function paretoScore(
  target: AiStrategyScore,
  allScores: readonly AiStrategyScore[],
): number {
  const dimensions: readonly AiStrategyScoreDimension[] = Object.freeze([
    "RETURN",
    "RISK_ADJUSTED_RETURN",
    "DRAWDOWN",
    "CONSISTENCY",
    "REGIME_FIT",
    "EXECUTION_QUALITY",
    "ROBUSTNESS",
    "OPERATIONAL_HEALTH",
  ]);

  let dominators = 0;
  for (const other of allScores) {
    if (other.candidateId === target.candidateId) continue;

    let noWorse = true;
    let strictlyBetter = false;
    for (const dimension of dimensions) {
      const otherValue = componentScore(other, dimension);
      const targetValue = componentScore(target, dimension);
      if (otherValue + EPSILON < targetValue) {
        noWorse = false;
        break;
      }
      if (otherValue > targetValue + EPSILON) {
        strictlyBetter = true;
      }
    }

    if (noWorse && strictlyBetter) dominators += 1;
  }

  const frontierStrength = 1 / (1 + dominators);
  return clampUnit(frontierStrength * 0.55 + target.compositeScore * 0.45);
}

function fitnessForCandidate(
  candidateId: AiStrategyCandidateId,
  regimeFitness: readonly AiStrategyRegimeFitness[],
): AiStrategyRegimeFitness | undefined {
  const matches = regimeFitness
    .filter((entry) => entry.candidateId === candidateId)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      if (right.historicalSampleSize !== left.historicalSampleSize) {
        return right.historicalSampleSize - left.historicalSampleSize;
      }
      return left.regime.localeCompare(right.regime);
    });
  return matches[0];
}

function adjustedScoreForMethod(
  method: AiStrategyRankingMethod,
  score: AiStrategyScore,
  allScores: readonly AiStrategyScore[],
  fitness: AiStrategyRegimeFitness | undefined,
  options: NormalizedOptions,
): number {
  const regime = fitness?.fitnessScore ?? componentScore(score, "REGIME_FIT");
  const regimeConfidence = fitness?.confidence ?? componentConfidence(score, "REGIME_FIT");
  const riskAdjusted = riskAdjustedScore(score);
  const confidenceWeighted = score.compositeScore * score.confidence;

  switch (method) {
    case "WEIGHTED_SCORE":
      return clampUnit(score.compositeScore);
    case "PARETO_FRONTIER":
      return paretoScore(score, allScores);
    case "RISK_ADJUSTED":
      return clampUnit(
        score.compositeScore * (1 - options.riskAdjustedWeight) +
          riskAdjusted * options.riskAdjustedWeight,
      );
    case "REGIME_WEIGHTED":
      return clampUnit(
        score.compositeScore * (1 - options.regimeWeight) +
          regime * options.regimeWeight * clampUnit(regimeConfidence),
      );
    case "ENSEMBLE_CONSENSUS":
      return clampUnit(
        ensembleConsensusScore(score) * (1 - options.confidenceWeight) +
          confidenceWeighted * options.confidenceWeight,
      );
    case "HYBRID":
      return clampUnit(
        score.compositeScore * 0.35 +
          riskAdjusted * 0.2 +
          regime * clampUnit(regimeConfidence) * 0.15 +
          ensembleConsensusScore(score) * 0.15 +
          paretoScore(score, allScores) * 0.15,
      );
  }
}

function normalizedOptions(
  options: StrategyRankingEngineOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    rankingIdPrefix: options.rankingIdPrefix?.trim() || "ai-strategy-ranking",
    regimeWeight: options.regimeWeight ?? DEFAULT_REGIME_WEIGHT,
    confidenceWeight: options.confidenceWeight ?? DEFAULT_CONFIDENCE_WEIGHT,
    riskAdjustedWeight:
      options.riskAdjustedWeight ?? DEFAULT_RISK_ADJUSTED_WEIGHT,
    deterministicFallbackBonus:
      options.deterministicFallbackBonus ??
      DEFAULT_DETERMINISTIC_FALLBACK_BONUS,
    familyDiversificationBonus:
      options.familyDiversificationBonus ?? DEFAULT_FAMILY_DIVERSIFICATION_BONUS,
    ineligibleScore: options.ineligibleScore ?? DEFAULT_INELIGIBLE_SCORE,
    metadata: freezeMetadata(EMPTY_STRATEGY_METADATA, options.metadata),
  };

  assertUnitInterval(normalized.regimeWeight, "options.regimeWeight");
  assertUnitInterval(normalized.confidenceWeight, "options.confidenceWeight");
  assertUnitInterval(
    normalized.riskAdjustedWeight,
    "options.riskAdjustedWeight",
  );
  assertFiniteNumber(
    normalized.deterministicFallbackBonus,
    "options.deterministicFallbackBonus",
  );
  assertFiniteNumber(
    normalized.familyDiversificationBonus,
    "options.familyDiversificationBonus",
  );
  assertUnitInterval(normalized.ineligibleScore, "options.ineligibleScore");

  return Object.freeze(normalized);
}

function validatePolicy(policy: AiStrategyRankingPolicy): void {
  assertIntegerAtLeast(
    policy.maximumSelectedStrategies,
    0,
    "policy.maximumSelectedStrategies",
  );
  assertIntegerAtLeast(
    policy.maximumReserveStrategies,
    0,
    "policy.maximumReserveStrategies",
  );
  assertUnitInterval(policy.minimumAdjustedScore, "policy.minimumAdjustedScore");
  assertUnitInterval(policy.minimumConfidence, "policy.minimumConfidence");
  if (policy.maximumStrategiesPerFamily !== undefined) {
    assertIntegerAtLeast(
      policy.maximumStrategiesPerFamily,
      1,
      "policy.maximumStrategiesPerFamily",
    );
  }

  const seen = new Set<AiStrategyScoreDimension>();
  for (const dimension of policy.tieBreakerDimensions) {
    if (seen.has(dimension)) {
      throw new Error(
        `policy.tieBreakerDimensions contains duplicate dimension ${dimension}.`,
      );
    }
    seen.add(dimension);
  }
}

function candidateIndex(
  candidates: readonly AiStrategyCandidate[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate> {
  const result = new Map<AiStrategyCandidateId, AiStrategyCandidate>();
  for (const candidate of candidates) {
    const id = candidate.identity.candidateId;
    if (result.has(id)) {
      throw new Error(`Duplicate candidateId ${id}.`);
    }
    result.set(id, candidate);
  }
  return result;
}

function scoreIndex(
  scores: readonly AiStrategyScore[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyScore> {
  const result = new Map<AiStrategyCandidateId, AiStrategyScore>();
  for (const score of scores) {
    if (result.has(score.candidateId)) {
      throw new Error(`Duplicate score for candidateId ${score.candidateId}.`);
    }
    assertUnitInterval(score.compositeScore, `${score.candidateId}.compositeScore`);
    assertUnitInterval(score.confidence, `${score.candidateId}.confidence`);
    result.set(score.candidateId, score);
  }
  return result;
}

function compareWorkingItems(
  left: RankingWorkingItem,
  right: RankingWorkingItem,
): number {
  if (Math.abs(right.adjustedScore - left.adjustedScore) > EPSILON) {
    return right.adjustedScore - left.adjustedScore;
  }
  if (Math.abs(right.score.confidence - left.score.confidence) > EPSILON) {
    return right.score.confidence - left.score.confidence;
  }

  const maxTieBreakers = Math.max(
    left.tieBreakValues.length,
    right.tieBreakValues.length,
  );
  for (let index = 0; index < maxTieBreakers; index += 1) {
    const leftValue = left.tieBreakValues[index] ?? 0;
    const rightValue = right.tieBreakValues[index] ?? 0;
    if (Math.abs(rightValue - leftValue) > EPSILON) {
      return rightValue - leftValue;
    }
  }

  const statusDifference =
    (STATUS_ORDER[left.candidate.status] ?? Number.MAX_SAFE_INTEGER) -
    (STATUS_ORDER[right.candidate.status] ?? Number.MAX_SAFE_INTEGER);
  if (statusDifference !== 0) return statusDifference;

  const strategyDifference = left.candidate.identity.strategyId.localeCompare(
    right.candidate.identity.strategyId,
  );
  if (strategyDifference !== 0) return strategyDifference;

  const instanceDifference =
    left.candidate.identity.strategyInstanceId.localeCompare(
      right.candidate.identity.strategyInstanceId,
    );
  if (instanceDifference !== 0) return instanceDifference;

  return left.candidate.identity.candidateId.localeCompare(
    right.candidate.identity.candidateId,
  );
}

function reasonForMethod(
  method: AiStrategyRankingMethod,
  score: AiStrategyScore,
  fitness: AiStrategyRegimeFitness | undefined,
): string {
  switch (method) {
    case "WEIGHTED_SCORE":
      return `Ranked by weighted composite score ${round(score.compositeScore)}.`;
    case "PARETO_FRONTIER":
      return "Ranked by Pareto dominance strength and composite score.";
    case "RISK_ADJUSTED":
      return `Ranked using risk-adjusted quality ${round(riskAdjustedScore(score))}.`;
    case "REGIME_WEIGHTED":
      return `Ranked using regime fitness ${round(
        fitness?.fitnessScore ?? componentScore(score, "REGIME_FIT"),
      )}.`;
    case "ENSEMBLE_CONSENSUS":
      return `Ranked using cross-dimension consensus ${round(
        ensembleConsensusScore(score),
      )}.`;
    case "HYBRID":
      return "Ranked using the hybrid composite, risk, regime, consensus, and Pareto model.";
  }
}

function makeWorkingItems(
  candidates: readonly AiStrategyCandidate[],
  scores: readonly AiStrategyScore[],
  regimeFitness: readonly AiStrategyRegimeFitness[],
  policy: AiStrategyRankingPolicy,
  options: NormalizedOptions,
): readonly RankingWorkingItem[] {
  const byCandidate = candidateIndex(candidates);
  const byScore = scoreIndex(scores);

  const items: RankingWorkingItem[] = [];
  for (const candidateId of [...byCandidate.keys()].sort()) {
    const candidate = byCandidate.get(candidateId);
    if (candidate === undefined) continue;
    const score = byScore.get(candidateId);
    if (score === undefined) {
      throw new Error(`Missing strategy score for candidateId ${candidateId}.`);
    }
    if (
      score.strategyId !== candidate.identity.strategyId ||
      score.strategyInstanceId !== candidate.identity.strategyInstanceId
    ) {
      throw new Error(
        `Score identity does not match candidate identity for ${candidateId}.`,
      );
    }

    const fitness = fitnessForCandidate(candidateId, regimeFitness);
    let adjustedScore = adjustedScoreForMethod(
      policy.method,
      score,
      scores,
      fitness,
      options,
    );

    const reasons: string[] = [reasonForMethod(policy.method, score, fitness)];

    if (!score.eligible) {
      adjustedScore = options.ineligibleScore;
      reasons.push("Candidate was marked ineligible by the score engine.");
    }

    if (policy.preferDeterministicFallbacks && isDeterministicFallback(candidate)) {
      adjustedScore = clampUnit(adjustedScore + options.deterministicFallbackBonus);
      reasons.push("Applied deterministic fallback preference bonus.");
    }

    const tieBreakValues = policy.tieBreakerDimensions.map((dimension) =>
      componentScore(score, dimension),
    );

    items.push(
      Object.freeze({
        candidate,
        score,
        regimeFitness: fitness,
        adjustedScore: round(adjustedScore),
        tieBreakValues: Object.freeze(tieBreakValues),
        baseReasons: freezeStrings(reasons),
      }),
    );
  }

  return Object.freeze(items.sort(compareWorkingItems));
}

function canSelectFamily(
  family: AiStrategyFamily,
  counts: ReadonlyMap<AiStrategyFamily, number>,
  policy: AiStrategyRankingPolicy,
): boolean {
  if (!policy.requireFamilyDiversification) return true;
  if (policy.maximumStrategiesPerFamily === undefined) return true;
  return (counts.get(family) ?? 0) < policy.maximumStrategiesPerFamily;
}

function incrementFamily(
  family: AiStrategyFamily,
  counts: Map<AiStrategyFamily, number>,
): void {
  counts.set(family, (counts.get(family) ?? 0) + 1);
}

function selectEntries(
  orderedItems: readonly RankingWorkingItem[],
  policy: AiStrategyRankingPolicy,
  options: NormalizedOptions,
): readonly AiStrategyRankingEntry[] {
  const selectedFamilies = new Map<AiStrategyFamily, number>();
  const reserveFamilies = new Map<AiStrategyFamily, number>();
  let selectedCount = 0;
  let reserveCount = 0;

  const entries: AiStrategyRankingEntry[] = [];

  for (let index = 0; index < orderedItems.length; index += 1) {
    const item = orderedItems[index];
    const reasons = [...item.baseReasons];
    const family = item.candidate.classification.family;

    const passesScore =
      item.score.eligible && item.adjustedScore >= policy.minimumAdjustedScore;
    const passesConfidence = item.score.confidence >= policy.minimumConfidence;
    const familyEligibleForSelection = canSelectFamily(
      family,
      selectedFamilies,
      policy,
    );

    let selected = false;
    let reserve = false;

    if (!passesScore) {
      reasons.push(
        item.score.eligible
          ? `Adjusted score ${round(item.adjustedScore)} is below minimum ${round(
              policy.minimumAdjustedScore,
            )}.`
          : "Candidate is not eligible for selection.",
      );
    } else if (!passesConfidence) {
      reasons.push(
        `Confidence ${round(item.score.confidence)} is below minimum ${round(
          policy.minimumConfidence,
        )}.`,
      );
    } else if (
      selectedCount < policy.maximumSelectedStrategies &&
      familyEligibleForSelection
    ) {
      selected = true;
      selectedCount += 1;
      incrementFamily(family, selectedFamilies);
      reasons.push("Selected for the active strategy portfolio.");
    } else {
      if (!familyEligibleForSelection) {
        reasons.push(`Selection family limit reached for ${family}.`);
      } else {
        reasons.push("Active strategy selection capacity is full.");
      }

      const familyEligibleForReserve = canSelectFamily(
        family,
        reserveFamilies,
        policy,
      );
      if (
        reserveCount < policy.maximumReserveStrategies &&
        familyEligibleForReserve
      ) {
        reserve = true;
        reserveCount += 1;
        incrementFamily(family, reserveFamilies);
        reasons.push("Placed in the reserve strategy pool.");
      } else if (!familyEligibleForReserve) {
        reasons.push(`Reserve family limit reached for ${family}.`);
      } else {
        reasons.push("Reserve strategy capacity is full.");
      }
    }

    const familyBonus =
      policy.requireFamilyDiversification &&
      (selectedFamilies.get(family) ?? 0) === 1 &&
      selected
        ? options.familyDiversificationBonus
        : 0;
    const finalAdjustedScore = clampUnit(item.adjustedScore + familyBonus);
    if (familyBonus > 0) {
      reasons.push("Applied first-in-family diversification bonus.");
    }

    entries.push(
      Object.freeze({
        rank: index + 1,
        candidateId: item.candidate.identity.candidateId,
        strategyId: item.candidate.identity.strategyId,
        strategyInstanceId: item.candidate.identity.strategyInstanceId,
        compositeScore: round(item.score.compositeScore),
        adjustedScore: round(finalAdjustedScore),
        confidence: round(item.score.confidence),
        selected,
        reserve,
        reasons: freezeStrings(reasons),
        metadata: freezeMetadata(
          item.candidate.metadata,
          item.score.metadata,
          item.regimeFitness?.metadata,
          policy.metadata,
          options.metadata,
          {
            rankingMethod: policy.method,
            strategyFamily: family,
            deterministicFallback: isDeterministicFallback(item.candidate),
          } as StrategyMetadata,
        ),
      }),
    );
  }

  return Object.freeze(entries);
}

function ensureUniqueFitness(
  regimeFitness: readonly AiStrategyRegimeFitness[],
): void {
  const identities = new Set<string>();
  for (const fitness of regimeFitness) {
    assertUnitInterval(fitness.fitnessScore, "regimeFitness.fitnessScore");
    assertUnitInterval(fitness.confidence, "regimeFitness.confidence");
    assertIntegerAtLeast(
      fitness.historicalSampleSize,
      0,
      "regimeFitness.historicalSampleSize",
    );
    const identity = `${fitness.candidateId}\u0000${fitness.regime}`;
    if (identities.has(identity)) {
      throw new Error(
        `Duplicate regime fitness for candidateId ${fitness.candidateId} and regime ${fitness.regime}.`,
      );
    }
    identities.add(identity);
  }
}

/**
 * Production deterministic strategy ranking engine.
 */
export class StrategyRankingEngine implements AiStrategyRankingEnginePort {
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyRankingEngineOptions = {}) {
    this.options = normalizedOptions(options);
  }

  public rank(
    runId: string,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    scores: readonly AiStrategyScore[],
    regimeFitness: readonly AiStrategyRegimeFitness[],
    policy: AiStrategyRankingPolicy,
  ): AiStrategyRankingResult {
    if (runId.trim().length === 0) {
      throw new Error("runId cannot be empty.");
    }
    assertFiniteNumber(timestamp, "timestamp");
    validatePolicy(policy);
    ensureUniqueFitness(regimeFitness);

    const items = makeWorkingItems(
      candidates,
      scores,
      regimeFitness,
      policy,
      this.options,
    );
    const entries = selectEntries(items, policy, this.options);

    const selectedCandidateIds = Object.freeze(
      entries.filter((entry) => entry.selected).map((entry) => entry.candidateId),
    );
    const reserveCandidateIds = Object.freeze(
      entries.filter((entry) => entry.reserve).map((entry) => entry.candidateId),
    );

    const rankingIdentity = stableText({
      runId,
      timestamp,
      method: policy.method,
      selectedCandidateIds,
      reserveCandidateIds,
      entries: entries.map((entry) => ({
        candidateId: entry.candidateId,
        rank: entry.rank,
        adjustedScore: entry.adjustedScore,
        confidence: entry.confidence,
        selected: entry.selected,
        reserve: entry.reserve,
      })),
    });

    return Object.freeze({
      rankingId: `${this.options.rankingIdPrefix}-${fnv1a32(rankingIdentity)}`,
      runId,
      timestamp,
      method: policy.method,
      entries,
      selectedCandidateIds,
      reserveCandidateIds,
      metadata: freezeMetadata(
        policy.metadata,
        this.options.metadata,
        {
          candidateCount: candidates.length,
          scoreCount: scores.length,
          regimeFitnessCount: regimeFitness.length,
          selectedCount: selectedCandidateIds.length,
          reserveCount: reserveCandidateIds.length,
        } as StrategyMetadata,
      ),
    });
  }
}

export function createStrategyRankingEngine(
  options: StrategyRankingEngineOptions = {},
): StrategyRankingEngine {
  return new StrategyRankingEngine(options);
}

export function rankStrategies(
  runId: string,
  timestamp: UnixTimestampMilliseconds,
  candidates: readonly AiStrategyCandidate[],
  scores: readonly AiStrategyScore[],
  regimeFitness: readonly AiStrategyRegimeFitness[],
  policy: AiStrategyRankingPolicy,
  options: StrategyRankingEngineOptions = {},
): AiStrategyRankingResult {
  return new StrategyRankingEngine(options).rank(
    runId,
    timestamp,
    candidates,
    scores,
    regimeFitness,
    policy,
  );
}
