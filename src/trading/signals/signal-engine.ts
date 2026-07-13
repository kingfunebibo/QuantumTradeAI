import { randomUUID } from "node:crypto";

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

  constructor(
    options: SignalEngineOptions = {},
  ) {
    this.minimumConfidence =
      options.minimumConfidence ?? 0.25;

    this.duplicateWindowMs =
      options.duplicateWindowMs ?? 60_000;

    this.validateOptions();
  }

  process(
    input: SignalInput,
  ): SignalDecision {
    this.validateInput(input);
    this.removeExpiredFingerprints();

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

    const signal: TradeSignal = {
      id: randomUUID(),
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
      generatedAt: Date.now(),
      metadata: {
        ...(strategyResult.metadata ?? {}),
        strategyTimestamp:
          strategyResult.timestamp,
      },
    };

    this.processedSignals.set(
      fingerprint,
      signal.generatedAt,
    );

    return {
      accepted: true,
      reason:
        "Strategy result converted into an actionable trade signal.",
      signal,
    };
  }

  hasProcessed(
    fingerprint: SignalFingerprint,
  ): boolean {
    this.removeExpiredFingerprints();

    return this.processedSignals.has(
      this.createFingerprint(
        fingerprint,
      ),
    );
  }

  clear(): void {
    this.processedSignals.clear();
  }

  getProcessedCount(): number {
    this.removeExpiredFingerprints();

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

  private validateInput(
    input: SignalInput,
  ): void {
    if (!input.symbol.trim()) {
      throw new Error(
        "Signal symbol cannot be empty.",
      );
    }

    if (!input.timeframe.trim()) {
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
      !strategyResult.strategyId.trim()
    ) {
      throw new Error(
        "Signal strategy ID cannot be empty.",
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

  private removeExpiredFingerprints(): void {
    if (this.duplicateWindowMs === 0) {
      this.processedSignals.clear();
      return;
    }

    const cutoff =
      Date.now() -
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
}