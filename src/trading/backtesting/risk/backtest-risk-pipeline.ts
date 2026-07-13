import type {
  ApprovedTrade,
  RiskAccount,
  RiskDecision,
} from "../../risk";

import type {
  BacktestSession,
} from "../session";

import type {
  BacktestSignalEvaluation,
} from "../signal";

import type {
  BacktestRiskApprovedEvaluation,
  BacktestRiskEvaluation,
  BacktestRiskMetrics,
  BacktestRiskParameters,
  BacktestRiskRejectedEvaluation,
  BacktestRiskRequest,
  BacktestRiskSkippedEvaluation,
  BacktestRiskSkipReason,
  RiskEvaluator,
} from "./backtest-risk-pipeline.types";

export class DeterministicBacktestRiskPipeline {
  private lastEvaluatedIndex: number | null =
    null;

  private evaluationCount = 0;
  private approvedCount = 0;
  private rejectedCount = 0;
  private skippedCount = 0;

  private skippedRejectedSignalCount = 0;
  private skippedHoldCount = 0;

  private approvedBuyCount = 0;
  private approvedSellCount = 0;

  private totalApprovedRiskAmount = 0;
  private totalApprovedMargin = 0;
  private totalApprovedNotional = 0;

  private lastDecision:
    BacktestRiskEvaluation | null = null;

  public constructor(
    private readonly riskEvaluator:
      RiskEvaluator,
  ) {
    this.validateRiskEvaluator(
      riskEvaluator,
    );
  }

  public evaluate(
    session: BacktestSession,
    signalEvaluation:
      BacktestSignalEvaluation,
    parameters:
      BacktestRiskParameters,
  ): BacktestRiskEvaluation {
    this.validateSession(session);

    this.validateSignalEvaluation(
      signalEvaluation,
    );

    this.validateParameters(
      parameters,
    );

    const simulationTime =
      session.getSimulationTime();

    const progress =
      session.getProgress();

    if (simulationTime === null) {
      throw new Error(
        "Risk pipeline cannot evaluate without a " +
          "simulation timestamp.",
      );
    }

    if (progress.currentIndex === null) {
      throw new Error(
        "Risk pipeline cannot evaluate without a " +
          "current candle index.",
      );
    }

    if (
      signalEvaluation.candleIndex !==
      progress.currentIndex
    ) {
      throw new Error(
        "Risk pipeline signal evaluation index must " +
          "match the current session candle index.",
      );
    }

    if (
      signalEvaluation.evaluatedAt !==
      simulationTime
    ) {
      throw new Error(
        "Risk pipeline signal timestamp must match " +
          "the current simulation timestamp.",
      );
    }

    this.validateEvaluationIndex(
      signalEvaluation.candleIndex,
    );

    const evaluation =
      this.resolveEvaluation(
        signalEvaluation,
        parameters,
      );

    this.lastEvaluatedIndex =
      signalEvaluation.candleIndex;

    this.evaluationCount += 1;

    this.updateCounters(evaluation);

    const frozenEvaluation =
      this.freezeEvaluation(
        evaluation,
      );

    this.lastDecision =
      frozenEvaluation;

    this.updateSession(
      session,
      frozenEvaluation,
    );

    return frozenEvaluation;
  }

  public getEvaluationCount(): number {
    return this.evaluationCount;
  }

  public getApprovedCount(): number {
    return this.approvedCount;
  }

  public getRejectedCount(): number {
    return this.rejectedCount;
  }

  public getSkippedCount(): number {
    return this.skippedCount;
  }

  public getLastDecision():
    BacktestRiskEvaluation | null {
    return this.lastDecision;
  }

  public getMetrics():
    BacktestRiskMetrics {
    return Object.freeze({
      evaluations:
        this.evaluationCount,
      approved:
        this.approvedCount,
      rejected:
        this.rejectedCount,
      skipped:
        this.skippedCount,
      skippedRejectedSignal:
        this.skippedRejectedSignalCount,
      skippedHold:
        this.skippedHoldCount,
      approvedBuy:
        this.approvedBuyCount,
      approvedSell:
        this.approvedSellCount,
      totalApprovedRiskAmount:
        this.totalApprovedRiskAmount,
      totalApprovedMargin:
        this.totalApprovedMargin,
      totalApprovedNotional:
        this.totalApprovedNotional,
    });
  }

