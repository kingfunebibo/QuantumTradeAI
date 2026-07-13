import { randomUUID } from "node:crypto";

import type {
  ExecutionEngineOptions,
  ExecutionFill,
  ExecutionOrder,
  ExecutionReport,
  ExecutionRequest,
  ExecutionSummary,
} from "./execution.types";

export class ExecutionEngine {
  private readonly slippageRate: number;
  private readonly tradingFeeRate: number;

  private readonly orders =
    new Map<string, ExecutionOrder>();

  private readonly fills =
    new Map<string, ExecutionFill>();

  private readonly executedSignalIds =
    new Set<string>();

  constructor(
    options: ExecutionEngineOptions = {},
  ) {
    this.slippageRate =
      options.slippageRate ?? 0.0005;

    this.tradingFeeRate =
      options.tradingFeeRate ?? 0.001;

    this.validateOptions();
  }

  executeMarketOrder(
    request: ExecutionRequest,
  ): ExecutionReport {
    this.validateRequest(request);

    const {
      trade,
    } = request;

    const marketPrice =
      request.marketPrice ??
      trade.entryPrice;

    const now = Date.now();

    const order: ExecutionOrder = {
      id: randomUUID(),
      signalId: trade.signalId,
      strategyId: trade.strategyId,
      symbol: trade.symbol,
      timeframe: trade.timeframe,
      side: trade.side,
      type: "MARKET",
      status: "PENDING",
      requestedPrice: marketPrice,
      requestedQuantity:
        trade.quantity,
      leverage: trade.leverage,
      stopLossPrice:
        trade.stopLossPrice,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...trade.metadata,
        approvedAt:
          trade.approvedAt,
        approvedRiskAmount:
          trade.riskAmount,
        approvedPositionNotional:
          trade.positionNotional,
      },
    };

    if (
      this.executedSignalIds.has(
        trade.signalId,
      )
    ) {
      const rejectedOrder = {
        ...order,
        status:
          "REJECTED" as const,
        updatedAt: Date.now(),
      };

      this.orders.set(
        rejectedOrder.id,
        rejectedOrder,
      );

      return {
        accepted: false,
        reason:
          `Signal "${trade.signalId}" has already been executed.`,
        order: rejectedOrder,
      };
    }

    const fillPrice =
      this.calculateFillPrice(
        marketPrice,
        trade.side,
      );

    const grossNotional =
      fillPrice * trade.quantity;

    const fee =
      grossNotional *
      this.tradingFeeRate;

    const netNotional =
      trade.side === "BUY"
        ? grossNotional + fee
        : grossNotional - fee;

    const slippageAmount =
      Math.abs(
        fillPrice - marketPrice,
      ) * trade.quantity;

    const fill: ExecutionFill = {
      id: randomUUID(),
      orderId: order.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      requestedPrice:
        marketPrice,
      fillPrice,
      grossNotional,
      fee,
      netNotional,
      slippageAmount,
      slippageRate:
        this.slippageRate,
      filledAt: Date.now(),
    };

    const filledOrder: ExecutionOrder = {
      ...order,
      status: "FILLED",
      updatedAt: fill.filledAt,
    };

    this.orders.set(
      filledOrder.id,
      filledOrder,
    );

    this.fills.set(
      filledOrder.id,
      fill,
    );

    this.executedSignalIds.add(
      trade.signalId,
    );

