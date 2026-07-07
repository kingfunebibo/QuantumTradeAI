import express from "express";
import cors from "cors";

import authRoutes from "./auth/auth.routes";

const app = express();

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

// Authentication Routes
app.use("/api/auth", authRoutes);

export default app;