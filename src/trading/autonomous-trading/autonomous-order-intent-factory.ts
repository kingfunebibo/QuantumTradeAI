/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 10: Autonomous order intent factory.
 *
 * Responsibilities:
 * - convert approved sizing decisions into execution-ready order intents
 * - map autonomous signals to order side and intent type
 * - enforce approval, sizing, price, expiry, and order-policy invariants
 * - support market, limit, stop, and stop-limit intents
 * - enforce reduce-only and post-only semantics
 * - emit immutable, deterministic, and explainable order intents
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousOrderIntent,
  type AutonomousOrderIntentType,
  type AutonomousOrderSide,
  type AutonomousOrderType,
  type AutonomousPositionSizingDecision,
  type AutonomousTimeInForce,
  type AutonomousTradeApprovalDecision,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingSignal,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousOrderIntentFactoryRequest {
  readonly correlationId: string;
  readonly signal: AutonomousTradingSignal;
  readonly approval: AutonomousTradeApprovalDecision;
  readonly sizing: AutonomousPositionSizingDecision;
  readonly orderType?: AutonomousOrderType;
  readonly timeInForce?: AutonomousTimeInForce;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly reduceOnly?: boolean;
  readonly postOnly?: boolean;
  readonly expiresAt?: AutonomousTradingTimestamp;
  readonly metadata?: AutonomousTradingMetadata;
}

