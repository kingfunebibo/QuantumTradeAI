import {
  SystemExecutionRuntime,
} from "./execution-runtime";

import type {
  ExecutionRuntime,
} from "./execution-runtime";

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

  public constructor(
    options: ExecutionEngineOptions = {},
    private readonly runtime:
      ExecutionRuntime =
        new SystemExecutionRuntime(),
  ) {
    this.slippageRate =
      options.slippageRate ?? 0.0005;

    this.tradingFeeRate =
      options.tradingFeeRate ?? 0.001;

    this.validateOptions();
    this.validateRuntime(runtime);
  }

  public executeMarketOrder(
    request: ExecutionRequest,
  ): ExecutionReport {
    this.validateRequest(request);

    const {
      trade,
    } = request;

    const marketPrice =
      request.marketPrice ??
      trade.entryPrice;

    const now =
      this.runtime.now();

    const order: ExecutionOrder = {
      id:
        this.runtime.nextOrderId(),
      signalId:
        trade.signalId,
      strategyId:
        trade.strategyId,
      symbol:
        trade.symbol,
      timeframe:
        trade.timeframe,
      side:
        trade.side,
      type:
        "MARKET",
      status:
        "PENDING",
      requestedPrice:
        marketPrice,
      requestedQuantity:
        trade.quantity,
      leverage:
        trade.leverage,
      stopLossPrice:
        trade.stopLossPrice,
      createdAt:
        now,
      updatedAt:
        now,
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
      const rejectedOrder:
        ExecutionOrder = {
          ...order,
          status:
            "REJECTED",
          updatedAt:
            this.runtime.now(),
        };

      this.orders.set(
        rejectedOrder.id,
        rejectedOrder,
      );

      return {
        accepted: false,
        reason:
          `Signal "${trade.signalId}" has already been executed.`,
        order:
          this.cloneOrder(
            rejectedOrder,
          ),
      };
    }

    const fillPrice =
      this.calculateFillPrice(
        marketPrice,
        trade.side,
      );

    const grossNotional =
      fillPrice *
      trade.quantity;

    const fee =
      grossNotional *
      this.tradingFeeRate;

    const netNotional =
      trade.side === "BUY"
        ? grossNotional + fee
        : grossNotional - fee;

    const slippageAmount =
      Math.abs(
        fillPrice -
          marketPrice,
      ) *
      trade.quantity;

    const fill: ExecutionFill = {
      id:
        this.runtime.nextFillId(),
      orderId:
        order.id,
      symbol:
        trade.symbol,
      side:
        trade.side,
      quantity:
        trade.quantity,
      requestedPrice:
        marketPrice,
      fillPrice,
      grossNotional,
      fee,
      netNotional,
      slippageAmount,
      slippageRate:
        this.slippageRate,
      filledAt:
        this.runtime.now(),
    };

    const filledOrder:
      ExecutionOrder = {
        ...order,
        status:
          "FILLED",
        updatedAt:
          fill.filledAt,
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
      order:
        this.cloneOrder(
          filledOrder,
        ),
      fill:
        this.cloneFill(
          fill,
        ),
    };
  }

  public getOrder(
    orderId: string,
  ): ExecutionOrder {
    const normalizedOrderId =
      this.normalizeId(
        orderId,
        "Order ID",
      );

    const order =
      this.orders.get(
        normalizedOrderId,
      );

    if (order === undefined) {
      throw new Error(
        `Order "${normalizedOrderId}" was not found.`,
      );
    }

    return this.cloneOrder(
      order,
    );
  }

  public getFill(
    orderId: string,
  ): ExecutionFill | undefined {
    const normalizedOrderId =
      this.normalizeId(
        orderId,
        "Order ID",
      );

    const fill =
      this.fills.get(
        normalizedOrderId,
      );

    return fill === undefined
      ? undefined
      : this.cloneFill(fill);
  }

  public listOrders():
    ExecutionOrder[] {
    return Array.from(
      this.orders.values(),
    ).map(
      (order) =>
        this.cloneOrder(order),
    );
  }

  public listFills():
    ExecutionFill[] {
    return Array.from(
      this.fills.values(),
    ).map(
      (fill) =>
        this.cloneFill(fill),
    );
  }

  public cancelOrder(
    orderId: string,
  ): ExecutionReport {
    const order =
      this.getOrder(orderId);

    if (
      order.status !==
      "PENDING"
    ) {
      const fill =
        this.getFill(
          order.id,
        );

      return {
        accepted: false,
        reason:
          "Only pending orders can be cancelled. " +
          `Current status: ${order.status}.`,
        order,
        fill,
      };
    }

    const cancelledOrder:
      ExecutionOrder = {
        ...order,
        status:
          "CANCELLED",
        updatedAt:
          this.runtime.now(),
      };

    this.orders.set(
      cancelledOrder.id,
      cancelledOrder,
    );

    return {
      accepted: true,
      reason:
        "Order cancelled successfully.",
      order:
        this.cloneOrder(
          cancelledOrder,
        ),
    };
  }

  public hasExecutedSignal(
    signalId: string,
  ): boolean {
    const normalizedSignalId =
      this.normalizeId(
        signalId,
        "Signal ID",
      );

    return this.executedSignalIds.has(
      normalizedSignalId,
    );
  }

  public getSummary():
    ExecutionSummary {
    const orders =
      Array.from(
        this.orders.values(),
      );

    return {
      totalOrders:
        orders.length,
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

  public clear(): void {
    this.orders.clear();
    this.fills.clear();
    this.executedSignalIds.clear();
    this.runtime.reset();
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
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new Error(
        "Execution request must be an object.",
      );
    }

    const {
      trade,
    } = request;

    if (
      trade === null ||
      typeof trade !== "object"
    ) {
      throw new Error(
        "Execution trade must be an object.",
      );
    }

    this.normalizeId(
      trade.signalId,
      "Execution signal ID",
    );

    this.normalizeId(
      trade.strategyId,
      "Execution strategy ID",
    );

    this.normalizeId(
      trade.symbol,
      "Execution symbol",
    );

    if (
      typeof trade.timeframe !==
        "string" ||
      trade.timeframe.trim()
        .length === 0
    ) {
      throw new Error(
        "Execution timeframe cannot be empty.",
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

    if (
      !Number.isSafeInteger(
        trade.approvedAt,
      ) ||
      trade.approvedAt < 0
    ) {
      throw new Error(
        "Execution approvedAt must be a non-negative safe integer.",
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
        (
          1 +
          this.slippageRate
        )
      );
    }

    return (
      marketPrice *
      (
        1 -
        this.slippageRate
      )
    );
  }

  private validateRuntime(
    runtime: ExecutionRuntime,
  ): void {
    if (
      runtime === null ||
      typeof runtime !== "object" ||
      typeof runtime.now !==
        "function" ||
      typeof runtime.nextOrderId !==
        "function" ||
      typeof runtime.nextFillId !==
        "function" ||
      typeof runtime.reset !==
        "function"
    ) {
      throw new Error(
        "Execution engine requires a valid execution runtime.",
      );
    }
  }

  private normalizeId(
    value: string,
    label: string,
  ): string {
    if (
      typeof value !== "string"
    ) {
      throw new Error(
        `${label} must be a string.`,
      );
    }

    const normalizedValue =
      value.trim();

    if (
      normalizedValue.length === 0
    ) {
      throw new Error(
        `${label} cannot be empty.`,
      );
    }

    return normalizedValue;
  }

  private cloneOrder(
    order: ExecutionOrder,
  ): ExecutionOrder {
    return {
      ...order,
      metadata: {
        ...order.metadata,
      },
    };
  }

  private cloneFill(
    fill: ExecutionFill,
  ): ExecutionFill {
    return {
      ...fill,
    };
  }
}