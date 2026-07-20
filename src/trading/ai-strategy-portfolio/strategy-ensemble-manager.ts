/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-ensemble-manager.ts
 *
 * Purpose:
 * Builds deterministic, immutable strategy ensembles from the final portfolio
 * allocation and assesses their participation, diversification, confidence,
 * correlation, regime fitness, and portfolio-risk characteristics.
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
  type AiStrategyAllocationResult,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyCorrelationMatrix,
  type AiStrategyEnsembleAssessment,
  type AiStrategyEnsembleDefinition,
  type AiStrategyEnsembleId,
  type AiStrategyEnsembleManagerPort,
  type AiStrategyEnsembleMember,
  type AiStrategyEnsembleVotingMethod,
  type AiStrategyFamily,
  type AiStrategyPortfolioId,
  type AiStrategyRegimeSnapshot,
  type AiStrategyTargetAllocation,
} from "./ai-strategy-portfolio-contracts";

const EPSILON = 1e-12;
const DEFAULT_NUMERICAL_PRECISION = 12;
const DEFAULT_MINIMUM_MEMBER_WEIGHT = 0.0001;
const DEFAULT_MINIMUM_PARTICIPATION_WEIGHT = 0.5;
const DEFAULT_MINIMUM_CONSENSUS = 0.55;
const DEFAULT_MINIMUM_MEMBERS = 1;
const DEFAULT_MINIMUM_FAMILY_ENSEMBLE_MEMBERS = 2;
const DEFAULT_MAXIMUM_FAMILY_ENSEMBLES = 8;
const DEFAULT_MAXIMUM_ACCEPTABLE_CORRELATION = 0.85;
const DEFAULT_MINIMUM_DIVERSIFICATION_SCORE = 0.2;
const DEFAULT_MINIMUM_REGIME_FITNESS = 0.2;
const DEFAULT_MINIMUM_EXPECTED_CONFIDENCE = 0.2;

export interface StrategyEnsembleManagerOptions {
  /** Voting method assigned to the portfolio-wide ensemble. */
  readonly votingMethod?: AiStrategyEnsembleVotingMethod;

  /** Voting method assigned to family-specific ensembles. */
  readonly familyVotingMethod?: AiStrategyEnsembleVotingMethod;

  /** Allocations below this value are excluded from ensembles. */
  readonly minimumMemberWeight?: number;

  /** Minimum enabled ensemble weight required to participate in a vote. */
  readonly minimumParticipationWeight?: number;

  /** Minimum normalized consensus required for a trade decision. */
  readonly minimumConsensus?: number;

  /** Minimum number of enabled members for the portfolio-wide ensemble. */
  readonly minimumMembers?: number;

  /** Minimum family members required before a family ensemble is emitted. */
  readonly minimumFamilyEnsembleMembers?: number;

  /** Maximum number of family-specific ensembles emitted per build. */
  readonly maximumFamilyEnsembles?: number;

  /** Maximum acceptable weighted pairwise correlation. */
  readonly maximumAcceptableCorrelation?: number;

  /** Minimum acceptable ensemble diversification score. */
  readonly minimumDiversificationScore?: number;

  /** Minimum acceptable weighted regime fitness. */
  readonly minimumRegimeFitness?: number;

  /** Minimum acceptable weighted member confidence. */
  readonly minimumExpectedConfidence?: number;

  /** Emit one ensemble per strategy family where sufficient members exist. */
  readonly createFamilyEnsembles?: boolean;

  /** Cause unresolved voting conflicts to result in HOLD. */
  readonly conflictResultsInHold?: boolean;

  /** Decimal precision applied to deterministic numerical outputs. */
  readonly numericalPrecision?: number;

  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly votingMethod: AiStrategyEnsembleVotingMethod;
  readonly familyVotingMethod: AiStrategyEnsembleVotingMethod;
  readonly minimumMemberWeight: number;
  readonly minimumParticipationWeight: number;
  readonly minimumConsensus: number;
  readonly minimumMembers: number;
  readonly minimumFamilyEnsembleMembers: number;
  readonly maximumFamilyEnsembles: number;
  readonly maximumAcceptableCorrelation: number;
  readonly minimumDiversificationScore: number;
  readonly minimumRegimeFitness: number;
  readonly minimumExpectedConfidence: number;
  readonly createFamilyEnsembles: boolean;
  readonly conflictResultsInHold: boolean;
  readonly numericalPrecision: number;
  readonly metadata: StrategyMetadata;
}

