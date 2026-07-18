/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 8: Realized PnL Engine
 *
 * Calculates deterministic realized profit and loss from normalized execution
 * events. The engine supports partial closes, full closes, position reversals,
 * fees, funding adjustments, and immutable calculation results.
 */

import type {
  LivePortfolioInstrumentType,
  LivePortfolioMetadata,
  LivePortfolioPositionSide,
} from "./live-portfolio";

export type RealizedPnlExecutionSide =
  | "BUY"
  | "SELL";

export type RealizedPnlEventType =
  | "TRADE"
  | "FUNDING"
  | "FEE"
  | "ADJUSTMENT";

export type RealizedPnlCalculationStatus =
  | "APPLIED"
  | "IGNORED"
  | "DUPLICATE";

export interface RealizedPnlExecutionEvent {
  readonly eventId: string;
  readonly eventType: RealizedPnlEventType;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly positionId: string;
  readonly symbol: string;

  readonly instrumentType: LivePortfolioInstrumentType;

  readonly executionSide: RealizedPnlExecutionSide | null;

  readonly quantity: number;
  readonly price: number | null;

  readonly contractMultiplier: number;

  readonly fee: number;
  readonly funding: number;
  readonly adjustment: number;

  readonly occurredAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealizedPnlPositionSeed {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly instrumentType: LivePortfolioInstrumentType;

  readonly side: LivePortfolioPositionSide;
  readonly quantity: number;
  readonly averageEntryPrice: number;

  readonly contractMultiplier: number;

  readonly grossRealizedPnl: number;
  readonly feePnl: number;
  readonly fundingPnl: number;
  readonly adjustmentPnl: number;
  readonly netRealizedPnl: number;

  readonly openedAt: number | null;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealizedPnlCalculationPolicy {
  /**
   * When true, duplicate event identifiers cause an exception.
   * Otherwise, duplicate events are returned with DUPLICATE status.
   */
  readonly rejectDuplicateEvents: boolean;

  /**
   * When true, trade events with zero quantity cause an exception.
   * Otherwise, they are ignored.
   */
  readonly rejectZeroQuantityTrades: boolean;

  /**
   * When true, events must be ordered by occurredAt and sequence.
   */
  readonly requireChronologicalOrdering: boolean;

  /**
   * Numerical tolerance used when resolving zero position quantities.
   */
  readonly quantityTolerance: number;
}

export interface RealizedPnlCalculationRequest {
  readonly portfolioId: string;
  readonly synchronizationId: string;

  readonly positions: readonly RealizedPnlPositionSeed[];
  readonly events: readonly RealizedPnlExecutionEvent[];

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly policy?: RealizedPnlCalculationPolicy;
  readonly metadata?: LivePortfolioMetadata;
}

export interface RealizedPnlEventResult {
  readonly eventId: string;
  readonly eventType: RealizedPnlEventType;
  readonly status: RealizedPnlCalculationStatus;

  readonly exchangeId: string;
  readonly accountId: string;
  readonly positionId: string;
  readonly symbol: string;

  readonly executionSide: RealizedPnlExecutionSide | null;

  readonly quantity: number;
  readonly price: number | null;

  readonly closedQuantity: number;
  readonly openedQuantity: number;

  readonly grossRealizedPnl: number;
  readonly feePnl: number;
  readonly fundingPnl: number;
  readonly adjustmentPnl: number;
  readonly netRealizedPnl: number;

  readonly previousPositionSide: LivePortfolioPositionSide | null;
  readonly currentPositionSide: LivePortfolioPositionSide | null;

  readonly previousPositionQuantity: number;
  readonly currentPositionQuantity: number;

  readonly previousAverageEntryPrice: number | null;
  readonly currentAverageEntryPrice: number | null;

  readonly occurredAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealizedPnlPositionResult {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly instrumentType: LivePortfolioInstrumentType;

  readonly side: LivePortfolioPositionSide | null;
  readonly quantity: number;
  readonly averageEntryPrice: number | null;

  readonly contractMultiplier: number;

  readonly grossRealizedPnl: number;
  readonly feePnl: number;
  readonly fundingPnl: number;
  readonly adjustmentPnl: number;
  readonly netRealizedPnl: number;

  readonly tradeEventCount: number;
  readonly fundingEventCount: number;
  readonly feeEventCount: number;
  readonly adjustmentEventCount: number;

  readonly openedAt: number | null;
  readonly closedAt: number | null;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealizedPnlTotals {
  readonly positionCount: number;
  readonly openPositionCount: number;
  readonly closedPositionCount: number;

  readonly eventCount: number;
  readonly appliedEventCount: number;
  readonly ignoredEventCount: number;
  readonly duplicateEventCount: number;

  readonly tradeEventCount: number;
  readonly fundingEventCount: number;
  readonly feeEventCount: number;
  readonly adjustmentEventCount: number;

  readonly grossRealizedPnl: number;
  readonly feePnl: number;
  readonly fundingPnl: number;
  readonly adjustmentPnl: number;
  readonly netRealizedPnl: number;

  readonly profitablePositionCount: number;
  readonly losingPositionCount: number;
  readonly flatPositionCount: number;
}

export interface RealizedPnlCalculationResult {
  readonly portfolioId: string;
  readonly synchronizationId: string;

  readonly positions: readonly RealizedPnlPositionResult[];
  readonly events: readonly RealizedPnlEventResult[];

  readonly totals: RealizedPnlTotals;

  readonly calculatedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface RealizedPnlEngine {
  calculate(
    request: RealizedPnlCalculationRequest,
  ): RealizedPnlCalculationResult;
}

interface MutablePositionState {
  readonly positionId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly symbol: string;
  readonly instrumentType: LivePortfolioInstrumentType;

  side: LivePortfolioPositionSide | null;
  quantity: number;
  averageEntryPrice: number | null;

  readonly contractMultiplier: number;

  grossRealizedPnl: number;
  feePnl: number;
  fundingPnl: number;
  adjustmentPnl: number;
  netRealizedPnl: number;

  tradeEventCount: number;
  fundingEventCount: number;
  feeEventCount: number;
  adjustmentEventCount: number;

  openedAt: number | null;
  closedAt: number | null;
  updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${field} must be an object.`);
  }
}

function assertNonEmptyString(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} must be a non-empty string.`,
    );
  }
}

function assertFiniteNumber(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${field} must be a finite number.`,
    );
  }
}

function assertNonNegativeFiniteNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function assertPositiveFiniteNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive finite number.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive integer.`,
    );
  }
}

function normalizeIdentifier(
  value: string,
  field: string,
): string {
  assertNonEmptyString(
    value,
    field,
  );

  return value.trim();
}

function normalizeSymbol(
  value: string,
  field: string,
): string {
  return normalizeIdentifier(
    value,
    field,
  ).toUpperCase();
}

function freezeMetadata(
  metadata: LivePortfolioMetadata | undefined,
): LivePortfolioMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  const result: Record<
    string,
    string | number | boolean | null
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    assertNonEmptyString(
      key,
      "metadata key",
    );

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        `metadata.${key} contains an unsupported value.`,
      );
    }

    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `metadata.${key} must be finite.`,
      );
    }

    result[key] = value;
  }

  return Object.freeze(result);
}

