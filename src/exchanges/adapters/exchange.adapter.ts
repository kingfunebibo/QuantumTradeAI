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
  bid: number;
  ask: number;
  last: number;
}

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