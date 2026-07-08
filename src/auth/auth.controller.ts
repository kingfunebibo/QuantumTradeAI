import { Request, Response } from "express";
import { authService } from "./auth.service";
import { loginSchema, registerSchema } from "./auth.validation";
import { AuthRequest } from "../middleware/auth.middleware";
import { userService } from "../users/user.service";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createdResponse,
  successResponse,
} from "../utils/response";

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);

    const result = await authService.register(data);

    return createdResponse(
      res,
      result,
      "User registered successfully",
    );
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body);

    const result = await authService.login(data);

    return successResponse(
      res,
      result,
      "Login successful",
    );
  });

  me = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const user = await userService.findPublicById(req.user.id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return successResponse(
      res,
      user,
      "User profile retrieved successfully",
    );
  });
}

export const authController = new AuthController();