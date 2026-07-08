import "dotenv/config";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

const JWT_EXPIRES_IN = "1h";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined.");
  }

  return secret;
}

export interface JwtPayload {
  id: string;
  email: string;
  role: Role;
}

export function generateAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}