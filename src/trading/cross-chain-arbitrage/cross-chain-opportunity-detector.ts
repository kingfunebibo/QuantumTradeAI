import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  CrossChainBridgeQuoteAggregationEntry,
  CrossChainBridgeQuoteAggregationResult,
} from "./bridge-quote-aggregator";

export interface CrossChainArbitrageEconomicProjection {
  readonly quoteId: CrossChainIdentifier;
  readonly bridgeId: CrossChainIdentifier;
  readonly requestId: CrossChainIdentifier;
  readonly sourceValueUsd: string;
  readonly destinationValueUsd: string;
  readonly totalCostUsd: string;
  readonly estimatedLatencyMilliseconds: number;
  readonly expiresAt: number;
  readonly observedAt: number;
}

export interface CrossChainArbitrageEconomicAdapter {
  readonly project: (
    entry: CrossChainBridgeQuoteAggregationEntry,
  ) => CrossChainArbitrageEconomicProjection;
}

export interface CrossChainArbitrageDetectionPolicy {
  readonly minimumGrossProfitUsd?: string;
  readonly minimumNetProfitUsd?: string;
  readonly minimumNetProfitPercentage?: number;
  readonly maximumTotalCostUsd?: string;
  readonly maximumLatencyMilliseconds?: number;
  readonly minimumRemainingLifetimeMilliseconds?: number;
  readonly maximumResults?: number;
}

export interface CrossChainArbitrageDetectionRequest {
  readonly aggregation:
    CrossChainBridgeQuoteAggregationResult;
  readonly now: number;
  readonly policy?: CrossChainArbitrageDetectionPolicy;
  readonly allowedBridgeIds?: readonly CrossChainIdentifier[];
  readonly excludedBridgeIds?: readonly CrossChainIdentifier[];
}

export type CrossChainArbitrageOpportunityStatus =
  | "ACTIONABLE"
  | "BELOW_THRESHOLD"
  | "EXPIRED"
  | "INSUFFICIENT_LIFETIME"
  | "COST_LIMIT_EXCEEDED"
  | "LATENCY_LIMIT_EXCEEDED";

export interface DetectedCrossChainArbitrageOpportunity {
  readonly opportunityId: CrossChainIdentifier;
  readonly quoteId: CrossChainIdentifier;
  readonly bridgeId: CrossChainIdentifier;
  readonly requestId: CrossChainIdentifier;
  readonly sourceValueUsd: string;
  readonly destinationValueUsd: string;
  readonly grossProfitUsd: string;
  readonly totalCostUsd: string;
  readonly netProfitUsd: string;
  readonly netProfitPercentage: number;
  readonly estimatedLatencyMilliseconds: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly remainingLifetimeMilliseconds: number;
  readonly quoteCompositeScore: number;
  readonly status: CrossChainArbitrageOpportunityStatus;
  readonly rejectionReasons: readonly string[];
}

export interface CrossChainArbitrageDetectionResult {
  readonly requestId: CrossChainIdentifier;
  readonly generatedAt: number;
  readonly evaluatedQuoteCount: number;
  readonly actionableOpportunityCount: number;
  readonly rejectedOpportunityCount: number;
  readonly opportunities:
    readonly DetectedCrossChainArbitrageOpportunity[];
  readonly bestOpportunity:
    DetectedCrossChainArbitrageOpportunity | null;
  readonly rejectionCounts: Readonly<Record<string, number>>;
}

export interface CrossChainArbitrageOpportunityDetectorOptions {
  readonly adapter: CrossChainArbitrageEconomicAdapter;
  readonly opportunityIdFactory?: (
    projection: CrossChainArbitrageEconomicProjection,
  ) => CrossChainIdentifier;
}

