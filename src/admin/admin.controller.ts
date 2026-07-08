import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import { successResponse } from "../utils/response";

import { adminService } from "./admin.service";

export class AdminController {
  dashboard = asyncHandler(
    async (_req: Request, res: Response) => {
      const stats =
        await adminService.getDashboardStats();

      return successResponse(
        res,
        stats,
        "Dashboard statistics retrieved successfully",
      );
    },
  );
}

export const adminController = new AdminController();