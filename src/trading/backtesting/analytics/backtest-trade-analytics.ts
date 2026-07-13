import type {
  ClosedTrade,
} from "../../portfolio";

import type {
  BacktestAnalyzedTrade,
  BacktestSymbolTradeStatistics,
  BacktestTradeAnalyticsEngine,
  BacktestTradeAnalyticsReport,
  BacktestTradeDurationStatistics,
  BacktestTradeOutcome,
  BacktestTradeOutcomeStatistics,
  BacktestTradePerformanceSummary,
  BacktestTradeProfitStatistics,
  BacktestTradeSideStatistics,
  BacktestTradeStreakStatistics,
} from "./backtest-trade-analytics.types";

export class DeterministicBacktestTradeAnalytics
  implements BacktestTradeAnalyticsEngine
{
  private report:
    BacktestTradeAnalyticsReport | undefined;

  public analyze(
    trades: readonly ClosedTrade[],
    generatedAt: number,
  ): BacktestTradeAnalyticsReport {
    this.validateGeneratedAt(generatedAt);
    this.validateTrades(trades);

    const analyzedTrades =
      this.normalizeTrades(trades);

    const summary =
      this.createSummary(analyzedTrades);

    this.report = Object.freeze({
      generatedAt,
      trades: analyzedTrades,
      summary,
    });

    return this.report;
  }

  public getReport():
    BacktestTradeAnalyticsReport | undefined {
    return this.report;
  }

  public getTrades():
    readonly BacktestAnalyzedTrade[] {
    return (
      this.report?.trades ??
      Object.freeze([])
    );
  }

  public getSummary():
    BacktestTradePerformanceSummary | undefined {
    return this.report?.summary;
  }

  public reset(): void {
    this.report = undefined;
  }

  private normalizeTrades(
    trades: readonly ClosedTrade[],
  ): readonly BacktestAnalyzedTrade[] {
    const normalized =
      trades.map(
        (
          trade,
          index,
        ): BacktestAnalyzedTrade => {
          const totalFees =
            trade.entryFee +
            trade.exitFee;

          const duration =
            trade.closedAt -
            trade.openedAt;

          const outcome =
            this.classifyOutcome(
              trade.netRealizedPnl,
            );

          const sourceTrade =
            this.cloneClosedTrade(trade);

          return Object.freeze({
            sequence: index + 1,

            id: trade.id,
            positionId:
              trade.positionId,
            orderId: trade.orderId,

            symbol:
              trade.symbol
                .trim()
                .toUpperCase(),

            side: trade.side,

            quantity: trade.quantity,
            entryPrice:
              trade.entryPrice,
            exitPrice:
              trade.exitPrice,

            grossRealizedPnl:
              trade.grossRealizedPnl,

            entryFee:
              trade.entryFee,

            exitFee:
              trade.exitFee,

            totalFees,

            netRealizedPnl:
              trade.netRealizedPnl,

            openedAt:
              trade.openedAt,

            closedAt:
              trade.closedAt,

            duration,
            outcome,

            sourceTrade,
          });
        },
      );

    return Object.freeze(normalized);
  }

  private createSummary(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradePerformanceSummary {
    return Object.freeze({
      outcomes:
        this.calculateOutcomeStatistics(
          trades,
        ),

      profit:
        this.calculateProfitStatistics(
          trades,
        ),

      duration:
        this.calculateDurationStatistics(
          trades,
        ),

      streaks:
        this.calculateStreakStatistics(
          trades,
        ),

      sides:
        this.calculateSideStatistics(
          trades,
        ),

      symbols:
        this.calculateSymbolStatistics(
          trades,
        ),
    });
  }

  private calculateOutcomeStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradeOutcomeStatistics {
    const totalTrades =
      trades.length;

    const winningTrades =
      trades.filter(
        (trade) =>
          trade.outcome === "WIN",
      ).length;

    const losingTrades =
      trades.filter(
        (trade) =>
          trade.outcome === "LOSS",
      ).length;

    const breakevenTrades =
      totalTrades -
      winningTrades -
      losingTrades;

    return Object.freeze({
      totalTrades,

      winningTrades,
      losingTrades,
      breakevenTrades,

      winRate:
        totalTrades === 0
          ? 0
          : winningTrades /
            totalTrades,

      lossRate:
        totalTrades === 0
          ? 0
          : losingTrades /
            totalTrades,

      breakevenRate:
        totalTrades === 0
          ? 0
          : breakevenTrades /
            totalTrades,
    });
  }

  private calculateProfitStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradeProfitStatistics {
    if (trades.length === 0) {
      return Object.freeze({
        grossProfit: 0,
        grossLoss: 0,
        netProfit: 0,

        averageTrade: 0,
        averageWin: 0,
        averageLoss: 0,

        largestWin: 0,
        largestLoss: 0,

        profitFactor: null,
        payoffRatio: null,

        expectancy: 0,
        expectancyRatio: null,
      });
    }

    const winningValues =
      trades
        .filter(
          (trade) =>
            trade.outcome === "WIN",
        )
        .map(
          (trade) =>
            trade.netRealizedPnl,
        );

    const losingValues =
      trades
        .filter(
          (trade) =>
            trade.outcome === "LOSS",
        )
        .map(
          (trade) =>
            trade.netRealizedPnl,
        );

    const grossProfit =
      winningValues.reduce(
        (total, value) =>
          total + value,
        0,
      );

    const grossLoss =
      Math.abs(
        losingValues.reduce(
          (total, value) =>
            total + value,
          0,
        ),
      );

    const netProfit =
      trades.reduce(
        (total, trade) =>
          total +
          trade.netRealizedPnl,
        0,
      );

    const averageTrade =
      netProfit /
      trades.length;

    const averageWin =
      winningValues.length === 0
        ? 0
        : grossProfit /
          winningValues.length;

    const averageLoss =
      losingValues.length === 0
        ? 0
        : grossLoss /
          losingValues.length;

    const largestWin =
      winningValues.length === 0
        ? 0
        : Math.max(
            ...winningValues,
          );

    const largestLoss =
      losingValues.length === 0
        ? 0
        : Math.abs(
            Math.min(
              ...losingValues,
            ),
          );

    const profitFactor =
      grossLoss === 0
        ? null
        : grossProfit /
          grossLoss;

    const payoffRatio =
      averageLoss === 0
        ? null
        : averageWin /
          averageLoss;

    const winningTrades =
      winningValues.length;

    const losingTrades =
      losingValues.length;

    const winRate =
      winningTrades /
      trades.length;

    const lossRate =
      losingTrades /
      trades.length;

    const expectancy =
      (
        winRate *
        averageWin
      ) -
      (
        lossRate *
        averageLoss
      );

    const expectancyRatio =
      averageLoss === 0
        ? null
        : expectancy /
          averageLoss;

    return Object.freeze({
      grossProfit,
      grossLoss,
      netProfit,

      averageTrade,
      averageWin,
      averageLoss,

      largestWin,
      largestLoss,

      profitFactor,
      payoffRatio,

      expectancy,
      expectancyRatio,
    });
  }

  private calculateDurationStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradeDurationStatistics {
    if (trades.length === 0) {
      return Object.freeze({
        totalDuration: 0,
        averageDuration: 0,
        minimumDuration: 0,
        maximumDuration: 0,

        averageWinningDuration: 0,
        averageLosingDuration: 0,
        averageBreakevenDuration: 0,
      });
    }

    const durations =
      trades.map(
        (trade) =>
          trade.duration,
      );

    const winningDurations =
      trades
        .filter(
          (trade) =>
            trade.outcome === "WIN",
        )
        .map(
          (trade) =>
            trade.duration,
        );

    const losingDurations =
      trades
        .filter(
          (trade) =>
            trade.outcome === "LOSS",
        )
        .map(
          (trade) =>
            trade.duration,
        );

    const breakevenDurations =
      trades
        .filter(
          (trade) =>
            trade.outcome ===
            "BREAKEVEN",
        )
        .map(
          (trade) =>
            trade.duration,
        );

    const totalDuration =
      durations.reduce(
        (total, duration) =>
          total + duration,
        0,
      );

    return Object.freeze({
      totalDuration,

      averageDuration:
        totalDuration /
        durations.length,

      minimumDuration:
        Math.min(...durations),

      maximumDuration:
        Math.max(...durations),

      averageWinningDuration:
        this.calculateAverage(
          winningDurations,
        ),

      averageLosingDuration:
        this.calculateAverage(
          losingDurations,
        ),

      averageBreakevenDuration:
        this.calculateAverage(
          breakevenDurations,
        ),
    });
  }

  private calculateStreakStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradeStreakStatistics {
    let maximumConsecutiveWins = 0;
    let maximumConsecutiveLosses = 0;

    let maximumConsecutiveBreakevenTrades =
      0;

    let currentWinningStreak = 0;
    let currentLosingStreak = 0;
    let currentBreakevenStreak = 0;

    for (const trade of trades) {
      if (trade.outcome === "WIN") {
        currentWinningStreak += 1;
        currentLosingStreak = 0;
        currentBreakevenStreak = 0;

        maximumConsecutiveWins =
          Math.max(
            maximumConsecutiveWins,
            currentWinningStreak,
          );

        continue;
      }

      if (trade.outcome === "LOSS") {
        currentWinningStreak = 0;
        currentLosingStreak += 1;
        currentBreakevenStreak = 0;

        maximumConsecutiveLosses =
          Math.max(
            maximumConsecutiveLosses,
            currentLosingStreak,
          );

        continue;
      }

      currentWinningStreak = 0;
      currentLosingStreak = 0;
      currentBreakevenStreak += 1;

      maximumConsecutiveBreakevenTrades =
        Math.max(
          maximumConsecutiveBreakevenTrades,
          currentBreakevenStreak,
        );
    }

    return Object.freeze({
      maximumConsecutiveWins,
      maximumConsecutiveLosses,
      maximumConsecutiveBreakevenTrades,

      currentWinningStreak,
      currentLosingStreak,
      currentBreakevenStreak,
    });
  }

  private calculateSideStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): BacktestTradeSideStatistics {
    let longTrades = 0;
    let shortTrades = 0;

    let longWinningTrades = 0;
    let longLosingTrades = 0;
    let longBreakevenTrades = 0;

    let shortWinningTrades = 0;
    let shortLosingTrades = 0;
    let shortBreakevenTrades = 0;

    let longNetProfit = 0;
    let shortNetProfit = 0;

    for (const trade of trades) {
      if (trade.side === "LONG") {
        longTrades += 1;

        longNetProfit +=
          trade.netRealizedPnl;

        if (trade.outcome === "WIN") {
          longWinningTrades += 1;
        } else if (
          trade.outcome === "LOSS"
        ) {
          longLosingTrades += 1;
        } else {
          longBreakevenTrades += 1;
        }

        continue;
      }

      shortTrades += 1;

      shortNetProfit +=
        trade.netRealizedPnl;

      if (trade.outcome === "WIN") {
        shortWinningTrades += 1;
      } else if (
        trade.outcome === "LOSS"
      ) {
        shortLosingTrades += 1;
      } else {
        shortBreakevenTrades += 1;
      }
    }

    return Object.freeze({
      longTrades,
      shortTrades,

      longWinningTrades,
      longLosingTrades,
      longBreakevenTrades,

      shortWinningTrades,
      shortLosingTrades,
      shortBreakevenTrades,

      longNetProfit,
      shortNetProfit,
    });
  }

  private calculateSymbolStatistics(
    trades:
      readonly BacktestAnalyzedTrade[],
  ): readonly BacktestSymbolTradeStatistics[] {
    const groupedTrades =
      new Map<
        string,
        BacktestAnalyzedTrade[]
      >();

    for (const trade of trades) {
      const existing =
        groupedTrades.get(
          trade.symbol,
        );

      if (existing === undefined) {
        groupedTrades.set(
          trade.symbol,
          [trade],
        );

        continue;
      }

      existing.push(trade);
    }

    const statistics:
      BacktestSymbolTradeStatistics[] = [];

    const symbols =
      [...groupedTrades.keys()]
        .sort(
          (
            first,
            second,
          ) =>
            first.localeCompare(
              second,
            ),
        );

    for (const symbol of symbols) {
      const symbolTrades =
        groupedTrades.get(symbol);

      if (symbolTrades === undefined) {
        throw new Error(
          `Trade analytics symbol group "${symbol}" is missing.`,
        );
      }

      const winningTrades =
        symbolTrades.filter(
          (trade) =>
            trade.outcome === "WIN",
        );

      const losingTrades =
        symbolTrades.filter(
          (trade) =>
            trade.outcome === "LOSS",
        );

      const breakevenTrades =
        symbolTrades.length -
        winningTrades.length -
        losingTrades.length;

      const grossProfit =
        winningTrades.reduce(
          (total, trade) =>
            total +
            trade.netRealizedPnl,
          0,
        );

      const grossLoss =
        Math.abs(
          losingTrades.reduce(
            (total, trade) =>
              total +
              trade.netRealizedPnl,
            0,
          ),
        );

      const netProfit =
        symbolTrades.reduce(
          (total, trade) =>
            total +
            trade.netRealizedPnl,
          0,
        );

      statistics.push(
        Object.freeze({
          symbol,

          totalTrades:
            symbolTrades.length,

          winningTrades:
            winningTrades.length,

          losingTrades:
            losingTrades.length,

          breakevenTrades,

          grossProfit,
          grossLoss,
          netProfit,

          winRate:
            symbolTrades.length === 0
              ? 0
              : winningTrades.length /
                symbolTrades.length,

          profitFactor:
            grossLoss === 0
              ? null
              : grossProfit /
                grossLoss,
        }),
      );
    }

    return Object.freeze(statistics);
  }

  private validateTrades(
    trades: readonly ClosedTrade[],
  ): void {
    if (!Array.isArray(trades)) {
      throw new Error(
        "Backtest trade analytics trades must be an array.",
      );
    }

    let previousClosedAt:
      number | null = null;

    const tradeIds =
      new Set<string>();

    for (const trade of trades) {
      if (
        trade === null ||
        typeof trade !== "object"
      ) {
        throw new Error(
          "Backtest trade analytics trade must be an object.",
        );
      }

      this.validateIdentifier(
        trade.id,
        "Trade ID",
      );

      this.validateIdentifier(
        trade.positionId,
        "Trade position ID",
      );

      this.validateIdentifier(
        trade.orderId,
        "Trade order ID",
      );

      this.validateIdentifier(
        trade.symbol,
        "Trade symbol",
      );

      if (tradeIds.has(trade.id)) {
        throw new Error(
          `Backtest trade analytics contains duplicate trade ID "${trade.id}".`,
        );
      }

      tradeIds.add(trade.id);

      if (
        trade.side !== "LONG" &&
        trade.side !== "SHORT"
      ) {
        throw new Error(
          "Backtest trade side must be LONG or SHORT.",
        );
      }

      this.assertPositiveFiniteNumber(
        trade.quantity,
        "Trade quantity",
      );

      this.assertPositiveFiniteNumber(
        trade.entryPrice,
        "Trade entry price",
      );

      this.assertPositiveFiniteNumber(
        trade.exitPrice,
        "Trade exit price",
      );

      this.assertFiniteNumber(
        trade.grossRealizedPnl,
        "Trade gross realized PnL",
      );

      this.assertNonNegativeFiniteNumber(
        trade.entryFee,
        "Trade entry fee",
      );

      this.assertNonNegativeFiniteNumber(
        trade.exitFee,
        "Trade exit fee",
      );

      this.assertFiniteNumber(
        trade.netRealizedPnl,
        "Trade net realized PnL",
      );

      this.validateTimestamp(
        trade.openedAt,
        "Trade openedAt",
      );

      this.validateTimestamp(
        trade.closedAt,
        "Trade closedAt",
      );

      if (
        trade.closedAt <
        trade.openedAt
      ) {
        throw new Error(
          "Trade closedAt cannot be earlier than openedAt.",
        );
      }

      if (
        previousClosedAt !== null &&
        trade.closedAt <
          previousClosedAt
      ) {
        throw new Error(
          "Backtest trade analytics trades must be ordered by non-decreasing close time.",
        );
      }

      if (
        trade.metadata === null ||
        typeof trade.metadata !==
          "object" ||
        Array.isArray(
          trade.metadata,
        )
      ) {
        throw new Error(
          "Trade metadata must be a plain object.",
        );
      }

      previousClosedAt =
        trade.closedAt;
    }
  }

  private cloneClosedTrade(
    trade: ClosedTrade,
  ): ClosedTrade {
    return Object.freeze({
      ...trade,

      symbol:
        trade.symbol
          .trim()
          .toUpperCase(),

      metadata:
        Object.freeze({
          ...trade.metadata,
        }),
    });
  }

  private classifyOutcome(
    netRealizedPnl: number,
  ): BacktestTradeOutcome {
    if (netRealizedPnl > 0) {
      return "WIN";
    }

    if (netRealizedPnl < 0) {
      return "LOSS";
    }

    return "BREAKEVEN";
  }

  private calculateAverage(
    values: readonly number[],
  ): number {
    if (values.length === 0) {
      return 0;
    }

    return (
      values.reduce(
        (total, value) =>
          total + value,
        0,
      ) /
      values.length
    );
  }

  private validateIdentifier(
    value: string,
    label: string,
  ): void {
    if (
      typeof value !== "string" ||
      value.trim().length === 0
    ) {
      throw new Error(
        `${label} must be non-empty.`,
      );
    }
  }

  private validateGeneratedAt(
    generatedAt: number,
  ): void {
    this.validateTimestamp(
      generatedAt,
      "Backtest trade analytics generatedAt",
    );
  }

  private validateTimestamp(
    value: number,
    label: string,
  ): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `${label} must be a non-negative safe integer.`,
      );
    }
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

  private assertPositiveFiniteNumber(
    value: number,
    label: string,
  ): void {
    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `${label} must be a positive finite number.`,
      );
    }
  }

  private assertNonNegativeFiniteNumber(
    value: number,
    label: string,
  ): void {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        `${label} must be a non-negative finite number.`,
      );
    }
  }
}