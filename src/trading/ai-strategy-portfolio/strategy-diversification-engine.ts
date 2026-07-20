/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-diversification-engine.ts
 *
 * Purpose:
 * Builds a deterministic correlation matrix and converts a ranked strategy set
 * into a policy-constrained, explainable, and immutable diversified selection.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyCorrelationMatrix,
  type AiStrategyDiversificationAssessment,
  type AiStrategyDiversificationEnginePort,
  type AiStrategyDiversificationPolicy,
  type AiStrategyDiversificationResult,
  type AiStrategyFamily,
  type AiStrategyIntelligenceType,
  type AiStrategyPairCorrelation,
  type AiStrategyRankingEntry,
  type AiStrategyRankingResult,
  type AiStrategyReturnObservation,
} from "./ai-strategy-portfolio-contracts";

export interface StrategyDiversificationEngineOptions {
  readonly minimumCorrelationObservations?: number;
  readonly fullConfidenceObservations?: number;
  readonly missingCorrelationValue?: number;
  readonly conflictConfidenceThreshold?: number;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly minimumCorrelationObservations: number;
  readonly fullConfidenceObservations: number;
  readonly missingCorrelationValue: number;
  readonly conflictConfidenceThreshold: number;
  readonly metadata: StrategyMetadata;
}

interface CorrelationComputation {
  readonly correlation: number;
  readonly sampleSize: number;
  readonly confidence: number;
}

interface WorkingSelection {
  readonly selected: AiStrategyCandidateId[];
  readonly excluded: AiStrategyCandidateId[];
  readonly reasons: Map<AiStrategyCandidateId, string[]>;
  readonly conflicts: Map<AiStrategyCandidateId, Set<AiStrategyCandidateId>>;
}

