import {
  CandleReplayContext,
  HistoricalCandle,
} from "./backtesting.types";

export type BacktestRunStatus =
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type BacktestMetadataValue =
  | string
  | number
  | boolean
  | null;

export interface BacktestRunConfiguration {
  /**
   * Must be supplied by the caller.
   *
   * The backtesting engine deliberately avoids generating random IDs
   * so identical inputs can produce identical outputs.
   */
  readonly runId: string;

  readonly startingCapital: number;

  readonly baseCurrency: string;

  readonly metadata?: Readonly<
    Record<string, BacktestMetadataValue>
  >;
}

export interface BacktestCancellationToken {
  readonly isCancellationRequested: boolean;
  readonly reason: string | null;
}

export interface BacktestRunStartContext {
  readonly configuration: BacktestRunConfiguration;
  readonly candles: readonly HistoricalCandle[];
  readonly totalCandles: number;
  readonly cancellationToken: BacktestCancellationToken;
}

export interface BacktestCandleContext
  extends CandleReplayContext {
  readonly configuration: BacktestRunConfiguration;
  readonly cancellationToken: BacktestCancellationToken;
}

export interface BacktestRunFailure {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface BacktestRunSummaryBase {
  readonly runId: string;
  readonly startingCapital: number;
  readonly baseCurrency: string;
  readonly totalCandles: number;
  readonly processedCandles: number;
  readonly firstOpenTime: number | null;
  readonly lastCloseTime: number | null;
  readonly finalSimulationTime: number | null;
}

export interface CompletedBacktestRunSummary
  extends BacktestRunSummaryBase {
  readonly status: "COMPLETED";
}

export interface CancelledBacktestRunSummary
  extends BacktestRunSummaryBase {
  readonly status: "CANCELLED";
  readonly cancellationReason: string;
}

export interface FailedBacktestRunSummary
  extends BacktestRunSummaryBase {
  readonly status: "FAILED";
  readonly failure: BacktestRunFailure;
}

export type BacktestRunResult =
  | CompletedBacktestRunSummary
  | CancelledBacktestRunSummary
  | FailedBacktestRunSummary;

export interface BacktestLifecycleHooks {
  onStart?(
    context: BacktestRunStartContext,
  ): void | Promise<void>;

  onCandle?(
    context: BacktestCandleContext,
  ): void | Promise<void>;

  onComplete?(
    result: CompletedBacktestRunSummary,
  ): void | Promise<void>;

  onCancelled?(
    result: CancelledBacktestRunSummary,
  ): void | Promise<void>;

  onFailed?(
    result: FailedBacktestRunSummary,
  ): void | Promise<void>;
}

export interface BacktestRunRequest {
  readonly configuration: BacktestRunConfiguration;
  readonly candles: readonly HistoricalCandle[];
  readonly hooks?: BacktestLifecycleHooks;
  readonly cancellationToken?: BacktestCancellationToken;
}