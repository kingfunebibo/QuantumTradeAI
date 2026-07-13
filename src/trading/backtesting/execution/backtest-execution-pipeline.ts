import type {
  DeterministicExecutionRuntime,
  ExecutionReport,
  ExecutionRequest,
} from "../../execution";

import type {
  DeterministicPositionRuntime,
  PositionUpdate,
} from "../../portfolio";

import type { BacktestSession } from "../session";
import type { BacktestRiskEvaluation } from "../risk";

import type {
  BacktestExecutionCompletedEvaluation,
  BacktestExecutionEvaluation,
  BacktestExecutionMetrics,
  BacktestExecutionParameters,
  BacktestExecutionRejectedEvaluation,
  BacktestExecutionSkippedEvaluation,
  BacktestPortfolioProcessor,
  ExecutionEvaluator,
} from "./backtest-execution-pipeline.types";

const EXECUTION_METRIC_PREFIX = "execution";

export class BacktestExecutionPipeline {
  private readonly evaluations: BacktestExecutionEvaluation[] = [];

  private lastCandleIndex: number | null = null;
  private lastEvaluationTimestamp: number | null = null;

  private metrics: BacktestExecutionMetrics =
    BacktestExecutionPipeline.createEmptyMetrics();

  public constructor(
    private readonly executionEngine: ExecutionEvaluator,
    private readonly portfolioManager: BacktestPortfolioProcessor,
    private readonly executionRuntime: DeterministicExecutionRuntime,
    private readonly positionRuntime: DeterministicPositionRuntime,
    private readonly session?: BacktestSession,
  ) {
    this.validateDependencies();
  }

  public evaluate(
    riskEvaluation: BacktestRiskEvaluation,
    parameters: BacktestExecutionParameters,
  ): BacktestExecutionEvaluation {
    this.validateRiskEvaluation(riskEvaluation);
    this.validateParameters(parameters);
    this.validateOrdering(riskEvaluation);

    this.advanceRuntimes(riskEvaluation.evaluatedAt);

    let evaluation: BacktestExecutionEvaluation;

    if (riskEvaluation.outcome === "SKIPPED") {
      evaluation = this.createRiskSkippedEvaluation(riskEvaluation);
    } else if (riskEvaluation.outcome === "REJECTED") {
      evaluation = this.createRiskRejectedEvaluation(riskEvaluation);
    } else {
      evaluation = this.executeApprovedTrade(
        riskEvaluation,
        parameters.marketPrice,
      );
    }

    this.evaluations.push(evaluation);
    this.lastCandleIndex = riskEvaluation.candleIndex;
    this.lastEvaluationTimestamp = riskEvaluation.evaluatedAt;

    this.recordSessionState(evaluation);

    return evaluation;
  }

  public getMetrics(): BacktestExecutionMetrics {
    return Object.freeze({
      ...this.metrics,
    });
  }

  public getEvaluations(): readonly BacktestExecutionEvaluation[] {
    return Object.freeze([...this.evaluations]);
  }

  public getLatestEvaluation():
    | BacktestExecutionEvaluation
    | undefined {
    return this.evaluations.at(-1);
  }

  public reset(): void {
    this.evaluations.splice(0, this.evaluations.length);

    this.lastCandleIndex = null;
    this.lastEvaluationTimestamp = null;

    this.metrics =
      BacktestExecutionPipeline.createEmptyMetrics();

    this.executionEngine.clear();
    this.portfolioManager.clear();

    /*
     * ExecutionEngine.clear() resets its injected runtime.
     * PortfolioManager.clear() resets the PositionManager runtime.
     *
     * Calling reset directly as well keeps the pipeline correct for
     * compatible test doubles whose clear methods do not own the
     * supplied deterministic runtimes.
     */
    this.executionRuntime.reset();
    this.positionRuntime.reset();

    this.recordAllSessionMetrics();
  }