const DEFAULT_MINIMUM_CORRELATION_OBSERVATIONS = 3;
const DEFAULT_FULL_CONFIDENCE_OBSERVATIONS = 30;
const DEFAULT_MISSING_CORRELATION_VALUE = 0;
const DEFAULT_CONFLICT_CONFIDENCE_THRESHOLD = 0.25;
const EPSILON = 1e-12;

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
  if (value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function assertCorrelation(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (
    value < AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM ||
    value > AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM
  ) {
    throw new Error(`${field} must be between -1 and 1.`);
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM;
  return Math.min(
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
    Math.max(AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM, value),
  );
}

function clampCorrelation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    AI_STRATEGY_PORTFOLIO_CORRELATION_MAXIMUM,
    Math.max(AI_STRATEGY_PORTFOLIO_CORRELATION_MINIMUM, value),
  );
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function freezeMetadata(
  ...sources: readonly (StrategyMetadata | undefined)[]
): StrategyMetadata {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (source === undefined) continue;
    for (const [key, value] of Object.entries(source)) merged[key] = value;
  }
  return Object.freeze(merged) as StrategyMetadata;
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function freezeIds(
  values: readonly AiStrategyCandidateId[],
): readonly AiStrategyCandidateId[] {
  return Object.freeze([...values]);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function canonicalPairKey(
  leftCandidateId: AiStrategyCandidateId,
  rightCandidateId: AiStrategyCandidateId,
): string {
  return compareText(leftCandidateId, rightCandidateId) <= 0
    ? `${leftCandidateId}\u0000${rightCandidateId}`
    : `${rightCandidateId}\u0000${leftCandidateId}`;
}

function normalizeOptions(
  options: StrategyDiversificationEngineOptions,
): NormalizedOptions {
  const minimumCorrelationObservations =
    options.minimumCorrelationObservations ??
    DEFAULT_MINIMUM_CORRELATION_OBSERVATIONS;
  const fullConfidenceObservations =
    options.fullConfidenceObservations ?? DEFAULT_FULL_CONFIDENCE_OBSERVATIONS;
  const missingCorrelationValue =
    options.missingCorrelationValue ?? DEFAULT_MISSING_CORRELATION_VALUE;
  const conflictConfidenceThreshold =
    options.conflictConfidenceThreshold ??
    DEFAULT_CONFLICT_CONFIDENCE_THRESHOLD;

  assertIntegerAtLeast(
    minimumCorrelationObservations,
    2,
    "options.minimumCorrelationObservations",
  );
  assertIntegerAtLeast(
    fullConfidenceObservations,
    minimumCorrelationObservations,
    "options.fullConfidenceObservations",
  );
  assertCorrelation(
    missingCorrelationValue,
    "options.missingCorrelationValue",
  );
  assertUnitInterval(
    conflictConfidenceThreshold,
    "options.conflictConfidenceThreshold",
  );

  return Object.freeze({
    minimumCorrelationObservations,
    fullConfidenceObservations,
    missingCorrelationValue,
    conflictConfidenceThreshold,
    metadata: freezeMetadata(EMPTY_STRATEGY_METADATA, options.metadata),
  });
}

function validatePolicy(policy: AiStrategyDiversificationPolicy): void {
  assertCorrelation(
    policy.maximumPairwiseCorrelation,
    "policy.maximumPairwiseCorrelation",
  );
  assertCorrelation(
    policy.maximumAverageCorrelation,
    "policy.maximumAverageCorrelation",
  );
  assertIntegerAtLeast(policy.minimumFamilyCount, 1, "policy.minimumFamilyCount");
  assertUnitInterval(policy.maximumFamilyWeight, "policy.maximumFamilyWeight");
  if (policy.maximumFamilyWeight <= 0) {
    throw new Error("policy.maximumFamilyWeight must be greater than zero.");
  }
  assertIntegerAtLeast(
    policy.minimumIntelligenceTypeCount,
    1,
    "policy.minimumIntelligenceTypeCount",
  );
  assertUnitInterval(
    policy.correlationPenaltyWeight,
    "policy.correlationPenaltyWeight",
  );
}

function candidateMap(
  candidates: readonly AiStrategyCandidate[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate> {
  const map = new Map<AiStrategyCandidateId, AiStrategyCandidate>();
  for (const candidate of candidates) {
    const id = candidate.identity.candidateId;
    if (map.has(id)) throw new Error(`Duplicate candidateId: ${id}.`);
    map.set(id, candidate);
  }
  return map;
}

function validateRanking(
  ranking: AiStrategyRankingResult,
  candidatesById: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
): void {
  const entryIds = new Set<AiStrategyCandidateId>();
  for (const entry of ranking.entries) {
    if (entryIds.has(entry.candidateId)) {
      throw new Error(`Duplicate ranking candidateId: ${entry.candidateId}.`);
    }
    if (!candidatesById.has(entry.candidateId)) {
      throw new Error(`Ranking references unknown candidateId: ${entry.candidateId}.`);
    }
    entryIds.add(entry.candidateId);
  }

  for (const candidateId of [
    ...ranking.selectedCandidateIds,
    ...ranking.reserveCandidateIds,
  ]) {
    if (!entryIds.has(candidateId)) {
      throw new Error(`Ranking selection references missing entry: ${candidateId}.`);
    }
  }
}

function rankingOrder(
  ranking: AiStrategyRankingResult,
): readonly AiStrategyRankingEntry[] {
  return Object.freeze(
    [...ranking.entries].sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      if (Math.abs(right.adjustedScore - left.adjustedScore) > EPSILON) {
        return right.adjustedScore - left.adjustedScore;
      }
      return compareText(left.candidateId, right.candidateId);
    }),
  );
}

function groupObservations(
  observations: readonly AiStrategyReturnObservation[],
  knownCandidateIds: ReadonlySet<AiStrategyCandidateId>,
): ReadonlyMap<AiStrategyCandidateId, ReadonlyMap<number, number>> {
  const mutable = new Map<AiStrategyCandidateId, Map<number, number>>();

  for (const observation of observations) {
    if (!knownCandidateIds.has(observation.candidateId)) continue;
    assertFiniteNumber(observation.timestamp, "returnObservation.timestamp");
    assertFiniteNumber(observation.returnValue, "returnObservation.returnValue");

    let series = mutable.get(observation.candidateId);
    if (series === undefined) {
      series = new Map<number, number>();
      mutable.set(observation.candidateId, series);
    }
    if (series.has(observation.timestamp)) {
      throw new Error(
        `Duplicate return observation for ${observation.candidateId} at ${observation.timestamp}.`,
      );
    }
    series.set(observation.timestamp, observation.returnValue);
  }

  const frozen = new Map<AiStrategyCandidateId, ReadonlyMap<number, number>>();
  for (const [candidateId, series] of mutable) {
    frozen.set(candidateId, new Map([...series.entries()].sort(([a], [b]) => a - b)));
  }
  return frozen;
}

function pearsonCorrelation(
  left: ReadonlyMap<number, number> | undefined,
  right: ReadonlyMap<number, number> | undefined,
  options: NormalizedOptions,
): CorrelationComputation {
  if (left === undefined || right === undefined) {
    return Object.freeze({
      correlation: options.missingCorrelationValue,
      sampleSize: 0,
      confidence: 0,
    });
  }

  const aligned: Array<readonly [number, number]> = [];
  for (const [timestamp, leftValue] of left) {
    const rightValue = right.get(timestamp);
    if (rightValue !== undefined) aligned.push([leftValue, rightValue]);
  }

  const sampleSize = aligned.length;
  if (sampleSize < options.minimumCorrelationObservations) {
    return Object.freeze({
      correlation: options.missingCorrelationValue,
      sampleSize,
      confidence: 0,
    });
  }

  let leftSum = 0;
  let rightSum = 0;
  for (const [leftValue, rightValue] of aligned) {
    leftSum += leftValue;
    rightSum += rightValue;
  }
  const leftMean = leftSum / sampleSize;
  const rightMean = rightSum / sampleSize;

  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (const [leftValue, rightValue] of aligned) {
    const leftDeviation = leftValue - leftMean;
    const rightDeviation = rightValue - rightMean;
    covariance += leftDeviation * rightDeviation;
    leftVariance += leftDeviation * leftDeviation;
    rightVariance += rightDeviation * rightDeviation;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  const correlation =
    denominator <= EPSILON
      ? options.missingCorrelationValue
      : clampCorrelation(covariance / denominator);
  const confidence = clampUnit(
    sampleSize / options.fullConfidenceObservations,
  );

  return Object.freeze({
    correlation: round(correlation),
    sampleSize,
    confidence: round(confidence),
  });
}

function buildCorrelationMatrix(
  timestamp: UnixTimestampMilliseconds,
  candidateIds: readonly AiStrategyCandidateId[],
  observations: readonly AiStrategyReturnObservation[],
  options: NormalizedOptions,
  policy: AiStrategyDiversificationPolicy,
): AiStrategyCorrelationMatrix {
  const ids = [...candidateIds].sort(compareText);
  const grouped = groupObservations(observations, new Set(ids));
  const pairs: AiStrategyPairCorrelation[] = [];
  const rows: number[][] = ids.map(() => ids.map(() => 0));
  let lookbackObservations = 0;

  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    rows[leftIndex]![leftIndex] = 1;
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const leftCandidateId = ids[leftIndex]!;
      const rightCandidateId = ids[rightIndex]!;
      const computed = pearsonCorrelation(
        grouped.get(leftCandidateId),
        grouped.get(rightCandidateId),
        options,
      );
      rows[leftIndex]![rightIndex] = computed.correlation;
      rows[rightIndex]![leftIndex] = computed.correlation;
      lookbackObservations = Math.max(lookbackObservations, computed.sampleSize);
      pairs.push(
        Object.freeze({
          leftCandidateId,
          rightCandidateId,
          correlation: computed.correlation,
          sampleSize: computed.sampleSize,
          confidence: computed.confidence,
          metadata: freezeMetadata(options.metadata, policy.metadata, {
            pairKey: canonicalPairKey(leftCandidateId, rightCandidateId),
          }),
        }),
      );
    }
  }

  return Object.freeze({
    timestamp,
    candidateIds: freezeIds(ids),
    values: Object.freeze(rows.map((row) => Object.freeze([...row]))),
    pairs: Object.freeze(pairs),
    lookbackObservations,
    metadata: freezeMetadata(options.metadata, policy.metadata, {
      minimumCorrelationObservations: options.minimumCorrelationObservations,
      fullConfidenceObservations: options.fullConfidenceObservations,
    }),
  });
}

function pairMap(
  matrix: AiStrategyCorrelationMatrix,
): ReadonlyMap<string, AiStrategyPairCorrelation> {
  const map = new Map<string, AiStrategyPairCorrelation>();
  for (const pair of matrix.pairs) {
    map.set(canonicalPairKey(pair.leftCandidateId, pair.rightCandidateId), pair);
  }
  return map;
}

function getPair(
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  left: AiStrategyCandidateId,
  right: AiStrategyCandidateId,
): AiStrategyPairCorrelation | undefined {
  if (left === right) return undefined;
  return pairs.get(canonicalPairKey(left, right));
}

function isDeterministicFallback(candidate: AiStrategyCandidate): boolean {
  return (
    candidate.classification.intelligenceType === "DETERMINISTIC_RULE_BASED" ||
    candidate.classification.intelligenceType === "DETERMINISTIC_ARBITRAGE"
  );
}

function countFamilies(
  ids: readonly AiStrategyCandidateId[],
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
): number {
  return new Set(
    ids.map((id) => candidates.get(id)?.classification.family).filter(Boolean),
  ).size;
}

function countIntelligenceTypes(
  ids: readonly AiStrategyCandidateId[],
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
): number {
  return new Set(
    ids
      .map((id) => candidates.get(id)?.classification.intelligenceType)
      .filter(Boolean),
  ).size;
}

function familyWeight(
  family: AiStrategyFamily,
  selectedIds: readonly AiStrategyCandidateId[],
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
): number {
  if (selectedIds.length === 0) return 0;
  const familyCount = selectedIds.filter(
    (id) => candidates.get(id)?.classification.family === family,
  ).length;
  return familyCount / selectedIds.length;
}

function correlationStats(
  candidateId: AiStrategyCandidateId,
  comparisonIds: readonly AiStrategyCandidateId[],
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
): { readonly average: number; readonly maximum: number } {
  const values: number[] = [];
  for (const otherId of comparisonIds) {
    if (otherId === candidateId) continue;
    const pair = getPair(pairs, candidateId, otherId);
    if (pair !== undefined) values.push(pair.correlation);
  }
  if (values.length === 0) return Object.freeze({ average: 0, maximum: 0 });
  return Object.freeze({
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: round(Math.max(...values)),
  });
}

function conflictsFor(
  candidateId: AiStrategyCandidateId,
  selectedIds: readonly AiStrategyCandidateId[],
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  policy: AiStrategyDiversificationPolicy,
  options: NormalizedOptions,
): readonly AiStrategyCandidateId[] {
  return Object.freeze(
    selectedIds
      .filter((otherId) => {
        if (otherId === candidateId) return false;
        const pair = getPair(pairs, candidateId, otherId);
        return (
          pair !== undefined &&
          pair.confidence >= options.conflictConfidenceThreshold &&
          pair.correlation > policy.maximumPairwiseCorrelation
        );
      })
      .sort(compareText),
  );
}

function canAddCandidate(
  candidateId: AiStrategyCandidateId,
  selectedIds: readonly AiStrategyCandidateId[],
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  policy: AiStrategyDiversificationPolicy,
  options: NormalizedOptions,
): { readonly allowed: boolean; readonly reasons: readonly string[]; readonly conflicts: readonly AiStrategyCandidateId[] } {
  const candidate = candidates.get(candidateId);
  if (candidate === undefined) {
    return Object.freeze({
      allowed: false,
      reasons: freezeStrings(["Candidate is unavailable."]),
      conflicts: freezeIds([]),
    });
  }

  const reasons: string[] = [];
  const conflicts = conflictsFor(candidateId, selectedIds, pairs, policy, options);
  if (conflicts.length > 0) {
    reasons.push(
      `Pairwise correlation exceeds policy limit with ${conflicts.join(", ")}.`,
    );
  }

  const prospective = [...selectedIds, candidateId];
  const stats = correlationStats(candidateId, selectedIds, pairs);
  if (
    selectedIds.length > 0 &&
    stats.average > policy.maximumAverageCorrelation
  ) {
    reasons.push(
      `Average correlation ${stats.average} exceeds ${policy.maximumAverageCorrelation}.`,
    );
  }

  const prospectiveFamilyWeight = familyWeight(
    candidate.classification.family,
    prospective,
    candidates,
  );
  if (prospectiveFamilyWeight > policy.maximumFamilyWeight + EPSILON) {
    reasons.push(
      `Family weight ${round(prospectiveFamilyWeight)} exceeds ${policy.maximumFamilyWeight}.`,
    );
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: freezeStrings(reasons),
    conflicts,
  });
}

