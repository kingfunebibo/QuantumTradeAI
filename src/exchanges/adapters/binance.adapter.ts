import {
  Balance,
  ExchangeAdapter,
  ExchangeCredentials,
  OrderRequest,
  OrderResult,
} from "../interfaces/exchange.interface";

export class BinanceAdapter
  implements ExchangeAdapter
{
  async connect(
    _credentials: ExchangeCredentials,
  ): Promise<void> {
    throw new Error("Not implemented.");
  }

  async getBalances(): Promise<Balance[]> {
    throw new Error("Not implemented.");
  }

  async placeOrder(
    _order: OrderRequest,
  ): Promise<OrderResult> {
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
  ): Promise<OrderResult[]> {
    throw new Error("Not implemented.");
  }

  async getOrderHistory(
    _symbol?: string,
  ): Promise<OrderResult[]> {
    throw new Error("Not implemented.");
  }
}