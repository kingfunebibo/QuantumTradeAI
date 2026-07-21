/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-opportunity-ranking-engine.ts
 *
 * Purpose:
 * Production-grade, deterministic, immutable ranking of institutional
 * arbitrage opportunities using policy-aware scores and risk assessments.
 */

import {
  type ArbitrageEvaluationPolicy,
  type ArbitrageId,
  type ArbitrageOpportunityScoreBreakdown,
  type ArbitrageRankedOpportunity,
  type ArbitrageRiskAssessment,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageOpportunity,
  type InstitutionalArbitrageOpportunityRanker,
} from "./institutional-arbitrage-contracts";
import {
  ArbitrageOpportunityScoringEngine,
  type ArbitrageOpportunityScoringEngineOptions,
  type ArbitragePortfolioDiversificationContext,
} from "./arbitrage-opportunity-scoring-engine";
import {
  assertArbitrageEvaluationPolicy,
  assertInstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;

export type ArbitrageOpportunityRankingTieBreaker =
  | "STRESSED_NET_PROFIT"
  | "EXPECTED_NET_PROFIT"
  | "NET_RETURN_PERCENTAGE"
  | "PROFITABILITY_SCORE"
  | "RISK_ADJUSTED_SCORE"
  | "LOWEST_RISK_SCORE"
  | "HIGHEST_CONFIDENCE"
  | "EARLIEST_EXPIRY"
  | "EARLIEST_DISCOVERY"
  | "LOWEST_CAPITAL"
  | "OPPORTUNITY_ID";

export const DEFAULT_ARBITRAGE_RANKING_TIE_BREAKERS =
  Object.freeze([
    "STRESSED_NET_PROFIT",
    "EXPECTED_NET_PROFIT",
    "NET_RETURN_PERCENTAGE",
    "PROFITABILITY_SCORE",
    "RISK_ADJUSTED_SCORE",
    "LOWEST_RISK_SCORE",
    "HIGHEST_CONFIDENCE",
    "EARLIEST_EXPIRY",
    "EARLIEST_DISCOVERY",
    "LOWEST_CAPITAL",
    "OPPORTUNITY_ID",
  ] as const satisfies readonly ArbitrageOpportunityRankingTieBreaker[]);

export interface ArbitrageOpportunityRankingEngineOptions {
  readonly scoringOptions?: ArbitrageOpportunityScoringEngineOptions;
  readonly tieBreakers?: readonly ArbitrageOpportunityRankingTieBreaker[];
  readonly decimalPlaces?: number;
  readonly validateInputs?: boolean;
  readonly excludeExpired?: boolean;
  readonly excludeRiskRejected?: boolean;
  readonly excludeBlockingRiskFindings?: boolean;
  readonly minimumFinalScore?: number;
  readonly maximumResults?: number;
}

export interface ArbitrageOpportunityRankingRequest {
  readonly opportunities: readonly InstitutionalArbitrageOpportunity[];
  readonly riskAssessments:
    | ReadonlyMap<ArbitrageId, ArbitrageRiskAssessment>
    | Readonly<Record<ArbitrageId, ArbitrageRiskAssessment>>;
  readonly rankedAt: ArbitrageTimestamp;
  readonly policy?: ArbitrageEvaluationPolicy;
  readonly diversificationContext?: ArbitragePortfolioDiversificationContext;
  readonly precomputedScores?:
    | ReadonlyMap<ArbitrageId, ArbitrageOpportunityScoreBreakdown>
    | Readonly<Record<ArbitrageId, ArbitrageOpportunityScoreBreakdown>>;
  readonly maximumResults?: number;
}

export interface ArbitrageOpportunityRankingExclusion {
  readonly opportunityId: ArbitrageId;
  readonly reasons: readonly string[];
}

export interface ArbitrageOpportunityRankingResult {
  readonly rankedOpportunities: readonly ArbitrageRankedOpportunity[];
  readonly exclusions: readonly ArbitrageOpportunityRankingExclusion[];
  readonly rankedAt: ArbitrageTimestamp;
  readonly inputCount: number;
  readonly eligibleCount: number;
}

export interface ArbitrageOpportunityRankingSummary {
  readonly totalRanked: number;
  readonly highestScore?: number;
  readonly lowestScore?: number;
  readonly averageScore?: number;
  readonly totalExpectedNetProfit: number;
  readonly totalStressedNetProfit: number;
  readonly approvedRiskCount: number;
  readonly rejectedRiskCount: number;
}

export type ArbitrageOpportunityRankingErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_TIMESTAMP"
  | "INVALID_DECIMAL_PLACES"
  | "INVALID_MAXIMUM_RESULTS"
  | "DUPLICATE_OPPORTUNITY"
  | "MISSING_RISK_ASSESSMENT"
  | "RISK_ASSESSMENT_MISMATCH"
  | "INVALID_PRECOMPUTED_SCORE"
  | "DUPLICATE_TIE_BREAKER";

export class ArbitrageOpportunityRankingError extends Error {
  public readonly code: ArbitrageOpportunityRankingErrorCode;

  public constructor(
    code: ArbitrageOpportunityRankingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageOpportunityRankingError";
    this.code = code;
  }
}

interface NormalizedRankingOptions {
  readonly tieBreakers: readonly ArbitrageOpportunityRankingTieBreaker[];
  readonly decimalPlaces: number;
  readonly validateInputs: boolean;
  readonly excludeExpired: boolean;
  readonly excludeRiskRejected: boolean;
  readonly excludeBlockingRiskFindings: boolean;
  readonly minimumFinalScore: number;
  readonly maximumResults?: number;
}

interface RankingCandidate {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly riskAssessment: ArbitrageRiskAssessment;
  readonly score: ArbitrageOpportunityScoreBreakdown;
}

const DEFAULT_OPTIONS: Omit<
  NormalizedRankingOptions,
  "tieBreakers"
> = Object.freeze({
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  validateInputs: true,
  excludeExpired: true,
  excludeRiskRejected: false,
  excludeBlockingRiskFindings: false,
  minimumFinalScore: 0,
  maximumResults: undefined,
});

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(
    value as Record<string, unknown>,
  )) {
    deepFreeze(nestedValue);
  }

  return value;
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new ArbitrageOpportunityRankingError(
      "INVALID_ARGUMENT",
      `${field} must be a finite number.`,
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ArbitrageOpportunityRankingError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function assertDecimalPlaces(value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageOpportunityRankingError(
      "INVALID_DECIMAL_PLACES",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }
}

function assertMaximumResults(
  value: number | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value <= 0)
  ) {
    throw new ArbitrageOpportunityRankingError(
      "INVALID_MAXIMUM_RESULTS",
      `${field} must be a positive integer when provided.`,
    );
  }
}