function createPositionKey(
  exchangeId: string,
  accountId: string,
  positionId: string,
): string {
  return [
    exchangeId,
    accountId,
    positionId,
  ].join("\u0000");
}

function resolvePolicy(
  policy: RealizedPnlCalculationPolicy | undefined,
): RealizedPnlCalculationPolicy {
  const resolved =
    policy ?? {
      rejectDuplicateEvents: false,
      rejectZeroQuantityTrades: false,
      requireChronologicalOrdering: true,
      quantityTolerance: 1e-12,
    };

  assertObject(
    resolved,
    "policy",
  );

  assertNonNegativeFiniteNumber(
    resolved.quantityTolerance,
    "policy.quantityTolerance",
  );

  return Object.freeze({
    rejectDuplicateEvents:
      resolved.rejectDuplicateEvents,

    rejectZeroQuantityTrades:
      resolved.rejectZeroQuantityTrades,

    requireChronologicalOrdering:
      resolved.requireChronologicalOrdering,

    quantityTolerance:
      resolved.quantityTolerance,
  });
}

function normalizeSeed(
  seed: RealizedPnlPositionSeed,
  index: number,
): RealizedPnlPositionSeed {
  assertObject(
    seed,
    `positions[${index}]`,
  );

  const positionId =
    normalizeIdentifier(
      seed.positionId,
      `positions[${index}].positionId`,
    );

  const exchangeId =
    normalizeIdentifier(
      seed.exchangeId,
      `positions[${index}].exchangeId`,
    );

  const accountId =
    normalizeIdentifier(
      seed.accountId,
      `positions[${index}].accountId`,
    );

  const symbol =
    normalizeSymbol(
      seed.symbol,
      `positions[${index}].symbol`,
    );

  assertNonNegativeFiniteNumber(
    seed.quantity,
    `positions[${index}].quantity`,
  );

  assertNonNegativeFiniteNumber(
    seed.averageEntryPrice,
    `positions[${index}].averageEntryPrice`,
  );

  assertPositiveFiniteNumber(
    seed.contractMultiplier,
    `positions[${index}].contractMultiplier`,
  );

  assertFiniteNumber(
    seed.grossRealizedPnl,
    `positions[${index}].grossRealizedPnl`,
  );

  assertFiniteNumber(
    seed.feePnl,
    `positions[${index}].feePnl`,
  );

  assertFiniteNumber(
    seed.fundingPnl,
    `positions[${index}].fundingPnl`,
  );

  assertFiniteNumber(
    seed.adjustmentPnl,
    `positions[${index}].adjustmentPnl`,
  );

  assertFiniteNumber(
    seed.netRealizedPnl,
    `positions[${index}].netRealizedPnl`,
  );

  if (
    seed.openedAt !== null
  ) {
    assertNonNegativeFiniteNumber(
      seed.openedAt,
      `positions[${index}].openedAt`,
    );
  }

  assertNonNegativeFiniteNumber(
    seed.updatedAt,
    `positions[${index}].updatedAt`,
  );

  if (
    seed.openedAt !== null &&
    seed.openedAt > seed.updatedAt
  ) {
    throw new Error(
      `positions[${index}].openedAt cannot be later than updatedAt.`,
    );
  }

  if (
    seed.quantity > 0 &&
    seed.averageEntryPrice === 0
  ) {
    throw new Error(
      `positions[${index}].averageEntryPrice must be greater than zero for an open position.`,
    );
  }

  return Object.freeze({
    positionId,
    exchangeId,
    accountId,
    symbol,

    instrumentType:
      seed.instrumentType,

    side:
      seed.side,

    quantity:
      seed.quantity,

    averageEntryPrice:
      seed.averageEntryPrice,

    contractMultiplier:
      seed.contractMultiplier,

    grossRealizedPnl:
      seed.grossRealizedPnl,

    feePnl:
      seed.feePnl,

    fundingPnl:
      seed.fundingPnl,

    adjustmentPnl:
      seed.adjustmentPnl,

    netRealizedPnl:
      seed.netRealizedPnl,

    openedAt:
      seed.openedAt,

    updatedAt:
      seed.updatedAt,

    metadata:
      freezeMetadata(
        seed.metadata,
      ),
  });
}

