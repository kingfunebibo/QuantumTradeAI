export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet?: boolean;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface OrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  status: string;
}

export interface ExchangeAdapter {
  connect(
    credentials: ExchangeCredentials,
  ): Promise<void>;

  getBalances(): Promise<Balance[]>;

  placeOrder(
    order: OrderRequest,
  ): Promise<OrderResult>;

  cancelOrder(
    orderId: string,
    symbol: string,
  ): Promise<void>;

  getOpenOrders(
    symbol?: string,
  ): Promise<OrderResult[]>;

  getOrderHistory(
    symbol?: string,
  ): Promise<OrderResult[]>;
}