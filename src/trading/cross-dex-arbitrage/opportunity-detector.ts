/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic cross-DEX arbitrage opportunity detector.
 *
 * Responsibilities:
 * - Build executable two-leg cycles from monitored pool states.
 * - Request deterministic exact-input quotes from injected quote providers.
 * - Evaluate wallet, flash-loan, flash-swap, auto, and paper funding modes.
 * - Estimate DEX fees, slippage, price impact, gas, and flash-liquidity costs.
 * - Enforce request-level profitability and execution constraints.
 * - Rank opportunities using stable deterministic ordering.
 * - Return immutable reports suitable for testing, replay, and execution.
 *
 * This module performs no direct RPC, wallet, filesystem, timer, or background work.
 */

import {
  type ArbitrageCostBreakdown,
  type ArbitrageDetectionRequest,
  type ArbitrageDetectionResult,
  type ArbitrageFundingMode,
  ArbitrageFundingMode as FundingMode,
  type ArbitrageLeg,
  type ArbitrageOpportunity,
  type ArbitrageOpportunityId,
  ArbitrageOpportunityStatus,
  type ArbitrageProfitability,
  type ArbitrageRoute,
  type ArbitrageRouteId,
  ArbitrageRouteType,
  type BasisPoints,
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexId,
  type DexPoolDescriptor,
  type DexPoolState,
  type DexQuote,
  type DexQuoteRequest,
  type EvmAddress,
  type EvmBlockReference,
  type FlashLiquidityQuote,
  type GasCostEstimate,
  type HexData,
  type PoolId,
  PoolStatus,
  QuoteSource,
  SwapDirection,
  type TokenAmount,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
  ValidationCode,
  ValidationSeverity,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";
import {
  CrossDexArbitragePriceNormalizer,
  NormalizedPriceSource,
  PriceNormalizerError,
  createPriceNormalizer,
} from "./price-normalizer";

const BASIS_POINTS_DENOMINATOR = 10_000n;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as EvmAddress;
const EMPTY_CALLDATA = "0x" as HexData;

export enum OpportunityDetectorErrorCode {
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  NO_ELIGIBLE_POOL = "NO_ELIGIBLE_POOL",
  UNSUPPORTED_ROUTE_TYPE = "UNSUPPORTED_ROUTE_TYPE",
  QUOTE_FAILED = "QUOTE_FAILED",
  QUOTE_INVALID = "QUOTE_INVALID",
  LEG_ENCODING_FAILED = "LEG_ENCODING_FAILED",
  GAS_ESTIMATION_FAILED = "GAS_ESTIMATION_FAILED",
  FLASH_LIQUIDITY_FAILED = "FLASH_LIQUIDITY_FAILED",
  BLOCK_REFERENCE_UNAVAILABLE = "BLOCK_REFERENCE_UNAVAILABLE",
  DETECTION_ABORTED = "DETECTION_ABORTED",
}

export class OpportunityDetectorError extends Error {
  public readonly code: OpportunityDetectorErrorCode;
  public readonly chainId?: ChainId;
  public readonly dexId?: DexId;
  public readonly poolId?: PoolId;
  public readonly cause?: unknown;
  public readonly details?: unknown;

  public constructor(
    code: OpportunityDetectorErrorCode,
    message: string,
    options: Readonly<{
      chainId?: ChainId;
      dexId?: DexId;
      poolId?: PoolId;
      cause?: unknown;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "OpportunityDetectorError";
    this.code = code;
    this.chainId = options.chainId;
    this.dexId = options.dexId;
    this.poolId = options.poolId;
    this.cause = options.cause;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface OpportunityDetectorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface OpportunityQuoteProvider {
  quote(request: DexQuoteRequest): Promise<DexQuote>;
}

export interface OpportunityLegEncoder {
  encode(
    quote: DexQuote,
    context: Readonly<{
      legIndex: number;
      recipient: EvmAddress;
      deadlineMilliseconds: UnixTimestampMilliseconds;
    }>,
  ): Promise<
    Readonly<{
      target: EvmAddress;
      calldata: HexData;
      value?: WeiAmount;
      metadata?: CrossDexArbitrageMetadata;
    }>
  >;
}

export interface OpportunityGasEstimator {
  estimate(
    route: ArbitrageRoute,
  ): Promise<GasCostEstimate>;
}

export interface OpportunityGasCostConverter {
  convertWeiToToken(
    gasCostWei: WeiAmount,
    token: TokenDescriptor,
    blockReference: EvmBlockReference,
  ): Promise<TokenAmount>;
}

export interface OpportunityFlashLiquidityProvider {
  quote(
    request: Readonly<{
      chainId: ChainId;
      fundingMode: ArbitrageFundingMode;
      asset: TokenDescriptor;
      amount: TokenAmount;
      blockNumber: BlockNumber;
      metadata?: CrossDexArbitrageMetadata;
    }>,
  ): Promise<FlashLiquidityQuote | undefined>;
}

export interface OpportunityDetectorIdFactory {
  createRouteId(
    context: Readonly<{
      chainId: ChainId;
      firstPoolId: PoolId;
      secondPoolId: PoolId;
      inputAmount: TokenAmount;
      sequence: number;
    }>,
  ): ArbitrageRouteId;

  createOpportunityId(
    context: Readonly<{
      chainId: ChainId;
      routeId: ArbitrageRouteId;
      fundingMode: ArbitrageFundingMode;
      sequence: number;
    }>,
  ): ArbitrageOpportunityId;
}

export interface OpportunityDetectorDependencies {
  readonly clock: OpportunityDetectorClock;
  readonly quoteProvider: OpportunityQuoteProvider;
  readonly legEncoder?: OpportunityLegEncoder;
  readonly gasEstimator?: OpportunityGasEstimator;
  readonly gasCostConverter?: OpportunityGasCostConverter;
  readonly flashLiquidityProvider?: OpportunityFlashLiquidityProvider;
  readonly idFactory?: OpportunityDetectorIdFactory;
  readonly priceNormalizer?: CrossDexArbitragePriceNormalizer;
}

export interface OpportunityDetectorOptions {
  readonly maximumConcurrency?: number;
  readonly continueOnRouteFailure?: boolean;
  readonly requireDifferentDexes?: boolean;
  readonly requireDifferentPools?: boolean;
  readonly rejectStalePoolStates?: boolean;
  readonly maximumPoolStateAgeMilliseconds?: number;
  readonly opportunityLifetimeMilliseconds?: number;
  readonly quoteRecipient?: EvmAddress;
  readonly requireEncodedLegs?: boolean;
  readonly includeRejectedCandidates?: boolean;
  readonly maximumOpportunities?: number;
  readonly confidenceFloor?: number;
  readonly confidenceCeiling?: number;
}

export interface OpportunityCandidateDescriptor {
  readonly chainId: ChainId;
  readonly inputToken: TokenDescriptor;
  readonly intermediateToken: TokenDescriptor;
  readonly firstPool: DexPoolDescriptor;
  readonly secondPool: DexPoolDescriptor;
  readonly firstState: DexPoolState;
  readonly secondState: DexPoolState;
  readonly inputAmount: TokenAmount;
}

export interface OpportunityCandidateRejection {
  readonly candidate: OpportunityCandidateDescriptor;
  readonly fundingMode?: ArbitrageFundingMode;
  readonly code: ValidationCode | OpportunityDetectorErrorCode;
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
  readonly details?: unknown;
}

export interface OpportunityRouteEvaluation {
  readonly candidate: OpportunityCandidateDescriptor;
  readonly fundingMode: ArbitrageFundingMode;
  readonly route?: ArbitrageRoute;
  readonly profitability?: ArbitrageProfitability;
  readonly opportunity?: ArbitrageOpportunity;
  readonly accepted: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly errorCode?: OpportunityDetectorErrorCode;
  readonly errorMessage?: string;
}

export interface OpportunityDetectorReport
  extends ArbitrageDetectionResult {
  readonly evaluations: readonly OpportunityRouteEvaluation[];
  readonly rejections: readonly OpportunityCandidateRejection[];
  readonly candidateCount: number;
  readonly quoteRequestCount: number;
  readonly quoteFailureCount: number;
  readonly gasEstimationCount: number;
  readonly flashLiquidityQuoteCount: number;
}

interface NormalizedDetectorOptions {
  readonly maximumConcurrency: number;
  readonly continueOnRouteFailure: boolean;
  readonly requireDifferentDexes: boolean;
  readonly requireDifferentPools: boolean;
  readonly rejectStalePoolStates: boolean;
  readonly maximumPoolStateAgeMilliseconds: number;
  readonly opportunityLifetimeMilliseconds: number;
  readonly quoteRecipient: EvmAddress;
  readonly requireEncodedLegs: boolean;
  readonly includeRejectedCandidates: boolean;
  readonly maximumOpportunities: number;
  readonly confidenceFloor: number;
  readonly confidenceCeiling: number;
}

interface EvaluationCounters {
  quoteRequestCount: number;
  quoteFailureCount: number;
  gasEstimationCount: number;
  flashLiquidityQuoteCount: number;
}

interface RouteEvaluationContext {
  readonly request: ArbitrageDetectionRequest;
  readonly candidate: OpportunityCandidateDescriptor;
  readonly fundingMode: ArbitrageFundingMode;
  readonly sequence: number;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly sourceBlockReference: EvmBlockReference;
  readonly counters: EvaluationCounters;
}

const DEFAULT_OPTIONS: NormalizedDetectorOptions =
  Object.freeze({
    maximumConcurrency: 4,
    continueOnRouteFailure: true,
    requireDifferentDexes: true,
    requireDifferentPools: true,
    rejectStalePoolStates: true,
    maximumPoolStateAgeMilliseconds: 12_000,
    opportunityLifetimeMilliseconds: 10_000,
    quoteRecipient: ZERO_ADDRESS,
    requireEncodedLegs: false,
    includeRejectedCandidates: true,
    maximumOpportunities: 100,
    confidenceFloor: 0,
    confidenceCeiling: 1,
  });

function normalizeOptions(
  options: OpportunityDetectorOptions,
): NormalizedDetectorOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  for (const [field, value] of [
    ["maximumConcurrency", merged.maximumConcurrency],
    ["maximumPoolStateAgeMilliseconds", merged.maximumPoolStateAgeMilliseconds],
    ["opportunityLifetimeMilliseconds", merged.opportunityLifetimeMilliseconds],
    ["maximumOpportunities", merged.maximumOpportunities],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.INVALID_OPTIONS,
        `${field} must be a positive safe integer.`,
        { details: value },
      );
    }
  }

  if (
    !Number.isFinite(merged.confidenceFloor) ||
    !Number.isFinite(merged.confidenceCeiling) ||
    merged.confidenceFloor < 0 ||
    merged.confidenceCeiling > 1 ||
    merged.confidenceFloor > merged.confidenceCeiling
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_OPTIONS,
      "Confidence bounds must satisfy 0 <= floor <= ceiling <= 1.",
      {
        details: {
          confidenceFloor: merged.confidenceFloor,
          confidenceCeiling: merged.confidenceCeiling,
        },
      },
    );
  }

  return Object.freeze(merged);
}

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function mergeMetadata(
  ...metadata: readonly (
    | CrossDexArbitrageMetadata
    | undefined
  )[]
): CrossDexArbitrageMetadata | undefined {
  const values = metadata.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  return values.length === 0
    ? undefined
    : Object.freeze(Object.assign({}, ...values));
}

function tokenKey(token: TokenDescriptor): string {
  return `${Number(token.chainId)}:${String(
    token.address,
  ).toLowerCase()}`;
}

function sameToken(
  left: TokenDescriptor,
  right: TokenDescriptor,
): boolean {
  return tokenKey(left) === tokenKey(right);
}

function poolContainsToken(
  pool: DexPoolDescriptor,
  token: TokenDescriptor,
): boolean {
  return (
    sameToken(pool.token0, token) ||
    sameToken(pool.token1, token)
  );
}

function otherToken(
  pool: DexPoolDescriptor,
  token: TokenDescriptor,
): TokenDescriptor | undefined {
  if (sameToken(pool.token0, token)) {
    return pool.token1;
  }

  if (sameToken(pool.token1, token)) {
    return pool.token0;
  }

  return undefined;
}

function comparePoolStates(
  left: DexPoolState,
  right: DexPoolState,
): number {
  const chainComparison =
    Number(left.pool.chainId) -
    Number(right.pool.chainId);

  if (chainComparison !== 0) {
    return chainComparison;
  }

  const dexComparison = String(
    left.pool.dexId,
  ).localeCompare(String(right.pool.dexId));

  if (dexComparison !== 0) {
    return dexComparison;
  }

  return String(left.pool.id).localeCompare(
    String(right.pool.id),
  );
}

function compareCandidates(
  left: OpportunityCandidateDescriptor,
  right: OpportunityCandidateDescriptor,
): number {
  const tokenComparison = tokenKey(
    left.inputToken,
  ).localeCompare(tokenKey(right.inputToken));

  if (tokenComparison !== 0) {
    return tokenComparison;
  }

  const intermediateComparison = tokenKey(
    left.intermediateToken,
  ).localeCompare(
    tokenKey(right.intermediateToken),
  );

  if (intermediateComparison !== 0) {
    return intermediateComparison;
  }

  const firstComparison = String(
    left.firstPool.id,
  ).localeCompare(String(right.firstPool.id));

  if (firstComparison !== 0) {
    return firstComparison;
  }

  const secondComparison = String(
    left.secondPool.id,
  ).localeCompare(String(right.secondPool.id));

  if (secondComparison !== 0) {
    return secondComparison;
  }

  return left.inputAmount < right.inputAmount
    ? -1
    : left.inputAmount > right.inputAmount
      ? 1
      : 0;
}

function createDefaultIdFactory(): OpportunityDetectorIdFactory {
  return Object.freeze({
    createRouteId(
      context: Readonly<{
        chainId: ChainId;
        firstPoolId: PoolId;
        secondPoolId: PoolId;
        inputAmount: TokenAmount;
        sequence: number;
      }>,
    ): ArbitrageRouteId {
      return [
        "route",
        Number(context.chainId),
        String(context.firstPoolId),
        String(context.secondPoolId),
        context.inputAmount.toString(),
        context.sequence,
      ].join(":") as ArbitrageRouteId;
    },

    createOpportunityId(
      context: Readonly<{
        chainId: ChainId;
        routeId: ArbitrageRouteId;
        fundingMode: ArbitrageFundingMode;
        sequence: number;
      }>,
    ): ArbitrageOpportunityId {
      return [
        "opportunity",
        Number(context.chainId),
        String(context.routeId),
        context.fundingMode,
        context.sequence,
      ].join(":") as ArbitrageOpportunityId;
    },
  });
}

function validationIssue(
  code: ValidationCode,
  message: string,
  options: Readonly<{
    severity?: ValidationSeverity;
    field?: string;
    legIndex?: number;
    dexId?: DexId;
    poolId?: PoolId;
    tokenAddress?: EvmAddress;
    metadata?: CrossDexArbitrageMetadata;
  }> = {},
): ValidationIssue {
  return Object.freeze({
    code,
    severity:
      options.severity ?? ValidationSeverity.ERROR,
    message,
    field: options.field,
    legIndex: options.legIndex,
    dexId: options.dexId,
    poolId: options.poolId,
    tokenAddress: options.tokenAddress,
    metadata: freezeMetadata(options.metadata),
  });
}

function bigintMinimum(
  left: bigint,
  right: bigint,
): bigint {
  return left < right ? left : right;
}

function calculateBasisPoints(
  numerator: bigint,
  denominator: bigint,
): BasisPoints {
  if (denominator <= 0n || numerator <= 0n) {
    return 0 as BasisPoints;
  }

  const value =
    (numerator * BASIS_POINTS_DENOMINATOR +
      denominator / 2n) /
    denominator;
  const numeric = Number(value);

  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, numeric),
  ) as BasisPoints;
}