function roundDeterministically(
  value: number,
  decimalPlaces: number,
): number {
  assertFinite(value, "value");
  const factor = 10 ** decimalPlaces;
  const rounded =
    Math.round((value + Number.EPSILON) * factor) / factor;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeTieBreakers(
  tieBreakers:
    | readonly ArbitrageOpportunityRankingTieBreaker[]
    | undefined,
): readonly ArbitrageOpportunityRankingTieBreaker[] {
  const resolved =
    tieBreakers ?? DEFAULT_ARBITRAGE_RANKING_TIE_BREAKERS;

  const seen = new Set<ArbitrageOpportunityRankingTieBreaker>();

  for (const tieBreaker of resolved) {
    if (seen.has(tieBreaker)) {
      throw new ArbitrageOpportunityRankingError(
        "DUPLICATE_TIE_BREAKER",
        `Duplicate ranking tie-breaker: ${tieBreaker}.`,
      );
    }

    seen.add(tieBreaker);
  }

  const withStableId =
    seen.has("OPPORTUNITY_ID")
      ? [...resolved]
      : [...resolved, "OPPORTUNITY_ID" as const];

  return Object.freeze(withStableId);
}

function normalizeOptions(
  options: ArbitrageOpportunityRankingEngineOptions | undefined,
): NormalizedRankingOptions {
  const decimalPlaces =
    options?.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces;
  const minimumFinalScore =
    options?.minimumFinalScore ??
    DEFAULT_OPTIONS.minimumFinalScore;
  const maximumResults =
    options?.maximumResults ?? DEFAULT_OPTIONS.maximumResults;

  assertDecimalPlaces(decimalPlaces);
  assertFinite(minimumFinalScore, "minimumFinalScore");
  assertMaximumResults(maximumResults, "maximumResults");

  return deepFreeze({
    tieBreakers: normalizeTieBreakers(options?.tieBreakers),
    decimalPlaces,
    validateInputs:
      options?.validateInputs ?? DEFAULT_OPTIONS.validateInputs,
    excludeExpired:
      options?.excludeExpired ?? DEFAULT_OPTIONS.excludeExpired,
    excludeRiskRejected:
      options?.excludeRiskRejected ??
      DEFAULT_OPTIONS.excludeRiskRejected,
    excludeBlockingRiskFindings:
      options?.excludeBlockingRiskFindings ??
      DEFAULT_OPTIONS.excludeBlockingRiskFindings,
    minimumFinalScore,
    ...(maximumResults === undefined ? {} : { maximumResults }),
  });
}

function getByOpportunityId<T>(
  source:
    | ReadonlyMap<ArbitrageId, T>
    | Readonly<Record<ArbitrageId, T>>,
  opportunityId: ArbitrageId,
): T | undefined {
  if (source instanceof Map) {
    return source.get(opportunityId);
  }

  const recordSource =
    source as Readonly<Record<ArbitrageId, T>>;

  return recordSource[opportunityId];
}

function assertScoreBreakdown(
  score: ArbitrageOpportunityScoreBreakdown,
  opportunityId: ArbitrageId,
): void {
  const entries = Object.entries(score);

  for (const [field, value] of entries) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new ArbitrageOpportunityRankingError(
        "INVALID_PRECOMPUTED_SCORE",
        `Precomputed score ${opportunityId}.${field} must be between 0 and 100.`,
      );
    }
  }
}

