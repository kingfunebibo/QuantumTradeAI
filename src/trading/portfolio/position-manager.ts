import type {
  ExecutionFill,
  ExecutionOrder,
  ExecutionReport,
} from "../execution";

import {
  SystemPositionRuntime,
} from "./position-runtime";

import type {
  PositionRuntime,
} from "./position-runtime";

import type {
  ClosedTrade,
  Position,
  PositionSide,
  PositionUpdate,
} from "./portfolio.types";

export class PositionManager {
  private readonly positions =
    new Map<string, Position>();

  private readonly closedTrades:
    ClosedTrade[] = [];

  public constructor(
    private readonly runtime:
      PositionRuntime =
        new SystemPositionRuntime(),
  ) {
    this.validateRuntime(runtime);
  }

  public processExecution(
    report: ExecutionReport,
  ): PositionUpdate {
    if (
      report === null ||
      typeof report !== "object"
    ) {
      throw new Error(
        "Position execution report must be an object.",
      );
    }

    if (
      !report.accepted ||
      report.order.status !== "FILLED" ||
      report.fill === undefined
    ) {
      throw new Error(
        "Only accepted and filled execution reports can update positions.",
      );
    }

    this.validateExecution(
      report.order,
      report.fill,
    );

    const existingPosition =
      this.positions.get(
        report.order.symbol,
      );

    if (
      existingPosition === undefined
    ) {
      return this.openPosition(
        report.order,
        report.fill,
      );
    }

    const incomingSide =
      this.toPositionSide(
        report.fill.side,
      );

    if (
      existingPosition.side ===
      incomingSide
    ) {
      return this.increasePosition(
        existingPosition,
        report.order,
        report.fill,
      );
    }

    return this.reducePosition(
      existingPosition,
      report.order,
      report.fill,
    );
  }

  public updateMarketPrice(
    symbol: string,
    marketPrice: number,
  ): Position {
    const normalizedSymbol =
      this.normalizeSymbol(symbol);

    if (
      !Number.isFinite(marketPrice) ||
      marketPrice <= 0
    ) {
      throw new Error(
        "Position market price must be a positive finite number.",
      );
    }

    const position =
      this.positions.get(
        normalizedSymbol,
      );

    if (
      position === undefined
    ) {
      throw new Error(
        `No open position exists for "${normalizedSymbol}".`,
      );
    }

    const updatedPosition =
      this.recalculatePosition({
        ...position,
        lastPrice:
          marketPrice,
        updatedAt:
          this.runtime.now(),
      });

    this.positions.set(
      normalizedSymbol,
      updatedPosition,
    );

    return this.clonePosition(
      updatedPosition,
    );
  }

  public getPosition(
    symbol: string,
  ): Position | undefined {
    const normalizedSymbol =
      this.normalizeSymbol(symbol);

    const position =
      this.positions.get(
        normalizedSymbol,
      );

    return position === undefined
      ? undefined
      : this.clonePosition(
          position,
        );
  }

  public listOpenPositions():
    Position[] {
    return Array.from(
      this.positions.values(),
    ).map(
      (position) =>
        this.clonePosition(
          position,
        ),
    );
  }

  public listClosedTrades():
    ClosedTrade[] {
    return this.closedTrades.map(
      (trade) =>
        this.cloneClosedTrade(
          trade,
        ),
    );
  }

  public clear(): void {
    this.positions.clear();
    this.closedTrades.splice(
      0,
      this.closedTrades.length,
    );

    this.runtime.reset();
  }

  private openPosition(
    order: ExecutionOrder,
    fill: ExecutionFill,
  ): PositionUpdate {
    const timestamp =
      fill.filledAt;

    const position =
      this.recalculatePosition({
        id:
          this.runtime.nextPositionId(),
        symbol:
          fill.symbol,
        side:
          this.toPositionSide(
            fill.side,
          ),
        quantity:
          fill.quantity,
        averageEntryPrice:
          fill.fillPrice,
        lastPrice:
          fill.fillPrice,
        leverage:
          order.leverage,
        marginUsed: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        entryFees:
          fill.fee,
        totalFees:
          fill.fee,
        openedAt:
          timestamp,
        updatedAt:
          timestamp,
        metadata: {
          ...order.metadata,
          openingOrderId:
            order.id,
          openingFillId:
            fill.id,
          stopLossPrice:
            order.stopLossPrice,
        },
      });

    this.positions.set(
      position.symbol,
      position,
    );

    return {
      action: "OPENED",
      grossRealizedPnl: 0,
      fee:
        fill.fee,
      position:
        this.clonePosition(
          position,
        ),
    };
  }

