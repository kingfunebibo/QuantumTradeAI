import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyInstanceId,
  type StrategyMetadata,
  type StrategyPerformanceSnapshot,
  type UnixTimestampMilliseconds,
} from "./strategy-contracts";

export interface StrategyTradePerformanceRecord {
  readonly tradeId: string;
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly openedAt: UnixTimestampMilliseconds;
  readonly closedAt: UnixTimestampMilliseconds;
  readonly realizedPnl: number;
  readonly fees?: number;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyPerformanceCounters {
  readonly evaluations?: number;
  readonly signals?: number;
  readonly orderIntents?: number;
}

export interface StrategyEquityObservation {
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly equity: number;
  readonly unrealizedPnl?: number;
}

export interface StrategyPerformanceTrackerOptions {
  readonly initialEquity?: number;
  readonly riskFreeRate?: number;
  readonly annualizationFactor?: number;
  readonly maximumStoredTrades?: number;
  readonly maximumEquityObservations?: number;
}

export interface StrategyExtendedPerformanceSnapshot
  extends StrategyPerformanceSnapshot {
  readonly initialEquity: number;
  readonly currentEquity: number;
  readonly peakEquity: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;
  readonly breakevenTrades: number;
  readonly averageTradePnl: number;
  readonly averageWinningTrade: number;
  readonly averageLosingTrade: number;
  readonly expectancy: number;
  readonly currentDrawdown: number;
  readonly maximumDrawdownPercentage: number;
  readonly returnPercentage: number;
  readonly averageHoldingTimeMilliseconds: number;
  readonly consecutiveWins: number;
  readonly consecutiveLosses: number;
  readonly maximumConsecutiveWins: number;
  readonly maximumConsecutiveLosses: number;
}

interface MutablePerformanceState {
  readonly strategyId: StrategyId;
  readonly strategyInstanceId: StrategyInstanceId;
  initialEquity: number;
  currentEquity: number;
  peakEquity: number;
  unrealizedPnl: number;
  totalEvaluations: number;
  totalSignals: number;
  totalOrderIntents: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  grossProfit: number;
  grossLoss: number;
  realizedPnl: number;
  totalHoldingTimeMilliseconds: number;
  currentDrawdown: number;
  maximumDrawdown: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  maximumConsecutiveWins: number;
  maximumConsecutiveLosses: number;
  lastUpdatedAt: UnixTimestampMilliseconds;
  readonly trades: StrategyTradePerformanceRecord[];
  readonly equityObservations: StrategyEquityObservation[];
}

const DEFAULT_INITIAL_EQUITY = 0;
const DEFAULT_RISK_FREE_RATE = 0;
const DEFAULT_ANNUALIZATION_FACTOR = 252;
const DEFAULT_MAXIMUM_STORED_TRADES = 1_000;
const DEFAULT_MAXIMUM_EQUITY_OBSERVATIONS = 2_000;
const EPSILON = 1e-12;

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} cannot be empty.`);
  }
}

function instanceKey(
  strategyId: StrategyId,
  strategyInstanceId: StrategyInstanceId,
): string {
  return `${strategyId}::${strategyInstanceId}`;
}

function clampHistory<T>(values: T[], maximumLength: number): void {
  const overflow = values.length - maximumLength;

  if (overflow > 0) {
    values.splice(0, overflow);
  }
}

function safeRatio(numerator: number, denominator: number): number {
  return Math.abs(denominator) <= EPSILON ? 0 : numerator / denominator;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((sum, value) => {
      const difference = value - average;
      return sum + difference * difference;
    }, 0) /
    (values.length - 1);

  return Math.sqrt(Math.max(variance, 0));
}

function calculateReturns(
  observations: readonly StrategyEquityObservation[],
): readonly number[] {
  const returns: number[] = [];

  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];

    if (
      previous === undefined ||
      current === undefined ||
      Math.abs(previous.equity) <= EPSILON
    ) {
      continue;
    }

    returns.push((current.equity - previous.equity) / previous.equity);
  }

  return returns;
}

function calculateSharpeRatio(
  returns: readonly number[],
  riskFreeRate: number,
  annualizationFactor: number,
): number {
  if (returns.length < 2) {
    return 0;
  }

  const periodicRiskFreeRate = riskFreeRate / annualizationFactor;
  const excessReturns = returns.map(
    (value) => value - periodicRiskFreeRate,
  );
  const deviation = sampleStandardDeviation(excessReturns);

  return deviation <= EPSILON
    ? 0
    : (mean(excessReturns) / deviation) * Math.sqrt(annualizationFactor);
}

function calculateSortinoRatio(
  returns: readonly number[],
  riskFreeRate: number,
  annualizationFactor: number,
): number {
  if (returns.length < 2) {
    return 0;
  }

  const periodicRiskFreeRate = riskFreeRate / annualizationFactor;
  const excessReturns = returns.map(
    (value) => value - periodicRiskFreeRate,
  );
  const downsideReturns = excessReturns.filter((value) => value < 0);

  if (downsideReturns.length === 0) {
    return 0;
  }

  const downsideDeviation = Math.sqrt(
    downsideReturns.reduce(
      (sum, value) => sum + value * value,
      0,
    ) / downsideReturns.length,
  );

  return downsideDeviation <= EPSILON
    ? 0
    : (mean(excessReturns) / downsideDeviation) *
        Math.sqrt(annualizationFactor);
}

function freezeSnapshot(
  snapshot: StrategyExtendedPerformanceSnapshot,
): StrategyExtendedPerformanceSnapshot {
  return Object.freeze({
    ...snapshot,
    metadata: Object.freeze({ ...snapshot.metadata }),
  });
}

export class StrategyPerformanceTracker {
  private readonly states = new Map<string, MutablePerformanceState>();
  private readonly initialEquity: number;
  private readonly riskFreeRate: number;
  private readonly annualizationFactor: number;
  private readonly maximumStoredTrades: number;
  private readonly maximumEquityObservations: number;

  public constructor(options: StrategyPerformanceTrackerOptions = {}) {
    this.initialEquity =
      options.initialEquity ?? DEFAULT_INITIAL_EQUITY;
    this.riskFreeRate =
      options.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
    this.annualizationFactor =
      options.annualizationFactor ?? DEFAULT_ANNUALIZATION_FACTOR;
    this.maximumStoredTrades =
      options.maximumStoredTrades ?? DEFAULT_MAXIMUM_STORED_TRADES;
    this.maximumEquityObservations =
      options.maximumEquityObservations ??
      DEFAULT_MAXIMUM_EQUITY_OBSERVATIONS;

    assertFiniteNumber(this.initialEquity, "initialEquity");
    assertFiniteNumber(this.riskFreeRate, "riskFreeRate");

    if (this.annualizationFactor <= 0) {
      throw new Error("annualizationFactor must be greater than zero.");
    }

    if (
      !Number.isInteger(this.maximumStoredTrades) ||
      this.maximumStoredTrades <= 0
    ) {
      throw new Error(
        "maximumStoredTrades must be a positive integer.",
      );
    }

    if (
      !Number.isInteger(this.maximumEquityObservations) ||
      this.maximumEquityObservations <= 1
    ) {
      throw new Error(
        "maximumEquityObservations must be an integer greater than one.",
      );
    }
  }

  public initialize(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
    initialEquity = this.initialEquity,
  ): StrategyExtendedPerformanceSnapshot {
    assertNonEmpty(strategyId, "strategyId");
    assertNonEmpty(strategyInstanceId, "strategyInstanceId");
    assertFiniteNumber(timestamp, "timestamp");
    assertFiniteNumber(initialEquity, "initialEquity");

    const key = instanceKey(strategyId, strategyInstanceId);

    if (this.states.has(key)) {
      throw new Error(
        `Performance state already exists for ${strategyId}/${strategyInstanceId}.`,
      );
    }

    const state: MutablePerformanceState = {
      strategyId,
      strategyInstanceId,
      initialEquity,
      currentEquity: initialEquity,
      peakEquity: initialEquity,
      unrealizedPnl: 0,
      totalEvaluations: 0,
      totalSignals: 0,
      totalOrderIntents: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakevenTrades: 0,
      grossProfit: 0,
      grossLoss: 0,
      realizedPnl: 0,
      totalHoldingTimeMilliseconds: 0,
      currentDrawdown: 0,
      maximumDrawdown: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      maximumConsecutiveWins: 0,
      maximumConsecutiveLosses: 0,
      lastUpdatedAt: timestamp,
      trades: [],
      equityObservations: [
        {
          strategyId,
          strategyInstanceId,
          timestamp,
          equity: initialEquity,
          unrealizedPnl: 0,
        },
      ],
    };

    this.states.set(key, state);

    return this.snapshot(strategyId, strategyInstanceId, timestamp);
  }

  public recordActivity(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
    counters: StrategyPerformanceCounters,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyExtendedPerformanceSnapshot {
    const state = this.requireState(strategyId, strategyInstanceId);

    const evaluations = counters.evaluations ?? 0;
    const signals = counters.signals ?? 0;
    const orderIntents = counters.orderIntents ?? 0;

    assertNonNegativeInteger(evaluations, "evaluations");
    assertNonNegativeInteger(signals, "signals");
    assertNonNegativeInteger(orderIntents, "orderIntents");
    this.assertTimestamp(state, timestamp);

    state.totalEvaluations += evaluations;
    state.totalSignals += signals;
    state.totalOrderIntents += orderIntents;
    state.lastUpdatedAt = timestamp;

    return this.snapshot(strategyId, strategyInstanceId, timestamp);
  }

  public recordTrade(
    record: StrategyTradePerformanceRecord,
  ): StrategyExtendedPerformanceSnapshot {
    assertNonEmpty(record.tradeId, "tradeId");
    assertFiniteNumber(record.openedAt, "openedAt");
    assertFiniteNumber(record.closedAt, "closedAt");
    assertFiniteNumber(record.realizedPnl, "realizedPnl");

    if (record.closedAt < record.openedAt) {
      throw new Error("closedAt cannot be earlier than openedAt.");
    }

    const state = this.requireState(
      record.strategyId,
      record.strategyInstanceId,
    );
    this.assertTimestamp(state, record.closedAt);

    if (state.trades.some((trade) => trade.tradeId === record.tradeId)) {
      throw new Error(`Trade ${record.tradeId} has already been recorded.`);
    }

    const fees = record.fees ?? 0;
    assertFiniteNumber(fees, "fees");

    const netPnl = record.realizedPnl - fees;
    const storedRecord: StrategyTradePerformanceRecord = Object.freeze({
      ...record,
      metadata: record.metadata
        ? Object.freeze({ ...record.metadata })
        : undefined,
    });

    state.trades.push(storedRecord);
    clampHistory(state.trades, this.maximumStoredTrades);

    state.totalTrades += 1;
    state.realizedPnl += netPnl;
    state.currentEquity += netPnl;
    state.totalHoldingTimeMilliseconds +=
      record.closedAt - record.openedAt;

    if (netPnl > EPSILON) {
      state.winningTrades += 1;
      state.grossProfit += netPnl;
      state.consecutiveWins += 1;
      state.consecutiveLosses = 0;
      state.maximumConsecutiveWins = Math.max(
        state.maximumConsecutiveWins,
        state.consecutiveWins,
      );
    } else if (netPnl < -EPSILON) {
      state.losingTrades += 1;
      state.grossLoss += Math.abs(netPnl);
      state.consecutiveLosses += 1;
      state.consecutiveWins = 0;
      state.maximumConsecutiveLosses = Math.max(
        state.maximumConsecutiveLosses,
        state.consecutiveLosses,
      );
    } else {
      state.breakevenTrades += 1;
      state.consecutiveWins = 0;
      state.consecutiveLosses = 0;
    }

    this.updateDrawdown(state);
    this.appendEquityObservation(state, {
      strategyId: record.strategyId,
      strategyInstanceId: record.strategyInstanceId,
      timestamp: record.closedAt,
      equity: state.currentEquity,
      unrealizedPnl: state.unrealizedPnl,
    });

    state.lastUpdatedAt = record.closedAt;

    return this.snapshot(
      record.strategyId,
      record.strategyInstanceId,
      record.closedAt,
    );
  }

  public recordEquity(
    observation: StrategyEquityObservation,
  ): StrategyExtendedPerformanceSnapshot {
    assertFiniteNumber(observation.timestamp, "timestamp");
    assertFiniteNumber(observation.equity, "equity");

    const state = this.requireState(
      observation.strategyId,
      observation.strategyInstanceId,
    );
    this.assertTimestamp(state, observation.timestamp);

    const unrealizedPnl = observation.unrealizedPnl ?? 0;
    assertFiniteNumber(unrealizedPnl, "unrealizedPnl");

    state.currentEquity = observation.equity;
    state.unrealizedPnl = unrealizedPnl;
    state.lastUpdatedAt = observation.timestamp;

    this.updateDrawdown(state);
    this.appendEquityObservation(state, {
      ...observation,
      unrealizedPnl,
    });

    return this.snapshot(
      observation.strategyId,
      observation.strategyInstanceId,
      observation.timestamp,
    );
  }

  public snapshot(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
    timestamp?: UnixTimestampMilliseconds,
  ): StrategyExtendedPerformanceSnapshot {
    const state = this.requireState(strategyId, strategyInstanceId);
    const snapshotTimestamp = timestamp ?? state.lastUpdatedAt;

    assertFiniteNumber(snapshotTimestamp, "timestamp");

    const returns = calculateReturns(state.equityObservations);
    const totalTrades = state.totalTrades;
    const averageTradePnl = safeRatio(state.realizedPnl, totalTrades);
    const averageWinningTrade = safeRatio(
      state.grossProfit,
      state.winningTrades,
    );
    const averageLosingTrade = safeRatio(
      state.grossLoss,
      state.losingTrades,
    );
    const winRate = safeRatio(state.winningTrades, totalTrades);
    const profitFactor =
      state.grossLoss <= EPSILON
        ? state.grossProfit > EPSILON
          ? Number.POSITIVE_INFINITY
          : 0
        : state.grossProfit / state.grossLoss;
    const returnPercentage =
      safeRatio(
        state.currentEquity - state.initialEquity,
        Math.abs(state.initialEquity),
      ) * 100;
    const maximumDrawdownPercentage =
      safeRatio(state.maximumDrawdown, Math.abs(state.peakEquity)) * 100;

    return freezeSnapshot({
      strategyId,
      strategyInstanceId,
      timestamp: snapshotTimestamp,
      totalEvaluations: state.totalEvaluations,
      totalSignals: state.totalSignals,
      totalOrderIntents: state.totalOrderIntents,
      totalTrades,
      winningTrades: state.winningTrades,
      losingTrades: state.losingTrades,
      realizedPnl: state.realizedPnl,
      unrealizedPnl: state.unrealizedPnl,
      winRate,
      profitFactor,
      sharpeRatio: calculateSharpeRatio(
        returns,
        this.riskFreeRate,
        this.annualizationFactor,
      ),
      sortinoRatio: calculateSortinoRatio(
        returns,
        this.riskFreeRate,
        this.annualizationFactor,
      ),
      maximumDrawdown: state.maximumDrawdown,
      initialEquity: state.initialEquity,
      currentEquity: state.currentEquity,
      peakEquity: state.peakEquity,
      grossProfit: state.grossProfit,
      grossLoss: state.grossLoss,
      netProfit: state.realizedPnl,
      breakevenTrades: state.breakevenTrades,
      averageTradePnl,
      averageWinningTrade,
      averageLosingTrade,
      expectancy:
        winRate * averageWinningTrade -
        (1 - winRate) * averageLosingTrade,
      currentDrawdown: state.currentDrawdown,
      maximumDrawdownPercentage,
      returnPercentage,
      averageHoldingTimeMilliseconds: safeRatio(
        state.totalHoldingTimeMilliseconds,
        totalTrades,
      ),
      consecutiveWins: state.consecutiveWins,
      consecutiveLosses: state.consecutiveLosses,
      maximumConsecutiveWins: state.maximumConsecutiveWins,
      maximumConsecutiveLosses: state.maximumConsecutiveLosses,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }

  public listSnapshots(
    timestamp?: UnixTimestampMilliseconds,
  ): readonly StrategyExtendedPerformanceSnapshot[] {
    return Object.freeze(
      [...this.states.values()]
        .sort((left, right) => {
          const strategyComparison = left.strategyId.localeCompare(
            right.strategyId,
          );

          return strategyComparison !== 0
            ? strategyComparison
            : left.strategyInstanceId.localeCompare(
                right.strategyInstanceId,
              );
        })
        .map((state) =>
          this.snapshot(
            state.strategyId,
            state.strategyInstanceId,
            timestamp,
          ),
        ),
    );
  }

  public getTrades(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
  ): readonly StrategyTradePerformanceRecord[] {
    const state = this.requireState(strategyId, strategyInstanceId);

    return Object.freeze([...state.trades]);
  }

  public getEquityCurve(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
  ): readonly StrategyEquityObservation[] {
    const state = this.requireState(strategyId, strategyInstanceId);

    return Object.freeze(
      state.equityObservations.map((observation) =>
        Object.freeze({ ...observation }),
      ),
    );
  }

  public reset(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
    initialEquity = this.initialEquity,
  ): StrategyExtendedPerformanceSnapshot {
    const key = instanceKey(strategyId, strategyInstanceId);

    if (!this.states.delete(key)) {
      throw new Error(
        `Performance state does not exist for ${strategyId}/${strategyInstanceId}.`,
      );
    }

    return this.initialize(
      strategyId,
      strategyInstanceId,
      timestamp,
      initialEquity,
    );
  }

  public remove(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
  ): boolean {
    return this.states.delete(instanceKey(strategyId, strategyInstanceId));
  }

  public clear(): void {
    this.states.clear();
  }

  public has(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
  ): boolean {
    return this.states.has(instanceKey(strategyId, strategyInstanceId));
  }

  private requireState(
    strategyId: StrategyId,
    strategyInstanceId: StrategyInstanceId,
  ): MutablePerformanceState {
    const state = this.states.get(
      instanceKey(strategyId, strategyInstanceId),
    );

    if (!state) {
      throw new Error(
        `Performance state does not exist for ${strategyId}/${strategyInstanceId}.`,
      );
    }

    return state;
  }

  private assertTimestamp(
    state: MutablePerformanceState,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    assertFiniteNumber(timestamp, "timestamp");

    if (timestamp < state.lastUpdatedAt) {
      throw new Error(
        `timestamp ${timestamp} cannot be earlier than the last update ${state.lastUpdatedAt}.`,
      );
    }
  }

  private appendEquityObservation(
    state: MutablePerformanceState,
    observation: StrategyEquityObservation,
  ): void {
    state.equityObservations.push(Object.freeze({ ...observation }));
    clampHistory(
      state.equityObservations,
      this.maximumEquityObservations,
    );
  }

  private updateDrawdown(state: MutablePerformanceState): void {
    state.peakEquity = Math.max(state.peakEquity, state.currentEquity);
    state.currentDrawdown = Math.max(
      state.peakEquity - state.currentEquity,
      0,
    );
    state.maximumDrawdown = Math.max(
      state.maximumDrawdown,
      state.currentDrawdown,
    );
  }
}

export default StrategyPerformanceTracker;