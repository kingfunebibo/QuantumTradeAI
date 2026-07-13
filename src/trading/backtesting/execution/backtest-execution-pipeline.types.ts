import type {
  ExecutionReport,
  ExecutionRequest,
} from "../../execution";

import type {
  PortfolioSnapshot,
  PositionUpdate,
} from "../../portfolio";

import type {
  BacktestRiskEvaluation,
} from "../risk";

/**
 * Minimal contract implemented by ExecutionEngine.
 *
 * The backtest pipeline depends on this abstraction rather
 * than the concrete class, which keeps the pipeline testable.
 */
export interface ExecutionEvaluator {
  executeMarketOrder(
    request: ExecutionRequest,
  ): ExecutionReport;

  clear(): void;
}

/**
 * Minimal portfolio contract required by the deterministic
 * execution pipeline.
 */
export interface BacktestPortfolioProcessor {
  processExecution(
    report: ExecutionReport,
  ): PositionUpdate;

  getSnapshot(): PortfolioSnapshot;

  clear(): void;
}

/**
 * Explicit execution inputs supplied for the current candle.
 *
 * marketPrice is required by the backtest pipeline even though
 * ExecutionRequest permits it to be omitted. Backtests must use
 * an explicit deterministic market price.
 */
export interface BacktestExecutionParameters {
  readonly marketPrice: number;
}

export type BacktestExecutionOutcome =
  | "EXECUTED"
  | "REJECTED"
  | "SKIPPED";

export type BacktestExecutionSkipReason =
  | "RISK_SKIPPED"
  | "RISK_REJECTED";

/**
 * Fields shared by every execution pipeline evaluation.
 */
export interface BacktestExecutionEvaluationBase {
  readonly outcome:
    BacktestExecutionOutcome;

  readonly candleIndex: number;
  readonly evaluatedAt: number;

  readonly strategyId: string;
  readonly strategySignal:
    BacktestRiskEvaluation[
      "strategySignal"
    ];

  readonly riskEvaluation:
    BacktestRiskEvaluation;

  readonly reason: string;
}

/**
 * ExecutionEngine was intentionally not called because the
 * upstream risk pipeline did not approve a trade.
 */
export interface BacktestExecutionSkippedEvaluation
  extends BacktestExecutionEvaluationBase {
  readonly outcome: "SKIPPED";

  readonly skipReason:
    BacktestExecutionSkipReason;

  readonly request?: never;
  readonly report?: never;
  readonly positionUpdate?: never;
  readonly portfolioSnapshot?: never;
}

/**
 * ExecutionEngine evaluated an approved trade but rejected
 * the execution request.
 */
export interface BacktestExecutionRejectedEvaluation
  extends BacktestExecutionEvaluationBase {
  readonly outcome: "REJECTED";

  readonly request:
    ExecutionRequest & {
      readonly marketPrice: number;
    };

  readonly report:
    ExecutionReport & {
      readonly accepted: false;
      readonly fill?: never;
    };

  readonly positionUpdate?: never;
  readonly portfolioSnapshot?: never;
}

/**
 * The approved trade was filled and applied to the portfolio.
 */
export interface BacktestExecutionCompletedEvaluation
  extends BacktestExecutionEvaluationBase {
  readonly outcome: "EXECUTED";

  readonly request:
    ExecutionRequest & {
      readonly marketPrice: number;
    };

  readonly report:
    ExecutionReport & {
      readonly accepted: true;
      readonly fill:
        NonNullable<
          ExecutionReport["fill"]
        >;
    };

  readonly positionUpdate:
    PositionUpdate;

  readonly portfolioSnapshot:
    PortfolioSnapshot;
}

/**
 * Discriminated result returned for every risk evaluation.
 */
export type BacktestExecutionEvaluation =
  | BacktestExecutionCompletedEvaluation
  | BacktestExecutionRejectedEvaluation
  | BacktestExecutionSkippedEvaluation;

/**
 * Aggregate deterministic execution counters.
 */
export interface BacktestExecutionMetrics {
  readonly evaluations: number;

  readonly executed: number;
  readonly rejected: number;
  readonly skipped: number;

  readonly skippedRiskRejected:
    number;

  readonly skippedRiskSkipped:
    number;

  readonly buyExecutions: number;
  readonly sellExecutions: number;

  readonly openedPositions: number;
  readonly increasedPositions: number;
  readonly reducedPositions: number;
  readonly closedPositions: number;
  readonly reversedPositions: number;

  readonly totalFilledQuantity: number;
  readonly totalGrossNotional: number;
  readonly totalFees: number;
  readonly totalSlippageAmount: number;
  readonly totalGrossRealizedPnl:
    number;
}