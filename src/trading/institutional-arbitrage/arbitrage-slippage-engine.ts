/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-slippage-engine.ts
 *
 * Purpose:
 * Production-grade, deterministic, immutable slippage estimation for
 * institutional arbitrage legs and opportunities.
 */

import {
  type ArbitrageAsset,
  type ArbitrageBasisPoints,
  type ArbitrageDecimal,
  type ArbitrageLeg,
  type ArbitrageLiquidityAssessment,
  type ArbitrageMarketSnapshot,
  type ArbitrageSide,
  type ArbitrageSlippageEstimate,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";

import { assertInstitutionalArbitrageOpportunity } from "./institutional-arbitrage-validator";

const BASIS_POINTS_DIVISOR = 10_000;
const PERCENTAGE_DIVISOR = 100;
const DEFAULT_DECIMAL_PLACES = 12;

export const ARBITRAGE_SLIPPAGE_MODELS = [
  "FIXED_BPS",
  "SPREAD",
  "LIQUIDITY_UTILIZATION",
  "HYBRID",
] as const;

export type ArbitrageSlippageModel =
  (typeof ARBITRAGE_SLIPPAGE_MODELS)[number];

export interface ArbitrageSlippageEngineOptions {
  readonly model?: ArbitrageSlippageModel;
  readonly fixedSlippageBps?: ArbitrageBasisPoints;
  readonly minimumSlippageBps?: ArbitrageBasisPoints;
  readonly maximumSlippageBps?: ArbitrageBasisPoints;
  readonly spreadMultiplier?: ArbitrageDecimal;
  readonly utilizationMultiplier?: ArbitrageDecimal;
  readonly depthLevelMultiplier?: ArbitrageDecimal;
  readonly latencyMultiplier?: ArbitrageDecimal;
  readonly staleMarketDataMultiplier?: ArbitrageDecimal;
  readonly volatilityBufferBps?: ArbitrageBasisPoints;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly marketDataStaleAfterMs?: number;
  readonly decimalPlaces?: number;
}

export interface ArbitrageSlippageContext {
  readonly reportingAsset: ArbitrageAsset;
  readonly requestedNotional?: ArbitrageDecimal;
  readonly executionPrice?: ArbitrageDecimal;
  readonly marketSnapshot?: ArbitrageMarketSnapshot;
  readonly liquidity?: ArbitrageLiquidityAssessment;
  readonly latencyMs?: number;
  readonly volatilityBps?: ArbitrageBasisPoints;
  readonly additionalBufferBps?: ArbitrageBasisPoints;
}

export interface ArbitrageLegSlippageInput {
  readonly leg: ArbitrageLeg;
  readonly context?: ArbitrageSlippageContext;
}

export interface ArbitrageOpportunitySlippageInput {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly contextsByLegId?: Readonly<
    Record<string, ArbitrageSlippageContext | undefined>
  >;
}

export interface ArbitrageOpportunitySlippageResult {
  readonly expectedSlippageValue: ArbitrageDecimal;
  readonly stressedSlippageValue: ArbitrageDecimal;
  readonly weightedExpectedSlippageBps: ArbitrageBasisPoints;
  readonly weightedStressedSlippageBps: ArbitrageBasisPoints;
  readonly maximumSlippageBps: ArbitrageBasisPoints;
  readonly reportingAsset: ArbitrageAsset;
  readonly legEstimates: Readonly<Record<string, ArbitrageSlippageEstimate>>;
}

export interface ArbitrageSlippagePolicy {
  readonly maximumExpectedSlippageBps: ArbitrageBasisPoints;
  readonly maximumStressedSlippageBps: ArbitrageBasisPoints;
  readonly maximumSlippageValue?: ArbitrageDecimal;
}

export interface ArbitrageSlippagePolicyAssessment {
  readonly accepted: boolean;
  readonly expectedSlippageBpsAccepted: boolean;
  readonly stressedSlippageBpsAccepted: boolean;
  readonly slippageValueAccepted: boolean;
  readonly reasons: readonly string[];
}

interface NormalizedOptions {
  readonly model: ArbitrageSlippageModel;
  readonly fixedSlippageBps: ArbitrageBasisPoints;
  readonly minimumSlippageBps: ArbitrageBasisPoints;
  readonly maximumSlippageBps: ArbitrageBasisPoints;
  readonly spreadMultiplier: ArbitrageDecimal;
  readonly utilizationMultiplier: ArbitrageDecimal;
  readonly depthLevelMultiplier: ArbitrageDecimal;
  readonly latencyMultiplier: ArbitrageDecimal;
  readonly staleMarketDataMultiplier: ArbitrageDecimal;
  readonly volatilityBufferBps: ArbitrageBasisPoints;
  readonly stressMultiplier: ArbitrageDecimal;
  readonly marketDataStaleAfterMs: number;
  readonly decimalPlaces: number;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  model: "HYBRID",
  fixedSlippageBps: 2,
  minimumSlippageBps: 0,
  maximumSlippageBps: 500,
  spreadMultiplier: 0.5,
  utilizationMultiplier: 25,
  depthLevelMultiplier: 0.5,
  latencyMultiplier: 0.002,
  staleMarketDataMultiplier: 10,
  volatilityBufferBps: 0,
  stressMultiplier: 2,
  marketDataStaleAfterMs: 5_000,
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
});

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertNonNegative(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to zero.`);
  }
}

function assertPositive(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
}

function assertIntegerInRange(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function freezeRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function normalizeOptions(
  options: ArbitrageSlippageEngineOptions | undefined,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    model: options?.model ?? DEFAULT_OPTIONS.model,
    fixedSlippageBps:
      options?.fixedSlippageBps ?? DEFAULT_OPTIONS.fixedSlippageBps,
    minimumSlippageBps:
      options?.minimumSlippageBps ?? DEFAULT_OPTIONS.minimumSlippageBps,
    maximumSlippageBps:
      options?.maximumSlippageBps ?? DEFAULT_OPTIONS.maximumSlippageBps,
    spreadMultiplier:
      options?.spreadMultiplier ?? DEFAULT_OPTIONS.spreadMultiplier,
    utilizationMultiplier:
      options?.utilizationMultiplier ?? DEFAULT_OPTIONS.utilizationMultiplier,
    depthLevelMultiplier:
      options?.depthLevelMultiplier ?? DEFAULT_OPTIONS.depthLevelMultiplier,
    latencyMultiplier:
      options?.latencyMultiplier ?? DEFAULT_OPTIONS.latencyMultiplier,
    staleMarketDataMultiplier:
      options?.staleMarketDataMultiplier ??
      DEFAULT_OPTIONS.staleMarketDataMultiplier,
    volatilityBufferBps:
      options?.volatilityBufferBps ?? DEFAULT_OPTIONS.volatilityBufferBps,
    stressMultiplier:
      options?.stressMultiplier ?? DEFAULT_OPTIONS.stressMultiplier,
    marketDataStaleAfterMs:
      options?.marketDataStaleAfterMs ??
      DEFAULT_OPTIONS.marketDataStaleAfterMs,
    decimalPlaces: options?.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces,
  };

  if (!ARBITRAGE_SLIPPAGE_MODELS.includes(normalized.model)) {
    throw new Error(`Unsupported slippage model: ${normalized.model}.`);
  }

  assertNonNegative(normalized.fixedSlippageBps, "fixedSlippageBps");
  assertNonNegative(normalized.minimumSlippageBps, "minimumSlippageBps");
  assertNonNegative(normalized.maximumSlippageBps, "maximumSlippageBps");
  assertNonNegative(normalized.spreadMultiplier, "spreadMultiplier");
  assertNonNegative(normalized.utilizationMultiplier, "utilizationMultiplier");
  assertNonNegative(normalized.depthLevelMultiplier, "depthLevelMultiplier");
  assertNonNegative(normalized.latencyMultiplier, "latencyMultiplier");
  assertNonNegative(
    normalized.staleMarketDataMultiplier,
    "staleMarketDataMultiplier",
  );
  assertNonNegative(normalized.volatilityBufferBps, "volatilityBufferBps");
  assertPositive(normalized.stressMultiplier, "stressMultiplier");
  assertNonNegative(normalized.marketDataStaleAfterMs, "marketDataStaleAfterMs");
  assertIntegerInRange(normalized.decimalPlaces, "decimalPlaces", 0, 15);

  if (normalized.minimumSlippageBps > normalized.maximumSlippageBps) {
    throw new Error(
      "minimumSlippageBps cannot exceed maximumSlippageBps.",
    );
  }

  return freezeRecord(normalized);
}

function resolveReferencePrice(
  side: ArbitrageSide,
  snapshot: ArbitrageMarketSnapshot | undefined,
  explicitPrice: number | undefined,
  fallbackPrice: number | undefined,
): number | undefined {
  if (explicitPrice !== undefined) {
    assertPositive(explicitPrice, "context.executionPrice");
    return explicitPrice;
  }

  if (snapshot !== undefined) {
    const sidePrice =
      side === "BUY" || side === "OPEN_LONG"
        ? snapshot.askPrice
        : side === "SELL" || side === "OPEN_SHORT"
          ? snapshot.bidPrice
          : undefined;

    const candidate =
      sidePrice ??
      snapshot.midPrice ??
      snapshot.markPrice ??
      snapshot.lastPrice ??
      snapshot.indexPrice;

    if (candidate !== undefined) {
      assertPositive(candidate, "marketSnapshot reference price");
      return candidate;
    }
  }

  if (fallbackPrice !== undefined) {
    assertPositive(fallbackPrice, "leg.expectedPrice");
    return fallbackPrice;
  }

  return undefined;
}

function calculateSpreadBps(
  snapshot: ArbitrageMarketSnapshot | undefined,
): number {
  if (
    snapshot?.bidPrice === undefined ||
    snapshot.askPrice === undefined ||
    snapshot.bidPrice <= 0 ||
    snapshot.askPrice <= 0
  ) {
    return 0;
  }

  const midpoint = (snapshot.bidPrice + snapshot.askPrice) / 2;

  if (midpoint <= 0) {
    return 0;
  }

  return ((snapshot.askPrice - snapshot.bidPrice) / midpoint) *
    BASIS_POINTS_DIVISOR;
}

function calculateLiquidityUtilizationBps(
  liquidity: ArbitrageLiquidityAssessment | undefined,
  multiplier: number,
): number {
  if (liquidity === undefined) {
    return 0;
  }

  assertNonNegative(
    liquidity.liquidityUtilizationPercentage,
    "liquidity.liquidityUtilizationPercentage",
  );

  return (
    (liquidity.liquidityUtilizationPercentage / PERCENTAGE_DIVISOR) *
    multiplier
  );
}

function calculateDepthBps(
  liquidity: ArbitrageLiquidityAssessment | undefined,
  multiplier: number,
): number {
  if (liquidity === undefined) {
    return 0;
  }

  assertNonNegative(
    liquidity.depthLevelsConsumed,
    "liquidity.depthLevelsConsumed",
  );

  return liquidity.depthLevelsConsumed * multiplier;
}

function calculateLatencyBps(
  latencyMs: number | undefined,
  multiplier: number,
): number {
  if (latencyMs === undefined) {
    return 0;
  }

  assertNonNegative(latencyMs, "context.latencyMs");
  return latencyMs * multiplier;
}

function calculateStalenessBps(
  snapshot: ArbitrageMarketSnapshot | undefined,
  staleAfterMs: number,
  multiplier: number,
): number {
  if (snapshot === undefined) {
    return 0;
  }

  const ageMs = Math.max(0, snapshot.observedAt - snapshot.sourceTimestamp);

  if (ageMs <= staleAfterMs) {
    return 0;
  }

  const excessAgeRatio =
    staleAfterMs === 0
      ? 1
      : (ageMs - staleAfterMs) / Math.max(staleAfterMs, 1);

  return excessAgeRatio * multiplier;
}

function resolveNotional(
  leg: ArbitrageLeg,
  context: ArbitrageSlippageContext | undefined,
  referencePrice: number | undefined,
): number {
  if (context?.requestedNotional !== undefined) {
    assertNonNegative(
      context.requestedNotional,
      "context.requestedNotional",
    );
    return context.requestedNotional;
  }

  if (leg.liquidity.requestedNotional > 0) {
    return leg.liquidity.requestedNotional;
  }

  if (referencePrice !== undefined) {
    return leg.inputQuantity * referencePrice;
  }

  return leg.inputQuantity;
}

function calculateModelBps(
  options: NormalizedOptions,
  spreadBps: number,
  utilizationBps: number,
  depthBps: number,
  latencyBps: number,
  stalenessBps: number,
): number {
  switch (options.model) {
    case "FIXED_BPS":
      return options.fixedSlippageBps;

    case "SPREAD":
      return spreadBps * options.spreadMultiplier;

    case "LIQUIDITY_UTILIZATION":
      return utilizationBps + depthBps;

    case "HYBRID":
      return (
        options.fixedSlippageBps +
        spreadBps * options.spreadMultiplier +
        utilizationBps +
        depthBps +
        latencyBps +
        stalenessBps
      );
  }
}

export class ArbitrageSlippageEngine {
  private readonly options: NormalizedOptions;

  public constructor(options?: ArbitrageSlippageEngineOptions) {
    this.options = normalizeOptions(options);
  }

  public getOptions(): Readonly<NormalizedOptions> {
    return this.options;
  }

  public estimateLeg(
    input: ArbitrageLegSlippageInput,
  ): ArbitrageSlippageEstimate {
    const { leg, context } = input;

    if (context !== undefined && context.reportingAsset.trim().length === 0) {
      throw new Error("context.reportingAsset cannot be empty.");
    }

    const reportingAsset =
      context?.reportingAsset ?? leg.slippageEstimate.reportingAsset;

    if (reportingAsset.trim().length === 0) {
      throw new Error("reportingAsset cannot be empty.");
    }

    const snapshot = context?.marketSnapshot;
    const liquidity = context?.liquidity ?? leg.liquidity;

    const referencePrice = resolveReferencePrice(
      leg.side,
      snapshot,
      context?.executionPrice,
      leg.expectedPrice,
    );

    const notional = resolveNotional(leg, context, referencePrice);

    const spreadBps = calculateSpreadBps(snapshot);
    const utilizationBps = calculateLiquidityUtilizationBps(
      liquidity,
      this.options.utilizationMultiplier,
    );
    const depthBps = calculateDepthBps(
      liquidity,
      this.options.depthLevelMultiplier,
    );
    const latencyBps = calculateLatencyBps(
      context?.latencyMs ?? leg.latency.expectedTotalLatencyMs,
      this.options.latencyMultiplier,
    );
    const stalenessBps = calculateStalenessBps(
      snapshot,
      this.options.marketDataStaleAfterMs,
      this.options.staleMarketDataMultiplier,
    );

    const volatilityBps = context?.volatilityBps ?? 0;
    const additionalBufferBps = context?.additionalBufferBps ?? 0;

    assertNonNegative(volatilityBps, "context.volatilityBps");
    assertNonNegative(
      additionalBufferBps,
      "context.additionalBufferBps",
    );

    const rawExpectedBps =
      calculateModelBps(
        this.options,
        spreadBps,
        utilizationBps,
        depthBps,
        latencyBps,
        stalenessBps,
      ) +
      volatilityBps +
      additionalBufferBps +
      this.options.volatilityBufferBps;

    const expectedSlippageBps = round(
      clamp(
        rawExpectedBps,
        this.options.minimumSlippageBps,
        this.options.maximumSlippageBps,
      ),
      this.options.decimalPlaces,
    );

    const stressedSlippageBps = round(
      clamp(
        expectedSlippageBps * this.options.stressMultiplier,
        expectedSlippageBps,
        this.options.maximumSlippageBps,
      ),
      this.options.decimalPlaces,
    );

    const expectedSlippageValue = round(
      notional * (expectedSlippageBps / BASIS_POINTS_DIVISOR),
      this.options.decimalPlaces,
    );

    const stressedSlippageValue = round(
      notional * (stressedSlippageBps / BASIS_POINTS_DIVISOR),
      this.options.decimalPlaces,
    );

    return freezeRecord({
      expectedSlippageBps,
      stressedSlippageBps,
      maximumSlippageBps: this.options.maximumSlippageBps,
      expectedSlippageValue,
      stressedSlippageValue,
      reportingAsset,
    });
  }

  public estimateOpportunity(
    input: ArbitrageOpportunitySlippageInput,
  ): ArbitrageOpportunitySlippageResult {
    const { opportunity, contextsByLegId } = input;

    assertInstitutionalArbitrageOpportunity(opportunity);

    const legEstimates: Record<string, ArbitrageSlippageEstimate> = {};
    let expectedValue = 0;
    let stressedValue = 0;
    let weightedExpectedBpsNumerator = 0;
    let weightedStressedBpsNumerator = 0;
    let totalWeight = 0;
    let maximumSlippageBps = 0;

    for (const leg of opportunity.legs) {
      const context = contextsByLegId?.[leg.legId];

      const estimate = this.estimateLeg({
        leg,
        context:
          context === undefined
            ? Object.freeze({
                reportingAsset: opportunity.reportingAsset,
              })
            : Object.freeze({
                ...context,
                reportingAsset: opportunity.reportingAsset,
              }),
      });

      const weight =
        context?.requestedNotional ??
        leg.liquidity.requestedNotional ??
        leg.inputQuantity;

      assertNonNegative(weight, `weight for leg ${leg.legId}`);

      legEstimates[leg.legId] = estimate;
      expectedValue += estimate.expectedSlippageValue;
      stressedValue += estimate.stressedSlippageValue;
      weightedExpectedBpsNumerator +=
        estimate.expectedSlippageBps * weight;
      weightedStressedBpsNumerator +=
        estimate.stressedSlippageBps * weight;
      totalWeight += weight;
      maximumSlippageBps = Math.max(
        maximumSlippageBps,
        estimate.maximumSlippageBps,
      );
    }

    const weightedExpectedSlippageBps =
      totalWeight === 0
        ? 0
        : weightedExpectedBpsNumerator / totalWeight;

    const weightedStressedSlippageBps =
      totalWeight === 0
        ? 0
        : weightedStressedBpsNumerator / totalWeight;

    return freezeRecord({
      expectedSlippageValue: round(
        expectedValue,
        this.options.decimalPlaces,
      ),
      stressedSlippageValue: round(
        stressedValue,
        this.options.decimalPlaces,
      ),
      weightedExpectedSlippageBps: round(
        weightedExpectedSlippageBps,
        this.options.decimalPlaces,
      ),
      weightedStressedSlippageBps: round(
        weightedStressedSlippageBps,
        this.options.decimalPlaces,
      ),
      maximumSlippageBps: round(
        maximumSlippageBps,
        this.options.decimalPlaces,
      ),
      reportingAsset: opportunity.reportingAsset,
      legEstimates: freezeRecord({ ...legEstimates }),
    });
  }

  public assessPolicy(
    result: ArbitrageOpportunitySlippageResult,
    policy: ArbitrageSlippagePolicy,
  ): ArbitrageSlippagePolicyAssessment {
    assertNonNegative(
      policy.maximumExpectedSlippageBps,
      "policy.maximumExpectedSlippageBps",
    );
    assertNonNegative(
      policy.maximumStressedSlippageBps,
      "policy.maximumStressedSlippageBps",
    );

    if (policy.maximumSlippageValue !== undefined) {
      assertNonNegative(
        policy.maximumSlippageValue,
        "policy.maximumSlippageValue",
      );
    }

    const expectedSlippageBpsAccepted =
      result.weightedExpectedSlippageBps <=
      policy.maximumExpectedSlippageBps;

    const stressedSlippageBpsAccepted =
      result.weightedStressedSlippageBps <=
      policy.maximumStressedSlippageBps;

    const slippageValueAccepted =
      policy.maximumSlippageValue === undefined ||
      result.stressedSlippageValue <= policy.maximumSlippageValue;

    const reasons: string[] = [];

    if (!expectedSlippageBpsAccepted) {
      reasons.push(
        `Expected slippage ${result.weightedExpectedSlippageBps} bps exceeds policy maximum ${policy.maximumExpectedSlippageBps} bps.`,
      );
    }

    if (!stressedSlippageBpsAccepted) {
      reasons.push(
        `Stressed slippage ${result.weightedStressedSlippageBps} bps exceeds policy maximum ${policy.maximumStressedSlippageBps} bps.`,
      );
    }

    if (!slippageValueAccepted) {
      reasons.push(
        `Stressed slippage value ${result.stressedSlippageValue} ${result.reportingAsset} exceeds policy maximum ${policy.maximumSlippageValue} ${result.reportingAsset}.`,
      );
    }

    return freezeRecord({
      accepted:
        expectedSlippageBpsAccepted &&
        stressedSlippageBpsAccepted &&
        slippageValueAccepted,
      expectedSlippageBpsAccepted,
      stressedSlippageBpsAccepted,
      slippageValueAccepted,
      reasons: Object.freeze(reasons),
    });
  }

  public recalculateLeg(
    leg: ArbitrageLeg,
    context?: ArbitrageSlippageContext,
  ): ArbitrageLeg {
    const slippageEstimate = this.estimateLeg({ leg, context });

    return freezeRecord({
      ...leg,
      slippageEstimate,
      dependencyLegIds: Object.freeze([...leg.dependencyLegIds]),
      metadata: freezeRecord({ ...leg.metadata }),
    });
  }

  public recalculateOpportunity(
    input: ArbitrageOpportunitySlippageInput,
  ): InstitutionalArbitrageOpportunity {
    const result = this.estimateOpportunity(input);

    const legs = input.opportunity.legs.map((leg) =>
      this.recalculateLeg(
        leg,
        input.contextsByLegId?.[leg.legId] === undefined
          ? Object.freeze({
              reportingAsset: input.opportunity.reportingAsset,
            })
          : Object.freeze({
              ...input.contextsByLegId?.[leg.legId],
              reportingAsset: input.opportunity.reportingAsset,
            }),
      ),
    );

    const profitEstimate = freezeRecord({
      ...input.opportunity.profitEstimate,
      expectedSlippageCost: result.expectedSlippageValue,
      expectedNetProfit: round(
        input.opportunity.profitEstimate.grossProfit -
          input.opportunity.profitEstimate.totalFees -
          result.expectedSlippageValue -
          input.opportunity.profitEstimate.expectedFinancingCost -
          input.opportunity.profitEstimate.expectedGasCost -
          input.opportunity.profitEstimate.expectedBridgeCost,
        this.options.decimalPlaces,
      ),
      stressedNetProfit: round(
        input.opportunity.profitEstimate.grossProfit -
          input.opportunity.profitEstimate.totalFees -
          result.stressedSlippageValue -
          input.opportunity.profitEstimate.expectedFinancingCost -
          input.opportunity.profitEstimate.expectedGasCost -
          input.opportunity.profitEstimate.expectedBridgeCost,
        this.options.decimalPlaces,
      ),
    });

    return freezeRecord({
      ...input.opportunity,
      legs: Object.freeze(legs),
      transfers: Object.freeze([...input.opportunity.transfers]),
      accountIds: Object.freeze([...input.opportunity.accountIds]),
      profitEstimate,
      metadata: freezeRecord({ ...input.opportunity.metadata }),
    }) as InstitutionalArbitrageOpportunity;
  }
}

export function createArbitrageSlippageEngine(
  options?: ArbitrageSlippageEngineOptions,
): ArbitrageSlippageEngine {
  return new ArbitrageSlippageEngine(options);
}

export function estimateArbitrageLegSlippage(
  input: ArbitrageLegSlippageInput,
  options?: ArbitrageSlippageEngineOptions,
): ArbitrageSlippageEstimate {
  return createArbitrageSlippageEngine(options).estimateLeg(input);
}

export function estimateArbitrageOpportunitySlippage(
  input: ArbitrageOpportunitySlippageInput,
  options?: ArbitrageSlippageEngineOptions,
): ArbitrageOpportunitySlippageResult {
  return createArbitrageSlippageEngine(options).estimateOpportunity(input);
}