  public reset(): void {
    this.lastEvaluatedIndex = null;

    this.evaluationCount = 0;
    this.approvedCount = 0;
    this.rejectedCount = 0;
    this.skippedCount = 0;

    this.skippedRejectedSignalCount = 0;
    this.skippedHoldCount = 0;

    this.approvedBuyCount = 0;
    this.approvedSellCount = 0;

    this.totalApprovedRiskAmount = 0;
    this.totalApprovedMargin = 0;
    this.totalApprovedNotional = 0;

    this.lastDecision = null;
  }

  private resolveEvaluation(
    signalEvaluation:
      BacktestSignalEvaluation,
    parameters:
      BacktestRiskParameters,
  ): BacktestRiskEvaluation {
    if (
      signalEvaluation.strategySignal ===
      "HOLD"
    ) {
      return this.createSkippedEvaluation(
        signalEvaluation,
        "SIGNAL_HOLD",
        "Risk evaluation skipped because the strategy signal is HOLD.",
      );
    }

    if (
      !signalEvaluation.accepted ||
      signalEvaluation.signal === undefined
    ) {
      return this.createSkippedEvaluation(
        signalEvaluation,
        "SIGNAL_REJECTED",
        "Risk evaluation skipped because the upstream signal was rejected.",
      );
    }

    const request:
      BacktestRiskRequest = {
        signal:
          signalEvaluation.signal,
        account:
          this.freezeAccount(
            parameters.account,
          ),
        stopLossPrice:
          parameters.stopLossPrice,
        leverage:
          parameters.leverage,
      };

    const decision =
      this.riskEvaluator.evaluate(
        request,
      );

    this.validateRiskDecision(
      decision,
      request,
      signalEvaluation,
    );

    if (
      !decision.approved ||
      decision.trade === undefined
    ) {
      const rejected:
        BacktestRiskRejectedEvaluation = {
          outcome: "REJECTED",
          candleIndex:
            signalEvaluation.candleIndex,
          evaluatedAt:
            signalEvaluation.evaluatedAt,
          strategyId:
            signalEvaluation.strategyId,
          strategySignal:
            signalEvaluation.strategySignal,
          signalEvaluation,
          reason:
            decision.reason,
          request,
          decision: {
            approved: false,
            reason:
              decision.reason,
          },
        };

      return rejected;
    }

    const approvedTrade =
      this.freezeApprovedTrade(
        decision.trade,
      );

    const approved:
      BacktestRiskApprovedEvaluation = {
        outcome: "APPROVED",
        candleIndex:
          signalEvaluation.candleIndex,
        evaluatedAt:
          signalEvaluation.evaluatedAt,
        strategyId:
          signalEvaluation.strategyId,
        strategySignal:
          signalEvaluation.strategySignal,
        signalEvaluation,
        reason:
          decision.reason,
        request,
        decision: {
          approved: true,
          reason:
            decision.reason,
          trade:
            approvedTrade,
        },
        trade:
          approvedTrade,
      };

    return approved;
  }

  private createSkippedEvaluation(
    signalEvaluation:
      BacktestSignalEvaluation,
    skipReason:
      BacktestRiskSkipReason,
    reason: string,
  ): BacktestRiskSkippedEvaluation {
    return {
      outcome: "SKIPPED",
      candleIndex:
        signalEvaluation.candleIndex,
      evaluatedAt:
        signalEvaluation.evaluatedAt,
      strategyId:
        signalEvaluation.strategyId,
      strategySignal:
        signalEvaluation.strategySignal,
      signalEvaluation,
      reason,
      skipReason,
    };
  }

  private updateCounters(
    evaluation:
      BacktestRiskEvaluation,
  ): void {
    if (
      evaluation.outcome ===
      "SKIPPED"
    ) {
      this.skippedCount += 1;

      if (
        evaluation.skipReason ===
        "SIGNAL_HOLD"
      ) {
        this.skippedHoldCount += 1;
      } else {
        this.skippedRejectedSignalCount +=
          1;
      }

      return;
    }

    if (
      evaluation.outcome ===
      "REJECTED"
    ) {
      this.rejectedCount += 1;
      return;
    }

    this.approvedCount += 1;

    if (
      evaluation.trade.side ===
      "BUY"
    ) {
      this.approvedBuyCount += 1;
    } else {
      this.approvedSellCount += 1;
    }

    this.totalApprovedRiskAmount +=
      evaluation.trade.riskAmount;

    this.totalApprovedMargin +=
      evaluation.trade.marginRequired;

    this.totalApprovedNotional +=
      evaluation.trade.positionNotional;

    this.assertFiniteMetric(
      this.totalApprovedRiskAmount,
      "Total approved risk amount",
    );

    this.assertFiniteMetric(
      this.totalApprovedMargin,
      "Total approved margin",
    );

    this.assertFiniteMetric(
      this.totalApprovedNotional,
      "Total approved notional",
    );
  }

