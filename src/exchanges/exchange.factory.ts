import { BybitAdapter } from "./adapters/bybit.adapter";
import { BinanceAdapter } from "./adapters/binance.adapter";
import { BitgetAdapter } from "./adapters/bitget.adapter";
import { GateAdapter } from "./adapters/gate.adapter";
import { KucoinAdapter } from "./adapters/kucoin.adapter";
import { MexcAdapter } from "./adapters/mexc.adapter";
import { ExchangeAdapter } from "./interfaces/exchange.interface";

export enum ExchangeType {
  BYBIT = "BYBIT",
  BINANCE = "BINANCE",
  KUCOIN = "KUCOIN",
  MEXC = "MEXC",
  BITGET = "BITGET",
  GATE = "GATE",
}

export class ExchangeFactory {
  create(
    exchange: ExchangeType,
  ): ExchangeAdapter {
    switch (exchange) {
      case ExchangeType.BYBIT:
        return new BybitAdapter();

      case ExchangeType.BINANCE:
        return new BinanceAdapter();

      case ExchangeType.KUCOIN:
        return new KucoinAdapter();

      case ExchangeType.MEXC:
        return new MexcAdapter();

      case ExchangeType.BITGET:
        return new BitgetAdapter();

      case ExchangeType.GATE:
        return new GateAdapter();

      default:
        throw new Error(
          `Unsupported exchange: ${exchange}`,
        );
    }
  }
}

export const exchangeFactory =
  new ExchangeFactory();