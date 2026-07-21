/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/institutional-arbitrage-validator.ts
 *
 * Purpose:
 * Deterministic validation for institutional arbitrage configuration,
 * opportunities, evaluation inputs, decisions, execution plans, signals,
 * and settlement verification records.
 */

import {
  ARBITRAGE_APPROVAL_STATUSES,
  ARBITRAGE_AUTOMATION_MODES,
  ARBITRAGE_DECISION_ACTIONS,
  ARBITRAGE_EXECUTION_STATUSES,
  ARBITRAGE_LEG_STATUSES,
  ARBITRAGE_MARKET_TYPES,
  ARBITRAGE_OPPORTUNITY_STATUSES,
  ARBITRAGE_ORDER_TYPES,
  ARBITRAGE_REJECTION_CODES,
  ARBITRAGE_RISK_FACTORS,
  ARBITRAGE_RISK_LEVELS,
  ARBITRAGE_SETTLEMENT_STATUSES,
  ARBITRAGE_SIDES,
  ARBITRAGE_TIME_IN_FORCE_VALUES,
  ARBITRAGE_TYPE_AUTOMATION_MODE,
  ARBITRAGE_TYPES,
  ARBITRAGE_VENUE_TYPES,
  type ArbitrageCapitalAllocation,
  type ArbitrageDecision,
  type ArbitrageEvaluationPolicy,
  type ArbitrageExecutionPlan,
  type ArbitrageExecutionResult,
  type ArbitrageFeeBreakdown,
  type ArbitrageLatencyEstimate,
  type ArbitrageLeg,
  type ArbitrageLiquidityAssessment,
  type ArbitrageManualApproval,
  type ArbitrageMarketSnapshot,
  type ArbitrageMetadata,
  type ArbitrageOpportunityScoreBreakdown,
  type ArbitrageProfitEstimate,
  type ArbitrageRiskAssessment,
  type ArbitrageRiskFinding,
  type ArbitrageSettlementVerification,
  type ArbitrageSignal,
  type ArbitrageSlippageEstimate,
  type ArbitrageTransferRequirement,
  type ArbitrageType,
  type ArbitrageVenueHealth,
  type InstitutionalArbitrageConfiguration,
  type InstitutionalArbitrageOpportunity,
  type InstitutionalArbitrageOrchestratorRequest,
} from "./institutional-arbitrage-contracts";

export const ARBITRAGE_VALIDATION_CODES = [
  "REQUIRED",
  "INVALID_TYPE",
  "INVALID_VALUE",
  "INVALID_ENUM",
  "INVALID_TIMESTAMP",
  "INVALID_RANGE",
  "INVALID_ORDER",
  "DUPLICATE",
  "INCONSISTENT",
  "UNSUPPORTED",
  "EXPIRED",
  "MISSING_DEPENDENCY",
  "CIRCULAR_DEPENDENCY",
  "AUTOMATION_MODE_MISMATCH",
  "APPROVAL_POLICY_VIOLATION",
  "CAPITAL_POLICY_VIOLATION",
  "RISK_POLICY_VIOLATION",
] as const;

export type ArbitrageValidationCode =
  (typeof ARBITRAGE_VALIDATION_CODES)[number];

export interface ArbitrageValidationIssue {
  readonly path: string;
  readonly code: ArbitrageValidationCode;
  readonly message: string;
}

export interface ArbitrageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ArbitrageValidationIssue[];
}

export class InstitutionalArbitrageValidationError extends Error {
  public readonly issues: readonly ArbitrageValidationIssue[];

  public constructor(
    message: string,
    issues: readonly ArbitrageValidationIssue[],
  ) {
    super(message);
    this.name = "InstitutionalArbitrageValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

interface ValidationContext {
  readonly issues: ArbitrageValidationIssue[];
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;
const PERCENTAGE_MIN = 0;
const PERCENTAGE_MAX = 100;
const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

function issue(
  context: ValidationContext,
  path: string,
  code: ArbitrageValidationCode,
  message: string,
): void {
  context.issues.push(Object.freeze({ path, code, message }));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    issue(context, path, "INVALID_TYPE", `${path} must be an object.`);
    return false;
  }

  return true;
}

function requireString(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(
      context,
      path,
      "REQUIRED",
      `${path} must be a non-empty string.`,
    );
    return false;
  }

  return true;
}

function optionalString(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is string | undefined {
  if (value === undefined) {
    return true;
  }

  return requireString(context, value, path);
}

function requireBoolean(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is boolean {
  if (typeof value !== "boolean") {
    issue(context, path, "INVALID_TYPE", `${path} must be a boolean.`);
    return false;
  }

  return true;
}

function requireFiniteNumber(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(
      context,
      path,
      "INVALID_TYPE",
      `${path} must be a finite number.`,
    );
    return false;
  }

  return true;
}

function requireNonNegative(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is number {
  if (!requireFiniteNumber(context, value, path)) {
    return false;
  }

  if (value < 0) {
    issue(
      context,
      path,
      "INVALID_RANGE",
      `${path} must be greater than or equal to zero.`,
    );
    return false;
  }

  return true;
}

function requirePositive(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is number {
  if (!requireFiniteNumber(context, value, path)) {
    return false;
  }

  if (value <= 0) {
    issue(
      context,
      path,
      "INVALID_RANGE",
      `${path} must be greater than zero.`,
    );
    return false;
  }

  return true;
}

function requireInteger(
  context: ValidationContext,
  value: unknown,
  path: string,
  minimum = 0,
): value is number {
  if (!requireFiniteNumber(context, value, path)) {
    return false;
  }

  if (!Number.isInteger(value) || value < minimum) {
    issue(
      context,
      path,
      "INVALID_RANGE",
      `${path} must be an integer greater than or equal to ${minimum}.`,
    );
    return false;
  }

  return true;
}

function requireRange(
  context: ValidationContext,
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): value is number {
  if (!requireFiniteNumber(context, value, path)) {
    return false;
  }

  if (value < minimum || value > maximum) {
    issue(
      context,
      path,
      "INVALID_RANGE",
      `${path} must be between ${minimum} and ${maximum}.`,
    );
    return false;
  }

  return true;
}

function requireTimestamp(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is number {
  if (!requireInteger(context, value, path, 0)) {
    return false;
  }

  return true;
}

function requireEnum<T extends string>(
  context: ValidationContext,
  value: unknown,
  path: string,
  allowed: readonly T[],
): value is T {
  if (
    typeof value !== "string" ||
    !allowed.includes(value as T)
  ) {
    issue(
      context,
      path,
      "INVALID_ENUM",
      `${path} must be one of: ${allowed.join(", ")}.`,
    );
    return false;
  }

  return true;
}

function requireArray(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    issue(context, path, "INVALID_TYPE", `${path} must be an array.`);
    return false;
  }

  return true;
}

function validateStringArray(
  context: ValidationContext,
  value: unknown,
  path: string,
  requireUnique = true,
): value is readonly string[] {
  if (!requireArray(context, value, path)) {
    return false;
  }

  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!requireString(context, entry, entryPath)) {
      return;
    }

    if (requireUnique && seen.has(entry)) {
      issue(
        context,
        entryPath,
        "DUPLICATE",
        `${entryPath} duplicates an earlier value.`,
      );
    }

    seen.add(entry);
  });

  return true;
}

function validateMetadata(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is ArbitrageMetadata {
  const visit = (
    entry: unknown,
    entryPath: string,
    depth: number,
  ): boolean => {
    if (depth > 20) {
      issue(
        context,
        entryPath,
        "INVALID_VALUE",
        `${entryPath} exceeds the maximum metadata depth.`,
      );
      return false;
    }

    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean"
    ) {
      return true;
    }

    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        issue(
          context,
          entryPath,
          "INVALID_VALUE",
          `${entryPath} contains a non-finite number.`,
        );
        return false;
      }

      return true;
    }

    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        visit(item, `${entryPath}[${index}]`, depth + 1);
      });
      return true;
    }

    if (isRecord(entry)) {
      Object.entries(entry).forEach(([key, child]) => {
        if (key.trim().length === 0) {
          issue(
            context,
            entryPath,
            "INVALID_VALUE",
            `${entryPath} contains an empty metadata key.`,
          );
        }

        visit(child, `${entryPath}.${key}`, depth + 1);
      });
      return true;
    }

    issue(
      context,
      entryPath,
      "INVALID_TYPE",
      `${entryPath} contains a non-serializable value.`,
    );
    return false;
  };

  if (!requireRecord(context, value, path)) {
    return false;
  }

  visit(value, path, 0);
  return true;
}

function validateVenueReference(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.venueId, `${path}.venueId`);
  requireEnum(
    context,
    value.venueType,
    `${path}.venueType`,
    ARBITRAGE_VENUE_TYPES,
  );
  requireString(context, value.displayName, `${path}.displayName`);
  optionalString(context, value.accountId, `${path}.accountId`);
  optionalString(context, value.walletId, `${path}.walletId`);
  optionalString(context, value.chainId, `${path}.chainId`);
  requireBoolean(context, value.enabled, `${path}.enabled`);
  validateMetadata(context, value.metadata, `${path}.metadata`);
}

function validateInstrumentReference(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.instrumentId, `${path}.instrumentId`);
  requireString(context, value.symbol, `${path}.symbol`);
  requireString(context, value.baseAsset, `${path}.baseAsset`);
  requireString(context, value.quoteAsset, `${path}.quoteAsset`);
  optionalString(
    context,
    value.settlementAsset,
    `${path}.settlementAsset`,
  );
  requireEnum(
    context,
    value.marketType,
    `${path}.marketType`,
    ARBITRAGE_MARKET_TYPES,
  );

  if (value.contractSize !== undefined) {
    requirePositive(context, value.contractSize, `${path}.contractSize`);
  }

  if (value.expiryTimestamp !== undefined) {
    requireTimestamp(
      context,
      value.expiryTimestamp,
      `${path}.expiryTimestamp`,
    );
  }

  requireBoolean(context, value.inverse, `${path}.inverse`);
  validateMetadata(context, value.metadata, `${path}.metadata`);
}