function normalizeEvent(
  event: RealizedPnlExecutionEvent,
  index: number,
): RealizedPnlExecutionEvent {
  assertObject(
    event,
    `events[${index}]`,
  );

  const eventId =
    normalizeIdentifier(
      event.eventId,
      `events[${index}].eventId`,
    );

  const exchangeId =
    normalizeIdentifier(
      event.exchangeId,
      `events[${index}].exchangeId`,
    );

  const accountId =
    normalizeIdentifier(
      event.accountId,
      `events[${index}].accountId`,
    );

  const positionId =
    normalizeIdentifier(
      event.positionId,
      `events[${index}].positionId`,
    );

  const symbol =
    normalizeSymbol(
      event.symbol,
      `events[${index}].symbol`,
    );

  assertNonNegativeFiniteNumber(
    event.quantity,
    `events[${index}].quantity`,
  );

  if (
    event.price !== null
  ) {
    assertPositiveFiniteNumber(
      event.price,
      `events[${index}].price`,
    );
  }

  assertPositiveFiniteNumber(
    event.contractMultiplier,
    `events[${index}].contractMultiplier`,
  );

  assertFiniteNumber(
    event.fee,
    `events[${index}].fee`,
  );

  assertFiniteNumber(
    event.funding,
    `events[${index}].funding`,
  );

  assertFiniteNumber(
    event.adjustment,
    `events[${index}].adjustment`,
  );

  assertNonNegativeFiniteNumber(
    event.occurredAt,
    `events[${index}].occurredAt`,
  );

  assertPositiveInteger(
    event.sequence,
    `events[${index}].sequence`,
  );

  if (
    event.eventType === "TRADE" &&
    event.executionSide === null
  ) {
    throw new Error(
      `events[${index}].executionSide is required for TRADE events.`,
    );
  }

  if (
    event.eventType === "TRADE" &&
    event.price === null
  ) {
    throw new Error(
      `events[${index}].price is required for TRADE events.`,
    );
  }

  return Object.freeze({
    eventId,
    eventType:
      event.eventType,

    exchangeId,
    accountId,
    positionId,
    symbol,

    instrumentType:
      event.instrumentType,

    executionSide:
      event.executionSide,

    quantity:
      event.quantity,

    price:
      event.price,

    contractMultiplier:
      event.contractMultiplier,

    fee:
      event.fee,

    funding:
      event.funding,

    adjustment:
      event.adjustment,

    occurredAt:
      event.occurredAt,

    sequence:
      event.sequence,

    metadata:
      freezeMetadata(
        event.metadata,
      ),
  });
}

function executionSideToPositionSide(
  executionSide: RealizedPnlExecutionSide,
): LivePortfolioPositionSide {
  return executionSide === "BUY"
    ? "LONG"
    : "SHORT";
}

function isClosingExecution(
  positionSide: LivePortfolioPositionSide,
  executionSide: RealizedPnlExecutionSide,
): boolean {
  return (
    positionSide === "LONG"
      ? executionSide === "SELL"
      : executionSide === "BUY"
  );
}

function calculateGrossRealizedPnl(
  positionSide: LivePortfolioPositionSide,
  closedQuantity: number,
  averageEntryPrice: number,
  executionPrice: number,
  contractMultiplier: number,
): number {
  const priceDifference =
    positionSide === "LONG"
      ? executionPrice -
        averageEntryPrice
      : averageEntryPrice -
        executionPrice;

  return (
    priceDifference *
    closedQuantity *
    contractMultiplier
  );
}

