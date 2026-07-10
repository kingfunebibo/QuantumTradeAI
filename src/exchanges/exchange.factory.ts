import { ExchangeType } from "@prisma/client";

import { AppError } from "../errors/AppError";
import { encryptionService } from "../security/encryption.service";

import { BybitAdapter } from "./adapters/bybit.adapter";

export class ExchangeFactory {
  static create(params: {
    exchange: ExchangeType;
    encryptedApiKey: string;
    encryptedSecret: string;
    encryptedPassphrase?: string | null;
    testnet: boolean;
  }) {
    const apiKey = encryptionService.decrypt(
      params.encryptedApiKey,
    );

    const apiSecret = encryptionService.decrypt(
      params.encryptedSecret,
    );

    const passphrase =
      params.encryptedPassphrase
        ? encryptionService.decrypt(
            params.encryptedPassphrase,
          )
        : undefined;

    switch (params.exchange) {
      case ExchangeType.BYBIT:
        return new BybitAdapter({
          apiKey,
          apiSecret,
          passphrase,
          testnet: params.testnet,
        });

      default:
        throw new AppError(
          `Exchange ${params.exchange} is not supported yet.`,
          400,
        );
    }
  }
}