function validateFeeBreakdown(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  const feeFields = [
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
    "totalFee",
  ] as const;

  feeFields.forEach((field) => {
    requireNonNegative(context, value[field], `${path}.${field}`);
  });

  requireString(
    context,
    value.reportingAsset,
    `${path}.reportingAsset`,
  );

  const componentTotal = feeFields
    .filter((field) => field !== "totalFee")
    .reduce((sum, field) => {
      const amount = value[field];
      return typeof amount === "number" && Number.isFinite(amount)
        ? sum + amount
        : sum;
    }, 0);

  if (
    typeof value.totalFee === "number" &&
    Number.isFinite(value.totalFee) &&
    Math.abs(componentTotal - value.totalFee) > 1e-8
  ) {
    issue(
      context,
      `${path}.totalFee`,
      "INCONSISTENT",
      `${path}.totalFee must equal the sum of all fee components.`,
    );
  }
}

function validateSlippageEstimate(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireNonNegative(
    context,
    value.expectedSlippageBps,
    `${path}.expectedSlippageBps`,
  );
  requireNonNegative(
    context,
    value.stressedSlippageBps,
    `${path}.stressedSlippageBps`,
  );
  requireNonNegative(
    context,
    value.maximumSlippageBps,
    `${path}.maximumSlippageBps`,
  );
  requireNonNegative(
    context,
    value.expectedSlippageValue,
    `${path}.expectedSlippageValue`,
  );
  requireNonNegative(
    context,
    value.stressedSlippageValue,
    `${path}.stressedSlippageValue`,
  );
  requireString(
    context,
    value.reportingAsset,
    `${path}.reportingAsset`,
  );

  const expected = value.expectedSlippageBps;
  const stressed = value.stressedSlippageBps;
  const maximum = value.maximumSlippageBps;

  if (
    typeof expected === "number" &&
    typeof stressed === "number" &&
    expected > stressed
  ) {
    issue(
      context,
      `${path}.stressedSlippageBps`,
      "INVALID_ORDER",
      "Stressed slippage must not be below expected slippage.",
    );
  }

  if (
    typeof stressed === "number" &&
    typeof maximum === "number" &&
    stressed > maximum
  ) {
    issue(
      context,
      `${path}.maximumSlippageBps`,
      "INVALID_ORDER",
      "Maximum slippage must not be below stressed slippage.",
    );
  }
}

function validateLiquidityAssessment(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requirePositive(
    context,
    value.requestedQuantity,
    `${path}.requestedQuantity`,
  );
  requireNonNegative(
    context,
    value.executableQuantity,
    `${path}.executableQuantity`,
  );
  requirePositive(
    context,
    value.requestedNotional,
    `${path}.requestedNotional`,
  );
  requireNonNegative(
    context,
    value.executableNotional,
    `${path}.executableNotional`,
  );
  requireRange(
    context,
    value.liquidityUtilizationPercentage,
    `${path}.liquidityUtilizationPercentage`,
    PERCENTAGE_MIN,
    PERCENTAGE_MAX,
  );
  requireInteger(
    context,
    value.depthLevelsConsumed,
    `${path}.depthLevelsConsumed`,
    0,
  );
  requireBoolean(context, value.sufficient, `${path}.sufficient`);

  if (
    typeof value.executableQuantity === "number" &&
    typeof value.requestedQuantity === "number" &&
    value.executableQuantity > value.requestedQuantity
  ) {
    issue(
      context,
      `${path}.executableQuantity`,
      "INVALID_RANGE",
      "Executable quantity cannot exceed requested quantity.",
    );
  }

  if (
    typeof value.executableNotional === "number" &&
    typeof value.requestedNotional === "number" &&
    value.executableNotional > value.requestedNotional
  ) {
    issue(
      context,
      `${path}.executableNotional`,
      "INVALID_RANGE",
      "Executable notional cannot exceed requested notional.",
    );
  }
}

function validateLatencyEstimate(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  const fields = [
    "marketDataAgeMs",
    "expectedSubmissionLatencyMs",
    "expectedExecutionLatencyMs",
    "expectedTransferLatencyMs",
    "expectedSettlementLatencyMs",
    "expectedTotalLatencyMs",
    "maximumPermittedLatencyMs",
  ] as const;

  fields.forEach((field) => {
    requireNonNegative(context, value[field], `${path}.${field}`);
  });

  const expectedComponents =
    numberOrZero(value.expectedSubmissionLatencyMs) +
    numberOrZero(value.expectedExecutionLatencyMs) +
    numberOrZero(value.expectedTransferLatencyMs) +
    numberOrZero(value.expectedSettlementLatencyMs);

  if (
    typeof value.expectedTotalLatencyMs === "number" &&
    Math.abs(value.expectedTotalLatencyMs - expectedComponents) > 1e-8
  ) {
    issue(
      context,
      `${path}.expectedTotalLatencyMs`,
      "INCONSISTENT",
      "Expected total latency must equal the sum of latency components.",
    );
  }

  if (
    typeof value.expectedTotalLatencyMs === "number" &&
    typeof value.maximumPermittedLatencyMs === "number" &&
    value.expectedTotalLatencyMs > value.maximumPermittedLatencyMs
  ) {
    issue(
      context,
      `${path}.expectedTotalLatencyMs`,
      "INVALID_RANGE",
      "Expected total latency exceeds maximum permitted latency.",
    );
  }
}

function validateProfitEstimate(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireFiniteNumber(context, value.grossProfit, `${path}.grossProfit`);
  requireNonNegative(context, value.totalFees, `${path}.totalFees`);
  requireNonNegative(
    context,
    value.expectedSlippageCost,
    `${path}.expectedSlippageCost`,
  );
  requireNonNegative(
    context,
    value.expectedFinancingCost,
    `${path}.expectedFinancingCost`,
  );
  requireNonNegative(
    context,
    value.expectedGasCost,
    `${path}.expectedGasCost`,
  );
  requireNonNegative(
    context,
    value.expectedBridgeCost,
    `${path}.expectedBridgeCost`,
  );
  requireFiniteNumber(
    context,
    value.expectedNetProfit,
    `${path}.expectedNetProfit`,
  );
  requireFiniteNumber(
    context,
    value.stressedNetProfit,
    `${path}.stressedNetProfit`,
  );
  requireFiniteNumber(
    context,
    value.grossReturnPercentage,
    `${path}.grossReturnPercentage`,
  );
  requireFiniteNumber(
    context,
    value.netReturnPercentage,
    `${path}.netReturnPercentage`,
  );

  if (value.annualizedReturnPercentage !== undefined) {
    requireFiniteNumber(
      context,
      value.annualizedReturnPercentage,
      `${path}.annualizedReturnPercentage`,
    );
  }

  requireNonNegative(
    context,
    value.breakEvenPriceMovementBps,
    `${path}.breakEvenPriceMovementBps`,
  );
  requireString(
    context,
    value.reportingAsset,
    `${path}.reportingAsset`,
  );

  const expectedNet =
    numberOrZero(value.grossProfit) -
    numberOrZero(value.totalFees) -
    numberOrZero(value.expectedSlippageCost) -
    numberOrZero(value.expectedFinancingCost) -
    numberOrZero(value.expectedGasCost) -
    numberOrZero(value.expectedBridgeCost);

  if (
    typeof value.expectedNetProfit === "number" &&
    Math.abs(value.expectedNetProfit - expectedNet) > 1e-8
  ) {
    issue(
      context,
      `${path}.expectedNetProfit`,
      "INCONSISTENT",
      "Expected net profit must equal gross profit less all expected costs.",
    );
  }

  if (
    typeof value.stressedNetProfit === "number" &&
    typeof value.expectedNetProfit === "number" &&
    value.stressedNetProfit > value.expectedNetProfit
  ) {
    issue(
      context,
      `${path}.stressedNetProfit`,
      "INVALID_ORDER",
      "Stressed net profit must not exceed expected net profit.",
    );
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function validateLeg(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.legId, `${path}.legId`);
  requireInteger(context, value.sequence, `${path}.sequence`, 0);
  requireEnum(context, value.side, `${path}.side`, ARBITRAGE_SIDES);
  validateVenueReference(context, value.venue, `${path}.venue`);

  if (value.instrument !== undefined) {
    validateInstrumentReference(
      context,
      value.instrument,
      `${path}.instrument`,
    );
  }

  requireString(context, value.inputAsset, `${path}.inputAsset`);
  requireString(context, value.outputAsset, `${path}.outputAsset`);
  requirePositive(context, value.inputQuantity, `${path}.inputQuantity`);
  requireNonNegative(
    context,
    value.expectedOutputQuantity,
    `${path}.expectedOutputQuantity`,
  );

  if (value.expectedPrice !== undefined) {
    requirePositive(
      context,
      value.expectedPrice,
      `${path}.expectedPrice`,
    );
  }

  if (value.limitPrice !== undefined) {
    requirePositive(context, value.limitPrice, `${path}.limitPrice`);
  }

  if (value.minimumOutputQuantity !== undefined) {
    requireNonNegative(
      context,
      value.minimumOutputQuantity,
      `${path}.minimumOutputQuantity`,
    );
  }

  if (value.orderType !== undefined) {
    requireEnum(
      context,
      value.orderType,
      `${path}.orderType`,
      ARBITRAGE_ORDER_TYPES,
    );
  }

  if (value.timeInForce !== undefined) {
    requireEnum(
      context,
      value.timeInForce,
      `${path}.timeInForce`,
      ARBITRAGE_TIME_IN_FORCE_VALUES,
    );
  }

  requireBoolean(context, value.reduceOnly, `${path}.reduceOnly`);
  requireBoolean(context, value.postOnly, `${path}.postOnly`);
  requireBoolean(
    context,
    value.requiresTransfer,
    `${path}.requiresTransfer`,
  );
  requireBoolean(
    context,
    value.requiresBorrowing,
    `${path}.requiresBorrowing`,
  );
  validateFeeBreakdown(context, value.feeEstimate, `${path}.feeEstimate`);
  validateSlippageEstimate(
    context,
    value.slippageEstimate,
    `${path}.slippageEstimate`,
  );
  validateLiquidityAssessment(
    context,
    value.liquidity,
    `${path}.liquidity`,
  );
  validateLatencyEstimate(context, value.latency, `${path}.latency`);
  validateStringArray(
    context,
    value.dependencyLegIds,
    `${path}.dependencyLegIds`,
  );
  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (value.postOnly === true && value.orderType !== "POST_ONLY_LIMIT") {
    issue(
      context,
      `${path}.orderType`,
      "INCONSISTENT",
      "A post-only leg must use POST_ONLY_LIMIT.",
    );
  }

  if (
    value.orderType === "POST_ONLY_LIMIT" &&
    value.timeInForce !== "POST_ONLY"
  ) {
    issue(
      context,
      `${path}.timeInForce`,
      "INCONSISTENT",
      "POST_ONLY_LIMIT requires POST_ONLY time in force.",
    );
  }
}

function validateTransfer(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.transferId, `${path}.transferId`);
  requireInteger(context, value.sequence, `${path}.sequence`, 0);
  requireString(context, value.asset, `${path}.asset`);
  requirePositive(context, value.quantity, `${path}.quantity`);
  validateVenueReference(
    context,
    value.sourceVenue,
    `${path}.sourceVenue`,
  );
  validateVenueReference(
    context,
    value.destinationVenue,
    `${path}.destinationVenue`,
  );
  optionalString(
    context,
    value.sourceChainId,
    `${path}.sourceChainId`,
  );
  optionalString(
    context,
    value.destinationChainId,
    `${path}.destinationChainId`,
  );
  optionalString(context, value.bridgeId, `${path}.bridgeId`);
  requireNonNegative(
    context,
    value.expectedFee,
    `${path}.expectedFee`,
  );
  requireNonNegative(
    context,
    value.expectedDurationMs,
    `${path}.expectedDurationMs`,
  );
  requirePositive(
    context,
    value.maximumDurationMs,
    `${path}.maximumDurationMs`,
  );

  if (value.confirmationsRequired !== undefined) {
    requireInteger(
      context,
      value.confirmationsRequired,
      `${path}.confirmationsRequired`,
      0,
    );
  }

  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (
    typeof value.expectedDurationMs === "number" &&
    typeof value.maximumDurationMs === "number" &&
    value.expectedDurationMs > value.maximumDurationMs
  ) {
    issue(
      context,
      `${path}.expectedDurationMs`,
      "INVALID_RANGE",
      "Expected transfer duration exceeds maximum duration.",
    );
  }

  if (
    isRecord(value.sourceVenue) &&
    isRecord(value.destinationVenue) &&
    value.sourceVenue.venueId === value.destinationVenue.venueId
  ) {
    issue(
      context,
      `${path}.destinationVenue.venueId`,
      "INCONSISTENT",
      "Transfer source and destination venues must differ.",
    );
  }

  const crossChain =
    value.sourceChainId !== undefined &&
    value.destinationChainId !== undefined &&
    value.sourceChainId !== value.destinationChainId;

  if (crossChain && !requireString(context, value.bridgeId, `${path}.bridgeId`)) {
    issue(
      context,
      `${path}.bridgeId`,
      "REQUIRED",
      "Cross-chain transfers require a bridge identifier.",
    );
  }
}

