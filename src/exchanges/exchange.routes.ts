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

// Get Exchange By ID
router.get("/:id", exchangeController.get);

// Update Exchange
router.patch("/:id", exchangeController.update);

// Enable / Disable Exchange
router.patch(
  "/:id/status",
  exchangeController.updateStatus,
);

// Test Exchange Connection
router.post(
  "/:id/test",
  exchangeController.testConnection,
);

// Delete Exchange
router.delete("/:id", exchangeController.delete);

export default router;