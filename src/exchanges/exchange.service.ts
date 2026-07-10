import {
  ExchangeAccountType,
  ExchangeType,
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { AppError } from "../errors/AppError";
import { encryptionService } from "../security/encryption.service";

import type {
  CreateExchangeInput,
  UpdateExchangeInput,
} from "./exchange.validation";

export class ExchangeService {
  // ==========================
  // Connect Exchange
  // ==========================
  async create(
    userId: string,
    data: CreateExchangeInput,
  ) {
    const existing =
      await prisma.exchangeAccount.findFirst({
        where: {
          userId,
          exchange: data.exchange as ExchangeType,
          accountName: data.accountName,
        },
      });

    if (existing) {
      throw new AppError(
        "An exchange account with this name already exists.",
        409,
      );
    }

    return prisma.exchangeAccount.create({
      data: {
        userId,

        exchange:
          data.exchange as ExchangeType,

        accountType:
          data.accountType as ExchangeAccountType,

        accountName: data.accountName,

        nickname: data.nickname,

        testnet: data.testnet,

        credential: {
          create: {
            encryptedApiKey:
              encryptionService.encrypt(
                data.apiKey,
              ),

            encryptedSecret:
              encryptionService.encrypt(
                data.apiSecret,
              ),

            encryptedPassphrase:
              data.passphrase
                ? encryptionService.encrypt(
                    data.passphrase,
                  )
                : null,
          },
        },
      },

      include: {
        credential: false,
      },
    });
  }

  // ==========================
  // List User Exchanges
  // ==========================
  async list(userId: string) {
    return prisma.exchangeAccount.findMany({
      where: {
        userId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // ==========================
  // Get Exchange
  // ==========================
  async getById(
    userId: string,
    id: string,
  ) {
    const account =
      await prisma.exchangeAccount.findFirst({
        where: {
          id,
          userId,
        },
      });

    if (!account) {
      throw new AppError(
        "Exchange account not found.",
        404,
      );
    }

    return account;
  }

  // ==========================
  // Update Exchange
  // ==========================
  async update(
    userId: string,
    id: string,
    data: UpdateExchangeInput,
  ) {
    await this.getById(userId, id);

    return prisma.exchangeAccount.update({
      where: {
        id,
      },

      data: {
        accountName: data.accountName,

        nickname: data.nickname,

        testnet: data.testnet,

        accountType: data.accountType
          ? (data.accountType as ExchangeAccountType)
          : undefined,

        isActive: undefined,
      },
    });
  }

  // ==========================
  // Update Status
  // ==========================
  async updateStatus(
    userId: string,
    id: string,
    isActive: boolean,
  ) {
    await this.getById(userId, id);

    return prisma.exchangeAccount.update({
      where: {
        id,
      },

      data: {
        isActive,
      },
    });
  }

  // ==========================
  // Delete Exchange
  // ==========================
  async delete(
    userId: string,
    id: string,
  ) {
    await this.getById(userId, id);

    await prisma.exchangeAccount.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
    };
  }

  // ==========================
  // Test Connection
  // ==========================
  async testConnection(
    userId: string,
    id: string,
  ) {
    const account =
      await prisma.exchangeAccount.findFirst({
        where: {
          id,
          userId,
        },

        include: {
          credential: true,
        },
      });

    if (!account) {
      throw new AppError(
        "Exchange account not found.",
        404,
      );
    }

    if (!account.credential) {
      throw new AppError(
        "Exchange credentials not found.",
        404,
      );
    }

    const apiKey =
      encryptionService.decrypt(
        account.credential.encryptedApiKey,
      );

    const apiSecret =
      encryptionService.decrypt(
        account.credential.encryptedSecret,
      );

    const passphrase =
      account.credential.encryptedPassphrase
        ? encryptionService.decrypt(
            account.credential
              .encryptedPassphrase,
          )
        : undefined;

    return {
      success: true,
      exchange: account.exchange,
      accountType:
        account.accountType,
      accountName:
        account.accountName,
      apiKeyLength: apiKey.length,
      apiSecretLength:
        apiSecret.length,
      hasPassphrase:
        !!passphrase,
      message:
        "Credentials decrypted successfully. Exchange connectivity will be implemented next.",
    };
  }
}

export const exchangeService =
  new ExchangeService();