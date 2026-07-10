import {
  ExchangeAdapter,
  ExchangeBalance,
  ExchangeCredentials,
  ExchangeOrderRequest,
  ExchangeOrderResult,
  ExchangeTicker,
} from "./exchange.adapter";

export class BybitAdapter implements ExchangeAdapter {
  constructor(
    private readonly credentials: ExchangeCredentials,
  ) {}

  async testConnection(): Promise<boolean> {
    // Live Bybit V5 authentication
    // will be implemented next.
    return true;
  }

  async getBalances(): Promise<ExchangeBalance[]> {
    throw new Error("Not implemented.");
  }

  async getTicker(
    _symbol: string,
  ): Promise<ExchangeTicker> {
    throw new Error("Not implemented.");
  }

  async placeOrder(
    _order: ExchangeOrderRequest,
  ): Promise<ExchangeOrderResult> {
    throw new Error("Not implemented.");
  }

  async cancelOrder(
    _orderId: string,
    _symbol: string,
  ): Promise<void> {
    throw new Error("Not implemented.");
  }

  async getOpenOrders(
    _symbol?: string,
  ): Promise<ExchangeOrderResult[]> {
    throw new Error("Not implemented.");
  }

  async getOrderHistory(
    _symbol?: string,
  ): Promise<ExchangeOrderResult[]> {
    throw new Error("Not implemented.");
  }
}