/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-liquidity-engine.ts
 *
 * Purpose:
 * Deterministic and immutable liquidity assessment for institutional
 * arbitrage legs and market opportunities.
 */

import {
  type ArbitrageDecimal,
  type ArbitrageLeg,
  type ArbitrageLiquidityAssessment,
  type ArbitrageMarketSnapshot,
  type ArbitragePercentage,
  type ArbitrageSide,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";

const DEFAULT_DECIMAL_PLACES = 12;
const PERCENTAGE_MULTIPLIER = 100;

export interface ArbitrageLiquidityLevel {
  readonly price: ArbitrageDecimal;
  readonly quantity: ArbitrageDecimal;
}

export interface ArbitrageLiquidityBook {
  readonly bids: readonly ArbitrageLiquidityLevel[];
  readonly asks: readonly ArbitrageLiquidityLevel[];
  readonly sourceTimestamp?: number;
  readonly observedAt?: number;
}

export interface ArbitrageLiquidityEngineOptions {
  readonly minimumFillPercentage?: ArbitragePercentage;
  readonly maximumLiquidityUtilizationPercentage?: ArbitragePercentage;
  readonly maximumDepthLevels?: number;
  readonly quantityBufferPercentage?: ArbitragePercentage;
  readonly notionalBufferPercentage?: ArbitragePercentage;
  readonly decimalPlaces?: number;
}

export interface ArbitrageLiquidityAssessmentInput {
  readonly side: ArbitrageSide;
  readonly requestedQuantity: ArbitrageDecimal;
  readonly referencePrice?: ArbitrageDecimal;
  readonly marketSnapshot?: ArbitrageMarketSnapshot;
  readonly orderBook?: ArbitrageLiquidityBook;
  readonly availableQuantity?: ArbitrageDecimal;
  readonly availableNotional?: ArbitrageDecimal;
}

export interface ArbitrageLegLiquidityInput {
  readonly leg: ArbitrageLeg;
  readonly marketSnapshot?: ArbitrageMarketSnapshot;
  readonly orderBook?: ArbitrageLiquidityBook;
  readonly availableQuantity?: ArbitrageDecimal;
  readonly availableNotional?: ArbitrageDecimal;
}

export interface ArbitrageOpportunityLiquidityInput {
  readonly opportunity: InstitutionalArbitrageOpportunity;
  readonly inputsByLegId?: Readonly<
    Record<
      string,
      | Omit<ArbitrageLegLiquidityInput, "leg">
      | undefined
    >
  >;
}

export interface ArbitrageOpportunityLiquidityResult {
  readonly sufficient: boolean;
  readonly totalRequestedNotional: ArbitrageDecimal;
  readonly totalExecutableNotional: ArbitrageDecimal;
  readonly minimumFillPercentage: ArbitragePercentage;
  readonly maximumLiquidityUtilizationPercentage: ArbitragePercentage;
  readonly maximumDepthLevelsConsumed: number;
  readonly insufficientLegIds: readonly string[];
  readonly assessmentsByLegId: Readonly<
    Record<string, ArbitrageLiquidityAssessment>
  >;
}

export interface ArbitrageLiquidityPolicy {
  readonly minimumFillPercentage: ArbitragePercentage;
  readonly maximumLiquidityUtilizationPercentage: ArbitragePercentage;
  readonly maximumDepthLevelsConsumed: number;
}

export interface ArbitrageLiquidityPolicyAssessment {
  readonly accepted: boolean;
  readonly fillAccepted: boolean;
  readonly utilizationAccepted: boolean;
  readonly depthAccepted: boolean;
  readonly reasons: readonly string[];
}

interface NormalizedOptions {
  readonly minimumFillPercentage: ArbitragePercentage;
  readonly maximumLiquidityUtilizationPercentage: ArbitragePercentage;
  readonly maximumDepthLevels: number;
  readonly quantityBufferPercentage: ArbitragePercentage;
  readonly notionalBufferPercentage: ArbitragePercentage;
  readonly decimalPlaces: number;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  minimumFillPercentage: 100,
  maximumLiquidityUtilizationPercentage: 100,
  maximumDepthLevels: Number.MAX_SAFE_INTEGER,
  quantityBufferPercentage: 0,
  notionalBufferPercentage: 0,
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
});

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field);

  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to zero.`);
  }
}

function assertPositive(value: number, field: string): void {
  assertFinite(value, field);

  if (value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
}

function assertPercentage(value: number, field: string): void {
  assertFinite(value, field);

  if (value < 0 || value > 100) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
}

function assertInteger(value: number, field: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer greater than or equal to ${minimum}.`);
  }
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function normalizeOptions(
  options: ArbitrageLiquidityEngineOptions | undefined,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    minimumFillPercentage:
      options?.minimumFillPercentage ?? DEFAULT_OPTIONS.minimumFillPercentage,
    maximumLiquidityUtilizationPercentage:
      options?.maximumLiquidityUtilizationPercentage ??
      DEFAULT_OPTIONS.maximumLiquidityUtilizationPercentage,
    maximumDepthLevels:
      options?.maximumDepthLevels ?? DEFAULT_OPTIONS.maximumDepthLevels,
    quantityBufferPercentage:
      options?.quantityBufferPercentage ??
      DEFAULT_OPTIONS.quantityBufferPercentage,
    notionalBufferPercentage:
      options?.notionalBufferPercentage ??
      DEFAULT_OPTIONS.notionalBufferPercentage,
    decimalPlaces:
      options?.decimalPlaces ?? DEFAULT_OPTIONS.decimalPlaces,
  };

  assertPercentage(
    normalized.minimumFillPercentage,
    "minimumFillPercentage",
  );
  assertPercentage(
    normalized.maximumLiquidityUtilizationPercentage,
    "maximumLiquidityUtilizationPercentage",
  );
  assertPercentage(
    normalized.quantityBufferPercentage,
    "quantityBufferPercentage",
  );
  assertPercentage(
    normalized.notionalBufferPercentage,
    "notionalBufferPercentage",
  );
  assertInteger(normalized.maximumDepthLevels, "maximumDepthLevels", 1);

  if (
    !Number.isInteger(normalized.decimalPlaces) ||
    normalized.decimalPlaces < 0 ||
    normalized.decimalPlaces > 15
  ) {
    throw new Error("decimalPlaces must be an integer between 0 and 15.");
  }

  return freeze(normalized);
}

