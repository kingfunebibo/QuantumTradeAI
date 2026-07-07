import "dotenv/config";
import jwt from "jsonwebtoken";

const JWT_EXPIRES_IN = "1h";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined.");
  }

  return secret;
}

export function generateAccessToken(payload: {
  id: string;
  email: string;
  role: string;
}) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getJwtSecret());
}