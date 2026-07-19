import type {
  CrossChainBridgeQuote,
  CrossChainBridgeQuoteRequest,
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import {
  CrossChainValidationError,
  validateCrossChainBridgeQuote,
  validateCrossChainBridgeQuoteRequest,
} from "./cross-chain-arbitrage-validator";

export interface CrossChainBridgeQuoteProjection {
  readonly quoteId: CrossChainIdentifier;
  readonly bridgeId: CrossChainIdentifier;
  readonly requestId: CrossChainIdentifier;
  readonly outputAmountAtomic: string;
  readonly totalFeeUsd: string | null;
  readonly estimatedLatencyMilliseconds: number;
  readonly expiresAt: number;
  readonly observedAt: number;
  readonly enabled: boolean;
}

export interface CrossChainBridgeQuoteAdapter {
  readonly project: (
    quote: CrossChainBridgeQuote,
  ) => CrossChainBridgeQuoteProjection;
}

export interface CrossChainBridgeQuoteAggregationRequest {
  readonly quoteRequest: CrossChainBridgeQuoteRequest;
  readonly quotes: readonly CrossChainBridgeQuote[];
  readonly now: number;
  readonly maximumResults?: number;
  readonly maximumFeeUsd?: string;
  readonly maximumLatencyMilliseconds?: number;
  readonly minimumOutputAmountAtomic?: string;
  readonly allowedBridgeIds?: readonly CrossChainIdentifier[];
  readonly excludedBridgeIds?: readonly CrossChainIdentifier[];
  readonly includeDisabledQuotes?: boolean;
  readonly includeExpiredQuotes?: boolean;
  readonly requireKnownFee?: boolean;
}

export interface CrossChainBridgeQuoteScore {
  readonly quoteId: CrossChainIdentifier;
  readonly outputAmountAtomic: string;
  readonly totalFeeUsd: string | null;
  readonly estimatedLatencyMilliseconds: number;
  readonly outputRank: number;
  readonly feeRank: number | null;
  readonly latencyRank: number;
  readonly compositeScore: number;
}

export interface CrossChainBridgeQuoteAggregationEntry {
  readonly quote: CrossChainBridgeQuote;
  readonly projection: CrossChainBridgeQuoteProjection;
  readonly score: CrossChainBridgeQuoteScore;
}

export interface CrossChainBridgeQuoteAggregationResult {
  readonly request: CrossChainBridgeQuoteRequest;
  readonly generatedAt: number;
  readonly receivedQuoteCount: number;
  readonly acceptedQuoteCount: number;
  readonly rejectedQuoteCount: number;
  readonly entries: readonly CrossChainBridgeQuoteAggregationEntry[];
  readonly bestQuote: CrossChainBridgeQuoteAggregationEntry | null;
  readonly rejectionCounts: Readonly<Record<string, number>>;
}

export interface CrossChainBridgeQuoteAggregatorOptions {
  readonly adapter: CrossChainBridgeQuoteAdapter;
  readonly outputWeight?: number;
  readonly feeWeight?: number;
  readonly latencyWeight?: number;
}

export class CrossChainBridgeQuoteAggregationError extends Error {
  public readonly code: string;
  public readonly referenceId: CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name = "CrossChainBridgeQuoteAggregationError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface Candidate {
  readonly quote: CrossChainBridgeQuote;
  readonly projection: CrossChainBridgeQuoteProjection;
}

interface RankedCandidate extends Candidate {
  readonly outputRank: number;
  readonly feeRank: number | null;
  readonly latencyRank: number;
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
}

function compareStrings(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_IDENTIFIER",
      `${fieldName} must not be empty.`,
      value,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_INTEGER",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_INTEGER",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertWeight(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_WEIGHT",
      `${fieldName} must be finite and non-negative.`,
    );
  }
}

function assertAtomicAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^\d+$/.test(value)) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_ATOMIC_AMOUNT",
      `${fieldName} must be a non-negative integer string.`,
    );
  }
}

function assertDecimalAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must be a canonical non-negative decimal string.`,
    );
  }

  if (!Number.isFinite(Number(value))) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must represent a finite number.`,
    );
  }
}

function freezeProjection(
  projection: CrossChainBridgeQuoteProjection,
): CrossChainBridgeQuoteProjection {
  return Object.freeze({
    ...projection,
  });
}

function validateProjection(
  projection: CrossChainBridgeQuoteProjection,
): void {
  assertNonEmptyString(
    projection.quoteId,
    "projection.quoteId",
  );
  assertNonEmptyString(
    projection.bridgeId,
    "projection.bridgeId",
  );
  assertNonEmptyString(
    projection.requestId,
    "projection.requestId",
  );
  assertAtomicAmount(
    projection.outputAmountAtomic,
    "projection.outputAmountAtomic",
  );

  if (projection.totalFeeUsd !== null) {
    assertDecimalAmount(
      projection.totalFeeUsd,
      "projection.totalFeeUsd",
    );
  }

  assertNonNegativeInteger(
    projection.estimatedLatencyMilliseconds,
    "projection.estimatedLatencyMilliseconds",
  );
  assertNonNegativeInteger(
    projection.expiresAt,
    "projection.expiresAt",
  );
  assertNonNegativeInteger(
    projection.observedAt,
    "projection.observedAt",
  );

  if (projection.expiresAt < projection.observedAt) {
    throw new CrossChainBridgeQuoteAggregationError(
      "INVALID_QUOTE_LIFETIME",
      "projection.expiresAt must not be earlier than projection.observedAt.",
      projection.quoteId,
    );
  }
}