export class CrossChainArbitrageOpportunityDetectionError
  extends Error {
  public readonly code: string;
  public readonly referenceId:
    CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name =
      "CrossChainArbitrageOpportunityDetectionError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface NormalizedPolicy {
  readonly minimumGrossProfitUsd: number;
  readonly minimumNetProfitUsd: number;
  readonly minimumNetProfitPercentage: number;
  readonly maximumTotalCostUsd: number;
  readonly maximumLatencyMilliseconds: number;
  readonly minimumRemainingLifetimeMilliseconds: number;
  readonly maximumResults: number;
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
    throw new CrossChainArbitrageOpportunityDetectionError(
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
    throw new CrossChainArbitrageOpportunityDetectionError(
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
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_INTEGER",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertPercentage(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_PERCENTAGE",
      `${fieldName} must be finite and non-negative.`,
    );
  }
}

function assertDecimalAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must be a canonical non-negative decimal string.`,
    );
  }

  if (!Number.isFinite(Number(value))) {
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must represent a finite number.`,
    );
  }
}

function normalizeDecimal(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_CALCULATION",
      "Calculated decimal value must be finite.",
    );
  }

  const normalized =
    Math.abs(value) < 0.0000000000005
      ? 0
      : value;

  return normalized
    .toFixed(12)
    .replace(/\.?0+$/, "");
}

