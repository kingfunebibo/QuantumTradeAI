/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic cross-DEX arbitrage opportunity ranking.
 *
 * Responsibilities:
 * - Validate and normalize detected opportunities before ranking.
 * - Score profitability, confidence, freshness, gas efficiency, funding risk,
 *   route complexity, quote quality, and execution readiness.
 * - Deduplicate equivalent routes and optionally cap concentration by token,
 *   DEX, pool, funding mode, or chain.
 * - Produce immutable ranked results with stable deterministic tie-breaking.
 * - Support caller-supplied scoring weights and hard eligibility constraints.
 *
 * This module performs no RPC, wallet, filesystem, timer, or background access.
 */

import {
  type ArbitrageFundingMode,
  ArbitrageFundingMode as FundingMode,
  type ArbitrageOpportunity,
  type ArbitrageOpportunityId,
  ArbitrageOpportunityStatus,
  type ArbitrageRouteType,
  type BasisPoints,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexId,
  type PoolId,
  type TokenAmount,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
  ValidationSeverity,
} from "./cross-dex-arbitrage-contracts";

const BASIS_POINTS_DENOMINATOR = 10_000;
const DEFAULT_MAXIMUM_AGE_MILLISECONDS = 10_000;
const DEFAULT_MAXIMUM_ROUTE_LEGS = 4;
const DEFAULT_MAXIMUM_RESULTS = 100;
const SCORE_SCALE = 1_000_000;

export enum OpportunityRankingErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_OPPORTUNITY = "INVALID_OPPORTUNITY",
  INVALID_WEIGHT = "INVALID_WEIGHT",
  INVALID_LIMIT = "INVALID_LIMIT",
  NO_ELIGIBLE_OPPORTUNITY = "NO_ELIGIBLE_OPPORTUNITY",
}

export class OpportunityRankingError extends Error {
  public readonly code: OpportunityRankingErrorCode;
  public readonly opportunityId?: ArbitrageOpportunityId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;

