/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-fee-engine.ts
 *
 * Purpose:
 * Production-grade, deterministic, and immutable fee estimation for
 * institutional arbitrage opportunities and execution legs.
 */

import {
  type ArbitrageAsset,
  type ArbitrageDecimal,
  type ArbitrageEvaluationPolicy,
  type ArbitrageFeeBreakdown,
  type ArbitrageId,
  type ArbitrageLeg,
  type ArbitrageMetadata,
  type ArbitragePercentage,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";
import { assertInstitutionalArbitrageOpportunity } from "./institutional-arbitrage-validator";

const BASIS_POINTS_DIVISOR = 10_000;
const PERCENTAGE_DIVISOR = 100;
const DEFAULT_DECIMAL_PLACES = 12;
const MAX_DECIMAL_PLACES = 18;

export const ARBITRAGE_FEE_COMPONENTS = [
  "tradingFee",
  "fundingFee",
  "borrowingFee",
  "withdrawalFee",
  "depositFee",
  "networkFee",
  "bridgeFee",
  "gasFee",
  "protocolFee",
  "otherFee",
] as const;

export type ArbitrageFeeComponent = (typeof ARBITRAGE_FEE_COMPONENTS)[number];

export type ArbitrageFeeRateUnit =
  | "BASIS_POINTS"
  | "PERCENTAGE"
  | "DECIMAL_RATE";

export type ArbitrageFeeChargeMode =
  | "NOTIONAL"
  | "QUANTITY"
  | "FIXED"
  | "PROVIDED";

export interface ArbitrageFeeRate {
  readonly value: ArbitrageDecimal;
  readonly unit: ArbitrageFeeRateUnit;
}

export interface ArbitrageFeeConversionRate {
  readonly fromAsset: ArbitrageAsset;
  readonly toAsset: ArbitrageAsset;
  readonly rate: ArbitrageDecimal;
  readonly observedAt: ArbitrageTimestamp;
  readonly sourceId?: string;
  readonly metadata?: ArbitrageMetadata;
}

export interface ArbitrageFeeComponentInput {
  readonly component: ArbitrageFeeComponent;
  readonly chargeMode: ArbitrageFeeChargeMode;
  readonly feeAsset: ArbitrageAsset;
  readonly notional?: ArbitrageDecimal;
  readonly quantity?: ArbitrageDecimal;
  readonly fixedAmount?: ArbitrageDecimal;
  readonly providedAmount?: ArbitrageDecimal;
  readonly rate?: ArbitrageFeeRate;
  readonly minimumFee?: ArbitrageDecimal;
  readonly maximumFee?: ArbitrageDecimal;
  readonly multiplier?: ArbitrageDecimal;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly metadata?: ArbitrageMetadata;
}

export interface ArbitrageLegFeeEstimationRequest {
  readonly leg: ArbitrageLeg;
  readonly reportingAsset: ArbitrageAsset;
  readonly componentInputs?: readonly ArbitrageFeeComponentInput[];
  readonly conversionRates?: readonly ArbitrageFeeConversionRate[];
  readonly includeExistingEstimate?: boolean;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly decimalPlaces?: number;
  readonly estimatedAt: ArbitrageTimestamp;
  readonly metadata?: ArbitrageMetadata;
}

export interface ArbitrageOpportunityFeeEstimationRequest {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly legInputs?: Readonly<
    Record<ArbitrageId, readonly ArbitrageFeeComponentInput[]>
  >;
  readonly conversionRates?: readonly ArbitrageFeeConversionRate[];
  readonly includeExistingEstimates?: boolean;
  readonly stressMultiplier?: ArbitrageDecimal;
  readonly decimalPlaces?: number;
  readonly estimatedAt: ArbitrageTimestamp;
  readonly metadata?: ArbitrageMetadata;
}

export interface ArbitrageFeePolicyAssessment {
  readonly totalFee: ArbitrageDecimal;
  readonly capitalBase: ArbitrageDecimal;
  readonly feePercentage: ArbitragePercentage;
  readonly maximumFeePercentage: ArbitragePercentage;
  readonly withinLimit: boolean;
}

export interface ArbitrageLegFeeEstimate {
  readonly legId: ArbitrageId;
  readonly feeBreakdown: ArbitrageFeeBreakdown;
  readonly feePercentageOfInput: ArbitragePercentage;
  readonly estimatedAt: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageOpportunityFeeEstimate {
  readonly opportunityId: ArbitrageId;
  readonly reportingAsset: ArbitrageAsset;
  readonly legEstimates: readonly ArbitrageLegFeeEstimate[];
  readonly feeBreakdown: ArbitrageFeeBreakdown;
  readonly feePercentageOfRequestedCapital: ArbitragePercentage;
  readonly policyAssessment?: ArbitrageFeePolicyAssessment;
  readonly estimatedAt: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageFeeEngineOptions {
  readonly decimalPlaces?: number;
  readonly defaultStressMultiplier?: ArbitrageDecimal;
  readonly rejectStaleConversionRatesAfterMs?: number;
}

export class ArbitrageFeeEngineError extends Error {
  public readonly code:
    | "INVALID_ARGUMENT"
    | "MISSING_CONVERSION_RATE"
    | "STALE_CONVERSION_RATE"
    | "DUPLICATE_CONVERSION_RATE"
    | "INVALID_FEE_COMPONENT";

  public constructor(
    code: ArbitrageFeeEngineError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ArbitrageFeeEngineError";
    this.code = code;
  }
}

interface NormalizedFeeEngineOptions {
  readonly decimalPlaces: number;
  readonly defaultStressMultiplier: ArbitrageDecimal;
  readonly rejectStaleConversionRatesAfterMs?: number;
}

type MutableFeeBreakdown = {
  -readonly [Key in keyof ArbitrageFeeBreakdown]: ArbitrageFeeBreakdown[Key];
};

function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      `${path} must be a finite non-negative number.`,
    );
  }
}

function assertFinitePositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      `${path} must be a finite positive number.`,
    );
  }
}

function assertNonEmptyString(value: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      `${path} must be a non-empty string.`,
    );
  }
}

function normalizeDecimalPlaces(value: number | undefined): number {
  const normalized = value ?? DEFAULT_DECIMAL_PLACES;

  if (
    !Number.isInteger(normalized) ||
    normalized < 0 ||
    normalized > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }

  return normalized;
}

function roundDeterministically(
  value: number,
  decimalPlaces: number,
): number {
  if (!Number.isFinite(value)) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      "Cannot round a non-finite value.",
    );
  }

  if (value === 0) {
    return 0;
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return value;
}

function normalizeMetadata(
  metadata: ArbitrageMetadata | undefined,
): ArbitrageMetadata {
  return deepFreeze({ ...(metadata ?? {}) });
}

function createEmptyFeeBreakdown(
  reportingAsset: ArbitrageAsset,
): MutableFeeBreakdown {
  return {
    tradingFee: 0,
    fundingFee: 0,
    borrowingFee: 0,
    withdrawalFee: 0,
    depositFee: 0,
    networkFee: 0,
    bridgeFee: 0,
    gasFee: 0,
    protocolFee: 0,
    otherFee: 0,
    totalFee: 0,
    reportingAsset,
  };
}

function sumFeeComponents(
  breakdown: Pick<ArbitrageFeeBreakdown, ArbitrageFeeComponent>,
): number {
  return ARBITRAGE_FEE_COMPONENTS.reduce(
    (total, component) => total + breakdown[component],
    0,
  );
}