function addReason(
  reasons: Map<AiStrategyCandidateId, string[]>,
  candidateId: AiStrategyCandidateId,
  reason: string,
): void {
  const existing = reasons.get(candidateId) ?? [];
  if (!existing.includes(reason)) existing.push(reason);
  reasons.set(candidateId, existing);
}

function selectDiversifiedCandidates(
  ranking: AiStrategyRankingResult,
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  policy: AiStrategyDiversificationPolicy,
  options: NormalizedOptions,
): WorkingSelection {
  const orderedEntries = rankingOrder(ranking);
  const rankedSelected = new Set(ranking.selectedCandidateIds);
  const rankedReserves = new Set(ranking.reserveCandidateIds);
  const primary = orderedEntries.filter((entry) => rankedSelected.has(entry.candidateId));
  const reserve = orderedEntries.filter((entry) => rankedReserves.has(entry.candidateId));
  const selected: AiStrategyCandidateId[] = [];
  const excluded: AiStrategyCandidateId[] = [];
  const reasons = new Map<AiStrategyCandidateId, string[]>();
  const conflicts = new Map<AiStrategyCandidateId, Set<AiStrategyCandidateId>>();

  const evaluate = (entry: AiStrategyRankingEntry, promotion: boolean): void => {
    const result = canAddCandidate(
      entry.candidateId,
      selected,
      candidates,
      pairs,
      policy,
      options,
    );
    if (result.allowed) {
      selected.push(entry.candidateId);
      addReason(
        reasons,
        entry.candidateId,
        promotion
          ? "Promoted from reserve to satisfy diversification policy."
          : "Accepted by diversification policy.",
      );
      return;
    }

    if (!excluded.includes(entry.candidateId)) excluded.push(entry.candidateId);
    for (const reason of result.reasons) addReason(reasons, entry.candidateId, reason);
    conflicts.set(entry.candidateId, new Set(result.conflicts));
  };

  for (const entry of primary) evaluate(entry, false);

  const needsFamilyDiversity = (): boolean =>
    countFamilies(selected, candidates) < policy.minimumFamilyCount;
  const needsIntelligenceDiversity = (): boolean =>
    countIntelligenceTypes(selected, candidates) < policy.minimumIntelligenceTypeCount;
  const needsFallback = (): boolean =>
    policy.requireDeterministicFallback &&
    !selected.some((id) => {
      const candidate = candidates.get(id);
      return candidate !== undefined && isDeterministicFallback(candidate);
    });

  for (const entry of reserve) {
    if (!needsFamilyDiversity() && !needsIntelligenceDiversity() && !needsFallback()) {
      break;
    }
    const candidate = candidates.get(entry.candidateId);
    if (candidate === undefined) continue;

    const addsFamily = !selected.some(
      (id) =>
        candidates.get(id)?.classification.family ===
        candidate.classification.family,
    );
    const addsIntelligence = !selected.some(
      (id) =>
        candidates.get(id)?.classification.intelligenceType ===
        candidate.classification.intelligenceType,
    );
    const addsFallback = isDeterministicFallback(candidate);

    if (
      (needsFamilyDiversity() && addsFamily) ||
      (needsIntelligenceDiversity() && addsIntelligence) ||
      (needsFallback() && addsFallback)
    ) {
      evaluate(entry, true);
    }
  }

  for (const entry of orderedEntries) {
    if (!selected.includes(entry.candidateId) && !excluded.includes(entry.candidateId)) {
      excluded.push(entry.candidateId);
      addReason(reasons, entry.candidateId, "Not selected by ranking or diversification promotion.");
    }
  }

  if (needsFamilyDiversity()) {
    for (const id of selected) {
      addReason(
        reasons,
        id,
        `Portfolio contains fewer than ${policy.minimumFamilyCount} strategy families.`,
      );
    }
  }
  if (needsIntelligenceDiversity()) {
    for (const id of selected) {
      addReason(
        reasons,
        id,
        `Portfolio contains fewer than ${policy.minimumIntelligenceTypeCount} intelligence types.`,
      );
    }
  }
  if (needsFallback()) {
    for (const id of selected) {
      addReason(reasons, id, "Required deterministic fallback is unavailable.");
    }
  }

  return { selected, excluded, reasons, conflicts };
}

