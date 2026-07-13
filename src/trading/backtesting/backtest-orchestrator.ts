import {
  BacktestCancellationToken,
  BacktestLifecycleHooks,
  BacktestRunConfiguration,
  BacktestRunFailure,
  BacktestRunRequest,
  BacktestRunResult,
  CancelledBacktestRunSummary,
  CompletedBacktestRunSummary,
  FailedBacktestRunSummary,
} from "./backtest-orchestrator.types";
import {
  CandleReplayResult,
  HistoricalCandle,
} from "./backtesting.types";
import { HistoricalCandleReplay } from "./historical-candle-replay";

const DEFAULT_CANCELLATION_REASON =
  "Backtest cancellation requested.";

class BacktestCancellationSignal extends Error {
  public constructor(public readonly reason: string) {
    super(reason);

    this.name = "BacktestCancellationSignal";
  }
}

export class MutableBacktestCancellationToken
  implements BacktestCancellationToken
{
  private cancellationRequested = false;
  private cancellationReason: string | null = null;

  public get isCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  public get reason(): string | null {
    return this.cancellationReason;
  }

  public cancel(
    reason: string = DEFAULT_CANCELLATION_REASON,
  ): void {
    if (this.cancellationRequested) {
      return;
    }

    const normalizedReason = reason.trim();

    this.cancellationRequested = true;
    this.cancellationReason =
      normalizedReason.length > 0
        ? normalizedReason
        : DEFAULT_CANCELLATION_REASON;
  }
}

export class BacktestOrchestrator {
  public constructor(
    private readonly replayEngine: HistoricalCandleReplay =
      new HistoricalCandleReplay(),
  ) {}

  public async run(
    request: BacktestRunRequest,
  ): Promise<BacktestRunResult> {
    this.validateRequest(request);

    const configuration = this.freezeConfiguration(
      request.configuration,
    );

    const preparedCandles = this.replayEngine.prepareCandles(
      request.candles,
    );

    const hooks = request.hooks ?? {};
    const cancellationToken =
      request.cancellationToken ??
      new MutableBacktestCancellationToken();

    let processedCandles = 0;
    let firstOpenTime: number | null =
      preparedCandles[0]?.openTime ?? null;
    let lastCloseTime: number | null = null;
    let finalSimulationTime: number | null = null;

    try {
      await hooks.onStart?.({
        configuration,
        candles: preparedCandles,
        totalCandles: preparedCandles.length,
        cancellationToken,
      });

      this.throwIfCancellationRequested(cancellationToken);

      const replayResult = await this.replayEngine.replay(
        preparedCandles,
        async (context) => {
          this.throwIfCancellationRequested(
            cancellationToken,
          );

          await hooks.onCandle?.({
            ...context,
            configuration,
            cancellationToken,
          });

          processedCandles += 1;
          lastCloseTime = context.candle.closeTime;
          finalSimulationTime = context.simulationTime;

          this.throwIfCancellationRequested(
            cancellationToken,
          );
        },
      );

      processedCandles = replayResult.processedCandles;
      firstOpenTime = replayResult.firstOpenTime;
      lastCloseTime = replayResult.lastCloseTime;
      finalSimulationTime =
        replayResult.finalSimulationTime;

      const completedResult =
        this.createCompletedResult(
          configuration,
          preparedCandles.length,
          replayResult,
        );

      await hooks.onComplete?.(completedResult);

      return completedResult;
    } catch (error: unknown) {
      if (error instanceof BacktestCancellationSignal) {
        const cancelledResult =
          this.createCancelledResult({
            configuration,
            totalCandles: preparedCandles.length,
            processedCandles,
            firstOpenTime,
            lastCloseTime,
            finalSimulationTime,
            cancellationReason: error.reason,
          });

        await this.invokeCancellationHookSafely(
          hooks,
          cancelledResult,
        );

        return cancelledResult;
      }

      const failedResult = this.createFailedResult({
        configuration,
        totalCandles: preparedCandles.length,
        processedCandles,
        firstOpenTime,
        lastCloseTime,
        finalSimulationTime,
        failure: this.normalizeFailure(error),
      });

      await this.invokeFailureHookSafely(
        hooks,
        failedResult,
      );

      return failedResult;
    }
  }