  private increasePosition(
    position: Position,
    order: ExecutionOrder,
    fill: ExecutionFill,
  ): PositionUpdate {
    if (
      position.leverage !==
      order.leverage
    ) {
      throw new Error(
        "Cannot increase a position using a different leverage value.",
      );
    }

    const combinedQuantity =
      position.quantity +
      fill.quantity;

    const weightedEntryPrice =
      (
        position.averageEntryPrice *
          position.quantity +
        fill.fillPrice *
          fill.quantity
      ) /
      combinedQuantity;

    const updatedPosition =
      this.recalculatePosition({
        ...position,
        quantity:
          combinedQuantity,
        averageEntryPrice:
          weightedEntryPrice,
        lastPrice:
          fill.fillPrice,
        entryFees:
          position.entryFees +
          fill.fee,
        totalFees:
          position.totalFees +
          fill.fee,
        updatedAt:
          fill.filledAt,
        metadata: {
          ...position.metadata,
          latestOrderId:
            order.id,
          latestFillId:
            fill.id,
        },
      });

    this.positions.set(
      position.symbol,
      updatedPosition,
    );

    return {
      action: "INCREASED",
      grossRealizedPnl: 0,
      fee:
        fill.fee,
      position:
        this.clonePosition(
          updatedPosition,
        ),
    };
  }

  private reducePosition(
    position: Position,
    order: ExecutionOrder,
    fill: ExecutionFill,
  ): PositionUpdate {
    const closingQuantity =
      Math.min(
        position.quantity,
        fill.quantity,
      );

    const entryFeeAllocated =
      position.entryFees *
      (
        closingQuantity /
        position.quantity
      );

    const exitFeeAllocated =
      fill.fee *
      (
        closingQuantity /
        fill.quantity
      );

    const grossRealizedPnl =
      this.calculateRealizedPnl(
        position,
        fill.fillPrice,
        closingQuantity,
      );

    const closedTrade:
      ClosedTrade = {
        id:
          this.runtime
            .nextClosedTradeId(),
        positionId:
          position.id,
        orderId:
          order.id,
        symbol:
          position.symbol,
        side:
          position.side,
        quantity:
          closingQuantity,
        entryPrice:
          position.averageEntryPrice,
        exitPrice:
          fill.fillPrice,
        grossRealizedPnl,
        entryFee:
          entryFeeAllocated,
        exitFee:
          exitFeeAllocated,
        netRealizedPnl:
          grossRealizedPnl -
          entryFeeAllocated -
          exitFeeAllocated,
        openedAt:
          position.openedAt,
        closedAt:
          fill.filledAt,
        metadata: {
          ...position.metadata,
          closingOrderId:
            order.id,
          closingFillId:
            fill.id,
        },
      };

    this.closedTrades.push(
      closedTrade,
    );

    if (
      fill.quantity <
      position.quantity
    ) {
      const remainingQuantity =
        position.quantity -
        fill.quantity;

      const remainingEntryFees =
        position.entryFees -
        entryFeeAllocated;

      const updatedPosition =
        this.recalculatePosition({
          ...position,
          quantity:
            remainingQuantity,
          lastPrice:
            fill.fillPrice,
          realizedPnl:
            position.realizedPnl +
            grossRealizedPnl,
          entryFees:
            remainingEntryFees,
          totalFees:
            position.totalFees +
            fill.fee,
          updatedAt:
            fill.filledAt,
          metadata: {
            ...position.metadata,
            latestReductionOrderId:
              order.id,
          },
        });

      this.positions.set(
        position.symbol,
        updatedPosition,
      );

      return {
        action: "REDUCED",
        grossRealizedPnl,
        fee:
          fill.fee,
        position:
          this.clonePosition(
            updatedPosition,
          ),
        closedTrade:
          this.cloneClosedTrade(
            closedTrade,
          ),
      };
    }

    this.positions.delete(
      position.symbol,
    );

    if (
      fill.quantity ===
      position.quantity
    ) {
      return {
        action: "CLOSED",
        grossRealizedPnl,
        fee:
          fill.fee,
        closedTrade:
          this.cloneClosedTrade(
            closedTrade,
          ),
      };
    }

    const remainingQuantity =
      fill.quantity -
      position.quantity;

    const openingFee =
      fill.fee -
      exitFeeAllocated;

    const reversedPosition =
      this.recalculatePosition({
        id:
          this.runtime
            .nextPositionId(),
        symbol:
          fill.symbol,
        side:
          this.toPositionSide(
            fill.side,
          ),
        quantity:
          remainingQuantity,
        averageEntryPrice:
          fill.fillPrice,
        lastPrice:
          fill.fillPrice,
        leverage:
          order.leverage,
        marginUsed: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        entryFees:
          openingFee,
        totalFees:
          openingFee,
        openedAt:
          fill.filledAt,
        updatedAt:
          fill.filledAt,
        metadata: {
          ...order.metadata,
          reversedFromPositionId:
            position.id,
          openingOrderId:
            order.id,
          openingFillId:
            fill.id,
          stopLossPrice:
            order.stopLossPrice,
        },
      });

    this.positions.set(
      reversedPosition.symbol,
      reversedPosition,
    );

    return {
      action: "REVERSED",
      grossRealizedPnl,
      fee:
        fill.fee,
      position:
        this.clonePosition(
          reversedPosition,
        ),
      closedTrade:
        this.cloneClosedTrade(
          closedTrade,
        ),
    };
  }

