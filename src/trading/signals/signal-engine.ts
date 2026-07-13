import {
  SignalRuntime,
  SystemSignalRuntime,
} from "./signal-runtime";

import type {
  SignalDecision,
  SignalEngineOptions,
  SignalFingerprint,
  SignalInput,
  TradeSignal,
} from "./signal.types";

export class SignalEngine {
  private readonly minimumConfidence: number;
  private readonly duplicateWindowMs: number;

  private readonly processedSignals =
    new Map<string, number>();

  public constructor(
    options: SignalEngineOptions = {},
    private readonly runtime: SignalRuntime =
      new SystemSignalRuntime(),
  ) {
    this.minimumConfidence =
      options.minimumConfidence ?? 0.25;

    this.duplicateWindowMs =
      options.duplicateWindowMs ?? 60_000;

    this.validateOptions();
    this.validateRuntime(runtime);
  }

  public process(
    input: SignalInput,
  ): SignalDecision {
    this.validateInput(input);

    const currentTime =
      this.getCurrentTime();

    this.removeExpiredFingerprints(
      currentTime,
    );

    const {
      strategyResult,
      symbol,
      timeframe,
      price,
      candleTimestamp,
    } = input;

    if (strategyResult.signal === "HOLD") {
      return {
        accepted: false,
        reason:
          "HOLD strategy results do not produce actionable trade signals.",
      };
    }

    if (
      strategyResult.confidence <
      this.minimumConfidence
    ) {
      return {
        accepted: false,
        reason:
          `Signal confidence ${strategyResult.confidence} ` +
          `is below the minimum threshold ${this.minimumConfidence}.`,
      };
    }

    const fingerprint =
      this.createFingerprint({
        strategyId:
          strategyResult.strategyId,
        symbol,
        timeframe,
        action:
          strategyResult.signal,
        candleTimestamp,
      });

    if (
      this.processedSignals.has(
        fingerprint,
      )
    ) {
      return {
        accepted: false,
        reason:
          "Duplicate signal rejected for the same strategy, market, action, and candle.",
      };
    }

    const signalId =
      this.runtime.generateId();

    this.validateGeneratedId(signalId);

    const signal: TradeSignal = {
      id: signalId,
      strategyId:
        strategyResult.strategyId,
      symbol,
      timeframe,
      action:
        strategyResult.signal,
      confidence:
        strategyResult.confidence,
      reason:
        strategyResult.reason,
      price,
      candleTimestamp,
      generatedAt: currentTime,
      metadata: {
        ...(strategyResult.metadata ?? {}),
        strategyTimestamp:
          strategyResult.timestamp,
      },
    };

    this.processedSignals.set(
      fingerprint,
      currentTime,
    );

    return {
      accepted: true,
      reason:
        "Strategy result converted into an actionable trade signal.",
      signal,
    };
  }

  public hasProcessed(
    fingerprint: SignalFingerprint,
  ): boolean {
    const currentTime =
      this.getCurrentTime();

    this.removeExpiredFingerprints(
      currentTime,
    );

    return this.processedSignals.has(
      this.createFingerprint(
        fingerprint,
      ),
    );
  }

  public clear(): void {
    this.processedSignals.clear();
  }

  public getProcessedCount(): number {
    const currentTime =
      this.getCurrentTime();

    this.removeExpiredFingerprints(
      currentTime,
    );

    return this.processedSignals.size;
  }

  private validateOptions(): void {
    if (
      !Number.isFinite(
        this.minimumConfidence,
      ) ||
      this.minimumConfidence < 0 ||
      this.minimumConfidence > 1
    ) {
      throw new Error(
        "Signal minimum confidence must be between 0 and 1.",
      );
    }

    if (
      !Number.isFinite(
        this.duplicateWindowMs,
      ) ||
      this.duplicateWindowMs < 0
    ) {
      throw new Error(
        "Signal duplicate window must be a non-negative finite number.",
      );
    }
  }

