import type {
  ApprovedTrade,
  RiskAccount,
  RiskDecision,
} from "../../risk";

import type {
  BacktestSignalEvaluation,
} from "../signal";

/**
 * Minimal abstraction implemented by RiskManager.
 *
 * Keeping the backtest pipeline dependent on this interface
 * allows the real RiskManager to be used in production while
 * permitting focused test doubles when required.
 */
export interface RiskEvaluator {
  evaluate(
    request: BacktestRiskRequest,
  ): RiskDecision;
}

/**
 * Explicit inputs required to evaluate an accepted signal.
 *
 * The signal itself is obtained from BacktestSignalEvaluation
 * and must not be supplied independently.
 */
export interface BacktestRiskParameters {
  readonly account: RiskAccount;
  readonly stopLossPrice: number;
  readonly leverage?: number;
}

/**
 * Fully resolved request passed to the real RiskManager.
 */
export interface BacktestRiskRequest {
  readonly signal:
    NonNullable<
      BacktestSignalEvaluation["signal"]
    >;

  readonly account: RiskAccount;
  readonly stopLossPrice: number;
  readonly leverage?: number;
}

export type BacktestRiskOutcome =
  | "APPROVED"
  | "REJECTED"
  | "SKIPPED";

export type BacktestRiskSkipReason =
  | "SIGNAL_REJECTED"
  | "SIGNAL_HOLD";

/**
 * Fields shared by every risk pipeline result.
 */
export interface BacktestRiskEvaluationBase {
  readonly outcome: BacktestRiskOutcome;

  readonly candleIndex: number;
  readonly evaluatedAt: number;

  readonly strategyId: string;
  readonly strategySignal:
    BacktestSignalEvaluation[
      "strategySignal"
    ];

  readonly signalEvaluation:
    BacktestSignalEvaluation;

  readonly reason: string;
}

/**
 * The upstream signal evaluation did not produce an actionable
 * accepted TradeSignal, so RiskManager was intentionally not run.
 */
export interface BacktestRiskSkippedEvaluation
  extends BacktestRiskEvaluationBase {
  readonly outcome: "SKIPPED";
  readonly skipReason:
    BacktestRiskSkipReason;

  readonly request?: never;
  readonly decision?: never;
  readonly trade?: never;
}

/**
 * RiskManager evaluated the accepted signal but rejected it.
 */
export interface BacktestRiskRejectedEvaluation
  extends BacktestRiskEvaluationBase {
  readonly outcome: "REJECTED";

  readonly request:
    BacktestRiskRequest;

  readonly decision:
    RiskDecision & {
      readonly approved: false;
      readonly trade?: never;
    };

  readonly trade?: never;
}

/**
 * RiskManager approved the accepted signal.
 */
export interface BacktestRiskApprovedEvaluation
  extends BacktestRiskEvaluationBase {
  readonly outcome: "APPROVED";

  readonly request:
    BacktestRiskRequest;

  readonly decision:
    RiskDecision & {
      readonly approved: true;
      readonly trade:
        ApprovedTrade;
    };

  readonly trade:
    ApprovedTrade;
}

/**
 * Discriminated result returned for every signal evaluation.
 */
export type BacktestRiskEvaluation =
  | BacktestRiskApprovedEvaluation
  | BacktestRiskRejectedEvaluation
  | BacktestRiskSkippedEvaluation;

/**
 * Aggregate deterministic counters maintained by the pipeline.
 */
export interface BacktestRiskMetrics {
  readonly evaluations: number;

  readonly approved: number;
  readonly rejected: number;
  readonly skipped: number;

  readonly skippedRejectedSignal:
    number;

  readonly skippedHold: number;

  readonly approvedBuy: number;
  readonly approvedSell: number;

  readonly totalApprovedRiskAmount:
    number;

  readonly totalApprovedMargin:
    number;

  readonly totalApprovedNotional:
    number;
}