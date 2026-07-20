/**
 * QuantumTradeAI
 * Milestone 33 — AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-score-engine.ts
 *
 * Purpose:
 * Deterministically scores strategy candidates across performance, risk,
 * regime compatibility, diversification readiness, execution readiness,
 * operational health, recency, confidence, and capacity dimensions.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type StrategyPerformanceSnapshot,
  type StrategyRiskSnapshot,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
  AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyMarketRegime,
  type AiStrategyRegimeSnapshot,
  type AiStrategyScore,
  type AiStrategyScoreComponent,
  type AiStrategyScoreDimension,
  type AiStrategyScoreEnginePort,
  type AiStrategyScorePolicy,
  type AiStrategyScoreRequest,
  type AiStrategyScoreResult,
  type AiStrategyScoreWeight,
} from "./ai-strategy-portfolio-contracts";

export interface StrategyScoreEngineOptions {
  readonly scoreIdPrefix?: string;
  readonly recencyHalfLifeMilliseconds?: number;
  readonly minimumRecencyScore?: number;
  readonly defaultMetricConfidence?: number;
  readonly lowSampleTradeThreshold?: number;
  readonly matureSampleTradeThreshold?: number;
  readonly drawdownNormalizationMaximum?: number;
  readonly pnlReturnNormalizationScale?: number;
  readonly sharpeNormalizationScale?: number;
  readonly sortinoNormalizationScale?: number;
  readonly profitFactorNormalizationScale?: number;
  readonly evaluationNormalizationScale?: number;
  readonly signalNormalizationScale?: number;
  readonly rejectWhenTradingDisallowed?: boolean;
  readonly rejectWhenCircuitBreakerActive?: boolean;
  readonly rejectWhenKillSwitchActive?: boolean;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly scoreIdPrefix: string;
  readonly recencyHalfLifeMilliseconds: number;
  readonly minimumRecencyScore: number;
  readonly defaultMetricConfidence: number;
  readonly lowSampleTradeThreshold: number;
  readonly matureSampleTradeThreshold: number;
  readonly drawdownNormalizationMaximum: number;
  readonly pnlReturnNormalizationScale: number;
  readonly sharpeNormalizationScale: number;
  readonly sortinoNormalizationScale: number;
  readonly profitFactorNormalizationScale: number;
  readonly evaluationNormalizationScale: number;
  readonly signalNormalizationScale: number;
  readonly rejectWhenTradingDisallowed: boolean;
  readonly rejectWhenCircuitBreakerActive: boolean;
  readonly rejectWhenKillSwitchActive: boolean;
  readonly metadata: StrategyMetadata;
}

interface ComponentInput {
  readonly rawValue?: number;
  readonly score?: number;
  readonly confidence?: number;
  readonly explanation: string;
  readonly missing: boolean;
}

const DEFAULT_RECENCY_HALF_LIFE_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_MINIMUM_RECENCY_SCORE = 0.05;
const DEFAULT_METRIC_CONFIDENCE = 0.75;
const DEFAULT_LOW_SAMPLE_TRADE_THRESHOLD = 10;
const DEFAULT_MATURE_SAMPLE_TRADE_THRESHOLD = 100;
const DEFAULT_DRAWDOWN_NORMALIZATION_MAXIMUM = 0.5;
const DEFAULT_PNL_RETURN_NORMALIZATION_SCALE = 0.10;
const DEFAULT_SHARPE_NORMALIZATION_SCALE = 3;
const DEFAULT_SORTINO_NORMALIZATION_SCALE = 4;
const DEFAULT_PROFIT_FACTOR_NORMALIZATION_SCALE = 3;
const DEFAULT_EVALUATION_NORMALIZATION_SCALE = 1_000;
const DEFAULT_SIGNAL_NORMALIZATION_SCALE = 500;
const EPSILON = 1e-12;

const DIMENSION_ORDER: readonly AiStrategyScoreDimension[] = Object.freeze([
  "RETURN",
  "RISK_ADJUSTED_RETURN",
  "DRAWDOWN",
  "CONSISTENCY",
  "WIN_RATE",
  "PROFIT_FACTOR",
  "CAPACITY",
  "LIQUIDITY_FIT",
  "REGIME_FIT",
  "DIVERSIFICATION",
  "EXECUTION_QUALITY",
  "ROBUSTNESS",
  "RECENCY",
  "CONFIDENCE",
  "OPERATIONAL_HEALTH",
]);

const REGIME_FAMILY_FIT: Readonly<
  Partial<Record<AiStrategyMarketRegime, readonly string[]>>
> = Object.freeze({
  STRONG_BULL_TREND: Object.freeze(["TREND_FOLLOWING", "MOMENTUM", "BREAKOUT"]),
  WEAK_BULL_TREND: Object.freeze(["TREND_FOLLOWING", "MOMENTUM"]),
  STRONG_BEAR_TREND: Object.freeze(["TREND_FOLLOWING", "MOMENTUM", "BREAKOUT"]),
  WEAK_BEAR_TREND: Object.freeze(["TREND_FOLLOWING", "MEAN_REVERSION"]),
  SIDEWAYS_LOW_VOLATILITY: Object.freeze([
    "MEAN_REVERSION",
    "GRID_TRADING",
    "MARKET_MAKING",
    "STATISTICAL_ARBITRAGE",
  ]),
  SIDEWAYS_HIGH_VOLATILITY: Object.freeze([
    "BREAKOUT",
    "MEAN_REVERSION",
    "OPTIONS_AND_DERIVATIVES",
  ]),
  BREAKOUT_EXPANSION: Object.freeze(["BREAKOUT", "MOMENTUM", "TREND_FOLLOWING"]),
  MEAN_REVERTING: Object.freeze([
    "MEAN_REVERSION",
    "STATISTICAL_ARBITRAGE",
    "GRID_TRADING",
  ]),
  LIQUIDITY_STRESSED: Object.freeze([
    "MARKET_MAKING",
    "EXECUTION_ALGORITHM",
    "CROSS_EXCHANGE_ARBITRAGE",
  ]),
  FUNDING_DISLOCATION: Object.freeze([
    "FUNDING_RATE_ARBITRAGE",
    "CASH_AND_CARRY",
    "OPTIONS_AND_DERIVATIVES",
  ]),
  BASIS_DISLOCATION: Object.freeze([
    "CASH_AND_CARRY",
    "STATISTICAL_ARBITRAGE",
    "OPTIONS_AND_DERIVATIVES",
  ]),
  EVENT_DRIVEN: Object.freeze(["MOMENTUM", "BREAKOUT", "AI_NATIVE", "COMPOSITE"]),
  UNKNOWN: Object.freeze([]),
});

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_STRATEGY_METADATA;
  }

  return Object.freeze({ ...metadata });
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite number greater than zero.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function normalizeOptions(
  options: StrategyScoreEngineOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    scoreIdPrefix: options.scoreIdPrefix?.trim() || "strategy-score",
    recencyHalfLifeMilliseconds:
      options.recencyHalfLifeMilliseconds ??
      DEFAULT_RECENCY_HALF_LIFE_MILLISECONDS,
    minimumRecencyScore:
      options.minimumRecencyScore ?? DEFAULT_MINIMUM_RECENCY_SCORE,
    defaultMetricConfidence:
      options.defaultMetricConfidence ?? DEFAULT_METRIC_CONFIDENCE,
    lowSampleTradeThreshold:
      options.lowSampleTradeThreshold ?? DEFAULT_LOW_SAMPLE_TRADE_THRESHOLD,
    matureSampleTradeThreshold:
      options.matureSampleTradeThreshold ?? DEFAULT_MATURE_SAMPLE_TRADE_THRESHOLD,
    drawdownNormalizationMaximum:
      options.drawdownNormalizationMaximum ??
      DEFAULT_DRAWDOWN_NORMALIZATION_MAXIMUM,
    pnlReturnNormalizationScale:
      options.pnlReturnNormalizationScale ??
      DEFAULT_PNL_RETURN_NORMALIZATION_SCALE,
    sharpeNormalizationScale:
      options.sharpeNormalizationScale ?? DEFAULT_SHARPE_NORMALIZATION_SCALE,
    sortinoNormalizationScale:
      options.sortinoNormalizationScale ?? DEFAULT_SORTINO_NORMALIZATION_SCALE,
    profitFactorNormalizationScale:
      options.profitFactorNormalizationScale ??
      DEFAULT_PROFIT_FACTOR_NORMALIZATION_SCALE,
    evaluationNormalizationScale:
      options.evaluationNormalizationScale ??
      DEFAULT_EVALUATION_NORMALIZATION_SCALE,
    signalNormalizationScale:
      options.signalNormalizationScale ?? DEFAULT_SIGNAL_NORMALIZATION_SCALE,
    rejectWhenTradingDisallowed: options.rejectWhenTradingDisallowed ?? true,
    rejectWhenCircuitBreakerActive:
      options.rejectWhenCircuitBreakerActive ?? true,
    rejectWhenKillSwitchActive: options.rejectWhenKillSwitchActive ?? true,
    metadata: freezeMetadata(options.metadata),
  };

  assertFinitePositive(
    normalized.recencyHalfLifeMilliseconds,
    "recencyHalfLifeMilliseconds",
  );
  assertUnitInterval(normalized.minimumRecencyScore, "minimumRecencyScore");
  assertUnitInterval(
    normalized.defaultMetricConfidence,
    "defaultMetricConfidence",
  );
  assertFinitePositive(
    normalized.lowSampleTradeThreshold,
    "lowSampleTradeThreshold",
  );
  assertFinitePositive(
    normalized.matureSampleTradeThreshold,
    "matureSampleTradeThreshold",
  );
  assertFinitePositive(
    normalized.drawdownNormalizationMaximum,
    "drawdownNormalizationMaximum",
  );
  assertFinitePositive(
    normalized.pnlReturnNormalizationScale,
    "pnlReturnNormalizationScale",
  );
  assertFinitePositive(normalized.sharpeNormalizationScale, "sharpeNormalizationScale");
  assertFinitePositive(normalized.sortinoNormalizationScale, "sortinoNormalizationScale");
  assertFinitePositive(
    normalized.profitFactorNormalizationScale,
    "profitFactorNormalizationScale",
  );
  assertFinitePositive(
    normalized.evaluationNormalizationScale,
    "evaluationNormalizationScale",
  );
  assertFinitePositive(normalized.signalNormalizationScale, "signalNormalizationScale");

  if (
    normalized.matureSampleTradeThreshold < normalized.lowSampleTradeThreshold
  ) {
    throw new Error(
      "matureSampleTradeThreshold cannot be less than lowSampleTradeThreshold.",
    );
  }

  return Object.freeze(normalized);
}

function sortedWeights(
  policy: AiStrategyScorePolicy,
): readonly AiStrategyScoreWeight[] {
  const byDimension = new Map<AiStrategyScoreDimension, AiStrategyScoreWeight>();
  for (const weight of policy.weights) {
    if (!byDimension.has(weight.dimension)) {
      byDimension.set(weight.dimension, weight);
    }
  }

  return Object.freeze(
    DIMENSION_ORDER.map((dimension) => byDimension.get(dimension)).filter(
      (weight): weight is AiStrategyScoreWeight => weight !== undefined,
    ),
  );
}

function sampleConfidence(
  performance: StrategyPerformanceSnapshot,
  options: NormalizedOptions,
): number {
  const trades = performance.totalTrades ?? 0;
  if (trades <= 0) {
    const evaluations = Math.max(0, performance.totalEvaluations);
    return clamp(
      options.defaultMetricConfidence *
        Math.min(1, evaluations / options.evaluationNormalizationScale),
    );
  }

  if (trades < options.lowSampleTradeThreshold) {
    return clamp(0.25 * (trades / options.lowSampleTradeThreshold));
  }

  return clamp(
    0.25 +
      0.75 *
        Math.min(
          1,
          (trades - options.lowSampleTradeThreshold) /
            Math.max(
              1,
              options.matureSampleTradeThreshold -
                options.lowSampleTradeThreshold,
            ),
        ),
  );
}

function normalizeSignedMetric(value: number, scale: number): number {
  return clamp(0.5 + 0.5 * Math.tanh(value / scale));
}

function regimeFit(
  candidate: AiStrategyCandidate,
  regime: AiStrategyRegimeSnapshot,
): ComponentInput {
  const supported = candidate.compatibility.supportedRegimes;
  const excluded = candidate.compatibility.excludedRegimes;

  if (excluded.includes(regime.primaryRegime)) {
    return {
      rawValue: 0,
      score: 0,
      confidence: regime.confidence,
      explanation: `Primary regime ${regime.primaryRegime} is explicitly excluded by the strategy.`,
      missing: false,
    };
  }

  if (supported.includes(regime.primaryRegime)) {
    return {
      rawValue: 1,
      score: clamp(0.75 + 0.25 * regime.confidence),
      confidence: regime.confidence,
      explanation: `Primary regime ${regime.primaryRegime} is explicitly supported by the strategy.`,
      missing: false,
    };
  }

  const compatibleFamilies = REGIME_FAMILY_FIT[regime.primaryRegime] ?? [];
  if (compatibleFamilies.includes(candidate.classification.family)) {
    return {
      rawValue: 0.7,
      score: clamp(0.55 + 0.25 * regime.confidence),
      confidence: regime.confidence,
      explanation: `Strategy family ${candidate.classification.family} is generally compatible with ${regime.primaryRegime}.`,
      missing: false,
    };
  }

  if (regime.primaryRegime === "UNKNOWN") {
    return {
      rawValue: 0.5,
      score: 0.5,
      confidence: regime.confidence,
      explanation: "Market regime is unknown; a neutral regime-fit score was applied.",
      missing: false,
    };
  }

  return {
    rawValue: 0.35,
    score: clamp(0.35 + 0.15 * (1 - regime.confidence)),
    confidence: regime.confidence,
    explanation: `No explicit compatibility was declared for ${regime.primaryRegime}.`,
    missing: false,
  };
}

function operationalHealth(
  candidate: AiStrategyCandidate,
  risk: StrategyRiskSnapshot,
): ComponentInput {
  let score = 1;
  const reasons: string[] = [];

  if (!candidate.configuration.enabled) {
    score -= 0.5;
    reasons.push("configuration is disabled");
  }

  if (["SUSPENDED", "DISABLED", "INELIGIBLE"].includes(candidate.status)) {
    score -= 0.75;
    reasons.push(`candidate status is ${candidate.status}`);
  }

  if (!risk.tradingAllowed) {
    score -= 0.5;
    reasons.push("portfolio trading is not allowed");
  }

  if (risk.circuitBreakerActive) {
    score -= 0.75;
    reasons.push("circuit breaker is active");
  }

  if (risk.killSwitchActive) {
    score = 0;
    reasons.push("kill switch is active");
  }

  return {
    rawValue: clamp(score),
    score: clamp(score),
    confidence: 1,
    explanation:
      reasons.length === 0
        ? "Candidate and portfolio operational controls are healthy."
        : `Operational score reduced because ${reasons.join(", ")}.`,
    missing: false,
  };
}

function componentInput(
  dimension: AiStrategyScoreDimension,
  candidate: AiStrategyCandidate,
  request: AiStrategyScoreRequest,
  options: NormalizedOptions,
): ComponentInput {
  const performance = candidate.performance;
  const confidence = sampleConfidence(performance, options);

  switch (dimension) {
    case "RETURN": {
      const pnl = performance.realizedPnl;
      if (pnl === undefined) {
        return { explanation: "Realized PnL is unavailable.", missing: true };
      }
      return {
        rawValue: pnl,
        score: normalizeSignedMetric(pnl, options.pnlReturnNormalizationScale),
        confidence,
        explanation: `Realized PnL of ${pnl} was normalized using the configured return scale.`,
        missing: false,
      };
    }

    case "RISK_ADJUSTED_RETURN": {
      const values = [performance.sharpeRatio, performance.sortinoRatio].filter(
        (value): value is number => value !== undefined && Number.isFinite(value),
      );
      if (values.length === 0) {
        return {
          explanation: "Sharpe and Sortino ratios are unavailable.",
          missing: true,
        };
      }
      const sharpeScore =
        performance.sharpeRatio === undefined
          ? undefined
          : normalizeSignedMetric(
              performance.sharpeRatio,
              options.sharpeNormalizationScale,
            );
      const sortinoScore =
        performance.sortinoRatio === undefined
          ? undefined
          : normalizeSignedMetric(
              performance.sortinoRatio,
              options.sortinoNormalizationScale,
            );
      const scores = [sharpeScore, sortinoScore].filter(
        (value): value is number => value !== undefined,
      );
      return {
        rawValue: values.reduce((sum, value) => sum + value, 0) / values.length,
        score: scores.reduce((sum, value) => sum + value, 0) / scores.length,
        confidence,
        explanation: "Sharpe and Sortino metrics were combined into a risk-adjusted return score.",
        missing: false,
      };
    }

    case "DRAWDOWN": {
      const drawdown = performance.maximumDrawdown;
      if (drawdown === undefined) {
        return { explanation: "Maximum drawdown is unavailable.", missing: true };
      }
      const absoluteDrawdown = Math.abs(drawdown);
      return {
        rawValue: drawdown,
        score: clamp(1 - absoluteDrawdown / options.drawdownNormalizationMaximum),
        confidence,
        explanation: `Maximum drawdown of ${drawdown} was inversely normalized.`,
        missing: false,
      };
    }

    case "CONSISTENCY": {
      const trades = performance.totalTrades ?? 0;
      const wins = performance.winningTrades ?? 0;
      const losses = performance.losingTrades ?? 0;
      if (trades <= 0) {
        return { explanation: "Trade history is unavailable.", missing: true };
      }
      const classifiedRatio = clamp((wins + losses) / Math.max(1, trades));
      const balance = 1 - Math.min(1, Math.abs(wins - losses) / Math.max(1, trades));
      return {
        rawValue: classifiedRatio,
        score: clamp(0.65 * classifiedRatio + 0.35 * balance),
        confidence,
        explanation: "Consistency reflects classified trade coverage and outcome stability.",
        missing: false,
      };
    }

    case "WIN_RATE": {
      const winRate = performance.winRate;
      if (winRate === undefined) {
        return { explanation: "Win rate is unavailable.", missing: true };
      }
      const normalized = winRate > 1 ? winRate / 100 : winRate;
      return {
        rawValue: winRate,
        score: clamp(normalized),
        confidence,
        explanation: `Win rate of ${winRate} was normalized to the unit interval.`,
        missing: false,
      };
    }

    case "PROFIT_FACTOR": {
      const factor = performance.profitFactor;
      if (factor === undefined) {
        return { explanation: "Profit factor is unavailable.", missing: true };
      }
      return {
        rawValue: factor,
        score: clamp(factor / options.profitFactorNormalizationScale),
        confidence,
        explanation: `Profit factor of ${factor} was normalized using the configured scale.`,
        missing: false,
      };
    }

    case "CAPACITY": {
      const minimum = candidate.compatibility.minimumCapital ?? 0;
      const maximum = candidate.compatibility.maximumCapital;
      const configuredCapital = Number(candidate.metadata["configuredCapital"] ?? 0);
      let score = 1;
      if (Number.isFinite(configuredCapital) && configuredCapital > 0) {
        if (configuredCapital < minimum) {
          score = clamp(configuredCapital / Math.max(minimum, EPSILON));
        } else if (maximum !== undefined && configuredCapital > maximum) {
          score = clamp(maximum / configuredCapital);
        }
      }
      return {
        rawValue: configuredCapital,
        score,
        confidence: 0.8,
        explanation: "Capacity score reflects declared minimum and maximum capital compatibility.",
        missing: false,
      };
    }

    case "LIQUIDITY_FIT": {
      const requiresOrderBook = candidate.manifest.capabilities.some((capability) =>
        String(capability).includes("ORDER_BOOK"),
      );
      const liquidityScore = request.regime.liquidityScore;
      const score = requiresOrderBook
        ? clamp(liquidityScore)
        : clamp(0.5 + 0.5 * liquidityScore);
      return {
        rawValue: liquidityScore,
        score,
        confidence: request.regime.confidence,
        explanation: requiresOrderBook
          ? "Liquidity-sensitive strategy was scored directly against current liquidity conditions."
          : "Strategy has limited order-book dependency and received a moderated liquidity score.",
        missing: false,
      };
    }

    case "REGIME_FIT":
      return regimeFit(candidate, request.regime);

    case "DIVERSIFICATION": {
      const familyNovelty = candidate.classification.family === "COMPOSITE" ? 0.65 : 0.75;
      const intelligenceBonus =
        candidate.classification.intelligenceType === "HYBRID" ? 0.1 : 0;
      return {
        rawValue: familyNovelty,
        score: clamp(familyNovelty + intelligenceBonus),
        confidence: 0.5,
        explanation: "Pre-correlation diversification readiness is based on strategy family and intelligence type.",
        missing: false,
      };
    }

    case "EXECUTION_QUALITY": {
      const intents = Math.max(0, performance.totalOrderIntents);
      const signals = Math.max(0, performance.totalSignals);
      const conversion = signals > 0 ? clamp(intents / signals) : 0.5;
      const activity = clamp(intents / options.signalNormalizationScale);
      return {
        rawValue: conversion,
        score: clamp(0.7 * conversion + 0.3 * activity),
        confidence,
        explanation: "Execution quality reflects signal-to-order-intent conversion and observed activity.",
        missing: signals === 0 && intents === 0,
      };
    }

    case "ROBUSTNESS": {
      const evaluations = Math.max(0, performance.totalEvaluations);
      const trades = Math.max(0, performance.totalTrades ?? 0);
      const evaluationDepth = clamp(
        evaluations / options.evaluationNormalizationScale,
      );
      const tradeDepth = clamp(trades / options.matureSampleTradeThreshold);
      return {
        rawValue: evaluations,
        score: clamp(0.6 * evaluationDepth + 0.4 * tradeDepth),
        confidence,
        explanation: "Robustness reflects evaluation depth and completed trade history.",
        missing: evaluations === 0 && trades === 0,
      };
    }

    case "RECENCY": {
      const lastTimestamp =
        candidate.lastEvaluatedAt ?? performance.timestamp ?? candidate.discoveredAt;
      const age = Math.max(0, request.timestamp - lastTimestamp);
      const decay = Math.pow(0.5, age / options.recencyHalfLifeMilliseconds);
      return {
        rawValue: age,
        score: clamp(Math.max(options.minimumRecencyScore, decay)),
        confidence: 1,
        explanation: `Latest candidate evidence is ${age} milliseconds old.`,
        missing: false,
      };
    }

    case "CONFIDENCE":
      return {
        rawValue: confidence,
        score: confidence,
        confidence: 1,
        explanation: "Confidence is derived from available evaluation and trade sample depth.",
        missing: false,
      };

    case "OPERATIONAL_HEALTH":
      return operationalHealth(candidate, request.risk);
  }
}

function createComponent(
  weight: AiStrategyScoreWeight,
  input: ComponentInput,
  policy: AiStrategyScorePolicy,
): AiStrategyScoreComponent {
  const normalizedScore = input.missing
    ? policy.penalizeMissingMetrics
      ? clamp(policy.missingMetricPenalty)
      : 0.5
    : clamp(input.score ?? 0);
  const confidence = input.missing ? 0 : clamp(input.confidence ?? 0);
  const appliedWeight = weight.enabled ? Math.max(0, weight.weight) : 0;

  return Object.freeze({
    dimension: weight.dimension,
    rawValue: input.rawValue,
    normalizedScore,
    weight: appliedWeight,
    weightedScore: normalizedScore * appliedWeight,
    confidence,
    explanation: input.missing
      ? `${input.explanation} ${
          policy.penalizeMissingMetrics
            ? `Missing-metric penalty ${policy.missingMetricPenalty} was applied.`
            : "A neutral score was applied because missing-metric penalties are disabled."
        }`
      : input.explanation,
    metadata: EMPTY_STRATEGY_METADATA,
  });
}

function policyRejectionReasons(
  candidate: AiStrategyCandidate,
  compositeScore: number,
  confidence: number,
  request: AiStrategyScoreRequest,
  options: NormalizedOptions,
): readonly string[] {
  const reasons: string[] = [];
  const performance = candidate.performance;
  const policy = request.policy;

  if (candidate.status === "INELIGIBLE") {
    reasons.push("Candidate status is INELIGIBLE.");
  }
  if (candidate.status === "SUSPENDED") {
    reasons.push("Candidate status is SUSPENDED.");
  }
  if (candidate.status === "DISABLED") {
    reasons.push("Candidate status is DISABLED.");
  }
  if (!candidate.configuration.enabled) {
    reasons.push("Strategy configuration is disabled.");
  }
  if (compositeScore + EPSILON < policy.minimumCompositeScore) {
    reasons.push(
      `Composite score ${compositeScore} is below minimum ${policy.minimumCompositeScore}.`,
    );
  }
  if (confidence + EPSILON < policy.minimumConfidence) {
    reasons.push(
      `Score confidence ${confidence} is below minimum ${policy.minimumConfidence}.`,
    );
  }
  if (
    policy.minimumTradeCount !== undefined &&
    (performance.totalTrades ?? 0) < policy.minimumTradeCount
  ) {
    reasons.push(
      `Trade count ${performance.totalTrades ?? 0} is below minimum ${policy.minimumTradeCount}.`,
    );
  }
  if (
    policy.maximumDrawdown !== undefined &&
    performance.maximumDrawdown !== undefined &&
    Math.abs(performance.maximumDrawdown) > Math.abs(policy.maximumDrawdown)
  ) {
    reasons.push(
      `Maximum drawdown ${performance.maximumDrawdown} exceeds limit ${policy.maximumDrawdown}.`,
    );
  }
  if (
    policy.minimumProfitFactor !== undefined &&
    (performance.profitFactor === undefined ||
      performance.profitFactor < policy.minimumProfitFactor)
  ) {
    reasons.push(
      `Profit factor ${performance.profitFactor ?? "unavailable"} is below minimum ${policy.minimumProfitFactor}.`,
    );
  }
  if (
    policy.minimumSharpeRatio !== undefined &&
    (performance.sharpeRatio === undefined ||
      performance.sharpeRatio < policy.minimumSharpeRatio)
  ) {
    reasons.push(
      `Sharpe ratio ${performance.sharpeRatio ?? "unavailable"} is below minimum ${policy.minimumSharpeRatio}.`,
    );
  }
  if (
    policy.requirePositiveRealizedPnl &&
    (performance.realizedPnl === undefined || performance.realizedPnl <= 0)
  ) {
    reasons.push("Positive realized PnL is required.");
  }
  if (candidate.compatibility.excludedRegimes.includes(request.regime.primaryRegime)) {
    reasons.push(
      `Primary regime ${request.regime.primaryRegime} is explicitly excluded.`,
    );
  }
  if (options.rejectWhenTradingDisallowed && !request.risk.tradingAllowed) {
    reasons.push("Portfolio trading is not allowed by the risk snapshot.");
  }
  if (
    options.rejectWhenCircuitBreakerActive &&
    request.risk.circuitBreakerActive
  ) {
    reasons.push("Portfolio circuit breaker is active.");
  }
  if (options.rejectWhenKillSwitchActive && request.risk.killSwitchActive) {
    reasons.push("Portfolio kill switch is active.");
  }

  return Object.freeze(reasons);
}

function validateRequest(request: AiStrategyScoreRequest): void {
  if (request.runId.trim().length === 0) {
    throw new Error("request.runId must be a non-empty string.");
  }
  if (!Number.isFinite(request.timestamp) || request.timestamp < 0) {
    throw new Error("request.timestamp must be a non-negative finite number.");
  }

  const candidateIds = new Set<string>();
  for (const candidate of request.candidates) {
    const candidateId = candidate.identity.candidateId.trim();
    if (candidateId.length === 0) {
      throw new Error("candidate.identity.candidateId must be non-empty.");
    }
    if (candidateIds.has(candidateId)) {
      throw new Error(`Duplicate candidateId '${candidateId}'.`);
    }
    candidateIds.add(candidateId);
  }

  const dimensions = new Set<AiStrategyScoreDimension>();
  for (const weight of request.policy.weights) {
    if (dimensions.has(weight.dimension)) {
      throw new Error(`Duplicate score weight for dimension '${weight.dimension}'.`);
    }
    dimensions.add(weight.dimension);
    if (!Number.isFinite(weight.weight) || weight.weight < 0) {
      throw new Error(`Weight for '${weight.dimension}' must be non-negative.`);
    }
  }
}

export class StrategyScoreEngine implements AiStrategyScoreEnginePort {
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyScoreEngineOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public score(request: AiStrategyScoreRequest): AiStrategyScoreResult {
    validateRequest(request);

    const weights = sortedWeights(request.policy);
    const scores = [...request.candidates]
      .sort((left, right) =>
        left.identity.candidateId.localeCompare(right.identity.candidateId),
      )
      .map((candidate) => this.scoreCandidate(candidate, request, weights));

    const eligibleCandidateIds = scores
      .filter((score) => score.eligible)
      .map((score) => score.candidateId);
    const rejectedCandidateIds = scores
      .filter((score) => !score.eligible)
      .map((score) => score.candidateId);

    return Object.freeze({
      runId: request.runId,
      timestamp: request.timestamp,
      scores: Object.freeze(scores),
      eligibleCandidateIds: Object.freeze(eligibleCandidateIds),
      rejectedCandidateIds: Object.freeze(rejectedCandidateIds),
      metadata: this.options.metadata,
    });
  }

  private scoreCandidate(
    candidate: AiStrategyCandidate,
    request: AiStrategyScoreRequest,
    weights: readonly AiStrategyScoreWeight[],
  ): AiStrategyScore {
    const components = weights.map((weight) =>
      createComponent(
        weight,
        componentInput(weight.dimension, candidate, request, this.options),
        request.policy,
      ),
    );

    const enabledComponents = components.filter(
      (component) => component.weight > 0,
    );
    const totalWeight = enabledComponents.reduce(
      (sum, component) => sum + component.weight,
      0,
    );
    const compositeScore =
      totalWeight <= EPSILON
        ? AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM
        : clamp(
            enabledComponents.reduce(
              (sum, component) => sum + component.weightedScore,
              0,
            ) / totalWeight,
            AI_STRATEGY_PORTFOLIO_SCORE_MINIMUM,
            AI_STRATEGY_PORTFOLIO_SCORE_MAXIMUM,
          );
    const confidenceWeight = enabledComponents.reduce(
      (sum, component) => sum + component.weight,
      0,
    );
    const confidence =
      confidenceWeight <= EPSILON
        ? 0
        : clamp(
            enabledComponents.reduce(
              (sum, component) => sum + component.confidence * component.weight,
              0,
            ) / confidenceWeight,
          );

    const rejectionReasons = policyRejectionReasons(
      candidate,
      compositeScore,
      confidence,
      request,
      this.options,
    );

    return Object.freeze({
      scoreId: `${this.options.scoreIdPrefix}:${request.runId}:${candidate.identity.candidateId}`,
      candidateId: candidate.identity.candidateId,
      strategyId: candidate.identity.strategyId,
      strategyInstanceId: candidate.identity.strategyInstanceId,
      timestamp: request.timestamp,
      compositeScore,
      confidence,
      eligible: rejectionReasons.length === 0,
      components: Object.freeze(components),
      rejectionReasons,
      metadata: this.options.metadata,
    });
  }
}

export function createStrategyScoreEngine(
  options: StrategyScoreEngineOptions = {},
): StrategyScoreEngine {
  return new StrategyScoreEngine(options);
}

export default StrategyScoreEngine;