function isBuySide(side: ArbitrageSide): boolean {
  return side === "BUY" || side === "OPEN_LONG";
}

function isSellSide(side: ArbitrageSide): boolean {
  return side === "SELL" || side === "OPEN_SHORT";
}

function resolveLevels(
  side: ArbitrageSide,
  orderBook: ArbitrageLiquidityBook | undefined,
): readonly ArbitrageLiquidityLevel[] {
  if (orderBook === undefined) {
    return Object.freeze([]);
  }

  const levels = isBuySide(side)
    ? orderBook.asks
    : isSellSide(side)
      ? orderBook.bids
      : Object.freeze([]);

  return Object.freeze(
    [...levels]
      .map((level) =>
        freeze({
          price: level.price,
          quantity: level.quantity,
        }),
      )
      .sort((left, right) =>
        isBuySide(side)
          ? left.price - right.price
          : right.price - left.price,
      ),
  );
}

function validateLevels(levels: readonly ArbitrageLiquidityLevel[]): void {
  levels.forEach((level, index) => {
    assertPositive(level.price, `orderBook level ${index}.price`);
    assertNonNegative(level.quantity, `orderBook level ${index}.quantity`);
  });
}

function resolveReferencePrice(
  side: ArbitrageSide,
  input: ArbitrageLiquidityAssessmentInput,
): number | undefined {
  if (input.referencePrice !== undefined) {
    assertPositive(input.referencePrice, "referencePrice");
    return input.referencePrice;
  }

  const snapshot = input.marketSnapshot;

  if (snapshot === undefined) {
    return undefined;
  }

  const sidePrice = isBuySide(side)
    ? snapshot.askPrice
    : isSellSide(side)
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
  }

  return candidate;
}

function resolveSnapshotQuantity(
  side: ArbitrageSide,
  snapshot: ArbitrageMarketSnapshot | undefined,
): number | undefined {
  if (snapshot === undefined) {
    return undefined;
  }

  const quantity = isBuySide(side)
    ? snapshot.askQuantity
    : isSellSide(side)
      ? snapshot.bidQuantity
      : undefined;

  if (quantity !== undefined) {
    assertNonNegative(quantity, "marketSnapshot available quantity");
  }

  return quantity;
}

interface BookExecution {
  readonly executableQuantity: number;
  readonly executableNotional: number;
  readonly depthLevelsConsumed: number;
  readonly totalAvailableQuantity: number;
  readonly totalAvailableNotional: number;
}