function calculateWeightedAverageEntryPrice(
  currentQuantity: number,
  currentAverageEntryPrice: number,
  addedQuantity: number,
  addedPrice: number,
): number {
  const resultingQuantity =
    currentQuantity +
    addedQuantity;

  if (resultingQuantity === 0) {
    return 0;
  }

  return (
    (
      currentQuantity *
      currentAverageEntryPrice
    ) +
    (
      addedQuantity *
      addedPrice
    )
  ) / resultingQuantity;
}

function createMutablePositionState(
  seed: RealizedPnlPositionSeed,
): MutablePositionState {
  return {
    positionId:
      seed.positionId,

    exchangeId:
      seed.exchangeId,

    accountId:
      seed.accountId,

    symbol:
      seed.symbol,

    instrumentType:
      seed.instrumentType,

    side:
      seed.quantity === 0
        ? null
        : seed.side,

    quantity:
      seed.quantity,

    averageEntryPrice:
      seed.quantity === 0
        ? null
        : seed.averageEntryPrice,

    contractMultiplier:
      seed.contractMultiplier,

    grossRealizedPnl:
      seed.grossRealizedPnl,

    feePnl:
      seed.feePnl,

    fundingPnl:
      seed.fundingPnl,

    adjustmentPnl:
      seed.adjustmentPnl,

    netRealizedPnl:
      seed.netRealizedPnl,

    tradeEventCount:
      0,

    fundingEventCount:
      0,

    feeEventCount:
      0,

    adjustmentEventCount:
      0,

    openedAt:
      seed.openedAt,

    closedAt:
      null,

    updatedAt:
      seed.updatedAt,

    metadata:
      seed.metadata,
  };
}

function createEmptyMutablePositionState(
  event: RealizedPnlExecutionEvent,
): MutablePositionState {
  return {
    positionId:
      event.positionId,

    exchangeId:
      event.exchangeId,

    accountId:
      event.accountId,

    symbol:
      event.symbol,

    instrumentType:
      event.instrumentType,

    side:
      null,

    quantity:
      0,

    averageEntryPrice:
      null,

    contractMultiplier:
      event.contractMultiplier,

    grossRealizedPnl:
      0,

    feePnl:
      0,

    fundingPnl:
      0,

    adjustmentPnl:
      0,

    netRealizedPnl:
      0,

    tradeEventCount:
      0,

    fundingEventCount:
      0,

    feeEventCount:
      0,

    adjustmentEventCount:
      0,

    openedAt:
      null,

    closedAt:
      null,

    updatedAt:
      event.occurredAt,

    metadata:
      Object.freeze({}),
  };
}

function applyNonTradeEvent(
  state: MutablePositionState,
  event: RealizedPnlExecutionEvent,
): Readonly<{
  feePnl: number;
  fundingPnl: number;
  adjustmentPnl: number;
  netRealizedPnl: number;
}> {
  let feePnl = 0;
  let fundingPnl = 0;
  let adjustmentPnl = 0;

  switch (event.eventType) {
    case "FEE":
      feePnl =
        event.fee;

      state.feeEventCount += 1;
      break;

    case "FUNDING":
      fundingPnl =
        event.funding;

      state.fundingEventCount += 1;
      break;

    case "ADJUSTMENT":
      adjustmentPnl =
        event.adjustment;

      state.adjustmentEventCount += 1;
      break;

    case "TRADE":
      throw new Error(
        "applyNonTradeEvent cannot process TRADE events.",
      );
  }

  const netRealizedPnl =
    feePnl +
    fundingPnl +
    adjustmentPnl;

  state.feePnl +=
    feePnl;

  state.fundingPnl +=
    fundingPnl;

  state.adjustmentPnl +=
    adjustmentPnl;

  state.netRealizedPnl +=
    netRealizedPnl;

  state.updatedAt =
    event.occurredAt;

  return Object.freeze({
    feePnl,
    fundingPnl,
    adjustmentPnl,
    netRealizedPnl,
  });
}

