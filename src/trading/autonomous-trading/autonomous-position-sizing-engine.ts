/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 9: Autonomous position sizing engine.
 *
 * Responsibilities:
 * - support every autonomous position-sizing method
 * - derive deterministic risk, confidence, volatility, and drawdown adjustments
 * - enforce approval, capital, portfolio, leverage, risk, quantity, and notional limits
 * - normalize quantity to exchange-compatible increments
 * - emit immutable and explainable sizing decisions
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousPositionSizingDecision,
  type AutonomousPositionSizingMethod,
  type AutonomousPositionSizingRequest,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousPositionSizingEngineOptions {
  readonly fixedFraction?: number;
  readonly targetVolatility?: number;
  readonly kellyFraction?: number;
  readonly riskParityFraction?: number;
  readonly minimumVolatilityFloor?: number;
  readonly maximumVolatilityAdjustment?: number;
  readonly minimumDrawdownAdjustment?: number;
  readonly hybridWeights?: Readonly<{
    confidence: number;
    volatility: number;
    kelly: number;
    drawdown: number;
  }>;
  readonly maximumRequestAgeMs?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedHybridWeights {
  readonly confidence: number;
  readonly volatility: number;
  readonly kelly: number;
  readonly drawdown: number;
}

interface ResolvedAutonomousPositionSizingEngineOptions {
  readonly fixedFraction: number;
  readonly targetVolatility: number;
  readonly kellyFraction: number;
  readonly riskParityFraction: number;
  readonly minimumVolatilityFloor: number;
  readonly maximumVolatilityAdjustment: number;
  readonly minimumDrawdownAdjustment: number;
  readonly hybridWeights: ResolvedHybridWeights;
  readonly maximumRequestAgeMs: number;
  readonly numericalTolerance: number;
}

interface MethodSizingResult {
  readonly rawNotional: number;
  readonly confidenceAdjustment: number;
  readonly volatilityAdjustment: number;
  readonly drawdownAdjustment: number;
  readonly rationale: string;
}

interface ConstraintResult {
  readonly quantity: number;
  readonly notional: number;
  readonly leverage: number;
  readonly constraintsApplied: readonly string[];
}

const DEFAULT_OPTIONS: Readonly<ResolvedAutonomousPositionSizingEngineOptions> =
  Object.freeze({
    fixedFraction: 0.02,
    targetVolatility: 0.02,
    kellyFraction: 0.25,
    riskParityFraction: 0.01,
    minimumVolatilityFloor: 0.0001,
    maximumVolatilityAdjustment: 2,
    minimumDrawdownAdjustment: 0.1,
    hybridWeights: Object.freeze({
      confidence: 0.30,
      volatility: 0.25,
      kelly: 0.25,
      drawdown: 0.20,
    }),
    maximumRequestAgeMs: 60_000,
    numericalTolerance: 1e-9,
  });

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampProbability(value: number): number {
  return clamp(value, 0, 1);
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) {
    return value;
  }

  const units = Math.floor((value + Number.EPSILON) / step);
  return units * step;
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

function freezeDecision(
  decision: AutonomousPositionSizingDecision,
): AutonomousPositionSizingDecision {
  return Object.freeze({
    ...decision,
    constraintsApplied: Object.freeze([...decision.constraintsApplied]),
    metadata: freezeMetadata(decision.metadata),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export class AutonomousPositionSizingEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousPositionSizingEngineOptions;
  private decisionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousPositionSizingEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const suppliedWeights = options.hybridWeights ?? DEFAULT_OPTIONS.hybridWeights;
    const weightTotal =
      suppliedWeights.confidence +
      suppliedWeights.volatility +
      suppliedWeights.kelly +
      suppliedWeights.drawdown;

    assertProbability(
      options.fixedFraction ?? DEFAULT_OPTIONS.fixedFraction,
      "fixedFraction",
    );
    assertPositiveFinite(
      options.targetVolatility ?? DEFAULT_OPTIONS.targetVolatility,
      "targetVolatility",
    );
    assertProbability(
      options.kellyFraction ?? DEFAULT_OPTIONS.kellyFraction,
      "kellyFraction",
    );
    assertProbability(
      options.riskParityFraction ?? DEFAULT_OPTIONS.riskParityFraction,
      "riskParityFraction",
    );
    assertPositiveFinite(
      options.minimumVolatilityFloor ?? DEFAULT_OPTIONS.minimumVolatilityFloor,
      "minimumVolatilityFloor",
    );
    assertPositiveFinite(
      options.maximumVolatilityAdjustment ??
        DEFAULT_OPTIONS.maximumVolatilityAdjustment,
      "maximumVolatilityAdjustment",
    );
    assertProbability(
      options.minimumDrawdownAdjustment ??
        DEFAULT_OPTIONS.minimumDrawdownAdjustment,
      "minimumDrawdownAdjustment",
    );
    assertNonNegativeFinite(suppliedWeights.confidence, "hybridWeights.confidence");
    assertNonNegativeFinite(suppliedWeights.volatility, "hybridWeights.volatility");
    assertNonNegativeFinite(suppliedWeights.kelly, "hybridWeights.kelly");
    assertNonNegativeFinite(suppliedWeights.drawdown, "hybridWeights.drawdown");
    assertPositiveFinite(weightTotal, "hybridWeights total");
    assertNonNegativeFinite(
      options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs,
      "maximumRequestAgeMs",
    );
    assertPositiveFinite(
      options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
      "numericalTolerance",
    );

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      fixedFraction: options.fixedFraction ?? DEFAULT_OPTIONS.fixedFraction,
      targetVolatility:
        options.targetVolatility ?? DEFAULT_OPTIONS.targetVolatility,
      kellyFraction: options.kellyFraction ?? DEFAULT_OPTIONS.kellyFraction,
      riskParityFraction:
        options.riskParityFraction ?? DEFAULT_OPTIONS.riskParityFraction,
      minimumVolatilityFloor:
        options.minimumVolatilityFloor ?? DEFAULT_OPTIONS.minimumVolatilityFloor,
      maximumVolatilityAdjustment:
        options.maximumVolatilityAdjustment ??
        DEFAULT_OPTIONS.maximumVolatilityAdjustment,
      minimumDrawdownAdjustment:
        options.minimumDrawdownAdjustment ??
        DEFAULT_OPTIONS.minimumDrawdownAdjustment,
      hybridWeights: Object.freeze({
        confidence: suppliedWeights.confidence / weightTotal,
        volatility: suppliedWeights.volatility / weightTotal,
        kelly: suppliedWeights.kelly / weightTotal,
        drawdown: suppliedWeights.drawdown / weightTotal,
      }),
      maximumRequestAgeMs:
        options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
    });
  }

  public size(
    request: AutonomousPositionSizingRequest,
  ): AutonomousPositionSizingDecision {
    const requestValidation =
      this.validator.validatePositionSizingRequest(request);
    this.validator.assertValid(
      requestValidation,
      "Position sizing request is invalid.",
    );

    const decidedAt = this.clock.now();
    assertNonNegativeFinite(decidedAt, "clock.now()");

    const methodResult = this.calculateMethodSizing(request);
    const constraints: string[] = [];

    const requestAge = decidedAt - request.requestedAt;
    if (requestAge < 0) {
      constraints.push("REQUEST_TIMESTAMP_IN_FUTURE");
    } else if (requestAge > this.options.maximumRequestAgeMs) {
      constraints.push("REQUEST_STALE");
    }

    if (
      request.approval.status === "REJECTED" ||
      request.approval.status === "DEFERRED" ||
      request.approval.approvedNotional <= this.options.numericalTolerance
    ) {
      constraints.push(`APPROVAL_${request.approval.status}`);
    }

    const constrained = this.applyConstraints(
      request,
      methodResult.rawNotional,
      constraints,
    );

    const risk = this.calculateRisk(request, constrained.notional);
    const capitalFraction =
      request.portfolioEquity > this.options.numericalTolerance
        ? clampProbability(constrained.notional / request.portfolioEquity)
        : 0;
    const estimatedRiskFraction =
      request.portfolioEquity > this.options.numericalTolerance
        ? clampProbability(risk / request.portfolioEquity)
        : 0;

    const allConstraints = unique(constrained.constraintsApplied);
    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "autonomous-position-sizing",
        decidedAt,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      method: request.method,
      quantity: constrained.quantity,
      notional: constrained.notional,
      capitalFraction,
      estimatedRiskAmount: risk,
      estimatedRiskFraction,
      leverage: constrained.leverage,
      confidenceAdjustment: methodResult.confidenceAdjustment,
      volatilityAdjustment: methodResult.volatilityAdjustment,
      drawdownAdjustment: methodResult.drawdownAdjustment,
      constrained: allConstraints.length > 0,
      constraintsApplied: allConstraints,
      reason: this.buildReason(
        request.method,
        methodResult,
        constrained,
        allConstraints,
      ),
      decidedAt,
      metadata: freezeMetadata({
        signalId: request.signal.signalId,
        strategyId: request.signal.strategyId,
        approvalDecisionId: request.approval.decisionId,
        approvalStatus: request.approval.status,
        approvalNotional: request.approval.approvedNotional,
        rawMethodNotional: methodResult.rawNotional,
        currentPrice: request.currentPrice,
        stopPrice: request.stopPrice ?? null,
        volatility: request.volatility,
        confidence: request.confidence,
        historicalWinRate: request.historicalWinRate,
        historicalPayoffRatio: request.historicalPayoffRatio,
        drawdown: request.drawdown,
      }),
    });

    const decisionValidation =
      this.validator.validatePositionSizingDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated position sizing decision is invalid.",
    );

    return decision;
  }

  private calculateMethodSizing(
    request: AutonomousPositionSizingRequest,
  ): MethodSizingResult {
    const approvalCap = request.approval.approvedNotional;
    const confidenceAdjustment = clampProbability(request.confidence);
    const volatilityAdjustment = clamp(
      this.options.targetVolatility /
        Math.max(request.volatility, this.options.minimumVolatilityFloor),
      0,
      this.options.maximumVolatilityAdjustment,
    );
    const drawdownAdjustment = clamp(
      1 - request.drawdown,
      this.options.minimumDrawdownAdjustment,
      1,
    );
    const kellyAdjustment = this.calculateKellyFraction(request);

    switch (request.method) {
      case "FIXED_NOTIONAL":
        return Object.freeze({
          rawNotional: approvalCap,
          confidenceAdjustment: 1,
          volatilityAdjustment: 1,
          drawdownAdjustment: 1,
          rationale: "Used the approved notional as the fixed position size.",
        });

      case "FIXED_FRACTION":
        return Object.freeze({
          rawNotional: request.portfolioEquity * this.options.fixedFraction,
          confidenceAdjustment: 1,
          volatilityAdjustment: 1,
          drawdownAdjustment: 1,
          rationale: "Sized from a fixed fraction of portfolio equity.",
        });

      case "VOLATILITY_TARGET":
        return Object.freeze({
          rawNotional:
            Math.min(request.allocatedStrategyCapital, approvalCap) *
            volatilityAdjustment,
          confidenceAdjustment: 1,
          volatilityAdjustment,
          drawdownAdjustment: 1,
          rationale: "Scaled capital toward the configured volatility target.",
        });

      case "RISK_PARITY":
        return Object.freeze({
          rawNotional:
            request.portfolioEquity *
            this.options.riskParityFraction /
            Math.max(request.volatility, this.options.minimumVolatilityFloor),
          confidenceAdjustment: 1,
          volatilityAdjustment,
          drawdownAdjustment: 1,
          rationale: "Allocated notional inversely to observed volatility.",
        });

      case "KELLY_FRACTION":
        return Object.freeze({
          rawNotional: request.allocatedStrategyCapital * kellyAdjustment,
          confidenceAdjustment: kellyAdjustment,
          volatilityAdjustment: 1,
          drawdownAdjustment: 1,
          rationale: "Applied a fractional Kelly allocation from win rate and payoff ratio.",
        });

      case "CONFIDENCE_WEIGHTED":
        return Object.freeze({
          rawNotional: approvalCap * confidenceAdjustment,
          confidenceAdjustment,
          volatilityAdjustment: 1,
          drawdownAdjustment: 1,
          rationale: "Scaled the approved notional by signal confidence.",
        });

      case "DRAWDOWN_ADJUSTED":
        return Object.freeze({
          rawNotional: approvalCap * drawdownAdjustment,
          confidenceAdjustment: 1,
          volatilityAdjustment: 1,
          drawdownAdjustment,
          rationale: "Reduced the approved notional as drawdown increased.",
        });

      case "HYBRID": {
        const weights = this.options.hybridWeights;
        const confidenceComponent = confidenceAdjustment;
        const volatilityComponent = clampProbability(
          volatilityAdjustment / this.options.maximumVolatilityAdjustment,
        );
        const kellyComponent = clampProbability(kellyAdjustment);
        const drawdownComponent = drawdownAdjustment;
        const hybridAdjustment =
          confidenceComponent * weights.confidence +
          volatilityComponent * weights.volatility +
          kellyComponent * weights.kelly +
          drawdownComponent * weights.drawdown;

        return Object.freeze({
          rawNotional: approvalCap * clampProbability(hybridAdjustment),
          confidenceAdjustment,
          volatilityAdjustment,
          drawdownAdjustment,
          rationale:
            "Combined confidence, volatility, Kelly, and drawdown adjustments.",
        });
      }

      default: {
        const exhaustiveCheck: never = request.method;
        return exhaustiveCheck;
      }
    }
  }

  private calculateKellyFraction(
    request: AutonomousPositionSizingRequest,
  ): number {
    if (request.historicalPayoffRatio <= this.options.numericalTolerance) {
      return 0;
    }

    const winRate = clampProbability(request.historicalWinRate);
    const lossRate = 1 - winRate;
    const fullKelly =
      winRate - lossRate / request.historicalPayoffRatio;

    return clampProbability(Math.max(0, fullKelly) * this.options.kellyFraction);
  }

  private applyConstraints(
    request: AutonomousPositionSizingRequest,
    rawNotional: number,
    initialConstraints: readonly string[],
  ): ConstraintResult {
    const applied = [...initialConstraints];
    const constraints = request.constraints;

    let notional = Math.max(0, rawNotional);

    if (
      request.approval.status === "REJECTED" ||
      request.approval.status === "DEFERRED"
    ) {
      notional = 0;
    }

    notional = this.cap(
      notional,
      request.approval.approvedNotional,
      "APPROVAL_NOTIONAL_CAP",
      applied,
    );
    notional = this.cap(
      notional,
      request.approval.maximumPermittedNotional,
      "APPROVAL_MAXIMUM_PERMITTED_NOTIONAL",
      applied,
    );
    notional = this.cap(
      notional,
      constraints.maximumNotional,
      "MAXIMUM_NOTIONAL",
      applied,
    );
    notional = this.cap(
      notional,
      request.portfolioEquity * constraints.maximumPortfolioFraction,
      "MAXIMUM_PORTFOLIO_FRACTION",
      applied,
    );
    notional = this.cap(
      notional,
      request.availableCapital * constraints.maximumLeverage,
      "AVAILABLE_CAPITAL_LEVERAGE_CAP",
      applied,
    );
    notional = this.cap(
      notional,
      request.allocatedStrategyCapital * constraints.maximumLeverage,
      "ALLOCATED_STRATEGY_CAPITAL_CAP",
      applied,
    );

    const riskPerNotional = this.calculateRiskPerNotional(request);
    if (riskPerNotional > this.options.numericalTolerance) {
      const maximumRiskAmount =
        request.portfolioEquity * constraints.maximumRiskPerTrade;
      notional = this.cap(
        notional,
        maximumRiskAmount / riskPerNotional,
        "MAXIMUM_RISK_PER_TRADE",
        applied,
      );
    }

    let quantity = notional / request.currentPrice;
    quantity = this.cap(
      quantity,
      constraints.maximumQuantity,
      "MAXIMUM_QUANTITY",
      applied,
    );

    const quantityIncrement = Math.max(
      constraints.quantityStep,
      constraints.lotSize,
    );
    const roundedQuantity = floorToStep(quantity, quantityIncrement);
    if (roundedQuantity + this.options.numericalTolerance < quantity) {
      applied.push("QUANTITY_INCREMENT_ROUNDING");
    }
    quantity = roundedQuantity;

    if (
      quantity > this.options.numericalTolerance &&
      quantity + this.options.numericalTolerance < constraints.minimumQuantity
    ) {
      quantity = 0;
      applied.push("BELOW_MINIMUM_QUANTITY");
    }

    notional = quantity * request.currentPrice;

    if (
      notional > this.options.numericalTolerance &&
      notional + this.options.numericalTolerance < constraints.minimumNotional
    ) {
      quantity = 0;
      notional = 0;
      applied.push("BELOW_MINIMUM_NOTIONAL");
    }

    const leverage =
      request.availableCapital > this.options.numericalTolerance
        ? notional / request.availableCapital
        : notional > this.options.numericalTolerance
          ? constraints.maximumLeverage
          : 0;

    return Object.freeze({
      quantity,
      notional,
      leverage,
      constraintsApplied: unique(applied),
    });
  }

  private calculateRiskPerNotional(
    request: AutonomousPositionSizingRequest,
  ): number {
    if (request.stopPrice !== undefined) {
      return clampProbability(
        Math.abs(request.currentPrice - request.stopPrice) /
          request.currentPrice,
      );
    }

    return clampProbability(
      Math.max(request.volatility, this.options.minimumVolatilityFloor),
    );
  }

  private calculateRisk(
    request: AutonomousPositionSizingRequest,
    notional: number,
  ): number {
    return notional * this.calculateRiskPerNotional(request);
  }

  private cap(
    value: number,
    maximum: number,
    constraintName: string,
    applied: string[],
  ): number {
    const safeMaximum = Math.max(0, maximum);
    if (value > safeMaximum + this.options.numericalTolerance) {
      applied.push(constraintName);
      return safeMaximum;
    }

    return value;
  }

  private buildReason(
    method: AutonomousPositionSizingMethod,
    methodResult: MethodSizingResult,
    constrained: ConstraintResult,
    constraintsApplied: readonly string[],
  ): string {
    if (constrained.notional <= this.options.numericalTolerance) {
      return (
        `${method} produced no executable position after constraint ` +
        `enforcement. ${constraintsApplied.length} constraint(s) applied.`
      );
    }

    return (
      `${method} selected quantity ${constrained.quantity.toFixed(12)} ` +
      `and notional ${constrained.notional.toFixed(8)}. ` +
      `${methodResult.rationale} ` +
      `${constraintsApplied.length} constraint(s) applied.`
    );
  }
}

export function createAutonomousPositionSizingEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousPositionSizingEngineOptions = {},
): AutonomousPositionSizingEngine {
  return new AutonomousPositionSizingEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}