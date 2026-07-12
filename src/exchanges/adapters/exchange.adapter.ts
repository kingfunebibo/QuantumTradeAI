export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
}

export interface ExchangeBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface ExchangeTicker {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface ExchangeCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Supported exchange candle intervals.
 * These match Bybit's V5 Kline intervals and will
 * also serve as the common interval type for
 * other exchanges.
 */
export type ExchangeInterval =
  | "1"
  | "3"
  | "5"
  | "15"
  | "30"
  | "60"
  | "120"
  | "240"
  | "360"
  | "720"
  | "D"
  | "W"
  | "M";

export interface ExchangeOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
}

export interface ExchangeOrderResult {
  orderId: string;
  symbol: string;
  status: string;
}

export interface ExchangeAdapter {
  testConnection(): Promise<boolean>;

  getBalances(): Promise<ExchangeBalance[]>;

  getTicker(
    symbol: string,
  ): Promise<ExchangeTicker>;

  getCandles(
    symbol: string,
    interval: ExchangeInterval,
    limit?: number,
  ): Promise<ExchangeCandle[]>;

  placeOrder(
    order: ExchangeOrderRequest,
  ): Promise<ExchangeOrderResult>;

  cancelOrder(
    orderId: string,
    symbol: string,
  ): Promise<void>;

  getOpenOrders(
    symbol?: string,
  ): Promise<ExchangeOrderResult[]>;

  getOrderHistory(
    symbol?: string,
  ): Promise<ExchangeOrderResult[]>;
}