function incrementCount(
  counts: Map<string, number>,
  reason: string,
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function validateProjection(
  projection: CrossChainArbitrageEconomicProjection,
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
  assertDecimalAmount(
    projection.sourceValueUsd,
    "projection.sourceValueUsd",
  );
  assertDecimalAmount(
    projection.destinationValueUsd,
    "projection.destinationValueUsd",
  );
  assertDecimalAmount(
    projection.totalCostUsd,
    "projection.totalCostUsd",
  );
  assertNonNegativeInteger(
    projection.estimatedLatencyMilliseconds,
    "projection.estimatedLatencyMilliseconds",
  );
  assertNonNegativeInteger(
    projection.observedAt,
    "projection.observedAt",
  );
  assertNonNegativeInteger(
    projection.expiresAt,
    "projection.expiresAt",
  );

  if (projection.expiresAt < projection.observedAt) {
    throw new CrossChainArbitrageOpportunityDetectionError(
      "INVALID_PROJECTION_LIFETIME",
      "projection.expiresAt must not be earlier than projection.observedAt.",
      projection.quoteId,
    );
  }
}

function normalizePolicy(
  policy:
    CrossChainArbitrageDetectionPolicy | undefined,
): NormalizedPolicy {
  const minimumGrossProfitUsd =
    policy?.minimumGrossProfitUsd ?? "0";
  const minimumNetProfitUsd =
    policy?.minimumNetProfitUsd ?? "0";
  const minimumNetProfitPercentage =
    policy?.minimumNetProfitPercentage ?? 0;
  const maximumTotalCostUsd =
    policy?.maximumTotalCostUsd;
  const maximumLatencyMilliseconds =
    policy?.maximumLatencyMilliseconds;
  const minimumRemainingLifetimeMilliseconds =
    policy?.minimumRemainingLifetimeMilliseconds ?? 0;
  const maximumResults =
    policy?.maximumResults ?? 25;

  assertDecimalAmount(
    minimumGrossProfitUsd,
    "policy.minimumGrossProfitUsd",
  );
  assertDecimalAmount(
    minimumNetProfitUsd,
    "policy.minimumNetProfitUsd",
  );
  assertPercentage(
    minimumNetProfitPercentage,
    "policy.minimumNetProfitPercentage",
  );
  assertNonNegativeInteger(
    minimumRemainingLifetimeMilliseconds,
    "policy.minimumRemainingLifetimeMilliseconds",
  );
  assertPositiveInteger(
    maximumResults,
    "policy.maximumResults",
  );

  if (maximumTotalCostUsd !== undefined) {
    assertDecimalAmount(
      maximumTotalCostUsd,
      "policy.maximumTotalCostUsd",
    );
  }

  if (
    maximumLatencyMilliseconds !== undefined
  ) {
    assertNonNegativeInteger(
      maximumLatencyMilliseconds,
      "policy.maximumLatencyMilliseconds",
    );
  }

  return Object.freeze({
    minimumGrossProfitUsd:
      Number(minimumGrossProfitUsd),
    minimumNetProfitUsd:
      Number(minimumNetProfitUsd),
    minimumNetProfitPercentage,
    maximumTotalCostUsd:
      maximumTotalCostUsd === undefined
        ? Number.POSITIVE_INFINITY
        : Number(maximumTotalCostUsd),
    maximumLatencyMilliseconds:
      maximumLatencyMilliseconds === undefined
        ? Number.MAX_SAFE_INTEGER
        : maximumLatencyMilliseconds,
    minimumRemainingLifetimeMilliseconds,
    maximumResults,
  });
}

function compareOpportunities(
  left: DetectedCrossChainArbitrageOpportunity,
  right: DetectedCrossChainArbitrageOpportunity,
): number {
  const leftNetProfit =
    Number(left.netProfitUsd);
  const rightNetProfit =
    Number(right.netProfitUsd);

  if (leftNetProfit !== rightNetProfit) {
    return rightNetProfit - leftNetProfit;
  }

  if (
    left.netProfitPercentage !==
    right.netProfitPercentage
  ) {
    return (
      right.netProfitPercentage -
      left.netProfitPercentage
    );
  }

  if (
    left.quoteCompositeScore !==
    right.quoteCompositeScore
  ) {
    return (
      right.quoteCompositeScore -
      left.quoteCompositeScore
    );
  }

  if (
    left.estimatedLatencyMilliseconds !==
    right.estimatedLatencyMilliseconds
  ) {
    return (
      left.estimatedLatencyMilliseconds -
      right.estimatedLatencyMilliseconds
    );
  }

  return compareStrings(
    left.opportunityId,
    right.opportunityId,
  );
}

export class DeterministicCrossChainArbitrageOpportunityDetector {
  private readonly adapter:
    CrossChainArbitrageEconomicAdapter;

  private readonly opportunityIdFactory: (
    projection: CrossChainArbitrageEconomicProjection,
  ) => CrossChainIdentifier;

  public constructor(
    options:
      CrossChainArbitrageOpportunityDetectorOptions,
  ) {
    if (
      options.adapter === null ||
      typeof options.adapter !== "object" ||
      typeof options.adapter.project !== "function"
    ) {
      throw new CrossChainArbitrageOpportunityDetectionError(
        "INVALID_ADAPTER",
        "options.adapter.project must be a function.",
      );
    }

    this.adapter = options.adapter;
    this.opportunityIdFactory =
      options.opportunityIdFactory ??
      ((projection) =>
        [
          "cross-chain-opportunity",
          projection.requestId,
          projection.bridgeId,
          projection.quoteId,
        ].join(":"));
  }

  public detect(
    request: CrossChainArbitrageDetectionRequest,
  ): CrossChainArbitrageDetectionResult {
    this.validateRequest(request);

    const policy = normalizePolicy(request.policy);

    const allowedBridgeIds =
      request.allowedBridgeIds === undefined
        ? null
        : new Set(request.allowedBridgeIds);

    const excludedBridgeIds =
      request.excludedBridgeIds === undefined
        ? null
        : new Set(request.excludedBridgeIds);

    const opportunities:
      DetectedCrossChainArbitrageOpportunity[] = [];

    const rejectionCounts =
      new Map<string, number>();

    const seenOpportunityIds =
      new Set<CrossChainIdentifier>();

    for (
      const entry of
      request.aggregation.entries
    ) {
      let projection:
        CrossChainArbitrageEconomicProjection;

      try {
        projection = Object.freeze({
          ...this.adapter.project(entry),
        });

        validateProjection(projection);
      } catch (error) {
        if (
          error instanceof
          CrossChainArbitrageOpportunityDetectionError
        ) {
          incrementCount(
            rejectionCounts,
            "INVALID_PROJECTION",
          );
          continue;
        }

        throw error;
      }

      if (
        projection.quoteId !==
        entry.projection.quoteId
      ) {
        incrementCount(
          rejectionCounts,
          "QUOTE_ID_MISMATCH",
        );
        continue;
      }

      if (
        projection.bridgeId !==
        entry.projection.bridgeId
      ) {
        incrementCount(
          rejectionCounts,
          "BRIDGE_ID_MISMATCH",
        );
        continue;
      }

      if (
        projection.requestId !==
        entry.projection.requestId
      ) {
        incrementCount(
          rejectionCounts,
          "REQUEST_ID_MISMATCH",
        );
        continue;
      }

      if (
        allowedBridgeIds !== null &&
        !allowedBridgeIds.has(
          projection.bridgeId,
        )
      ) {
        incrementCount(
          rejectionCounts,
          "BRIDGE_NOT_ALLOWED",
        );
        continue;
      }

      if (
        excludedBridgeIds !== null &&
        excludedBridgeIds.has(
          projection.bridgeId,
        )
      ) {
        incrementCount(
          rejectionCounts,
          "BRIDGE_EXCLUDED",
        );
        continue;
      }

      const sourceValueUsd =
        Number(projection.sourceValueUsd);
      const destinationValueUsd =
        Number(projection.destinationValueUsd);
      const totalCostUsd =
        Number(projection.totalCostUsd);

      const grossProfitUsd =
        destinationValueUsd - sourceValueUsd;

      const netProfitUsd =
        grossProfitUsd - totalCostUsd;

      const netProfitPercentage =
        sourceValueUsd === 0
          ? 0
          : (netProfitUsd / sourceValueUsd) * 100;

      const remainingLifetimeMilliseconds =
        Math.max(
          0,
          projection.expiresAt - request.now,
        );

      const rejectionReasons: string[] = [];
      let status:
        CrossChainArbitrageOpportunityStatus =
          "ACTIONABLE";

      if (projection.expiresAt <= request.now) {
        status = "EXPIRED";
        rejectionReasons.push("EXPIRED");
      } else if (
        remainingLifetimeMilliseconds <
        policy.minimumRemainingLifetimeMilliseconds
      ) {
        status = "INSUFFICIENT_LIFETIME";
        rejectionReasons.push(
          "INSUFFICIENT_LIFETIME",
        );
      } else if (
        totalCostUsd >
        policy.maximumTotalCostUsd
      ) {
        status = "COST_LIMIT_EXCEEDED";
        rejectionReasons.push(
          "COST_LIMIT_EXCEEDED",
        );
      } else if (
        projection.estimatedLatencyMilliseconds >
        policy.maximumLatencyMilliseconds
      ) {
        status = "LATENCY_LIMIT_EXCEEDED";
        rejectionReasons.push(
          "LATENCY_LIMIT_EXCEEDED",
        );
      } else {
        if (
          grossProfitUsd <
          policy.minimumGrossProfitUsd
        ) {
          rejectionReasons.push(
            "GROSS_PROFIT_BELOW_MINIMUM",
          );
        }

        if (
          netProfitUsd <
          policy.minimumNetProfitUsd
        ) {
          rejectionReasons.push(
            "NET_PROFIT_BELOW_MINIMUM",
          );
        }

        if (
          netProfitPercentage <
          policy.minimumNetProfitPercentage
        ) {
          rejectionReasons.push(
            "NET_PROFIT_PERCENTAGE_BELOW_MINIMUM",
          );
        }

        if (rejectionReasons.length > 0) {
          status = "BELOW_THRESHOLD";
        }
      }

      const opportunityId =
        this.opportunityIdFactory(projection);

      assertNonEmptyString(
        opportunityId,
        "opportunityId",
      );

      if (
        seenOpportunityIds.has(opportunityId)
      ) {
        throw new CrossChainArbitrageOpportunityDetectionError(
          "DUPLICATE_OPPORTUNITY_ID",
          `Opportunity ID "${opportunityId}" was produced more than once.`,
          opportunityId,
        );
      }

      seenOpportunityIds.add(opportunityId);

      for (const reason of rejectionReasons) {
        incrementCount(rejectionCounts, reason);
      }

      opportunities.push(
        Object.freeze({
          opportunityId,
          quoteId: projection.quoteId,
          bridgeId: projection.bridgeId,
          requestId: projection.requestId,
          sourceValueUsd:
            normalizeDecimal(sourceValueUsd),
          destinationValueUsd:
            normalizeDecimal(destinationValueUsd),
          grossProfitUsd:
            normalizeDecimal(grossProfitUsd),
          totalCostUsd:
            normalizeDecimal(totalCostUsd),
          netProfitUsd:
            normalizeDecimal(netProfitUsd),
          netProfitPercentage,
          estimatedLatencyMilliseconds:
            projection.estimatedLatencyMilliseconds,
          observedAt: projection.observedAt,
          expiresAt: projection.expiresAt,
          remainingLifetimeMilliseconds,
          quoteCompositeScore:
            entry.score.compositeScore,
          status,
          rejectionReasons:
            freezeArray(
              rejectionReasons.sort(
                compareStrings,
              ),
            ),
        }),
      );
    }

    opportunities.sort(compareOpportunities);

    const actionableOpportunities =
      opportunities.filter(
        (opportunity) =>
          opportunity.status === "ACTIONABLE",
      );

    const limitedOpportunities =
      freezeArray(
        actionableOpportunities.slice(
          0,
          policy.maximumResults,
        ),
      );

    const rejectionRecord =
      Object.freeze(
        Object.fromEntries(
          [...rejectionCounts.entries()].sort(
            ([left], [right]) =>
              compareStrings(left, right),
          ),
        ),
      );

    return Object.freeze({
      requestId:
        request.aggregation.request.requestId,
      generatedAt: request.now,
      evaluatedQuoteCount:
        request.aggregation.entries.length,
      actionableOpportunityCount:
        actionableOpportunities.length,
      rejectedOpportunityCount:
        opportunities.length -
        actionableOpportunities.length,
      opportunities: limitedOpportunities,
      bestOpportunity:
        limitedOpportunities[0] ?? null,
      rejectionCounts: rejectionRecord,
    });
  }

  private validateRequest(
    request: CrossChainArbitrageDetectionRequest,
  ): void {
    assertNonNegativeInteger(
      request.now,
      "request.now",
    );

    const allowed =
      request.allowedBridgeIds ?? [];
    const excluded =
      request.excludedBridgeIds ?? [];

    if (new Set(allowed).size !== allowed.length) {
      throw new CrossChainArbitrageOpportunityDetectionError(
        "DUPLICATE_ALLOWED_BRIDGE",
        "allowedBridgeIds must not contain duplicates.",
      );
    }

    if (
      new Set(excluded).size !== excluded.length
    ) {
      throw new CrossChainArbitrageOpportunityDetectionError(
        "DUPLICATE_EXCLUDED_BRIDGE",
        "excludedBridgeIds must not contain duplicates.",
      );
    }

    const excludedSet = new Set(excluded);

    for (const bridgeId of allowed) {
      assertNonEmptyString(
        bridgeId,
        "request.allowedBridgeIds",
      );

      if (excludedSet.has(bridgeId)) {
        throw new CrossChainArbitrageOpportunityDetectionError(
          "CONFLICTING_BRIDGE_FILTER",
          `Bridge "${bridgeId}" cannot be both allowed and excluded.`,
          bridgeId,
        );
      }
    }

    for (const bridgeId of excluded) {
      assertNonEmptyString(
        bridgeId,
        "request.excludedBridgeIds",
      );
    }
  }
}