function applyTradeEvent(
  state: MutablePositionState,
  event: RealizedPnlExecutionEvent,
  quantityTolerance: number,
): Readonly<{
  closedQuantity: number;
  openedQuantity: number;
  grossRealizedPnl: number;
  feePnl: number;
  fundingPnl: number;
  adjustmentPnl: number;
  netRealizedPnl: number;
}> {
  if (
    event.executionSide === null ||
    event.price === null
  ) {
    throw new Error(
      "TRADE event requires executionSide and price.",
    );
  }

  const previousQuantity =
    state.quantity;

  const previousSide =
    state.side;

  let closedQuantity = 0;
  let openedQuantity = 0;
  let grossRealizedPnl = 0;

  if (
    previousSide === null ||
    previousQuantity <= quantityTolerance
  ) {
    openedQuantity =
      event.quantity;

    state.side =
      executionSideToPositionSide(
        event.executionSide,
      );

    state.quantity =
      event.quantity;

    state.averageEntryPrice =
      event.quantity <= quantityTolerance
        ? null
        : event.price;

    state.openedAt =
      event.quantity <= quantityTolerance
        ? state.openedAt
        : event.occurredAt;

    state.closedAt =
      null;
  } else if (
    !isClosingExecution(
      previousSide,
      event.executionSide,
    )
  ) {
    openedQuantity =
      event.quantity;

    state.averageEntryPrice =
      calculateWeightedAverageEntryPrice(
        previousQuantity,
        state.averageEntryPrice ?? 0,
        event.quantity,
        event.price,
      );

    state.quantity =
      previousQuantity +
      event.quantity;
  } else {
    closedQuantity =
      Math.min(
        previousQuantity,
        event.quantity,
      );

    grossRealizedPnl =
      calculateGrossRealizedPnl(
        previousSide,
        closedQuantity,
        state.averageEntryPrice ?? 0,
        event.price,
        state.contractMultiplier,
      );

    const remainingExistingQuantity =
      previousQuantity -
      closedQuantity;

    const reversalQuantity =
      event.quantity -
      closedQuantity;

    if (
      remainingExistingQuantity >
      quantityTolerance
    ) {
      state.quantity =
        remainingExistingQuantity;
    } else if (
      reversalQuantity >
      quantityTolerance
    ) {
      openedQuantity =
        reversalQuantity;

      state.side =
        executionSideToPositionSide(
          event.executionSide,
        );

      state.quantity =
        reversalQuantity;

      state.averageEntryPrice =
        event.price;

      state.openedAt =
        event.occurredAt;

      state.closedAt =
        null;
    } else {
      state.side =
        null;

      state.quantity =
        0;

      state.averageEntryPrice =
        null;

      state.closedAt =
        event.occurredAt;
    }
  }

  if (
    state.quantity <= quantityTolerance
  ) {
    state.quantity = 0;

    state.side = null;

    state.averageEntryPrice = null;
  }

  const feePnl =
    event.fee;

  const fundingPnl =
    event.funding;

  const adjustmentPnl =
    event.adjustment;

  const netRealizedPnl =
    grossRealizedPnl +
    feePnl +
    fundingPnl +
    adjustmentPnl;

  state.grossRealizedPnl +=
    grossRealizedPnl;

  state.feePnl +=
    feePnl;

  state.fundingPnl +=
    fundingPnl;

  state.adjustmentPnl +=
    adjustmentPnl;

  state.netRealizedPnl +=
    netRealizedPnl;

  state.tradeEventCount += 1;

  state.updatedAt =
    event.occurredAt;

  return Object.freeze({
    closedQuantity,
    openedQuantity,
    grossRealizedPnl,
    feePnl,
    fundingPnl,
    adjustmentPnl,
    netRealizedPnl,
  });
}

function createDuplicateEventResult(
  event: RealizedPnlExecutionEvent,
  state: MutablePositionState,
): RealizedPnlEventResult {
  return Object.freeze({
    eventId:
      event.eventId,

    eventType:
      event.eventType,

    status:
      "DUPLICATE",

    exchangeId:
      event.exchangeId,

    accountId:
      event.accountId,

    positionId:
      event.positionId,

    symbol:
      event.symbol,

    executionSide:
      event.executionSide,

    quantity:
      event.quantity,

    price:
      event.price,

    closedQuantity:
      0,

    openedQuantity:
      0,

    grossRealizedPnl:
      0,

    feePnl:
      0,

    fundingPnl:
      0,

    adjustmentPnl:
      0,

    netRealizedPnl:
      0,

    previousPositionSide:
      state.side,

    currentPositionSide:
      state.side,

    previousPositionQuantity:
      state.quantity,

    currentPositionQuantity:
      state.quantity,

    previousAverageEntryPrice:
      state.averageEntryPrice,

    currentAverageEntryPrice:
      state.averageEntryPrice,

    occurredAt:
      event.occurredAt,

    sequence:
      event.sequence,

    metadata:
      freezeMetadata({
        reason:
          "Duplicate event identifier.",
      }),
  });
}

function createIgnoredTradeEventResult(
  event: RealizedPnlExecutionEvent,
  state: MutablePositionState,
): RealizedPnlEventResult {
  return Object.freeze({
    eventId:
      event.eventId,

    eventType:
      event.eventType,

    status:
      "IGNORED",

    exchangeId:
      event.exchangeId,

    accountId:
      event.accountId,

    positionId:
      event.positionId,

    symbol:
      event.symbol,

    executionSide:
      event.executionSide,

    quantity:
      event.quantity,

    price:
      event.price,

    closedQuantity:
      0,

    openedQuantity:
      0,

    grossRealizedPnl:
      0,

    feePnl:
      0,

    fundingPnl:
      0,

    adjustmentPnl:
      0,

    netRealizedPnl:
      0,

    previousPositionSide:
      state.side,

    currentPositionSide:
      state.side,

    previousPositionQuantity:
      state.quantity,

    currentPositionQuantity:
      state.quantity,

    previousAverageEntryPrice:
      state.averageEntryPrice,

    currentAverageEntryPrice:
      state.averageEntryPrice,

    occurredAt:
      event.occurredAt,

    sequence:
      event.sequence,

    metadata:
      freezeMetadata({
        reason:
          "Zero-quantity trade event.",
      }),
  });
}