function normalizeBreakdown(
  breakdown: MutableFeeBreakdown,
  decimalPlaces: number,
): ArbitrageFeeBreakdown {
  for (const component of ARBITRAGE_FEE_COMPONENTS) {
    breakdown[component] = roundDeterministically(
      breakdown[component],
      decimalPlaces,
    );
  }

  breakdown.totalFee = roundDeterministically(
    sumFeeComponents(breakdown),
    decimalPlaces,
  );

  return deepFreeze({ ...breakdown });
}

function rateToDecimal(rate: ArbitrageFeeRate): number {
  assertFiniteNonNegative(rate.value, "rate.value");

  switch (rate.unit) {
    case "BASIS_POINTS":
      return rate.value / BASIS_POINTS_DIVISOR;
    case "PERCENTAGE":
      return rate.value / PERCENTAGE_DIVISOR;
    case "DECIMAL_RATE":
      return rate.value;
    default: {
      const exhaustiveCheck: never = rate.unit;
      throw new ArbitrageFeeEngineError(
        "INVALID_ARGUMENT",
        `Unsupported fee rate unit: ${String(exhaustiveCheck)}.`,
      );
    }
  }
}

function calculateRawComponentAmount(
  input: ArbitrageFeeComponentInput,
): number {
  const multiplier = input.multiplier ?? 1;
  assertFiniteNonNegative(multiplier, "componentInput.multiplier");

  let amount: number;

  switch (input.chargeMode) {
    case "NOTIONAL": {
      if (input.notional === undefined || input.rate === undefined) {
        throw new ArbitrageFeeEngineError(
          "INVALID_FEE_COMPONENT",
          `${input.component} with NOTIONAL charge mode requires notional and rate.`,
        );
      }

      assertFiniteNonNegative(input.notional, "componentInput.notional");
      amount = input.notional * rateToDecimal(input.rate);
      break;
    }

    case "QUANTITY": {
      if (input.quantity === undefined || input.rate === undefined) {
        throw new ArbitrageFeeEngineError(
          "INVALID_FEE_COMPONENT",
          `${input.component} with QUANTITY charge mode requires quantity and rate.`,
        );
      }

      assertFiniteNonNegative(input.quantity, "componentInput.quantity");
      amount = input.quantity * rateToDecimal(input.rate);
      break;
    }

    case "FIXED": {
      if (input.fixedAmount === undefined) {
        throw new ArbitrageFeeEngineError(
          "INVALID_FEE_COMPONENT",
          `${input.component} with FIXED charge mode requires fixedAmount.`,
        );
      }

      assertFiniteNonNegative(
        input.fixedAmount,
        "componentInput.fixedAmount",
      );
      amount = input.fixedAmount;
      break;
    }

    case "PROVIDED": {
      if (input.providedAmount === undefined) {
        throw new ArbitrageFeeEngineError(
          "INVALID_FEE_COMPONENT",
          `${input.component} with PROVIDED charge mode requires providedAmount.`,
        );
      }

      assertFiniteNonNegative(
        input.providedAmount,
        "componentInput.providedAmount",
      );
      amount = input.providedAmount;
      break;
    }

    default: {
      const exhaustiveCheck: never = input.chargeMode;
      throw new ArbitrageFeeEngineError(
        "INVALID_FEE_COMPONENT",
        `Unsupported fee charge mode: ${String(exhaustiveCheck)}.`,
      );
    }
  }

  amount *= multiplier;

  if (input.minimumFee !== undefined) {
    assertFiniteNonNegative(input.minimumFee, "componentInput.minimumFee");
    amount = Math.max(amount, input.minimumFee);
  }

  if (input.maximumFee !== undefined) {
    assertFiniteNonNegative(input.maximumFee, "componentInput.maximumFee");

    if (
      input.minimumFee !== undefined &&
      input.minimumFee > input.maximumFee
    ) {
      throw new ArbitrageFeeEngineError(
        "INVALID_FEE_COMPONENT",
        "minimumFee cannot exceed maximumFee.",
      );
    }

    amount = Math.min(amount, input.maximumFee);
  }

  return amount;
}

