import { Role } from "@prisma/client";
import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import { successResponse } from "../utils/response";
import { AppError } from "../errors/AppError";

import { adminService } from "./admin.service";
import {
  updateUserRoleSchema,
  updateUserStatusSchema,
} from "./admin.validation";

export class AdminController {
  // ==========================
  // Dashboard
  // ==========================
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

  // ==========================
  // List Users
  // ==========================
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

  // ==========================
  // Get User
  // ==========================
  user = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError("User ID is required", 400);
      }

      const result =
        await adminService.getUserById(id);

      return successResponse(
        res,
        result,
        "User retrieved successfully",
      );
    },
  );

  // ==========================
  // Update User Role
  // ==========================
  updateRole = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError("User ID is required", 400);
      }

      const data =
        updateUserRoleSchema.parse(req.body);

      const actorId = req.user!.id;

      const result =
        await adminService.updateUserRole(
          actorId,
          id,
          data.role,
        );

      return successResponse(
        res,
        result,
        "User role updated successfully",
      );
    },
  );

  // ==========================
  // Update User Status
  // ==========================
  updateStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError("User ID is required", 400);
      }

      const data =
        updateUserStatusSchema.parse(req.body);

      const actorId = req.user!.id;

      const result =
        await adminService.updateUserStatus(
          actorId,
          id,
          data.isActive,
        );

      return successResponse(
        res,
        result,
        "User status updated successfully",
      );
    },
  );

  // ==========================
  // Get Audit Logs
  // ==========================
  auditLogs = asyncHandler(
    async (req: Request, res: Response) => {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);

      const action =
        typeof req.query.action === "string"
          ? req.query.action
          : undefined;

      const actorId =
        typeof req.query.actorId === "string"
          ? req.query.actorId
          : undefined;

      const resource =
        typeof req.query.resource === "string"
          ? req.query.resource
          : undefined;

      const result =
        await adminService.getAuditLogs({
          page,
          limit,
          action,
          actorId,
          resource,
        });

      return successResponse(
        res,
        result,
        "Audit logs retrieved successfully",
      );
    },
  );

  // ==========================
  // Get Audit Log By ID
  // ==========================
  auditLog = asyncHandler(
    async (req: Request, res: Response) => {
      const id =
        typeof req.params.id === "string"
          ? req.params.id
          : req.params.id?.[0];

      if (!id) {
        throw new AppError(
          "Audit log ID is required",
          400,
        );
      }

      const result =
        await adminService.getAuditLogById(id);

      return successResponse(
        res,
        result,
        "Audit log retrieved successfully",
      );
    },
  );
}

export const adminController =
  new AdminController();