function validateUniqueOpportunities(
  opportunities: readonly InstitutionalArbitrageOpportunity[],
): void {
  const seen = new Set<ArbitrageId>();

  for (const opportunity of opportunities) {
    if (seen.has(opportunity.opportunityId)) {
      throw new ArbitrageOpportunityRankingError(
        "DUPLICATE_OPPORTUNITY",
        `Duplicate opportunityId: ${opportunity.opportunityId}.`,
      );
    }

    seen.add(opportunity.opportunityId);
  }
}

function resolveMaximumResults(
  requestValue: number | undefined,
  optionValue: number | undefined,
): number | undefined {
  const resolved = requestValue ?? optionValue;
  assertMaximumResults(resolved, "maximumResults");
  return resolved;
}

function buildExclusionReasons(
  opportunity: InstitutionalArbitrageOpportunity,
  riskAssessment: ArbitrageRiskAssessment,
  score: ArbitrageOpportunityScoreBreakdown,
  rankedAt: ArbitrageTimestamp,
  options: NormalizedRankingOptions,
): readonly string[] {
  const reasons: string[] = [];

  if (
    options.excludeExpired &&
    rankedAt >= opportunity.expiresAt
  ) {
    reasons.push("Opportunity is expired.");
  }

  if (
    options.excludeRiskRejected &&
    !riskAssessment.approved
  ) {
    reasons.push("Risk assessment rejected the opportunity.");
  }

  if (
    options.excludeBlockingRiskFindings &&
    riskAssessment.findings.some(
      (finding) => finding.blocking,
    )
  ) {
    reasons.push("Blocking risk findings are present.");
  }

  if (score.finalScore < options.minimumFinalScore) {
    reasons.push(
      `Final score ${score.finalScore} is below minimum ${options.minimumFinalScore}.`,
    );
  }

  return Object.freeze(reasons);
}

function compareDescending(
  left: number,
  right: number,
): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