function buildConversionRateIndex(
  rates: readonly ArbitrageFeeConversionRate[],
  reportingAsset: ArbitrageAsset,
  estimatedAt: ArbitrageTimestamp,
  staleAfterMs: number | undefined,
): ReadonlyMap<string, ArbitrageFeeConversionRate> {
  const index = new Map<string, ArbitrageFeeConversionRate>();

  for (const rate of rates) {
    assertNonEmptyString(rate.fromAsset, "conversionRate.fromAsset");
    assertNonEmptyString(rate.toAsset, "conversionRate.toAsset");
    assertFinitePositive(rate.rate, "conversionRate.rate");
    assertFiniteNonNegative(rate.observedAt, "conversionRate.observedAt");

    if (rate.toAsset !== reportingAsset) {
      continue;
    }

    if (
      staleAfterMs !== undefined &&
      estimatedAt - rate.observedAt > staleAfterMs
    ) {
      throw new ArbitrageFeeEngineError(
        "STALE_CONVERSION_RATE",
        `Conversion rate ${rate.fromAsset}/${rate.toAsset} is stale.`,
      );
    }

    if (index.has(rate.fromAsset)) {
      throw new ArbitrageFeeEngineError(
        "DUPLICATE_CONVERSION_RATE",
        `Duplicate conversion rate for ${rate.fromAsset}/${reportingAsset}.`,
      );
    }

    index.set(rate.fromAsset, rate);
  }

  return index;
}

function convertAmount(
  amount: number,
  fromAsset: ArbitrageAsset,
  reportingAsset: ArbitrageAsset,
  conversionRateIndex: ReadonlyMap<string, ArbitrageFeeConversionRate>,
): number {
  if (fromAsset === reportingAsset || amount === 0) {
    return amount;
  }

  const conversion = conversionRateIndex.get(fromAsset);

  if (conversion === undefined) {
    throw new ArbitrageFeeEngineError(
      "MISSING_CONVERSION_RATE",
      `No conversion rate exists from ${fromAsset} to ${reportingAsset}.`,
    );
  }

  return amount * conversion.rate;
}

function mergeFeeBreakdown(
  target: MutableFeeBreakdown,
  source: ArbitrageFeeBreakdown,
): void {
  if (target.reportingAsset !== source.reportingAsset) {
    throw new ArbitrageFeeEngineError(
      "INVALID_ARGUMENT",
      "Fee breakdown reporting assets must match before aggregation.",
    );
  }

  for (const component of ARBITRAGE_FEE_COMPONENTS) {
    target[component] += source[component];
  }
}

function calculatePercentage(
  numerator: number,
  denominator: number,
  decimalPlaces: number,
): number {
  if (denominator <= 0) {
    return numerator === 0 ? 0 : Number.POSITIVE_INFINITY;
  }

  return roundDeterministically(
    (numerator / denominator) * PERCENTAGE_DIVISOR,
    decimalPlaces,
  );
}

export class ArbitrageFeeEngine {
  private readonly options: NormalizedFeeEngineOptions;

  public constructor(options: ArbitrageFeeEngineOptions = {}) {
    const decimalPlaces = normalizeDecimalPlaces(options.decimalPlaces);
    const defaultStressMultiplier =
      options.defaultStressMultiplier ?? 1;

    assertFinitePositive(
      defaultStressMultiplier,
      "options.defaultStressMultiplier",
    );

    if (options.rejectStaleConversionRatesAfterMs !== undefined) {
      assertFiniteNonNegative(
        options.rejectStaleConversionRatesAfterMs,
        "options.rejectStaleConversionRatesAfterMs",
      );
    }

    this.options = deepFreeze({
      decimalPlaces,
      defaultStressMultiplier,
      rejectStaleConversionRatesAfterMs:
        options.rejectStaleConversionRatesAfterMs,
    });
  }

