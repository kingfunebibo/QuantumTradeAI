import {
  KlineIntervalV3,
  RestClientV5,
} from "bybit-api";

import { env } from "../../config/env";
import {
  ExchangeBalance,
  ExchangeCandle,
  ExchangeCredentials,
  ExchangeInterval,
  ExchangeTicker,
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
   * Retrieve and normalize market ticker.
   */
  async getTicker(
    symbol: string,
  ): Promise<ExchangeTicker> {
    const response =
      await this.client.getTickers({
        category: "spot",
        symbol,
      });

    const ticker =
      response.result.list?.[0];

    if (!ticker) {
      throw new Error(
        `Ticker not found for ${symbol}.`,
      );
    }

    return {
      symbol: ticker.symbol,
      price: Number(ticker.lastPrice),
      bid: Number(ticker.bid1Price),
      ask: Number(ticker.ask1Price),
      timestamp: Date.now(),
    };
  }

  /**
   * Retrieve and normalize OHLCV candles.
   */
  async getCandles(
    symbol: string,
    interval: ExchangeInterval,
    limit = 200,
  ): Promise<ExchangeCandle[]> {
    const response =
      await this.client.getKline({
        category: "spot",
        symbol,
        interval:
          interval as KlineIntervalV3,
        limit,
      });

    const candles =
      response.result.list ?? [];

    return candles
      .map((candle) => ({
        timestamp: Number(candle[0]),
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
        volume: Number(candle[5]),
      }))
      .reverse();
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
   */
  get sdk(): RestClientV5 {
    return this.client;
  }
}