interface MemberContext {
  readonly candidate: AiStrategyCandidate;
  readonly allocation: AiStrategyTargetAllocation;
}

interface CorrelationSummary {
  readonly averageCorrelation: number;
  readonly diversificationScore: number;
  readonly knownPairCount: number;
  readonly totalPairCount: number;
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
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

function assertIntegerAtLeast(value: number, minimum: number, field: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(
      `${field} must be an integer greater than or equal to ${minimum}.`,
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function clampUnit(value: number): number {
  return clamp(
    value,
    AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
    AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  );
}

function round(value: number, precision: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= EPSILON) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeOptions(
  options: StrategyEnsembleManagerOptions,
): NormalizedOptions {
  const minimumMemberWeight =
    options.minimumMemberWeight ?? DEFAULT_MINIMUM_MEMBER_WEIGHT;
  const minimumParticipationWeight =
    options.minimumParticipationWeight ??
    DEFAULT_MINIMUM_PARTICIPATION_WEIGHT;
  const minimumConsensus =
    options.minimumConsensus ?? DEFAULT_MINIMUM_CONSENSUS;
  const minimumMembers = options.minimumMembers ?? DEFAULT_MINIMUM_MEMBERS;
  const minimumFamilyEnsembleMembers =
    options.minimumFamilyEnsembleMembers ??
    DEFAULT_MINIMUM_FAMILY_ENSEMBLE_MEMBERS;
  const maximumFamilyEnsembles =
    options.maximumFamilyEnsembles ?? DEFAULT_MAXIMUM_FAMILY_ENSEMBLES;
  const maximumAcceptableCorrelation =
    options.maximumAcceptableCorrelation ??
    DEFAULT_MAXIMUM_ACCEPTABLE_CORRELATION;
  const minimumDiversificationScore =
    options.minimumDiversificationScore ??
    DEFAULT_MINIMUM_DIVERSIFICATION_SCORE;
  const minimumRegimeFitness =
    options.minimumRegimeFitness ?? DEFAULT_MINIMUM_REGIME_FITNESS;
  const minimumExpectedConfidence =
    options.minimumExpectedConfidence ??
    DEFAULT_MINIMUM_EXPECTED_CONFIDENCE;
  const numericalPrecision =
    options.numericalPrecision ?? DEFAULT_NUMERICAL_PRECISION;

  assertUnitInterval(minimumMemberWeight, "options.minimumMemberWeight");
  assertUnitInterval(
    minimumParticipationWeight,
    "options.minimumParticipationWeight",
  );
  assertUnitInterval(minimumConsensus, "options.minimumConsensus");
  assertIntegerAtLeast(minimumMembers, 1, "options.minimumMembers");
  assertIntegerAtLeast(
    minimumFamilyEnsembleMembers,
    1,
    "options.minimumFamilyEnsembleMembers",
  );
  assertIntegerAtLeast(
    maximumFamilyEnsembles,
    0,
    "options.maximumFamilyEnsembles",
  );
  assertCorrelation(
    maximumAcceptableCorrelation,
    "options.maximumAcceptableCorrelation",
  );
  assertUnitInterval(
    minimumDiversificationScore,
    "options.minimumDiversificationScore",
  );
  assertUnitInterval(
    minimumRegimeFitness,
    "options.minimumRegimeFitness",
  );
  assertUnitInterval(
    minimumExpectedConfidence,
    "options.minimumExpectedConfidence",
  );
  assertIntegerAtLeast(numericalPrecision, 0, "options.numericalPrecision");
  if (numericalPrecision > 15) {
    throw new Error("options.numericalPrecision must not exceed 15.");
  }

  return Object.freeze({
    votingMethod: options.votingMethod ?? "RISK_ADJUSTED",
    familyVotingMethod: options.familyVotingMethod ?? "CONFIDENCE_WEIGHTED",
    minimumMemberWeight,
    minimumParticipationWeight,
    minimumConsensus,
    minimumMembers,
    minimumFamilyEnsembleMembers,
    maximumFamilyEnsembles,
    maximumAcceptableCorrelation,
    minimumDiversificationScore,
    minimumRegimeFitness,
    minimumExpectedConfidence,
    createFamilyEnsembles: options.createFamilyEnsembles ?? true,
    conflictResultsInHold: options.conflictResultsInHold ?? true,
    numericalPrecision,
    metadata: options.metadata ?? EMPTY_STRATEGY_METADATA,
  });
}

function validateInputs(
  portfolioId: AiStrategyPortfolioId,
  timestamp: UnixTimestampMilliseconds,
  candidates: readonly AiStrategyCandidate[],
  allocation: AiStrategyAllocationResult,
  correlationMatrix: AiStrategyCorrelationMatrix,
  regime: AiStrategyRegimeSnapshot,
): void {
  if (portfolioId.trim().length === 0) {
    throw new Error("portfolioId must not be empty.");
  }
  assertFiniteNumber(timestamp, "timestamp");
  if (allocation.portfolioId !== portfolioId) {
    throw new Error("allocation.portfolioId must match portfolioId.");
  }
  if (allocation.timestamp > timestamp) {
    throw new Error("allocation.timestamp must not be later than timestamp.");
  }
  if (correlationMatrix.timestamp > timestamp) {
    throw new Error(
      "correlationMatrix.timestamp must not be later than timestamp.",
    );
  }
  if (regime.timestamp > timestamp) {
    throw new Error("regime.timestamp must not be later than timestamp.");
  }

  const candidateIds = new Set<AiStrategyCandidateId>();
  for (const candidate of candidates) {
    const candidateId = candidate.identity.candidateId;
    if (candidateIds.has(candidateId)) {
      throw new Error(`Duplicate candidateId: ${candidateId}.`);
    }
    candidateIds.add(candidateId);
  }

  const allocationIds = new Set<AiStrategyCandidateId>();
  for (const item of allocation.allocations) {
    if (allocationIds.has(item.candidateId)) {
      throw new Error(`Duplicate allocation candidateId: ${item.candidateId}.`);
    }
    allocationIds.add(item.candidateId);
    assertUnitInterval(item.targetWeight, "allocation.targetWeight");
    assertUnitInterval(item.confidence, "allocation.confidence");
    if (!candidateIds.has(item.candidateId)) {
      throw new Error(
        `Allocation references unknown candidateId: ${item.candidateId}.`,
      );
    }
  }

  assertUnitInterval(regime.confidence, "regime.confidence");
}

function candidateMap(
  candidates: readonly AiStrategyCandidate[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate> {
  return new Map(
    candidates.map((candidate) => [candidate.identity.candidateId, candidate]),
  );
}

function buildContexts(
  candidates: readonly AiStrategyCandidate[],
  allocation: AiStrategyAllocationResult,
  minimumMemberWeight: number,
): readonly MemberContext[] {
  const byId = candidateMap(candidates);
  return freezeArray(
    allocation.allocations
      .filter((item) => item.targetWeight + EPSILON >= minimumMemberWeight)
      .map((item) => {
        const candidate = byId.get(item.candidateId);
        if (candidate === undefined) {
          throw new Error(`Unknown candidateId: ${item.candidateId}.`);
        }
        return Object.freeze({ candidate, allocation: item });
      })
      .sort((left, right) => {
        const weightOrder = right.allocation.targetWeight - left.allocation.targetWeight;
        if (Math.abs(weightOrder) > EPSILON) return weightOrder;
        return compareText(
          left.candidate.identity.candidateId,
          right.candidate.identity.candidateId,
        );
      }),
  );
}

function riskAdjustment(candidate: AiStrategyCandidate): number {
  switch (candidate.classification.riskLevel) {
    case "VERY_LOW":
      return 1;
    case "LOW":
      return 0.9;
    case "MODERATE":
      return 0.75;
    case "HIGH":
      return 0.5;
    case "VERY_HIGH":
      return 0.25;
  }
}

function rawVotingPower(
  context: MemberContext,
  votingMethod: AiStrategyEnsembleVotingMethod,
): number {
  const weight = context.allocation.targetWeight;
  const confidence = context.allocation.confidence;

  switch (votingMethod) {
    case "WEIGHTED_MAJORITY":
      return weight;
    case "CONFIDENCE_WEIGHTED":
      return weight * confidence;
    case "RISK_ADJUSTED":
      return weight * confidence * riskAdjustment(context.candidate);
    case "STACKED_MODEL":
      return weight * (0.5 + confidence * 0.5);
    case "UNANIMOUS":
      return 1;
    case "CUSTOM":
      return weight;
  }
}

function buildMembers(
  contexts: readonly MemberContext[],
  votingMethod: AiStrategyEnsembleVotingMethod,
  precision: number,
): readonly AiStrategyEnsembleMember[] {
  const raw = contexts.map((context) => rawVotingPower(context, votingMethod));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const equalPower = contexts.length === 0 ? 0 : 1 / contexts.length;

  return freezeArray(
    contexts.map((context, index) =>
      Object.freeze({
        candidateId: context.candidate.identity.candidateId,
        strategyId: context.candidate.identity.strategyId,
        strategyInstanceId: context.candidate.identity.strategyInstanceId,
        weight: round(context.allocation.targetWeight, precision),
        votingPower: round(
          total > EPSILON ? raw[index]! / total : equalPower,
          precision,
        ),
        priority: index + 1,
        enabled: context.allocation.targetWeight > EPSILON,
        metadata: freezeMetadata(context.candidate.metadata, context.allocation.metadata, {
          family: context.candidate.classification.family,
          intelligenceType: context.candidate.classification.intelligenceType,
          riskLevel: context.candidate.classification.riskLevel,
          allocationConfidence: context.allocation.confidence,
          allocationScore: context.allocation.score,
        }),
      }),
    ),
  );
}

function sanitizeIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "unknown";
}

function ensembleId(
  portfolioId: AiStrategyPortfolioId,
  scope: string,
): AiStrategyEnsembleId {
  return `ensemble:${sanitizeIdPart(portfolioId)}:${sanitizeIdPart(scope)}`;
}

function buildDefinition(
  portfolioId: AiStrategyPortfolioId,
  name: string,
  scope: string,
  contexts: readonly MemberContext[],
  votingMethod: AiStrategyEnsembleVotingMethod,
  options: NormalizedOptions,
): AiStrategyEnsembleDefinition {
  return Object.freeze({
    ensembleId: ensembleId(portfolioId, scope),
    name,
    votingMethod,
    members: buildMembers(contexts, votingMethod, options.numericalPrecision),
    minimumParticipationWeight: options.minimumParticipationWeight,
    minimumConsensus: options.minimumConsensus,
    conflictResultsInHold: options.conflictResultsInHold,
    metadata: freezeMetadata(options.metadata, {
      portfolioId,
      scope,
      memberCount: contexts.length,
    }),
  });
}

function pairKey(left: AiStrategyCandidateId, right: AiStrategyCandidateId): string {
  return compareText(left, right) <= 0
    ? `${left}\u0000${right}`
    : `${right}\u0000${left}`;
}

function correlationLookup(
  matrix: AiStrategyCorrelationMatrix,
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const pair of matrix.pairs) {
    map.set(
      pairKey(pair.leftCandidateId, pair.rightCandidateId),
      pair.correlation,
    );
  }
  return map;
}

function summarizeCorrelation(
  members: readonly AiStrategyEnsembleMember[],
  matrix: AiStrategyCorrelationMatrix,
  precision: number,
): CorrelationSummary {
  if (members.length < 2) {
    return Object.freeze({
      averageCorrelation: 0,
      diversificationScore: members.length === 1 ? 0.5 : 0,
      knownPairCount: 0,
      totalPairCount: 0,
    });
  }

  const lookup = correlationLookup(matrix);
  let weightedCorrelation = 0;
  let pairWeightTotal = 0;
  let knownPairCount = 0;
  let totalPairCount = 0;

  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      totalPairCount += 1;
      const leftMember = members[left]!;
      const rightMember = members[right]!;
      const correlation = lookup.get(
        pairKey(leftMember.candidateId, rightMember.candidateId),
      );
      if (correlation === undefined) continue;

      knownPairCount += 1;
      const pairWeight = leftMember.weight * rightMember.weight;
      weightedCorrelation += correlation * pairWeight;
      pairWeightTotal += pairWeight;
    }
  }

  const averageCorrelation =
    pairWeightTotal > EPSILON ? weightedCorrelation / pairWeightTotal : 0;
  const diversificationScore = clampUnit((1 - averageCorrelation) / 2);

  return Object.freeze({
    averageCorrelation: round(averageCorrelation, precision),
    diversificationScore: round(diversificationScore, precision),
    knownPairCount,
    totalPairCount,
  });
}

function weightedMemberMetric(
  members: readonly AiStrategyEnsembleMember[],
  allocationById: ReadonlyMap<AiStrategyCandidateId, AiStrategyTargetAllocation>,
  selector: (allocation: AiStrategyTargetAllocation) => number,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const member of members) {
    const allocation = allocationById.get(member.candidateId);
    if (allocation === undefined) continue;
    weighted += selector(allocation) * member.weight;
    totalWeight += member.weight;
  }
  return totalWeight > EPSILON ? weighted / totalWeight : 0;
}

