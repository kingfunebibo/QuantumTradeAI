import { RestClientV5 } from "bybit-api";

import { env } from "../../config/env";
import {
  ExchangeBalance,
  ExchangeCredentials,
} from "./exchange.adapter";

export class BybitClient {
  private readonly client: RestClientV5;

  constructor(
    private readonly credentials: ExchangeCredentials,
  ) {
    this.client = new RestClientV5({
      key: credentials.apiKey,
      secret: credentials.apiSecret,
      testnet: credentials.testnet ?? false,
      recv_window: env.BYBIT_RECV_WINDOW,
    });
  }

  /**
   * Test authenticated connection.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.getWalletBalance({
        accountType: "UNIFIED",
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve and normalize wallet balances.
   */
  async getBalances(): Promise<ExchangeBalance[]> {
    const response =
      await this.client.getWalletBalance({
        accountType: "UNIFIED",
      });

    const wallet = response.result.list?.[0];

    if (!wallet?.coin) {
      return [];
    }

    return wallet.coin
      .filter(
        (coin) =>
          Number(coin.walletBalance) > 0,
      )
      .map((coin) => {
        const total = Number(
          coin.walletBalance ?? 0,
        );

        const free = Number(
          coin.availableToWithdraw ??
            coin.walletBalance ??
            0,
        );

        return {
          asset: coin.coin,
          free,
          locked: Math.max(total - free, 0),
          total,
        };
      });
  }

  /**
   * Retrieve account information.
   */
  async getAccountInfo() {
    return this.client.getAccountInfo();
  }

  /**
   * Retrieve Bybit server time.
   */
  async getServerTime() {
    return this.client.fetchServerTime();
  }

  /**
   * Expose the underlying SDK.
   * Intended for provider-level operations.
   */
  get sdk(): RestClientV5 {
    return this.client;
  }
}