function validateOpportunityDetails(
  context: ValidationContext,
  opportunity: Readonly<Record<string, unknown>>,
  path: string,
): void {
  const details = opportunity.details;
  const type = opportunity.type;

  if (!requireRecord(context, details, `${path}.details`)) {
    return;
  }

  switch (type) {
    case "CROSS_EXCHANGE":
      validateVenueReference(
        context,
        details.buyVenue,
        `${path}.details.buyVenue`,
      );
      validateVenueReference(
        context,
        details.sellVenue,
        `${path}.details.sellVenue`,
      );
      validateInstrumentReference(
        context,
        details.instrument,
        `${path}.details.instrument`,
      );
      requirePositive(
        context,
        details.buyPrice,
        `${path}.details.buyPrice`,
      );
      requirePositive(
        context,
        details.sellPrice,
        `${path}.details.sellPrice`,
      );
      requireFiniteNumber(
        context,
        details.grossSpread,
        `${path}.details.grossSpread`,
      );
      requireFiniteNumber(
        context,
        details.grossSpreadBps,
        `${path}.details.grossSpreadBps`,
      );
      requirePositive(
        context,
        details.executableQuantity,
        `${path}.details.executableQuantity`,
      );
      requireBoolean(
        context,
        details.inventoryPrepositioned,
        `${path}.details.inventoryPrepositioned`,
      );
      requireBoolean(
        context,
        details.settlementVerificationRequired,
        `${path}.details.settlementVerificationRequired`,
      );

      if (
        isRecord(details.buyVenue) &&
        isRecord(details.sellVenue) &&
        details.buyVenue.venueId === details.sellVenue.venueId
      ) {
        issue(
          context,
          `${path}.details.sellVenue.venueId`,
          "INCONSISTENT",
          "Cross-exchange buy and sell venues must differ.",
        );
      }
      break;

    case "TRIANGULAR":
      validateVenueReference(
        context,
        details.venue,
        `${path}.details.venue`,
      );
      requireString(
        context,
        details.startAsset,
        `${path}.details.startAsset`,
      );
      requireString(
        context,
        details.endAsset,
        `${path}.details.endAsset`,
      );
      requireInteger(
        context,
        details.cycleLength,
        `${path}.details.cycleLength`,
        3,
      );
      requirePositive(
        context,
        details.startingQuantity,
        `${path}.details.startingQuantity`,
      );
      requirePositive(
        context,
        details.expectedEndingQuantity,
        `${path}.details.expectedEndingQuantity`,
      );
      requireFiniteNumber(
        context,
        details.cycleReturnPercentage,
        `${path}.details.cycleReturnPercentage`,
      );
      requireString(
        context,
        details.routeHash,
        `${path}.details.routeHash`,
      );

      if (requireArray(
        context,
        details.routeNodes,
        `${path}.details.routeNodes`,
      )) {
        details.routeNodes.forEach((node, index) => {
          const nodePath = `${path}.details.routeNodes[${index}]`;

          if (!requireRecord(context, node, nodePath)) {
            return;
          }

          requireInteger(
            context,
            node.sequence,
            `${nodePath}.sequence`,
            0,
          );
          requireString(context, node.asset, `${nodePath}.asset`);
          requireString(context, node.venueId, `${nodePath}.venueId`);
        });

        if (
          typeof details.cycleLength === "number" &&
          details.routeNodes.length !== details.cycleLength
        ) {
          issue(
            context,
            `${path}.details.routeNodes`,
            "INCONSISTENT",
            "Triangular route node count must equal cycle length.",
          );
        }
      }

      if (
        typeof details.startAsset === "string" &&
        typeof details.endAsset === "string" &&
        details.startAsset !== details.endAsset
      ) {
        issue(
          context,
          `${path}.details.endAsset`,
          "INCONSISTENT",
          "Triangular arbitrage must end in the starting asset.",
        );
      }
      break;

    case "FUNDING_RATE":
      validateVenueReference(
        context,
        details.spotVenue,
        `${path}.details.spotVenue`,
      );
      validateVenueReference(
        context,
        details.derivativesVenue,
        `${path}.details.derivativesVenue`,
      );
      validateInstrumentReference(
        context,
        details.spotInstrument,
        `${path}.details.spotInstrument`,
      );
      validateInstrumentReference(
        context,
        details.derivativesInstrument,
        `${path}.details.derivativesInstrument`,
      );
      requireEnum(
        context,
        details.spotSide,
        `${path}.details.spotSide`,
        ["BUY", "SELL"] as const,
      );
      requireEnum(
        context,
        details.derivativesSide,
        `${path}.details.derivativesSide`,
        ["OPEN_LONG", "OPEN_SHORT"] as const,
      );
      requireFiniteNumber(
        context,
        details.fundingRate,
        `${path}.details.fundingRate`,
      );
      requirePositive(
        context,
        details.fundingIntervalHours,
        `${path}.details.fundingIntervalHours`,
      );
      requireTimestamp(
        context,
        details.nextFundingTimestamp,
        `${path}.details.nextFundingTimestamp`,
      );
      requireInteger(
        context,
        details.expectedHoldingPeriods,
        `${path}.details.expectedHoldingPeriods`,
        1,
      );
      requireFiniteNumber(
        context,
        details.expectedFundingIncome,
        `${path}.details.expectedFundingIncome`,
      );
      requirePositive(
        context,
        details.hedgeRatio,
        `${path}.details.hedgeRatio`,
      );
      requireBoolean(
        context,
        details.deltaNeutral,
        `${path}.details.deltaNeutral`,
      );
      break;

    case "CASH_AND_CARRY":
      validateVenueReference(
        context,
        details.spotVenue,
        `${path}.details.spotVenue`,
      );
      validateVenueReference(
        context,
        details.futuresVenue,
        `${path}.details.futuresVenue`,
      );
      validateInstrumentReference(
        context,
        details.spotInstrument,
        `${path}.details.spotInstrument`,
      );
      validateInstrumentReference(
        context,
        details.futuresInstrument,
        `${path}.details.futuresInstrument`,
      );
      requirePositive(
        context,
        details.spotPrice,
        `${path}.details.spotPrice`,
      );
      requirePositive(
        context,
        details.futuresPrice,
        `${path}.details.futuresPrice`,
      );
      requireFiniteNumber(
        context,
        details.absoluteBasis,
        `${path}.details.absoluteBasis`,
      );
      requireFiniteNumber(
        context,
        details.basisPercentage,
        `${path}.details.basisPercentage`,
      );
      requireFiniteNumber(
        context,
        details.annualizedBasisPercentage,
        `${path}.details.annualizedBasisPercentage`,
      );
      requireTimestamp(
        context,
        details.futuresExpiryTimestamp,
        `${path}.details.futuresExpiryTimestamp`,
      );
      requirePositive(
        context,
        details.holdingPeriodDays,
        `${path}.details.holdingPeriodDays`,
      );
      requirePositive(
        context,
        details.hedgeRatio,
        `${path}.details.hedgeRatio`,
      );
      requireFiniteNumber(
        context,
        details.expectedCarryIncome,
        `${path}.details.expectedCarryIncome`,
      );
      requireBoolean(
        context,
        details.exitBeforeExpiry,
        `${path}.details.exitBeforeExpiry`,
      );
      break;

    case "STABLECOIN":
      requireString(
        context,
        details.stablecoin,
        `${path}.details.stablecoin`,
      );
      requireString(
        context,
        details.referenceAsset,
        `${path}.details.referenceAsset`,
      );
      validateVenueReference(
        context,
        details.sourceVenue,
        `${path}.details.sourceVenue`,
      );
      validateVenueReference(
        context,
        details.destinationVenue,
        `${path}.details.destinationVenue`,
      );
      requirePositive(
        context,
        details.sourcePrice,
        `${path}.details.sourcePrice`,
      );
      requirePositive(
        context,
        details.destinationPrice,
        `${path}.details.destinationPrice`,
      );
      requirePositive(
        context,
        details.referencePrice,
        `${path}.details.referencePrice`,
      );
      requireFiniteNumber(
        context,
        details.sourceDepegPercentage,
        `${path}.details.sourceDepegPercentage`,
      );
      requireFiniteNumber(
        context,
        details.destinationDepegPercentage,
        `${path}.details.destinationDepegPercentage`,
      );
      requireBoolean(
        context,
        details.redemptionAvailable,
        `${path}.details.redemptionAvailable`,
      );

      if (
        requireRecord(
          context,
          details.safetyAssessment,
          `${path}.details.safetyAssessment`,
        )
      ) {
        const assessment = details.safetyAssessment;

        [
          "reserveRiskScore",
          "liquidityRiskScore",
          "issuerRiskScore",
          "redemptionRiskScore",
          "chainRiskScore",
        ].forEach((field) => {
          requireRange(
            context,
            assessment[field],
            `${path}.details.safetyAssessment.${field}`,
            SCORE_MIN,
            SCORE_MAX,
          );
        });

        requireRange(
          context,
          assessment.maximumPermittedDepegPercentage,
          `${path}.details.safetyAssessment.maximumPermittedDepegPercentage`,
          PERCENTAGE_MIN,
          PERCENTAGE_MAX,
        );
        requireBoolean(
          context,
          assessment.safetyRulesPassed,
          `${path}.details.safetyAssessment.safetyRulesPassed`,
        );
        validateStringArray(
          context,
          assessment.failedRuleIds,
          `${path}.details.safetyAssessment.failedRuleIds`,
        );

        if (
          assessment.safetyRulesPassed === true &&
          Array.isArray(assessment.failedRuleIds) &&
          assessment.failedRuleIds.length > 0
        ) {
          issue(
            context,
            `${path}.details.safetyAssessment.failedRuleIds`,
            "INCONSISTENT",
            "Passed safety rules cannot contain failed rule identifiers.",
          );
        }
      }
      break;

    case "CROSS_DEX":
      validateVenueReference(
        context,
        details.sourceDex,
        `${path}.details.sourceDex`,
      );
      validateVenueReference(
        context,
        details.destinationDex,
        `${path}.details.destinationDex`,
      );
      requireString(
        context,
        details.chainId,
        `${path}.details.chainId`,
      );
      requireString(
        context,
        details.inputAsset,
        `${path}.details.inputAsset`,
      );
      requireString(
        context,
        details.outputAsset,
        `${path}.details.outputAsset`,
      );
      requirePositive(
        context,
        details.sourceQuote,
        `${path}.details.sourceQuote`,
      );
      requirePositive(
        context,
        details.destinationQuote,
        `${path}.details.destinationQuote`,
      );
      requireNonNegative(
        context,
        details.expectedGasCost,
        `${path}.details.expectedGasCost`,
      );
      requireNonNegative(
        context,
        details.expectedSlippageCost,
        `${path}.details.expectedSlippageCost`,
      );
      requirePositive(
        context,
        details.availableLiquidity,
        `${path}.details.availableLiquidity`,
      );
      requireNonNegative(
        context,
        details.priceImpactBps,
        `${path}.details.priceImpactBps`,
      );
      requireInteger(
        context,
        details.blockNumber,
        `${path}.details.blockNumber`,
        0,
      );

      if (details.manualApprovalRequired !== true) {
        issue(
          context,
          `${path}.details.manualApprovalRequired`,
          "APPROVAL_POLICY_VIOLATION",
          "Cross-DEX opportunities must require manual approval.",
        );
      }
      break;

    case "CROSS_CHAIN":
      requireString(
        context,
        details.sourceChainId,
        `${path}.details.sourceChainId`,
      );
      requireString(
        context,
        details.destinationChainId,
        `${path}.details.destinationChainId`,
      );
      validateVenueReference(
        context,
        details.sourceVenue,
        `${path}.details.sourceVenue`,
      );
      validateVenueReference(
        context,
        details.destinationVenue,
        `${path}.details.destinationVenue`,
      );
      requireString(
        context,
        details.bridgeId,
        `${path}.details.bridgeId`,
      );
      requireString(context, details.asset, `${path}.details.asset`);
      requirePositive(
        context,
        details.quantity,
        `${path}.details.quantity`,
      );
      requirePositive(
        context,
        details.sourcePrice,
        `${path}.details.sourcePrice`,
      );
      requirePositive(
        context,
        details.destinationPrice,
        `${path}.details.destinationPrice`,
      );
      requireNonNegative(
        context,
        details.expectedBridgeFee,
        `${path}.details.expectedBridgeFee`,
      );
      requirePositive(
        context,
        details.expectedSettlementTimeMs,
        `${path}.details.expectedSettlementTimeMs`,
      );
      requirePositive(
        context,
        details.maximumSettlementTimeMs,
        `${path}.details.maximumSettlementTimeMs`,
      );
      requireRange(
        context,
        details.sourceChainRiskScore,
        `${path}.details.sourceChainRiskScore`,
        SCORE_MIN,
        SCORE_MAX,
      );
      requireRange(
        context,
        details.destinationChainRiskScore,
        `${path}.details.destinationChainRiskScore`,
        SCORE_MIN,
        SCORE_MAX,
      );
      requireRange(
        context,
        details.bridgeRiskScore,
        `${path}.details.bridgeRiskScore`,
        SCORE_MIN,
        SCORE_MAX,
      );

      if (details.manualApprovalRequired !== true) {
        issue(
          context,
          `${path}.details.manualApprovalRequired`,
          "APPROVAL_POLICY_VIOLATION",
          "Cross-chain opportunities must require manual approval.",
        );
      }

      if (
        details.sourceChainId !== undefined &&
        details.destinationChainId !== undefined &&
        details.sourceChainId === details.destinationChainId
      ) {
        issue(
          context,
          `${path}.details.destinationChainId`,
          "INCONSISTENT",
          "Cross-chain source and destination chains must differ.",
        );
      }
      break;

    default:
      issue(
        context,
        `${path}.type`,
        "UNSUPPORTED",
        "Unsupported arbitrage opportunity type.",
      );
  }
}

