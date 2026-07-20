/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-performance-attribution.ts
 *
 * Purpose:
 * Produces deterministic strategy-level portfolio performance attribution from
 * immutable strategy performance snapshots and current portfolio allocations.
 *
 * Notes:
 * - The Milestone 33 contract currently exposes performance snapshots rather
 *   than trade-ledger events. Attribution therefore reflects the latest
 *   realized and unrealized P&L values available on each candidate.
 * - Optional fee and turnover values are read from serializable metadata using
 *   conservative, documented key fallbacks.
 * - All returned objects and arrays are frozen.
 */

import type {
  StrategyMetadata,
  StrategySerializableValue,
  UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import type {
  AiStrategyAttributionId,
  AiStrategyCandidate,
  AiStrategyCandidateId,
  AiStrategyCurrentAllocation,
  AiStrategyPerformanceAttribution,
  AiStrategyPerformanceAttributionEntry,
  AiStrategyPerformanceAttributionPort,
  AiStrategyPortfolioId,
} from "./ai-strategy-portfolio-contracts";

const EPSILON = 1e-12;
const DEFAULT_NUMERICAL_PRECISION = 12;

const FEE_METADATA_KEYS = Object.freeze([
  "fees",
  "totalFees",
  "tradingFees",
  "commission",
  "commissions",
  "executionFees",
] as const);

const TURNOVER_METADATA_KEYS = Object.freeze([
  "turnover",
  "portfolioTurnover",
  "tradingTurnover",
  "notionalTurnover",
  "totalTurnover",
] as const);

export interface StrategyPerformanceAttributionOptions {
  /**
   * Decimal precision applied to deterministic numerical outputs.
   *
   * Default: 12
   */
  readonly numericalPrecision?: number;

  /**
   * Metadata keys checked, in order, when reading cumulative strategy fees.
   */
  readonly feeMetadataKeys?: readonly string[];

  /**
   * Metadata keys checked, in order, when reading cumulative strategy turnover.
   */
  readonly turnoverMetadataKeys?: readonly string[];

  /**
   * When true, inactive allocations are included in attribution entries.
   *
   * Default: false
   */
  readonly includeInactiveAllocations?: boolean;

  /**
   * When true, candidates with no matching allocation are included with zero
   * allocated weight and capital.
   *
   * Default: false
   */
  readonly includeUnallocatedCandidates?: boolean;

  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly numericalPrecision: number;
  readonly feeMetadataKeys: readonly string[];
  readonly turnoverMetadataKeys: readonly string[];
  readonly includeInactiveAllocations: boolean;
  readonly includeUnallocatedCandidates: boolean;
  readonly metadata: StrategyMetadata;
}

interface CandidateAttributionInput {
  readonly candidate: AiStrategyCandidate;
  readonly allocation?: AiStrategyCurrentAllocation;
}

interface RawAttributionEntry {
  readonly candidateId: AiStrategyCandidateId;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly allocatedWeight: number;
  readonly allocatedCapital: number;
  readonly grossPnl: number;
  readonly fees: number;
  readonly netPnl: number;
  readonly maximumDrawdown: number;
  readonly turnover: number;
  readonly dataPointCount: number;
  readonly availableMetricCount: number;
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeMetadata(
  value: Readonly<Record<string, StrategySerializableValue>>,
): StrategyMetadata {
  return Object.freeze({ ...value });
}

function finiteOrZero(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function nonNegative(value: number | undefined): number {
  return Math.max(0, finiteOrZero(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (Math.abs(value) <= EPSILON) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + finiteOrZero(value), 0);
}

function normalizeOptions(
  options: StrategyPerformanceAttributionOptions,
): NormalizedOptions {
  const requestedPrecision =
    options.numericalPrecision ?? DEFAULT_NUMERICAL_PRECISION;

  const numericalPrecision = Number.isInteger(requestedPrecision)
    ? clamp(requestedPrecision, 0, 15)
    : DEFAULT_NUMERICAL_PRECISION;

  const normalizeKeys = (
    values: readonly string[] | undefined,
    fallback: readonly string[],
  ): readonly string[] => {
    const source = values ?? fallback;
    const normalized = source
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return freezeArray([...new Set(normalized)]);
  };

  return Object.freeze({
    numericalPrecision,
    feeMetadataKeys: normalizeKeys(
      options.feeMetadataKeys,
      FEE_METADATA_KEYS,
    ),
    turnoverMetadataKeys: normalizeKeys(
      options.turnoverMetadataKeys,
      TURNOVER_METADATA_KEYS,
    ),
    includeInactiveAllocations: options.includeInactiveAllocations ?? false,
    includeUnallocatedCandidates: options.includeUnallocatedCandidates ?? false,
    metadata: options.metadata ?? freezeMetadata({}),
  });
}

function readFiniteMetadataNumber(
  metadata: StrategyMetadata,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function createAttributionId(
  portfolioId: AiStrategyPortfolioId,
  periodStart: UnixTimestampMilliseconds,
  periodEnd: UnixTimestampMilliseconds,
): AiStrategyAttributionId {
  return [
    "strategy-attribution",
    portfolioId,
    String(periodStart),
    String(periodEnd),
  ].join(":");
}

function compareCandidateInputs(
  left: CandidateAttributionInput,
  right: CandidateAttributionInput,
): number {
  const leftIdentity = left.candidate.identity;
  const rightIdentity = right.candidate.identity;

  const byCandidateId = leftIdentity.candidateId.localeCompare(
    rightIdentity.candidateId,
  );

  if (byCandidateId !== 0) {
    return byCandidateId;
  }

  const byStrategyId = leftIdentity.strategyId.localeCompare(
    rightIdentity.strategyId,
  );

  if (byStrategyId !== 0) {
    return byStrategyId;
  }

  return leftIdentity.strategyInstanceId.localeCompare(
    rightIdentity.strategyInstanceId,
  );
}

function buildCandidateInputs(
  candidates: readonly AiStrategyCandidate[],
  allocations: readonly AiStrategyCurrentAllocation[],
  options: NormalizedOptions,
): {
  readonly inputs: readonly CandidateAttributionInput[];
  readonly orphanAllocations: readonly AiStrategyCurrentAllocation[];
} {
  const candidateById = new Map<AiStrategyCandidateId, AiStrategyCandidate>();

  for (const candidate of candidates) {
    if (!candidateById.has(candidate.identity.candidateId)) {
      candidateById.set(candidate.identity.candidateId, candidate);
    }
  }

  const allocationById = new Map<
    AiStrategyCandidateId,
    AiStrategyCurrentAllocation
  >();

  const orphanAllocations: AiStrategyCurrentAllocation[] = [];

  for (const allocation of allocations) {
    if (!options.includeInactiveAllocations && !allocation.active) {
      continue;
    }

    const candidate = candidateById.get(allocation.candidateId);

    if (candidate === undefined) {
      orphanAllocations.push(allocation);
      continue;
    }

    const existing = allocationById.get(allocation.candidateId);

    if (existing === undefined) {
      allocationById.set(allocation.candidateId, allocation);
      continue;
    }

    /*
     * Duplicate allocation records are resolved deterministically by preferring
     * the entry with the greater absolute capital, then greater weight.
     */
    const existingMagnitude = Math.abs(finiteOrZero(existing.capital));
    const candidateMagnitude = Math.abs(finiteOrZero(allocation.capital));

    if (
      candidateMagnitude > existingMagnitude + EPSILON ||
      (Math.abs(candidateMagnitude - existingMagnitude) <= EPSILON &&
        finiteOrZero(allocation.weight) > finiteOrZero(existing.weight))
    ) {
      allocationById.set(allocation.candidateId, allocation);
    }
  }

  const inputs: CandidateAttributionInput[] = [];

  for (const candidate of candidates) {
    const allocation = allocationById.get(candidate.identity.candidateId);

    if (allocation !== undefined || options.includeUnallocatedCandidates) {
      inputs.push(Object.freeze({ candidate, allocation }));
    }
  }

  inputs.sort(compareCandidateInputs);
  orphanAllocations.sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );

  return Object.freeze({
    inputs: freezeArray(inputs),
    orphanAllocations: freezeArray(orphanAllocations),
  });
}

function buildRawEntry(
  input: CandidateAttributionInput,
  options: NormalizedOptions,
): RawAttributionEntry {
  const { candidate, allocation } = input;
  const { performance } = candidate;

  const realizedPnl = finiteOrZero(performance.realizedPnl);
  const unrealizedPnl = finiteOrZero(performance.unrealizedPnl);
  const grossPnl = realizedPnl + unrealizedPnl;

  const extractedFees = readFiniteMetadataNumber(
    performance.metadata,
    options.feeMetadataKeys,
  );
  const fees = nonNegative(extractedFees);

  const extractedTurnover = readFiniteMetadataNumber(
    performance.metadata,
    options.turnoverMetadataKeys,
  );
  const turnover = nonNegative(extractedTurnover);

  const maximumDrawdown = Math.abs(
    finiteOrZero(performance.maximumDrawdown),
  );

  const dataPointCount = Math.max(
    0,
    Math.trunc(
      finiteOrZero(
        performance.totalTrades ??
          performance.totalSignals ??
          performance.totalEvaluations,
      ),
    ),
  );

  const optionalMetrics: readonly (number | undefined)[] = [
    performance.realizedPnl,
    performance.unrealizedPnl,
    performance.totalTrades,
    performance.winningTrades,
    performance.losingTrades,
    performance.winRate,
    performance.profitFactor,
    performance.sharpeRatio,
    performance.sortinoRatio,
    performance.maximumDrawdown,
    extractedFees,
    extractedTurnover,
  ];

  const availableMetricCount = optionalMetrics.filter(
    (metric) => metric !== undefined && Number.isFinite(metric),
  ).length;

  return Object.freeze({
    candidateId: candidate.identity.candidateId,
    strategyId: candidate.identity.strategyId,
    strategyInstanceId: candidate.identity.strategyInstanceId,
    allocatedWeight: clamp(finiteOrZero(allocation?.weight), 0, 1),
    allocatedCapital: Math.max(0, finiteOrZero(allocation?.capital)),
    grossPnl,
    fees,
    netPnl: grossPnl - fees,
    maximumDrawdown,
    turnover,
    dataPointCount,
    availableMetricCount,
  });
}

function calculateConfidence(entry: RawAttributionEntry): number {
  const metricCoverage = clamp(entry.availableMetricCount / 12, 0, 1);

  /*
   * Confidence rises smoothly with trade/evaluation history and reaches
   * approximately 0.91 at 100 observations.
   */
  const historyConfidence =
    entry.dataPointCount <= 0
      ? 0
      : 1 - Math.exp(-entry.dataPointCount / 42);

  const allocationConfidence =
    entry.allocatedWeight > EPSILON || entry.allocatedCapital > EPSILON
      ? 1
      : 0.5;

  return clamp(
    metricCoverage * 0.45 +
      historyConfidence * 0.4 +
      allocationConfidence * 0.15,
    0,
    1,
  );
}

function calculateRiskContributions(
  entries: readonly RawAttributionEntry[],
): ReadonlyMap<AiStrategyCandidateId, number> {
  const rawRisks = entries.map((entry) => {
    const drawdownRisk = entry.maximumDrawdown;
    const pnlRisk = Math.abs(Math.min(0, entry.netPnl));
    const capitalScale =
      entry.allocatedCapital > EPSILON ? entry.allocatedCapital : 1;
    const pnlRiskRate = pnlRisk / capitalScale;

    return {
      candidateId: entry.candidateId,
      risk: entry.allocatedWeight * (drawdownRisk + pnlRiskRate),
    };
  });

  const totalRisk = sum(rawRisks.map((entry) => entry.risk));
  const result = new Map<AiStrategyCandidateId, number>();

  for (const entry of rawRisks) {
    result.set(
      entry.candidateId,
      totalRisk > EPSILON ? entry.risk / totalRisk : 0,
    );
  }

  return result;
}

function calculateDrawdownContributions(
  entries: readonly RawAttributionEntry[],
): ReadonlyMap<AiStrategyCandidateId, number> {
  const rawDrawdowns = entries.map((entry) => ({
    candidateId: entry.candidateId,
    contribution: entry.allocatedWeight * entry.maximumDrawdown,
  }));

  const totalDrawdown = sum(
    rawDrawdowns.map((entry) => entry.contribution),
  );
  const result = new Map<AiStrategyCandidateId, number>();

  for (const entry of rawDrawdowns) {
    result.set(
      entry.candidateId,
      totalDrawdown > EPSILON
        ? entry.contribution / totalDrawdown
        : 0,
    );
  }

  return result;
}

function calculateTurnoverContributions(
  entries: readonly RawAttributionEntry[],
): ReadonlyMap<AiStrategyCandidateId, number> {
  const rawTurnover = entries.map((entry) => ({
    candidateId: entry.candidateId,
    contribution: entry.turnover,
  }));

  const totalTurnover = sum(
    rawTurnover.map((entry) => entry.contribution),
  );
  const result = new Map<AiStrategyCandidateId, number>();

  for (const entry of rawTurnover) {
    result.set(
      entry.candidateId,
      totalTurnover > EPSILON
        ? entry.contribution / totalTurnover
        : 0,
    );
  }

  return result;
}

function createEntry(
  raw: RawAttributionEntry,
  portfolioCapital: number,
  riskContributions: ReadonlyMap<AiStrategyCandidateId, number>,
  drawdownContributions: ReadonlyMap<AiStrategyCandidateId, number>,
  turnoverContributions: ReadonlyMap<AiStrategyCandidateId, number>,
  options: NormalizedOptions,
): AiStrategyPerformanceAttributionEntry {
  const precision = options.numericalPrecision;

  return Object.freeze({
    candidateId: raw.candidateId,
    strategyId: raw.strategyId,
    strategyInstanceId: raw.strategyInstanceId,
    allocatedWeight: round(raw.allocatedWeight, precision),
    grossPnl: round(raw.grossPnl, precision),
    fees: round(raw.fees, precision),
    netPnl: round(raw.netPnl, precision),
    returnContribution: round(
      portfolioCapital > EPSILON ? raw.netPnl / portfolioCapital : 0,
      precision,
    ),
    riskContribution: round(
      riskContributions.get(raw.candidateId) ?? 0,
      precision,
    ),
    drawdownContribution: round(
      drawdownContributions.get(raw.candidateId) ?? 0,
      precision,
    ),
    turnoverContribution: round(
      turnoverContributions.get(raw.candidateId) ?? 0,
      precision,
    ),
    attributionConfidence: round(calculateConfidence(raw), precision),
    metadata: freezeMetadata({
      source: "strategy-performance-attribution",
      allocatedCapital: round(raw.allocatedCapital, precision),
      maximumDrawdown: round(raw.maximumDrawdown, precision),
      observedTurnover: round(raw.turnover, precision),
      dataPointCount: raw.dataPointCount,
      availableMetricCount: raw.availableMetricCount,
      feeSource:
        raw.fees > EPSILON ? "performance-metadata" : "not-available",
      turnoverSource:
        raw.turnover > EPSILON ? "performance-metadata" : "not-available",
    }),
  });
}

export class StrategyPerformanceAttribution
  implements AiStrategyPerformanceAttributionPort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: StrategyPerformanceAttributionOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public attribute(
    portfolioId: AiStrategyPortfolioId,
    periodStart: UnixTimestampMilliseconds,
    periodEnd: UnixTimestampMilliseconds,
    candidates: readonly AiStrategyCandidate[],
    allocations: readonly AiStrategyCurrentAllocation[],
  ): AiStrategyPerformanceAttribution {
    if (portfolioId.trim().length === 0) {
      throw new Error("portfolioId must not be empty.");
    }

    if (!Number.isFinite(periodStart)) {
      throw new Error("periodStart must be a finite timestamp.");
    }

    if (!Number.isFinite(periodEnd)) {
      throw new Error("periodEnd must be a finite timestamp.");
    }

    if (periodEnd < periodStart) {
      throw new Error("periodEnd must be greater than or equal to periodStart.");
    }

    const { inputs, orphanAllocations } = buildCandidateInputs(
      candidates,
      allocations,
      this.options,
    );

    const rawEntries = inputs.map((input) =>
      buildRawEntry(input, this.options),
    );

    const portfolioCapital = sum(
      rawEntries.map((entry) => entry.allocatedCapital),
    );

    const riskContributions = calculateRiskContributions(rawEntries);
    const drawdownContributions =
      calculateDrawdownContributions(rawEntries);
    const turnoverContributions =
      calculateTurnoverContributions(rawEntries);

    const entries = rawEntries.map((raw) =>
      createEntry(
        raw,
        portfolioCapital,
        riskContributions,
        drawdownContributions,
        turnoverContributions,
        this.options,
      ),
    );

    const precision = this.options.numericalPrecision;
    const portfolioGrossPnl = sum(entries.map((entry) => entry.grossPnl));
    const portfolioFees = sum(entries.map((entry) => entry.fees));
    const portfolioNetPnl = sum(entries.map((entry) => entry.netPnl));

    /*
     * Orphan allocations cannot be attributed because the contract provides no
     * performance snapshot for them. Since no synthetic P&L is invented, their
     * unresolved P&L contribution is zero and their identifiers are recorded in
     * metadata for observability.
     */
    const unexplainedPnl = 0;

    return Object.freeze({
      attributionId: createAttributionId(
        portfolioId,
        periodStart,
        periodEnd,
      ),
      portfolioId,
      periodStart,
      periodEnd,
      portfolioGrossPnl: round(portfolioGrossPnl, precision),
      portfolioFees: round(portfolioFees, precision),
      portfolioNetPnl: round(portfolioNetPnl, precision),
      entries: freezeArray(entries),
      unexplainedPnl: round(unexplainedPnl, precision),
      metadata: freezeMetadata({
        source: "strategy-performance-attribution",
        attributionBasis: "latest-performance-snapshot",
        candidateCount: candidates.length,
        allocationCount: allocations.length,
        attributedEntryCount: entries.length,
        orphanAllocationCount: orphanAllocations.length,
        orphanCandidateIds: orphanAllocations.map(
          (allocation) => allocation.candidateId,
        ),
        portfolioCapital: round(portfolioCapital, precision),
        includeInactiveAllocations:
          this.options.includeInactiveAllocations,
        includeUnallocatedCandidates:
          this.options.includeUnallocatedCandidates,
        numericalPrecision: precision,
        feeMetadataKeys: this.options.feeMetadataKeys,
        turnoverMetadataKeys: this.options.turnoverMetadataKeys,
        engineMetadata: this.options.metadata,
      }),
    });
  }
}

export function createStrategyPerformanceAttribution(
  options: StrategyPerformanceAttributionOptions = {},
): StrategyPerformanceAttribution {
  return new StrategyPerformanceAttribution(options);
}