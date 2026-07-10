import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  // ==========================
  // Application
  // ==========================
  NODE_ENV: getEnv("NODE_ENV", "development"),
  PORT: Number(getEnv("PORT", "3000")),

  // ==========================
  // JWT
  // ==========================
  JWT_SECRET: getEnv("JWT_SECRET"),

  // ==========================
  // Database
  // ==========================
  DATABASE_URL: getEnv("DATABASE_URL"),

  // ==========================
  // Frontend
  // ==========================
  FRONTEND_URL: getEnv(
    "FRONTEND_URL",
    "http://localhost:5173",
  ),

  // ==========================
  // Bybit
  // ==========================
  BYBIT_TESTNET:
    getEnv("BYBIT_TESTNET", "true") === "true",

  BYBIT_BASE_URL: getEnv(
    "BYBIT_BASE_URL",
    "https://api-testnet.bybit.com",
  ),

  BYBIT_RECV_WINDOW: Number(
    getEnv("BYBIT_RECV_WINDOW", "5000"),
  ),

// ==========================
// Encryption
// ==========================
ENCRYPTION_SECRET: getEnv("ENCRYPTION_SECRET"),
};