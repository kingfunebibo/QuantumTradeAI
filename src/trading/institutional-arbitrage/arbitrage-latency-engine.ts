/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-latency-engine.ts
 *
 * Deterministic latency estimation engine.
 */

import {
  type ArbitrageLatencyEstimate,
  type ArbitrageLeg,
} from "./institutional-arbitrage-contracts";

export interface ArbitrageLatencyEngineOptions {
  readonly submissionLatencyMs?: number;
  readonly executionLatencyMs?: number;
  readonly transferLatencyMs?: number;
  readonly settlementLatencyMs?: number;
  readonly maximumPermittedLatencyMs?: number;
}

const DEFAULTS: Required<ArbitrageLatencyEngineOptions> = Object.freeze({
  submissionLatencyMs: 25,
  executionLatencyMs: 40,
  transferLatencyMs: 0,
  settlementLatencyMs: 50,
  maximumPermittedLatencyMs: 500,
});

export class ArbitrageLatencyEngine {
  constructor(
    private readonly options: Required<ArbitrageLatencyEngineOptions> = DEFAULTS,
  ) {}

  estimate(marketDataAgeMs: number): ArbitrageLatencyEstimate {
    const total =
      marketDataAgeMs +
      this.options.submissionLatencyMs +
      this.options.executionLatencyMs +
      this.options.transferLatencyMs +
      this.options.settlementLatencyMs;

    return Object.freeze({
      marketDataAgeMs,
      expectedSubmissionLatencyMs: this.options.submissionLatencyMs,
      expectedExecutionLatencyMs: this.options.executionLatencyMs,
      expectedTransferLatencyMs: this.options.transferLatencyMs,
      expectedSettlementLatencyMs: this.options.settlementLatencyMs,
      expectedTotalLatencyMs: total,
      maximumPermittedLatencyMs:
        this.options.maximumPermittedLatencyMs,
    });
  }

  recalculateLeg(
    leg: ArbitrageLeg,
    marketDataAgeMs: number,
  ): ArbitrageLeg {
    return Object.freeze({
      ...leg,
      latency: this.estimate(marketDataAgeMs),
    });
  }
}

export function createArbitrageLatencyEngine(
  options?: ArbitrageLatencyEngineOptions,
): ArbitrageLatencyEngine {
  return new ArbitrageLatencyEngine({
    ...DEFAULTS,
    ...options,
  });
}