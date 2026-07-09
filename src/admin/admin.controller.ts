import { Role } from "@prisma/client";
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

  users = asyncHandler(
    async (req: Request, res: Response) => {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);

      const search =
        typeof req.query.search === "string"
          ? req.query.search
          : undefined;

      const role =
        typeof req.query.role === "string"
          ? (req.query.role as Role)
          : undefined;

      const isActive =
        typeof req.query.isActive === "string"
          ? req.query.isActive === "true"
          : undefined;

      const result =
        await adminService.getUsers({
          page,
          limit,
          search,
          role,
          isActive,
        });

      return successResponse(
        res,
        result,
        "Users retrieved successfully",
      );
    },
  );

  user = asyncHandler(
    async (
      req: Request<{ id: string }>,
      res: Response,
    ) => {
      const { id } = req.params;

      const result =
        await adminService.getUserById(id);

      return successResponse(
        res,
        result,
        "User retrieved successfully",
      );
    },
  );
}

export const adminController = new AdminController();