function compareAscending(
  left: number,
  right: number,
): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareByTieBreaker(
  left: RankingCandidate,
  right: RankingCandidate,
  tieBreaker: ArbitrageOpportunityRankingTieBreaker,
): number {
  switch (tieBreaker) {
    case "STRESSED_NET_PROFIT":
      return compareDescending(
        left.opportunity.profitEstimate.stressedNetProfit,
        right.opportunity.profitEstimate.stressedNetProfit,
      );

    case "EXPECTED_NET_PROFIT":
      return compareDescending(
        left.opportunity.profitEstimate.expectedNetProfit,
        right.opportunity.profitEstimate.expectedNetProfit,
      );

    case "NET_RETURN_PERCENTAGE":
      return compareDescending(
        left.opportunity.profitEstimate.netReturnPercentage,
        right.opportunity.profitEstimate.netReturnPercentage,
      );

    case "PROFITABILITY_SCORE":
      return compareDescending(
        left.score.profitabilityScore,
        right.score.profitabilityScore,
      );

    case "RISK_ADJUSTED_SCORE":
      return compareDescending(
        left.score.riskAdjustedScore,
        right.score.riskAdjustedScore,
      );

    case "LOWEST_RISK_SCORE":
      return compareAscending(
        left.riskAssessment.overallRiskScore,
        right.riskAssessment.overallRiskScore,
      );

    case "HIGHEST_CONFIDENCE":
      return compareDescending(
        left.opportunity.confidence,
        right.opportunity.confidence,
      );

    case "EARLIEST_EXPIRY":
      return compareAscending(
        left.opportunity.expiresAt,
        right.opportunity.expiresAt,
      );

    case "EARLIEST_DISCOVERY":
      return compareAscending(
        left.opportunity.discoveredAt,
        right.opportunity.discoveredAt,
      );

    case "LOWEST_CAPITAL":
      return compareAscending(
        left.opportunity.requestedCapital,
        right.opportunity.requestedCapital,
      );

    case "OPPORTUNITY_ID":
      return left.opportunity.opportunityId.localeCompare(
        right.opportunity.opportunityId,
      );

    default: {
      const exhaustiveCheck: never = tieBreaker;
      throw new ArbitrageOpportunityRankingError(
        "INVALID_ARGUMENT",
        `Unsupported tie-breaker: ${String(exhaustiveCheck)}.`,
      );
    }
  }
}