  private executeApprovedTrade(
    riskEvaluation: Extract<
      BacktestRiskEvaluation,
      { readonly outcome: "APPROVED" }
    >,
    marketPrice: number,
  ): BacktestExecutionEvaluation {
    const request: ExecutionRequest & {
      readonly marketPrice: number;
    } = {
      trade: riskEvaluation.trade,
      marketPrice,
    };

    const report = this.executionEngine.executeMarketOrder(request);

    if (!report.accepted || report.fill === undefined) {
      return this.createExecutionRejectedEvaluation(
        riskEvaluation,
        request,
        report,
      );
    }

    const acceptedReport: ExecutionReport & {
      readonly accepted: true;
      readonly fill: NonNullable<ExecutionReport["fill"]>;
    } = {
      ...report,
      accepted: true,
      fill: report.fill,
    };

    const positionUpdate =
      this.portfolioManager.processExecution(acceptedReport);

    const portfolioSnapshot =
      this.portfolioManager.getSnapshot();

    const evaluation: BacktestExecutionCompletedEvaluation = {
      outcome: "EXECUTED",
      candleIndex: riskEvaluation.candleIndex,
      evaluatedAt: riskEvaluation.evaluatedAt,
      strategyId: riskEvaluation.strategyId,
      strategySignal: riskEvaluation.strategySignal,
      riskEvaluation,
      reason: report.reason,
      request,
      report: acceptedReport,
      positionUpdate,
      portfolioSnapshot,
    };

    this.incrementExecutionMetrics(
      acceptedReport,
      positionUpdate,
    );

    return Object.freeze(evaluation);
  }

  private createExecutionRejectedEvaluation(
    riskEvaluation: Extract<
      BacktestRiskEvaluation,
      { readonly outcome: "APPROVED" }
    >,
    request: ExecutionRequest & {
      readonly marketPrice: number;
    },
    report: ExecutionReport,
  ): BacktestExecutionRejectedEvaluation {
    const rejectedReport: ExecutionReport & {
      readonly accepted: false;
      readonly fill?: never;
    } = {
      ...report,
      accepted: false,
      fill: undefined,
    };

    this.metrics = {
      ...this.metrics,
      evaluations: this.metrics.evaluations + 1,
      rejected: this.metrics.rejected + 1,
    };

    return Object.freeze({
      outcome: "REJECTED",
      candleIndex: riskEvaluation.candleIndex,
      evaluatedAt: riskEvaluation.evaluatedAt,
      strategyId: riskEvaluation.strategyId,
      strategySignal: riskEvaluation.strategySignal,
      riskEvaluation,
      reason: report.reason,
      request,
      report: rejectedReport,
    });
  }

  private createRiskSkippedEvaluation(
    riskEvaluation: Extract<
      BacktestRiskEvaluation,
      { readonly outcome: "SKIPPED" }
    >,
  ): BacktestExecutionSkippedEvaluation {
    this.metrics = {
      ...this.metrics,
      evaluations: this.metrics.evaluations + 1,
      skipped: this.metrics.skipped + 1,
      skippedRiskSkipped:
        this.metrics.skippedRiskSkipped + 1,
    };

    return Object.freeze({
      outcome: "SKIPPED",
      skipReason: "RISK_SKIPPED",
      candleIndex: riskEvaluation.candleIndex,
      evaluatedAt: riskEvaluation.evaluatedAt,
      strategyId: riskEvaluation.strategyId,
      strategySignal: riskEvaluation.strategySignal,
      riskEvaluation,
      reason:
        "Execution skipped because the risk pipeline skipped the signal.",
    });
  }

  private createRiskRejectedEvaluation(
    riskEvaluation: Extract<
      BacktestRiskEvaluation,
      { readonly outcome: "REJECTED" }
    >,
  ): BacktestExecutionSkippedEvaluation {
    this.metrics = {
      ...this.metrics,
      evaluations: this.metrics.evaluations + 1,
      skipped: this.metrics.skipped + 1,
      skippedRiskRejected:
        this.metrics.skippedRiskRejected + 1,
    };

    return Object.freeze({
      outcome: "SKIPPED",
      skipReason: "RISK_REJECTED",
      candleIndex: riskEvaluation.candleIndex,
      evaluatedAt: riskEvaluation.evaluatedAt,
      strategyId: riskEvaluation.strategyId,
      strategySignal: riskEvaluation.strategySignal,
      riskEvaluation,
      reason:
        "Execution skipped because the risk pipeline rejected the trade.",
    });
  }

