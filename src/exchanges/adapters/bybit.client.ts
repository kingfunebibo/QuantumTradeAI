import { RestClientV5 } from "bybit-api";

import { env } from "../../config/env";
import { ExchangeCredentials } from "./exchange.adapter";

export class BybitClient {
  private readonly client: RestClientV5;

  constructor(
    private readonly credentials: ExchangeCredentials,
  ) {
    this.client = new RestClientV5({
      key: credentials.apiKey,
      secret: credentials.apiSecret,
      testnet: credentials.testnet,
      recv_window: env.BYBIT_RECV_WINDOW,
    });
  }

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

  get sdk(): RestClientV5 {
    return this.client;
  }
}