function compareCandidates(
  left: RankingCandidate,
  right: RankingCandidate,
  tieBreakers: readonly ArbitrageOpportunityRankingTieBreaker[],
): number {
  const finalScoreComparison = compareDescending(
    left.score.finalScore,
    right.score.finalScore,
  );

  if (finalScoreComparison !== 0) {
    return finalScoreComparison;
  }

  for (const tieBreaker of tieBreakers) {
    const result = compareByTieBreaker(
      left,
      right,
      tieBreaker,
    );

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

function describeRankReason(
  candidate: RankingCandidate,
  previous: RankingCandidate | undefined,
  rank: number,
  decimalPlaces: number,
): string {
  const finalScore = roundDeterministically(
    candidate.score.finalScore,
    decimalPlaces,
  );

  if (rank === 1 || previous === undefined) {
    return (
      `Ranked first with final score ${finalScore}, ` +
      `expected net profit ${candidate.opportunity.profitEstimate.expectedNetProfit} ` +
      `${candidate.opportunity.reportingAsset}, stressed net profit ` +
      `${candidate.opportunity.profitEstimate.stressedNetProfit}, and risk score ` +
      `${candidate.riskAssessment.overallRiskScore}.`
    );
  }

  const scoreDifference = roundDeterministically(
    previous.score.finalScore - candidate.score.finalScore,
    decimalPlaces,
  );

  if (scoreDifference > 0) {
    return (
      `Ranked ${rank} with final score ${finalScore}, ` +
      `${scoreDifference} below rank ${rank - 1}; expected net return ` +
      `${candidate.opportunity.profitEstimate.netReturnPercentage}% and risk score ` +
      `${candidate.riskAssessment.overallRiskScore}.`
    );
  }

  return (
    `Ranked ${rank} after deterministic tie-breaking at final score ` +
    `${finalScore}; stressed net profit ` +
    `${candidate.opportunity.profitEstimate.stressedNetProfit}, confidence ` +
    `${candidate.opportunity.confidence}, and opportunity ID ` +
    `${candidate.opportunity.opportunityId}.`
  );
}

function cloneOpportunity(
  opportunity: InstitutionalArbitrageOpportunity,
): InstitutionalArbitrageOpportunity {
  return deepFreeze({
    ...opportunity,
    accountIds: [...opportunity.accountIds],
    legs: [...opportunity.legs],
    transfers: [...opportunity.transfers],
    metadata: { ...opportunity.metadata },
  }) as InstitutionalArbitrageOpportunity;
}

function cloneRiskAssessment(
  assessment: ArbitrageRiskAssessment,
): ArbitrageRiskAssessment {
  return deepFreeze({
    ...assessment,
    findings: assessment.findings.map((finding) => ({
      ...finding,
      affectedLegIds: [...finding.affectedLegIds],
      metadata: { ...finding.metadata },
    })),
    rejectionCodes: [...assessment.rejectionCodes],
    metadata: { ...assessment.metadata },
  });
}

function cloneScore(
  score: ArbitrageOpportunityScoreBreakdown,
): ArbitrageOpportunityScoreBreakdown {
  return deepFreeze({ ...score });
}

export class ArbitrageOpportunityRankingEngine
  implements InstitutionalArbitrageOpportunityRanker
{
  private readonly options: NormalizedRankingOptions;
  private readonly scoringEngine: ArbitrageOpportunityScoringEngine;

  public constructor(
    options?: ArbitrageOpportunityRankingEngineOptions,
  ) {
    this.options = normalizeOptions(options);
    this.scoringEngine =
      new ArbitrageOpportunityScoringEngine(
        options?.scoringOptions,
      );
  }

  public getOptions(): Readonly<NormalizedRankingOptions> {
    return this.options;
  }

  public rank(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    riskAssessments: ReadonlyMap<
      ArbitrageId,
      ArbitrageRiskAssessment
    >,
    rankedAt: ArbitrageTimestamp,
  ): readonly ArbitrageRankedOpportunity[] {
    return this.rankDetailed({
      opportunities,
      riskAssessments,
      rankedAt,
    }).rankedOpportunities;
  }

  public rankDetailed(
    request: ArbitrageOpportunityRankingRequest,
  ): ArbitrageOpportunityRankingResult {
    assertTimestamp(request.rankedAt, "rankedAt");
    validateUniqueOpportunities(request.opportunities);

    if (
      this.options.validateInputs &&
      request.policy !== undefined
    ) {
      assertArbitrageEvaluationPolicy(request.policy);
    }

    const candidates: RankingCandidate[] = [];
    const exclusions: ArbitrageOpportunityRankingExclusion[] =
      [];

    for (const opportunity of request.opportunities) {
      if (this.options.validateInputs) {
        assertInstitutionalArbitrageOpportunity(
          opportunity,
          request.rankedAt,
        );
      }

      const riskAssessment = getByOpportunityId(
        request.riskAssessments,
        opportunity.opportunityId,
      );

      if (riskAssessment === undefined) {
        throw new ArbitrageOpportunityRankingError(
          "MISSING_RISK_ASSESSMENT",
          `Missing risk assessment for opportunity ${opportunity.opportunityId}.`,
        );
      }

      if (
        riskAssessment.opportunityId !==
        opportunity.opportunityId
      ) {
        throw new ArbitrageOpportunityRankingError(
          "RISK_ASSESSMENT_MISMATCH",
          `Risk assessment ${riskAssessment.opportunityId} does not match opportunity ${opportunity.opportunityId}.`,
        );
      }

      const precomputedScore =
        request.precomputedScores === undefined
          ? undefined
          : getByOpportunityId(
              request.precomputedScores,
              opportunity.opportunityId,
            );

      if (precomputedScore !== undefined) {
        assertScoreBreakdown(
          precomputedScore,
          opportunity.opportunityId,
        );
      }

      const score =
        precomputedScore ??
        this.scoringEngine.score({
          opportunity,
          riskAssessment,
          policy: request.policy,
          scoredAt: request.rankedAt,
          diversificationContext:
            request.diversificationContext,
        });

      const exclusionReasons = buildExclusionReasons(
        opportunity,
        riskAssessment,
        score,
        request.rankedAt,
        this.options,
      );

      if (exclusionReasons.length > 0) {
        exclusions.push(
          deepFreeze({
            opportunityId: opportunity.opportunityId,
            reasons: exclusionReasons,
          }),
        );
        continue;
      }

      candidates.push(
        deepFreeze({
          opportunity,
          riskAssessment,
          score,
        }),
      );
    }

    candidates.sort((left, right) =>
      compareCandidates(
        left,
        right,
        this.options.tieBreakers,
      ),
    );

    const maximumResults = resolveMaximumResults(
      request.maximumResults,
      this.options.maximumResults,
    );

    const selected =
      maximumResults === undefined
        ? candidates
        : candidates.slice(0, maximumResults);

    const rankedOpportunities =
      selected.map((candidate, index) => {
        const rank = index + 1;
        const previous =
          index === 0 ? undefined : selected[index - 1];

        return deepFreeze({
          rank,
          opportunity: cloneOpportunity(
            candidate.opportunity,
          ),
          score: cloneScore(candidate.score),
          riskAssessment: cloneRiskAssessment(
            candidate.riskAssessment,
          ),
          rankReason: describeRankReason(
            candidate,
            previous,
            rank,
            this.options.decimalPlaces,
          ),
          rankedAt: request.rankedAt,
        });
      });

    return deepFreeze({
      rankedOpportunities,
      exclusions: exclusions.sort((left, right) =>
        left.opportunityId.localeCompare(
          right.opportunityId,
        ),
      ),
      rankedAt: request.rankedAt,
      inputCount: request.opportunities.length,
      eligibleCount: candidates.length,
    });
  }

  public summarize(
    rankedOpportunities: readonly ArbitrageRankedOpportunity[],
  ): ArbitrageOpportunityRankingSummary {
    if (rankedOpportunities.length === 0) {
      return deepFreeze({
        totalRanked: 0,
        totalExpectedNetProfit: 0,
        totalStressedNetProfit: 0,
        approvedRiskCount: 0,
        rejectedRiskCount: 0,
      });
    }

    const scores = rankedOpportunities.map(
      (ranked) => ranked.score.finalScore,
    );

    const totalExpectedNetProfit =
      rankedOpportunities.reduce(
        (total, ranked) =>
          total +
          ranked.opportunity.profitEstimate
            .expectedNetProfit,
        0,
      );

    const totalStressedNetProfit =
      rankedOpportunities.reduce(
        (total, ranked) =>
          total +
          ranked.opportunity.profitEstimate
            .stressedNetProfit,
        0,
      );

    const approvedRiskCount =
      rankedOpportunities.filter(
        (ranked) => ranked.riskAssessment.approved,
      ).length;

    return deepFreeze({
      totalRanked: rankedOpportunities.length,
      highestScore: roundDeterministically(
        Math.max(...scores),
        this.options.decimalPlaces,
      ),
      lowestScore: roundDeterministically(
        Math.min(...scores),
        this.options.decimalPlaces,
      ),
      averageScore: roundDeterministically(
        scores.reduce((sum, score) => sum + score, 0) /
          scores.length,
        this.options.decimalPlaces,
      ),
      totalExpectedNetProfit:
        roundDeterministically(
          totalExpectedNetProfit,
          this.options.decimalPlaces,
        ),
      totalStressedNetProfit:
        roundDeterministically(
          totalStressedNetProfit,
          this.options.decimalPlaces,
        ),
      approvedRiskCount,
      rejectedRiskCount:
        rankedOpportunities.length -
        approvedRiskCount,
    });
  }

  public selectTop(
    rankedOpportunities: readonly ArbitrageRankedOpportunity[],
    count: number,
  ): readonly ArbitrageRankedOpportunity[] {
    assertMaximumResults(count, "count");

    return deepFreeze(
      rankedOpportunities
        .slice()
        .sort((left, right) => {
          if (left.rank !== right.rank) {
            return left.rank - right.rank;
          }

          return left.opportunity.opportunityId.localeCompare(
            right.opportunity.opportunityId,
          );
        })
        .slice(0, count),
    );
  }
}

export function createArbitrageOpportunityRankingEngine(
  options?: ArbitrageOpportunityRankingEngineOptions,
): ArbitrageOpportunityRankingEngine {
  return new ArbitrageOpportunityRankingEngine(options);
}

export function rankArbitrageOpportunities(
  request: ArbitrageOpportunityRankingRequest,
  options?: ArbitrageOpportunityRankingEngineOptions,
): ArbitrageOpportunityRankingResult {
  return createArbitrageOpportunityRankingEngine(
    options,
  ).rankDetailed(request);
}