  private updateSession(
    session: BacktestSession,
    evaluation:
      BacktestRiskEvaluation,
  ): void {
    session.incrementMetric(
      "risk.evaluations",
    );

    session.setRuntimeState(
      "risk.lastOutcome",
      evaluation.outcome,
    );

    session.setRuntimeState(
      "risk.lastReason",
      evaluation.reason,
    );

    session.setRuntimeState(
      "risk.lastStrategySignal",
      evaluation.strategySignal,
    );

    if (
      evaluation.outcome ===
      "SKIPPED"
    ) {
      session.incrementMetric(
        "risk.skipped",
      );

      session.incrementMetric(
        evaluation.skipReason ===
          "SIGNAL_HOLD"
          ? "risk.skippedHold"
          : "risk.skippedRejectedSignal",
      );

      session.setRuntimeState(
        "risk.lastSkipReason",
        evaluation.skipReason,
      );

      session.recordEvent(
        "RISK_SKIPPED",
        {
          strategyId:
            evaluation.strategyId,
          strategySignal:
            evaluation.strategySignal,
          skipReason:
            evaluation.skipReason,
          reason:
            evaluation.reason,
          candleIndex:
            evaluation.candleIndex,
          evaluatedAt:
            evaluation.evaluatedAt,
        },
      );

      return;
    }

    const signal =
      evaluation.request.signal;

    session.setRuntimeState(
      "risk.lastSignalId",
      signal.id,
    );

    session.setRuntimeState(
      "risk.lastStopLossPrice",
      evaluation.request
        .stopLossPrice,
    );

    session.setRuntimeState(
      "risk.lastLeverage",
      evaluation.request
        .leverage ?? 1,
    );

    if (
      evaluation.outcome ===
      "REJECTED"
    ) {
      session.incrementMetric(
        "risk.rejected",
      );

      session.recordEvent(
        "RISK_REJECTED",
        {
          signalId:
            signal.id,
          strategyId:
            signal.strategyId,
          action:
            signal.action,
          entryPrice:
            signal.price,
          stopLossPrice:
            evaluation.request
              .stopLossPrice,
          leverage:
            evaluation.request
              .leverage ?? 1,
          reason:
            evaluation.reason,
          candleIndex:
            evaluation.candleIndex,
          evaluatedAt:
            evaluation.evaluatedAt,
        },
      );

      return;
    }

    const trade =
      evaluation.trade;

    session.incrementMetric(
      "risk.approved",
    );

    session.incrementMetric(
      trade.side === "BUY"
        ? "risk.buy"
        : "risk.sell",
    );

    session.incrementMetric(
      "risk.totalRiskAmount",
      trade.riskAmount,
    );

    session.incrementMetric(
      "risk.totalMarginRequired",
      trade.marginRequired,
    );

    session.incrementMetric(
      "risk.totalPositionNotional",
      trade.positionNotional,
    );

    session.setRuntimeState(
      "risk.lastApprovedSignalId",
      trade.signalId,
    );

    session.setRuntimeState(
      "risk.lastSide",
      trade.side,
    );

    session.setRuntimeState(
      "risk.lastQuantity",
      trade.quantity,
    );

    session.setRuntimeState(
      "risk.lastRiskAmount",
      trade.riskAmount,
    );

    session.setRuntimeState(
      "risk.lastMarginRequired",
      trade.marginRequired,
    );

    session.setRuntimeState(
      "risk.lastPositionNotional",
      trade.positionNotional,
    );

    session.setRuntimeState(
      "risk.lastApprovedAt",
      trade.approvedAt,
    );

    session.recordEvent(
      "RISK_APPROVED",
      {
        signalId:
          trade.signalId,
        strategyId:
          trade.strategyId,
        symbol:
          trade.symbol,
        timeframe:
          trade.timeframe,
        side:
          trade.side,
        entryPrice:
          trade.entryPrice,
        stopLossPrice:
          trade.stopLossPrice,
        quantity:
          trade.quantity,
        leverage:
          trade.leverage,
        positionNotional:
          trade.positionNotional,
        marginRequired:
          trade.marginRequired,
        riskAmount:
          trade.riskAmount,
        accountRiskAfterTrade:
          trade.accountRiskAfterTrade,
        approvedAt:
          trade.approvedAt,
      },
    );
  }

