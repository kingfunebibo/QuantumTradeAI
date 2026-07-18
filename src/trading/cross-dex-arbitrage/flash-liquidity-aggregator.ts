/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic flash-liquidity aggregator.
 *
 * Responsibilities:
 * - Resolve eligible flash-loan and flash-swap providers.
 * - Query providers with bounded deterministic concurrency.
 * - Validate provider availability and returned quote integrity.
 * - Rank valid quotes by effective repayment cost and preference policy.
 * - Preserve provider failures and rejection reasons for auditability.
 * - Produce immutable aggregation and selection results.
 *
 * This module performs no RPC by itself. Network access only occurs through
 * explicitly registered FlashLiquidityProvider adapters.
 */

import {
  type BasisPoints,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type EvmAddress,
  type FlashLiquidityProvider,
  type FlashLiquidityQuote,
  type FlashLiquidityRequest,
  FlashLiquidityType,
  type FlashLoanProviderDescriptor,
  type FlashLoanProviderId,
  type FlashLoanProtocol,
  type HexData,
  type TokenAmount,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
  type ValidationResult,
  ValidationSeverity,
} from "./cross-dex-arbitrage-contracts";
import {
  type FlashLoanProviderCandidate,
  FlashLoanProviderRegistry,
  type FlashLoanProviderSelectionRequest,
} from "./flash-loan-provider-registry";

export enum FlashLiquidityAggregatorErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  NO_ELIGIBLE_PROVIDER = "NO_ELIGIBLE_PROVIDER",
  NO_VALID_QUOTE = "NO_VALID_QUOTE",
  PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT",
  PROVIDER_FAILURE = "PROVIDER_FAILURE",
  INVALID_QUOTE = "INVALID_QUOTE",
  AGGREGATION_CANCELLED = "AGGREGATION_CANCELLED",
}