function validateLegDependencies(
  context: ValidationContext,
  legs: readonly unknown[],
  path: string,
): void {
  const ids = new Set<string>();
  const dependencies = new Map<string, readonly string[]>();

  legs.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.legId !== "string") {
      return;
    }

    if (ids.has(entry.legId)) {
      issue(
        context,
        `${path}[${index}].legId`,
        "DUPLICATE",
        "Leg identifiers must be unique.",
      );
    }

    ids.add(entry.legId);

    if (Array.isArray(entry.dependencyLegIds)) {
      dependencies.set(
        entry.legId,
        entry.dependencyLegIds.filter(
          (dependency): dependency is string =>
            typeof dependency === "string",
        ),
      );
    }
  });

  dependencies.forEach((dependencyIds, legId) => {
    dependencyIds.forEach((dependencyId) => {
      if (!ids.has(dependencyId)) {
        issue(
          context,
          path,
          "MISSING_DEPENDENCY",
          `Leg ${legId} depends on unknown leg ${dependencyId}.`,
        );
      }

      if (dependencyId === legId) {
        issue(
          context,
          path,
          "CIRCULAR_DEPENDENCY",
          `Leg ${legId} cannot depend on itself.`,
        );
      }
    });
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (legId: string): void => {
    if (visited.has(legId)) {
      return;
    }

    if (visiting.has(legId)) {
      issue(
        context,
        path,
        "CIRCULAR_DEPENDENCY",
        `Circular leg dependency detected at ${legId}.`,
      );
      return;
    }

    visiting.add(legId);

    (dependencies.get(legId) ?? []).forEach((dependencyId) => {
      if (dependencies.has(dependencyId)) {
        visit(dependencyId);
      }
    });

    visiting.delete(legId);
    visited.add(legId);
  };

  dependencies.forEach((_value, legId) => visit(legId));
}

function validateOpportunityInternal(
  context: ValidationContext,
  value: unknown,
  path: string,
  evaluationTimestamp?: number,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.opportunityId, `${path}.opportunityId`);
  const validType = requireEnum(
    context,
    value.type,
    `${path}.type`,
    ARBITRAGE_TYPES,
  );
  const validMode = requireEnum(
    context,
    value.automationMode,
    `${path}.automationMode`,
    ARBITRAGE_AUTOMATION_MODES,
  );
  requireEnum(
    context,
    value.status,
    `${path}.status`,
    ARBITRAGE_OPPORTUNITY_STATUSES,
  );
  requireString(context, value.strategyId, `${path}.strategyId`);
  requireString(context, value.portfolioId, `${path}.portfolioId`);
  validateStringArray(context, value.accountIds, `${path}.accountIds`);
  requireString(
    context,
    value.reportingAsset,
    `${path}.reportingAsset`,
  );
  requirePositive(
    context,
    value.requestedCapital,
    `${path}.requestedCapital`,
  );
  requirePositive(
    context,
    value.maximumCapital,
    `${path}.maximumCapital`,
  );
  validateProfitEstimate(
    context,
    value.profitEstimate,
    `${path}.profitEstimate`,
  );

  if (requireArray(context, value.legs, `${path}.legs`)) {
    if (value.legs.length === 0) {
      issue(
        context,
        `${path}.legs`,
        "REQUIRED",
        "An opportunity must contain at least one execution leg.",
      );
    }

    value.legs.forEach((leg, index) => {
      validateLeg(context, leg, `${path}.legs[${index}]`);
    });
    validateLegDependencies(context, value.legs, `${path}.legs`);
  }

  if (requireArray(context, value.transfers, `${path}.transfers`)) {
    const transferIds = new Set<string>();

    value.transfers.forEach((transfer, index) => {
      const transferPath = `${path}.transfers[${index}]`;
      validateTransfer(context, transfer, transferPath);

      if (
        isRecord(transfer) &&
        typeof transfer.transferId === "string"
      ) {
        if (transferIds.has(transfer.transferId)) {
          issue(
            context,
            `${transferPath}.transferId`,
            "DUPLICATE",
            "Transfer identifiers must be unique.",
          );
        }

        transferIds.add(transfer.transferId);
      }
    });
  }

  requireTimestamp(
    context,
    value.discoveredAt,
    `${path}.discoveredAt`,
  );
  requireTimestamp(context, value.validFrom, `${path}.validFrom`);
  requireTimestamp(context, value.expiresAt, `${path}.expiresAt`);
  requireInteger(
    context,
    value.sourceSequence,
    `${path}.sourceSequence`,
    0,
  );
  requireRange(
    context,
    value.confidence,
    `${path}.confidence`,
    CONFIDENCE_MIN,
    CONFIDENCE_MAX,
  );
  requireString(
    context,
    value.correlationId,
    `${path}.correlationId`,
  );
  optionalString(context, value.causationId, `${path}.causationId`);
  requireString(context, value.traceId, `${path}.traceId`);
  requireInteger(context, value.version, `${path}.version`, 1);
  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (
    typeof value.requestedCapital === "number" &&
    typeof value.maximumCapital === "number" &&
    value.requestedCapital > value.maximumCapital
  ) {
    issue(
      context,
      `${path}.requestedCapital`,
      "CAPITAL_POLICY_VIOLATION",
      "Requested capital cannot exceed maximum capital.",
    );
  }

  if (
    typeof value.discoveredAt === "number" &&
    typeof value.validFrom === "number" &&
    value.discoveredAt > value.validFrom
  ) {
    issue(
      context,
      `${path}.validFrom`,
      "INVALID_ORDER",
      "validFrom cannot precede discoveredAt.",
    );
  }

  if (
    typeof value.validFrom === "number" &&
    typeof value.expiresAt === "number" &&
    value.validFrom >= value.expiresAt
  ) {
    issue(
      context,
      `${path}.expiresAt`,
      "INVALID_ORDER",
      "expiresAt must be later than validFrom.",
    );
  }

  if (
    evaluationTimestamp !== undefined &&
    typeof value.expiresAt === "number" &&
    evaluationTimestamp >= value.expiresAt
  ) {
    issue(
      context,
      `${path}.expiresAt`,
      "EXPIRED",
      "The opportunity has expired.",
    );
  }

  if (validType && validMode) {
    const opportunityType = value.type as ArbitrageType;
    const expectedMode =
      ARBITRAGE_TYPE_AUTOMATION_MODE[opportunityType];

    if (value.automationMode !== expectedMode) {
      issue(
        context,
        `${path}.automationMode`,
        "AUTOMATION_MODE_MISMATCH",
        `${value.type} must use ${expectedMode}.`,
      );
    }
  }

  validateOpportunityDetails(context, value, path);
}