  private incrementExecutionMetrics(
    report: ExecutionReport & {
      readonly accepted: true;
      readonly fill: NonNullable<ExecutionReport["fill"]>;
    },
    positionUpdate: PositionUpdate,
  ): void {
    const fill = report.fill;

    this.metrics = {
      ...this.metrics,
      evaluations: this.metrics.evaluations + 1,
      executed: this.metrics.executed + 1,

      buyExecutions:
        this.metrics.buyExecutions +
        (fill.side === "BUY" ? 1 : 0),

      sellExecutions:
        this.metrics.sellExecutions +
        (fill.side === "SELL" ? 1 : 0),

      openedPositions:
        this.metrics.openedPositions +
        (positionUpdate.action === "OPENED" ? 1 : 0),

      increasedPositions:
        this.metrics.increasedPositions +
        (positionUpdate.action === "INCREASED" ? 1 : 0),

      reducedPositions:
        this.metrics.reducedPositions +
        (positionUpdate.action === "REDUCED" ? 1 : 0),

      closedPositions:
        this.metrics.closedPositions +
        (positionUpdate.action === "CLOSED" ? 1 : 0),

      reversedPositions:
        this.metrics.reversedPositions +
        (positionUpdate.action === "REVERSED" ? 1 : 0),

      totalFilledQuantity:
        this.metrics.totalFilledQuantity + fill.quantity,

      totalGrossNotional:
        this.metrics.totalGrossNotional + fill.grossNotional,

      totalFees:
        this.metrics.totalFees + fill.fee,

      totalSlippageAmount:
        this.metrics.totalSlippageAmount +
        fill.slippageAmount,

      totalGrossRealizedPnl:
        this.metrics.totalGrossRealizedPnl +
        positionUpdate.grossRealizedPnl,
    };
  }

  private advanceRuntimes(timestamp: number): void {
    this.executionRuntime.advanceTo(timestamp);
    this.positionRuntime.advanceTo(timestamp);
  }

  private recordSessionState(
    evaluation: BacktestExecutionEvaluation,
  ): void {
    if (this.session === undefined) {
      return;
    }

    this.recordAllSessionMetrics();

    const payload: Record<
      string,
      string | number | boolean | null
    > = {
      outcome: evaluation.outcome,
      candleIndex: evaluation.candleIndex,
      evaluatedAt: evaluation.evaluatedAt,
      strategyId: evaluation.strategyId,
      reason: evaluation.reason,
    };

    if (evaluation.outcome === "SKIPPED") {
      payload.skipReason = evaluation.skipReason;
    }

    if (evaluation.outcome === "REJECTED") {
      payload.orderId = evaluation.report.order.id;
    }

    if (evaluation.outcome === "EXECUTED") {
      payload.orderId = evaluation.report.order.id;
      payload.fillId = evaluation.report.fill.id;
      payload.symbol = evaluation.report.fill.symbol;
      payload.side = evaluation.report.fill.side;
      payload.quantity = evaluation.report.fill.quantity;
      payload.fillPrice = evaluation.report.fill.fillPrice;
      payload.fee = evaluation.report.fill.fee;
      payload.positionAction =
        evaluation.positionUpdate.action;
    }

    this.session.recordEvent(
      `${EXECUTION_METRIC_PREFIX}.${evaluation.outcome.toLowerCase()}`,
      payload,
    );
  }

  private recordAllSessionMetrics(): void {
    if (this.session === undefined) {
      return;
    }

    for (const [name, value] of Object.entries(this.metrics)) {
      this.session.setMetric(
        `${EXECUTION_METRIC_PREFIX}.${name}`,
        value,
      );
    }
  }