  private calculateRealizedPnl(
    position: Position,
    exitPrice: number,
    quantity: number,
  ): number {
    if (
      position.side === "LONG"
    ) {
      return (
        exitPrice -
        position.averageEntryPrice
      ) *
      quantity;
    }

    return (
      position.averageEntryPrice -
      exitPrice
    ) *
    quantity;
  }

  private recalculatePosition(
    position: Position,
  ): Position {
    const priceDifference =
      position.side === "LONG"
        ? position.lastPrice -
          position.averageEntryPrice
        : position.averageEntryPrice -
          position.lastPrice;

    const unrealizedPnl =
      priceDifference *
      position.quantity;

    const marginUsed =
      (
        position.lastPrice *
        position.quantity
      ) /
      position.leverage;

    return {
      ...position,
      unrealizedPnl,
      marginUsed,
    };
  }

  private validateExecution(
    order: ExecutionOrder,
    fill: ExecutionFill,
  ): void {
    if (
      order === null ||
      typeof order !== "object"
    ) {
      throw new Error(
        "Execution order must be an object.",
      );
    }

    if (
      fill === null ||
      typeof fill !== "object"
    ) {
      throw new Error(
        "Execution fill must be an object.",
      );
    }

    if (
      fill.orderId !==
      order.id
    ) {
      throw new Error(
        "Execution fill order ID does not match the execution order.",
      );
    }

    if (
      fill.symbol !==
      order.symbol
    ) {
      throw new Error(
        "Execution fill symbol does not match the execution order.",
      );
    }

    if (
      fill.side !==
      order.side
    ) {
      throw new Error(
        "Execution fill side does not match the execution order.",
      );
    }

    if (
      !Number.isFinite(
        fill.quantity,
      ) ||
      fill.quantity <= 0
    ) {
      throw new Error(
        "Position fill quantity must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        fill.fillPrice,
      ) ||
      fill.fillPrice <= 0
    ) {
      throw new Error(
        "Position fill price must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        fill.fee,
      ) ||
      fill.fee < 0
    ) {
      throw new Error(
        "Position fill fee must be a non-negative finite number.",
      );
    }

    if (
      !Number.isSafeInteger(
        fill.filledAt,
      ) ||
      fill.filledAt < 0
    ) {
      throw new Error(
        "Position fill timestamp must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isFinite(
        order.leverage,
      ) ||
      order.leverage < 1
    ) {
      throw new Error(
        "Position leverage must be at least 1.",
      );
    }
  }

  private toPositionSide(
    side: "BUY" | "SELL",
  ): PositionSide {
    return side === "BUY"
      ? "LONG"
      : "SHORT";
  }

  private normalizeSymbol(
    symbol: string,
  ): string {
    if (
      typeof symbol !== "string"
    ) {
      throw new Error(
        "Position symbol must be a string.",
      );
    }

    const normalizedSymbol =
      symbol.trim();

    if (
      normalizedSymbol.length === 0
    ) {
      throw new Error(
        "Position symbol cannot be empty.",
      );
    }

    return normalizedSymbol;
  }

  private validateRuntime(
    runtime: PositionRuntime,
  ): void {
    if (
      runtime === null ||
      typeof runtime !== "object" ||
      typeof runtime.now !==
        "function" ||
      typeof runtime.nextPositionId !==
        "function" ||
      typeof runtime.nextClosedTradeId !==
        "function" ||
      typeof runtime.reset !==
        "function"
    ) {
      throw new Error(
        "Position manager requires a valid position runtime.",
      );
    }
  }

  private clonePosition(
    position: Position,
  ): Position {
    return {
      ...position,
      metadata: {
        ...position.metadata,
      },
    };
  }

  private cloneClosedTrade(
    trade: ClosedTrade,
  ): ClosedTrade {
    return {
      ...trade,
      metadata: {
        ...trade.metadata,
      },
    };
  }
}