function diversificationScore(
  averageCorrelation: number,
  maximumCorrelation: number,
  policy: AiStrategyDiversificationPolicy,
): number {
  const averagePenalty = clampUnit((averageCorrelation + 1) / 2);
  const maximumPenalty = clampUnit((maximumCorrelation + 1) / 2);
  const combinedPenalty =
    averagePenalty * 0.6 + maximumPenalty * 0.4;
  return round(
    clampUnit(1 - combinedPenalty * policy.correlationPenaltyWeight),
  );
}

function buildAssessments(
  ranking: AiStrategyRankingResult,
  selection: WorkingSelection,
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  policy: AiStrategyDiversificationPolicy,
  options: NormalizedOptions,
): readonly AiStrategyDiversificationAssessment[] {
  const selectedSet = new Set(selection.selected);
  return Object.freeze(
    rankingOrder(ranking).map((entry) => {
      const comparisonIds = selectedSet.has(entry.candidateId)
        ? selection.selected.filter((id) => id !== entry.candidateId)
        : selection.selected;
      const stats = correlationStats(entry.candidateId, comparisonIds, pairs);
      const conflicts = selection.conflicts.get(entry.candidateId) ??
        new Set(
          conflictsFor(
            entry.candidateId,
            comparisonIds,
            pairs,
            policy,
            options,
          ),
        );
      return Object.freeze({
        candidateId: entry.candidateId,
        diversificationScore: diversificationScore(
          stats.average,
          stats.maximum,
          policy,
        ),
        averageCorrelation: stats.average,
        maximumCorrelation: stats.maximum,
        compatible: selectedSet.has(entry.candidateId),
        conflictsWith: freezeIds([...conflicts].sort(compareText)),
        reasons: freezeStrings(selection.reasons.get(entry.candidateId) ?? []),
        metadata: freezeMetadata(options.metadata, policy.metadata, entry.metadata, {
          rankingPosition: entry.rank,
          originallySelected: entry.selected,
          originallyReserve: entry.reserve,
        }),
      });
    }),
  );
}