  private validateRuntime(
    runtime: SignalRuntime,
  ): void {
    if (
      runtime === null ||
      typeof runtime !== "object" ||
      typeof runtime.now !== "function" ||
      typeof runtime.generateId !== "function"
    ) {
      throw new Error(
        "Signal Engine requires a valid signal runtime.",
      );
    }

    this.getCurrentTime();
  }

  private validateInput(
    input: SignalInput,
  ): void {
    if (
      input === null ||
      typeof input !== "object"
    ) {
      throw new Error(
        "Signal input must be an object.",
      );
    }

    if (
      typeof input.symbol !== "string" ||
      !input.symbol.trim()
    ) {
      throw new Error(
        "Signal symbol cannot be empty.",
      );
    }

    if (
      typeof input.timeframe !== "string" ||
      !input.timeframe.trim()
    ) {
      throw new Error(
        "Signal timeframe cannot be empty.",
      );
    }

    if (
      !Number.isFinite(input.price) ||
      input.price <= 0
    ) {
      throw new Error(
        "Signal price must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        input.candleTimestamp,
      )
    ) {
      throw new Error(
        "Signal candle timestamp must be finite.",
      );
    }

    const {
      strategyResult,
    } = input;

    if (
      strategyResult === null ||
      typeof strategyResult !== "object"
    ) {
      throw new Error(
        "Strategy result must be an object.",
      );
    }

    if (
      typeof strategyResult.strategyId !==
        "string" ||
      !strategyResult.strategyId.trim()
    ) {
      throw new Error(
        "Signal strategy ID cannot be empty.",
      );
    }

    if (
      strategyResult.signal !== "BUY" &&
      strategyResult.signal !== "SELL" &&
      strategyResult.signal !== "HOLD"
    ) {
      throw new Error(
        "Strategy result contains an unsupported signal.",
      );
    }

    if (
      !Number.isFinite(
        strategyResult.confidence,
      ) ||
      strategyResult.confidence < 0 ||
      strategyResult.confidence > 1
    ) {
      throw new Error(
        "Strategy confidence must be between 0 and 1.",
      );
    }

    if (
      !Number.isFinite(
        strategyResult.timestamp,
      )
    ) {
      throw new Error(
        "Strategy result timestamp must be finite.",
      );
    }

    if (
      typeof strategyResult.reason !==
        "string" ||
      !strategyResult.reason.trim()
    ) {
      throw new Error(
        "Strategy result reason cannot be empty.",
      );
    }
  }

  private createFingerprint(
    fingerprint: SignalFingerprint,
  ): string {
    return [
      fingerprint.strategyId.trim(),
      fingerprint.symbol.trim(),
      fingerprint.timeframe.trim(),
      fingerprint.action,
      fingerprint.candleTimestamp,
    ].join(":");
  }

  private removeExpiredFingerprints(
    currentTime: number,
  ): void {
    if (this.duplicateWindowMs === 0) {
      this.processedSignals.clear();
      return;
    }

    const cutoff =
      currentTime -
      this.duplicateWindowMs;

    for (const [
      fingerprint,
      createdAt,
    ] of this.processedSignals) {
      if (createdAt < cutoff) {
        this.processedSignals.delete(
          fingerprint,
        );
      }
    }
  }

  private getCurrentTime(): number {
    const currentTime =
      this.runtime.now();

    if (
      !Number.isSafeInteger(currentTime) ||
      currentTime < 0
    ) {
      throw new Error(
        "Signal runtime must return a non-negative " +
          "safe integer timestamp.",
      );
    }

    return currentTime;
  }

  private validateGeneratedId(
    id: string,
  ): void {
    if (
      typeof id !== "string" ||
      id.trim().length === 0
    ) {
      throw new Error(
        "Signal runtime must generate a non-empty signal ID.",
      );
    }
  }
}