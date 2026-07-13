import type {
  ExecutionReport,
} from "../execution";

import {
  PositionManager,
} from "./position-manager";

import type {
  ClosedTrade,
  PortfolioManagerOptions,
  PortfolioSnapshot,
  Position,
  PositionUpdate,
} from "./portfolio.types";

export class PortfolioManager {
  private readonly initialBalance:
    number;

  private cashBalance: number;
  private realizedPnl = 0;
  private totalFees = 0;

  private readonly positionManager:
    PositionManager;

  constructor(
    options: PortfolioManagerOptions = {},
    positionManager =
      new PositionManager(),
  ) {
    this.initialBalance =
      options.initialBalance ??
      10_000;

    if (
      !Number.isFinite(
        this.initialBalance,
      ) ||
      this.initialBalance <= 0
    ) {
      throw new Error(
        "Portfolio initial balance must be a positive finite number.",
      );
    }

    this.cashBalance =
      this.initialBalance;

    this.positionManager =
      positionManager;
  }

  processExecution(
    report: ExecutionReport,
  ): PositionUpdate {
    const update =
      this.positionManager
        .processExecution(report);

    this.realizedPnl +=
      update.grossRealizedPnl;

    this.totalFees +=
      update.fee;

    this.cashBalance +=
      update.grossRealizedPnl -
      update.fee;

    return update;
  }

  updateMarketPrice(
    symbol: string,
    marketPrice: number,
  ): Position {
    return this.positionManager
      .updateMarketPrice(
        symbol,
        marketPrice,
      );
  }

  updateMarketPrices(
    prices: Record<string, number>,
  ): Position[] {
    const updatedPositions:
      Position[] = [];

    for (
      const [
        symbol,
        marketPrice,
      ] of Object.entries(prices)
    ) {
      const position =
        this.positionManager
          .getPosition(symbol);

      if (!position) {
        continue;
      }

      updatedPositions.push(
        this.updateMarketPrice(
          symbol,
          marketPrice,
        ),
      );
    }

    return updatedPositions;
  }

  getPosition(
    symbol: string,
  ): Position | undefined {
    return this.positionManager
      .getPosition(symbol);
  }

  listOpenPositions(): Position[] {
    return this.positionManager
      .listOpenPositions();
  }

  listClosedTrades(): ClosedTrade[] {
    return this.positionManager
      .listClosedTrades();
  }

  getSnapshot(): PortfolioSnapshot {
    const openPositions =
      this.listOpenPositions();

    const closedTrades =
      this.listClosedTrades();

    const unrealizedPnl =
      openPositions.reduce(
        (
          total,
          position,
        ) =>
          total +
          position.unrealizedPnl,
        0,
      );

    const marginUsed =
      openPositions.reduce(
        (
          total,
          position,
        ) =>
          total +
          position.marginUsed,
        0,
      );

    const totalExposure =
      openPositions.reduce(
        (
          total,
          position,
        ) =>
          total +
          position.lastPrice *
            position.quantity,
        0,
      );

    const equity =
      this.cashBalance +
      unrealizedPnl;

    const availableBalance =
      equity -
      marginUsed;

    const winningTrades =
      closedTrades.filter(
        (trade) =>
          trade.netRealizedPnl > 0,
      ).length;

    const losingTrades =
      closedTrades.filter(
        (trade) =>
          trade.netRealizedPnl < 0,
      ).length;

    const completedTrades =
      winningTrades +
      losingTrades;

    const winRate =
      completedTrades === 0
        ? 0
        : winningTrades /
          completedTrades;

    const returnPercentage =
      (
        (
          equity -
          this.initialBalance
        ) /
        this.initialBalance
      ) * 100;

    return {
      initialBalance:
        this.initialBalance,
      cashBalance:
        this.cashBalance,
      equity,
      availableBalance,
      marginUsed,
      totalExposure,
      unrealizedPnl,
      realizedPnl:
        this.realizedPnl,
      totalFees:
        this.totalFees,
      openPositionCount:
        openPositions.length,
      closedTradeCount:
        closedTrades.length,
      winningTrades,
      losingTrades,
      winRate,
      returnPercentage,
    };
  }

  clear(): void {
    this.cashBalance =
      this.initialBalance;

    this.realizedPnl = 0;
    this.totalFees = 0;

    this.positionManager.clear();
  }
}