function portfolioAverageCorrelation(
  selectedIds: readonly AiStrategyCandidateId[],
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
): number {
  const correlations: number[] = [];
  for (let leftIndex = 0; leftIndex < selectedIds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < selectedIds.length;
      rightIndex += 1
    ) {
      const pair = getPair(
        pairs,
        selectedIds[leftIndex]!,
        selectedIds[rightIndex]!,
      );
      if (pair !== undefined) correlations.push(pair.correlation);
    }
  }
  if (correlations.length === 0) return 0;
  return round(
    correlations.reduce((sum, value) => sum + value, 0) /
      correlations.length,
  );
}

function portfolioDiversificationScore(
  selectedIds: readonly AiStrategyCandidateId[],
  candidates: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
  pairs: ReadonlyMap<string, AiStrategyPairCorrelation>,
  policy: AiStrategyDiversificationPolicy,
): number {
  if (selectedIds.length === 0) return 0;
  const averageCorrelation = portfolioAverageCorrelation(selectedIds, pairs);
  const correlationScore = clampUnit(1 - (averageCorrelation + 1) / 2);
  const familyScore = clampUnit(
    countFamilies(selectedIds, candidates) /
      Math.max(1, policy.minimumFamilyCount),
  );
  const intelligenceScore = clampUnit(
    countIntelligenceTypes(selectedIds, candidates) /
      Math.max(1, policy.minimumIntelligenceTypeCount),
  );
  const fallbackScore =
    !policy.requireDeterministicFallback ||
    selectedIds.some((id) => {
      const candidate = candidates.get(id);
      return candidate !== undefined && isDeterministicFallback(candidate);
    })
      ? 1
      : 0;

  return round(
    clampUnit(
      correlationScore * 0.55 +
        familyScore * 0.2 +
        intelligenceScore * 0.15 +
        fallbackScore * 0.1,
    ),
  );
}