export class FlashLiquidityAggregatorError extends Error {
  public readonly code: FlashLiquidityAggregatorErrorCode;
  public readonly providerId?: FlashLoanProviderId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: FlashLiquidityAggregatorErrorCode,
    message: string,
    options: Readonly<{
      providerId?: FlashLoanProviderId;
      chainId?: ChainId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "FlashLiquidityAggregatorError";
    this.code = code;
    this.providerId = options.providerId;
    this.chainId = options.chainId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface FlashLiquidityAggregatorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface FlashLiquidityAggregatorDependencies {
  readonly registry: FlashLoanProviderRegistry;
  readonly clock: FlashLiquidityAggregatorClock;
}

export interface FlashLiquidityAggregatorOptions {
  readonly maximumConcurrentProviders?: number;
  readonly providerTimeoutMilliseconds?: number;
  readonly requireAvailabilityValidation?: boolean;
  readonly rejectExpiredQuotes?: boolean;
  readonly rejectFutureQuotes?: boolean;
  readonly maximumQuoteAgeMilliseconds?: number;
  readonly requireExactRequestedAmount?: boolean;
  readonly requireDescriptorPremiumMatch?: boolean;
  readonly stopAfterFirstValidQuote?: boolean;
}

export interface FlashLiquidityAggregationRequest {
  readonly chainId: ChainId;
  readonly liquidityType: FlashLiquidityType;
  readonly borrowerAddress: EvmAddress;
  readonly asset: TokenDescriptor;
  readonly amount: TokenAmount;
  readonly callbackData: HexData;
  readonly preferredProtocols?: readonly FlashLoanProtocol[];
  readonly excludedProviderIds?: readonly FlashLoanProviderId[];
  readonly maximumPremiumBasisPoints?: BasisPoints;
  readonly requireMultiAssetSupport?: boolean;
  readonly minimumAvailableAmount?: TokenAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export enum FlashLiquidityCandidateStatus {
  VALID = "VALID",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
  TIMED_OUT = "TIMED_OUT",
  CANCELLED = "CANCELLED",
}

export interface FlashLiquidityCandidateEvaluation {
  readonly provider: FlashLoanProviderDescriptor;
  readonly status: FlashLiquidityCandidateStatus;
  readonly quote?: FlashLiquidityQuote;
  readonly availability?: ValidationResult;
  readonly rejectionReasons: readonly string[];
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityAggregationResult {
  readonly request: FlashLiquidityAggregationRequest;
  readonly candidates: readonly FlashLiquidityCandidateEvaluation[];
  readonly validQuotes: readonly FlashLiquidityQuote[];
  readonly bestQuote?: FlashLiquidityQuote;
  readonly evaluatedProviderCount: number;
  readonly validQuoteCount: number;
  readonly rejectedProviderCount: number;
  readonly failedProviderCount: number;
  readonly timedOutProviderCount: number;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityQuoteComparison {
  readonly leftProviderId: FlashLoanProviderId;
  readonly rightProviderId: FlashLoanProviderId;
  readonly repaymentDifference: bigint;
  readonly premiumDifference: bigint;
  readonly availabilityDifference: bigint;
  readonly expiryDifferenceMilliseconds: number;
  readonly preferredProviderId: FlashLoanProviderId;
}

interface NormalizedAggregatorOptions {
  readonly maximumConcurrentProviders: number;
  readonly providerTimeoutMilliseconds: number;
  readonly requireAvailabilityValidation: boolean;
  readonly rejectExpiredQuotes: boolean;
  readonly rejectFutureQuotes: boolean;
  readonly maximumQuoteAgeMilliseconds: number;
  readonly requireExactRequestedAmount: boolean;
  readonly requireDescriptorPremiumMatch: boolean;
  readonly stopAfterFirstValidQuote: boolean;
}

const DEFAULT_OPTIONS: NormalizedAggregatorOptions =
  Object.freeze({
    maximumConcurrentProviders: 4,
    providerTimeoutMilliseconds: 5_000,
    requireAvailabilityValidation: true,
    rejectExpiredQuotes: true,
    rejectFutureQuotes: true,
    maximumQuoteAgeMilliseconds: 5_000,
    requireExactRequestedAmount: true,
    requireDescriptorPremiumMatch: false,
    stopAfterFirstValidQuote: false,
  });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function normalizeOptions(
  options: FlashLiquidityAggregatorOptions,
): NormalizedAggregatorOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(
      merged.maximumConcurrentProviders,
    ) ||
    merged.maximumConcurrentProviders <= 0
  ) {
    throw new FlashLiquidityAggregatorError(
      FlashLiquidityAggregatorErrorCode.INVALID_OPTIONS,
      "maximumConcurrentProviders must be a positive safe integer.",
      {
        details:
          merged.maximumConcurrentProviders,
      },
    );
  }

  if (
    !Number.isSafeInteger(
      merged.providerTimeoutMilliseconds,
    ) ||
    merged.providerTimeoutMilliseconds <= 0
  ) {
    throw new FlashLiquidityAggregatorError(
      FlashLiquidityAggregatorErrorCode.INVALID_OPTIONS,
      "providerTimeoutMilliseconds must be a positive safe integer.",
      {
        details:
          merged.providerTimeoutMilliseconds,
      },
    );
  }

  if (
    !Number.isSafeInteger(
      merged.maximumQuoteAgeMilliseconds,
    ) ||
    merged.maximumQuoteAgeMilliseconds < 0
  ) {
    throw new FlashLiquidityAggregatorError(
      FlashLiquidityAggregatorErrorCode.INVALID_OPTIONS,
      "maximumQuoteAgeMilliseconds must be a non-negative safe integer.",
      {
        details:
          merged.maximumQuoteAgeMilliseconds,
      },
    );
  }

  return Object.freeze(merged);
}

function addressKey(
  address: EvmAddress,
): string {
  return String(address).toLowerCase();
}

function sameToken(
  left: TokenDescriptor,
  right: TokenDescriptor,
): boolean {
  return (
    left.chainId === right.chainId &&
    addressKey(left.address) ===
      addressKey(right.address)
  );
}

function issueReasons(
  validation: ValidationResult,
): readonly string[] {
  return Object.freeze(
    validation.issues.map(
      (issue: ValidationIssue) =>
        `${issue.code}: ${issue.message}`,
    ),
  );
}

function hasBlockingIssue(
  validation: ValidationResult,
): boolean {
  return validation.issues.some(
    (issue: ValidationIssue) =>
      issue.severity === ValidationSeverity.ERROR ||
      issue.severity === ValidationSeverity.FATAL,
  );
}

function cloneRequest(
  request: FlashLiquidityAggregationRequest,
): FlashLiquidityAggregationRequest {
  return Object.freeze({
    ...request,
    preferredProtocols:
      request.preferredProtocols === undefined
        ? undefined
        : Object.freeze([
            ...request.preferredProtocols,
          ]),
    excludedProviderIds:
      request.excludedProviderIds === undefined
        ? undefined
        : Object.freeze([
            ...request.excludedProviderIds,
          ]),
    metadata: freezeMetadata(request.metadata),
  });
}

function errorCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code ===
      "string"
  ) {
    return (error as { code: string }).code;
  }

  return "PROVIDER_FAILURE";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Flash-liquidity provider operation failed.";
}

export class FlashLiquidityAggregator {
  private readonly dependencies:
    FlashLiquidityAggregatorDependencies;
  private readonly options:
    NormalizedAggregatorOptions;

