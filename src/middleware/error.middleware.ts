import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Log only unexpected errors
  if (!(error instanceof AppError) && !(error instanceof ZodError)) {
    console.error(error);
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.flatten(),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}