function candidateRegimeFitness(
  candidate: AiStrategyCandidate,
  regime: AiStrategyRegimeSnapshot,
): number {
  if (candidate.compatibility.excludedRegimes.includes(regime.primaryRegime)) {
    return 0;
  }
  if (candidate.compatibility.supportedRegimes.length === 0) {
    return 0.5 * regime.confidence;
  }
  if (candidate.compatibility.supportedRegimes.includes(regime.primaryRegime)) {
    return regime.confidence;
  }

  const probabilityByRegime = new Map(
    regime.probabilities.map((entry) => [entry.regime, entry.probability]),
  );
  const supportedProbability = candidate.compatibility.supportedRegimes.reduce(
    (total, supportedRegime) =>
      total + (probabilityByRegime.get(supportedRegime) ?? 0),
    0,
  );
  return clampUnit(supportedProbability);
}

function weightedRegimeFitness(
  definition: AiStrategyEnsembleDefinition,
  candidatesById: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
  regime: AiStrategyRegimeSnapshot,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const member of definition.members) {
    const candidate = candidatesById.get(member.candidateId);
    if (candidate === undefined) continue;
    weighted += candidateRegimeFitness(candidate, regime) * member.weight;
    totalWeight += member.weight;
  }
  return totalWeight > EPSILON ? weighted / totalWeight : 0;
}