  public constructor(
    dependencies:
      FlashLiquidityAggregatorDependencies,
    options:
      FlashLiquidityAggregatorOptions = {},
  ) {
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      dependencies.registry === undefined ||
      dependencies.clock === undefined ||
      typeof dependencies.clock.nowMilliseconds !==
        "function"
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_OPTIONS,
        "registry and clock dependencies are required.",
      );
    }

    this.dependencies = dependencies;
    this.options = normalizeOptions(options);
  }

  public async aggregate(
    request: FlashLiquidityAggregationRequest,
  ): Promise<FlashLiquidityAggregationResult> {
    this.validateRequest(request);

    const startedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    const candidates =
      this.resolveCandidates(request);

    if (candidates.length === 0) {
      return Object.freeze({
        request: cloneRequest(request),
        candidates: Object.freeze([]),
        validQuotes: Object.freeze([]),
        evaluatedProviderCount: 0,
        validQuoteCount: 0,
        rejectedProviderCount: 0,
        failedProviderCount: 0,
        timedOutProviderCount: 0,
        startedAtMilliseconds,
        completedAtMilliseconds:
          startedAtMilliseconds,
        durationMilliseconds: 0,
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    }

    const evaluations =
      await this.evaluateCandidates(
        candidates,
        request,
      );

    const validEvaluations =
      evaluations.filter(
        (
          evaluation,
        ): evaluation is FlashLiquidityCandidateEvaluation & {
          readonly quote: FlashLiquidityQuote;
        } =>
          evaluation.status ===
            FlashLiquidityCandidateStatus.VALID &&
          evaluation.quote !== undefined,
      );

    validEvaluations.sort((left, right) =>
      this.compareQuotes(
        left.quote,
        right.quote,
        request.preferredProtocols ?? [],
      ),
    );

    const validQuotes = Object.freeze(
      validEvaluations.map(
        (evaluation) => evaluation.quote,
      ),
    );

    const completedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    return Object.freeze({
      request: cloneRequest(request),
      candidates: Object.freeze(evaluations),
      validQuotes,
      bestQuote: validQuotes[0],
      evaluatedProviderCount:
        evaluations.length,
      validQuoteCount: validQuotes.length,
      rejectedProviderCount:
        evaluations.filter(
          (evaluation) =>
            evaluation.status ===
            FlashLiquidityCandidateStatus.REJECTED,
        ).length,
      failedProviderCount:
        evaluations.filter(
          (evaluation) =>
            evaluation.status ===
            FlashLiquidityCandidateStatus.FAILED,
        ).length,
      timedOutProviderCount:
        evaluations.filter(
          (evaluation) =>
            evaluation.status ===
            FlashLiquidityCandidateStatus.TIMED_OUT,
        ).length,
      startedAtMilliseconds,
      completedAtMilliseconds,
      durationMilliseconds: Math.max(
        0,
        completedAtMilliseconds -
          startedAtMilliseconds,
      ),
      metadata: freezeMetadata(
        request.metadata,
      ),
    });
  }

  public async requireBestQuote(
    request: FlashLiquidityAggregationRequest,
  ): Promise<FlashLiquidityQuote> {
    const result = await this.aggregate(request);

    if (result.bestQuote === undefined) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.NO_VALID_QUOTE,
        "No eligible provider returned a valid flash-liquidity quote.",
        {
          chainId: request.chainId,
          details: result.candidates,
        },
      );
    }

    return result.bestQuote;
  }

  public compare(
    left: FlashLiquidityQuote,
    right: FlashLiquidityQuote,
    preferredProtocols:
      readonly FlashLoanProtocol[] = [],
  ): FlashLiquidityQuoteComparison {
    const comparison = this.compareQuotes(
      left,
      right,
      preferredProtocols,
    );

    return Object.freeze({
      leftProviderId: left.provider.id,
      rightProviderId: right.provider.id,
      repaymentDifference:
        left.totalRepaymentAmount -
        right.totalRepaymentAmount,
      premiumDifference:
        left.premiumAmount -
        right.premiumAmount,
      availabilityDifference:
        left.availableAmount -
        right.availableAmount,
      expiryDifferenceMilliseconds:
        left.expiresAtMilliseconds -
        right.expiresAtMilliseconds,
      preferredProviderId:
        comparison <= 0
          ? left.provider.id
          : right.provider.id,
    });
  }

  private resolveCandidates(
    request: FlashLiquidityAggregationRequest,
  ): readonly FlashLoanProviderCandidate[] {
    const selectionRequest:
      FlashLoanProviderSelectionRequest =
      Object.freeze({
        chainId: request.chainId,
        asset: request.asset,
        amount: request.amount,
        liquidityType:
          request.liquidityType,
        preferredProtocols:
          request.preferredProtocols,
        excludedProviderIds:
          request.excludedProviderIds,
        maximumPremiumBasisPoints:
          request.maximumPremiumBasisPoints,
        requireMultiAssetSupport:
          request.requireMultiAssetSupport,
        requireEnabled: true,
        metadata: request.metadata,
      });

    return this.dependencies.registry
      .selectCandidates(selectionRequest)
      .candidates;
  }

  private async evaluateCandidates(
    candidates:
      readonly FlashLoanProviderCandidate[],
    request: FlashLiquidityAggregationRequest,
  ): Promise<
    FlashLiquidityCandidateEvaluation[]
  > {
    const evaluations:
      FlashLiquidityCandidateEvaluation[] =
      new Array(candidates.length);
    let nextIndex = 0;
    let validFound = false;

    const worker = async (): Promise<void> => {
      while (true) {
        if (
          this.options.stopAfterFirstValidQuote &&
          validFound
        ) {
          return;
        }

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= candidates.length) {
          return;
        }

        const candidate =
          candidates[currentIndex];

        const evaluation =
          await this.evaluateCandidate(
            candidate,
            request,
          );

        evaluations[currentIndex] =
          evaluation;

        if (
          evaluation.status ===
          FlashLiquidityCandidateStatus.VALID
        ) {
          validFound = true;
        }
      }
    };

    const workerCount = Math.min(
      this.options.maximumConcurrentProviders,
      candidates.length,
    );

    await Promise.all(
      Array.from(
        { length: workerCount },
        () => worker(),
      ),
    );

    if (
      this.options.stopAfterFirstValidQuote &&
      validFound
    ) {
      for (
        let index = 0;
        index < candidates.length;
        index += 1
      ) {
        if (evaluations[index] !== undefined) {
          continue;
        }

        const timestamp =
          this.dependencies.clock.nowMilliseconds();

        evaluations[index] = Object.freeze({
          provider:
            candidates[index].descriptor,
          status:
            FlashLiquidityCandidateStatus.CANCELLED,
          rejectionReasons: Object.freeze([
            "Aggregation stopped after the first valid quote.",
          ]),
          startedAtMilliseconds: timestamp,
          completedAtMilliseconds: timestamp,
          durationMilliseconds: 0,
          metadata: freezeMetadata(
            request.metadata,
          ),
        });
      }
    }

    return evaluations;
  }

  private async evaluateCandidate(
    candidate: FlashLoanProviderCandidate,
    request: FlashLiquidityAggregationRequest,
  ): Promise<FlashLiquidityCandidateEvaluation> {
    const startedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    const providerRequest:
      FlashLiquidityRequest = Object.freeze({
        providerId:
          candidate.descriptor.id,
        chainId: request.chainId,
        liquidityType:
          request.liquidityType,
        borrowerAddress:
          request.borrowerAddress,
        asset: request.asset,
        amount: request.amount,
        callbackData: request.callbackData,
        metadata: freezeMetadata(
          request.metadata,
        ),
      });

    try {
      const result =
        await this.withTimeout(
          this.queryProvider(
            candidate.provider,
            providerRequest,
            candidate.descriptor,
            request,
          ),
          candidate.descriptor,
        );

      const completedAtMilliseconds =
        this.dependencies.clock.nowMilliseconds();

      return Object.freeze({
        provider: candidate.descriptor,
        status: result.status,
        quote: result.quote,
        availability:
          result.availability,
        rejectionReasons:
          result.rejectionReasons,
        startedAtMilliseconds,
        completedAtMilliseconds,
        durationMilliseconds: Math.max(
          0,
          completedAtMilliseconds -
            startedAtMilliseconds,
        ),
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    } catch (error) {
      const completedAtMilliseconds =
        this.dependencies.clock.nowMilliseconds();
      const timedOut =
        error instanceof
          FlashLiquidityAggregatorError &&
        error.code ===
          FlashLiquidityAggregatorErrorCode.PROVIDER_TIMEOUT;

      return Object.freeze({
        provider: candidate.descriptor,
        status: timedOut
          ? FlashLiquidityCandidateStatus.TIMED_OUT
          : FlashLiquidityCandidateStatus.FAILED,
        rejectionReasons: Object.freeze([
          errorMessage(error),
        ]),
        startedAtMilliseconds,
        completedAtMilliseconds,
        durationMilliseconds: Math.max(
          0,
          completedAtMilliseconds -
            startedAtMilliseconds,
        ),
        errorCode: errorCode(error),
        errorMessage: errorMessage(error),
        metadata: freezeMetadata(
          request.metadata,
        ),
      });
    }
  }

  private async queryProvider(
    provider: FlashLiquidityProvider,
    providerRequest: FlashLiquidityRequest,
    descriptor: FlashLoanProviderDescriptor,
    aggregationRequest:
      FlashLiquidityAggregationRequest,
  ): Promise<
    Readonly<{
      status: FlashLiquidityCandidateStatus;
      quote?: FlashLiquidityQuote;
      availability?: ValidationResult;
      rejectionReasons: readonly string[];
    }>
  > {
    let availability:
      ValidationResult | undefined;

    if (
      this.options.requireAvailabilityValidation
    ) {
      availability =
        await provider.validateAvailability(
          providerRequest,
        );

      if (
        !availability.valid ||
        hasBlockingIssue(availability)
      ) {
        return Object.freeze({
          status:
            FlashLiquidityCandidateStatus.REJECTED,
          availability,
          rejectionReasons:
            issueReasons(availability),
        });
      }
    }

    const quote =
      await provider.quote(providerRequest);
    const reasons =
      this.validateQuote(
        quote,
        providerRequest,
        descriptor,
        aggregationRequest,
        this.dependencies.clock.nowMilliseconds(),
      );

    if (reasons.length > 0) {
      return Object.freeze({
        status:
          FlashLiquidityCandidateStatus.REJECTED,
        quote,
        availability,
        rejectionReasons:
          Object.freeze(reasons),
      });
    }

    return Object.freeze({
      status:
        FlashLiquidityCandidateStatus.VALID,
      quote,
      availability,
      rejectionReasons: Object.freeze([]),
    });
  }

  private validateQuote(
    quote: FlashLiquidityQuote,
    request: FlashLiquidityRequest,
    descriptor: FlashLoanProviderDescriptor,
    aggregationRequest:
      FlashLiquidityAggregationRequest,
    nowMilliseconds:
      UnixTimestampMilliseconds,
  ): readonly string[] {
    const reasons: string[] = [];

    if (
      quote === null ||
      typeof quote !== "object"
    ) {
      return Object.freeze([
        "Provider returned a non-object quote.",
      ]);
    }

    if (
      quote.provider.id !== descriptor.id ||
      quote.provider.id !==
        request.providerId
    ) {
      reasons.push(
        "Quote provider ID does not match the selected provider.",
      );
    }

    if (
      quote.provider.chainId !==
        request.chainId ||
      quote.blockReference.chainId !==
        request.chainId ||
      quote.asset.chainId !== request.chainId
    ) {
      reasons.push(
        "Quote chain does not match the request chain.",
      );
    }

    if (
      quote.provider.liquidityType !==
        request.liquidityType
    ) {
      reasons.push(
        "Quote liquidity type does not match the request.",
      );
    }

    if (
      !sameToken(
        quote.asset,
        request.asset,
      )
    ) {
      reasons.push(
        "Quote asset does not match the requested asset.",
      );
    }

    if (
      this.options.requireExactRequestedAmount &&
      quote.requestedAmount !==
        request.amount
    ) {
      reasons.push(
        "Quote requested amount does not exactly match the request amount.",
      );
    }

    if (
      quote.requestedAmount <= 0n ||
      quote.availableAmount < 0n ||
      quote.premiumAmount < 0n ||
      quote.totalRepaymentAmount < 0n
    ) {
      reasons.push(
        "Quote contains a negative or zero-invalid amount.",
      );
    }

    if (
      quote.availableAmount <
      request.amount
    ) {
      reasons.push(
        "Quote does not provide enough available liquidity.",
      );
    }

    if (
      aggregationRequest.minimumAvailableAmount !==
        undefined &&
      quote.availableAmount <
        aggregationRequest.minimumAvailableAmount
    ) {
      reasons.push(
        "Quote available amount is below the requested minimum.",
      );
    }

    if (
      quote.totalRepaymentAmount !==
      quote.requestedAmount +
        quote.premiumAmount
    ) {
      reasons.push(
        "Quote repayment amount does not equal principal plus premium.",
      );
    }

    if (
      !Number.isSafeInteger(
        quote.premiumBasisPoints,
      ) ||
      quote.premiumBasisPoints < 0
    ) {
      reasons.push(
        "Quote premium basis points are invalid.",
      );
    }

    if (
      aggregationRequest.maximumPremiumBasisPoints !==
        undefined &&
      quote.premiumBasisPoints >
        aggregationRequest.maximumPremiumBasisPoints
    ) {
      reasons.push(
        "Quote premium exceeds the aggregation maximum.",
      );
    }

    if (
      this.options
        .requireDescriptorPremiumMatch &&
      quote.premiumBasisPoints !==
        descriptor.premiumBasisPoints
    ) {
      reasons.push(
        "Quote premium does not match the registered provider descriptor.",
      );
    }

    if (
      quote.expiresAtMilliseconds <=
      quote.quotedAtMilliseconds
    ) {
      reasons.push(
        "Quote expiry must be after its quote timestamp.",
      );
    }

    if (
      this.options.rejectExpiredQuotes &&
      quote.expiresAtMilliseconds <=
        nowMilliseconds
    ) {
      reasons.push(
        "Quote has already expired.",
      );
    }

    if (
      this.options.rejectFutureQuotes &&
      quote.quotedAtMilliseconds >
        nowMilliseconds
    ) {
      reasons.push(
        "Quote timestamp is in the future.",
      );
    }

    if (
      nowMilliseconds -
        quote.quotedAtMilliseconds >
      this.options
        .maximumQuoteAgeMilliseconds
    ) {
      reasons.push(
        "Quote exceeds the maximum permitted age.",
      );
    }

    return Object.freeze(reasons);
  }

  private compareQuotes(
    left: FlashLiquidityQuote,
    right: FlashLiquidityQuote,
    preferredProtocols:
      readonly FlashLoanProtocol[],
  ): number {
    const leftPreference =
      preferredProtocols.indexOf(
        left.provider.protocol,
      );
    const rightPreference =
      preferredProtocols.indexOf(
        right.provider.protocol,
      );

    const normalizedLeft =
      leftPreference < 0
        ? Number.MAX_SAFE_INTEGER
        : leftPreference;
    const normalizedRight =
      rightPreference < 0
        ? Number.MAX_SAFE_INTEGER
        : rightPreference;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft -
        normalizedRight;
    }

    if (
      left.totalRepaymentAmount !==
      right.totalRepaymentAmount
    ) {
      return left.totalRepaymentAmount <
        right.totalRepaymentAmount
        ? -1
        : 1;
    }

    if (
      left.premiumAmount !==
      right.premiumAmount
    ) {
      return left.premiumAmount <
        right.premiumAmount
        ? -1
        : 1;
    }

    if (
      left.premiumBasisPoints !==
      right.premiumBasisPoints
    ) {
      return (
        left.premiumBasisPoints -
        right.premiumBasisPoints
      );
    }

    if (
      left.availableAmount !==
      right.availableAmount
    ) {
      return left.availableAmount >
        right.availableAmount
        ? -1
        : 1;
    }

    if (
      left.expiresAtMilliseconds !==
      right.expiresAtMilliseconds
    ) {
      return (
        right.expiresAtMilliseconds -
        left.expiresAtMilliseconds
      );
    }

    if (
      left.quotedAtMilliseconds !==
      right.quotedAtMilliseconds
    ) {
      return (
        right.quotedAtMilliseconds -
        left.quotedAtMilliseconds
      );
    }

    return String(left.provider.id).localeCompare(
      String(right.provider.id),
    );
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    descriptor: FlashLoanProviderDescriptor,
  ): Promise<T> {
    let timeoutHandle:
      ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>(
      (_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new FlashLiquidityAggregatorError(
              FlashLiquidityAggregatorErrorCode.PROVIDER_TIMEOUT,
              `Provider "${descriptor.id}" exceeded the configured timeout.`,
              {
                providerId: descriptor.id,
                chainId: descriptor.chainId,
                details:
                  this.options
                    .providerTimeoutMilliseconds,
              },
            ),
          );
        },
        this.options
          .providerTimeoutMilliseconds);
      },
    );

    try {
      return await Promise.race([
        operation,
        timeout,
      ]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private validateRequest(
    request: FlashLiquidityAggregationRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "Aggregation request must be an object.",
        { details: request },
      );
    }

    if (
      !Number.isSafeInteger(request.chainId) ||
      Number(request.chainId) <= 0
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "request.chainId must be a positive safe integer.",
        { details: request.chainId },
      );
    }

    if (
      !Object.values(
        FlashLiquidityType,
      ).includes(request.liquidityType)
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "request.liquidityType is invalid.",
        {
          chainId: request.chainId,
          details: request.liquidityType,
        },
      );
    }

    if (
      request.asset.chainId !==
      request.chainId
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "Asset chain does not match request chain.",
        { chainId: request.chainId },
      );
    }

    if (
      typeof request.amount !== "bigint" ||
      request.amount <= 0n
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "request.amount must be a positive bigint.",
        {
          chainId: request.chainId,
          details: request.amount,
        },
      );
    }

    if (
      request.minimumAvailableAmount !==
        undefined &&
      (typeof request.minimumAvailableAmount !==
        "bigint" ||
        request.minimumAvailableAmount <
          request.amount)
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "minimumAvailableAmount must be a bigint at least equal to request.amount.",
        {
          chainId: request.chainId,
          details:
            request.minimumAvailableAmount,
        },
      );
    }

    if (
      request.maximumPremiumBasisPoints !==
        undefined &&
      (!Number.isSafeInteger(
        request.maximumPremiumBasisPoints,
      ) ||
        request.maximumPremiumBasisPoints < 0)
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "maximumPremiumBasisPoints must be a non-negative safe integer.",
        {
          chainId: request.chainId,
          details:
            request.maximumPremiumBasisPoints,
        },
      );
    }

    if (
      typeof request.borrowerAddress !==
        "string" ||
      request.borrowerAddress.trim().length ===
        0
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "borrowerAddress must be a non-empty string.",
        { chainId: request.chainId },
      );
    }

    if (
      typeof request.callbackData !== "string" ||
      !request.callbackData.startsWith("0x")
    ) {
      throw new FlashLiquidityAggregatorError(
        FlashLiquidityAggregatorErrorCode.INVALID_REQUEST,
        "callbackData must be hexadecimal data prefixed with 0x.",
        { chainId: request.chainId },
      );
    }
  }
}

export function createFlashLiquidityAggregator(
  dependencies:
    FlashLiquidityAggregatorDependencies,
  options:
    FlashLiquidityAggregatorOptions = {},
): FlashLiquidityAggregator {
  return new FlashLiquidityAggregator(
    dependencies,
    options,
  );
}