  private validateEvaluationIndex(
    currentIndex: number,
  ): void {
    const expectedIndex =
      this.lastEvaluatedIndex === null
        ? 0
        : this.lastEvaluatedIndex + 1;

    if (
      currentIndex !== expectedIndex
    ) {
      throw new Error(
        "Risk pipeline evaluations must be sequential. " +
          `Expected candle index ${expectedIndex}, ` +
          `received ${currentIndex}.`,
      );
    }
  }

  private validateSignalEvaluation(
    evaluation:
      BacktestSignalEvaluation,
  ): void {
    if (
      evaluation === null ||
      typeof evaluation !== "object"
    ) {
      throw new Error(
        "Risk pipeline signal evaluation must be an object.",
      );
    }

    if (
      typeof evaluation.strategyId !==
        "string" ||
      evaluation.strategyId.trim()
        .length === 0
    ) {
      throw new Error(
        "Risk pipeline strategy ID must be non-empty.",
      );
    }

    if (
      !Number.isSafeInteger(
        evaluation.candleIndex,
      ) ||
      evaluation.candleIndex < 0
    ) {
      throw new Error(
        "Risk pipeline candle index must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        evaluation.evaluatedAt,
      ) ||
      evaluation.evaluatedAt < 0
    ) {
      throw new Error(
        "Risk pipeline evaluatedAt must be a non-negative safe integer.",
      );
    }

    if (
      evaluation.strategySignal !==
        "BUY" &&
      evaluation.strategySignal !==
        "SELL" &&
      evaluation.strategySignal !==
        "HOLD"
    ) {
      throw new Error(
        "Risk pipeline strategy signal must be BUY, SELL, or HOLD.",
      );
    }

    if (
      typeof evaluation.accepted !==
      "boolean"
    ) {
      throw new Error(
        "Risk pipeline accepted flag must be boolean.",
      );
    }

    if (
      typeof evaluation.reason !==
        "string" ||
      evaluation.reason.trim().length ===
        0
    ) {
      throw new Error(
        "Risk pipeline signal reason must be non-empty.",
      );
    }

    if (!evaluation.accepted) {
      if (
        evaluation.signal !== undefined
      ) {
        throw new Error(
          "Rejected signal evaluations must not contain a trade signal.",
        );
      }

      return;
    }

    const signal =
      evaluation.signal;

    if (signal === undefined) {
      throw new Error(
        "Accepted signal evaluations must contain a trade signal.",
      );
    }

    if (
      evaluation.strategySignal ===
      "HOLD"
    ) {
      throw new Error(
        "Accepted signal evaluations cannot contain a HOLD strategy signal.",
      );
    }

    if (
      signal.strategyId !==
      evaluation.strategyId
    ) {
      throw new Error(
        "Risk pipeline trade signal strategy ID must match the signal evaluation.",
      );
    }

    if (
      signal.action !==
      evaluation.strategySignal
    ) {
      throw new Error(
        "Risk pipeline trade signal action must match the strategy signal.",
      );
    }

    if (
      signal.generatedAt !==
      evaluation.evaluatedAt
    ) {
      throw new Error(
        "Risk pipeline trade signal generatedAt must match evaluatedAt.",
      );
    }
  }

  private validateParameters(
    parameters:
      BacktestRiskParameters,
  ): void {
    if (
      parameters === null ||
      typeof parameters !== "object"
    ) {
      throw new Error(
        "Risk pipeline parameters must be an object.",
      );
    }

    this.validateAccount(
      parameters.account,
    );

    if (
      !Number.isFinite(
        parameters.stopLossPrice,
      ) ||
      parameters.stopLossPrice <= 0
    ) {
      throw new Error(
        "Risk pipeline stop-loss price must be a positive finite number.",
      );
    }

    if (
      parameters.leverage !== undefined &&
      (
        !Number.isFinite(
          parameters.leverage,
        ) ||
        parameters.leverage <= 0
      )
    ) {
      throw new Error(
        "Risk pipeline leverage must be a positive finite number.",
      );
    }
  }