function incrementRejection(
  counts: Map<string, number>,
  reason: string,
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function rankByBigIntDescending(
  candidates: readonly Candidate[],
): ReadonlyMap<CrossChainIdentifier, number> {
  const sorted = [...candidates].sort((left, right) => {
    const leftValue = BigInt(
      left.projection.outputAmountAtomic,
    );
    const rightValue = BigInt(
      right.projection.outputAmountAtomic,
    );

    if (leftValue !== rightValue) {
      return leftValue > rightValue ? -1 : 1;
    }

    return compareStrings(
      left.projection.quoteId,
      right.projection.quoteId,
    );
  });

  const ranks = new Map<CrossChainIdentifier, number>();

  sorted.forEach((candidate, index) => {
    ranks.set(candidate.projection.quoteId, index + 1);
  });

  return ranks;
}

function rankByNumberAscending(
  candidates: readonly Candidate[],
  selector: (candidate: Candidate) => number,
): ReadonlyMap<CrossChainIdentifier, number> {
  const sorted = [...candidates].sort((left, right) => {
    const difference =
      selector(left) - selector(right);

    if (difference !== 0) {
      return difference;
    }

    return compareStrings(
      left.projection.quoteId,
      right.projection.quoteId,
    );
  });

  const ranks = new Map<CrossChainIdentifier, number>();

  sorted.forEach((candidate, index) => {
    ranks.set(candidate.projection.quoteId, index + 1);
  });

  return ranks;
}

function rankKnownFees(
  candidates: readonly Candidate[],
): ReadonlyMap<CrossChainIdentifier, number> {
  const knownFeeCandidates = candidates.filter(
    (candidate) =>
      candidate.projection.totalFeeUsd !== null,
  );

  return rankByNumberAscending(
    knownFeeCandidates,
    (candidate) =>
      Number(candidate.projection.totalFeeUsd),
  );
}

export class DeterministicCrossChainBridgeQuoteAggregator {
  private readonly adapter: CrossChainBridgeQuoteAdapter;

  private readonly outputWeight: number;

  private readonly feeWeight: number;

  private readonly latencyWeight: number;

  public constructor(
    options: CrossChainBridgeQuoteAggregatorOptions,
  ) {
    if (
      options.adapter === null ||
      typeof options.adapter !== "object" ||
      typeof options.adapter.project !== "function"
    ) {
      throw new CrossChainBridgeQuoteAggregationError(
        "INVALID_ADAPTER",
        "options.adapter.project must be a function.",
      );
    }

    this.outputWeight = options.outputWeight ?? 0.5;
    this.feeWeight = options.feeWeight ?? 0.3;
    this.latencyWeight = options.latencyWeight ?? 0.2;

    assertWeight(
      this.outputWeight,
      "options.outputWeight",
    );
    assertWeight(
      this.feeWeight,
      "options.feeWeight",
    );
    assertWeight(
      this.latencyWeight,
      "options.latencyWeight",
    );

    const totalWeight =
      this.outputWeight +
      this.feeWeight +
      this.latencyWeight;

    if (totalWeight <= 0) {
      throw new CrossChainBridgeQuoteAggregationError(
        "ZERO_TOTAL_WEIGHT",
        "At least one quote-ranking weight must be greater than zero.",
      );
    }

    this.adapter = options.adapter;
  }

  public aggregate(
    request: CrossChainBridgeQuoteAggregationRequest,
  ): CrossChainBridgeQuoteAggregationResult {
    this.validateAggregationRequest(request);

    try {
      validateCrossChainBridgeQuoteRequest(
        request.quoteRequest,
      );
    } catch (error) {
      if (error instanceof CrossChainValidationError) {
        throw new CrossChainBridgeQuoteAggregationError(
          "INVALID_QUOTE_REQUEST",
          error.message,
        );
      }

      throw error;
    }

    const maximumResults =
      request.maximumResults ?? 25;

    const allowedBridgeIds =
      request.allowedBridgeIds === undefined
        ? null
        : new Set(request.allowedBridgeIds);

    const excludedBridgeIds =
      request.excludedBridgeIds === undefined
        ? null
        : new Set(request.excludedBridgeIds);

    const maximumFee =
      request.maximumFeeUsd === undefined
        ? null
        : Number(request.maximumFeeUsd);

    const minimumOutput =
      request.minimumOutputAmountAtomic === undefined
        ? null
        : BigInt(
            request.minimumOutputAmountAtomic,
          );

    const rejectionCounts = new Map<string, number>();
    const candidates: Candidate[] = [];
    const seenQuoteIds = new Set<CrossChainIdentifier>();

    for (const quote of request.quotes) {
      try {
        validateCrossChainBridgeQuote(quote);
      } catch (error) {
        if (error instanceof CrossChainValidationError) {
          incrementRejection(
            rejectionCounts,
            "INVALID_QUOTE",
          );
          continue;
        }

        throw error;
      }

      let projection: CrossChainBridgeQuoteProjection;

      try {
        projection = freezeProjection(
          this.adapter.project(quote),
        );
        validateProjection(projection);
      } catch (error) {
        if (
          error instanceof
          CrossChainBridgeQuoteAggregationError
        ) {
          incrementRejection(
            rejectionCounts,
            "INVALID_PROJECTION",
          );
          continue;
        }

        throw error;
      }

      if (seenQuoteIds.has(projection.quoteId)) {
        incrementRejection(
          rejectionCounts,
          "DUPLICATE_QUOTE_ID",
        );
        continue;
      }

      seenQuoteIds.add(projection.quoteId);

      if (
        projection.requestId !==
        this.adapter.project(quote).requestId
      ) {
        incrementRejection(
          rejectionCounts,
          "UNSTABLE_PROJECTION",
        );
        continue;
      }

      if (
        request.includeDisabledQuotes !== true &&
        !projection.enabled
      ) {
        incrementRejection(
          rejectionCounts,
          "DISABLED_QUOTE",
        );
        continue;
      }

      if (
        request.includeExpiredQuotes !== true &&
        projection.expiresAt <= request.now
      ) {
        incrementRejection(
          rejectionCounts,
          "EXPIRED_QUOTE",
        );
        continue;
      }

      if (
        allowedBridgeIds !== null &&
        !allowedBridgeIds.has(projection.bridgeId)
      ) {
        incrementRejection(
          rejectionCounts,
          "BRIDGE_NOT_ALLOWED",
        );
        continue;
      }

      if (
        excludedBridgeIds !== null &&
        excludedBridgeIds.has(projection.bridgeId)
      ) {
        incrementRejection(
          rejectionCounts,
          "BRIDGE_EXCLUDED",
        );
        continue;
      }

      if (
        request.requireKnownFee === true &&
        projection.totalFeeUsd === null
      ) {
        incrementRejection(
          rejectionCounts,
          "UNKNOWN_FEE",
        );
        continue;
      }

      if (
        maximumFee !== null &&
        (
          projection.totalFeeUsd === null ||
          Number(projection.totalFeeUsd) > maximumFee
        )
      ) {
        incrementRejection(
          rejectionCounts,
          "FEE_LIMIT_EXCEEDED",
        );
        continue;
      }

      if (
        request.maximumLatencyMilliseconds !==
          undefined &&
        projection.estimatedLatencyMilliseconds >
          request.maximumLatencyMilliseconds
      ) {
        incrementRejection(
          rejectionCounts,
          "LATENCY_LIMIT_EXCEEDED",
        );
        continue;
      }

      if (
        minimumOutput !== null &&
        BigInt(projection.outputAmountAtomic) <
          minimumOutput
      ) {
        incrementRejection(
          rejectionCounts,
          "OUTPUT_BELOW_MINIMUM",
        );
        continue;
      }

      candidates.push(
        Object.freeze({
          quote,
          projection,
        }),
      );
    }

    const outputRanks =
      rankByBigIntDescending(candidates);
    const feeRanks = rankKnownFees(candidates);
    const latencyRanks = rankByNumberAscending(
      candidates,
      (candidate) =>
        candidate.projection
          .estimatedLatencyMilliseconds,
    );

    const rankedCandidates: RankedCandidate[] =
      candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          outputRank:
            outputRanks.get(
              candidate.projection.quoteId,
            ) ?? Number.MAX_SAFE_INTEGER,
          feeRank:
            feeRanks.get(
              candidate.projection.quoteId,
            ) ?? null,
          latencyRank:
            latencyRanks.get(
              candidate.projection.quoteId,
            ) ?? Number.MAX_SAFE_INTEGER,
        }),
      );

    const count = Math.max(
      rankedCandidates.length,
      1,
    );

    const entries =
      rankedCandidates.map((candidate) => {
        const outputScore =
          (count - candidate.outputRank + 1) / count;

        const feeScore =
          candidate.feeRank === null
            ? 0
            : (count - candidate.feeRank + 1) /
              count;

        const latencyScore =
          (count - candidate.latencyRank + 1) /
          count;

        const totalWeight =
          this.outputWeight +
          this.feeWeight +
          this.latencyWeight;

        const compositeScore =
          (
            outputScore * this.outputWeight +
            feeScore * this.feeWeight +
            latencyScore * this.latencyWeight
          ) / totalWeight;

        const score: CrossChainBridgeQuoteScore =
          Object.freeze({
            quoteId:
              candidate.projection.quoteId,
            outputAmountAtomic:
              candidate.projection
                .outputAmountAtomic,
            totalFeeUsd:
              candidate.projection.totalFeeUsd,
            estimatedLatencyMilliseconds:
              candidate.projection
                .estimatedLatencyMilliseconds,
            outputRank: candidate.outputRank,
            feeRank: candidate.feeRank,
            latencyRank: candidate.latencyRank,
            compositeScore,
          });

        return Object.freeze({
          quote: candidate.quote,
          projection: candidate.projection,
          score,
        });
      });

    entries.sort((left, right) => {
      if (
        left.score.compositeScore !==
        right.score.compositeScore
      ) {
        return (
          right.score.compositeScore -
          left.score.compositeScore
        );
      }

      const leftOutput = BigInt(
        left.projection.outputAmountAtomic,
      );
      const rightOutput = BigInt(
        right.projection.outputAmountAtomic,
      );

      if (leftOutput !== rightOutput) {
        return leftOutput > rightOutput ? -1 : 1;
      }

      const leftFee =
        left.projection.totalFeeUsd === null
          ? Number.POSITIVE_INFINITY
          : Number(left.projection.totalFeeUsd);

      const rightFee =
        right.projection.totalFeeUsd === null
          ? Number.POSITIVE_INFINITY
          : Number(right.projection.totalFeeUsd);

      if (leftFee !== rightFee) {
        return leftFee - rightFee;
      }

      if (
        left.projection
          .estimatedLatencyMilliseconds !==
        right.projection
          .estimatedLatencyMilliseconds
      ) {
        return (
          left.projection
            .estimatedLatencyMilliseconds -
          right.projection
            .estimatedLatencyMilliseconds
        );
      }

      return compareStrings(
        left.projection.quoteId,
        right.projection.quoteId,
      );
    });

    const limitedEntries = freezeArray(
      entries.slice(0, maximumResults),
    );

    const rejectionRecord = Object.freeze(
      Object.fromEntries(
        [...rejectionCounts.entries()].sort(
          ([left], [right]) =>
            compareStrings(left, right),
        ),
      ),
    );

    return Object.freeze({
      request: request.quoteRequest,
      generatedAt: request.now,
      receivedQuoteCount: request.quotes.length,
      acceptedQuoteCount: limitedEntries.length,
      rejectedQuoteCount:
        request.quotes.length - candidates.length,
      entries: limitedEntries,
      bestQuote: limitedEntries[0] ?? null,
      rejectionCounts: rejectionRecord,
    });
  }

  private validateAggregationRequest(
    request: CrossChainBridgeQuoteAggregationRequest,
  ): void {
    assertNonNegativeInteger(
      request.now,
      "request.now",
    );

    if (request.maximumResults !== undefined) {
      assertPositiveInteger(
        request.maximumResults,
        "request.maximumResults",
      );
    }

    if (request.maximumFeeUsd !== undefined) {
      assertDecimalAmount(
        request.maximumFeeUsd,
        "request.maximumFeeUsd",
      );
    }

    if (
      request.maximumLatencyMilliseconds !==
      undefined
    ) {
      assertNonNegativeInteger(
        request.maximumLatencyMilliseconds,
        "request.maximumLatencyMilliseconds",
      );
    }

    if (
      request.minimumOutputAmountAtomic !==
      undefined
    ) {
      assertAtomicAmount(
        request.minimumOutputAmountAtomic,
        "request.minimumOutputAmountAtomic",
      );
    }

    const allowed =
      request.allowedBridgeIds ?? [];
    const excluded =
      request.excludedBridgeIds ?? [];

    if (new Set(allowed).size !== allowed.length) {
      throw new CrossChainBridgeQuoteAggregationError(
        "DUPLICATE_ALLOWED_BRIDGE",
        "allowedBridgeIds must not contain duplicates.",
      );
    }

    if (
      new Set(excluded).size !== excluded.length
    ) {
      throw new CrossChainBridgeQuoteAggregationError(
        "DUPLICATE_EXCLUDED_BRIDGE",
        "excludedBridgeIds must not contain duplicates.",
      );
    }

    for (const bridgeId of allowed) {
      assertNonEmptyString(
        bridgeId,
        "request.allowedBridgeIds",
      );
    }

    for (const bridgeId of excluded) {
      assertNonEmptyString(
        bridgeId,
        "request.excludedBridgeIds",
      );
    }

    const excludedSet = new Set(excluded);

    for (const bridgeId of allowed) {
      if (excludedSet.has(bridgeId)) {
        throw new CrossChainBridgeQuoteAggregationError(
          "CONFLICTING_BRIDGE_FILTER",
          `Bridge "${bridgeId}" cannot be both allowed and excluded.`,
          bridgeId,
        );
      }
    }
  }
}