    return {
      accepted: true,
      reason:
        "Market order filled successfully.",
      order: filledOrder,
      fill,
    };
  }

  getOrder(
    orderId: string,
  ): ExecutionOrder {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "Order ID cannot be empty.",
      );
    }

    const order =
      this.orders.get(
        normalizedOrderId,
      );

    if (!order) {
      throw new Error(
        `Order "${normalizedOrderId}" was not found.`,
      );
    }

    return {
      ...order,
      metadata: {
        ...order.metadata,
      },
    };
  }

  getFill(
    orderId: string,
  ): ExecutionFill | undefined {
    const fill =
      this.fills.get(
        orderId.trim(),
      );

    return fill
      ? {
          ...fill,
        }
      : undefined;
  }

  listOrders(): ExecutionOrder[] {
    return Array.from(
      this.orders.values(),
    ).map((order) => ({
      ...order,
      metadata: {
        ...order.metadata,
      },
    }));
  }

  listFills(): ExecutionFill[] {
    return Array.from(
      this.fills.values(),
    ).map((fill) => ({
      ...fill,
    }));
  }

  cancelOrder(
    orderId: string,
  ): ExecutionReport {
    const order =
      this.getOrder(orderId);

    if (order.status !== "PENDING") {
      return {
        accepted: false,
        reason:
          `Only pending orders can be cancelled. Current status: ${order.status}.`,
        order,
        fill:
          this.getFill(order.id),
      };
    }

    const cancelledOrder: ExecutionOrder = {
      ...order,
      status: "CANCELLED",
      updatedAt: Date.now(),
    };

    this.orders.set(
      cancelledOrder.id,
      cancelledOrder,
    );

    return {
      accepted: true,
      reason:
        "Order cancelled successfully.",
      order: cancelledOrder,
    };
  }

  hasExecutedSignal(
    signalId: string,
  ): boolean {
    return this.executedSignalIds.has(
      signalId.trim(),
    );
  }

  getSummary(): ExecutionSummary {
    const orders =
      Array.from(
        this.orders.values(),
      );

    return {
      totalOrders: orders.length,
      pendingOrders:
        orders.filter(
          (order) =>
            order.status ===
            "PENDING",
        ).length,
      filledOrders:
        orders.filter(
          (order) =>
            order.status ===
            "FILLED",
        ).length,
      cancelledOrders:
        orders.filter(
          (order) =>
            order.status ===
            "CANCELLED",
        ).length,
      rejectedOrders:
        orders.filter(
          (order) =>
            order.status ===
            "REJECTED",
        ).length,
    };
  }

  clear(): void {
    this.orders.clear();
    this.fills.clear();
    this.executedSignalIds.clear();
  }

  private validateOptions(): void {
    if (
      !Number.isFinite(
        this.slippageRate,
      ) ||
      this.slippageRate < 0 ||
      this.slippageRate > 1
    ) {
      throw new Error(
        "Execution slippage rate must be between 0 and 1.",
      );
    }

    if (
      !Number.isFinite(
        this.tradingFeeRate,
      ) ||
      this.tradingFeeRate < 0 ||
      this.tradingFeeRate > 1
    ) {
      throw new Error(
        "Execution trading fee rate must be between 0 and 1.",
      );
    }
  }

  private validateRequest(
    request: ExecutionRequest,
  ): void {
    const {
      trade,
    } = request;

    if (!trade.signalId.trim()) {
      throw new Error(
        "Execution signal ID cannot be empty.",
      );
    }

    if (!trade.strategyId.trim()) {
      throw new Error(
        "Execution strategy ID cannot be empty.",
      );
    }

    if (!trade.symbol.trim()) {
      throw new Error(
        "Execution symbol cannot be empty.",
      );
    }

    if (
      trade.side !== "BUY" &&
      trade.side !== "SELL"
    ) {
      throw new Error(
        "Execution side must be BUY or SELL.",
      );
    }

    if (
      !Number.isFinite(
        trade.entryPrice,
      ) ||
      trade.entryPrice <= 0
    ) {
      throw new Error(
        "Execution entry price must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        trade.quantity,
      ) ||
      trade.quantity <= 0
    ) {
      throw new Error(
        "Execution quantity must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        trade.leverage,
      ) ||
      trade.leverage < 1
    ) {
      throw new Error(
        "Execution leverage must be at least 1.",
      );
    }

    if (
      !Number.isFinite(
        trade.stopLossPrice,
      ) ||
      trade.stopLossPrice <= 0
    ) {
      throw new Error(
        "Execution stop-loss price must be a positive finite number.",
      );
    }

    const marketPrice =
      request.marketPrice ??
      trade.entryPrice;

    if (
      !Number.isFinite(
        marketPrice,
      ) ||
      marketPrice <= 0
    ) {
      throw new Error(
        "Execution market price must be a positive finite number.",
      );
    }
  }

  private calculateFillPrice(
    marketPrice: number,
    side: "BUY" | "SELL",
  ): number {
    if (side === "BUY") {
      return (
        marketPrice *
        (1 + this.slippageRate)
      );
    }

    return (
      marketPrice *
      (1 - this.slippageRate)
    );
  }
}