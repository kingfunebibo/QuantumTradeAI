import { BacktestRunConfiguration } from "../backtest-orchestrator.types";
import { HistoricalCandle } from "../backtesting.types";
import {
  BacktestEventPayload,
  BacktestSession,
  BacktestSessionEvent,
  BacktestSessionProgress,
  BacktestSessionSnapshot,
  BacktestStatePrimitive,
  BacktestStateValue,
} from "./backtest-session.types";

export class DeterministicBacktestSession
  implements BacktestSession
{
  private currentCandle: HistoricalCandle | null = null;
  private previousCandle: HistoricalCandle | null = null;
  private simulationTime: number | null = null;
  private currentIndex: number | null = null;
  private processedCandles = 0;

  private readonly strategyState =
    new Map<string, BacktestStateValue>();

  private readonly runtimeState =
    new Map<string, BacktestStateValue>();

  private readonly metrics =
    new Map<string, number>();

  private readonly events: BacktestSessionEvent[] = [];

  private nextEventSequence = 1;

  private readonly configuration:
    BacktestRunConfiguration;

  public constructor(
    configuration: BacktestRunConfiguration,
    private readonly totalCandles: number,
  ) {
    this.validateConfiguration(configuration);
    this.validateTotalCandles(totalCandles);

    this.configuration =
      this.freezeConfiguration(configuration);
  }

  public getConfiguration(): BacktestRunConfiguration {
    return this.configuration;
  }

  public getCurrentCandle(): HistoricalCandle | null {
    return this.currentCandle;
  }

  public getPreviousCandle(): HistoricalCandle | null {
    return this.previousCandle;
  }

  public getSimulationTime(): number | null {
    return this.simulationTime;
  }

  public getProgress(): BacktestSessionProgress {
    const remainingCandles = Math.max(
      this.totalCandles - this.processedCandles,
      0,
    );

    const completionRatio =
      this.totalCandles === 0
        ? 1
        : this.processedCandles / this.totalCandles;

    return Object.freeze({
      currentIndex: this.currentIndex,
      processedCandles: this.processedCandles,
      totalCandles: this.totalCandles,
      remainingCandles,
      completionRatio,
    });
  }

  public advance(
    candle: HistoricalCandle,
    index: number,
  ): void {
    this.validateCandle(candle);
    this.validateAdvanceIndex(index);

    if (
      this.currentCandle !== null &&
      candle.openTime <= this.currentCandle.openTime
    ) {
      throw new Error(
        "Backtest session candles must advance in strictly " +
          "increasing open-time order.",
      );
    }

    if (
      this.simulationTime !== null &&
      candle.closeTime < this.simulationTime
    ) {
      throw new Error(
        "Backtest session simulation time cannot move backwards.",
      );
    }

    this.previousCandle = this.currentCandle;
    this.currentCandle = Object.freeze({
      ...candle,
    });

    this.currentIndex = index;
    this.processedCandles = index + 1;
    this.simulationTime = candle.closeTime;
  }

  public setStrategyState(
    key: string,
    value: BacktestStateValue,
  ): void {
    const normalizedKey = this.normalizeKey(
      key,
      "Strategy state",
    );

    this.strategyState.set(
      normalizedKey,
      this.freezeStateValue(value),
    );
  }

  public getStrategyState(
    key: string,
  ): BacktestStateValue | undefined {
    return this.strategyState.get(
      this.normalizeKey(key, "Strategy state"),
    );
  }

  public hasStrategyState(key: string): boolean {
    return this.strategyState.has(
      this.normalizeKey(key, "Strategy state"),
    );
  }

  public deleteStrategyState(key: string): boolean {
    return this.strategyState.delete(
      this.normalizeKey(key, "Strategy state"),
    );
  }

  public setRuntimeState(
    key: string,
    value: BacktestStateValue,
  ): void {
    const normalizedKey = this.normalizeKey(
      key,
      "Runtime state",
    );

    this.runtimeState.set(
      normalizedKey,
      this.freezeStateValue(value),
    );
  }

  public getRuntimeState(
    key: string,
  ): BacktestStateValue | undefined {
    return this.runtimeState.get(
      this.normalizeKey(key, "Runtime state"),
    );
  }

  public hasRuntimeState(key: string): boolean {
    return this.runtimeState.has(
      this.normalizeKey(key, "Runtime state"),
    );
  }

  public deleteRuntimeState(key: string): boolean {
    return this.runtimeState.delete(
      this.normalizeKey(key, "Runtime state"),
    );
  }

  public setMetric(
    name: string,
    value: number,
  ): void {
    const normalizedName = this.normalizeKey(
      name,
      "Metric",
    );

    this.assertFiniteNumber(value, "Metric value");

    this.metrics.set(normalizedName, value);
  }

  public incrementMetric(
    name: string,
    amount = 1,
  ): number {
    const normalizedName = this.normalizeKey(
      name,
      "Metric",
    );

    this.assertFiniteNumber(
      amount,
      "Metric increment amount",
    );

    const currentValue =
      this.metrics.get(normalizedName) ?? 0;

    const nextValue = currentValue + amount;

    this.assertFiniteNumber(
      nextValue,
      "Incremented metric value",
    );

    this.metrics.set(normalizedName, nextValue);

    return nextValue;
  }

  public getMetric(
    name: string,
  ): number | undefined {
    return this.metrics.get(
      this.normalizeKey(name, "Metric"),
    );
  }

  public recordEvent(
    type: string,
    payload: BacktestEventPayload = {},
  ): BacktestSessionEvent {
    const normalizedType = this.normalizeKey(
      type,
      "Event type",
    );

    const frozenPayload =
      this.freezeEventPayload(payload);

    const event: BacktestSessionEvent =
      Object.freeze({
        sequence: this.nextEventSequence,
        type: normalizedType,
        simulationTime: this.simulationTime,
        candleIndex: this.currentIndex,
        payload: frozenPayload,
      });

    this.events.push(event);
    this.nextEventSequence += 1;

    return event;
  }

  public getEvents():
    readonly BacktestSessionEvent[] {
    return Object.freeze([...this.events]);
  }

  public createSnapshot(): BacktestSessionSnapshot {
    return Object.freeze({
      configuration: this.configuration,
      currentCandle: this.currentCandle,
      previousCandle: this.previousCandle,
      simulationTime: this.simulationTime,
      progress: this.getProgress(),
      strategyState: this.mapToFrozenRecord(
        this.strategyState,
      ),
      runtimeState: this.mapToFrozenRecord(
        this.runtimeState,
      ),
      metrics: this.mapNumbersToFrozenRecord(
        this.metrics,
      ),
      events: this.getEvents(),
    });
  }

  public reset(): void {
    this.currentCandle = null;
    this.previousCandle = null;
    this.simulationTime = null;
    this.currentIndex = null;
    this.processedCandles = 0;

    this.strategyState.clear();
    this.runtimeState.clear();
    this.metrics.clear();
    this.events.splice(0, this.events.length);

    this.nextEventSequence = 1;
  }

  private validateAdvanceIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error(
        "Backtest candle index must be a non-negative " +
          "safe integer.",
      );
    }

    if (index >= this.totalCandles) {
      throw new Error(
        `Backtest candle index ${index} exceeds the ` +
          `configured total of ${this.totalCandles} candles.`,
      );
    }

    const expectedIndex =
      this.currentIndex === null
        ? 0
        : this.currentIndex + 1;

    if (index !== expectedIndex) {
      throw new Error(
        `Backtest candle index must advance sequentially. ` +
          `Expected ${expectedIndex}, received ${index}.`,
      );
    }
  }

  private validateCandle(
    candle: HistoricalCandle,
  ): void {
    if (candle === null || typeof candle !== "object") {
      throw new Error(
        "Backtest session candle must be an object.",
      );
    }

    if (
      typeof candle.symbol !== "string" ||
      candle.symbol.trim().length === 0
    ) {
      throw new Error(
        "Backtest session candle symbol must be non-empty.",
      );
    }

    if (
      typeof candle.timeframe !== "string" ||
      candle.timeframe.trim().length === 0
    ) {
      throw new Error(
        "Backtest session candle timeframe must be non-empty.",
      );
    }

    if (
      !Number.isSafeInteger(candle.openTime) ||
      candle.openTime < 0 ||
      !Number.isSafeInteger(candle.closeTime) ||
      candle.closeTime <= candle.openTime
    ) {
      throw new Error(
        "Backtest session candle timestamps are invalid.",
      );
    }
  }

  private validateConfiguration(
    configuration: BacktestRunConfiguration,
  ): void {
    if (
      configuration === null ||
      typeof configuration !== "object"
    ) {
      throw new Error(
        "Backtest session configuration must be an object.",
      );
    }

    if (
      typeof configuration.runId !== "string" ||
      configuration.runId.trim().length === 0
    ) {
      throw new Error(
        "Backtest session runId must be non-empty.",
      );
    }

    if (
      !Number.isFinite(configuration.startingCapital) ||
      configuration.startingCapital <= 0
    ) {
      throw new Error(
        "Backtest session starting capital must be positive.",
      );
    }

    if (
      typeof configuration.baseCurrency !== "string" ||
      configuration.baseCurrency.trim().length === 0
    ) {
      throw new Error(
        "Backtest session base currency must be non-empty.",
      );
    }
  }

  private validateTotalCandles(
    totalCandles: number,
  ): void {
    if (
      !Number.isSafeInteger(totalCandles) ||
      totalCandles < 0
    ) {
      throw new Error(
        "Backtest session totalCandles must be a " +
          "non-negative safe integer.",
      );
    }
  }

  private freezeConfiguration(
    configuration: BacktestRunConfiguration,
  ): BacktestRunConfiguration {
    const metadata =
      configuration.metadata === undefined
        ? undefined
        : Object.freeze({
            ...configuration.metadata,
          });

    return Object.freeze({
      runId: configuration.runId.trim(),
      startingCapital:
        configuration.startingCapital,
      baseCurrency:
        configuration.baseCurrency
          .trim()
          .toUpperCase(),
      metadata,
    });
  }

  private normalizeKey(
    key: string,
    label: string,
  ): string {
    if (typeof key !== "string") {
      throw new Error(
        `${label} key must be a string.`,
      );
    }

    const normalizedKey = key.trim();

    if (normalizedKey.length === 0) {
      throw new Error(
        `${label} key must be non-empty.`,
      );
    }

    return normalizedKey;
  }

  private freezeStateValue(
    value: BacktestStateValue,
  ): BacktestStateValue {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "number") {
      this.assertFiniteNumber(
        value,
        "Backtest state number",
      );

      return value;
    }

    if (Array.isArray(value)) {
      const copiedValues =
        value.map((item) => {
          this.validateStatePrimitive(item);
          return item;
        });

      return Object.freeze(copiedValues);
    }

    if (
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const copiedRecord:
        Record<string, BacktestStatePrimitive> = {};

      for (const [key, item] of Object.entries(value)) {
        const normalizedKey = this.normalizeKey(
          key,
          "State object",
        );

        this.validateStatePrimitive(item);
        copiedRecord[normalizedKey] = item;
      }

      return Object.freeze(copiedRecord);
    }

    throw new Error(
      "Unsupported backtest state value.",
    );
  }

  private validateStatePrimitive(
    value: unknown,
  ): asserts value is BacktestStatePrimitive {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return;
    }

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return;
    }

    throw new Error(
      "Backtest state values must contain only " +
        "strings, finite numbers, booleans, or null.",
    );
  }

  private freezeEventPayload(
    payload: BacktestEventPayload,
  ): BacktestEventPayload {
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      throw new Error(
        "Backtest event payload must be a plain object.",
      );
    }

    const copiedPayload:
      Record<string, string | number | boolean | null> = {};

    for (const [key, value] of Object.entries(payload)) {
      const normalizedKey = this.normalizeKey(
        key,
        "Event payload",
      );

      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new Error(
          `Backtest event payload "${normalizedKey}" ` +
            "has an unsupported value.",
        );
      }

      if (
        typeof value === "number" &&
        !Number.isFinite(value)
      ) {
        throw new Error(
          `Backtest event payload "${normalizedKey}" ` +
            "must contain a finite number.",
        );
      }

      copiedPayload[normalizedKey] = value;
    }

    return Object.freeze(copiedPayload);
  }

  private mapToFrozenRecord(
    map: ReadonlyMap<string, BacktestStateValue>,
  ): Readonly<Record<string, BacktestStateValue>> {
    const record:
      Record<string, BacktestStateValue> = {};

    for (const [key, value] of map.entries()) {
      record[key] = value;
    }

    return Object.freeze(record);
  }

  private mapNumbersToFrozenRecord(
    map: ReadonlyMap<string, number>,
  ): Readonly<Record<string, number>> {
    const record: Record<string, number> = {};

    for (const [key, value] of map.entries()) {
      record[key] = value;
    }

    return Object.freeze(record);
  }

  private assertFiniteNumber(
    value: number,
    label: string,
  ): void {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${label} must be a finite number.`,
      );
    }
  }
}