export interface AutonomousOrderIntentFactoryOptions {
  readonly defaultOrderType?: AutonomousOrderType;
  readonly defaultTimeInForce?: AutonomousTimeInForce;
  readonly defaultIntentTtlMs?: number;
  readonly allowMarketOrders?: boolean;
  readonly allowStopOrders?: boolean;
  readonly requireExplicitLimitPrice?: boolean;
  readonly requireExplicitStopPrice?: boolean;
  readonly forceReduceOnlyForDefensiveActions?: boolean;
  readonly maximumPriceDeviationFraction?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedAutonomousOrderIntentFactoryOptions {
  readonly defaultOrderType: AutonomousOrderType;
  readonly defaultTimeInForce: AutonomousTimeInForce;
  readonly defaultIntentTtlMs: number;
  readonly allowMarketOrders: boolean;
  readonly allowStopOrders: boolean;
  readonly requireExplicitLimitPrice: boolean;
  readonly requireExplicitStopPrice: boolean;
  readonly forceReduceOnlyForDefensiveActions: boolean;
  readonly maximumPriceDeviationFraction: number;
  readonly numericalTolerance: number;
}

const DEFAULT_OPTIONS: Readonly<ResolvedAutonomousOrderIntentFactoryOptions> =
  Object.freeze({
    defaultOrderType: "MARKET",
    defaultTimeInForce: "GTC",
    defaultIntentTtlMs: 30_000,
    allowMarketOrders: true,
    allowStopOrders: true,
    requireExplicitLimitPrice: false,
    requireExplicitStopPrice: false,
    forceReduceOnlyForDefensiveActions: true,
    maximumPriceDeviationFraction: 0.25,
    numericalTolerance: 1e-9,
  });

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive.`);
  }
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const copy: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(copy);
}

function freezeInstrument(
  instrument: AutonomousTradingSignal["instrument"],
): AutonomousTradingSignal["instrument"] {
  return Object.freeze({
    ...instrument,
    metadata: freezeMetadata(instrument.metadata),
  });
}

function freezeIntent(intent: AutonomousOrderIntent): AutonomousOrderIntent {
  return Object.freeze({
    ...intent,
    instrument: freezeInstrument(intent.instrument),
    metadata: freezeMetadata(intent.metadata),
  });
}

export class AutonomousOrderIntentFactory {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousOrderIntentFactoryOptions;
  private intentSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousOrderIntentFactoryOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const resolved: ResolvedAutonomousOrderIntentFactoryOptions = {
      defaultOrderType:
        options.defaultOrderType ?? DEFAULT_OPTIONS.defaultOrderType,
      defaultTimeInForce:
        options.defaultTimeInForce ?? DEFAULT_OPTIONS.defaultTimeInForce,
      defaultIntentTtlMs:
        options.defaultIntentTtlMs ?? DEFAULT_OPTIONS.defaultIntentTtlMs,
      allowMarketOrders:
        options.allowMarketOrders ?? DEFAULT_OPTIONS.allowMarketOrders,
      allowStopOrders:
        options.allowStopOrders ?? DEFAULT_OPTIONS.allowStopOrders,
      requireExplicitLimitPrice:
        options.requireExplicitLimitPrice ??
        DEFAULT_OPTIONS.requireExplicitLimitPrice,
      requireExplicitStopPrice:
        options.requireExplicitStopPrice ??
        DEFAULT_OPTIONS.requireExplicitStopPrice,
      forceReduceOnlyForDefensiveActions:
        options.forceReduceOnlyForDefensiveActions ??
        DEFAULT_OPTIONS.forceReduceOnlyForDefensiveActions,
      maximumPriceDeviationFraction:
        options.maximumPriceDeviationFraction ??
        DEFAULT_OPTIONS.maximumPriceDeviationFraction,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
    };

    assertNonNegativeFinite(
      resolved.defaultIntentTtlMs,
      "defaultIntentTtlMs",
    );
    assertProbability(
      resolved.maximumPriceDeviationFraction,
      "maximumPriceDeviationFraction",
    );
    assertPositiveFinite(resolved.numericalTolerance, "numericalTolerance");

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public create(
    request: AutonomousOrderIntentFactoryRequest,
  ): AutonomousOrderIntent {
    this.validateRequest(request);

    const createdAt = this.clock.now();
    assertNonNegativeFinite(createdAt, "clock.now()");

    const orderType = request.orderType ?? this.options.defaultOrderType;
    const timeInForce =
      request.timeInForce ?? this.resolveDefaultTimeInForce(orderType);
    const intentType = this.resolveIntentType(request.signal);
    const side = this.resolveOrderSide(request.signal);
    const reduceOnly = this.resolveReduceOnly(
      request.signal,
      request.reduceOnly,
    );
    const postOnly = request.postOnly ?? timeInForce === "POST_ONLY";
    const limitPrice = this.resolveLimitPrice(request, orderType);
    const stopPrice = this.resolveStopPrice(request, orderType);
    const expiresAt = this.resolveExpiry(request, createdAt);

    this.validateOrderPolicy({
      request,
      orderType,
      timeInForce,
      intentType,
      side,
      reduceOnly,
      postOnly,
      limitPrice,
      stopPrice,
      createdAt,
      expiresAt,
    });

    const intent = freezeIntent({
      intentId: this.idFactory.create(
        "autonomous-order-intent",
        createdAt,
        this.intentSequence++,
      ),
      correlationId: request.correlationId,
      strategyId: request.signal.strategyId,
      signalId: request.signal.signalId,
      instrument: request.signal.instrument,
      intentType,
      side,
      orderType,
      timeInForce,
      quantity: request.sizing.quantity,
      notional: request.sizing.notional,
      limitPrice,
      stopPrice,
      reduceOnly,
      postOnly,
      createdAt,
      expiresAt,
      rationale: this.buildRationale(
        request,
        intentType,
        side,
        orderType,
        timeInForce,
        reduceOnly,
        postOnly,
      ),
      metadata: freezeMetadata({
        signalAction: request.signal.action,
        signalDirection: request.signal.direction,
        signalConfidence: request.signal.confidence,
        signalStrength: request.signal.strength,
        approvalDecisionId: request.approval.decisionId,
        approvalStatus: request.approval.status,
        approvedNotional: request.approval.approvedNotional,
        sizingDecisionId: request.sizing.decisionId,
        sizingMethod: request.sizing.method,
        sizingConstrained: request.sizing.constrained,
        sizingLeverage: request.sizing.leverage,
        referencePrice: request.signal.referencePrice ?? null,
        targetPrice: request.signal.targetPrice ?? null,
        requestedOrderType: request.orderType ?? null,
        requestedTimeInForce: request.timeInForce ?? null,
        ...request.metadata,
      }),
    });

    const validation = this.validator.validateOrderIntent(intent);
    this.validator.assertValid(
      validation,
      "Generated autonomous order intent is invalid.",
    );

    return intent;
  }

  private validateRequest(
    request: AutonomousOrderIntentFactoryRequest,
  ): void {
    if (!request || typeof request !== "object") {
      throw new TypeError("request must be an object.");
    }

    assertNonEmptyString(request.correlationId, "correlationId");

    const signalValidation =
      this.validator.validateTradingSignal(request.signal);
    this.validator.assertValid(
      signalValidation,
      "Order intent signal is invalid.",
    );

    const approvalValidation =
      this.validator.validateTradeApprovalDecision(request.approval);
    this.validator.assertValid(
      approvalValidation,
      "Order intent approval decision is invalid.",
    );

    const sizingValidation =
      this.validator.validatePositionSizingDecision(request.sizing);
    this.validator.assertValid(
      sizingValidation,
      "Order intent sizing decision is invalid.",
    );

    if (request.signal.action === "HOLD") {
      throw new Error("HOLD signals cannot create order intents.");
    }

    if (
      request.approval.status !== "APPROVED" &&
      request.approval.status !== "REDUCED"
    ) {
      throw new Error(
        `Approval status ${request.approval.status} cannot create an order intent.`,
      );
    }

    if (
      request.sizing.quantity <= this.options.numericalTolerance ||
      request.sizing.notional <= this.options.numericalTolerance
    ) {
      throw new Error(
        "Sizing decision must contain positive executable quantity and notional.",
      );
    }

    if (
      request.sizing.notional >
      request.approval.approvedNotional + this.options.numericalTolerance
    ) {
      throw new Error(
        "Sizing notional cannot exceed the approved notional.",
      );
    }

    if (
      request.approval.correlationId !== request.correlationId ||
      request.sizing.correlationId !== request.correlationId
    ) {
      throw new Error(
        "Signal pipeline decisions must share the order-intent correlationId.",
      );
    }

    if (
      request.sizing.requestId.length === 0 ||
      request.approval.requestId.length === 0
    ) {
      throw new Error(
        "Approval and sizing decisions must reference valid requests.",
      );
    }

    if (
      request.expiresAt !== undefined &&
      (!Number.isFinite(request.expiresAt) || request.expiresAt < 0)
    ) {
      throw new RangeError(
        "expiresAt must be a non-negative finite timestamp.",
      );
    }

    if (request.limitPrice !== undefined) {
      assertPositiveFinite(request.limitPrice, "limitPrice");
    }

    if (request.stopPrice !== undefined) {
      assertPositiveFinite(request.stopPrice, "stopPrice");
    }
  }

  private resolveIntentType(
    signal: AutonomousTradingSignal,
  ): AutonomousOrderIntentType {
    switch (signal.action) {
      case "BUY":
      case "SELL":
        return "OPEN";
      case "INCREASE":
        return "INCREASE";
      case "REDUCE":
        return "REDUCE";
      case "CLOSE":
        return "CLOSE";
      case "HOLD":
        throw new Error("HOLD signals cannot produce order intents.");
      default: {
        const exhaustiveCheck: never = signal.action;
        return exhaustiveCheck;
      }
    }
  }

  private resolveOrderSide(
    signal: AutonomousTradingSignal,
  ): AutonomousOrderSide {
    switch (signal.action) {
      case "BUY":
        return "BUY";
      case "SELL":
        return "SELL";
      case "INCREASE":
        if (signal.direction === "LONG") {
          return "BUY";
        }
        if (signal.direction === "SHORT") {
          return "SELL";
        }
        throw new Error(
          "INCREASE signals require LONG or SHORT direction.",
        );
      case "REDUCE":
      case "CLOSE":
        if (signal.direction === "LONG") {
          return "SELL";
        }
        if (signal.direction === "SHORT") {
          return "BUY";
        }
        throw new Error(
          `${signal.action} signals require LONG or SHORT direction.`,
        );
      case "HOLD":
        throw new Error("HOLD signals cannot produce an order side.");
      default: {
        const exhaustiveCheck: never = signal.action;
        return exhaustiveCheck;
      }
    }
  }

  private resolveReduceOnly(
    signal: AutonomousTradingSignal,
    requestedReduceOnly: boolean | undefined,
  ): boolean {
    const defensiveAction =
      signal.action === "REDUCE" || signal.action === "CLOSE";

    if (
      defensiveAction &&
      this.options.forceReduceOnlyForDefensiveActions
    ) {
      return true;
    }

    return requestedReduceOnly ?? defensiveAction;
  }

  private resolveDefaultTimeInForce(
    orderType: AutonomousOrderType,
  ): AutonomousTimeInForce {
    if (orderType === "MARKET" || orderType === "STOP") {
      return "IOC";
    }

    return this.options.defaultTimeInForce;
  }

  private resolveLimitPrice(
    request: AutonomousOrderIntentFactoryRequest,
    orderType: AutonomousOrderType,
  ): number | undefined {
    if (orderType !== "LIMIT" && orderType !== "STOP_LIMIT") {
      return undefined;
    }

    const resolved =
      request.limitPrice ??
      request.signal.targetPrice ??
      request.signal.referencePrice;

    if (
      resolved === undefined &&
      this.options.requireExplicitLimitPrice
    ) {
      throw new Error(
        `${orderType} requires an explicit limit price.`,
      );
    }

    if (resolved === undefined) {
      throw new Error(
        `${orderType} requires limitPrice, targetPrice, or referencePrice.`,
      );
    }

    return resolved;
  }

  private resolveStopPrice(
    request: AutonomousOrderIntentFactoryRequest,
    orderType: AutonomousOrderType,
  ): number | undefined {
    if (orderType !== "STOP" && orderType !== "STOP_LIMIT") {
      return undefined;
    }

    const resolved =
      request.stopPrice ?? request.signal.stopPrice;

    if (
      resolved === undefined &&
      this.options.requireExplicitStopPrice
    ) {
      throw new Error(
        `${orderType} requires an explicit stop price.`,
      );
    }

    if (resolved === undefined) {
      throw new Error(
        `${orderType} requires stopPrice on the request or signal.`,
      );
    }

    return resolved;
  }

  private resolveExpiry(
    request: AutonomousOrderIntentFactoryRequest,
    createdAt: AutonomousTradingTimestamp,
  ): AutonomousTradingTimestamp | undefined {
    if (request.expiresAt !== undefined) {
      return request.expiresAt;
    }

    if (request.signal.expiresAt !== undefined) {
      return request.signal.expiresAt;
    }

    if (this.options.defaultIntentTtlMs === 0) {
      return undefined;
    }

    return createdAt + this.options.defaultIntentTtlMs;
  }

  private validateOrderPolicy(input: {
    readonly request: AutonomousOrderIntentFactoryRequest;
    readonly orderType: AutonomousOrderType;
    readonly timeInForce: AutonomousTimeInForce;
    readonly intentType: AutonomousOrderIntentType;
    readonly side: AutonomousOrderSide;
    readonly reduceOnly: boolean;
    readonly postOnly: boolean;
    readonly limitPrice: number | undefined;
    readonly stopPrice: number | undefined;
    readonly createdAt: AutonomousTradingTimestamp;
    readonly expiresAt: AutonomousTradingTimestamp | undefined;
  }): void {
    if (input.orderType === "MARKET" && !this.options.allowMarketOrders) {
      throw new Error("Market orders are disabled by factory policy.");
    }

    if (
      (input.orderType === "STOP" ||
        input.orderType === "STOP_LIMIT") &&
      !this.options.allowStopOrders
    ) {
      throw new Error("Stop orders are disabled by factory policy.");
    }

    if (input.postOnly && input.orderType !== "LIMIT") {
      throw new Error("postOnly is only valid for LIMIT orders.");
    }

    if (
      input.timeInForce === "POST_ONLY" &&
      input.orderType !== "LIMIT"
    ) {
      throw new Error(
        "POST_ONLY time-in-force is only valid for LIMIT orders.",
      );
    }

    if (
      input.postOnly !== (input.timeInForce === "POST_ONLY")
    ) {
      throw new Error(
        "postOnly and POST_ONLY time-in-force must be consistent.",
      );
    }

    if (
      (input.intentType === "REDUCE" ||
        input.intentType === "CLOSE") &&
      !input.reduceOnly
    ) {
      throw new Error(
        `${input.intentType} intents must be reduce-only.`,
      );
    }

    if (
      (input.intentType === "OPEN" ||
        input.intentType === "INCREASE") &&
      input.reduceOnly
    ) {
      throw new Error(
        `${input.intentType} intents cannot be reduce-only.`,
      );
    }

    if (
      input.expiresAt !== undefined &&
      input.expiresAt <= input.createdAt
    ) {
      throw new Error(
        "Order intent expiration must be later than creation time.",
      );
    }

    this.validatePriceDeviation(
      input.request.signal.referencePrice,
      input.limitPrice,
      "limitPrice",
    );
    this.validatePriceDeviation(
      input.request.signal.referencePrice,
      input.stopPrice,
      "stopPrice",
    );

    this.validateDirectionalPrices(
      input.side,
      input.orderType,
      input.request.signal.referencePrice,
      input.limitPrice,
      input.stopPrice,
    );
  }

  private validatePriceDeviation(
    referencePrice: number | undefined,
    candidatePrice: number | undefined,
    name: string,
  ): void {
    if (
      referencePrice === undefined ||
      candidatePrice === undefined
    ) {
      return;
    }

    const deviation =
      Math.abs(candidatePrice - referencePrice) / referencePrice;

    if (
      deviation >
      this.options.maximumPriceDeviationFraction +
        this.options.numericalTolerance
    ) {
      throw new Error(
        `${name} exceeds the maximum permitted deviation from referencePrice.`,
      );
    }
  }

  private validateDirectionalPrices(
    side: AutonomousOrderSide,
    orderType: AutonomousOrderType,
    referencePrice: number | undefined,
    limitPrice: number | undefined,
    stopPrice: number | undefined,
  ): void {
    if (referencePrice === undefined) {
      return;
    }

    if (
      (orderType === "STOP" || orderType === "STOP_LIMIT") &&
      stopPrice !== undefined
    ) {
      if (
        side === "BUY" &&
        stopPrice + this.options.numericalTolerance < referencePrice
      ) {
        throw new Error(
          "BUY stop price cannot be below the reference price.",
        );
      }

      if (
        side === "SELL" &&
        stopPrice > referencePrice + this.options.numericalTolerance
      ) {
        throw new Error(
          "SELL stop price cannot be above the reference price.",
        );
      }
    }

    if (
      orderType === "STOP_LIMIT" &&
      limitPrice !== undefined &&
      stopPrice !== undefined
    ) {
      if (
        side === "BUY" &&
        limitPrice + this.options.numericalTolerance < stopPrice
      ) {
        throw new Error(
          "BUY stop-limit price cannot be below the stop price.",
        );
      }

      if (
        side === "SELL" &&
        limitPrice > stopPrice + this.options.numericalTolerance
      ) {
        throw new Error(
          "SELL stop-limit price cannot be above the stop price.",
        );
      }
    }
  }

  private buildRationale(
    request: AutonomousOrderIntentFactoryRequest,
    intentType: AutonomousOrderIntentType,
    side: AutonomousOrderSide,
    orderType: AutonomousOrderType,
    timeInForce: AutonomousTimeInForce,
    reduceOnly: boolean,
    postOnly: boolean,
  ): string {
    return (
      `${intentType} ${side} ${orderType} intent created from signal ` +
      `${request.signal.signalId} using sizing decision ` +
      `${request.sizing.decisionId}. Quantity ` +
      `${request.sizing.quantity.toFixed(12)}, notional ` +
      `${request.sizing.notional.toFixed(8)}, time-in-force ` +
      `${timeInForce}, reduce-only ${String(reduceOnly)}, post-only ` +
      `${String(postOnly)}. ${request.sizing.reason}`
    );
  }
}

export function createAutonomousOrderIntentFactory(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousOrderIntentFactoryOptions = {},
): AutonomousOrderIntentFactory {
  return new AutonomousOrderIntentFactory(
    clock,
    idFactory,
    validator,
    options,
  );
}