  public constructor(
    code: OpportunityRankingErrorCode,
    message: string,
    options: Readonly<{
      opportunityId?: ArbitrageOpportunityId;
      chainId?: ChainId;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "OpportunityRankingError";
    this.code = code;
    this.opportunityId = options.opportunityId;
    this.chainId = options.chainId;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface OpportunityRankingClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface OpportunityRankingWeights {
  readonly netProfitAmount: number;
  readonly netProfitBasisPoints: number;
  readonly grossProfitBasisPoints: number;
  readonly confidence: number;
  readonly freshness: number;
  readonly gasEfficiency: number;
  readonly routeSimplicity: number;
  readonly atomicity: number;
  readonly fundingSafety: number;
  readonly validationQuality: number;
  readonly executionHeadroom: number;
}

export interface OpportunityRankingThresholds {
  readonly minimumNetProfitAmount?: TokenAmount;
  readonly minimumNetProfitBasisPoints?: BasisPoints;
  readonly minimumGrossProfitBasisPoints?: BasisPoints;
  readonly minimumConfidence?: number;
  readonly maximumAgeMilliseconds?: number;
  readonly minimumRemainingLifetimeMilliseconds?: number;
  readonly maximumRouteLegs?: number;
  readonly maximumGasCostUsd?: number;
  readonly maximumTotalEstimatedCostUsd?: number;
  readonly requireProfitable?: boolean;
  readonly requireAtomic?: boolean;
  readonly requireValidStatus?: boolean;
  readonly rejectValidationErrors?: boolean;
  readonly allowedFundingModes?: readonly ArbitrageFundingMode[];
  readonly allowedRouteTypes?: readonly ArbitrageRouteType[];
  readonly allowedChainIds?: readonly ChainId[];
}

export interface OpportunityRankingConcentrationLimits {
  readonly maximumPerChain?: number;
  readonly maximumPerInputToken?: number;
  readonly maximumPerDex?: number;
  readonly maximumPerPool?: number;
  readonly maximumPerFundingMode?: number;
  readonly maximumEquivalentRoutes?: number;
}

export interface OpportunityRankingOptions {
  readonly weights?: Partial<OpportunityRankingWeights>;
  readonly thresholds?: OpportunityRankingThresholds;
  readonly concentrationLimits?: OpportunityRankingConcentrationLimits;
  readonly maximumResults?: number;
  readonly deduplicateEquivalentRoutes?: boolean;
  readonly preferEarlierDetectionOnTie?: boolean;
  readonly preferEarlierExpiryOnTie?: boolean;
  readonly rejectFutureDetectionTimestamps?: boolean;
  readonly includeRejectedOpportunities?: boolean;
  readonly normalizeProfitAmountByInput?: boolean;
}

export interface OpportunityRankingRequest {
  readonly opportunities: readonly ArbitrageOpportunity[];
  readonly nowMilliseconds?: UnixTimestampMilliseconds;
  readonly maximumResults?: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface OpportunityRankingComponentScores {
  readonly netProfitAmount: number;
  readonly netProfitBasisPoints: number;
  readonly grossProfitBasisPoints: number;
  readonly confidence: number;
  readonly freshness: number;
  readonly gasEfficiency: number;
  readonly routeSimplicity: number;
  readonly atomicity: number;
  readonly fundingSafety: number;
  readonly validationQuality: number;
  readonly executionHeadroom: number;
}

export interface RankedArbitrageOpportunity {
  readonly rank: number;
  readonly opportunity: ArbitrageOpportunity;
  readonly score: number;
  readonly normalizedScore: number;
  readonly components: OpportunityRankingComponentScores;
  readonly equivalentRouteKey: string;
  readonly inputTokenKey: string;
  readonly dexIds: readonly DexId[];
  readonly poolIds: readonly PoolId[];
  readonly ageMilliseconds: number;
  readonly remainingLifetimeMilliseconds: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface RejectedArbitrageOpportunity {
  readonly opportunity: ArbitrageOpportunity;
  readonly code: OpportunityRankingErrorCode;
  readonly reasons: readonly string[];
  readonly equivalentRouteKey: string;
}

export interface OpportunityRankingResult {
  readonly ranked: readonly RankedArbitrageOpportunity[];
  readonly rejected: readonly RejectedArbitrageOpportunity[];
  readonly evaluatedCount: number;
  readonly eligibleCount: number;
  readonly selectedCount: number;
  readonly rejectedCount: number;
  readonly deduplicatedCount: number;
  readonly concentrationRejectedCount: number;
  readonly rankedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

interface NormalizedRankingOptions {
  readonly weights: OpportunityRankingWeights;
  readonly thresholds: OpportunityRankingThresholds;
  readonly concentrationLimits: OpportunityRankingConcentrationLimits;
  readonly maximumResults: number;
  readonly deduplicateEquivalentRoutes: boolean;
  readonly preferEarlierDetectionOnTie: boolean;
  readonly preferEarlierExpiryOnTie: boolean;
  readonly rejectFutureDetectionTimestamps: boolean;
  readonly includeRejectedOpportunities: boolean;
  readonly normalizeProfitAmountByInput: boolean;
}

interface ScoredOpportunity {
  readonly opportunity: ArbitrageOpportunity;
  readonly score: number;
  readonly normalizedScore: number;
  readonly components: OpportunityRankingComponentScores;
  readonly equivalentRouteKey: string;
  readonly inputTokenKey: string;
  readonly dexIds: readonly DexId[];
  readonly poolIds: readonly PoolId[];
  readonly ageMilliseconds: number;
  readonly remainingLifetimeMilliseconds: number;
}

const DEFAULT_WEIGHTS: OpportunityRankingWeights =
  Object.freeze({
    netProfitAmount: 0.16,
    netProfitBasisPoints: 0.19,
    grossProfitBasisPoints: 0.05,
    confidence: 0.14,
    freshness: 0.09,
    gasEfficiency: 0.10,
    routeSimplicity: 0.05,
    atomicity: 0.05,
    fundingSafety: 0.05,
    validationQuality: 0.05,
    executionHeadroom: 0.07,
  });

const DEFAULT_THRESHOLDS: OpportunityRankingThresholds =
  Object.freeze({
    maximumAgeMilliseconds:
      DEFAULT_MAXIMUM_AGE_MILLISECONDS,
    minimumRemainingLifetimeMilliseconds: 1,
    maximumRouteLegs: DEFAULT_MAXIMUM_ROUTE_LEGS,
    requireProfitable: true,
    requireAtomic: true,
    requireValidStatus: true,
    rejectValidationErrors: true,
  });

const DEFAULT_CONCENTRATION_LIMITS:
  OpportunityRankingConcentrationLimits =
    Object.freeze({
      maximumEquivalentRoutes: 1,
    });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  field: string,
  allowZero: boolean,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new OpportunityRankingError(
      OpportunityRankingErrorCode.INVALID_LIMIT,
      `${field} must be ${
        allowZero ? "a non-negative" : "a positive"
      } safe integer.`,
      { details: value },
    );
  }

  return value;
}

function normalizeFiniteNumber(
  value: number | undefined,
  field: string,
  minimum?: number,
  maximum?: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !Number.isFinite(value) ||
    (minimum !== undefined && value < minimum) ||
    (maximum !== undefined && value > maximum)
  ) {
    throw new OpportunityRankingError(
      OpportunityRankingErrorCode.INVALID_LIMIT,
      `${field} is outside its permitted range.`,
      { details: value },
    );
  }

  return value;
}

function normalizeWeights(
  weights: Partial<OpportunityRankingWeights> | undefined,
): OpportunityRankingWeights {
  const merged = {
    ...DEFAULT_WEIGHTS,
    ...weights,
  };

  let total = 0;

  for (const [field, value] of Object.entries(merged)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_WEIGHT,
        `Ranking weight "${field}" must be a non-negative finite number.`,
        { details: value },
      );
    }

    total += value;
  }

  if (total <= 0) {
    throw new OpportunityRankingError(
      OpportunityRankingErrorCode.INVALID_WEIGHT,
      "At least one ranking weight must be greater than zero.",
    );
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(merged).map(([field, value]) => [
        field,
        value / total,
      ]),
    ) as unknown as OpportunityRankingWeights,
  );
}