function subtractFloorZero(
  left: bigint,
  right: bigint,
): bigint {
  return left > right ? left - right : 0n;
}

function validateRequest(
  request: ArbitrageDetectionRequest,
): void {
  if (request === null || typeof request !== "object") {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "Arbitrage detection request must be an object.",
      { details: request },
    );
  }

  if (
    !Number.isSafeInteger(request.chainId) ||
    Number(request.chainId) <= 0
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.chainId must be a positive safe integer.",
      { details: request.chainId },
    );
  }

  if (
    !Array.isArray(request.baseTokens) ||
    request.baseTokens.length === 0
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.baseTokens must contain at least one token.",
      { chainId: request.chainId },
    );
  }

  if (
    !Array.isArray(request.dexIds) ||
    request.dexIds.length === 0
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.dexIds must contain at least one DEX.",
      { chainId: request.chainId },
    );
  }

  if (
    !Array.isArray(request.poolStates) ||
    request.poolStates.length === 0
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.poolStates must contain at least one pool state.",
      { chainId: request.chainId },
    );
  }

  if (
    request.minimumInputAmount <= 0n ||
    request.maximumInputAmount <
      request.minimumInputAmount
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "Input amount bounds are invalid.",
      {
        chainId: request.chainId,
        details: {
          minimumInputAmount:
            request.minimumInputAmount,
          maximumInputAmount:
            request.maximumInputAmount,
        },
      },
    );
  }

  if (
    !Number.isSafeInteger(request.maximumRouteLegs) ||
    request.maximumRouteLegs < 2
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.maximumRouteLegs must be at least 2.",
      { chainId: request.chainId },
    );
  }

  for (const [field, value] of [
    [
      "minimumNetProfitBasisPoints",
      request.minimumNetProfitBasisPoints,
    ],
    [
      "maximumSlippageBasisPoints",
      request.maximumSlippageBasisPoints,
    ],
    [
      "maximumPriceImpactBasisPoints",
      request.maximumPriceImpactBasisPoints,
    ],
  ] as const) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 10_000
    ) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.INVALID_REQUEST,
        `${field} must be between 0 and 10,000.`,
        {
          chainId: request.chainId,
          details: value,
        },
      );
    }
  }

  if (
    !Number.isSafeInteger(
      request.maximumQuoteAgeMilliseconds,
    ) ||
    request.maximumQuoteAgeMilliseconds <= 0
  ) {
    throw new OpportunityDetectorError(
      OpportunityDetectorErrorCode.INVALID_REQUEST,
      "request.maximumQuoteAgeMilliseconds must be positive.",
      { chainId: request.chainId },
    );
  }
}