  public estimateLegFees(
    request: ArbitrageLegFeeEstimationRequest,
  ): ArbitrageLegFeeEstimate {
    assertNonEmptyString(request.leg.legId, "request.leg.legId");
    assertNonEmptyString(
      request.reportingAsset,
      "request.reportingAsset",
    );
    assertFiniteNonNegative(request.estimatedAt, "request.estimatedAt");

    const decimalPlaces = normalizeDecimalPlaces(
      request.decimalPlaces ?? this.options.decimalPlaces,
    );
    const requestStressMultiplier =
      request.stressMultiplier ?? this.options.defaultStressMultiplier;

    assertFinitePositive(
      requestStressMultiplier,
      "request.stressMultiplier",
    );

    const conversionRateIndex = buildConversionRateIndex(
      request.conversionRates ?? [],
      request.reportingAsset,
      request.estimatedAt,
      this.options.rejectStaleConversionRatesAfterMs,
    );
    const breakdown = createEmptyFeeBreakdown(request.reportingAsset);

    if (request.includeExistingEstimate ?? true) {
      if (
        request.leg.feeEstimate.reportingAsset !== request.reportingAsset
      ) {
        throw new ArbitrageFeeEngineError(
          "INVALID_ARGUMENT",
          `Leg ${request.leg.legId} fee estimate reporting asset does not match ${request.reportingAsset}.`,
        );
      }

      mergeFeeBreakdown(breakdown, request.leg.feeEstimate);
    }

    for (const input of request.componentInputs ?? []) {
      assertNonEmptyString(input.feeAsset, "componentInput.feeAsset");

      const componentStressMultiplier =
        input.stressMultiplier ?? requestStressMultiplier;
      assertFinitePositive(
        componentStressMultiplier,
        "componentInput.stressMultiplier",
      );

      const rawAmount =
        calculateRawComponentAmount(input) * componentStressMultiplier;
      const convertedAmount = convertAmount(
        rawAmount,
        input.feeAsset,
        request.reportingAsset,
        conversionRateIndex,
      );

      breakdown[input.component] += convertedAmount;
    }

    const feeBreakdown = normalizeBreakdown(breakdown, decimalPlaces);
    const inputValue =
      request.leg.expectedPrice === undefined
        ? request.leg.inputQuantity
        : request.leg.inputQuantity * request.leg.expectedPrice;

    const result: ArbitrageLegFeeEstimate = {
      legId: request.leg.legId,
      feeBreakdown,
      feePercentageOfInput: calculatePercentage(
        feeBreakdown.totalFee,
        inputValue,
        decimalPlaces,
      ),
      estimatedAt: request.estimatedAt,
      metadata: normalizeMetadata(request.metadata),
    };

    return deepFreeze(result);
  }

  public estimateOpportunityFees(
    request: ArbitrageOpportunityFeeEstimationRequest,
    policy?: ArbitrageEvaluationPolicy,
  ): ArbitrageOpportunityFeeEstimate {
    assertInstitutionalArbitrageOpportunity(
      request.opportunity,
      request.estimatedAt,
    );
    assertFiniteNonNegative(request.estimatedAt, "request.estimatedAt");

    const decimalPlaces = normalizeDecimalPlaces(
      request.decimalPlaces ?? this.options.decimalPlaces,
    );
    const legEstimates = request.opportunity.legs.map((leg) =>
      this.estimateLegFees({
        leg,
        reportingAsset: request.opportunity.reportingAsset,
        componentInputs: request.legInputs?.[leg.legId],
        conversionRates: request.conversionRates,
        includeExistingEstimate:
          request.includeExistingEstimates ?? true,
        stressMultiplier: request.stressMultiplier,
        decimalPlaces,
        estimatedAt: request.estimatedAt,
        metadata: request.metadata,
      }),
    );

    const aggregate = createEmptyFeeBreakdown(
      request.opportunity.reportingAsset,
    );

    for (const estimate of legEstimates) {
      mergeFeeBreakdown(aggregate, estimate.feeBreakdown);
    }

    const feeBreakdown = normalizeBreakdown(aggregate, decimalPlaces);
    const feePercentageOfRequestedCapital = calculatePercentage(
      feeBreakdown.totalFee,
      request.opportunity.requestedCapital,
      decimalPlaces,
    );
    const policyAssessment =
      policy === undefined
        ? undefined
        : this.assessPolicy(
            feeBreakdown,
            request.opportunity.requestedCapital,
            policy,
            decimalPlaces,
          );

    const result: ArbitrageOpportunityFeeEstimate = {
      opportunityId: request.opportunity.opportunityId,
      reportingAsset: request.opportunity.reportingAsset,
      legEstimates: Object.freeze([...legEstimates]),
      feeBreakdown,
      feePercentageOfRequestedCapital,
      policyAssessment,
      estimatedAt: request.estimatedAt,
      metadata: normalizeMetadata(request.metadata),
    };

    return deepFreeze(result);
  }