function normalizeThresholds(
  thresholds: OpportunityRankingThresholds | undefined,
): OpportunityRankingThresholds {
  const merged = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
  };

  if (
    merged.minimumNetProfitAmount !== undefined &&
    merged.minimumNetProfitAmount < 0n
  ) {
    throw new OpportunityRankingError(
      OpportunityRankingErrorCode.INVALID_LIMIT,
      "minimumNetProfitAmount cannot be negative.",
      {
        details: merged.minimumNetProfitAmount,
      },
    );
  }

  for (const [field, value] of [
    [
      "minimumNetProfitBasisPoints",
      merged.minimumNetProfitBasisPoints,
    ],
    [
      "minimumGrossProfitBasisPoints",
      merged.minimumGrossProfitBasisPoints,
    ],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < 0)
    ) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_LIMIT,
        `${field} must be a non-negative safe integer.`,
        { details: value },
      );
    }
  }

  normalizeFiniteNumber(
    merged.minimumConfidence,
    "minimumConfidence",
    0,
    1,
  );
  normalizeNonNegativeInteger(
    merged.maximumAgeMilliseconds,
    "maximumAgeMilliseconds",
    true,
  );
  normalizeNonNegativeInteger(
    merged.minimumRemainingLifetimeMilliseconds,
    "minimumRemainingLifetimeMilliseconds",
    true,
  );
  normalizeNonNegativeInteger(
    merged.maximumRouteLegs,
    "maximumRouteLegs",
    false,
  );
  normalizeFiniteNumber(
    merged.maximumGasCostUsd,
    "maximumGasCostUsd",
    0,
  );
  normalizeFiniteNumber(
    merged.maximumTotalEstimatedCostUsd,
    "maximumTotalEstimatedCostUsd",
    0,
  );

  return Object.freeze({
    ...merged,
    allowedFundingModes:
      merged.allowedFundingModes === undefined
        ? undefined
        : Object.freeze([...merged.allowedFundingModes]),
    allowedRouteTypes:
      merged.allowedRouteTypes === undefined
        ? undefined
        : Object.freeze([...merged.allowedRouteTypes]),
    allowedChainIds:
      merged.allowedChainIds === undefined
        ? undefined
        : Object.freeze([...merged.allowedChainIds]),
  });
}

function normalizeConcentrationLimits(
  limits:
    | OpportunityRankingConcentrationLimits
    | undefined,
): OpportunityRankingConcentrationLimits {
  const merged = {
    ...DEFAULT_CONCENTRATION_LIMITS,
    ...limits,
  };

  for (const [field, value] of Object.entries(merged)) {
    normalizeNonNegativeInteger(
      value,
      field,
      false,
    );
  }

  return Object.freeze(merged);
}

function normalizeOptions(
  options: OpportunityRankingOptions,
): NormalizedRankingOptions {
  const maximumResults =
    options.maximumResults ?? DEFAULT_MAXIMUM_RESULTS;

  normalizeNonNegativeInteger(
    maximumResults,
    "maximumResults",
    false,
  );

  return Object.freeze({
    weights: normalizeWeights(options.weights),
    thresholds: normalizeThresholds(
      options.thresholds,
    ),
    concentrationLimits:
      normalizeConcentrationLimits(
        options.concentrationLimits,
      ),
    maximumResults,
    deduplicateEquivalentRoutes:
      options.deduplicateEquivalentRoutes ?? true,
    preferEarlierDetectionOnTie:
      options.preferEarlierDetectionOnTie ?? true,
    preferEarlierExpiryOnTie:
      options.preferEarlierExpiryOnTie ?? true,
    rejectFutureDetectionTimestamps:
      options.rejectFutureDetectionTimestamps ?? true,
    includeRejectedOpportunities:
      options.includeRejectedOpportunities ?? true,
    normalizeProfitAmountByInput:
      options.normalizeProfitAmountByInput ?? true,
  });
}

function tokenKey(token: TokenDescriptor): string {
  return `${Number(token.chainId)}:${String(
    token.address,
  ).toLowerCase()}`;
}

function routeDexIds(
  opportunity: ArbitrageOpportunity,
): readonly DexId[] {
  return Object.freeze(
    [...new Set(
      opportunity.route.legs.map(
        (leg) => leg.dexId,
      ),
    )].sort((left, right) =>
      String(left).localeCompare(String(right)),
    ),
  );
}

function routePoolIds(
  opportunity: ArbitrageOpportunity,
): readonly PoolId[] {
  return Object.freeze(
    [...new Set(
      opportunity.route.legs.flatMap((leg) =>
        leg.poolId === undefined
          ? []
          : [leg.poolId],
      ),
    )].sort((left, right) =>
      String(left).localeCompare(String(right)),
    ),
  );
}

function createEquivalentRouteKey(
  opportunity: ArbitrageOpportunity,
): string {
  const legs = opportunity.route.legs
    .map((leg) =>
      [
        String(leg.dexId),
        String(leg.poolId ?? ""),
        tokenKey(leg.tokenIn),
        tokenKey(leg.tokenOut),
      ].join(">"),
    )
    .join("|");

  return [
    Number(opportunity.chainId),
    opportunity.route.type,
    opportunity.fundingMode,
    tokenKey(opportunity.route.startToken),
    tokenKey(opportunity.route.endToken),
    legs,
  ].join("::");
}

