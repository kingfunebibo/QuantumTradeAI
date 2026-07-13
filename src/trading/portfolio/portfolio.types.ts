export type PositionSide =
  | "LONG"
  | "SHORT";

export type PositionUpdateAction =
  | "OPENED"
  | "INCREASED"
  | "REDUCED"
  | "CLOSED"
  | "REVERSED";

export interface PortfolioManagerOptions {
  initialBalance?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  averageEntryPrice: number;
  lastPrice: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  realizedPnl: number;
  entryFees: number;
  totalFees: number;
  openedAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface ClosedTrade {
  id: string;
  positionId: string;
  orderId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossRealizedPnl: number;
  entryFee: number;
  exitFee: number;
  netRealizedPnl: number;
  openedAt: number;
  closedAt: number;
  metadata: Record<string, unknown>;
}

export interface PositionUpdate {
  action: PositionUpdateAction;
  grossRealizedPnl: number;
  fee: number;
  position?: Position;
  closedTrade?: ClosedTrade;
}

export interface PortfolioSnapshot {
  initialBalance: number;
  cashBalance: number;
  equity: number;
  availableBalance: number;
  marginUsed: number;
  totalExposure: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalFees: number;
  openPositionCount: number;
  closedTradeCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  returnPercentage: number;
}