function createAppliedEventResult(
  event: RealizedPnlExecutionEvent,
  previousSide: LivePortfolioPositionSide | null,
  previousQuantity: number,
  previousAverageEntryPrice: number | null,
  state: MutablePositionState,
  values: Readonly<{
    closedQuantity: number;
    openedQuantity: number;
    grossRealizedPnl: number;
    feePnl: number;
    fundingPnl: number;
    adjustmentPnl: number;
    netRealizedPnl: number;
  }>,
): RealizedPnlEventResult {
  return Object.freeze({
    eventId:
      event.eventId,

    eventType:
      event.eventType,

    status:
      "APPLIED",

    exchangeId:
      event.exchangeId,

    accountId:
      event.accountId,

    positionId:
      event.positionId,

    symbol:
      event.symbol,

    executionSide:
      event.executionSide,

    quantity:
      event.quantity,

    price:
      event.price,

    closedQuantity:
      values.closedQuantity,

    openedQuantity:
      values.openedQuantity,

    grossRealizedPnl:
      values.grossRealizedPnl,

    feePnl:
      values.feePnl,

    fundingPnl:
      values.fundingPnl,

    adjustmentPnl:
      values.adjustmentPnl,

    netRealizedPnl:
      values.netRealizedPnl,

    previousPositionSide:
      previousSide,

    currentPositionSide:
      state.side,

    previousPositionQuantity:
      previousQuantity,

    currentPositionQuantity:
      state.quantity,

    previousAverageEntryPrice,

    currentAverageEntryPrice:
      state.averageEntryPrice,

    occurredAt:
      event.occurredAt,

    sequence:
      event.sequence,

    metadata:
      freezeMetadata({
        closedQuantity:
          values.closedQuantity,

        openedQuantity:
          values.openedQuantity,
      }),
  });
}

function validateEventCompatibility(
  state: MutablePositionState,
  event: RealizedPnlExecutionEvent,
): void {
  if (
    state.exchangeId !== event.exchangeId ||
    state.accountId !== event.accountId
  ) {
    throw new Error(
      `Event "${event.eventId}" account does not match its position.`,
    );
  }

  if (
    state.symbol !== event.symbol
  ) {
    throw new Error(
      `Event "${event.eventId}" symbol does not match its position.`,
    );
  }

  if (
    state.instrumentType !==
    event.instrumentType
  ) {
    throw new Error(
      `Event "${event.eventId}" instrument type does not match its position.`,
    );
  }

  if (
    state.contractMultiplier !==
    event.contractMultiplier
  ) {
    throw new Error(
      `Event "${event.eventId}" contract multiplier does not match its position.`,
    );
  }
}

function sortEvents(
  events: readonly RealizedPnlExecutionEvent[],
): readonly RealizedPnlExecutionEvent[] {
  return Object.freeze(
    [...events].sort(
      (left, right) => {
        if (
          left.occurredAt !==
          right.occurredAt
        ) {
          return (
            left.occurredAt -
            right.occurredAt
          );
        }

        if (
          left.sequence !==
          right.sequence
        ) {
          return (
            left.sequence -
            right.sequence
          );
        }

        return left.eventId.localeCompare(
          right.eventId,
        );
      },
    ),
  );
}

function assertChronologicalOrdering(
  events: readonly RealizedPnlExecutionEvent[],
): void {
  for (
    let index = 1;
    index < events.length;
    index += 1
  ) {
    const previous =
      events[index - 1];

    const current =
      events[index];

    if (
      current.occurredAt <
      previous.occurredAt
    ) {
      throw new Error(
        "events must be ordered chronologically by occurredAt.",
      );
    }

    if (
      current.occurredAt ===
        previous.occurredAt &&
      current.sequence <
        previous.sequence
    ) {
      throw new Error(
        "events with equal occurredAt must be ordered by sequence.",
      );
    }
  }
}

function freezePositionResult(
  state: MutablePositionState,
): RealizedPnlPositionResult {
  return Object.freeze({
    positionId:
      state.positionId,

    exchangeId:
      state.exchangeId,

    accountId:
      state.accountId,

    symbol:
      state.symbol,

    instrumentType:
      state.instrumentType,

    side:
      state.side,

    quantity:
      state.quantity,

    averageEntryPrice:
      state.averageEntryPrice,

    contractMultiplier:
      state.contractMultiplier,

    grossRealizedPnl:
      state.grossRealizedPnl,

    feePnl:
      state.feePnl,

    fundingPnl:
      state.fundingPnl,

    adjustmentPnl:
      state.adjustmentPnl,

    netRealizedPnl:
      state.netRealizedPnl,

    tradeEventCount:
      state.tradeEventCount,

    fundingEventCount:
      state.fundingEventCount,

    feeEventCount:
      state.feeEventCount,

    adjustmentEventCount:
      state.adjustmentEventCount,

    openedAt:
      state.openedAt,

    closedAt:
      state.closedAt,

    updatedAt:
      state.updatedAt,

    metadata:
      state.metadata,
  });
}

