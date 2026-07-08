import express from "express";
import cors from "cors";

import authRoutes from "./auth/auth.routes";
import adminRoutes from "./admin/admin.routes";
import marketRoutes from "./routes/market.routes";

import { requestLogger } from "./middleware/logger.middleware";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

// ==========================
// Global Middleware
// ==========================
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ==========================
// Health Check
// ==========================
app.get("/", (_req, res) => {
  res.json({
    app: "QuantumTradeAI Backend",
    status: "Running",
    version: "1.0.0",
  });
});

// ==========================
// API Routes
// ==========================
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/markets", marketRoutes);

// ==========================
// Global Error Handler
// Must always be the last middleware
// ==========================
app.use(errorHandler);

export default app;