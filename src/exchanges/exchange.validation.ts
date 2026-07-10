import { z } from "zod";

export const createExchangeSchema = z.object({
  exchange: z.enum([
    "BYBIT",
    "BINANCE",
    "KUCOIN",
    "MEXC",
    "BITGET",
    "GATE",
  ]),

  accountType: z.enum([
    "SPOT",
    "FUTURES",
    "UNIFIED",
    "MARGIN",
    "OPTIONS",
  ]),

  accountName: z
    .string()
    .trim()
    .min(2, "Account name is required.")
    .max(100),

  nickname: z
    .string()
    .trim()
    .max(100)
    .optional(),

  apiKey: z
    .string()
    .trim()
    .min(10, "API Key is required."),

  apiSecret: z
    .string()
    .trim()
    .min(10, "API Secret is required."),

  passphrase: z
    .string()
    .trim()
    .optional(),

  testnet: z
    .boolean()
    .default(false),
});

export const updateExchangeSchema =
  createExchangeSchema.partial();

export const updateExchangeStatusSchema =
  z.object({
    isActive: z.boolean(),
  });

export type CreateExchangeInput =
  z.infer<typeof createExchangeSchema>;

export type UpdateExchangeInput =
  z.infer<typeof updateExchangeSchema>;

export type UpdateExchangeStatusInput =
  z.infer<
    typeof updateExchangeStatusSchema
  >;