function sortPositionResults(
  positions: readonly RealizedPnlPositionResult[],
): readonly RealizedPnlPositionResult[] {
  return Object.freeze(
    [...positions].sort(
      (left, right) => {
        const exchangeComparison =
          left.exchangeId.localeCompare(
            right.exchangeId,
          );

        if (
          exchangeComparison !== 0
        ) {
          return exchangeComparison;
        }

        const accountComparison =
          left.accountId.localeCompare(
            right.accountId,
          );

        if (
          accountComparison !== 0
        ) {
          return accountComparison;
        }

        const symbolComparison =
          left.symbol.localeCompare(
            right.symbol,
          );

        if (
          symbolComparison !== 0
        ) {
          return symbolComparison;
        }

        return left.positionId.localeCompare(
          right.positionId,
        );
      },
    ),
  );
}

function calculateTotals(
  positions: readonly RealizedPnlPositionResult[],
  events: readonly RealizedPnlEventResult[],
): RealizedPnlTotals {
  let openPositionCount = 0;
  let closedPositionCount = 0;

  let appliedEventCount = 0;
  let ignoredEventCount = 0;
  let duplicateEventCount = 0;

  let tradeEventCount = 0;
  let fundingEventCount = 0;
  let feeEventCount = 0;
  let adjustmentEventCount = 0;

  let grossRealizedPnl = 0;
  let feePnl = 0;
  let fundingPnl = 0;
  let adjustmentPnl = 0;
  let netRealizedPnl = 0;

  let profitablePositionCount = 0;
  let losingPositionCount = 0;
  let flatPositionCount = 0;

  for (const position of positions) {
    if (
      position.quantity > 0 &&
      position.side !== null
    ) {
      openPositionCount += 1;
    } else {
      closedPositionCount += 1;
    }

    grossRealizedPnl +=
      position.grossRealizedPnl;

    feePnl +=
      position.feePnl;

    fundingPnl +=
      position.fundingPnl;

    adjustmentPnl +=
      position.adjustmentPnl;

    netRealizedPnl +=
      position.netRealizedPnl;

    if (
      position.netRealizedPnl > 0
    ) {
      profitablePositionCount += 1;
    } else if (
      position.netRealizedPnl < 0
    ) {
      losingPositionCount += 1;
    } else {
      flatPositionCount += 1;
    }
  }

  for (const event of events) {
    switch (event.status) {
      case "APPLIED":
        appliedEventCount += 1;
        break;

      case "IGNORED":
        ignoredEventCount += 1;
        break;

      case "DUPLICATE":
        duplicateEventCount += 1;
        break;
    }

    switch (event.eventType) {
      case "TRADE":
        tradeEventCount += 1;
        break;

      case "FUNDING":
        fundingEventCount += 1;
        break;

      case "FEE":
        feeEventCount += 1;
        break;

      case "ADJUSTMENT":
        adjustmentEventCount += 1;
        break;
    }
  }

  return Object.freeze({
    positionCount:
      positions.length,

    openPositionCount,
    closedPositionCount,

    eventCount:
      events.length,

    appliedEventCount,
    ignoredEventCount,
    duplicateEventCount,

    tradeEventCount,
    fundingEventCount,
    feeEventCount,
    adjustmentEventCount,

    grossRealizedPnl,
    feePnl,
    fundingPnl,
    adjustmentPnl,
    netRealizedPnl,

    profitablePositionCount,
    losingPositionCount,
    flatPositionCount,
  });
}