function validatePolicyInternal(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireNonNegative(
    context,
    value.minimumGrossProfit,
    `${path}.minimumGrossProfit`,
  );
  requireNonNegative(
    context,
    value.minimumNetProfit,
    `${path}.minimumNetProfit`,
  );
  requireFiniteNumber(
    context,
    value.minimumNetReturnPercentage,
    `${path}.minimumNetReturnPercentage`,
  );
  requireRange(
    context,
    value.minimumConfidence,
    `${path}.minimumConfidence`,
    CONFIDENCE_MIN,
    CONFIDENCE_MAX,
  );
  requireRange(
    context,
    value.maximumRiskScore,
    `${path}.maximumRiskScore`,
    SCORE_MIN,
    SCORE_MAX,
  );
  requireNonNegative(
    context,
    value.maximumSlippageBps,
    `${path}.maximumSlippageBps`,
  );
  requireRange(
    context,
    value.maximumFeePercentage,
    `${path}.maximumFeePercentage`,
    PERCENTAGE_MIN,
    PERCENTAGE_MAX,
  );
  requireNonNegative(
    context,
    value.maximumMarketDataAgeMs,
    `${path}.maximumMarketDataAgeMs`,
  );
  requireNonNegative(
    context,
    value.maximumExecutionLatencyMs,
    `${path}.maximumExecutionLatencyMs`,
  );
  requireNonNegative(
    context,
    value.maximumSettlementLatencyMs,
    `${path}.maximumSettlementLatencyMs`,
  );
  requirePositive(
    context,
    value.maximumCapitalPerOpportunity,
    `${path}.maximumCapitalPerOpportunity`,
  );
  requireRange(
    context,
    value.maximumPortfolioAllocationPercentage,
    `${path}.maximumPortfolioAllocationPercentage`,
    PERCENTAGE_MIN,
    PERCENTAGE_MAX,
  );
  requireInteger(
    context,
    value.maximumConcurrentExecutions,
    `${path}.maximumConcurrentExecutions`,
    1,
  );
  requireBoolean(
    context,
    value.requirePrepositionedInventoryForCrossExchange,
    `${path}.requirePrepositionedInventoryForCrossExchange`,
  );
  requireBoolean(
    context,
    value.requireManualApprovalForStablecoin,
    `${path}.requireManualApprovalForStablecoin`,
  );
  requireBoolean(
    context,
    value.publishRejectedSignals,
    `${path}.publishRejectedSignals`,
  );
}

function validateRiskFinding(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.findingId, `${path}.findingId`);
  requireEnum(
    context,
    value.factor,
    `${path}.factor`,
    ARBITRAGE_RISK_FACTORS,
  );
  requireEnum(
    context,
    value.level,
    `${path}.level`,
    ARBITRAGE_RISK_LEVELS,
  );
  requireRange(
    context,
    value.score,
    `${path}.score`,
    SCORE_MIN,
    SCORE_MAX,
  );
  requireString(context, value.message, `${path}.message`);
  requireBoolean(context, value.blocking, `${path}.blocking`);
  validateStringArray(
    context,
    value.affectedLegIds,
    `${path}.affectedLegIds`,
  );
  validateMetadata(context, value.metadata, `${path}.metadata`);
}

function validateRiskAssessmentInternal(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(
    context,
    value.opportunityId,
    `${path}.opportunityId`,
  );
  requireTimestamp(context, value.assessedAt, `${path}.assessedAt`);
  requireEnum(
    context,
    value.overallRiskLevel,
    `${path}.overallRiskLevel`,
    ARBITRAGE_RISK_LEVELS,
  );
  requireRange(
    context,
    value.overallRiskScore,
    `${path}.overallRiskScore`,
    SCORE_MIN,
    SCORE_MAX,
  );
  requireBoolean(context, value.approved, `${path}.approved`);

  if (requireArray(context, value.findings, `${path}.findings`)) {
    value.findings.forEach((finding, index) => {
      validateRiskFinding(
        context,
        finding,
        `${path}.findings[${index}]`,
      );
    });
  }

  if (
    requireArray(
      context,
      value.rejectionCodes,
      `${path}.rejectionCodes`,
    )
  ) {
    value.rejectionCodes.forEach((code, index) => {
      requireEnum(
        context,
        code,
        `${path}.rejectionCodes[${index}]`,
        ARBITRAGE_REJECTION_CODES,
      );
    });
  }

  requireNonNegative(
    context,
    value.maximumApprovedCapital,
    `${path}.maximumApprovedCapital`,
  );
  requireNonNegative(
    context,
    value.maximumApprovedLeverage,
    `${path}.maximumApprovedLeverage`,
  );
  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (
    value.approved === true &&
    Array.isArray(value.rejectionCodes) &&
    value.rejectionCodes.length > 0
  ) {
    issue(
      context,
      `${path}.rejectionCodes`,
      "INCONSISTENT",
      "Approved risk assessments cannot contain rejection codes.",
    );
  }

  if (
    value.approved === false &&
    Array.isArray(value.rejectionCodes) &&
    value.rejectionCodes.length === 0
  ) {
    issue(
      context,
      `${path}.rejectionCodes`,
      "REQUIRED",
      "Rejected risk assessments require at least one rejection code.",
    );
  }
}

function validateScoreBreakdown(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  [
    "profitabilityScore",
    "confidenceScore",
    "liquidityScore",
    "executionScore",
    "latencyScore",
    "settlementScore",
    "capitalEfficiencyScore",
    "diversificationScore",
    "riskAdjustedScore",
    "finalScore",
  ].forEach((field) => {
    requireRange(
      context,
      value[field],
      `${path}.${field}`,
      SCORE_MIN,
      SCORE_MAX,
    );
  });
}