export class CrossDexArbitrageOpportunityDetector {
  private readonly dependencies: OpportunityDetectorDependencies;
  private readonly options: NormalizedDetectorOptions;
  private readonly idFactory: OpportunityDetectorIdFactory;
  private readonly priceNormalizer: CrossDexArbitragePriceNormalizer;

  public constructor(
    dependencies: OpportunityDetectorDependencies,
    options: OpportunityDetectorOptions = {},
  ) {
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      dependencies.clock === undefined ||
      dependencies.quoteProvider === undefined
    ) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.INVALID_OPTIONS,
        "clock and quoteProvider dependencies are required.",
      );
    }

    this.dependencies = dependencies;
    this.options = normalizeOptions(options);
    this.idFactory =
      dependencies.idFactory ??
      createDefaultIdFactory();
    this.priceNormalizer =
      dependencies.priceNormalizer ??
      createPriceNormalizer();
  }

  public async detect(
    request: ArbitrageDetectionRequest,
  ): Promise<OpportunityDetectorReport> {
    validateRequest(request);

    const startedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();
    const sourceBlockReference =
      this.resolveSourceBlockReference(
        request,
        startedAtMilliseconds,
      );

    if (
      !request.routeTypes.includes(
        ArbitrageRouteType.TWO_LEG,
      )
    ) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.UNSUPPORTED_ROUTE_TYPE,
        "This detector requires TWO_LEG in request.routeTypes.",
        { chainId: request.chainId },
      );
    }

    const counters: EvaluationCounters = {
      quoteRequestCount: 0,
      quoteFailureCount: 0,
      gasEstimationCount: 0,
      flashLiquidityQuoteCount: 0,
    };

    const rejections: OpportunityCandidateRejection[] = [];
    const candidates = this.buildCandidates(
      request,
      startedAtMilliseconds,
      rejections,
    );

    if (candidates.length === 0) {
      const completedAtMilliseconds =
        this.dependencies.clock.nowMilliseconds();

      return Object.freeze({
        chainId: request.chainId,
        evaluatedRouteCount: 0,
        rejectedRouteCount: rejections.length,
        opportunities: Object.freeze([]),
        blockReference: sourceBlockReference,
        startedAtMilliseconds,
        completedAtMilliseconds,
        metadata: freezeMetadata(request.metadata),
        evaluations: Object.freeze([]),
        rejections: Object.freeze(rejections),
        candidateCount: 0,
        ...counters,
      });
    }

    const workItems = candidates.flatMap(
      (candidate) =>
        request.fundingModes.map(
          (fundingMode, fundingIndex) =>
            Object.freeze({
              candidate,
              fundingMode:
                fundingMode === FundingMode.AUTO
                  ? FundingMode.WALLET
                  : fundingMode,
              sequence:
                candidates.indexOf(candidate) *
                  request.fundingModes.length +
                fundingIndex,
            }),
        ),
    );

    const evaluations =
      await this.mapConcurrent(
        workItems,
        this.options.maximumConcurrency,
        async (item) =>
          this.evaluateRoute({
            request,
            candidate: item.candidate,
            fundingMode: item.fundingMode,
            sequence: item.sequence,
            startedAtMilliseconds:
              this.dependencies.clock.nowMilliseconds(),
            sourceBlockReference,
            counters,
          }),
      );

    for (const evaluation of evaluations) {
      if (!evaluation.accepted) {
        rejections.push(
          Object.freeze({
            candidate: evaluation.candidate,
            fundingMode: evaluation.fundingMode,
            code:
              evaluation.errorCode ??
              evaluation.issues[0]?.code ??
              ValidationCode.INVALID_ROUTE,
            message:
              evaluation.errorMessage ??
              evaluation.issues[0]?.message ??
              "Route evaluation was rejected.",
            issues: evaluation.issues,
          }),
        );
      }
    }

    const opportunities = evaluations
      .flatMap((evaluation) =>
        evaluation.opportunity === undefined
          ? []
          : [evaluation.opportunity],
      )
      .sort(compareOpportunities)
      .slice(0, this.options.maximumOpportunities);

    const completedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    return Object.freeze({
      chainId: request.chainId,
      evaluatedRouteCount: evaluations.length,
      rejectedRouteCount:
        evaluations.length - opportunities.length,
      opportunities: Object.freeze(opportunities),
      blockReference: sourceBlockReference,
      startedAtMilliseconds,
      completedAtMilliseconds,
      metadata: freezeMetadata(request.metadata),
      evaluations: Object.freeze(evaluations),
      rejections: Object.freeze(
        this.options.includeRejectedCandidates
          ? rejections
          : [],
      ),
      candidateCount: candidates.length,
      ...counters,
    });
  }

  private buildCandidates(
    request: ArbitrageDetectionRequest,
    nowMilliseconds: UnixTimestampMilliseconds,
    rejections: OpportunityCandidateRejection[],
  ): readonly OpportunityCandidateDescriptor[] {
    const requestedDexes = new Set(
      request.dexIds.map(String),
    );
    const poolStates = [...request.poolStates]
      .filter(
        (state) =>
          state.pool.chainId === request.chainId &&
          requestedDexes.has(
            String(state.pool.dexId),
          ),
      )
      .sort(comparePoolStates);

    const eligibleStates = poolStates.filter(
      (state) => {
        const issues =
          this.validatePoolStateEligibility(
            state,
            request,
            nowMilliseconds,
          );

        if (issues.length === 0) {
          return true;
        }

        if (
          this.options.includeRejectedCandidates
        ) {
          const token =
            request.baseTokens.find(
              (candidate) =>
                poolContainsToken(
                  state.pool,
                  candidate,
                ),
            ) ?? state.pool.token0;

          rejections.push(
            Object.freeze({
              candidate: Object.freeze({
                chainId: request.chainId,
                inputToken: token,
                intermediateToken:
                  otherToken(
                    state.pool,
                    token,
                  ) ?? state.pool.token1,
                firstPool: state.pool,
                secondPool: state.pool,
                firstState: state,
                secondState: state,
                inputAmount:
                  request.minimumInputAmount,
              }),
              code: issues[0].code,
              message: issues[0].message,
              issues: Object.freeze(issues),
            }),
          );
        }

        return false;
      },
    );

    const amounts = this.buildInputAmounts(
      request.minimumInputAmount,
      request.maximumInputAmount,
    );
    const candidates: OpportunityCandidateDescriptor[] =
      [];
    const seen = new Set<string>();

    for (const inputToken of request.baseTokens) {
      if (inputToken.chainId !== request.chainId) {
        continue;
      }

      const firstStates = eligibleStates.filter(
        (state) =>
          poolContainsToken(
            state.pool,
            inputToken,
          ),
      );

      for (const firstState of firstStates) {
        const intermediateToken = otherToken(
          firstState.pool,
          inputToken,
        );

        if (intermediateToken === undefined) {
          continue;
        }

        const secondStates = eligibleStates.filter(
          (state) =>
            poolContainsToken(
              state.pool,
              intermediateToken,
            ) &&
            poolContainsToken(
              state.pool,
              inputToken,
            ),
        );

        for (const secondState of secondStates) {
          if (
            this.options.requireDifferentPools &&
            firstState.pool.id ===
              secondState.pool.id
          ) {
            continue;
          }

          if (
            this.options.requireDifferentDexes &&
            firstState.pool.dexId ===
              secondState.pool.dexId
          ) {
            continue;
          }

          for (const amount of amounts) {
            const key = [
              tokenKey(inputToken),
              tokenKey(intermediateToken),
              String(firstState.pool.id),
              String(secondState.pool.id),
              amount.toString(),
            ].join("|");

            if (seen.has(key)) {
              continue;
            }

            seen.add(key);
            candidates.push(
              Object.freeze({
                chainId: request.chainId,
                inputToken,
                intermediateToken,
                firstPool: firstState.pool,
                secondPool: secondState.pool,
                firstState,
                secondState,
                inputAmount: amount,
              }),
            );
          }
        }
      }
    }

    return Object.freeze(
      candidates.sort(compareCandidates),
    );
  }

  private validatePoolStateEligibility(
    state: DexPoolState,
    request: ArbitrageDetectionRequest,
    nowMilliseconds: UnixTimestampMilliseconds,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (state.pool.chainId !== request.chainId) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_CHAIN,
          "Pool state chain does not match the detection request.",
          {
            poolId: state.pool.id,
            dexId: state.pool.dexId,
          },
        ),
      );
    }

    if (state.pool.status !== PoolStatus.ACTIVE) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_POOL,
          `Pool "${state.pool.id}" is not active.`,
          {
            poolId: state.pool.id,
            dexId: state.pool.dexId,
          },
        ),
      );
    }

    if (
      this.options.rejectStalePoolStates &&
      nowMilliseconds -
        state.observedAtMilliseconds >
        this.options
          .maximumPoolStateAgeMilliseconds
    ) {
      issues.push(
        validationIssue(
          ValidationCode.STALE_POOL_STATE,
          `Pool "${state.pool.id}" state is stale.`,
          {
            poolId: state.pool.id,
            dexId: state.pool.dexId,
          },
        ),
      );
    }

    if (
      state.observedAtMilliseconds >
      nowMilliseconds
    ) {
      issues.push(
        validationIssue(
          ValidationCode.STALE_POOL_STATE,
          `Pool "${state.pool.id}" state is observed in the future.`,
          {
            poolId: state.pool.id,
            dexId: state.pool.dexId,
          },
        ),
      );
    }

    return Object.freeze(issues);
  }

  private buildInputAmounts(
    minimum: TokenAmount,
    maximum: TokenAmount,
  ): readonly TokenAmount[] {
    if (minimum === maximum) {
      return Object.freeze([minimum]);
    }

    const midpoint =
      ((minimum + maximum) / 2n) as TokenAmount;

    return Object.freeze(
      [...new Set<bigint>([
        minimum,
        midpoint,
        maximum,
      ])]
        .sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(
          (value) => value as TokenAmount,
        ),
    );
  }

  private async evaluateRoute(
    context: RouteEvaluationContext,
  ): Promise<OpportunityRouteEvaluation> {
    const issues: ValidationIssue[] = [];

    try {
      const firstQuote =
        await this.requestQuote(
          context.candidate.firstPool,
          context.candidate.inputToken,
          context.candidate.intermediateToken,
          context.candidate.inputAmount,
          context.request,
          context.counters,
        );

      const secondQuote =
        await this.requestQuote(
          context.candidate.secondPool,
          context.candidate.intermediateToken,
          context.candidate.inputToken,
          firstQuote.amountOut,
          context.request,
          context.counters,
        );

      issues.push(
        ...this.validateQuote(
          firstQuote,
          context.candidate.firstPool,
          context.candidate.inputToken,
          context.candidate.intermediateToken,
          context.request,
          0,
        ),
        ...this.validateQuote(
          secondQuote,
          context.candidate.secondPool,
          context.candidate.intermediateToken,
          context.candidate.inputToken,
          context.request,
          1,
        ),
      );

      const deadlineMilliseconds =
        Math.min(
          firstQuote.expiresAtMilliseconds,
          secondQuote.expiresAtMilliseconds,
          Number(
            context.sourceBlockReference
              .timestampMilliseconds,
          ) +
            this.options
              .opportunityLifetimeMilliseconds,
        ) as UnixTimestampMilliseconds;

      const firstLeg = await this.createLeg(
        firstQuote,
        0,
        deadlineMilliseconds,
      );
      const secondLeg = await this.createLeg(
        secondQuote,
        1,
        deadlineMilliseconds,
      );

      const routeId =
        this.idFactory.createRouteId({
          chainId: context.request.chainId,
          firstPoolId:
            context.candidate.firstPool.id,
          secondPoolId:
            context.candidate.secondPool.id,
          inputAmount:
            context.candidate.inputAmount,
          sequence: context.sequence,
        });

      const route: ArbitrageRoute =
        Object.freeze({
          id: routeId,
          chainId: context.request.chainId,
          type: ArbitrageRouteType.TWO_LEG,
          startToken:
            context.candidate.inputToken,
          endToken:
            context.candidate.inputToken,
          inputAmount:
            context.candidate.inputAmount,
          expectedFinalAmount:
            secondQuote.amountOut,
          minimumFinalAmount:
            secondQuote.minimumAmountOut,
          legs: Object.freeze([
            firstLeg,
            secondLeg,
          ]),
          isAtomic: true,
          blockReference:
            context.sourceBlockReference,
          createdAtMilliseconds:
            context.startedAtMilliseconds,
          expiresAtMilliseconds:
            deadlineMilliseconds,
          metadata: mergeMetadata(
            context.request.metadata,
            Object.freeze({
              detector: "cross-dex-two-leg",
              firstPoolId: String(
                context.candidate.firstPool.id,
              ),
              secondPoolId: String(
                context.candidate.secondPool.id,
              ),
            }),
          ),
        });

      let gasEstimate: GasCostEstimate | undefined;

      if (
        this.dependencies.gasEstimator !==
        undefined
      ) {
        context.counters.gasEstimationCount += 1;

        try {
          gasEstimate =
            await this.dependencies.gasEstimator.estimate(
              route,
            );
        } catch (cause) {
          throw new OpportunityDetectorError(
            OpportunityDetectorErrorCode.GAS_ESTIMATION_FAILED,
            "Gas estimation failed.",
            {
              chainId: route.chainId,
              cause,
            },
          );
        }
      }

      const flashLiquidityQuote =
        await this.resolveFlashLiquidityQuote(
          context,
        );

      if (
        context.fundingMode ===
          FundingMode.FLASH_LOAN &&
        flashLiquidityQuote === undefined
      ) {
        issues.push(
          validationIssue(
            ValidationCode.FLASH_LIQUIDITY_UNAVAILABLE,
            "Flash-loan liquidity is unavailable.",
            {
              field: "fundingMode",
            },
          ),
        );
      }

      const profitability =
        await this.calculateProfitability(
          route,
          gasEstimate,
          flashLiquidityQuote,
          context.request,
        );

      issues.push(
        ...this.validateProfitability(
          route,
          profitability,
          firstQuote,
          secondQuote,
          context.request,
        ),
      );

      const accepted = !issues.some(
        (issue) =>
          issue.severity ===
            ValidationSeverity.ERROR ||
          issue.severity ===
            ValidationSeverity.FATAL,
      );

      const completedAtMilliseconds =
        this.dependencies.clock.nowMilliseconds();

      if (!accepted) {
        return Object.freeze({
          candidate: context.candidate,
          fundingMode: context.fundingMode,
          route,
          profitability,
          accepted: false,
          issues: Object.freeze(issues),
          startedAtMilliseconds:
            context.startedAtMilliseconds,
          completedAtMilliseconds,
        });
      }

      const opportunityId =
        this.idFactory.createOpportunityId({
          chainId: route.chainId,
          routeId: route.id,
          fundingMode: context.fundingMode,
          sequence: context.sequence,
        });

      const confidence =
        this.calculateConfidence(
          firstQuote,
          secondQuote,
          profitability,
        );

      const opportunity: ArbitrageOpportunity =
        Object.freeze({
          id: opportunityId,
          chainId: route.chainId,
          route,
          fundingMode: context.fundingMode,
          flashLiquidityQuote,
          profitability,
          status:
            ArbitrageOpportunityStatus.VALID,
          confidence,
          sourceBlockReference:
            context.sourceBlockReference,
          detectedAtMilliseconds:
            completedAtMilliseconds,
          expiresAtMilliseconds:
            route.expiresAtMilliseconds,
          validationIssues:
            Object.freeze(issues),
          metadata: mergeMetadata(
            context.request.metadata,
            Object.freeze({
              detector: "opportunity-detector",
              confidence,
            }),
          ),
        });

      return Object.freeze({
        candidate: context.candidate,
        fundingMode: context.fundingMode,
        route,
        profitability,
        opportunity,
        accepted: true,
        issues: Object.freeze(issues),
        startedAtMilliseconds:
          context.startedAtMilliseconds,
        completedAtMilliseconds,
      });
    } catch (error) {
      if (!this.options.continueOnRouteFailure) {
        throw error;
      }

      const normalized =
        error instanceof OpportunityDetectorError
          ? error
          : new OpportunityDetectorError(
              OpportunityDetectorErrorCode.DETECTION_ABORTED,
              error instanceof Error
                ? error.message
                : "Unknown route evaluation error.",
              {
                chainId:
                  context.request.chainId,
                cause: error,
              },
            );

      return Object.freeze({
        candidate: context.candidate,
        fundingMode: context.fundingMode,
        accepted: false,
        issues: Object.freeze([
          validationIssue(
            ValidationCode.INVALID_ROUTE,
            normalized.message,
            {
              severity:
                ValidationSeverity.ERROR,
            },
          ),
        ]),
        startedAtMilliseconds:
          context.startedAtMilliseconds,
        completedAtMilliseconds:
          this.dependencies.clock.nowMilliseconds(),
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
    }
  }

  private async requestQuote(
    pool: DexPoolDescriptor,
    tokenIn: TokenDescriptor,
    tokenOut: TokenDescriptor,
    amount: TokenAmount,
    request: ArbitrageDetectionRequest,
    counters: EvaluationCounters,
  ): Promise<DexQuote> {
    counters.quoteRequestCount += 1;

    try {
      return await this.dependencies.quoteProvider.quote(
        Object.freeze({
          chainId: request.chainId,
          dexId: pool.dexId,
          poolId: pool.id,
          tokenIn,
          tokenOut,
          direction: SwapDirection.EXACT_INPUT,
          amount,
          recipient:
            this.options.quoteRecipient,
          blockNumber:
            this.resolveMinimumBlock(
              request.poolStates,
            ),
          maxSlippageBasisPoints:
            request.maximumSlippageBasisPoints,
          metadata: mergeMetadata(
            request.metadata,
            Object.freeze({
              detector: "opportunity-detector",
            }),
          ),
        }),
      );
    } catch (cause) {
      counters.quoteFailureCount += 1;

      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.QUOTE_FAILED,
        `Quote request failed for pool "${pool.id}".`,
        {
          chainId: pool.chainId,
          dexId: pool.dexId,
          poolId: pool.id,
          cause,
        },
      );
    }
  }

  private validateQuote(
    quote: DexQuote,
    pool: DexPoolDescriptor,
    tokenIn: TokenDescriptor,
    tokenOut: TokenDescriptor,
    request: ArbitrageDetectionRequest,
    legIndex: number,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const now =
      this.dependencies.clock.nowMilliseconds();

    if (
      quote.chainId !== request.chainId ||
      quote.dexId !== pool.dexId ||
      quote.poolId !== pool.id
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_ROUTE,
          "Quote identity does not match the requested pool.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    if (
      !sameToken(quote.tokenIn, tokenIn) ||
      !sameToken(quote.tokenOut, tokenOut)
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_PAIR,
          "Quote token pair does not match the requested direction.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    if (
      quote.amountIn <= 0n ||
      quote.amountOut <= 0n ||
      quote.minimumAmountOut <= 0n ||
      quote.minimumAmountOut >
        quote.amountOut
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_AMOUNT,
          "Quote contains invalid input or output amounts.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    const age =
      now - quote.quotedAtMilliseconds;

    if (
      age < 0 ||
      age >
        request.maximumQuoteAgeMilliseconds ||
      quote.expiresAtMilliseconds <= now
    ) {
      issues.push(
        validationIssue(
          ValidationCode.STALE_QUOTE,
          "Quote is stale, expired, or observed in the future.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    if (
      quote.estimatedSlippageBasisPoints >
      request.maximumSlippageBasisPoints
    ) {
      issues.push(
        validationIssue(
          ValidationCode.SLIPPAGE_TOO_HIGH,
          "Quote slippage exceeds the request limit.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    if (
      quote.priceImpactBasisPoints >
      request.maximumPriceImpactBasisPoints
    ) {
      issues.push(
        validationIssue(
          ValidationCode.PRICE_IMPACT_TOO_HIGH,
          "Quote price impact exceeds the request limit.",
          {
            legIndex,
            dexId: pool.dexId,
            poolId: pool.id,
          },
        ),
      );
    }

    return Object.freeze(issues);
  }

  private async createLeg(
    quote: DexQuote,
    legIndex: number,
    deadlineMilliseconds: UnixTimestampMilliseconds,
  ): Promise<ArbitrageLeg> {
    let encoded:
      | Readonly<{
          target: EvmAddress;
          calldata: HexData;
          value?: WeiAmount;
          metadata?: CrossDexArbitrageMetadata;
        }>
      | undefined;

    if (
      this.dependencies.legEncoder !== undefined
    ) {
      try {
        encoded =
          await this.dependencies.legEncoder.encode(
            quote,
            {
              legIndex,
              recipient:
                this.options.quoteRecipient,
              deadlineMilliseconds,
            },
          );
      } catch (cause) {
        throw new OpportunityDetectorError(
          OpportunityDetectorErrorCode.LEG_ENCODING_FAILED,
          `Leg ${legIndex} encoding failed.`,
          {
            chainId: quote.chainId,
            dexId: quote.dexId,
            poolId: quote.poolId,
            cause,
          },
        );
      }
    }

    const target =
      encoded?.target ?? quote.routeTarget;
    const calldata =
      encoded?.calldata ?? quote.routeCalldata;

    if (
      this.options.requireEncodedLegs &&
      (target === undefined ||
        calldata === undefined)
    ) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.LEG_ENCODING_FAILED,
        `Leg ${legIndex} does not contain executable target and calldata.`,
        {
          chainId: quote.chainId,
          dexId: quote.dexId,
          poolId: quote.poolId,
        },
      );
    }

    return Object.freeze({
      legIndex,
      chainId: quote.chainId,
      dexId: quote.dexId,
      poolId: quote.poolId,
      tokenIn: quote.tokenIn,
      tokenOut: quote.tokenOut,
      amountIn: quote.amountIn,
      expectedAmountOut: quote.amountOut,
      minimumAmountOut:
        quote.minimumAmountOut,
      quote,
      target: target ?? ZERO_ADDRESS,
      calldata: calldata ?? EMPTY_CALLDATA,
      value: encoded?.value ?? (0n as WeiAmount),
      metadata: mergeMetadata(
        quote.metadata,
        encoded?.metadata,
      ),
    });
  }

  private async resolveFlashLiquidityQuote(
    context: RouteEvaluationContext,
  ): Promise<FlashLiquidityQuote | undefined> {
    if (
      context.fundingMode !==
        FundingMode.FLASH_LOAN &&
      context.fundingMode !==
        FundingMode.FLASH_SWAP
    ) {
      return undefined;
    }

    if (
      this.dependencies
        .flashLiquidityProvider === undefined
    ) {
      return undefined;
    }

    context.counters.flashLiquidityQuoteCount += 1;

    try {
      const quote =
        await this.dependencies.flashLiquidityProvider.quote(
          Object.freeze({
            chainId: context.request.chainId,
            fundingMode: context.fundingMode,
            asset:
              context.candidate.inputToken,
            amount:
              context.candidate.inputAmount,
            blockNumber:
              context.sourceBlockReference
                .blockNumber,
            metadata:
              context.request.metadata,
          }),
        );

      if (
        quote !== undefined &&
        (quote.availableAmount <
          context.candidate.inputAmount ||
          quote.requestedAmount !==
            context.candidate.inputAmount)
      ) {
        return undefined;
      }

      return quote;
    } catch (cause) {
      if (!this.options.continueOnRouteFailure) {
        throw new OpportunityDetectorError(
          OpportunityDetectorErrorCode.FLASH_LIQUIDITY_FAILED,
          "Flash-liquidity quote failed.",
          {
            chainId: context.request.chainId,
            cause,
          },
        );
      }

      return undefined;
    }
  }

  private async calculateProfitability(
    route: ArbitrageRoute,
    gasEstimate: GasCostEstimate | undefined,
    flashLiquidityQuote:
      | FlashLiquidityQuote
      | undefined,
    request: ArbitrageDetectionRequest,
  ): Promise<ArbitrageProfitability> {
    const inputAmount = route.inputAmount;
    const grossOutputAmount =
      route.expectedFinalAmount;
    const grossProfitAmount =
      subtractFloorZero(
        grossOutputAmount,
        inputAmount,
      ) as TokenAmount;

    const totalDexFeeAmount =
      route.legs.reduce(
        (total, leg) =>
          total + leg.quote.dexFee.feeAmount,
        0n,
      ) as TokenAmount;

    const slippageCostAmount =
      route.legs.reduce(
        (total, leg) => {
          const difference =
            leg.expectedAmountOut >
            leg.minimumAmountOut
              ? leg.expectedAmountOut -
                leg.minimumAmountOut
              : 0n;

          return total + difference;
        },
        0n,
      ) as TokenAmount;

    const priceImpactCostAmount =
      route.legs.reduce(
        (total, leg) =>
          total +
          (leg.amountIn *
            BigInt(
              leg.quote
                .priceImpactBasisPoints,
            )) /
            BASIS_POINTS_DENOMINATOR,
        0n,
      ) as TokenAmount;

    const flashLoanPremiumAmount =
      flashLiquidityQuote?.premiumAmount ??
      (0n as TokenAmount);
    const gasCostWei =
      gasEstimate?.estimatedCostWei ??
      (0n as WeiAmount);

    let gasCostInInputToken =
      0n as TokenAmount;

    if (
      gasCostWei > 0n &&
      this.dependencies.gasCostConverter !==
        undefined
    ) {
      gasCostInInputToken =
        await this.dependencies.gasCostConverter.convertWeiToToken(
          gasCostWei,
          route.startToken,
          route.blockReference,
        );
    }

    const totalEstimatedCostAmount =
      (totalDexFeeAmount +
        slippageCostAmount +
        priceImpactCostAmount +
        flashLoanPremiumAmount +
        gasCostInInputToken) as TokenAmount;

    const netProfitAmount =
      subtractFloorZero(
        grossProfitAmount,
        totalEstimatedCostAmount,
      ) as TokenAmount;
    const netOutputAmount =
      (inputAmount + netProfitAmount) as TokenAmount;

    const grossProfitBasisPoints =
      calculateBasisPoints(
        grossProfitAmount,
        inputAmount,
      );
    const netProfitBasisPoints =
      calculateBasisPoints(
        netProfitAmount,
        inputAmount,
      );

    const costs: ArbitrageCostBreakdown =
      Object.freeze({
        inputToken: route.startToken,
        inputAmount,
        totalDexFeeAmount,
        totalDexFeeUsd:
          this.sumOptionalNumbers(
            route.legs.map(
              (leg) =>
                leg.quote.dexFee
                  .feeAmountUsd,
            ),
          ),
        flashLoanPremiumAmount,
        flashLoanPremiumUsd:
          flashLiquidityQuote?.premiumAmountUsd,
        gasCostWei,
        gasCostUsd:
          gasEstimate?.estimatedCostUsd,
        slippageCostAmount,
        priceImpactCostAmount,
        totalEstimatedCostAmount,
        totalEstimatedCostUsd:
          this.sumOptionalNumbers([
            this.sumOptionalNumbers(
              route.legs.map(
                (leg) =>
                  leg.quote.dexFee
                    .feeAmountUsd,
              ),
            ),
            flashLiquidityQuote?.premiumAmountUsd,
            gasEstimate?.estimatedCostUsd,
          ]),
        metadata: freezeMetadata(
          request.metadata,
        ),
      });

    return Object.freeze({
      inputToken: route.startToken,
      inputAmount,
      grossOutputAmount,
      grossProfitAmount,
      costs,
      netOutputAmount,
      netProfitAmount,
      grossProfitBasisPoints,
      netProfitBasisPoints,
      returnOnGas:
        gasEstimate?.estimatedCostUsd !==
          undefined &&
        gasEstimate.estimatedCostUsd > 0
          ? undefined
          : undefined,
      profitable:
        netProfitAmount > 0n &&
        netProfitAmount >=
          request.minimumNetProfitAmount &&
        netProfitBasisPoints >=
          request.minimumNetProfitBasisPoints,
      metadata: freezeMetadata(
        request.metadata,
      ),
    });
  }

  private validateProfitability(
    route: ArbitrageRoute,
    profitability: ArbitrageProfitability,
    firstQuote: DexQuote,
    secondQuote: DexQuote,
    request: ArbitrageDetectionRequest,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (
      route.legs.length >
      request.maximumRouteLegs
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_ROUTE,
          "Route contains too many legs.",
          { field: "maximumRouteLegs" },
        ),
      );
    }

    if (
      request.requireAtomicExecution &&
      !route.isAtomic
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_ROUTE,
          "Route must support atomic execution.",
          { field: "requireAtomicExecution" },
        ),
      );
    }

    if (
      route.inputAmount <
        request.minimumInputAmount ||
      route.inputAmount >
        request.maximumInputAmount
    ) {
      issues.push(
        validationIssue(
          ValidationCode.INVALID_AMOUNT,
          "Route input amount is outside request bounds.",
          { field: "inputAmount" },
        ),
      );
    }

    if (
      profitability.netProfitAmount <
      request.minimumNetProfitAmount
    ) {
      issues.push(
        validationIssue(
          ValidationCode.NET_PROFIT_TOO_LOW,
          "Estimated net profit amount is below the minimum.",
          { field: "minimumNetProfitAmount" },
        ),
      );
    }

    if (
      profitability.netProfitBasisPoints <
      request.minimumNetProfitBasisPoints
    ) {
      issues.push(
        validationIssue(
          ValidationCode.PROFIT_MARGIN_TOO_LOW,
          "Estimated net profit margin is below the minimum.",
          {
            field:
              "minimumNetProfitBasisPoints",
          },
        ),
      );
    }

    if (
      firstQuote.estimatedSlippageBasisPoints +
        secondQuote.estimatedSlippageBasisPoints >
      request.maximumSlippageBasisPoints * 2
    ) {
      issues.push(
        validationIssue(
          ValidationCode.SLIPPAGE_TOO_HIGH,
          "Combined route slippage exceeds the aggregate limit.",
        ),
      );
    }

    if (
      firstQuote.priceImpactBasisPoints +
        secondQuote.priceImpactBasisPoints >
      request.maximumPriceImpactBasisPoints * 2
    ) {
      issues.push(
        validationIssue(
          ValidationCode.PRICE_IMPACT_TOO_HIGH,
          "Combined route price impact exceeds the aggregate limit.",
        ),
      );
    }

    return Object.freeze(issues);
  }

  private calculateConfidence(
    firstQuote: DexQuote,
    secondQuote: DexQuote,
    profitability: ArbitrageProfitability,
  ): number {
    const agePenalty = Math.min(
      0.25,
      Math.max(
        0,
        (this.dependencies.clock.nowMilliseconds() -
          Math.min(
            firstQuote.quotedAtMilliseconds,
            secondQuote.quotedAtMilliseconds,
          )) /
          60_000,
      ),
    );

    const slippagePenalty = Math.min(
      0.25,
      (firstQuote.estimatedSlippageBasisPoints +
        secondQuote.estimatedSlippageBasisPoints) /
        40_000,
    );

    const impactPenalty = Math.min(
      0.25,
      (firstQuote.priceImpactBasisPoints +
        secondQuote.priceImpactBasisPoints) /
        40_000,
    );

    const profitBonus = Math.min(
      0.25,
      profitability.netProfitBasisPoints /
        10_000,
    );

    return Math.min(
      this.options.confidenceCeiling,
      Math.max(
        this.options.confidenceFloor,
        0.75 -
          agePenalty -
          slippagePenalty -
          impactPenalty +
          profitBonus,
      ),
    );
  }

  private resolveSourceBlockReference(
    request: ArbitrageDetectionRequest,
    timestampMilliseconds: UnixTimestampMilliseconds,
  ): EvmBlockReference {
    const states = request.poolStates.filter(
      (state) =>
        state.blockReference.chainId ===
        request.chainId,
    );

    if (states.length === 0) {
      throw new OpportunityDetectorError(
        OpportunityDetectorErrorCode.BLOCK_REFERENCE_UNAVAILABLE,
        "No pool-state block reference exists for the requested chain.",
        { chainId: request.chainId },
      );
    }

    const blockNumber = states.reduce(
      (minimum, state) =>
        state.blockReference.blockNumber <
        minimum
          ? state.blockReference.blockNumber
          : minimum,
      states[0].blockReference.blockNumber,
    );

    const exact = states.find(
      (state) =>
        state.blockReference.blockNumber ===
        blockNumber,
    );

    return Object.freeze({
      chainId: request.chainId,
      blockNumber,
      blockHash:
        exact?.blockReference.blockHash,
      timestampMilliseconds,
    });
  }

  private resolveMinimumBlock(
    states: readonly DexPoolState[],
  ): BlockNumber {
    return states.reduce(
      (minimum, state) =>
        state.blockReference.blockNumber <
        minimum
          ? state.blockReference.blockNumber
          : minimum,
      states[0].blockReference.blockNumber,
    );
  }

  private sumOptionalNumbers(
    values: readonly (number | undefined)[],
  ): number | undefined {
    const defined = values.filter(
      (value): value is number =>
        value !== undefined &&
        Number.isFinite(value),
    );

    return defined.length === 0
      ? undefined
      : defined.reduce(
          (total, value) => total + value,
          0,
        );
  }

  private async mapConcurrent<TInput, TOutput>(
    values: readonly TInput[],
    maximumConcurrency: number,
    worker: (
      value: TInput,
      index: number,
    ) => Promise<TOutput>,
  ): Promise<readonly TOutput[]> {
    const results = new Array<TOutput>(
      values.length,
    );
    let nextIndex = 0;

    const runners = Array.from(
      {
        length: Math.min(
          maximumConcurrency,
          values.length,
        ),
      },
      async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;

          if (index >= values.length) {
            return;
          }

          results[index] = await worker(
            values[index],
            index,
          );
        }
      },
    );

    await Promise.all(runners);
    return Object.freeze(results);
  }
}

function compareOpportunities(
  left: ArbitrageOpportunity,
  right: ArbitrageOpportunity,
): number {
  if (
    left.profitability.netProfitAmount !==
    right.profitability.netProfitAmount
  ) {
    return left.profitability.netProfitAmount >
      right.profitability.netProfitAmount
      ? -1
      : 1;
  }

  if (
    left.profitability.netProfitBasisPoints !==
    right.profitability.netProfitBasisPoints
  ) {
    return (
      right.profitability
        .netProfitBasisPoints -
      left.profitability.netProfitBasisPoints
    );
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return String(left.id).localeCompare(
    String(right.id),
  );
}

export function createOpportunityDetector(
  dependencies: OpportunityDetectorDependencies,
  options: OpportunityDetectorOptions = {},
): CrossDexArbitrageOpportunityDetector {
  return new CrossDexArbitrageOpportunityDetector(
    dependencies,
    options,
  );
}