  public aggregate(
    breakdowns: readonly ArbitrageFeeBreakdown[],
    reportingAsset: ArbitrageAsset,
    decimalPlaces = this.options.decimalPlaces,
  ): ArbitrageFeeBreakdown {
    assertNonEmptyString(reportingAsset, "reportingAsset");

    const normalizedDecimalPlaces =
      normalizeDecimalPlaces(decimalPlaces);
    const aggregate = createEmptyFeeBreakdown(reportingAsset);

    for (const breakdown of breakdowns) {
      for (const component of ARBITRAGE_FEE_COMPONENTS) {
        assertFiniteNonNegative(
          breakdown[component],
          `breakdown.${component}`,
        );
      }

      mergeFeeBreakdown(aggregate, breakdown);
    }

    return normalizeBreakdown(aggregate, normalizedDecimalPlaces);
  }

  public assessPolicy(
    feeBreakdown: ArbitrageFeeBreakdown,
    capitalBase: ArbitrageDecimal,
    policy: ArbitrageEvaluationPolicy,
    decimalPlaces = this.options.decimalPlaces,
  ): ArbitrageFeePolicyAssessment {
    assertFiniteNonNegative(
      feeBreakdown.totalFee,
      "feeBreakdown.totalFee",
    );
    assertFinitePositive(capitalBase, "capitalBase");
    assertFiniteNonNegative(
      policy.maximumFeePercentage,
      "policy.maximumFeePercentage",
    );

    const feePercentage = calculatePercentage(
      feeBreakdown.totalFee,
      capitalBase,
      normalizeDecimalPlaces(decimalPlaces),
    );

    return deepFreeze({
      totalFee: feeBreakdown.totalFee,
      capitalBase,
      feePercentage,
      maximumFeePercentage: policy.maximumFeePercentage,
      withinLimit: feePercentage <= policy.maximumFeePercentage,
    });
  }

  public withRecalculatedTotal(
    feeBreakdown: Omit<ArbitrageFeeBreakdown, "totalFee"> & {
      readonly totalFee?: ArbitrageDecimal;
    },
    decimalPlaces = this.options.decimalPlaces,
  ): ArbitrageFeeBreakdown {
    assertNonEmptyString(
      feeBreakdown.reportingAsset,
      "feeBreakdown.reportingAsset",
    );

    const mutable = createEmptyFeeBreakdown(
      feeBreakdown.reportingAsset,
    );

    for (const component of ARBITRAGE_FEE_COMPONENTS) {
      assertFiniteNonNegative(
        feeBreakdown[component],
        `feeBreakdown.${component}`,
      );
      mutable[component] = feeBreakdown[component];
    }

    return normalizeBreakdown(
      mutable,
      normalizeDecimalPlaces(decimalPlaces),
    );
  }
}