function validateCapitalAllocationInternal(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.allocationId, `${path}.allocationId`);
  requireString(
    context,
    value.opportunityId,
    `${path}.opportunityId`,
  );
  requireString(context, value.portfolioId, `${path}.portfolioId`);
  requirePositive(
    context,
    value.requestedCapital,
    `${path}.requestedCapital`,
  );
  requireNonNegative(
    context,
    value.approvedCapital,
    `${path}.approvedCapital`,
  );
  requireNonNegative(
    context,
    value.reservedCapital,
    `${path}.reservedCapital`,
  );
  requireString(
    context,
    value.reportingAsset,
    `${path}.reportingAsset`,
  );
  requireRange(
    context,
    value.allocationPercentage,
    `${path}.allocationPercentage`,
    PERCENTAGE_MIN,
    PERCENTAGE_MAX,
  );
  requireTimestamp(
    context,
    value.reservationExpiresAt,
    `${path}.reservationExpiresAt`,
  );
  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (
    typeof value.approvedCapital === "number" &&
    typeof value.requestedCapital === "number" &&
    value.approvedCapital > value.requestedCapital
  ) {
    issue(
      context,
      `${path}.approvedCapital`,
      "CAPITAL_POLICY_VIOLATION",
      "Approved capital cannot exceed requested capital.",
    );
  }

  if (
    typeof value.reservedCapital === "number" &&
    typeof value.approvedCapital === "number" &&
    value.reservedCapital > value.approvedCapital
  ) {
    issue(
      context,
      `${path}.reservedCapital`,
      "CAPITAL_POLICY_VIOLATION",
      "Reserved capital cannot exceed approved capital.",
    );
  }
}

function validateManualApprovalInternal(
  context: ValidationContext,
  value: unknown,
  path: string,
): void {
  if (!requireRecord(context, value, path)) {
    return;
  }

  requireString(context, value.approvalId, `${path}.approvalId`);
  requireString(
    context,
    value.opportunityId,
    `${path}.opportunityId`,
  );
  requireEnum(
    context,
    value.status,
    `${path}.status`,
    ARBITRAGE_APPROVAL_STATUSES,
  );
  requireTimestamp(
    context,
    value.requestedAt,
    `${path}.requestedAt`,
  );
  requireTimestamp(context, value.expiresAt, `${path}.expiresAt`);

  if (value.decidedAt !== undefined) {
    requireTimestamp(context, value.decidedAt, `${path}.decidedAt`);
  }

  optionalString(context, value.decidedBy, `${path}.decidedBy`);
  optionalString(context, value.reason, `${path}.reason`);
  validateMetadata(context, value.metadata, `${path}.metadata`);

  if (
    typeof value.requestedAt === "number" &&
    typeof value.expiresAt === "number" &&
    value.requestedAt >= value.expiresAt
  ) {
    issue(
      context,
      `${path}.expiresAt`,
      "INVALID_ORDER",
      "Approval expiry must be later than request time.",
    );
  }

  const decided =
    value.status === "APPROVED" ||
    value.status === "REJECTED" ||
    value.status === "REVOKED";

  if (decided && value.decidedAt === undefined) {
    issue(
      context,
      `${path}.decidedAt`,
      "REQUIRED",
      "A decided approval requires decidedAt.",
    );
  }
}

function finalize(context: ValidationContext): ArbitrageValidationResult {
  const issues = Object.freeze([...context.issues]);

  return Object.freeze({
    valid: issues.length === 0,
    issues,
  });
}

function assertValid(
  result: ArbitrageValidationResult,
  message: string,
): void {
  if (!result.valid) {
    throw new InstitutionalArbitrageValidationError(
      message,
      result.issues,
    );
  }
}

export function validateInstitutionalArbitrageConfiguration(
  configuration: InstitutionalArbitrageConfiguration,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, configuration, "configuration")) {
    return finalize(context);
  }

  requireBoolean(context, configuration.enabled, "configuration.enabled");

  if (
    requireArray(
      context,
      configuration.enabledTypes,
      "configuration.enabledTypes",
    )
  ) {
    const seen = new Set<string>();

    configuration.enabledTypes.forEach((type, index) => {
      requireEnum(
        context,
        type,
        `configuration.enabledTypes[${index}]`,
        ARBITRAGE_TYPES,
      );

      if (seen.has(type)) {
        issue(
          context,
          `configuration.enabledTypes[${index}]`,
          "DUPLICATE",
          "Enabled arbitrage types must be unique.",
        );
      }

      seen.add(type);
    });
  }

  validatePolicyInternal(
    context,
    configuration.evaluationPolicy,
    "configuration.evaluationPolicy",
  );
  requireBoolean(
    context,
    configuration.emergencyShutdownActive,
    "configuration.emergencyShutdownActive",
  );
  requireBoolean(
    context,
    configuration.circuitBreakerActive,
    "configuration.circuitBreakerActive",
  );
  requireString(
    context,
    configuration.deterministicSeed,
    "configuration.deterministicSeed",
  );
  requireInteger(
    context,
    configuration.configurationVersion,
    "configuration.configurationVersion",
    1,
  );
  validateMetadata(
    context,
    configuration.metadata,
    "configuration.metadata",
  );

  if (
    configuration.enabled === true &&
    configuration.enabledTypes.length === 0
  ) {
    issue(
      context,
      "configuration.enabledTypes",
      "REQUIRED",
      "An enabled configuration requires at least one arbitrage type.",
    );
  }

  return finalize(context);
}

export function assertInstitutionalArbitrageConfiguration(
  configuration: InstitutionalArbitrageConfiguration,
): void {
  assertValid(
    validateInstitutionalArbitrageConfiguration(configuration),
    "Invalid institutional arbitrage configuration.",
  );
}

export function validateArbitrageEvaluationPolicy(
  policy: ArbitrageEvaluationPolicy,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };
  validatePolicyInternal(context, policy, "policy");
  return finalize(context);
}

export function assertArbitrageEvaluationPolicy(
  policy: ArbitrageEvaluationPolicy,
): void {
  assertValid(
    validateArbitrageEvaluationPolicy(policy),
    "Invalid arbitrage evaluation policy.",
  );
}

export function validateInstitutionalArbitrageOpportunity(
  opportunity: InstitutionalArbitrageOpportunity,
  evaluationTimestamp?: number,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (evaluationTimestamp !== undefined) {
    requireTimestamp(
      context,
      evaluationTimestamp,
      "evaluationTimestamp",
    );
  }

  validateOpportunityInternal(
    context,
    opportunity,
    "opportunity",
    evaluationTimestamp,
  );
  return finalize(context);
}

export function assertInstitutionalArbitrageOpportunity(
  opportunity: InstitutionalArbitrageOpportunity,
  evaluationTimestamp?: number,
): void {
  assertValid(
    validateInstitutionalArbitrageOpportunity(
      opportunity,
      evaluationTimestamp,
    ),
    "Invalid institutional arbitrage opportunity.",
  );
}

export function validateArbitrageMarketSnapshot(
  snapshot: ArbitrageMarketSnapshot,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, snapshot, "snapshot")) {
    return finalize(context);
  }

  validateVenueReference(context, snapshot.venue, "snapshot.venue");
  validateInstrumentReference(
    context,
    snapshot.instrument,
    "snapshot.instrument",
  );

  [
    "bidPrice",
    "askPrice",
    "lastPrice",
    "markPrice",
    "indexPrice",
    "midPrice",
    "bidQuantity",
    "askQuantity",
    "openInterest",
    "volume24h",
  ].forEach((field) => {
    const value = snapshot[field as keyof ArbitrageMarketSnapshot];

    if (value !== undefined) {
      requireNonNegative(context, value, `snapshot.${field}`);
    }
  });

  if (snapshot.fundingRate !== undefined) {
    requireFiniteNumber(
      context,
      snapshot.fundingRate,
      "snapshot.fundingRate",
    );
  }

  if (snapshot.nextFundingTimestamp !== undefined) {
    requireTimestamp(
      context,
      snapshot.nextFundingTimestamp,
      "snapshot.nextFundingTimestamp",
    );
  }

  if (snapshot.blockNumber !== undefined) {
    requireInteger(
      context,
      snapshot.blockNumber,
      "snapshot.blockNumber",
      0,
    );
  }

  requireTimestamp(
    context,
    snapshot.sourceTimestamp,
    "snapshot.sourceTimestamp",
  );
  requireTimestamp(
    context,
    snapshot.observedAt,
    "snapshot.observedAt",
  );
  requireInteger(context, snapshot.sequence, "snapshot.sequence", 0);
  validateMetadata(context, snapshot.metadata, "snapshot.metadata");

  if (
    snapshot.bidPrice !== undefined &&
    snapshot.askPrice !== undefined &&
    snapshot.bidPrice > snapshot.askPrice
  ) {
    issue(
      context,
      "snapshot.bidPrice",
      "INVALID_ORDER",
      "Bid price cannot exceed ask price.",
    );
  }

  if (snapshot.sourceTimestamp > snapshot.observedAt) {
    issue(
      context,
      "snapshot.sourceTimestamp",
      "INVALID_ORDER",
      "Source timestamp cannot be later than observedAt.",
    );
  }

  return finalize(context);
}

export function assertArbitrageMarketSnapshot(
  snapshot: ArbitrageMarketSnapshot,
): void {
  assertValid(
    validateArbitrageMarketSnapshot(snapshot),
    "Invalid arbitrage market snapshot.",
  );
}

export function validateArbitrageVenueHealth(
  health: ArbitrageVenueHealth,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, health, "health")) {
    return finalize(context);
  }

  requireString(context, health.venueId, "health.venueId");
  requireBoolean(context, health.available, "health.available");
  requireBoolean(
    context,
    health.authenticated,
    "health.authenticated",
  );
  requireBoolean(
    context,
    health.marketDataHealthy,
    "health.marketDataHealthy",
  );
  requireBoolean(
    context,
    health.tradingHealthy,
    "health.tradingHealthy",
  );
  requireBoolean(
    context,
    health.depositHealthy,
    "health.depositHealthy",
  );
  requireBoolean(
    context,
    health.withdrawalHealthy,
    "health.withdrawalHealthy",
  );
  requireNonNegative(context, health.latencyMs, "health.latencyMs");
  requireRange(
    context,
    health.errorRatePercentage,
    "health.errorRatePercentage",
    PERCENTAGE_MIN,
    PERCENTAGE_MAX,
  );
  requireTimestamp(context, health.observedAt, "health.observedAt");

  if (health.lastSuccessfulInteractionAt !== undefined) {
    requireTimestamp(
      context,
      health.lastSuccessfulInteractionAt,
      "health.lastSuccessfulInteractionAt",
    );

    if (
      health.lastSuccessfulInteractionAt > health.observedAt
    ) {
      issue(
        context,
        "health.lastSuccessfulInteractionAt",
        "INVALID_ORDER",
        "Last successful interaction cannot be after observedAt.",
      );
    }
  }

  validateMetadata(context, health.metadata, "health.metadata");
  return finalize(context);
}