export class DeterministicRealizedPnlEngine
implements RealizedPnlEngine {
  public calculate(
    request: RealizedPnlCalculationRequest,
  ): RealizedPnlCalculationResult {
    assertObject(
      request,
      "request",
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolioId,
        "request.portfolioId",
      );

    const synchronizationId =
      normalizeIdentifier(
        request.synchronizationId,
        "request.synchronizationId",
      );

    assertNonNegativeFiniteNumber(
      request.calculatedAt,
      "request.calculatedAt",
    );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    if (
      !Array.isArray(
        request.positions,
      )
    ) {
      throw new Error(
        "request.positions must be an array.",
      );
    }

    if (
      !Array.isArray(
        request.events,
      )
    ) {
      throw new Error(
        "request.events must be an array.",
      );
    }

    const policy =
      resolvePolicy(
        request.policy,
      );

    const normalizedPositions =
      request.positions.map(
        normalizeSeed,
      );

    const normalizedEvents =
      request.events.map(
        normalizeEvent,
      );

    if (
      policy.requireChronologicalOrdering
    ) {
      assertChronologicalOrdering(
        normalizedEvents,
      );
    }

    for (const event of normalizedEvents) {
      if (
        event.occurredAt >
        request.calculatedAt
      ) {
        throw new Error(
          `Event "${event.eventId}" cannot occur after calculatedAt.`,
        );
      }
    }

    const stateByPositionKey =
      new Map<
        string,
        MutablePositionState
      >();

    for (const position of normalizedPositions) {
      const key =
        createPositionKey(
          position.exchangeId,
          position.accountId,
          position.positionId,
        );

      if (
        stateByPositionKey.has(key)
      ) {
        throw new Error(
          `Duplicate position seed detected for key "${key}".`,
        );
      }

      stateByPositionKey.set(
        key,
        createMutablePositionState(
          position,
        ),
      );
    }

    const eventIds =
      new Set<string>();

    const eventResults:
      RealizedPnlEventResult[] = [];

    const orderedEvents =
      policy.requireChronologicalOrdering
        ? normalizedEvents
        : sortEvents(
            normalizedEvents,
          );

    for (const event of orderedEvents) {
      const key =
        createPositionKey(
          event.exchangeId,
          event.accountId,
          event.positionId,
        );

      let state =
        stateByPositionKey.get(key);

      if (state === undefined) {
        state =
          createEmptyMutablePositionState(
            event,
          );

        stateByPositionKey.set(
          key,
          state,
        );
      }

      validateEventCompatibility(
        state,
        event,
      );

      if (
        eventIds.has(
          event.eventId,
        )
      ) {
        if (
          policy.rejectDuplicateEvents
        ) {
          throw new Error(
            `Duplicate eventId detected: "${event.eventId}".`,
          );
        }

        eventResults.push(
          createDuplicateEventResult(
            event,
            state,
          ),
        );

        continue;
      }

      eventIds.add(
        event.eventId,
      );

      if (
        event.eventType === "TRADE" &&
        event.quantity <=
          policy.quantityTolerance
      ) {
        if (
          policy.rejectZeroQuantityTrades
        ) {
          throw new Error(
            `Trade event "${event.eventId}" has zero quantity.`,
          );
        }

        eventResults.push(
          createIgnoredTradeEventResult(
            event,
            state,
          ),
        );

        continue;
      }

      const previousSide =
        state.side;

      const previousQuantity =
        state.quantity;

      const previousAverageEntryPrice =
        state.averageEntryPrice;

      if (
        event.eventType === "TRADE"
      ) {
        const values =
          applyTradeEvent(
            state,
            event,
            policy.quantityTolerance,
          );

        eventResults.push(
          createAppliedEventResult(
            event,
            previousSide,
            previousQuantity,
            previousAverageEntryPrice,
            state,
            values,
          ),
        );
      } else {
        const values =
          applyNonTradeEvent(
            state,
            event,
          );

        eventResults.push(
          createAppliedEventResult(
            event,
            previousSide,
            previousQuantity,
            previousAverageEntryPrice,
            state,
            {
              closedQuantity: 0,
              openedQuantity: 0,

              grossRealizedPnl: 0,

              feePnl:
                values.feePnl,

              fundingPnl:
                values.fundingPnl,

              adjustmentPnl:
                values.adjustmentPnl,

              netRealizedPnl:
                values.netRealizedPnl,
            },
          ),
        );
      }
    }

    const positions =
      sortPositionResults(
        Array.from(
          stateByPositionKey.values(),
        ).map(
          freezePositionResult,
        ),
      );

    const frozenEvents =
      Object.freeze(
        [...eventResults],
      );

    const totals =
      calculateTotals(
        positions,
        frozenEvents,
      );

    return Object.freeze({
      portfolioId,
      synchronizationId,

      positions,
      events:
        frozenEvents,

      totals,

      calculatedAt:
        request.calculatedAt,

      sequence:
        request.sequence,

      metadata:
        freezeMetadata({
          ...request.metadata,

          positionCount:
            totals.positionCount,

          eventCount:
            totals.eventCount,

          appliedEventCount:
            totals.appliedEventCount,

          duplicateEventCount:
            totals.duplicateEventCount,

          grossRealizedPnl:
            totals.grossRealizedPnl,

          netRealizedPnl:
            totals.netRealizedPnl,
        }),
    });
  }
}

export function createRealizedPnlEngine():
DeterministicRealizedPnlEngine {
  return new DeterministicRealizedPnlEngine();
}

export function createDefaultRealizedPnlCalculationPolicy():
RealizedPnlCalculationPolicy {
  return Object.freeze({
    rejectDuplicateEvents: false,
    rejectZeroQuantityTrades: false,
    requireChronologicalOrdering: true,
    quantityTolerance: 1e-12,
  });
}

export function findRealizedPnlPositionResult(
  result: RealizedPnlCalculationResult,
  positionId: string,
): RealizedPnlPositionResult | null {
  assertObject(
    result,
    "result",
  );

  const normalizedPositionId =
    normalizeIdentifier(
      positionId,
      "positionId",
    );

  return (
    result.positions.find(
      position =>
        position.positionId ===
        normalizedPositionId,
    ) ??
    null
  );
}

export function findRealizedPnlEventResult(
  result: RealizedPnlCalculationResult,
  eventId: string,
): RealizedPnlEventResult | null {
  assertObject(
    result,
    "result",
  );

  const normalizedEventId =
    normalizeIdentifier(
      eventId,
      "eventId",
    );

  return (
    result.events.find(
      event =>
        event.eventId ===
        normalizedEventId,
    ) ??
    null
  );
}