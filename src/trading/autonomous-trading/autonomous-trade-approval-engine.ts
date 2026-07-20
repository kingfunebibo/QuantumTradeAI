/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 8: Autonomous trade approval engine.
 *
 * Responsibilities:
 * - verify consensus authorization and signal quality
 * - enforce strategy lifecycle and health requirements
 * - evaluate portfolio, exposure, leverage, loss, and drawdown limits
 * - enforce liquidity, slippage, and volatility safeguards
 * - preserve risk-reducing trades during defensive conditions
 * - reduce oversized requests to the maximum permitted notional
 * - emit immutable, deterministic, and explainable decisions
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousRiskContext,
  type AutonomousTradeApprovalDecision,
  type AutonomousTradeApprovalRequest,
  type AutonomousTradeApprovalStatus,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousTradeApprovalEngineOptions {
  readonly maximumSlippageBps?: number;
  readonly maximumMarketVolatility?: number;
  readonly minimumConsensusApprovalRatio?: number;
  readonly minimumConsensusParticipationRatio?: number;
  readonly permitRiskReducingTradesOnBreach?: boolean;
  readonly permitDegradedStrategies?: boolean;
  readonly deferOnInsufficientLiquidity?: boolean;
  readonly reduceOversizedTrades?: boolean;
  readonly maximumRequestAgeMs?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedAutonomousTradeApprovalEngineOptions {
  readonly maximumSlippageBps: number;
  readonly maximumMarketVolatility: number;
  readonly minimumConsensusApprovalRatio: number;
  readonly minimumConsensusParticipationRatio: number;
  readonly permitRiskReducingTradesOnBreach: boolean;
  readonly permitDegradedStrategies: boolean;
  readonly deferOnInsufficientLiquidity: boolean;
  readonly reduceOversizedTrades: boolean;
  readonly maximumRequestAgeMs: number;
  readonly numericalTolerance: number;
}

interface RiskEvaluation {
  readonly hardViolations: readonly string[];
  readonly reducibleViolations: readonly string[];
  readonly warnings: readonly string[];
  readonly maximumPermittedNotional: number;
  readonly requiredRiskReduction: number;
  readonly riskReducing: boolean;
  readonly liquidityDeferred: boolean;
}

const DEFAULT_OPTIONS: Readonly<ResolvedAutonomousTradeApprovalEngineOptions> =
  Object.freeze({
    maximumSlippageBps: 100,
    maximumMarketVolatility: 1,
    minimumConsensusApprovalRatio: 0.5,
    minimumConsensusParticipationRatio: 0.5,
    permitRiskReducingTradesOnBreach: true,
    permitDegradedStrategies: true,
    deferOnInsufficientLiquidity: true,
    reduceOversizedTrades: true,
    maximumRequestAgeMs: 60_000,
    numericalTolerance: 1e-9,
  });

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive.`);
  }
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
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
  decision: AutonomousTradeApprovalDecision,
): AutonomousTradeApprovalDecision {
  return Object.freeze({
    ...decision,
    violations: Object.freeze([...decision.violations]),
    warnings: Object.freeze([...decision.warnings]),
    metadata: freezeMetadata(decision.metadata),
  });
}

function minimumFinite(values: readonly number[]): number {
  let minimum = Number.POSITIVE_INFINITY;

  for (const value of values) {
    if (Number.isFinite(value)) {
      minimum = Math.min(minimum, value);
    }
  }

  return minimum === Number.POSITIVE_INFINITY ? 0 : minimum;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  ));
}

export class AutonomousTradeApprovalEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousTradeApprovalEngineOptions;
  private decisionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousTradeApprovalEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const resolved: ResolvedAutonomousTradeApprovalEngineOptions = {
      maximumSlippageBps:
        options.maximumSlippageBps ?? DEFAULT_OPTIONS.maximumSlippageBps,
      maximumMarketVolatility:
        options.maximumMarketVolatility ??
        DEFAULT_OPTIONS.maximumMarketVolatility,
      minimumConsensusApprovalRatio:
        options.minimumConsensusApprovalRatio ??
        DEFAULT_OPTIONS.minimumConsensusApprovalRatio,
      minimumConsensusParticipationRatio:
        options.minimumConsensusParticipationRatio ??
        DEFAULT_OPTIONS.minimumConsensusParticipationRatio,
      permitRiskReducingTradesOnBreach:
        options.permitRiskReducingTradesOnBreach ??
        DEFAULT_OPTIONS.permitRiskReducingTradesOnBreach,
      permitDegradedStrategies:
        options.permitDegradedStrategies ??
        DEFAULT_OPTIONS.permitDegradedStrategies,
      deferOnInsufficientLiquidity:
        options.deferOnInsufficientLiquidity ??
        DEFAULT_OPTIONS.deferOnInsufficientLiquidity,
      reduceOversizedTrades:
        options.reduceOversizedTrades ?? DEFAULT_OPTIONS.reduceOversizedTrades,
      maximumRequestAgeMs:
        options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
    };

    assertNonNegativeFinite(
      resolved.maximumSlippageBps,
      "maximumSlippageBps",
    );
    assertNonNegativeFinite(
      resolved.maximumMarketVolatility,
      "maximumMarketVolatility",
    );
    assertProbability(
      resolved.minimumConsensusApprovalRatio,
      "minimumConsensusApprovalRatio",
    );
    assertProbability(
      resolved.minimumConsensusParticipationRatio,
      "minimumConsensusParticipationRatio",
    );
    assertNonNegativeFinite(
      resolved.maximumRequestAgeMs,
      "maximumRequestAgeMs",
    );
    assertPositiveFinite(resolved.numericalTolerance, "numericalTolerance");

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public approve(
    request: AutonomousTradeApprovalRequest,
  ): AutonomousTradeApprovalDecision {
    const requestValidation =
      this.validator.validateTradeApprovalRequest(request);
    this.validator.assertValid(
      requestValidation,
      "Trade approval request is invalid.",
    );

    const decidedAt = this.clock.now();
    assertNonNegativeFinite(decidedAt, "clock.now()");

    const evaluation = this.evaluate(request, decidedAt);
    const requestedNotional = request.riskContext.estimatedOrderNotional;

    const status = this.resolveStatus(
      requestedNotional,
      evaluation,
    );
    const approvedNotional = this.resolveApprovedNotional(
      requestedNotional,
      evaluation.maximumPermittedNotional,
      status,
    );

    const violations = uniqueSorted([
      ...evaluation.hardViolations,
      ...evaluation.reducibleViolations,
    ]);
    const warnings = uniqueSorted(evaluation.warnings);
    const reason = this.buildReason(
      status,
      requestedNotional,
      approvedNotional,
      evaluation.maximumPermittedNotional,
      violations,
      warnings,
    );

    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "autonomous-trade-approval",
        decidedAt,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      status,
      approvedNotional,
      maximumPermittedNotional: evaluation.maximumPermittedNotional,
      requiredRiskReduction:
        evaluation.requiredRiskReduction > this.options.numericalTolerance
          ? evaluation.requiredRiskReduction
          : undefined,
      violations,
      warnings,
      reason,
      decidedAt,
      metadata: freezeMetadata({
        signalId: request.signal.signalId,
        strategyId: request.signal.strategyId,
        signalAction: request.signal.action,
        signalDirection: request.signal.direction,
        consensusDecisionId: request.consensus.decisionId,
        consensusApproved: request.consensus.approved,
        consensusApprovalRatio: request.consensus.approvalRatio,
        consensusParticipationRatio: request.consensus.participationRatio,
        requestedNotional,
        approvedNotional,
        maximumPermittedNotional: evaluation.maximumPermittedNotional,
        riskReducing: evaluation.riskReducing,
        liquidityDeferred: evaluation.liquidityDeferred,
      }),
    });

    const decisionValidation =
      this.validator.validateTradeApprovalDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated trade approval decision is invalid.",
    );

    return decision;
  }

  private evaluate(
    request: AutonomousTradeApprovalRequest,
    decidedAt: number,
  ): RiskEvaluation {
    const context = request.riskContext;
    const signal = request.signal;
    const limits = context.strategyLimits;
    const portfolio = context.portfolio;
    const strategy = context.strategy;

    const hardViolations: string[] = [];
    const reducibleViolations: string[] = [];
    const warnings: string[] = [];

    const riskReducing = this.isRiskReducing(context, signal.action);

    const requestAge = decidedAt - request.requestedAt;
    if (requestAge < 0) {
      hardViolations.push("Approval request timestamp is in the future.");
    } else if (requestAge > this.options.maximumRequestAgeMs) {
      hardViolations.push("Approval request is stale.");
    }

    const signalAge = decidedAt - signal.generatedAt;
    if (signalAge < 0) {
      hardViolations.push("Signal generation timestamp is in the future.");
    } else if (signalAge > limits.maximumSignalAgeMs) {
      hardViolations.push("Signal exceeds the strategy maximum signal age.");
    }

    if (signal.expiresAt !== undefined && decidedAt >= signal.expiresAt) {
      hardViolations.push("Signal has expired.");
    }

    if (signal.strategyId !== strategy.strategyId) {
      hardViolations.push(
        "Signal strategy does not match the risk-context strategy.",
      );
    }

    if (!request.consensus.approved) {
      hardViolations.push("Consensus decision did not approve the signal.");
    }

    if (
      request.consensus.requestId.length === 0 ||
      request.consensus.correlationId !== request.correlationId
    ) {
      hardViolations.push(
        "Consensus decision is not correlated with this approval request.",
      );
    }

    if (
      request.consensus.approvalRatio + this.options.numericalTolerance <
      this.options.minimumConsensusApprovalRatio
    ) {
      hardViolations.push(
        "Consensus approval ratio is below the required threshold.",
      );
    }

    if (
      request.consensus.participationRatio + this.options.numericalTolerance <
      this.options.minimumConsensusParticipationRatio
    ) {
      hardViolations.push(
        "Consensus participation ratio is below the required threshold.",
      );
    }

    if (
      signal.confidence + this.options.numericalTolerance <
      limits.minimumSignalConfidence
    ) {
      hardViolations.push(
        "Signal confidence is below the strategy minimum.",
      );
    }

    if (!this.isExecutableLifecycleState(strategy.lifecycleState)) {
      hardViolations.push(
        `Strategy lifecycle state ${strategy.lifecycleState} is not executable.`,
      );
    }

    if (strategy.healthStatus === "UNHEALTHY") {
      hardViolations.push("Strategy health status is UNHEALTHY.");
    } else if (strategy.healthStatus === "UNKNOWN") {
      warnings.push("Strategy health status is UNKNOWN.");
    } else if (
      strategy.healthStatus === "DEGRADED" &&
      !this.options.permitDegradedStrategies
    ) {
      hardViolations.push("Degraded strategies are not permitted to trade.");
    } else if (strategy.healthStatus === "DEGRADED") {
      warnings.push("Strategy is operating in DEGRADED health state.");
    }

    if (
      strategy.consecutiveLossCount > limits.maximumConsecutiveLosses
    ) {
      const message =
        "Strategy consecutive-loss limit has been exceeded.";
      if (limits.stopTradingOnBreach && !riskReducing) {
        hardViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    const dailyLoss = Math.max(0, -portfolio.realizedPnl);
    if (dailyLoss > limits.maximumDailyLoss + this.options.numericalTolerance) {
      const message = "Maximum daily loss has been exceeded.";
      if (limits.stopTradingOnBreach && !riskReducing) {
        hardViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (
      Math.max(portfolio.drawdown, strategy.drawdown) >
      limits.maximumDrawdown + this.options.numericalTolerance
    ) {
      const message = "Maximum drawdown has been exceeded.";
      if (limits.stopTradingOnBreach && !riskReducing) {
        hardViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (
      context.liquidityScore + this.options.numericalTolerance <
      limits.minimumLiquidityScore
    ) {
      const message = "Liquidity score is below the strategy minimum.";
      if (!riskReducing) {
        reducibleViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (
      context.estimatedSlippageBps >
      this.options.maximumSlippageBps + this.options.numericalTolerance
    ) {
      const message = "Estimated slippage exceeds the configured maximum.";
      if (!riskReducing) {
        reducibleViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (
      context.marketVolatility >
      this.options.maximumMarketVolatility + this.options.numericalTolerance
    ) {
      const message = "Market volatility exceeds the configured maximum.";
      if (!riskReducing) {
        hardViolations.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (
      context.estimatedLeverage >
      limits.maximumLeverage + this.options.numericalTolerance
    ) {
      if (!riskReducing) {
        reducibleViolations.push(
          "Estimated leverage exceeds the strategy maximum.",
        );
      } else {
        warnings.push(
          "Estimated leverage exceeds the strategy maximum; " +
          "risk-reducing execution remains eligible.",
        );
      }
    }

    if (
      context.projectedPositionNotional >
      limits.maximumPositionNotional + this.options.numericalTolerance
    ) {
      if (!riskReducing) {
        reducibleViolations.push(
          "Projected position notional exceeds the strategy maximum.",
        );
      } else {
        warnings.push(
          "Projected position remains above the strategy position limit.",
        );
      }
    }

    if (
      context.projectedInstrumentExposure >
      limits.maximumNetExposure + this.options.numericalTolerance
    ) {
      if (!riskReducing) {
        reducibleViolations.push(
          "Projected instrument exposure exceeds maximum net exposure.",
        );
      } else {
        warnings.push(
          "Projected instrument exposure remains above maximum net exposure.",
        );
      }
    }

    const projectedGrossExposure =
      portfolio.grossExposure +
      Math.max(
        0,
        context.projectedPositionNotional - context.currentPositionNotional,
      );

    if (
      projectedGrossExposure >
      limits.maximumGrossExposure + this.options.numericalTolerance
    ) {
      if (!riskReducing) {
        reducibleViolations.push(
          "Projected gross exposure exceeds the strategy maximum.",
        );
      } else {
        warnings.push(
          "Portfolio gross exposure remains above the strategy maximum.",
        );
      }
    }

    const maximumPermittedNotional = this.calculateMaximumPermittedNotional(
      context,
      riskReducing,
    );

    if (
      context.estimatedOrderNotional >
      maximumPermittedNotional + this.options.numericalTolerance
    ) {
      reducibleViolations.push(
        "Requested order notional exceeds the maximum permitted notional.",
      );
    }

    const requiredRiskReduction = this.calculateRequiredRiskReduction(context);

    const liquidityDeferred =
      this.options.deferOnInsufficientLiquidity &&
      !riskReducing &&
      (
        context.liquidityScore + this.options.numericalTolerance <
          limits.minimumLiquidityScore ||
        context.estimatedSlippageBps >
          this.options.maximumSlippageBps + this.options.numericalTolerance
      );

    return Object.freeze({
      hardViolations: uniqueSorted(hardViolations),
      reducibleViolations: uniqueSorted(reducibleViolations),
      warnings: uniqueSorted(warnings),
      maximumPermittedNotional,
      requiredRiskReduction,
      riskReducing,
      liquidityDeferred,
    });
  }

  private calculateMaximumPermittedNotional(
    context: AutonomousRiskContext,
    riskReducing: boolean,
  ): number {
    const limits = context.strategyLimits;

    if (riskReducing) {
      return Math.max(
        0,
        Math.min(
          context.estimatedOrderNotional,
          Math.max(
            context.currentPositionNotional,
            context.currentInstrumentExposure,
          ),
        ),
      );
    }

    const positionHeadroom = clampNonNegative(
      limits.maximumPositionNotional - context.currentPositionNotional,
    );
    const instrumentHeadroom = clampNonNegative(
      limits.maximumNetExposure - context.currentInstrumentExposure,
    );
    const grossHeadroom = clampNonNegative(
      limits.maximumGrossExposure - context.portfolio.grossExposure,
    );
    const capitalCapacity = clampNonNegative(
      context.portfolio.availableCapital * limits.maximumLeverage,
    );
    const leverageCapacity =
      context.estimatedLeverage <= this.options.numericalTolerance
        ? capitalCapacity
        : clampNonNegative(
            context.estimatedOrderNotional *
              (limits.maximumLeverage / context.estimatedLeverage),
          );

    return clampNonNegative(
      minimumFinite([
        limits.maximumOrderNotional,
        positionHeadroom,
        instrumentHeadroom,
        grossHeadroom,
        capitalCapacity,
        leverageCapacity,
      ]),
    );
  }

  private calculateRequiredRiskReduction(
    context: AutonomousRiskContext,
  ): number {
    const limits = context.strategyLimits;

    return Math.max(
      0,
      context.currentPositionNotional - limits.maximumPositionNotional,
      context.currentInstrumentExposure - limits.maximumNetExposure,
      context.portfolio.grossExposure - limits.maximumGrossExposure,
    );
  }

  private resolveStatus(
    requestedNotional: number,
    evaluation: RiskEvaluation,
  ): AutonomousTradeApprovalStatus {
    if (evaluation.hardViolations.length > 0) {
      const onlyRiskBreaches =
        evaluation.riskReducing &&
        this.options.permitRiskReducingTradesOnBreach &&
        evaluation.maximumPermittedNotional > this.options.numericalTolerance;

      if (!onlyRiskBreaches) {
        return "REJECTED";
      }
    }

    if (evaluation.liquidityDeferred) {
      return "DEFERRED";
    }

    if (evaluation.maximumPermittedNotional <= this.options.numericalTolerance) {
      return "REJECTED";
    }

    if (
      requestedNotional >
      evaluation.maximumPermittedNotional + this.options.numericalTolerance
    ) {
      return this.options.reduceOversizedTrades ? "REDUCED" : "REJECTED";
    }

    if (
      evaluation.reducibleViolations.length > 0 &&
      !evaluation.riskReducing
    ) {
      return evaluation.maximumPermittedNotional > this.options.numericalTolerance &&
        this.options.reduceOversizedTrades
        ? "REDUCED"
        : "REJECTED";
    }

    return "APPROVED";
  }

  private resolveApprovedNotional(
    requestedNotional: number,
    maximumPermittedNotional: number,
    status: AutonomousTradeApprovalStatus,
  ): number {
    switch (status) {
      case "APPROVED":
        return requestedNotional;
      case "REDUCED":
        return Math.min(requestedNotional, maximumPermittedNotional);
      case "REJECTED":
      case "DEFERRED":
        return 0;
      default: {
        const exhaustiveCheck: never = status;
        return exhaustiveCheck;
      }
    }
  }

  private isRiskReducing(
    context: AutonomousRiskContext,
    action: AutonomousTradeApprovalRequest["signal"]["action"],
  ): boolean {
    if (action === "CLOSE" || action === "REDUCE") {
      return true;
    }

    return (
      context.projectedPositionNotional < context.currentPositionNotional ||
      context.projectedInstrumentExposure < context.currentInstrumentExposure
    );
  }

  private isExecutableLifecycleState(
    lifecycleState: AutonomousRiskContext["strategy"]["lifecycleState"],
  ): boolean {
    return lifecycleState === "RUNNING" || lifecycleState === "DEGRADED";
  }

  private buildReason(
    status: AutonomousTradeApprovalStatus,
    requestedNotional: number,
    approvedNotional: number,
    maximumPermittedNotional: number,
    violations: readonly string[],
    warnings: readonly string[],
  ): string {
    switch (status) {
      case "APPROVED":
        return (
          `Trade approved for notional ${approvedNotional.toFixed(8)}. ` +
          `${warnings.length} warning(s) recorded.`
        );
      case "REDUCED":
        return (
          `Trade reduced from ${requestedNotional.toFixed(8)} to ` +
          `${approvedNotional.toFixed(8)}; maximum permitted notional is ` +
          `${maximumPermittedNotional.toFixed(8)}. ` +
          `${violations.length} limit condition(s) were identified.`
        );
      case "DEFERRED":
        return (
          "Trade deferred because current liquidity or expected execution " +
          "quality does not satisfy configured safeguards."
        );
      case "REJECTED":
        return (
          `Trade rejected with ${violations.length} violation(s); ` +
          `maximum permitted notional is ${maximumPermittedNotional.toFixed(8)}.`
        );
      default: {
        const exhaustiveCheck: never = status;
        return exhaustiveCheck;
      }
    }
  }
}

export function createAutonomousTradeApprovalEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousTradeApprovalEngineOptions = {},
): AutonomousTradeApprovalEngine {
  return new AutonomousTradeApprovalEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}