export class StrategyDiversificationEngine
  implements AiStrategyDiversificationEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyDiversificationEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public analyze(
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    ranking: AiStrategyRankingResult,
    returnObservations: readonly AiStrategyReturnObservation[],
    policy: AiStrategyDiversificationPolicy,
  ): {
    readonly correlationMatrix: AiStrategyCorrelationMatrix;
    readonly diversification: AiStrategyDiversificationResult;
  } {
    assertFiniteNumber(timestamp, "timestamp");
    validatePolicy(policy);
    const candidatesById = candidateMap(candidates);
    validateRanking(ranking, candidatesById);

    const rankedCandidateIds = rankingOrder(ranking).map(
      (entry) => entry.candidateId,
    );
    const correlationMatrix = buildCorrelationMatrix(
      timestamp,
      rankedCandidateIds,
      returnObservations,
      this.options,
      policy,
    );
    const pairs = pairMap(correlationMatrix);
    const selection = selectDiversifiedCandidates(
      ranking,
      candidatesById,
      pairs,
      policy,
      this.options,
    );
    const assessments = buildAssessments(
      ranking,
      selection,
      pairs,
      policy,
      this.options,
    );
    const averagePairwiseCorrelation = portfolioAverageCorrelation(
      selection.selected,
      pairs,
    );

    const diversification: AiStrategyDiversificationResult = Object.freeze({
      timestamp,
      selectedCandidateIds: freezeIds(selection.selected),
      excludedCandidateIds: freezeIds(selection.excluded),
      assessments,
      portfolioDiversificationScore: portfolioDiversificationScore(
        selection.selected,
        candidatesById,
        pairs,
        policy,
      ),
      averagePairwiseCorrelation,
      familyCount: countFamilies(selection.selected, candidatesById),
      intelligenceTypeCount: countIntelligenceTypes(
        selection.selected,
        candidatesById,
      ),
      metadata: freezeMetadata(this.options.metadata, policy.metadata, {
        rankingId: ranking.rankingId,
        correlationObservationCount: returnObservations.length,
        selectedCount: selection.selected.length,
        excludedCount: selection.excluded.length,
      }),
    });

    return Object.freeze({ correlationMatrix, diversification });
  }
}

export function createStrategyDiversificationEngine(
  options: StrategyDiversificationEngineOptions = {},
): StrategyDiversificationEngine {
  return new StrategyDiversificationEngine(options);
}
