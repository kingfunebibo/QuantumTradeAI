import {
  DeterministicSignalRuntime,
  SignalEngine,
} from "../../signals";

import type {
  SignalDecision,
  TradeSignal,
} from "../../signals";

import type { BacktestSession } from "../session";

import type {
  BacktestStrategyEvaluation,
} from "../strategy";

import type {
  BacktestSignalEvaluation,
  BacktestSignalPipeline,
} from "./backtest-signal-pipeline.types";

export class DeterministicBacktestSignalPipeline
  implements BacktestSignalPipeline
{
  private lastEvaluatedIndex: number | null = null;

  private evaluationCount = 0;
  private acceptedCount = 0;
  private rejectedCount = 0;

  private lastDecision: SignalDecision | null = null;

  public constructor(
    private readonly signalEngine: SignalEngine,
    private readonly runtime: DeterministicSignalRuntime,
  ) {
    this.validateSignalEngine(signalEngine);
    this.validateRuntime(runtime);
  }

  public evaluate(
    session: BacktestSession,
    strategyEvaluation: BacktestStrategyEvaluation,
  ): BacktestSignalEvaluation {
    this.validateSession(session);
    this.validateStrategyEvaluation(
      strategyEvaluation,
    );

    const currentCandle =
      session.getCurrentCandle();

    const simulationTime =
      session.getSimulationTime();

    const progress =
      session.getProgress();

    if (currentCandle === null) {
      throw new Error(
        "Signal pipeline cannot evaluate before the " +
          "backtest session has a current candle.",
      );
    }

    if (simulationTime === null) {
      throw new Error(
        "Signal pipeline cannot evaluate without a " +
          "simulation timestamp.",
      );
    }

    if (progress.currentIndex === null) {
      throw new Error(
        "Signal pipeline cannot evaluate without a " +
          "current candle index.",
      );
    }

    if (
      strategyEvaluation.candleIndex !==
      progress.currentIndex
    ) {
      throw new Error(
        "Signal pipeline strategy evaluation index must " +
          "match the current session candle index.",
      );
    }

    if (
      strategyEvaluation.evaluatedAt !==
      simulationTime
    ) {
      throw new Error(
        "Signal pipeline strategy timestamp must match " +
          "the current simulation timestamp.",
      );
    }

    this.validateEvaluationIndex(
      strategyEvaluation.candleIndex,
    );

    this.runtime.advanceTo(
      simulationTime,
    );

    const decision =
      this.signalEngine.process({
        strategyResult:
          strategyEvaluation.result,
        symbol: currentCandle.symbol,
        timeframe: currentCandle.timeframe,
        price: currentCandle.close,
        candleTimestamp:
          currentCandle.openTime,
      });

    this.validateDecision(
      decision,
      strategyEvaluation,
      currentCandle.symbol,
      currentCandle.timeframe,
      currentCandle.close,
      currentCandle.openTime,
      simulationTime,
    );

    this.lastEvaluatedIndex =
      strategyEvaluation.candleIndex;

    this.evaluationCount += 1;

    if (decision.accepted) {
      this.acceptedCount += 1;
    } else {
      this.rejectedCount += 1;
    }

    const frozenDecision =
      this.freezeDecision(decision);

    this.lastDecision =
      frozenDecision;

    this.updateSession(
      session,
      strategyEvaluation,
      frozenDecision,
    );

    return Object.freeze({
      candleIndex:
        strategyEvaluation.candleIndex,
      evaluatedAt:
        strategyEvaluation.evaluatedAt,
      strategyId:
        strategyEvaluation.strategyId,
      strategySignal:
        strategyEvaluation.result.signal,
      accepted:
        frozenDecision.accepted,
      reason:
        frozenDecision.reason,
      signal:
        frozenDecision.signal,
    });
  }

  public getEvaluationCount(): number {
    return this.evaluationCount;
  }

  public getAcceptedCount(): number {
    return this.acceptedCount;
  }

  public getRejectedCount(): number {
    return this.rejectedCount;
  }

  public getLastDecision():
    SignalDecision | null {
    return this.lastDecision;
  }

  public reset(): void {
    this.lastEvaluatedIndex = null;

    this.evaluationCount = 0;
    this.acceptedCount = 0;
    this.rejectedCount = 0;

    this.lastDecision = null;

    this.signalEngine.clear();
    this.runtime.reset();
  }

  private updateSession(
    session: BacktestSession,
    strategyEvaluation:
      BacktestStrategyEvaluation,
    decision: SignalDecision,
  ): void {
    session.incrementMetric(
      "signal.evaluations",
    );

    session.setRuntimeState(
      "signal.lastAccepted",
      decision.accepted,
    );

    session.setRuntimeState(
      "signal.lastDecisionReason",
      decision.reason,
    );

    session.setRuntimeState(
      "signal.lastStrategySignal",
      strategyEvaluation.result.signal,
    );

    if (!decision.accepted) {
      session.incrementMetric(
        "signal.rejected",
      );

      if (
        strategyEvaluation.result.signal ===
        "HOLD"
      ) {
        session.incrementMetric(
          "signal.rejectedHold",
        );
      } else {
        session.incrementMetric(
          "signal.rejectedActionable",
        );
      }

      session.recordEvent(
        "SIGNAL_REJECTED",
        {
          strategyId:
            strategyEvaluation.strategyId,
          strategySignal:
            strategyEvaluation.result.signal,
          confidence:
            strategyEvaluation.result.confidence,
          reason:
            decision.reason,
          candleIndex:
            strategyEvaluation.candleIndex,
          evaluatedAt:
            strategyEvaluation.evaluatedAt,
        },
      );

      return;
    }

    const signal = decision.signal;

    if (signal === undefined) {
      throw new Error(
        "Accepted signal decision must contain a signal.",
      );
    }

    session.incrementMetric(
      "signal.accepted",
    );

    session.incrementMetric(
      signal.action === "BUY"
        ? "signal.buy"
        : "signal.sell",
    );

    session.setRuntimeState(
      "signal.lastId",
      signal.id,
    );

    session.setRuntimeState(
      "signal.lastAction",
      signal.action,
    );

    session.setRuntimeState(
      "signal.lastPrice",
      signal.price,
    );

    session.setRuntimeState(
      "signal.lastConfidence",
      signal.confidence,
    );

    session.setRuntimeState(
      "signal.lastGeneratedAt",
      signal.generatedAt,
    );

    session.setRuntimeState(
      "signal.lastCandleTimestamp",
      signal.candleTimestamp,
    );

    session.recordEvent(
      "SIGNAL_ACCEPTED",
      {
        signalId: signal.id,
        strategyId:
          signal.strategyId,
        action: signal.action,
        confidence:
          signal.confidence,
        price: signal.price,
        candleTimestamp:
          signal.candleTimestamp,
        generatedAt:
          signal.generatedAt,
        reason: decision.reason,
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

    if (currentIndex !== expectedIndex) {
      throw new Error(
        "Signal pipeline evaluations must be sequential. " +
          `Expected candle index ${expectedIndex}, ` +
          `received ${currentIndex}.`,
      );
    }
  }

  private validateStrategyEvaluation(
    evaluation: BacktestStrategyEvaluation,
  ): void {
    if (
      evaluation === null ||
      typeof evaluation !== "object"
    ) {
      throw new Error(
        "Signal pipeline strategy evaluation must be an object.",
      );
    }

    if (
      typeof evaluation.strategyId !== "string" ||
      evaluation.strategyId.trim().length === 0
    ) {
      throw new Error(
        "Signal pipeline strategy ID must be non-empty.",
      );
    }

    if (
      !Number.isSafeInteger(
        evaluation.candleIndex,
      ) ||
      evaluation.candleIndex < 0
    ) {
      throw new Error(
        "Signal pipeline candle index must be a " +
          "non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        evaluation.evaluatedAt,
      ) ||
      evaluation.evaluatedAt < 0
    ) {
      throw new Error(
        "Signal pipeline evaluatedAt must be a " +
          "non-negative safe integer.",
      );
    }

    if (
      evaluation.result === null ||
      typeof evaluation.result !== "object"
    ) {
      throw new Error(
        "Signal pipeline strategy result must be an object.",
      );
    }

    if (
      evaluation.result.strategyId !==
      evaluation.strategyId
    ) {
      throw new Error(
        "Signal pipeline strategy result ID must match " +
          "the strategy evaluation ID.",
      );
    }

    if (
      evaluation.result.timestamp !==
      evaluation.evaluatedAt
    ) {
      throw new Error(
        "Signal pipeline strategy result timestamp must " +
          "match the evaluation timestamp.",
      );
    }
  }

  private validateDecision(
    decision: SignalDecision,
    strategyEvaluation:
      BacktestStrategyEvaluation,
    symbol: string,
    timeframe: string,
    price: number,
    candleTimestamp: number,
    generatedAt: number,
  ): void {
    if (
      decision === null ||
      typeof decision !== "object"
    ) {
      throw new Error(
        "Signal Engine must return a signal decision object.",
      );
    }

    if (
      typeof decision.accepted !== "boolean"
    ) {
      throw new Error(
        "Signal decision accepted flag must be boolean.",
      );
    }

    if (
      typeof decision.reason !== "string" ||
      decision.reason.trim().length === 0
    ) {
      throw new Error(
        "Signal decision reason must be non-empty.",
      );
    }

    if (!decision.accepted) {
      if (decision.signal !== undefined) {
        throw new Error(
          "Rejected signal decisions must not contain a signal.",
        );
      }

      return;
    }

    const signal = decision.signal;

    if (signal === undefined) {
      throw new Error(
        "Accepted signal decisions must contain a signal.",
      );
    }

    if (
      signal.strategyId !==
      strategyEvaluation.strategyId
    ) {
      throw new Error(
        "Trade signal strategy ID does not match " +
          "the strategy evaluation.",
      );
    }

    if (
      signal.action !== "BUY" &&
      signal.action !== "SELL"
    ) {
      throw new Error(
        "Accepted trade signal must have an actionable signal.",
      );
    }

    if (
      signal.action !==
      strategyEvaluation.result.signal
    ) {
      throw new Error(
        "Trade signal action must match the strategy result.",
      );
    }

    if (signal.symbol !== symbol) {
      throw new Error(
        "Trade signal symbol does not match the current candle.",
      );
    }

    if (signal.timeframe !== timeframe) {
      throw new Error(
        "Trade signal timeframe does not match the current candle.",
      );
    }

    if (signal.price !== price) {
      throw new Error(
        "Trade signal price must match the current candle close.",
      );
    }

    if (
      signal.candleTimestamp !==
      candleTimestamp
    ) {
      throw new Error(
        "Trade signal candle timestamp must match the " +
          "current candle open time.",
      );
    }

    if (
      signal.generatedAt !== generatedAt
    ) {
      throw new Error(
        "Trade signal generatedAt must match the " +
          "deterministic simulation timestamp.",
      );
    }

    if (
      signal.confidence !==
      strategyEvaluation.result.confidence
    ) {
      throw new Error(
        "Trade signal confidence must match the strategy result.",
      );
    }

    if (
      typeof signal.id !== "string" ||
      signal.id.trim().length === 0
    ) {
      throw new Error(
        "Trade signal ID must be non-empty.",
      );
    }
  }

  private freezeDecision(
    decision: SignalDecision,
  ): SignalDecision {
    if (!decision.accepted) {
      return Object.freeze({
        accepted: false,
        reason: decision.reason,
      });
    }

    const signal = decision.signal;

    if (signal === undefined) {
      throw new Error(
        "Accepted signal decision must contain a signal.",
      );
    }

    return Object.freeze({
      accepted: true,
      reason: decision.reason,
      signal: this.freezeSignal(signal),
    });
  }

  private freezeSignal(
    signal: TradeSignal,
  ): TradeSignal {
    return Object.freeze({
      id: signal.id,
      strategyId:
        signal.strategyId,
      symbol: signal.symbol,
      timeframe:
        signal.timeframe,
      action: signal.action,
      confidence:
        signal.confidence,
      reason: signal.reason,
      price: signal.price,
      candleTimestamp:
        signal.candleTimestamp,
      generatedAt:
        signal.generatedAt,
      metadata: Object.freeze({
        ...signal.metadata,
      }),
    });
  }

  private validateSignalEngine(
    signalEngine: SignalEngine,
  ): void {
    if (
      signalEngine === null ||
      typeof signalEngine !== "object" ||
      typeof signalEngine.process !== "function" ||
      typeof signalEngine.clear !== "function"
    ) {
      throw new Error(
        "Signal pipeline requires a valid SignalEngine.",
      );
    }
  }

  private validateRuntime(
    runtime: DeterministicSignalRuntime,
  ): void {
    if (
      runtime === null ||
      typeof runtime !== "object" ||
      typeof runtime.now !== "function" ||
      typeof runtime.advanceTo !== "function" ||
      typeof runtime.reset !== "function"
    ) {
      throw new Error(
        "Signal pipeline requires a valid deterministic " +
          "signal runtime.",
      );
    }
  }

  private validateSession(
    session: BacktestSession,
  ): void {
    if (
      session === null ||
      typeof session !== "object" ||
      typeof session.getCurrentCandle !== "function" ||
      typeof session.getSimulationTime !== "function" ||
      typeof session.getProgress !== "function" ||
      typeof session.recordEvent !== "function"
    ) {
      throw new Error(
        "Signal pipeline requires a valid backtest session.",
      );
    }
  }
}