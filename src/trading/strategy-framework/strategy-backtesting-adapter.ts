/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-backtesting-adapter.ts
 *
 * Purpose:
 * Bridges deterministic backtesting frames into the strategy runtime without
 * coupling the strategy framework to a specific historical-data implementation.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyConfiguration,
  type StrategyCorrelationId,
  type StrategyEvaluationContext,
  type StrategyEvaluationId,
  type StrategyEvaluationResult,
  type StrategyFeatureSet,
  type StrategyMarketSnapshot,
  type StrategyMetadata,
  type StrategyOrderIntent,
  type StrategyPortfolioSnapshot,
  type StrategyPositionSnapshot,
  type StrategyResult,
  type StrategyRiskSnapshot,
  type StrategyRuntime,
  type StrategySignal,
  type StrategyStateSnapshot,
  type StrategyTriggerType,
  type UnixTimestampMilliseconds,
} from "./strategy-contracts";

export interface StrategyBacktestFrame {
  readonly sequence: number;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly triggerType: StrategyTriggerType;
  readonly triggerSourceId?: string;
  readonly market: StrategyMarketSnapshot;
  readonly relatedMarkets?: readonly StrategyMarketSnapshot[];
  readonly features: StrategyFeatureSet;
  readonly relatedFeatureSets?: readonly StrategyFeatureSet[];
  readonly portfolio: StrategyPortfolioSnapshot;
  readonly risk: StrategyRiskSnapshot;
  readonly position?: StrategyPositionSnapshot;
  readonly relatedPositions?: readonly StrategyPositionSnapshot[];
  readonly metadata?: StrategyMetadata;
}