function executeAgainstBook(
  levels: readonly ArbitrageLiquidityLevel[],
  requestedQuantity: number,
  decimalPlaces: number,
): BookExecution {
  let remainingQuantity = requestedQuantity;
  let executableQuantity = 0;
  let executableNotional = 0;
  let depthLevelsConsumed = 0;
  let totalAvailableQuantity = 0;
  let totalAvailableNotional = 0;

  for (const level of levels) {
    totalAvailableQuantity += level.quantity;
    totalAvailableNotional += level.quantity * level.price;

    if (remainingQuantity <= 0 || level.quantity <= 0) {
      continue;
    }

    const consumedQuantity = Math.min(remainingQuantity, level.quantity);

    executableQuantity += consumedQuantity;
    executableNotional += consumedQuantity * level.price;
    remainingQuantity -= consumedQuantity;
    depthLevelsConsumed += 1;
  }

  return freeze({
    executableQuantity: round(executableQuantity, decimalPlaces),
    executableNotional: round(executableNotional, decimalPlaces),
    depthLevelsConsumed,
    totalAvailableQuantity: round(totalAvailableQuantity, decimalPlaces),
    totalAvailableNotional: round(totalAvailableNotional, decimalPlaces),
  });
}

export class ArbitrageLiquidityEngine {
  private readonly options: NormalizedOptions;

  public constructor(options?: ArbitrageLiquidityEngineOptions) {
    this.options = normalizeOptions(options);
  }

  public getOptions(): Readonly<NormalizedOptions> {
    return this.options;
  }

  public assess(
    input: ArbitrageLiquidityAssessmentInput,
  ): ArbitrageLiquidityAssessment {
    assertNonNegative(input.requestedQuantity, "requestedQuantity");

    if (input.availableQuantity !== undefined) {
      assertNonNegative(input.availableQuantity, "availableQuantity");
    }

    if (input.availableNotional !== undefined) {
      assertNonNegative(input.availableNotional, "availableNotional");
    }

    const referencePrice = resolveReferencePrice(input.side, input);
    const levels = resolveLevels(input.side, input.orderBook);

    validateLevels(levels);

    const bufferedRequestedQuantity =
      input.requestedQuantity *
      (1 + this.options.quantityBufferPercentage / PERCENTAGE_MULTIPLIER);

    const requestedNotional =
      referencePrice === undefined
        ? 0
        : bufferedRequestedQuantity *
          referencePrice *
          (1 + this.options.notionalBufferPercentage / PERCENTAGE_MULTIPLIER);

    let executableQuantity = 0;
    let executableNotional = 0;
    let depthLevelsConsumed = 0;
    let totalAvailableQuantity = 0;
    let totalAvailableNotional = 0;

    if (levels.length > 0) {
      const bookExecution = executeAgainstBook(
        levels,
        bufferedRequestedQuantity,
        this.options.decimalPlaces,
      );

      executableQuantity = bookExecution.executableQuantity;
      executableNotional = bookExecution.executableNotional;
      depthLevelsConsumed = bookExecution.depthLevelsConsumed;
      totalAvailableQuantity = bookExecution.totalAvailableQuantity;
      totalAvailableNotional = bookExecution.totalAvailableNotional;
    } else {
      const snapshotQuantity = resolveSnapshotQuantity(
        input.side,
        input.marketSnapshot,
      );

      const availableQuantity =
        input.availableQuantity ?? snapshotQuantity ?? 0;

      executableQuantity = Math.min(
        bufferedRequestedQuantity,
        availableQuantity,
      );

      const fallbackPrice = referencePrice ?? 0;
      executableNotional = executableQuantity * fallbackPrice;
      totalAvailableQuantity = availableQuantity;
      totalAvailableNotional =
        input.availableNotional ?? availableQuantity * fallbackPrice;
      depthLevelsConsumed = executableQuantity > 0 ? 1 : 0;
    }

    if (input.availableQuantity !== undefined) {
      executableQuantity = Math.min(
        executableQuantity,
        input.availableQuantity,
      );
      totalAvailableQuantity = Math.min(
        totalAvailableQuantity,
        input.availableQuantity,
      );
    }

    if (input.availableNotional !== undefined) {
      executableNotional = Math.min(
        executableNotional,
        input.availableNotional,
      );
      totalAvailableNotional = Math.min(
        totalAvailableNotional,
        input.availableNotional,
      );
    }

    const requestedQuantity = round(
      bufferedRequestedQuantity,
      this.options.decimalPlaces,
    );

    const normalizedRequestedNotional = round(
      requestedNotional,
      this.options.decimalPlaces,
    );

    const normalizedExecutableQuantity = round(
      Math.min(executableQuantity, requestedQuantity),
      this.options.decimalPlaces,
    );

    const normalizedExecutableNotional = round(
      Math.min(
        executableNotional,
        normalizedRequestedNotional > 0
          ? normalizedRequestedNotional
          : executableNotional,
      ),
      this.options.decimalPlaces,
    );

    const fillPercentage =
      requestedQuantity === 0
        ? 100
        : (normalizedExecutableQuantity / requestedQuantity) *
          PERCENTAGE_MULTIPLIER;

    const quantityUtilization =
      totalAvailableQuantity <= 0
        ? requestedQuantity === 0
          ? 0
          : 100
        : (requestedQuantity / totalAvailableQuantity) *
          PERCENTAGE_MULTIPLIER;

    const notionalUtilization =
      totalAvailableNotional <= 0
        ? normalizedRequestedNotional === 0
          ? 0
          : 100
        : (normalizedRequestedNotional / totalAvailableNotional) *
          PERCENTAGE_MULTIPLIER;

    const liquidityUtilizationPercentage = round(
      clamp(
        Math.max(quantityUtilization, notionalUtilization),
        0,
        100,
      ),
      this.options.decimalPlaces,
    );

    const sufficient =
      fillPercentage >= this.options.minimumFillPercentage &&
      liquidityUtilizationPercentage <=
        this.options.maximumLiquidityUtilizationPercentage &&
      depthLevelsConsumed <= this.options.maximumDepthLevels;

    return freeze({
      requestedQuantity,
      executableQuantity: normalizedExecutableQuantity,
      requestedNotional: normalizedRequestedNotional,
      executableNotional: normalizedExecutableNotional,
      liquidityUtilizationPercentage,
      depthLevelsConsumed,
      sufficient,
    });
  }

