import type { ApprovedTrade } from "../risk";

export type OrderSide =
  | "BUY"
  | "SELL";

export type OrderType =
  | "MARKET";

export type OrderStatus =
  | "PENDING"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export interface ExecutionEngineOptions {
  slippageRate?: number;
  tradingFeeRate?: number;
}

export interface ExecutionRequest {
  trade: ApprovedTrade;
  marketPrice?: number;
}

export interface ExecutionOrder {
  id: string;
  signalId: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  requestedPrice: number;
  requestedQuantity: number;
  leverage: number;
  stopLossPrice: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionFill {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  requestedPrice: number;
  fillPrice: number;
  grossNotional: number;
  fee: number;
  netNotional: number;
  slippageAmount: number;
  slippageRate: number;
  filledAt: number;
}

export interface ExecutionReport {
  accepted: boolean;
  reason: string;
  order: ExecutionOrder;
  fill?: ExecutionFill;
}

export interface ExecutionSummary {
  totalOrders: number;
  pendingOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
}