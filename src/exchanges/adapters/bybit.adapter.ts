import {
  ExchangeAdapter,
  ExchangeBalance,
  ExchangeCredentials,
  ExchangeOrderRequest,
  ExchangeOrderResult,
  ExchangeTicker,
} from "./exchange.adapter";

import { BybitClient } from "./bybit.client";

export class BybitAdapter implements ExchangeAdapter {
  private readonly client: BybitClient;

  constructor(
    private readonly credentials: ExchangeCredentials,
  ) {
    this.client = new BybitClient(credentials);
  }

  /**
   * Test exchange connectivity
   */
  async testConnection(): Promise<boolean> {
    return this.client.testConnection();
  }

  /**
   * Retrieve wallet balances
   */
  async getBalances(): Promise<ExchangeBalance[]> {
    return this.client.getBalances();
  }

  /**
   * Retrieve market ticker
   * (Implemented in the next milestone)
   */
  async getTicker(
    _symbol: string,
  ): Promise<ExchangeTicker> {
    throw new Error(
      "getTicker() has not been implemented yet.",
    );
  }

  /**
   * Place an order
   * (Implemented later)
   */
  async placeOrder(
    _order: ExchangeOrderRequest,
  ): Promise<ExchangeOrderResult> {
    throw new Error(
      "placeOrder() has not been implemented yet.",
    );
  }

  /**
   * Cancel an existing order
   * (Implemented later)
   */
  async cancelOrder(
    _orderId: string,
    _symbol: string,
  ): Promise<void> {
    throw new Error(
      "cancelOrder() has not been implemented yet.",
    );
  }

  /**
   * Retrieve all open orders
   * (Implemented later)
   */
  async getOpenOrders(
    _symbol?: string,
  ): Promise<ExchangeOrderResult[]> {
    throw new Error(
      "getOpenOrders() has not been implemented yet.",
    );
  }

  /**
   * Retrieve historical orders
   * (Implemented later)
   */
  async getOrderHistory(
    _symbol?: string,
  ): Promise<ExchangeOrderResult[]> {
    throw new Error(
      "getOrderHistory() has not been implemented yet.",
    );
  }
}