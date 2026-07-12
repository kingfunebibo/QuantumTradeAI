import { Request, Response } from "express";

import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { successResponse } from "../utils/response";

import type { ExchangeInterval } from "./adapters/exchange.adapter";
import { exchangeService } from "./exchange.service";
import {
  createExchangeSchema,
  updateExchangeSchema,
  updateExchangeStatusSchema,
} from "./exchange.validation";

export class ExchangeController {
  // ==========================
  // Connect Exchange
  // ==========================
  create = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id;

      const data =
        createExchangeSchema.parse(req.body);

      const result =
        await exchangeService.create(
          userId,
          data,
        );

      return successResponse(
        res,
        result,
        "Exchange account connected successfully.",
      );
    },
  );

  // ==========================
  // List Exchanges
  // ==========================
  list = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id;

      const result =
        await exchangeService.list(userId);

      return successResponse(
        res,
        result,
        "Exchange accounts retrieved successfully.",
      );
    },
  );

  // ==========================
  // Get Exchange
  // ==========================
  get = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const result =
        await exchangeService.getById(
          req.user!.id,
          id,
        );

      return successResponse(
        res,
        result,
        "Exchange account retrieved successfully.",
      );
    },
  );

  // ==========================
  // Update Exchange
  // ==========================
  update = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const data =
        updateExchangeSchema.parse(req.body);

      const result =
        await exchangeService.update(
          req.user!.id,
          id,
          data,
        );

      return successResponse(
        res,
        result,
        "Exchange account updated successfully.",
      );
    },
  );

  // ==========================
  // Update Status
  // ==========================
  updateStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const data =
        updateExchangeStatusSchema.parse(
          req.body,
        );

      const result =
        await exchangeService.updateStatus(
          req.user!.id,
          id,
          data.isActive,
        );

      return successResponse(
        res,
        result,
        "Exchange account status updated successfully.",
      );
    },
  );

  // ==========================
  // Delete Exchange
  // ==========================
  delete = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const result =
        await exchangeService.delete(
          req.user!.id,
          id,
        );

      return successResponse(
        res,
        result,
        "Exchange account deleted successfully.",
      );
    },
  );

  // ==========================
  // Test Connection
  // ==========================
  testConnection = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const result =
        await exchangeService.testConnection(
          req.user!.id,
          id,
        );

      return successResponse(
        res,
        result,
        "Exchange connection test completed successfully.",
      );
    },
  );

  // ==========================
  // Get Wallet Balances
  // ==========================
  getBalances = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      const result =
        await exchangeService.getBalances(
          req.user!.id,
          id,
        );

      return successResponse(
        res,
        result,
        "Wallet balances retrieved successfully.",
      );
    },
  );

  // ==========================
  // Get Market Ticker
  // ==========================
  getTicker = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      const symbol =
        typeof req.params.symbol === "string"
          ? req.params.symbol
          : req.params.symbol?.[0];

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      if (!symbol) {
        throw new AppError(
          "Trading symbol is required.",
          400,
        );
      }

      const result =
        await exchangeService.getTicker(
          req.user!.id,
          id,
          symbol.toUpperCase(),
        );

      return successResponse(
        res,
        result,
        "Market ticker retrieved successfully.",
      );
    },
  );

  // ==========================
  // Get Market Candles
  // ==========================
  getCandles = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      const symbol =
        typeof req.params.symbol === "string"
          ? req.params.symbol
          : req.params.symbol?.[0];

      const interval: ExchangeInterval =
        typeof req.query.interval === "string"
          ? (req.query.interval as ExchangeInterval)
          : "60";

      const limit =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : 200;

      if (!id) {
        throw new AppError(
          "Exchange account ID is required.",
          400,
        );
      }

      if (!symbol) {
        throw new AppError(
          "Trading symbol is required.",
          400,
        );
      }

      const result =
        await exchangeService.getCandles(
          req.user!.id,
          id,
          symbol.toUpperCase(),
          interval,
          limit,
        );

      return successResponse(
        res,
        result,
        "Market candles retrieved successfully.",
      );
    },
  );
}

export const exchangeController =
  new ExchangeController();