function countValidationIssues(
  issues: readonly ValidationIssue[],
  severities: readonly ValidationSeverity[],
): number {
  const accepted = new Set(severities);

  return issues.filter((issue) =>
    accepted.has(issue.severity),
  ).length;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function safeRatio(
  numerator: bigint,
  denominator: bigint,
): number {
  if (denominator <= 0n || numerator <= 0n) {
    return 0;
  }

  const scaled =
    (numerator * 1_000_000n) / denominator;

  return Number(scaled) / 1_000_000;
}

function fundingSafetyScore(
  fundingMode: ArbitrageFundingMode,
  opportunity: ArbitrageOpportunity,
): number {
  switch (fundingMode) {
    case FundingMode.PAPER:
      return 1;

    case FundingMode.WALLET:
      return 0.95;

    case FundingMode.FLASH_LOAN:
      return opportunity.flashLiquidityQuote === undefined
        ? 0
        : 0.85;

    case FundingMode.FLASH_SWAP:
      return opportunity.flashLiquidityQuote === undefined
        ? 0.55
        : 0.8;

    case FundingMode.AUTO:
      return 0.7;

    default:
      return 0;
  }
}

function statusIsEligible(
  status: ArbitrageOpportunityStatus,
): boolean {
  return (
    status === ArbitrageOpportunityStatus.DETECTED ||
    status === ArbitrageOpportunityStatus.VALIDATING ||
    status === ArbitrageOpportunityStatus.VALID
  );
}

export class CrossDexArbitrageOpportunityRanker {
  private readonly clock: OpportunityRankingClock;
  private readonly options: NormalizedRankingOptions;

  public constructor(
    clock: OpportunityRankingClock,
    options: OpportunityRankingOptions = {},
  ) {
    if (
      clock === null ||
      typeof clock !== "object" ||
      typeof clock.nowMilliseconds !== "function"
    ) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_OPTIONS,
        "A ranking clock is required.",
      );
    }

    this.clock = clock;
    this.options = normalizeOptions(options);
  }

  public rank(
    request: OpportunityRankingRequest,
  ): OpportunityRankingResult {
    if (
      request === null ||
      typeof request !== "object" ||
      !Array.isArray(request.opportunities)
    ) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_REQUEST,
        "Ranking request must contain an opportunities array.",
        { details: request },
      );
    }

    const nowMilliseconds =
      request.nowMilliseconds ??
      this.clock.nowMilliseconds();

    if (
      !Number.isFinite(nowMilliseconds) ||
      nowMilliseconds < 0
    ) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_REQUEST,
        "Ranking time must be a non-negative finite number.",
        { details: nowMilliseconds },
      );
    }

    const maximumResults =
      request.maximumResults ??
      this.options.maximumResults;

    normalizeNonNegativeInteger(
      maximumResults,
      "request.maximumResults",
      false,
    );

    const rejected: RejectedArbitrageOpportunity[] =
      [];
    const scored: ScoredOpportunity[] = [];

    for (const opportunity of request.opportunities) {
      const validation =
        this.validateOpportunity(
          opportunity,
          nowMilliseconds,
        );
      const equivalentRouteKey =
        createEquivalentRouteKey(opportunity);

      if (validation.length > 0) {
        if (
          this.options.includeRejectedOpportunities
        ) {
          rejected.push(
            Object.freeze({
              opportunity,
              code:
                OpportunityRankingErrorCode.INVALID_OPPORTUNITY,
              reasons: Object.freeze(validation),
              equivalentRouteKey,
            }),
          );
        }

        continue;
      }

      scored.push(
        this.scoreOpportunity(
          opportunity,
          nowMilliseconds,
          equivalentRouteKey,
        ),
      );
    }

    scored.sort((left, right) =>
      this.compareScored(left, right),
    );

    const deduplicated =
      this.applyEquivalentRouteDeduplication(
        scored,
        rejected,
      );
    const concentrated =
      this.applyConcentrationLimits(
        deduplicated.values,
        rejected,
      );

    const selected = concentrated.values.slice(
      0,
      maximumResults,
    );

    const ranked = selected.map(
      (entry, index) =>
        Object.freeze({
          rank: index + 1,
          opportunity: entry.opportunity,
          score: entry.score,
          normalizedScore:
            entry.normalizedScore,
          components: entry.components,
          equivalentRouteKey:
            entry.equivalentRouteKey,
          inputTokenKey:
            entry.inputTokenKey,
          dexIds: entry.dexIds,
          poolIds: entry.poolIds,
          ageMilliseconds:
            entry.ageMilliseconds,
          remainingLifetimeMilliseconds:
            entry.remainingLifetimeMilliseconds,
          metadata: freezeMetadata(
            request.metadata,
          ),
        }),
    );

    return Object.freeze({
      ranked: Object.freeze(ranked),
      rejected: Object.freeze(rejected),
      evaluatedCount:
        request.opportunities.length,
      eligibleCount: scored.length,
      selectedCount: ranked.length,
      rejectedCount: rejected.length,
      deduplicatedCount:
        deduplicated.rejectedCount,
      concentrationRejectedCount:
        concentrated.rejectedCount,
      rankedAtMilliseconds:
        nowMilliseconds as UnixTimestampMilliseconds,
      metadata: freezeMetadata(request.metadata),
    });
  }

  public compare(
    left: ArbitrageOpportunity,
    right: ArbitrageOpportunity,
    nowMilliseconds:
      UnixTimestampMilliseconds =
        this.clock.nowMilliseconds(),
  ): number {
    const leftScored = this.scoreOpportunity(
      left,
      nowMilliseconds,
      createEquivalentRouteKey(left),
    );
    const rightScored = this.scoreOpportunity(
      right,
      nowMilliseconds,
      createEquivalentRouteKey(right),
    );

    return this.compareScored(
      leftScored,
      rightScored,
    );
  }

  public score(
    opportunity: ArbitrageOpportunity,
    nowMilliseconds:
      UnixTimestampMilliseconds =
        this.clock.nowMilliseconds(),
  ): RankedArbitrageOpportunity {
    const reasons =
      this.validateOpportunity(
        opportunity,
        nowMilliseconds,
      );

    if (reasons.length > 0) {
      throw new OpportunityRankingError(
        OpportunityRankingErrorCode.INVALID_OPPORTUNITY,
        reasons.join(" "),
        {
          opportunityId: opportunity.id,
          chainId: opportunity.chainId,
          details: reasons,
        },
      );
    }

    const scored = this.scoreOpportunity(
      opportunity,
      nowMilliseconds,
      createEquivalentRouteKey(opportunity),
    );

    return Object.freeze({
      rank: 1,
      opportunity: scored.opportunity,
      score: scored.score,
      normalizedScore: scored.normalizedScore,
      components: scored.components,
      equivalentRouteKey:
        scored.equivalentRouteKey,
      inputTokenKey: scored.inputTokenKey,
      dexIds: scored.dexIds,
      poolIds: scored.poolIds,
      ageMilliseconds:
        scored.ageMilliseconds,
      remainingLifetimeMilliseconds:
        scored.remainingLifetimeMilliseconds,
    });
  }

  private validateOpportunity(
    opportunity: ArbitrageOpportunity,
    nowMilliseconds: number,
  ): readonly string[] {
    const reasons: string[] = [];
    const thresholds = this.options.thresholds;

    if (
      opportunity === null ||
      typeof opportunity !== "object"
    ) {
      return Object.freeze([
        "Opportunity must be an object.",
      ]);
    }

    if (
      !Number.isSafeInteger(opportunity.chainId) ||
      Number(opportunity.chainId) <= 0
    ) {
      reasons.push(
        "Opportunity chainId must be a positive safe integer.",
      );
    }

    if (
      opportunity.route.chainId !==
      opportunity.chainId
    ) {
      reasons.push(
        "Opportunity and route chain IDs do not match.",
      );
    }

    if (
      opportunity.sourceBlockReference.chainId !==
      opportunity.chainId
    ) {
      reasons.push(
        "Opportunity and source block chain IDs do not match.",
      );
    }

    if (
      opportunity.profitability.inputAmount !==
      opportunity.route.inputAmount
    ) {
      reasons.push(
        "Profitability input amount does not match route input amount.",
      );
    }

    if (
      !Number.isFinite(opportunity.confidence) ||
      opportunity.confidence < 0 ||
      opportunity.confidence > 1
    ) {
      reasons.push(
        "Opportunity confidence must be between 0 and 1.",
      );
    }

    if (
      opportunity.detectedAtMilliseconds >
        nowMilliseconds &&
      this.options
        .rejectFutureDetectionTimestamps
    ) {
      reasons.push(
        "Opportunity detection timestamp is in the future.",
      );
    }

    const age =
      nowMilliseconds -
      opportunity.detectedAtMilliseconds;
    const remaining =
      opportunity.expiresAtMilliseconds -
      nowMilliseconds;

    if (
      thresholds.maximumAgeMilliseconds !==
        undefined &&
      age >
        thresholds.maximumAgeMilliseconds
    ) {
      reasons.push(
        "Opportunity exceeds the maximum permitted age.",
      );
    }

    if (
      thresholds
        .minimumRemainingLifetimeMilliseconds !==
        undefined &&
      remaining <
        thresholds
          .minimumRemainingLifetimeMilliseconds
    ) {
      reasons.push(
        "Opportunity does not have enough remaining lifetime.",
      );
    }

    if (
      thresholds.requireProfitable === true &&
      !opportunity.profitability.profitable
    ) {
      reasons.push(
        "Opportunity is not marked profitable.",
      );
    }

    if (
      thresholds.requireAtomic === true &&
      !opportunity.route.isAtomic
    ) {
      reasons.push(
        "Opportunity route is not atomic.",
      );
    }

    if (
      thresholds.requireValidStatus === true &&
      !statusIsEligible(opportunity.status)
    ) {
      reasons.push(
        `Opportunity status "${opportunity.status}" is not rankable.`,
      );
    }

    if (
      thresholds.rejectValidationErrors ===
        true &&
      countValidationIssues(
        opportunity.validationIssues,
        [
          ValidationSeverity.ERROR,
          ValidationSeverity.FATAL,
        ],
      ) > 0
    ) {
      reasons.push(
        "Opportunity contains error or fatal validation issues.",
      );
    }

    if (
      thresholds.minimumNetProfitAmount !==
        undefined &&
      opportunity.profitability.netProfitAmount <
        thresholds.minimumNetProfitAmount
    ) {
      reasons.push(
        "Net profit amount is below the ranking threshold.",
      );
    }

    if (
      thresholds
        .minimumNetProfitBasisPoints !==
        undefined &&
      opportunity.profitability
        .netProfitBasisPoints <
        thresholds.minimumNetProfitBasisPoints
    ) {
      reasons.push(
        "Net profit basis points are below the ranking threshold.",
      );
    }

    if (
      thresholds
        .minimumGrossProfitBasisPoints !==
        undefined &&
      opportunity.profitability
        .grossProfitBasisPoints <
        thresholds.minimumGrossProfitBasisPoints
    ) {
      reasons.push(
        "Gross profit basis points are below the ranking threshold.",
      );
    }

    if (
      thresholds.minimumConfidence !==
        undefined &&
      opportunity.confidence <
        thresholds.minimumConfidence
    ) {
      reasons.push(
        "Opportunity confidence is below the ranking threshold.",
      );
    }

    if (
      thresholds.maximumRouteLegs !==
        undefined &&
      opportunity.route.legs.length >
        thresholds.maximumRouteLegs
    ) {
      reasons.push(
        "Route contains too many legs.",
      );
    }

    if (
      thresholds.maximumGasCostUsd !==
        undefined &&
      opportunity.profitability.costs
        .gasCostUsd !== undefined &&
      opportunity.profitability.costs
        .gasCostUsd >
        thresholds.maximumGasCostUsd
    ) {
      reasons.push(
        "Gas cost exceeds the ranking threshold.",
      );
    }

    if (
      thresholds
        .maximumTotalEstimatedCostUsd !==
        undefined &&
      opportunity.profitability.costs
        .totalEstimatedCostUsd !== undefined &&
      opportunity.profitability.costs
        .totalEstimatedCostUsd >
        thresholds.maximumTotalEstimatedCostUsd
    ) {
      reasons.push(
        "Total estimated cost exceeds the ranking threshold.",
      );
    }

    if (
      thresholds.allowedFundingModes !==
        undefined &&
      !thresholds.allowedFundingModes.includes(
        opportunity.fundingMode,
      )
    ) {
      reasons.push(
        "Funding mode is not permitted by ranking policy.",
      );
    }

    if (
      thresholds.allowedRouteTypes !==
        undefined &&
      !thresholds.allowedRouteTypes.includes(
        opportunity.route.type,
      )
    ) {
      reasons.push(
        "Route type is not permitted by ranking policy.",
      );
    }

    if (
      thresholds.allowedChainIds !==
        undefined &&
      !thresholds.allowedChainIds.includes(
        opportunity.chainId,
      )
    ) {
      reasons.push(
        "Chain is not permitted by ranking policy.",
      );
    }

    if (
      opportunity.route.legs.length === 0
    ) {
      reasons.push(
        "Opportunity route must contain at least one leg.",
      );
    }

    if (
      opportunity.route.inputAmount <= 0n ||
      opportunity.profitability.inputAmount <=
        0n
    ) {
      reasons.push(
        "Opportunity input amount must be positive.",
      );
    }

    if (
      opportunity.profitability
        .netProfitAmount < 0n ||
      opportunity.profitability
        .grossProfitAmount < 0n
    ) {
      reasons.push(
        "Opportunity profit amounts cannot be negative.",
      );
    }

    return Object.freeze(reasons);
  }

  private scoreOpportunity(
    opportunity: ArbitrageOpportunity,
    nowMilliseconds: number,
    equivalentRouteKey: string,
  ): ScoredOpportunity {
    const ageMilliseconds = Math.max(
      0,
      nowMilliseconds -
        opportunity.detectedAtMilliseconds,
    );
    const remainingLifetimeMilliseconds =
      Math.max(
        0,
        opportunity.expiresAtMilliseconds -
          nowMilliseconds,
      );

    const maximumAge =
      this.options.thresholds
        .maximumAgeMilliseconds ??
      DEFAULT_MAXIMUM_AGE_MILLISECONDS;

    const profitAmountRatio =
      this.options.normalizeProfitAmountByInput
        ? safeRatio(
            opportunity.profitability
              .netProfitAmount,
            opportunity.profitability
              .inputAmount,
          )
        : this.normalizeBigintMagnitude(
            opportunity.profitability
              .netProfitAmount,
          );

    const netProfitAmountScore =
      clampUnit(profitAmountRatio);
    const netProfitBasisPointsScore =
      clampUnit(
        opportunity.profitability
          .netProfitBasisPoints /
          BASIS_POINTS_DENOMINATOR,
      );
    const grossProfitBasisPointsScore =
      clampUnit(
        opportunity.profitability
          .grossProfitBasisPoints /
          BASIS_POINTS_DENOMINATOR,
      );
    const confidenceScore = clampUnit(
      opportunity.confidence,
    );
    const freshnessScore =
      maximumAge <= 0
        ? 1
        : clampUnit(
            1 -
              ageMilliseconds /
                maximumAge,
          );

    const gasEfficiencyScore =
      this.calculateGasEfficiencyScore(
        opportunity,
      );

    const routeSimplicityScore =
      clampUnit(
        1 /
          Math.max(
            1,
            opportunity.route.legs.length,
          ),
      );

    const atomicityScore =
      opportunity.route.isAtomic ? 1 : 0;
    const fundingScore =
      fundingSafetyScore(
        opportunity.fundingMode,
        opportunity,
      );
    const validationQualityScore =
      this.calculateValidationQualityScore(
        opportunity.validationIssues,
      );
    const executionHeadroomScore =
      this.calculateExecutionHeadroomScore(
        opportunity,
        remainingLifetimeMilliseconds,
      );

    const components:
      OpportunityRankingComponentScores =
        Object.freeze({
          netProfitAmount:
            netProfitAmountScore,
          netProfitBasisPoints:
            netProfitBasisPointsScore,
          grossProfitBasisPoints:
            grossProfitBasisPointsScore,
          confidence: confidenceScore,
          freshness: freshnessScore,
          gasEfficiency:
            gasEfficiencyScore,
          routeSimplicity:
            routeSimplicityScore,
          atomicity: atomicityScore,
          fundingSafety: fundingScore,
          validationQuality:
            validationQualityScore,
          executionHeadroom:
            executionHeadroomScore,
        });

    const weights = this.options.weights;
    const normalizedScore =
      components.netProfitAmount *
        weights.netProfitAmount +
      components.netProfitBasisPoints *
        weights.netProfitBasisPoints +
      components.grossProfitBasisPoints *
        weights.grossProfitBasisPoints +
      components.confidence *
        weights.confidence +
      components.freshness *
        weights.freshness +
      components.gasEfficiency *
        weights.gasEfficiency +
      components.routeSimplicity *
        weights.routeSimplicity +
      components.atomicity *
        weights.atomicity +
      components.fundingSafety *
        weights.fundingSafety +
      components.validationQuality *
        weights.validationQuality +
      components.executionHeadroom *
        weights.executionHeadroom;

    return Object.freeze({
      opportunity,
      score: Math.round(
        normalizedScore * SCORE_SCALE,
      ),
      normalizedScore,
      components,
      equivalentRouteKey,
      inputTokenKey: tokenKey(
        opportunity.route.startToken,
      ),
      dexIds: routeDexIds(opportunity),
      poolIds: routePoolIds(opportunity),
      ageMilliseconds,
      remainingLifetimeMilliseconds,
    });
  }

  private calculateGasEfficiencyScore(
    opportunity: ArbitrageOpportunity,
  ): number {
    const netProfitUsd =
      opportunity.profitability.netProfitUsd;
    const gasCostUsd =
      opportunity.profitability.costs
        .gasCostUsd;

    if (
      netProfitUsd !== undefined &&
      gasCostUsd !== undefined
    ) {
      if (netProfitUsd <= 0) {
        return 0;
      }

      if (gasCostUsd <= 0) {
        return 1;
      }

      return clampUnit(
        netProfitUsd /
          (netProfitUsd + gasCostUsd),
      );
    }

    const returnOnGas =
      opportunity.profitability.returnOnGas;

    if (
      returnOnGas !== undefined &&
      Number.isFinite(returnOnGas)
    ) {
      return clampUnit(
        returnOnGas /
          (1 + Math.max(0, returnOnGas)),
      );
    }

    const gasWei =
      opportunity.profitability.costs
        .gasCostWei;

    if (gasWei === 0n) {
      return 1;
    }

    return 0.5;
  }

  private calculateValidationQualityScore(
    issues: readonly ValidationIssue[],
  ): number {
    const fatalCount = countValidationIssues(
      issues,
      [ValidationSeverity.FATAL],
    );
    const errorCount = countValidationIssues(
      issues,
      [ValidationSeverity.ERROR],
    );
    const warningCount = countValidationIssues(
      issues,
      [ValidationSeverity.WARNING],
    );
    const infoCount = countValidationIssues(
      issues,
      [ValidationSeverity.INFO],
    );

    const penalty =
      fatalCount * 1 +
      errorCount * 0.5 +
      warningCount * 0.1 +
      infoCount * 0.02;

    return clampUnit(1 - penalty);
  }

  private calculateExecutionHeadroomScore(
    opportunity: ArbitrageOpportunity,
    remainingLifetimeMilliseconds: number,
  ): number {
    const lifetime =
      opportunity.expiresAtMilliseconds -
      opportunity.detectedAtMilliseconds;

    if (lifetime <= 0) {
      return 0;
    }

    return clampUnit(
      remainingLifetimeMilliseconds /
        lifetime,
    );
  }

  private normalizeBigintMagnitude(
    value: bigint,
  ): number {
    if (value <= 0n) {
      return 0;
    }

    const digits = value.toString().length;

    return clampUnit(digits / 30);
  }

  private compareScored(
    left: ScoredOpportunity,
    right: ScoredOpportunity,
  ): number {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    const leftProfit =
      left.opportunity.profitability
        .netProfitAmount;
    const rightProfit =
      right.opportunity.profitability
        .netProfitAmount;

    if (leftProfit !== rightProfit) {
      return leftProfit > rightProfit
        ? -1
        : 1;
    }

    const leftBasisPoints =
      left.opportunity.profitability
        .netProfitBasisPoints;
    const rightBasisPoints =
      right.opportunity.profitability
        .netProfitBasisPoints;

    if (leftBasisPoints !== rightBasisPoints) {
      return rightBasisPoints -
        leftBasisPoints;
    }

    if (
      left.opportunity.confidence !==
      right.opportunity.confidence
    ) {
      return (
        right.opportunity.confidence -
        left.opportunity.confidence
      );
    }

    if (
      this.options
        .preferEarlierDetectionOnTie &&
      left.opportunity
        .detectedAtMilliseconds !==
        right.opportunity
          .detectedAtMilliseconds
    ) {
      return (
        left.opportunity
          .detectedAtMilliseconds -
        right.opportunity
          .detectedAtMilliseconds
      );
    }

    if (
      this.options.preferEarlierExpiryOnTie &&
      left.opportunity
        .expiresAtMilliseconds !==
        right.opportunity.expiresAtMilliseconds
    ) {
      return (
        left.opportunity
          .expiresAtMilliseconds -
        right.opportunity
          .expiresAtMilliseconds
      );
    }

    const routeComparison =
      left.equivalentRouteKey.localeCompare(
        right.equivalentRouteKey,
      );

    if (routeComparison !== 0) {
      return routeComparison;
    }

    return String(
      left.opportunity.id,
    ).localeCompare(
      String(right.opportunity.id),
    );
  }

  private applyEquivalentRouteDeduplication(
    values: readonly ScoredOpportunity[],
    rejected: RejectedArbitrageOpportunity[],
  ): Readonly<{
    values: readonly ScoredOpportunity[];
    rejectedCount: number;
  }> {
    if (
      !this.options
        .deduplicateEquivalentRoutes
    ) {
      return Object.freeze({
        values: Object.freeze([...values]),
        rejectedCount: 0,
      });
    }

    const maximum =
      this.options.concentrationLimits
        .maximumEquivalentRoutes ?? 1;
    const counts = new Map<string, number>();
    const accepted: ScoredOpportunity[] = [];
    let rejectedCount = 0;

    for (const value of values) {
      const count =
        counts.get(
          value.equivalentRouteKey,
        ) ?? 0;

      if (count >= maximum) {
        rejectedCount += 1;

        if (
          this.options
            .includeRejectedOpportunities
        ) {
          rejected.push(
            Object.freeze({
              opportunity: value.opportunity,
              code:
                OpportunityRankingErrorCode.INVALID_OPPORTUNITY,
              reasons: Object.freeze([
                "An equivalent higher-ranked route already satisfies the deduplication limit.",
              ]),
              equivalentRouteKey:
                value.equivalentRouteKey,
            }),
          );
        }

        continue;
      }

      counts.set(
        value.equivalentRouteKey,
        count + 1,
      );
      accepted.push(value);
    }

    return Object.freeze({
      values: Object.freeze(accepted),
      rejectedCount,
    });
  }

  private applyConcentrationLimits(
    values: readonly ScoredOpportunity[],
    rejected: RejectedArbitrageOpportunity[],
  ): Readonly<{
    values: readonly ScoredOpportunity[];
    rejectedCount: number;
  }> {
    const limits =
      this.options.concentrationLimits;
    const chainCounts = new Map<string, number>();
    const tokenCounts = new Map<string, number>();
    const dexCounts = new Map<string, number>();
    const poolCounts = new Map<string, number>();
    const fundingCounts = new Map<
      ArbitrageFundingMode,
      number
    >();
    const accepted: ScoredOpportunity[] = [];
    let rejectedCount = 0;

    for (const value of values) {
      const reasons: string[] = [];
      const chainKey = String(
        value.opportunity.chainId,
      );
      const fundingKey =
        value.opportunity.fundingMode;

      if (
        limits.maximumPerChain !== undefined &&
        (chainCounts.get(chainKey) ?? 0) >=
          limits.maximumPerChain
      ) {
        reasons.push(
          "Maximum opportunities per chain reached.",
        );
      }

      if (
        limits.maximumPerInputToken !==
          undefined &&
        (tokenCounts.get(
          value.inputTokenKey,
        ) ?? 0) >=
          limits.maximumPerInputToken
      ) {
        reasons.push(
          "Maximum opportunities per input token reached.",
        );
      }

      if (
        limits.maximumPerFundingMode !==
          undefined &&
        (fundingCounts.get(fundingKey) ??
          0) >=
          limits.maximumPerFundingMode
      ) {
        reasons.push(
          "Maximum opportunities per funding mode reached.",
        );
      }

      if (
        limits.maximumPerDex !== undefined &&
        value.dexIds.some(
          (dexId) =>
            (dexCounts.get(String(dexId)) ??
              0) >=
            limits.maximumPerDex!,
        )
      ) {
        reasons.push(
          "Maximum opportunities per DEX reached.",
        );
      }

      if (
        limits.maximumPerPool !==
          undefined &&
        value.poolIds.some(
          (poolId) =>
            (poolCounts.get(
              String(poolId),
            ) ?? 0) >=
            limits.maximumPerPool!,
        )
      ) {
        reasons.push(
          "Maximum opportunities per pool reached.",
        );
      }

      if (reasons.length > 0) {
        rejectedCount += 1;

        if (
          this.options
            .includeRejectedOpportunities
        ) {
          rejected.push(
            Object.freeze({
              opportunity: value.opportunity,
              code:
                OpportunityRankingErrorCode.INVALID_OPPORTUNITY,
              reasons: Object.freeze(reasons),
              equivalentRouteKey:
                value.equivalentRouteKey,
            }),
          );
        }

        continue;
      }

      accepted.push(value);
      chainCounts.set(
        chainKey,
        (chainCounts.get(chainKey) ?? 0) +
          1,
      );
      tokenCounts.set(
        value.inputTokenKey,
        (tokenCounts.get(
          value.inputTokenKey,
        ) ?? 0) + 1,
      );
      fundingCounts.set(
        fundingKey,
        (fundingCounts.get(fundingKey) ??
          0) + 1,
      );

      for (const dexId of value.dexIds) {
        const key = String(dexId);
        dexCounts.set(
          key,
          (dexCounts.get(key) ?? 0) + 1,
        );
      }

      for (const poolId of value.poolIds) {
        const key = String(poolId);
        poolCounts.set(
          key,
          (poolCounts.get(key) ?? 0) +
            1,
        );
      }
    }

    return Object.freeze({
      values: Object.freeze(accepted),
      rejectedCount,
    });
  }
}

export function createOpportunityRanker(
  clock: OpportunityRankingClock,
  options: OpportunityRankingOptions = {},
): CrossDexArbitrageOpportunityRanker {
  return new CrossDexArbitrageOpportunityRanker(
    clock,
    options,
  );
}

export function compareRankedOpportunities(
  left: RankedArbitrageOpportunity,
  right: RankedArbitrageOpportunity,
): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return String(
    left.opportunity.id,
  ).localeCompare(
    String(right.opportunity.id),
  );
}