  private validateAccount(
    account: RiskAccount,
  ): void {
    if (
      account === null ||
      typeof account !== "object"
    ) {
      throw new Error(
        "Risk pipeline account must be an object.",
      );
    }

    if (
      !Number.isFinite(
        account.balance,
      ) ||
      account.balance <= 0
    ) {
      throw new Error(
        "Risk pipeline account balance must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        account.availableEquity,
      ) ||
      account.availableEquity < 0
    ) {
      throw new Error(
        "Risk pipeline available equity must be a non-negative finite number.",
      );
    }

    if (
      !Number.isFinite(
        account.openRisk,
      ) ||
      account.openRisk < 0
    ) {
      throw new Error(
        "Risk pipeline open risk must be a non-negative finite number.",
      );
    }
  }

  private validateRiskDecision(
    decision: RiskDecision,
    request: BacktestRiskRequest,
    signalEvaluation:
      BacktestSignalEvaluation,
  ): void {
    if (
      decision === null ||
      typeof decision !== "object"
    ) {
      throw new Error(
        "Risk evaluator must return a risk decision object.",
      );
    }

    if (
      typeof decision.approved !==
      "boolean"
    ) {
      throw new Error(
        "Risk decision approved flag must be boolean.",
      );
    }

    if (
      typeof decision.reason !==
        "string" ||
      decision.reason.trim().length ===
        0
    ) {
      throw new Error(
        "Risk decision reason must be non-empty.",
      );
    }

    if (!decision.approved) {
      if (
        decision.trade !== undefined
      ) {
        throw new Error(
          "Rejected risk decisions must not contain an approved trade.",
        );
      }

      return;
    }

    const trade =
      decision.trade;

    if (trade === undefined) {
      throw new Error(
        "Approved risk decisions must contain an approved trade.",
      );
    }

    if (
      trade.signalId !==
      request.signal.id
    ) {
      throw new Error(
        "Approved trade signal ID must match the evaluated signal.",
      );
    }

    if (
      trade.strategyId !==
      request.signal.strategyId
    ) {
      throw new Error(
        "Approved trade strategy ID must match the evaluated signal.",
      );
    }

    if (
      trade.symbol !==
      request.signal.symbol
    ) {
      throw new Error(
        "Approved trade symbol must match the evaluated signal.",
      );
    }

    if (
      trade.timeframe !==
      request.signal.timeframe
    ) {
      throw new Error(
        "Approved trade timeframe must match the evaluated signal.",
      );
    }

    if (
      trade.side !==
      request.signal.action
    ) {
      throw new Error(
        "Approved trade side must match the evaluated signal action.",
      );
    }

    if (
      trade.entryPrice !==
      request.signal.price
    ) {
      throw new Error(
        "Approved trade entry price must match the evaluated signal price.",
      );
    }

    if (
      trade.stopLossPrice !==
      request.stopLossPrice
    ) {
      throw new Error(
        "Approved trade stop-loss price must match the risk request.",
      );
    }

    if (
      trade.approvedAt !==
      signalEvaluation.evaluatedAt
    ) {
      throw new Error(
        "Approved trade timestamp must match the deterministic evaluation timestamp.",
      );
    }

    this.validateApprovedTradeNumbers(
      trade,
    );
  }

  private validateApprovedTradeNumbers(
    trade: ApprovedTrade,
  ): void {
    const positiveValues:
      readonly [
        string,
        number,
      ][] = [
        [
          "entry price",
          trade.entryPrice,
        ],
        [
          "stop-loss price",
          trade.stopLossPrice,
        ],
        [
          "quantity",
          trade.quantity,
        ],
        [
          "leverage",
          trade.leverage,
        ],
        [
          "position notional",
          trade.positionNotional,
        ],
        [
          "margin required",
          trade.marginRequired,
        ],
        [
          "risk amount",
          trade.riskAmount,
        ],
        [
          "risk per unit",
          trade.riskPerUnit,
        ],
      ];

    for (
      const [
        label,
        value,
      ] of positiveValues
    ) {
      if (
        !Number.isFinite(value) ||
        value <= 0
      ) {
        throw new Error(
          `Approved trade ${label} must be a positive finite number.`,
        );
      }
    }

    if (
      !Number.isFinite(
        trade.accountRiskAfterTrade,
      ) ||
      trade.accountRiskAfterTrade < 0
    ) {
      throw new Error(
        "Approved trade account risk must be a non-negative finite number.",
      );
    }

    if (
      !Number.isSafeInteger(
        trade.approvedAt,
      ) ||
      trade.approvedAt < 0
    ) {
      throw new Error(
        "Approved trade approvedAt must be a non-negative safe integer.",
      );
    }
  }