function assessDefinition(
  definition: AiStrategyEnsembleDefinition,
  timestamp: UnixTimestampMilliseconds,
  candidatesById: ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate>,
  allocation: AiStrategyAllocationResult,
  correlationMatrix: AiStrategyCorrelationMatrix,
  regime: AiStrategyRegimeSnapshot,
  minimumMembers: number,
  options: NormalizedOptions,
): AiStrategyEnsembleAssessment {
  const allocationById = new Map(
    allocation.allocations.map((item) => [item.candidateId, item]),
  );
  const enabledMembers = definition.members.filter((member) => member.enabled);
  const participationWeight = enabledMembers.reduce(
    (sum, member) => sum + member.weight,
    0,
  );
  const expectedConfidence = weightedMemberMetric(
    enabledMembers,
    allocationById,
    (item) => item.confidence,
  );
  const correlation = summarizeCorrelation(
    enabledMembers,
    correlationMatrix,
    options.numericalPrecision,
  );
  const regimeFitness = weightedRegimeFitness(
    definition,
    candidatesById,
    regime,
  );

  const reasons: string[] = [];
  if (enabledMembers.length < minimumMembers) {
    reasons.push(
      `Ensemble requires at least ${minimumMembers} enabled member(s).`,
    );
  }
  if (participationWeight + EPSILON < definition.minimumParticipationWeight) {
    reasons.push("Enabled member weight is below the participation threshold.");
  }
  if (expectedConfidence + EPSILON < options.minimumExpectedConfidence) {
    reasons.push("Expected member confidence is below the configured minimum.");
  }
  if (
    correlation.averageCorrelation - EPSILON >
    options.maximumAcceptableCorrelation
  ) {
    reasons.push("Average member correlation exceeds the configured maximum.");
  }
  if (
    correlation.diversificationScore + EPSILON <
    options.minimumDiversificationScore
  ) {
    reasons.push("Ensemble diversification is below the configured minimum.");
  }
  if (regimeFitness + EPSILON < options.minimumRegimeFitness) {
    reasons.push("Ensemble regime fitness is below the configured minimum.");
  }
  if (
    correlation.totalPairCount > 0 &&
    correlation.knownPairCount < correlation.totalPairCount
  ) {
    reasons.push("Correlation data is incomplete for one or more member pairs.");
  }

  return Object.freeze({
    ensembleId: definition.ensembleId,
    timestamp,
    diversificationScore: correlation.diversificationScore,
    expectedConfidence: round(
      clampUnit(expectedConfidence),
      options.numericalPrecision,
    ),
    ...(allocation.expectedPortfolioVolatility !== undefined
      ? {
          expectedVolatility: round(
            allocation.expectedPortfolioVolatility,
            options.numericalPrecision,
          ),
        }
      : {}),
    ...(allocation.expectedPortfolioDrawdown !== undefined
      ? {
          expectedDrawdown: round(
            allocation.expectedPortfolioDrawdown,
            options.numericalPrecision,
          ),
        }
      : {}),
    averageCorrelation: correlation.averageCorrelation,
    regimeFitness: round(clampUnit(regimeFitness), options.numericalPrecision),
    valid: reasons.length === 0,
    reasons: freezeStrings(reasons),
    metadata: freezeMetadata(definition.metadata, options.metadata, {
      enabledMemberCount: enabledMembers.length,
      participationWeight: round(
        participationWeight,
        options.numericalPrecision,
      ),
      knownCorrelationPairCount: correlation.knownPairCount,
      totalCorrelationPairCount: correlation.totalPairCount,
      primaryRegime: regime.primaryRegime,
      regimeConfidence: regime.confidence,
    }),
  });
}