  public assessLeg(
    input: ArbitrageLegLiquidityInput,
  ): ArbitrageLiquidityAssessment {
    return this.assess({
      side: input.leg.side,
      requestedQuantity: input.leg.inputQuantity,
      referencePrice: input.leg.expectedPrice,
      marketSnapshot: input.marketSnapshot,
      orderBook: input.orderBook,
      availableQuantity: input.availableQuantity,
      availableNotional: input.availableNotional,
    });
  }

  public assessOpportunity(
    input: ArbitrageOpportunityLiquidityInput,
  ): ArbitrageOpportunityLiquidityResult {
    const assessmentsByLegId: Record<
      string,
      ArbitrageLiquidityAssessment
    > = {};

    const insufficientLegIds: string[] = [];
    let totalRequestedNotional = 0;
    let totalExecutableNotional = 0;
    let minimumFillPercentage = 100;
    let maximumLiquidityUtilizationPercentage = 0;
    let maximumDepthLevelsConsumed = 0;

    for (const leg of input.opportunity.legs) {
      const legInput = input.inputsByLegId?.[leg.legId];

      const assessment = this.assessLeg({
        leg,
        marketSnapshot: legInput?.marketSnapshot,
        orderBook: legInput?.orderBook,
        availableQuantity: legInput?.availableQuantity,
        availableNotional: legInput?.availableNotional,
      });

      assessmentsByLegId[leg.legId] = assessment;
      totalRequestedNotional += assessment.requestedNotional;
      totalExecutableNotional += assessment.executableNotional;

      const fillPercentage =
        assessment.requestedQuantity === 0
          ? 100
          : (assessment.executableQuantity /
              assessment.requestedQuantity) *
            PERCENTAGE_MULTIPLIER;

      minimumFillPercentage = Math.min(
        minimumFillPercentage,
        fillPercentage,
      );

      maximumLiquidityUtilizationPercentage = Math.max(
        maximumLiquidityUtilizationPercentage,
        assessment.liquidityUtilizationPercentage,
      );

      maximumDepthLevelsConsumed = Math.max(
        maximumDepthLevelsConsumed,
        assessment.depthLevelsConsumed,
      );

      if (!assessment.sufficient) {
        insufficientLegIds.push(leg.legId);
      }
    }

    return freeze({
      sufficient: insufficientLegIds.length === 0,
      totalRequestedNotional: round(
        totalRequestedNotional,
        this.options.decimalPlaces,
      ),
      totalExecutableNotional: round(
        totalExecutableNotional,
        this.options.decimalPlaces,
      ),
      minimumFillPercentage: round(
        minimumFillPercentage,
        this.options.decimalPlaces,
      ),
      maximumLiquidityUtilizationPercentage: round(
        maximumLiquidityUtilizationPercentage,
        this.options.decimalPlaces,
      ),
      maximumDepthLevelsConsumed,
      insufficientLegIds: Object.freeze([...insufficientLegIds]),
      assessmentsByLegId: freeze({ ...assessmentsByLegId }),
    });
  }