export function validateArbitrageRiskAssessment(
  assessment: ArbitrageRiskAssessment,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };
  validateRiskAssessmentInternal(context, assessment, "assessment");
  return finalize(context);
}

export function validateArbitrageCapitalAllocation(
  allocation: ArbitrageCapitalAllocation,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };
  validateCapitalAllocationInternal(context, allocation, "allocation");
  return finalize(context);
}

export function validateArbitrageManualApproval(
  approval: ArbitrageManualApproval,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };
  validateManualApprovalInternal(context, approval, "approval");
  return finalize(context);
}

export function validateArbitrageDecision(
  decision: ArbitrageDecision,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, decision, "decision")) {
    return finalize(context);
  }

  requireString(context, decision.decisionId, "decision.decisionId");
  requireString(
    context,
    decision.opportunityId,
    "decision.opportunityId",
  );
  requireEnum(
    context,
    decision.action,
    "decision.action",
    ARBITRAGE_DECISION_ACTIONS,
  );
  requireEnum(
    context,
    decision.automationMode,
    "decision.automationMode",
    ARBITRAGE_AUTOMATION_MODES,
  );
  requireTimestamp(context, decision.decidedAt, "decision.decidedAt");
  validateScoreBreakdown(context, decision.score, "decision.score");
  validateRiskAssessmentInternal(
    context,
    decision.riskAssessment,
    "decision.riskAssessment",
  );

  if (decision.capitalAllocation !== undefined) {
    validateCapitalAllocationInternal(
      context,
      decision.capitalAllocation,
      "decision.capitalAllocation",
    );
  }

  if (decision.approval !== undefined) {
    validateManualApprovalInternal(
      context,
      decision.approval,
      "decision.approval",
    );
  }

  if (
    requireArray(
      context,
      decision.rejectionCodes,
      "decision.rejectionCodes",
    )
  ) {
    decision.rejectionCodes.forEach((code, index) => {
      requireEnum(
        context,
        code,
        `decision.rejectionCodes[${index}]`,
        ARBITRAGE_REJECTION_CODES,
      );
    });
  }

  requireString(context, decision.reason, "decision.reason");
  requireString(
    context,
    decision.correlationId,
    "decision.correlationId",
  );
  requireString(context, decision.traceId, "decision.traceId");
  validateMetadata(context, decision.metadata, "decision.metadata");

  if (
    decision.action === "EXECUTE" &&
    decision.capitalAllocation === undefined
  ) {
    issue(
      context,
      "decision.capitalAllocation",
      "REQUIRED",
      "Execution decisions require a capital allocation.",
    );
  }

  if (
    decision.action === "REQUEST_APPROVAL" &&
    decision.approval === undefined
  ) {
    issue(
      context,
      "decision.approval",
      "REQUIRED",
      "Approval requests require an approval record.",
    );
  }

  if (
    decision.action === "PUBLISH_SIGNAL" &&
    decision.automationMode !== "SIGNAL_ONLY"
  ) {
    issue(
      context,
      "decision.automationMode",
      "AUTOMATION_MODE_MISMATCH",
      "Only signal-only opportunities may publish signals.",
    );
  }

  if (
    decision.action === "REJECT" &&
    decision.rejectionCodes.length === 0
  ) {
    issue(
      context,
      "decision.rejectionCodes",
      "REQUIRED",
      "Rejected decisions require at least one rejection code.",
    );
  }

  return finalize(context);
}

export function validateArbitrageExecutionPlan(
  plan: ArbitrageExecutionPlan,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, plan, "plan")) {
    return finalize(context);
  }

  requireString(context, plan.planId, "plan.planId");
  requireString(context, plan.opportunityId, "plan.opportunityId");
  requireString(context, plan.decisionId, "plan.decisionId");
  requireEnum(
    context,
    plan.status,
    "plan.status",
    ARBITRAGE_EXECUTION_STATUSES,
  );

  if (requireArray(context, plan.legs, "plan.legs")) {
    if (plan.legs.length === 0) {
      issue(
        context,
        "plan.legs",
        "REQUIRED",
        "Execution plans require at least one leg.",
      );
    }

    plan.legs.forEach((leg, index) => {
      validateLeg(context, leg, `plan.legs[${index}]`);
    });
    validateLegDependencies(context, plan.legs, "plan.legs");
  }

  if (requireArray(context, plan.transfers, "plan.transfers")) {
    plan.transfers.forEach((transfer, index) => {
      validateTransfer(
        context,
        transfer,
        `plan.transfers[${index}]`,
      );
    });
  }

  validateCapitalAllocationInternal(
    context,
    plan.capitalAllocation,
    "plan.capitalAllocation",
  );
  requireTimestamp(context, plan.createdAt, "plan.createdAt");
  requireTimestamp(context, plan.expiresAt, "plan.expiresAt");
  requirePositive(
    context,
    plan.maximumExecutionDurationMs,
    "plan.maximumExecutionDurationMs",
  );
  requireBoolean(
    context,
    plan.rollbackRequiredOnPartialFailure,
    "plan.rollbackRequiredOnPartialFailure",
  );
  requireString(
    context,
    plan.correlationId,
    "plan.correlationId",
  );
  requireString(context, plan.traceId, "plan.traceId");
  validateMetadata(context, plan.metadata, "plan.metadata");

  if (plan.createdAt >= plan.expiresAt) {
    issue(
      context,
      "plan.expiresAt",
      "INVALID_ORDER",
      "Execution plan expiry must be later than creation time.",
    );
  }

  if (
    plan.capitalAllocation.opportunityId !== plan.opportunityId
  ) {
    issue(
      context,
      "plan.capitalAllocation.opportunityId",
      "INCONSISTENT",
      "Capital allocation opportunity must match the plan opportunity.",
    );
  }

  return finalize(context);
}

export function validateArbitrageSettlementVerification(
  verification: ArbitrageSettlementVerification,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, verification, "verification")) {
    return finalize(context);
  }

  requireString(
    context,
    verification.verificationId,
    "verification.verificationId",
  );
  requireString(
    context,
    verification.executionId,
    "verification.executionId",
  );
  requireEnum(
    context,
    verification.status,
    "verification.status",
    ARBITRAGE_SETTLEMENT_STATUSES,
  );

  [
    ["expectedAssets", verification.expectedAssets],
    ["actualAssets", verification.actualAssets],
    ["discrepancies", verification.discrepancies],
  ].forEach(([name, balances]) => {
    const balancePath = `verification.${String(name)}`;

    if (!requireRecord(context, balances, balancePath)) {
      return;
    }

    Object.entries(balances).forEach(([asset, quantity]) => {
      requireString(context, asset, `${balancePath}.asset`);
      requireFiniteNumber(
        context,
        quantity,
        `${balancePath}.${asset}`,
      );
    });
  });

  requireFiniteNumber(
    context,
    verification.expectedProfit,
    "verification.expectedProfit",
  );
  requireFiniteNumber(
    context,
    verification.realizedProfit,
    "verification.realizedProfit",
  );
  requireString(
    context,
    verification.reportingAsset,
    "verification.reportingAsset",
  );
  requireTimestamp(
    context,
    verification.verifiedAt,
    "verification.verifiedAt",
  );
  validateStringArray(
    context,
    verification.notes,
    "verification.notes",
    false,
  );
  validateMetadata(
    context,
    verification.metadata,
    "verification.metadata",
  );

  if (
    verification.status === "VERIFIED" &&
    Object.values(verification.discrepancies).some(
      (quantity) => Math.abs(quantity) > 1e-8,
    )
  ) {
    issue(
      context,
      "verification.discrepancies",
      "INCONSISTENT",
      "Verified settlement cannot contain non-zero discrepancies.",
    );
  }

  return finalize(context);
}