  private validateRiskEvaluation(
    riskEvaluation: BacktestRiskEvaluation,
  ): void {
    if (
      riskEvaluation === null ||
      typeof riskEvaluation !== "object"
    ) {
      throw new Error(
        "Backtest execution risk evaluation must be an object.",
      );
    }

    if (
      riskEvaluation.outcome !== "APPROVED" &&
      riskEvaluation.outcome !== "REJECTED" &&
      riskEvaluation.outcome !== "SKIPPED"
    ) {
      throw new Error(
        "Backtest execution risk outcome is invalid.",
      );
    }

    if (
      !Number.isSafeInteger(riskEvaluation.candleIndex) ||
      riskEvaluation.candleIndex < 0
    ) {
      throw new Error(
        "Backtest execution candle index must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(riskEvaluation.evaluatedAt) ||
      riskEvaluation.evaluatedAt < 0
    ) {
      throw new Error(
        "Backtest execution timestamp must be a non-negative safe integer.",
      );
    }

    if (
      typeof riskEvaluation.strategyId !== "string" ||
      riskEvaluation.strategyId.trim().length === 0
    ) {
      throw new Error(
        "Backtest execution strategy ID must be non-empty.",
      );
    }

    if (
      riskEvaluation.outcome === "APPROVED" &&
      (riskEvaluation.trade === null ||
        typeof riskEvaluation.trade !== "object")
    ) {
      throw new Error(
        "Approved risk evaluations must contain an approved trade.",
      );
    }
  }

  private validateParameters(
    parameters: BacktestExecutionParameters,
  ): void {
    if (
      parameters === null ||
      typeof parameters !== "object"
    ) {
      throw new Error(
        "Backtest execution parameters must be an object.",
      );
    }

    if (
      !Number.isFinite(parameters.marketPrice) ||
      parameters.marketPrice <= 0
    ) {
      throw new Error(
        "Backtest execution market price must be a positive finite number.",
      );
    }
  }

  private validateOrdering(
    riskEvaluation: BacktestRiskEvaluation,
  ): void {
    if (
      this.lastCandleIndex !== null &&
      riskEvaluation.candleIndex <= this.lastCandleIndex
    ) {
      throw new Error(
        "Backtest execution evaluations must preserve strictly increasing candle order.",
      );
    }

    if (
      this.lastEvaluationTimestamp !== null &&
      riskEvaluation.evaluatedAt <
        this.lastEvaluationTimestamp
    ) {
      throw new Error(
        "Backtest execution evaluation time cannot move backwards.",
      );
    }
  }

  private validateDependencies(): void {
    if (
      this.executionEngine === null ||
      typeof this.executionEngine !== "object" ||
      typeof this.executionEngine.executeMarketOrder !==
        "function" ||
      typeof this.executionEngine.clear !== "function"
    ) {
      throw new Error(
        "Backtest execution pipeline requires a valid execution engine.",
      );
    }

    if (
      this.portfolioManager === null ||
      typeof this.portfolioManager !== "object" ||
      typeof this.portfolioManager.processExecution !==
        "function" ||
      typeof this.portfolioManager.getSnapshot !== "function" ||
      typeof this.portfolioManager.clear !== "function"
    ) {
      throw new Error(
        "Backtest execution pipeline requires a valid portfolio manager.",
      );
    }

    if (
      this.executionRuntime === null ||
      typeof this.executionRuntime !== "object" ||
      typeof this.executionRuntime.advanceTo !== "function" ||
      typeof this.executionRuntime.reset !== "function"
    ) {
      throw new Error(
        "Backtest execution pipeline requires a deterministic execution runtime.",
      );
    }

    if (
      this.positionRuntime === null ||
      typeof this.positionRuntime !== "object" ||
      typeof this.positionRuntime.advanceTo !== "function" ||
      typeof this.positionRuntime.reset !== "function"
    ) {
      throw new Error(
        "Backtest execution pipeline requires a deterministic position runtime.",
      );
    }

    if (
      this.session !== undefined &&
      (this.session === null ||
        typeof this.session !== "object" ||
        typeof this.session.recordEvent !== "function" ||
        typeof this.session.setMetric !== "function")
    ) {
      throw new Error(
        "Backtest execution pipeline session is invalid.",
      );
    }
  }

  private static createEmptyMetrics(): BacktestExecutionMetrics {
    return {
      evaluations: 0,
      executed: 0,
      rejected: 0,
      skipped: 0,
      skippedRiskRejected: 0,
      skippedRiskSkipped: 0,
      buyExecutions: 0,
      sellExecutions: 0,
      openedPositions: 0,
      increasedPositions: 0,
      reducedPositions: 0,
      closedPositions: 0,
      reversedPositions: 0,
      totalFilledQuantity: 0,
      totalGrossNotional: 0,
      totalFees: 0,
      totalSlippageAmount: 0,
      totalGrossRealizedPnl: 0,
    };
  }
}