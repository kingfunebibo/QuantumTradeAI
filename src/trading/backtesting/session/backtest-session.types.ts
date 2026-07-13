import {
  BacktestMetadataValue,
  BacktestRunConfiguration,
} from "../backtest-orchestrator.types";
import { HistoricalCandle } from "../backtesting.types";

export type BacktestStatePrimitive =
  | string
  | number
  | boolean
  | null;

export type BacktestStateValue =
  | BacktestStatePrimitive
  | readonly BacktestStatePrimitive[]
  | Readonly<Record<string, BacktestStatePrimitive>>;

export type BacktestEventPayload =
  Readonly<Record<string, BacktestMetadataValue>>;

export interface BacktestSessionProgress {
  readonly currentIndex: number | null;
  readonly processedCandles: number;
  readonly totalCandles: number;
  readonly remainingCandles: number;
  readonly completionRatio: number;
}

export interface BacktestSessionMetric {
  readonly name: string;
  readonly value: number;
}

export interface BacktestSessionEvent {
  readonly sequence: number;
  readonly type: string;
  readonly simulationTime: number | null;
  readonly candleIndex: number | null;
  readonly payload: BacktestEventPayload;
}

export interface BacktestSessionSnapshot {
  readonly configuration: BacktestRunConfiguration;
  readonly currentCandle: HistoricalCandle | null;
  readonly previousCandle: HistoricalCandle | null;
  readonly simulationTime: number | null;
  readonly progress: BacktestSessionProgress;
  readonly strategyState: Readonly<
    Record<string, BacktestStateValue>
  >;
  readonly runtimeState: Readonly<
    Record<string, BacktestStateValue>
  >;
  readonly metrics: Readonly<
    Record<string, number>
  >;
  readonly events: readonly BacktestSessionEvent[];
}

export interface BacktestSession {
  getConfiguration(): BacktestRunConfiguration;

  getCurrentCandle(): HistoricalCandle | null;

  getPreviousCandle(): HistoricalCandle | null;

  getSimulationTime(): number | null;

  getProgress(): BacktestSessionProgress;

  advance(
    candle: HistoricalCandle,
    index: number,
  ): void;

  setStrategyState(
    key: string,
    value: BacktestStateValue,
  ): void;

  getStrategyState(
    key: string,
  ): BacktestStateValue | undefined;

  hasStrategyState(key: string): boolean;

  deleteStrategyState(key: string): boolean;

  setRuntimeState(
    key: string,
    value: BacktestStateValue,
  ): void;

  getRuntimeState(
    key: string,
  ): BacktestStateValue | undefined;

  hasRuntimeState(key: string): boolean;

  deleteRuntimeState(key: string): boolean;

  setMetric(name: string, value: number): void;

  incrementMetric(
    name: string,
    amount?: number,
  ): number;

  getMetric(name: string): number | undefined;

  recordEvent(
    type: string,
    payload?: BacktestEventPayload,
  ): BacktestSessionEvent;

  getEvents(): readonly BacktestSessionEvent[];

  createSnapshot(): BacktestSessionSnapshot;

  reset(): void;
}