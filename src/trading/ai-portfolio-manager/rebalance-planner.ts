/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 9: Deterministic rebalance planner.
 */

import {
  PortfolioMarketType,
  PortfolioPositionSide,
  PortfolioRebalanceStatus,
  type AssetSymbol,
  type ExchangeIdentifier,
  type MarketSymbol,
  type PortfolioCapitalAllocation,
  type PortfolioMetadata,
  type PortfolioRebalancePlan,
  type PortfolioRebalanceRequest,
  type PortfolioRebalanceTrade,
  type PortfolioRebalancingEngine,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface RebalancePlannerClock {
  now(): number;
}

export interface RebalancePlannerOptions {
  readonly minimumTradeNotional?: number;
  readonly defaultFeeRate?: number;
  readonly defaultSlippageRate?: number;
  readonly planTimeToLiveMilliseconds?: number;
  readonly numericalTolerance?: number;
  readonly preferExistingExchange?: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedOptions {
  readonly minimumTradeNotional: number;
  readonly defaultFeeRate: number;
  readonly defaultSlippageRate: number;
  readonly planTimeToLiveMilliseconds?: number;
  readonly numericalTolerance: number;
  readonly preferExistingExchange: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface TradeCandidate {
  readonly allocation: PortfolioCapitalAllocation;
  readonly marketSymbol: MarketSymbol;
  readonly baseAsset: AssetSymbol;
  readonly quoteAsset: AssetSymbol;
  readonly exchangeId?: ExchangeIdentifier;
  readonly accountId?: string;
  readonly marketType: PortfolioRebalanceTrade["marketType"];
  readonly side: PortfolioPositionSide;
  readonly requestedNotional: number;
  readonly estimatedPrice?: number;
  readonly estimatedFeeRate: number;
  readonly estimatedSlippageRate: number;
  readonly reasons: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

const SYSTEM_CLOCK: RebalancePlannerClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field);

  if (value < 0) {
    throw new RangeError(`${field} must be non-negative.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: RebalancePlannerOptions | undefined,
): ResolvedOptions {
  const minimumTradeNotional = options?.minimumTradeNotional ?? 10;
  const defaultFeeRate = options?.defaultFeeRate ?? 0.001;
  const defaultSlippageRate = options?.defaultSlippageRate ?? 0.0005;
  const numericalTolerance = options?.numericalTolerance ?? 1e-10;

  assertNonNegative(
    minimumTradeNotional,
    "options.minimumTradeNotional",
  );
  assertNonNegative(defaultFeeRate, "options.defaultFeeRate");
  assertNonNegative(
    defaultSlippageRate,
    "options.defaultSlippageRate",
  );
  assertFinite(numericalTolerance, "options.numericalTolerance");

  if (defaultFeeRate > 1) {
    throw new RangeError(
      "options.defaultFeeRate must not exceed 1.",
    );
  }

  if (defaultSlippageRate > 1) {
    throw new RangeError(
      "options.defaultSlippageRate must not exceed 1.",
    );
  }

  if (numericalTolerance <= 0) {
    throw new RangeError(
      "options.numericalTolerance must be greater than zero.",
    );
  }

  if (options?.planTimeToLiveMilliseconds !== undefined) {
    assertFinite(
      options.planTimeToLiveMilliseconds,
      "options.planTimeToLiveMilliseconds",
    );

    if (options.planTimeToLiveMilliseconds <= 0) {
      throw new RangeError(
        "options.planTimeToLiveMilliseconds must be greater than zero.",
      );
    }
  }

  return Object.freeze({
    minimumTradeNotional,
    defaultFeeRate,
    defaultSlippageRate,
    planTimeToLiveMilliseconds:
      options?.planTimeToLiveMilliseconds,
    numericalTolerance,
    preferExistingExchange:
      options?.preferExistingExchange ?? true,
    metadata: cloneMetadata(options?.metadata),
  });
}

function normalizeTimestamp(
  timestamp: Timestamp,
  field: string,
): Timestamp {
  assertNonEmpty(timestamp, field);
  const milliseconds = Date.parse(timestamp);

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${field} must be a valid timestamp.`);
  }

  return new Date(milliseconds).toISOString();
}

function metadataValue(
  metadata: PortfolioMetadata | undefined,
  key: string,
): unknown {
  if (metadata === undefined) {
    return undefined;
  }

  return (metadata as Readonly<Record<string, unknown>>)[key];
}

function metadataString(
  metadata: PortfolioMetadata | undefined,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = metadataValue(metadata, key);

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function metadataNumber(
  metadata: PortfolioMetadata | undefined,
  ...keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = metadataValue(metadata, key);

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function enumValue<T>(
  source: object,
  candidates: readonly string[],
  field: string,
): T {
  const values = source as Readonly<Record<string, T>>;

  for (const candidate of candidates) {
    const value = values[candidate];

    if (value !== undefined) {
      return value;
    }
  }

  const fallback = Object.values(values)[0];

  if (fallback === undefined) {
    throw new Error(`${field} does not define any enum values.`);
  }

  return fallback;
}

function buySide(): PortfolioPositionSide {
  return enumValue<PortfolioPositionSide>(
    PortfolioPositionSide,
    ["LONG", "BUY"],
    "PortfolioPositionSide",
  );
}

function sellSide(): PortfolioPositionSide {
  return enumValue<PortfolioPositionSide>(
    PortfolioPositionSide,
    ["SHORT", "SELL"],
    "PortfolioPositionSide",
  );
}

function generatedStatus(
  approvalRequired: boolean,
): PortfolioRebalanceStatus {
  return enumValue<PortfolioRebalanceStatus>(
    PortfolioRebalanceStatus,
    approvalRequired
      ? ["PENDING_APPROVAL", "PROPOSED", "PLANNED", "CREATED"]
      : ["APPROVED", "PLANNED", "PROPOSED", "CREATED"],
    "PortfolioRebalanceStatus",
  );
}

function targetIsAsset(
  allocation: PortfolioCapitalAllocation,
): boolean {
  return String(allocation.targetType).toUpperCase() === "ASSET";
}

function resolvePosition(
  request: PortfolioRebalanceRequest,
  asset: string,
) {
  return request.snapshot.positions
    .filter((position) => position.baseAsset === asset)
    .sort((left, right) => {
      const notionalDifference =
        Math.abs(right.notionalValue) - Math.abs(left.notionalValue);

      return notionalDifference !== 0
        ? notionalDifference
        : left.positionId.localeCompare(right.positionId);
    })[0];
}

function resolveBalance(
  request: PortfolioRebalanceRequest,
  asset: string,
) {
  return request.snapshot.balances
    .filter((balance) => balance.asset === asset)
    .sort((left, right) => {
      const valueDifference = right.marketValue - left.marketValue;

      return valueDifference !== 0
        ? valueDifference
        : String(left.exchangeId ?? "").localeCompare(
            String(right.exchangeId ?? ""),
          );
    })[0];
}

function resolveCandidate(
  request: PortfolioRebalanceRequest,
  allocation: PortfolioCapitalAllocation,
  options: ResolvedOptions,
): TradeCandidate | undefined {
  const notional = Math.abs(allocation.capitalChange);

  if (
    notional < options.minimumTradeNotional ||
    notional <= options.numericalTolerance
  ) {
    return undefined;
  }

  const metadata = allocation.metadata;
  const targetId = allocation.targetId;
  const assetTarget = targetIsAsset(allocation);
  const baseAsset = (
    metadataString(metadata, "baseAsset", "asset") ??
    (assetTarget ? targetId : undefined)
  ) as AssetSymbol | undefined;

  if (baseAsset === undefined) {
    return undefined;
  }

  const position = resolvePosition(request, baseAsset);
  const balance = resolveBalance(request, baseAsset);
  const quoteAsset = (
    metadataString(metadata, "quoteAsset", "currency") ??
    position?.quoteAsset ??
    request.snapshot.baseCurrency
  ) as AssetSymbol;

  const marketSymbol = (
    metadataString(metadata, "marketSymbol", "symbol") ??
    position?.marketSymbol ??
    `${baseAsset}-${quoteAsset}`
  ) as MarketSymbol;

  const marketType =
    position?.marketType ??
    enumValue<PortfolioRebalanceTrade["marketType"]>(
      PortfolioMarketType,
      ["SPOT", "PERPETUAL", "FUTURES"],
      "PortfolioMarketType",
    );

  const exchangeId = (
    metadataString(metadata, "exchangeId") ??
    (options.preferExistingExchange
      ? position?.exchangeId ?? balance?.exchangeId
      : undefined)
  ) as ExchangeIdentifier | undefined;

  const accountId =
    metadataString(metadata, "accountId") ??
    position?.accountId ??
    balance?.accountId;

  const estimatedPrice =
    metadataNumber(metadata, "estimatedPrice", "price") ??
    position?.markPrice ??
    balance?.valuationPrice;

  const feeRate =
    metadataNumber(metadata, "feeRate", "estimatedFeeRate") ??
    options.defaultFeeRate;
  const slippageRate =
    metadataNumber(
      metadata,
      "slippageRate",
      "estimatedSlippageRate",
    ) ?? options.defaultSlippageRate;

  assertNonNegative(feeRate, `${targetId}.feeRate`);
  assertNonNegative(slippageRate, `${targetId}.slippageRate`);

  const isBuy = allocation.capitalChange > 0;
  const reasons = [
    ...allocation.reasons,
    isBuy
      ? "Increase exposure to reach the allocated capital target."
      : "Reduce exposure to reach the allocated capital target.",
  ];

  return Object.freeze({
    allocation,
    marketSymbol,
    baseAsset,
    quoteAsset,
    exchangeId,
    accountId,
    marketType,
    side: isBuy ? buySide() : sellSide(),
    requestedNotional: notional,
    ...(estimatedPrice !== undefined && estimatedPrice > 0
      ? { estimatedPrice }
      : {}),
    estimatedFeeRate: feeRate,
    estimatedSlippageRate: slippageRate,
    reasons: Object.freeze(reasons),
    metadata: cloneMetadata(metadata),
  });
}

function scaleCandidatesForTurnover(
  candidates: readonly TradeCandidate[],
  totalEquity: number,
  maximumTurnover: number | undefined,
  tolerance: number,
): {
  readonly candidates: readonly TradeCandidate[];
  readonly scale: number;
} {
  if (maximumTurnover === undefined) {
    return Object.freeze({
      candidates,
      scale: 1,
    });
  }

  assertNonNegative(maximumTurnover, "request.maximumTurnover");

  if (maximumTurnover > 1) {
    throw new RangeError(
      "request.maximumTurnover must not exceed 1.",
    );
  }

  const turnoverNotional = candidates.reduce(
    (total, candidate) => total + candidate.requestedNotional,
    0,
  );
  const limit = totalEquity * maximumTurnover;

  if (
    turnoverNotional <= limit + tolerance ||
    turnoverNotional <= tolerance
  ) {
    return Object.freeze({
      candidates,
      scale: 1,
    });
  }

  const scale = limit / turnoverNotional;

  return Object.freeze({
    candidates: Object.freeze(
      candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          requestedNotional:
            candidate.requestedNotional * scale,
          reasons: Object.freeze([
            ...candidate.reasons,
            "Trade size was proportionally reduced to satisfy the maximum turnover limit.",
          ]),
        }),
      ),
    ),
    scale,
  });
}

function estimatedCost(
  candidate: TradeCandidate,
): number {
  return (
    candidate.requestedNotional *
    (candidate.estimatedFeeRate +
      candidate.estimatedSlippageRate)
  );
}

function scaleCandidatesForCost(
  candidates: readonly TradeCandidate[],
  maximumTransactionCost: number | undefined,
  tolerance: number,
): {
  readonly candidates: readonly TradeCandidate[];
  readonly scale: number;
} {
  if (maximumTransactionCost === undefined) {
    return Object.freeze({
      candidates,
      scale: 1,
    });
  }

  assertNonNegative(
    maximumTransactionCost,
    "request.maximumTransactionCost",
  );

  const totalCost = candidates.reduce(
    (total, candidate) => total + estimatedCost(candidate),
    0,
  );

  if (
    totalCost <= maximumTransactionCost + tolerance ||
    totalCost <= tolerance
  ) {
    return Object.freeze({
      candidates,
      scale: 1,
    });
  }

  const scale = maximumTransactionCost / totalCost;

  return Object.freeze({
    candidates: Object.freeze(
      candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          requestedNotional:
            candidate.requestedNotional * scale,
          reasons: Object.freeze([
            ...candidate.reasons,
            "Trade size was proportionally reduced to satisfy the maximum transaction-cost limit.",
          ]),
        }),
      ),
    ),
    scale,
  });
}