  public assessPolicy(
    result: ArbitrageOpportunityLiquidityResult,
    policy: ArbitrageLiquidityPolicy,
  ): ArbitrageLiquidityPolicyAssessment {
    assertPercentage(
      policy.minimumFillPercentage,
      "policy.minimumFillPercentage",
    );
    assertPercentage(
      policy.maximumLiquidityUtilizationPercentage,
      "policy.maximumLiquidityUtilizationPercentage",
    );
    assertInteger(
      policy.maximumDepthLevelsConsumed,
      "policy.maximumDepthLevelsConsumed",
      1,
    );

    const fillAccepted =
      result.minimumFillPercentage >= policy.minimumFillPercentage;

    const utilizationAccepted =
      result.maximumLiquidityUtilizationPercentage <=
      policy.maximumLiquidityUtilizationPercentage;

    const depthAccepted =
      result.maximumDepthLevelsConsumed <=
      policy.maximumDepthLevelsConsumed;

    const reasons: string[] = [];

    if (!fillAccepted) {
      reasons.push(
        `Minimum fill ${result.minimumFillPercentage}% is below policy minimum ${policy.minimumFillPercentage}%.`,
      );
    }

    if (!utilizationAccepted) {
      reasons.push(
        `Maximum liquidity utilization ${result.maximumLiquidityUtilizationPercentage}% exceeds policy maximum ${policy.maximumLiquidityUtilizationPercentage}%.`,
      );
    }

    if (!depthAccepted) {
      reasons.push(
        `Maximum depth levels consumed ${result.maximumDepthLevelsConsumed} exceeds policy maximum ${policy.maximumDepthLevelsConsumed}.`,
      );
    }

    if (!result.sufficient && result.insufficientLegIds.length > 0) {
      reasons.push(
        `Insufficient liquidity for legs: ${result.insufficientLegIds.join(", ")}.`,
      );
    }

    return freeze({
      accepted:
        result.sufficient &&
        fillAccepted &&
        utilizationAccepted &&
        depthAccepted,
      fillAccepted,
      utilizationAccepted,
      depthAccepted,
      reasons: Object.freeze(reasons),
    });
  }

  public recalculateLeg(
    input: ArbitrageLegLiquidityInput,
  ): ArbitrageLeg {
    const liquidity = this.assessLeg(input);

    return freeze({
      ...input.leg,
      liquidity,
      dependencyLegIds: Object.freeze([
        ...input.leg.dependencyLegIds,
      ]),
      metadata: freeze({ ...input.leg.metadata }),
    });
  }

  public recalculateOpportunity(
    input: ArbitrageOpportunityLiquidityInput,
  ): InstitutionalArbitrageOpportunity {
    const legs = input.opportunity.legs.map((leg) =>
      this.recalculateLeg({
        leg,
        marketSnapshot:
          input.inputsByLegId?.[leg.legId]?.marketSnapshot,
        orderBook: input.inputsByLegId?.[leg.legId]?.orderBook,
        availableQuantity:
          input.inputsByLegId?.[leg.legId]?.availableQuantity,
        availableNotional:
          input.inputsByLegId?.[leg.legId]?.availableNotional,
      }),
    );

    return freeze({
      ...input.opportunity,
      legs: Object.freeze(legs),
      accountIds: Object.freeze([
        ...input.opportunity.accountIds,
      ]),
      transfers: Object.freeze([
        ...input.opportunity.transfers,
      ]),
      metadata: freeze({ ...input.opportunity.metadata }),
    }) as InstitutionalArbitrageOpportunity;
  }
}

export function createArbitrageLiquidityEngine(
  options?: ArbitrageLiquidityEngineOptions,
): ArbitrageLiquidityEngine {
  return new ArbitrageLiquidityEngine(options);
}

export function assessArbitrageLiquidity(
  input: ArbitrageLiquidityAssessmentInput,
  options?: ArbitrageLiquidityEngineOptions,
): ArbitrageLiquidityAssessment {
  return createArbitrageLiquidityEngine(options).assess(input);
}

export function assessArbitrageLegLiquidity(
  input: ArbitrageLegLiquidityInput,
  options?: ArbitrageLiquidityEngineOptions,
): ArbitrageLiquidityAssessment {
  return createArbitrageLiquidityEngine(options).assessLeg(input);
}

export function assessArbitrageOpportunityLiquidity(
  input: ArbitrageOpportunityLiquidityInput,
  options?: ArbitrageLiquidityEngineOptions,
): ArbitrageOpportunityLiquidityResult {
  return createArbitrageLiquidityEngine(options).assessOpportunity(input);
}