import "dotenv/config";

import app from "./app";
import marketRoutes from "./routes/market.routes";

const PORT = Number(process.env.PORT) || 3000;

app.use("/api/markets", marketRoutes);

app.get("/", (_req, res) => {
  res.json({
    app: "QuantumTradeAI",
    version: "1.0.0",
    status: "Running",
  });
});

app.listen(PORT, () => {
  console.log(
    `🚀 QuantumTradeAI Backend running on http://localhost:${PORT}`,
  );
});