export interface StrategyBacktestReplayRequest {
  readonly runId: string;
  readonly configuration: StrategyConfiguration;
  readonly frames: readonly StrategyBacktestFrame[];
  readonly initializeAt?: UnixTimestampMilliseconds;
  readonly stopAtEnd?: boolean;
  readonly stopReason?: string;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyBacktestFrameResult {
  readonly sequence: number;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly evaluationId: StrategyEvaluationId;
  readonly correlationId: StrategyCorrelationId;
  readonly result: StrategyResult<StrategyEvaluationResult>;
  readonly signals: readonly StrategySignal[];
  readonly orderIntents: readonly StrategyOrderIntent[];
}

export interface StrategyBacktestReplaySummary {
  readonly runId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly startedAt: UnixTimestampMilliseconds;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly frameCount: number;
  readonly successfulEvaluations: number;
  readonly failedEvaluations: number;
  readonly signalCount: number;
  readonly orderIntentCount: number;
  readonly stoppedAtEnd: boolean;
  readonly frameResults: readonly StrategyBacktestFrameResult[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyBacktestStateProvider {
  getState(
    strategyInstanceId: string,
  ): StrategyStateSnapshot | undefined;
}

export interface StrategyBacktestAdapterOptions {
  readonly continueOnEvaluationFailure?: boolean;
  readonly rejectOutOfOrderFrames?: boolean;
  readonly requireContiguousSequence?: boolean;
}

const DEFAULT_OPTIONS: Required<StrategyBacktestAdapterOptions> =
  Object.freeze({
    continueOnEvaluationFailure: false,
    rejectOutOfOrderFrames: true,
    requireContiguousSequence: false,
  });

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertTimestamp(
  value: UnixTimestampMilliseconds,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer Unix timestamp in milliseconds.`,
    );
  }
}

function assertFrameSequence(
  frames: readonly StrategyBacktestFrame[],
  options: Required<StrategyBacktestAdapterOptions>,
): void {
  let previousTimestamp: number | undefined;
  let previousSequence: number | undefined;

  for (const frame of frames) {
    if (!Number.isInteger(frame.sequence) || frame.sequence < 0) {
      throw new Error(
        `Frame sequence must be a non-negative integer. Received ${frame.sequence}.`,
      );
    }

    assertTimestamp(frame.timestamp, "frame.timestamp");

    if (
      options.rejectOutOfOrderFrames &&
      previousTimestamp !== undefined &&
      frame.timestamp < previousTimestamp
    ) {
      throw new Error(
        `Backtest frames are out of chronological order at sequence ${frame.sequence}.`,
      );
    }

    if (
      previousSequence !== undefined &&
      frame.sequence <= previousSequence
    ) {
      throw new Error(
        `Backtest frame sequence must be strictly increasing. Received ${frame.sequence} after ${previousSequence}.`,
      );
    }

    if (
      options.requireContiguousSequence &&
      previousSequence !== undefined &&
      frame.sequence !== previousSequence + 1
    ) {
      throw new Error(
        `Backtest frame sequence must be contiguous. Expected ${previousSequence + 1}, received ${frame.sequence}.`,
      );
    }

    previousTimestamp = frame.timestamp;
    previousSequence = frame.sequence;
  }
}

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  return Object.freeze({
    ...(metadata ?? EMPTY_STRATEGY_METADATA),
  });
}

function createEvaluationId(
  runId: string,
  sequence: number,
): StrategyEvaluationId {
  return `${runId}:evaluation:${String(sequence).padStart(10, "0")}`;
}

function createCorrelationId(
  runId: string,
  sequence: number,
): StrategyCorrelationId {
  return `${runId}:correlation:${String(sequence).padStart(10, "0")}`;
}

function freezeFrameResult(
  value: StrategyBacktestFrameResult,
): StrategyBacktestFrameResult {
  return Object.freeze({
    ...value,
    signals: Object.freeze([...value.signals]),
    orderIntents: Object.freeze([...value.orderIntents]),
  });
}

export class StrategyBacktestingAdapter {
  private readonly runtime: StrategyRuntime;
  private readonly stateProvider: StrategyBacktestStateProvider;
  private readonly options: Required<StrategyBacktestAdapterOptions>;
  private readonly activeRuns = new Set<string>();

  public constructor(
    runtime: StrategyRuntime,
    stateProvider: StrategyBacktestStateProvider,
    options: StrategyBacktestAdapterOptions = {},
  ) {
    this.runtime = runtime;
    this.stateProvider = stateProvider;
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });
  }

  public async replay(
    request: StrategyBacktestReplayRequest,
  ): Promise<StrategyBacktestReplaySummary> {
    this.validateRequest(request);

    if (this.activeRuns.has(request.runId)) {
      throw new Error(
        `Backtest run '${request.runId}' is already active.`,
      );
    }

    this.activeRuns.add(request.runId);

    try {
      return await this.executeReplay(request);
    } finally {
      this.activeRuns.delete(request.runId);
    }
  }

  public isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  private async executeReplay(
    request: StrategyBacktestReplayRequest,
  ): Promise<StrategyBacktestReplaySummary> {
    const { configuration, frames } = request;
    const firstFrame = frames[0];
    const startedAt =
      request.initializeAt ??
      firstFrame?.timestamp ??
      0;

    assertTimestamp(startedAt, "initializeAt");

    const initialization = await this.runtime.initialize(
      configuration,
      startedAt,
    );

    if (!initialization.ok) {
      throw new Error(
        `Unable to initialize strategy '${configuration.strategyInstanceId}': ${initialization.error.code} — ${initialization.error.message}`,
      );
    }

    const frameResults: StrategyBacktestFrameResult[] = [];
    let successfulEvaluations = 0;
    let failedEvaluations = 0;
    let signalCount = 0;
    let orderIntentCount = 0;
    let completedAt = startedAt;

    for (const frame of frames) {
      const state = this.stateProvider.getState(
        configuration.strategyInstanceId,
      );

      if (!state) {
        throw new Error(
          `No strategy state exists for '${configuration.strategyInstanceId}' before frame ${frame.sequence}.`,
        );
      }

      const evaluationId = createEvaluationId(
        request.runId,
        frame.sequence,
      );
      const correlationId = createCorrelationId(
        request.runId,
        frame.sequence,
      );

      const context = this.buildEvaluationContext(
        request,
        frame,
        state,
        evaluationId,
        correlationId,
      );
      const result = await this.runtime.evaluate(context);

      const signals = result.ok
        ? Object.freeze([...result.value.decision.signals])
        : Object.freeze([] as StrategySignal[]);
      const orderIntents = result.ok
        ? Object.freeze([...result.value.decision.orderIntents])
        : Object.freeze([] as StrategyOrderIntent[]);

      frameResults.push(
        freezeFrameResult({
          sequence: frame.sequence,
          timestamp: frame.timestamp,
          evaluationId,
          correlationId,
          result,
          signals,
          orderIntents,
        }),
      );

      completedAt = result.ok
        ? result.value.completedAt
        : frame.timestamp;

      if (result.ok) {
        successfulEvaluations += 1;
        signalCount += signals.length;
        orderIntentCount += orderIntents.length;
      } else {
        failedEvaluations += 1;

        if (!this.options.continueOnEvaluationFailure) {
          break;
        }
      }
    }

    const shouldStop = request.stopAtEnd ?? true;
    let stoppedAtEnd = false;

    if (shouldStop) {
      const stopped = await this.runtime.stop(
        configuration.strategyInstanceId,
        request.stopReason ?? "Deterministic backtest replay completed.",
        completedAt,
      );

      if (!stopped.ok) {
        throw new Error(
          `Unable to stop strategy '${configuration.strategyInstanceId}': ${stopped.error.code} — ${stopped.error.message}`,
        );
      }

      stoppedAtEnd = true;
    }

    return Object.freeze({
      runId: request.runId,
      strategyId: configuration.strategyId,
      strategyInstanceId: configuration.strategyInstanceId,
      startedAt,
      completedAt,
      frameCount: frameResults.length,
      successfulEvaluations,
      failedEvaluations,
      signalCount,
      orderIntentCount,
      stoppedAtEnd,
      frameResults: Object.freeze([...frameResults]),
      metadata: freezeMetadata(request.metadata),
    });
  }

  private buildEvaluationContext(
    request: StrategyBacktestReplayRequest,
    frame: StrategyBacktestFrame,
    state: StrategyStateSnapshot,
    evaluationId: StrategyEvaluationId,
    correlationId: StrategyCorrelationId,
  ): StrategyEvaluationContext {
    const configuration = request.configuration;

    return Object.freeze({
      evaluationId,
      correlationId,
      strategyId: configuration.strategyId,
      strategyInstanceId: configuration.strategyInstanceId,
      strategyVersion: configuration.strategyVersion,
      environment: configuration.environment,
      tradingMode: configuration.tradingMode,
      evaluationTime: frame.timestamp,
      trigger: Object.freeze({
        type: frame.triggerType,
        sourceId: frame.triggerSourceId,
        timestamp: frame.timestamp,
        metadata: freezeMetadata(frame.metadata),
      }),
      market: frame.market,
      relatedMarkets: Object.freeze([
        ...(frame.relatedMarkets ?? []),
      ]),
      features: frame.features,
      relatedFeatureSets: Object.freeze([
        ...(frame.relatedFeatureSets ?? []),
      ]),
      portfolio: frame.portfolio,
      risk: frame.risk,
      position: frame.position,
      relatedPositions: Object.freeze([
        ...(frame.relatedPositions ?? []),
      ]),
      state,
      parameters: configuration.parameters,
      deterministicSeed:
        configuration.deterministicSeed ??
        `${request.runId}:${frame.sequence}`,
      metadata: freezeMetadata(frame.metadata),
    });
  }

  private validateRequest(
    request: StrategyBacktestReplayRequest,
  ): void {
    assertNonEmpty(request.runId, "runId");
    assertNonEmpty(
      request.configuration.strategyId,
      "configuration.strategyId",
    );
    assertNonEmpty(
      request.configuration.strategyInstanceId,
      "configuration.strategyInstanceId",
    );

    if (request.initializeAt !== undefined) {
      assertTimestamp(request.initializeAt, "initializeAt");
    }

    assertFrameSequence(request.frames, this.options);

    const firstFrame = request.frames[0];

    if (
      firstFrame !== undefined &&
      request.initializeAt !== undefined &&
      request.initializeAt > firstFrame.timestamp
    ) {
      throw new Error(
        "initializeAt cannot be later than the first backtest frame.",
      );
    }
  }
}

export default StrategyBacktestingAdapter;