  private freezeEvaluation(
    evaluation:
      BacktestRiskEvaluation,
  ): BacktestRiskEvaluation {
    if (
      evaluation.outcome ===
      "SKIPPED"
    ) {
      return Object.freeze({
        outcome: "SKIPPED",
        candleIndex:
          evaluation.candleIndex,
        evaluatedAt:
          evaluation.evaluatedAt,
        strategyId:
          evaluation.strategyId,
        strategySignal:
          evaluation.strategySignal,
        signalEvaluation:
          evaluation.signalEvaluation,
        reason:
          evaluation.reason,
        skipReason:
          evaluation.skipReason,
      });
    }

    const frozenRequest =
      this.freezeRequest(
        evaluation.request,
      );

    if (
      evaluation.outcome ===
      "REJECTED"
    ) {
      return Object.freeze({
        outcome: "REJECTED",
        candleIndex:
          evaluation.candleIndex,
        evaluatedAt:
          evaluation.evaluatedAt,
        strategyId:
          evaluation.strategyId,
        strategySignal:
          evaluation.strategySignal,
        signalEvaluation:
          evaluation.signalEvaluation,
        reason:
          evaluation.reason,
        request:
          frozenRequest,
        decision:
          Object.freeze({
            approved: false,
            reason:
              evaluation.decision.reason,
          }),
      });
    }

    const frozenTrade =
      this.freezeApprovedTrade(
        evaluation.trade,
      );

    return Object.freeze({
      outcome: "APPROVED",
      candleIndex:
        evaluation.candleIndex,
      evaluatedAt:
        evaluation.evaluatedAt,
      strategyId:
        evaluation.strategyId,
      strategySignal:
        evaluation.strategySignal,
      signalEvaluation:
        evaluation.signalEvaluation,
      reason:
        evaluation.reason,
      request:
        frozenRequest,
      decision:
        Object.freeze({
          approved: true,
          reason:
            evaluation.decision.reason,
          trade:
            frozenTrade,
        }),
      trade:
        frozenTrade,
    });
  }

  private freezeRequest(
    request:
      BacktestRiskRequest,
  ): BacktestRiskRequest {
    return Object.freeze({
      signal:
        request.signal,
      account:
        this.freezeAccount(
          request.account,
        ),
      stopLossPrice:
        request.stopLossPrice,
      leverage:
        request.leverage,
    });
  }

  private freezeAccount(
    account: RiskAccount,
  ): RiskAccount {
    return Object.freeze({
      balance:
        account.balance,
      availableEquity:
        account.availableEquity,
      openRisk:
        account.openRisk,
    });
  }

  private freezeApprovedTrade(
    trade: ApprovedTrade,
  ): ApprovedTrade {
    return Object.freeze({
      signalId:
        trade.signalId,
      strategyId:
        trade.strategyId,
      symbol:
        trade.symbol,
      timeframe:
        trade.timeframe,
      side:
        trade.side,
      entryPrice:
        trade.entryPrice,
      stopLossPrice:
        trade.stopLossPrice,
      quantity:
        trade.quantity,
      leverage:
        trade.leverage,
      positionNotional:
        trade.positionNotional,
      marginRequired:
        trade.marginRequired,
      riskAmount:
        trade.riskAmount,
      riskPerUnit:
        trade.riskPerUnit,
      accountRiskAfterTrade:
        trade.accountRiskAfterTrade,
      approvedAt:
        trade.approvedAt,
      metadata:
        Object.freeze({
          ...trade.metadata,
        }),
    });
  }

  private validateRiskEvaluator(
    evaluator:
      RiskEvaluator,
  ): void {
    if (
      evaluator === null ||
      typeof evaluator !== "object" ||
      typeof evaluator.evaluate !==
        "function"
    ) {
      throw new Error(
        "Risk pipeline requires a valid risk evaluator.",
      );
    }
  }

  private validateSession(
    session:
      BacktestSession,
  ): void {
    if (
      session === null ||
      typeof session !== "object" ||
      typeof session
        .getSimulationTime !==
        "function" ||
      typeof session.getProgress !==
        "function" ||
      typeof session
        .incrementMetric !==
        "function" ||
      typeof session
        .setRuntimeState !==
        "function" ||
      typeof session.recordEvent !==
        "function"
    ) {
      throw new Error(
        "Risk pipeline requires a valid backtest session.",
      );
    }
  }

  private assertFiniteMetric(
    value: number,
    label: string,
  ): void {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${label} must remain finite.`,
      );
    }
  }
}