function groupByFamily(
  contexts: readonly MemberContext[],
): ReadonlyMap<AiStrategyFamily, readonly MemberContext[]> {
  const groups = new Map<AiStrategyFamily, MemberContext[]>();
  for (const context of contexts) {
    const family = context.candidate.classification.family;
    const group = groups.get(family) ?? [];
    group.push(context);
    groups.set(family, group);
  }
  return new Map(
    [...groups.entries()].map(([family, members]) => [
      family,
      freezeArray(members),
    ]),
  );
}

export class StrategyEnsembleManager implements AiStrategyEnsembleManagerPort {
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyEnsembleManagerOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public build(
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    allocation: AiStrategyAllocationResult,
    correlationMatrix: AiStrategyCorrelationMatrix,
    regime: AiStrategyRegimeSnapshot,
  ): {
    readonly ensembles: readonly AiStrategyEnsembleDefinition[];
    readonly assessments: readonly AiStrategyEnsembleAssessment[];
  } {
    validateInputs(
      portfolioId,
      timestamp,
      candidates,
      allocation,
      correlationMatrix,
      regime,
    );

    const contexts = buildContexts(
      candidates,
      allocation,
      this.options.minimumMemberWeight,
    );
    const candidatesById = candidateMap(candidates);
    const definitions: AiStrategyEnsembleDefinition[] = [];
    const minimumMembersById = new Map<AiStrategyEnsembleId, number>();

    if (contexts.length > 0) {
      const portfolioDefinition = buildDefinition(
        portfolioId,
        `${portfolioId} Strategy Ensemble`,
        "portfolio",
        contexts,
        this.options.votingMethod,
        this.options,
      );
      definitions.push(portfolioDefinition);
      minimumMembersById.set(
        portfolioDefinition.ensembleId,
        this.options.minimumMembers,
      );
    }

    if (this.options.createFamilyEnsembles) {
      const familyGroups = [...groupByFamily(contexts).entries()]
        .filter(
          ([, members]) =>
            members.length >= this.options.minimumFamilyEnsembleMembers,
        )
        .sort(([leftFamily, leftMembers], [rightFamily, rightMembers]) => {
          const leftWeight = leftMembers.reduce(
            (sum, member) => sum + member.allocation.targetWeight,
            0,
          );
          const rightWeight = rightMembers.reduce(
            (sum, member) => sum + member.allocation.targetWeight,
            0,
          );
          if (Math.abs(rightWeight - leftWeight) > EPSILON) {
            return rightWeight - leftWeight;
          }
          return compareText(leftFamily, rightFamily);
        })
        .slice(0, this.options.maximumFamilyEnsembles);

      for (const [family, members] of familyGroups) {
        const definition = buildDefinition(
          portfolioId,
          `${family.replace(/_/g, " ")} Strategy Ensemble`,
          `family:${family}`,
          members,
          this.options.familyVotingMethod,
          this.options,
        );
        definitions.push(definition);
        minimumMembersById.set(
          definition.ensembleId,
          this.options.minimumFamilyEnsembleMembers,
        );
      }
    }

    const ensembles = freezeArray(definitions);
    const assessments = freezeArray(
      ensembles.map((definition) =>
        assessDefinition(
          definition,
          timestamp,
          candidatesById,
          allocation,
          correlationMatrix,
          regime,
          minimumMembersById.get(definition.ensembleId) ?? 1,
          this.options,
        ),
      ),
    );

    return Object.freeze({ ensembles, assessments });
  }
}

export function createStrategyEnsembleManager(
  options: StrategyEnsembleManagerOptions = {},
): StrategyEnsembleManager {
  return new StrategyEnsembleManager(options);
}