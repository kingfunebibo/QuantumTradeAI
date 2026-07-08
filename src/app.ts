import express from "express";
import cors from "cors";

import authRoutes from "./auth/auth.routes";
import marketRoutes from "./routes/market.routes";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get("/", (_req, res) => {
  res.json({
    app: "QuantumTradeAI Backend",
    status: "Running",
    version: "1.0.0",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/markets", marketRoutes);

// Global Error Handler (Must be the last middleware)
app.use(errorHandler);

export default app;