function candidatePriority(
  candidate: TradeCandidate,
): number {
  const denominator = Math.max(
    candidate.allocation.previousCapital,
    candidate.requestedNotional,
    1,
  );
  const relativeChange =
    candidate.requestedNotional / denominator;
  const isReduction =
    candidate.allocation.capitalChange < 0;

  return Math.max(
    1,
    Math.round(
      relativeChange * 1_000 +
        (isReduction ? 100 : 0),
    ),
  );
}

function createTrade(
  request: PortfolioRebalanceRequest,
  candidate: TradeCandidate,
  index: number,
): PortfolioRebalanceTrade {
  const estimatedPrice = candidate.estimatedPrice;
  const quantity =
    estimatedPrice !== undefined && estimatedPrice > 0
      ? candidate.requestedNotional / estimatedPrice
      : undefined;
  const estimatedFee =
    candidate.requestedNotional *
    candidate.estimatedFeeRate;
  const estimatedSlippage =
    candidate.requestedNotional *
    candidate.estimatedSlippageRate;

  return Object.freeze({
    tradeId: `${request.rebalanceId}:${String(index + 1).padStart(4, "0")}`,
    marketSymbol: candidate.marketSymbol,
    baseAsset: candidate.baseAsset,
    quoteAsset: candidate.quoteAsset,
    marketType: candidate.marketType,
    side: candidate.side,
    ...(candidate.exchangeId === undefined
      ? {}
      : { exchangeId: candidate.exchangeId }),
    ...(candidate.accountId === undefined
      ? {}
      : { accountId: candidate.accountId }),
    ...(quantity === undefined ? {} : { quantity }),
    notionalValue: candidate.requestedNotional,
    ...(estimatedPrice === undefined
      ? {}
      : { estimatedPrice }),
    estimatedFee,
    estimatedSlippage,
    priority: candidatePriority(candidate),
    reasons: candidate.reasons,
    metadata: Object.freeze({
      ...(candidate.metadata ?? {}),
      targetType: candidate.allocation.targetType,
      targetId: candidate.allocation.targetId,
      previousCapital:
        candidate.allocation.previousCapital,
      allocatedCapital:
        candidate.allocation.allocatedCapital,
      capitalChange: candidate.allocation.capitalChange,
    }),
  });
}

