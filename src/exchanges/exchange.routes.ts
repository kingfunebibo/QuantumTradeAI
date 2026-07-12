import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";

import { exchangeController } from "./exchange.controller";

const router = Router();

// ==========================================
// Protected Routes
// ==========================================

router.use(authenticate);

// ==========================================
// Exchange Accounts
// ==========================================

// Connect Exchange
router.post("/", exchangeController.create);

// List User Exchanges
router.get("/", exchangeController.list);

// ------------------------------------------
// Live Exchange Data
// ------------------------------------------

// Test Exchange Connection
router.post(
  "/:id/test",
  exchangeController.testConnection,
);

// Get Wallet Balances
router.get(
  "/:id/balances",
  exchangeController.getBalances,
);

// Get Live Market Ticker
router.get(
  "/:id/ticker/:symbol",
  exchangeController.getTicker,
);

// Get Market Candlesticks (OHLCV)
router.get(
  "/:id/candles/:symbol",
  exchangeController.getCandles,
);

// ------------------------------------------
// Exchange Management
// ------------------------------------------

// Get Exchange By ID
router.get("/:id", exchangeController.get);

// Update Exchange
router.patch("/:id", exchangeController.update);

// Enable / Disable Exchange
router.patch(
  "/:id/status",
  exchangeController.updateStatus,
);

// Delete Exchange
router.delete("/:id", exchangeController.delete);

export default router;