export function validateArbitrageExecutionResult(
  result: ArbitrageExecutionResult,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, result, "result")) {
    return finalize(context);
  }

  requireString(context, result.executionId, "result.executionId");
  requireString(context, result.planId, "result.planId");
  requireString(
    context,
    result.opportunityId,
    "result.opportunityId",
  );
  requireEnum(
    context,
    result.status,
    "result.status",
    ARBITRAGE_EXECUTION_STATUSES,
  );

  if (requireArray(context, result.legResults, "result.legResults")) {
    result.legResults.forEach((legResult, index) => {
      const path = `result.legResults[${index}]`;

      if (!requireRecord(context, legResult, path)) {
        return;
      }

      requireString(context, legResult.legId, `${path}.legId`);
      requireEnum(
        context,
        legResult.status,
        `${path}.status`,
        ARBITRAGE_LEG_STATUSES,
      );
      requireNonNegative(
        context,
        legResult.submittedQuantity,
        `${path}.submittedQuantity`,
      );
      requireNonNegative(
        context,
        legResult.filledQuantity,
        `${path}.filledQuantity`,
      );

      if (legResult.averageFillPrice !== undefined) {
        requirePositive(
          context,
          legResult.averageFillPrice,
          `${path}.averageFillPrice`,
        );
      }

      if (legResult.actualOutputQuantity !== undefined) {
        requireNonNegative(
          context,
          legResult.actualOutputQuantity,
          `${path}.actualOutputQuantity`,
        );
      }

      requireNonNegative(
        context,
        legResult.actualFees,
        `${path}.actualFees`,
      );

      if (legResult.submittedAt !== undefined) {
        requireTimestamp(
          context,
          legResult.submittedAt,
          `${path}.submittedAt`,
        );
      }

      if (legResult.completedAt !== undefined) {
        requireTimestamp(
          context,
          legResult.completedAt,
          `${path}.completedAt`,
        );
      }

      validateStringArray(
        context,
        legResult.externalOrderIds,
        `${path}.externalOrderIds`,
      );
      validateStringArray(
        context,
        legResult.externalTransactionIds,
        `${path}.externalTransactionIds`,
      );
      optionalString(
        context,
        legResult.failureReason,
        `${path}.failureReason`,
      );
      validateMetadata(
        context,
        legResult.metadata,
        `${path}.metadata`,
      );

      if (
        typeof legResult.filledQuantity === "number" &&
        typeof legResult.submittedQuantity === "number" &&
        legResult.filledQuantity > legResult.submittedQuantity
      ) {
        issue(
          context,
          `${path}.filledQuantity`,
          "INVALID_RANGE",
          "Filled quantity cannot exceed submitted quantity.",
        );
      }
    });
  }

  if (result.settlementVerification !== undefined) {
    const settlement = validateArbitrageSettlementVerification(
      result.settlementVerification,
    );
    settlement.issues.forEach((entry) => {
      issue(
        context,
        `result.settlementVerification.${entry.path.replace(
          /^verification\.?/,
          "",
        )}`,
        entry.code,
        entry.message,
      );
    });
  }

  requireTimestamp(context, result.startedAt, "result.startedAt");

  if (result.completedAt !== undefined) {
    requireTimestamp(
      context,
      result.completedAt,
      "result.completedAt",
    );

    if (result.completedAt < result.startedAt) {
      issue(
        context,
        "result.completedAt",
        "INVALID_ORDER",
        "Execution completion cannot precede execution start.",
      );
    }
  }

  requireFiniteNumber(
    context,
    result.grossProfit,
    "result.grossProfit",
  );
  requireNonNegative(context, result.totalFees, "result.totalFees");
  requireFiniteNumber(
    context,
    result.realizedNetProfit,
    "result.realizedNetProfit",
  );
  requireString(
    context,
    result.reportingAsset,
    "result.reportingAsset",
  );
  optionalString(
    context,
    result.failureReason,
    "result.failureReason",
  );
  requireString(
    context,
    result.correlationId,
    "result.correlationId",
  );
  requireString(context, result.traceId, "result.traceId");
  validateMetadata(context, result.metadata, "result.metadata");

  if (
    Math.abs(
      result.realizedNetProfit -
        (result.grossProfit - result.totalFees),
    ) > 1e-8
  ) {
    issue(
      context,
      "result.realizedNetProfit",
      "INCONSISTENT",
      "Realized net profit must equal gross profit less total fees.",
    );
  }

  return finalize(context);
}

export function validateArbitrageSignal(
  signal: ArbitrageSignal,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, signal, "signal")) {
    return finalize(context);
  }

  requireString(context, signal.signalId, "signal.signalId");
  requireString(
    context,
    signal.opportunityId,
    "signal.opportunityId",
  );
  requireEnum(
    context,
    signal.type,
    "signal.type",
    ["CROSS_DEX", "CROSS_CHAIN"] as const,
  );
  requireFiniteNumber(
    context,
    signal.expectedProfit,
    "signal.expectedProfit",
  );
  requireFiniteNumber(
    context,
    signal.expectedNetReturnPercentage,
    "signal.expectedNetReturnPercentage",
  );
  requireNonNegative(context, signal.gasCost, "signal.gasCost");
  requireNonNegative(context, signal.bridgeFee, "signal.bridgeFee");
  requireNonNegative(
    context,
    signal.slippageCost,
    "signal.slippageCost",
  );
  requireNonNegative(context, signal.liquidity, "signal.liquidity");
  requireRange(
    context,
    signal.confidence,
    "signal.confidence",
    CONFIDENCE_MIN,
    CONFIDENCE_MAX,
  );

  if (signal.chainRiskScore !== undefined) {
    requireRange(
      context,
      signal.chainRiskScore,
      "signal.chainRiskScore",
      SCORE_MIN,
      SCORE_MAX,
    );
  }

  if (signal.bridgeRiskScore !== undefined) {
    requireRange(
      context,
      signal.bridgeRiskScore,
      "signal.bridgeRiskScore",
      SCORE_MIN,
      SCORE_MAX,
    );
  }

  if (signal.expectedSettlementTimeMs !== undefined) {
    requireNonNegative(
      context,
      signal.expectedSettlementTimeMs,
      "signal.expectedSettlementTimeMs",
    );
  }

  if (signal.manualApprovalRequired !== true) {
    issue(
      context,
      "signal.manualApprovalRequired",
      "APPROVAL_POLICY_VIOLATION",
      "Cross-DEX and cross-chain signals require manual approval.",
    );
  }

  requireTimestamp(
    context,
    signal.generatedAt,
    "signal.generatedAt",
  );
  requireTimestamp(context, signal.expiresAt, "signal.expiresAt");
  validateMetadata(context, signal.metadata, "signal.metadata");

  if (signal.generatedAt >= signal.expiresAt) {
    issue(
      context,
      "signal.expiresAt",
      "INVALID_ORDER",
      "Signal expiry must be later than generation time.",
    );
  }

  if (signal.type === "CROSS_CHAIN") {
    if (signal.bridgeRiskScore === undefined) {
      issue(
        context,
        "signal.bridgeRiskScore",
        "REQUIRED",
        "Cross-chain signals require a bridge risk score.",
      );
    }

    if (signal.expectedSettlementTimeMs === undefined) {
      issue(
        context,
        "signal.expectedSettlementTimeMs",
        "REQUIRED",
        "Cross-chain signals require expected settlement time.",
      );
    }
  }

  return finalize(context);
}

export function validateInstitutionalArbitrageOrchestratorRequest(
  request: InstitutionalArbitrageOrchestratorRequest,
): ArbitrageValidationResult {
  const context: ValidationContext = { issues: [] };

  if (!requireRecord(context, request, "request")) {
    return finalize(context);
  }

  if (requireRecord(context, request.context, "request.context")) {
    requireString(
      context,
      request.context.portfolioId,
      "request.context.portfolioId",
    );
    validateStringArray(
      context,
      request.context.strategyIds,
      "request.context.strategyIds",
    );

    if (
      requireArray(
        context,
        request.context.enabledTypes,
        "request.context.enabledTypes",
      )
    ) {
      request.context.enabledTypes.forEach((type, index) => {
        requireEnum(
          context,
          type,
          `request.context.enabledTypes[${index}]`,
          ARBITRAGE_TYPES,
        );
      });
    }

    validateStringArray(
      context,
      request.context.venueIds,
      "request.context.venueIds",
    );
    validateStringArray(
      context,
      request.context.accountIds,
      "request.context.accountIds",
    );
    requireString(
      context,
      request.context.reportingAsset,
      "request.context.reportingAsset",
    );
    requireNonNegative(
      context,
      request.context.availableCapital,
      "request.context.availableCapital",
    );
    requireTimestamp(
      context,
      request.context.scanTimestamp,
      "request.context.scanTimestamp",
    );
    requireInteger(
      context,
      request.context.sourceSequence,
      "request.context.sourceSequence",
      0,
    );
    requireString(
      context,
      request.context.correlationId,
      "request.context.correlationId",
    );
    requireString(
      context,
      request.context.traceId,
      "request.context.traceId",
    );
    validateMetadata(
      context,
      request.context.metadata,
      "request.context.metadata",
    );
  }

  const configurationResult =
    validateInstitutionalArbitrageConfiguration(request.configuration);

  configurationResult.issues.forEach((entry) => {
    issue(
      context,
      `request.${entry.path}`,
      entry.code,
      entry.message,
    );
  });

  if (
    requireArray(
      context,
      request.marketSnapshots,
      "request.marketSnapshots",
    )
  ) {
    request.marketSnapshots.forEach((snapshot, index) => {
      const result = validateArbitrageMarketSnapshot(
        snapshot as ArbitrageMarketSnapshot,
      );

      result.issues.forEach((entry) => {
        issue(
          context,
          `request.marketSnapshots[${index}].${entry.path.replace(
            /^snapshot\.?/,
            "",
          )}`,
          entry.code,
          entry.message,
        );
      });
    });
  }

  if (
    requireArray(
      context,
      request.venueHealth,
      "request.venueHealth",
    )
  ) {
    const venueIds = new Set<string>();

    request.venueHealth.forEach((health, index) => {
      const result = validateArbitrageVenueHealth(
        health as ArbitrageVenueHealth,
      );

      result.issues.forEach((entry) => {
        issue(
          context,
          `request.venueHealth[${index}].${entry.path.replace(
            /^health\.?/,
            "",
          )}`,
          entry.code,
          entry.message,
        );
      });

      if (isRecord(health) && typeof health.venueId === "string") {
        if (venueIds.has(health.venueId)) {
          issue(
            context,
            `request.venueHealth[${index}].venueId`,
            "DUPLICATE",
            "Venue health entries must be unique by venueId.",
          );
        }

        venueIds.add(health.venueId);
      }
    });
  }

  const requestedTypes = new Set(request.context.enabledTypes);
  const configuredTypes = new Set(request.configuration.enabledTypes);

  requestedTypes.forEach((type) => {
    if (!configuredTypes.has(type)) {
      issue(
        context,
        "request.context.enabledTypes",
        "INCONSISTENT",
        `Requested type ${type} is not enabled in configuration.`,
      );
    }
  });

  if (
    request.configuration.emergencyShutdownActive ||
    request.configuration.circuitBreakerActive
  ) {
    issue(
      context,
      "request.configuration",
      "RISK_POLICY_VIOLATION",
      "Arbitrage orchestration cannot start while shutdown controls are active.",
    );
  }

  return finalize(context);
}

export function assertInstitutionalArbitrageOrchestratorRequest(
  request: InstitutionalArbitrageOrchestratorRequest,
): void {
  assertValid(
    validateInstitutionalArbitrageOrchestratorRequest(request),
    "Invalid institutional arbitrage orchestrator request.",
  );
}