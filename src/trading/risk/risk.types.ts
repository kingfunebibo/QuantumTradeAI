import type { TradeSignal } from "../signals";

export interface RiskManagerOptions {
  riskPerTrade?: number;
  maximumAccountRisk?: number;
  maximumLeverage?: number;
  maximumPositionNotional?: number;
  minimumPositionNotional?: number;
  minimumQuantity?: number;
  quantityStep?: number;
}

export interface RiskAccount {
  balance: number;
  availableEquity: number;
  openRisk: number;
}

export interface RiskRequest {
  signal: TradeSignal;
  account: RiskAccount;
  stopLossPrice: number;
  leverage?: number;
}

export interface ApprovedTrade {
  signalId: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  quantity: number;
  leverage: number;
  positionNotional: number;
  marginRequired: number;
  riskAmount: number;
  riskPerUnit: number;
  accountRiskAfterTrade: number;
  approvedAt: number;
  metadata: Record<string, unknown>;
}

export interface RiskDecision {
  approved: boolean;
  reason: string;
  trade?: ApprovedTrade;
}