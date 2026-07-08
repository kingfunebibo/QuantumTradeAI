import { Role } from "@prisma/client";
import { NextFunction, Response } from "express";

import { AuthRequest } from "./auth.middleware";

export function authorize(...allowedRoles: Role[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    next();
  };
}