function validateRequest(
  request: PortfolioRebalanceRequest,
): void {
  assertNonEmpty(request.rebalanceId, "request.rebalanceId");
  assertNonEmpty(request.portfolioId, "request.portfolioId");
  normalizeTimestamp(request.requestedAt, "request.requestedAt");

  if (request.snapshot.portfolioId !== request.portfolioId) {
    throw new Error(
      "request.snapshot.portfolioId must match request.portfolioId.",
    );
  }

  if (
    request.allocationResult.portfolioId !==
    request.portfolioId
  ) {
    throw new Error(
      "request.allocationResult.portfolioId must match request.portfolioId.",
    );
  }

  assertNonNegative(
    request.snapshot.totalEquity,
    "request.snapshot.totalEquity",
  );

  if (
    request.optimizationResult !== undefined &&
    request.optimizationResult.portfolioId !==
      request.portfolioId
  ) {
    throw new Error(
      "request.optimizationResult.portfolioId must match request.portfolioId.",
    );
  }

  if (
    request.driftReport !== undefined &&
    request.driftReport.portfolioId !== request.portfolioId
  ) {
    throw new Error(
      "request.driftReport.portfolioId must match request.portfolioId.",
    );
  }
}

export function createPortfolioRebalancePlan(
  request: PortfolioRebalanceRequest,
  options?: RebalancePlannerOptions,
  clock: RebalancePlannerClock = SYSTEM_CLOCK,
): PortfolioRebalancePlan {
  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  validateRequest(request);
  const resolved = resolveOptions(options);

  const unresolvedTargets: string[] = [];
  const rawCandidates: TradeCandidate[] = [];

  for (const allocation of request.allocationResult.allocations) {
    const candidate = resolveCandidate(
      request,
      allocation,
      resolved,
    );

    if (candidate !== undefined) {
      rawCandidates.push(candidate);
    } else if (
      Math.abs(allocation.capitalChange) >=
      resolved.minimumTradeNotional
    ) {
      unresolvedTargets.push(
        `${String(allocation.targetType)}:${allocation.targetId}`,
      );
    }
  }

  const turnoverScaled = scaleCandidatesForTurnover(
    Object.freeze(rawCandidates),
    request.snapshot.totalEquity,
    request.maximumTurnover,
    resolved.numericalTolerance,
  );
  const costScaled = scaleCandidatesForCost(
    turnoverScaled.candidates,
    request.maximumTransactionCost,
    resolved.numericalTolerance,
  );

  const eligibleCandidates = costScaled.candidates
    .filter(
      (candidate) =>
        candidate.requestedNotional >=
        resolved.minimumTradeNotional,
    )
    .sort((left, right) => {
      const priorityDifference =
        candidatePriority(right) - candidatePriority(left);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const symbolDifference =
        left.marketSymbol.localeCompare(right.marketSymbol);

      if (symbolDifference !== 0) {
        return symbolDifference;
      }

      return left.allocation.targetId.localeCompare(
        right.allocation.targetId,
      );
    });

  const trades = Object.freeze(
    eligibleCandidates.map((candidate, index) =>
      createTrade(request, candidate, index),
    ),
  );

  const totalBuyNotional = trades
    .filter((trade) => trade.side === buySide())
    .reduce((total, trade) => total + trade.notionalValue, 0);
  const totalSellNotional = trades
    .filter((trade) => trade.side === sellSide())
    .reduce((total, trade) => total + trade.notionalValue, 0);
  const grossTradeNotional =
    totalBuyNotional + totalSellNotional;
  const estimatedTurnover =
    request.snapshot.totalEquity >
    resolved.numericalTolerance
      ? grossTradeNotional / request.snapshot.totalEquity
      : 0;
  const estimatedFees = trades.reduce(
    (total, trade) => total + (trade.estimatedFee ?? 0),
    0,
  );
  const estimatedSlippage = trades.reduce(
    (total, trade) =>
      total + (trade.estimatedSlippage ?? 0),
    0,
  );
  const estimatedTotalCost =
    estimatedFees + estimatedSlippage;

  const generatedAt = new Date(clock.now()).toISOString();
  const validUntil =
    resolved.planTimeToLiveMilliseconds === undefined
      ? undefined
      : new Date(
          Date.parse(generatedAt) +
            resolved.planTimeToLiveMilliseconds,
        ).toISOString();

  const expectedRiskReduction = metadataNumber(
    request.optimizationResult?.metadata,
    "expectedRiskReduction",
    "riskReduction",
  );
  const expectedReturnImpact = metadataNumber(
    request.optimizationResult?.metadata,
    "expectedReturnImpact",
    "returnImpact",
  );

  return Object.freeze({
    rebalanceId: request.rebalanceId,
    portfolioId: request.portfolioId,
    reason: request.reason,
    status: generatedStatus(request.approvalRequired),
    trades,
    totalBuyNotional,
    totalSellNotional,
    estimatedTurnover,
    estimatedFees,
    estimatedSlippage,
    estimatedTotalCost,
    ...(expectedRiskReduction === undefined
      ? {}
      : { expectedRiskReduction }),
    ...(expectedReturnImpact === undefined
      ? {}
      : { expectedReturnImpact }),
    approvalRequired: request.approvalRequired,
    ...(validUntil === undefined ? {} : { validUntil }),
    generatedAt,
    metadata: Object.freeze({
      ...(resolved.metadata ?? {}),
      ...(request.metadata ?? {}),
      snapshotId: request.snapshot.snapshotId,
      allocationId:
        request.allocationResult.allocationId,
      tradeCount: trades.length,
      unresolvedTargets: Object.freeze(unresolvedTargets),
      turnoverScale: turnoverScaled.scale,
      transactionCostScale: costScaled.scale,
      allocationConstraintsSatisfied:
        request.allocationResult.constraintsSatisfied,
    }),
  });
}

export class DeterministicPortfolioRebalancePlanner
  implements PortfolioRebalancingEngine
{
  private readonly options: RebalancePlannerOptions;
  private readonly clock: RebalancePlannerClock;

  public constructor(
    options: RebalancePlannerOptions = Object.freeze({}),
    clock: RebalancePlannerClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public createPlan(
    request: PortfolioRebalanceRequest,
  ): PortfolioRebalancePlan {
    return createPortfolioRebalancePlan(
      request,
      this.options,
      this.clock,
    );
  }
}

export class AIPortfolioRebalancePlanner extends DeterministicPortfolioRebalancePlanner {}