  private validateRequest(
    request: BacktestRunRequest,
  ): void {
    if (request === null || typeof request !== "object") {
      throw new Error(
        "Backtest run request must be an object.",
      );
    }

    this.validateConfiguration(request.configuration);

    if (!Array.isArray(request.candles)) {
      throw new Error(
        "Backtest candles must be provided as an array.",
      );
    }

    if (
      request.hooks !== undefined &&
      (request.hooks === null ||
        typeof request.hooks !== "object")
    ) {
      throw new Error(
        "Backtest lifecycle hooks must be an object.",
      );
    }

    if (request.cancellationToken !== undefined) {
      this.validateCancellationToken(
        request.cancellationToken,
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
        "Backtest configuration must be an object.",
      );
    }

    if (
      typeof configuration.runId !== "string" ||
      configuration.runId.trim().length === 0
    ) {
      throw new Error(
        "Backtest runId must be a non-empty string.",
      );
    }

    if (
      !Number.isFinite(configuration.startingCapital) ||
      configuration.startingCapital <= 0
    ) {
      throw new Error(
        "Backtest startingCapital must be a positive finite number.",
      );
    }

    if (
      typeof configuration.baseCurrency !== "string" ||
      configuration.baseCurrency.trim().length === 0
    ) {
      throw new Error(
        "Backtest baseCurrency must be a non-empty string.",
      );
    }

    if (
      configuration.metadata !== undefined &&
      (configuration.metadata === null ||
        typeof configuration.metadata !== "object" ||
        Array.isArray(configuration.metadata))
    ) {
      throw new Error(
        "Backtest metadata must be a plain object.",
      );
    }

    if (configuration.metadata !== undefined) {
      for (const [key, value] of Object.entries(
        configuration.metadata,
      )) {
        if (key.trim().length === 0) {
          throw new Error(
            "Backtest metadata keys must be non-empty strings.",
          );
        }

        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          throw new Error(
            `Backtest metadata value for "${key}" is invalid.`,
          );
        }

        if (
          typeof value === "number" &&
          !Number.isFinite(value)
        ) {
          throw new Error(
            `Backtest metadata number for "${key}" must be finite.`,
          );
        }
      }
    }
  }

  private validateCancellationToken(
    token: BacktestCancellationToken,
  ): void {
    if (token === null || typeof token !== "object") {
      throw new Error(
        "Backtest cancellation token must be an object.",
      );
    }

    if (
      typeof token.isCancellationRequested !== "boolean"
    ) {
      throw new Error(
        "Backtest cancellation token must expose a boolean " +
          "isCancellationRequested property.",
      );
    }

    if (
      token.reason !== null &&
      typeof token.reason !== "string"
    ) {
      throw new Error(
        "Backtest cancellation reason must be a string or null.",
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
      startingCapital: configuration.startingCapital,
      baseCurrency:
        configuration.baseCurrency.trim().toUpperCase(),
      metadata,
    });
  }

  private throwIfCancellationRequested(
    token: BacktestCancellationToken,
  ): void {
    if (!token.isCancellationRequested) {
      return;
    }

    const normalizedReason = token.reason?.trim();

    throw new BacktestCancellationSignal(
      normalizedReason &&
      normalizedReason.length > 0
        ? normalizedReason
        : DEFAULT_CANCELLATION_REASON,
    );
  }

  private createCompletedResult(
    configuration: BacktestRunConfiguration,
    totalCandles: number,
    replayResult: CandleReplayResult,
  ): CompletedBacktestRunSummary {
    return Object.freeze({
      status: "COMPLETED",
      runId: configuration.runId,
      startingCapital:
        configuration.startingCapital,
      baseCurrency: configuration.baseCurrency,
      totalCandles,
      processedCandles:
        replayResult.processedCandles,
      firstOpenTime: replayResult.firstOpenTime,
      lastCloseTime: replayResult.lastCloseTime,
      finalSimulationTime:
        replayResult.finalSimulationTime,
    });
  }

  private createCancelledResult(input: {
    readonly configuration: BacktestRunConfiguration;
    readonly totalCandles: number;
    readonly processedCandles: number;
    readonly firstOpenTime: number | null;
    readonly lastCloseTime: number | null;
    readonly finalSimulationTime: number | null;
    readonly cancellationReason: string;
  }): CancelledBacktestRunSummary {
    return Object.freeze({
      status: "CANCELLED",
      runId: input.configuration.runId,
      startingCapital:
        input.configuration.startingCapital,
      baseCurrency:
        input.configuration.baseCurrency,
      totalCandles: input.totalCandles,
      processedCandles: input.processedCandles,
      firstOpenTime: input.firstOpenTime,
      lastCloseTime: input.lastCloseTime,
      finalSimulationTime:
        input.finalSimulationTime,
      cancellationReason:
        input.cancellationReason,
    });
  }

  private createFailedResult(input: {
    readonly configuration: BacktestRunConfiguration;
    readonly totalCandles: number;
    readonly processedCandles: number;
    readonly firstOpenTime: number | null;
    readonly lastCloseTime: number | null;
    readonly finalSimulationTime: number | null;
    readonly failure: BacktestRunFailure;
  }): FailedBacktestRunSummary {
    return Object.freeze({
      status: "FAILED",
      runId: input.configuration.runId,
      startingCapital:
        input.configuration.startingCapital,
      baseCurrency:
        input.configuration.baseCurrency,
      totalCandles: input.totalCandles,
      processedCandles: input.processedCandles,
      firstOpenTime: input.firstOpenTime,
      lastCloseTime: input.lastCloseTime,
      finalSimulationTime:
        input.finalSimulationTime,
      failure: Object.freeze({
        ...input.failure,
      }),
    });
  }

  private normalizeFailure(
    error: unknown,
  ): BacktestRunFailure {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      name: "UnknownBacktestError",
      message: String(error),
    };
  }

  private async invokeCancellationHookSafely(
    hooks: BacktestLifecycleHooks,
    result: CancelledBacktestRunSummary,
  ): Promise<void> {
    try {
      await hooks.onCancelled?.(result);
    } catch {
      // The cancellation result remains authoritative.
      // Lifecycle notification errors must not convert a
      // cancelled run into a failed run.
    }
  }

  private async invokeFailureHookSafely(
    hooks: BacktestLifecycleHooks,
    result: FailedBacktestRunSummary,
  ): Promise<void> {
    try {
      await hooks.onFailed?.(result);
    } catch {
      // Preserve the original backtest failure.
    }
  }
}