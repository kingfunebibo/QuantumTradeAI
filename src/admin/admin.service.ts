import { Role } from "@prisma/client";

import { auditService } from "../audit/audit.service";
import { prisma } from "../config/prisma";
import { AppError } from "../errors/AppError";
import { userService } from "../users/user.service";

export class AdminService {
  // ==========================
  // Dashboard
  // ==========================
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      admins,
      superAdmins,
    ] = await Promise.all([
      prisma.user.count(),

      prisma.user.count({
        where: {
          isActive: true,
        },
      }),

      prisma.user.count({
        where: {
          isActive: false,
        },
      }),

      prisma.user.count({
        where: {
          role: Role.ADMIN,
        },
      }),

      prisma.user.count({
        where: {
          role: Role.SUPER_ADMIN,
        },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      admins,
      superAdmins,
    };
  }

  // ==========================
  // List Users
  // ==========================
  async getUsers(options: {
    page: number;
    limit: number;
    search?: string;
    role?: Role;
    isActive?: boolean;
  }) {
    return userService.listUsers(options);
  }

  // ==========================
  // Get User
  // ==========================
  async getUserById(id: string) {
    const user = await userService.getUserById(id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  // ==========================
  // Update User Role
  // ==========================
  async updateUserRole(
    actorId: string,
    targetUserId: string,
    role: Role,
  ) {
    const user =
      await userService.getUserById(targetUserId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Prevent changing the last SUPER_ADMIN
    if (
      user.role === Role.SUPER_ADMIN &&
      role !== Role.SUPER_ADMIN
    ) {
      const superAdminCount =
        await prisma.user.count({
          where: {
            role: Role.SUPER_ADMIN,
          },
        });

      if (superAdminCount <= 1) {
        throw new AppError(
          "Cannot change the role of the last SUPER_ADMIN.",
          400,
        );
      }
    }

    const updatedUser =
      await userService.updateRole(
        targetUserId,
        role,
      );

    await auditService.log({
      actorId,
      action: "USER_ROLE_UPDATED",
      resource: "USER",
      resourceId: targetUserId,
      details: {
        oldRole: user.role,
        newRole: role,
      },
    });

    return updatedUser;
  }

  // ==========================
  // Update User Status
  // ==========================
  async updateUserStatus(
    actorId: string,
    targetUserId: string,
    isActive: boolean,
  ) {
    const user =
      await userService.getUserById(targetUserId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Prevent suspending the last active SUPER_ADMIN
    if (
      user.role === Role.SUPER_ADMIN &&
      !isActive
    ) {
      const activeSuperAdmins =
        await prisma.user.count({
          where: {
            role: Role.SUPER_ADMIN,
            isActive: true,
          },
        });

      if (activeSuperAdmins <= 1) {
        throw new AppError(
          "Cannot suspend the last active SUPER_ADMIN.",
          400,
        );
      }
    }

    const updatedUser =
      await userService.updateStatus(
        targetUserId,
        isActive,
      );

    await auditService.log({
      actorId,
      action: isActive
        ? "USER_REACTIVATED"
        : "USER_SUSPENDED",
      resource: "USER",
      resourceId: targetUserId,
      details: {
        previousStatus: user.isActive,
        newStatus: isActive,
      },
    });

    return updatedUser;
  }

  // ==========================
  // Get Audit Logs
  // ==========================
  async getAuditLogs(options: {
    page: number;
    limit: number;
    action?: string;
    actorId?: string;
    resource?: string;
  }) {
    return auditService.listLogs(options);
  }

  // ==========================
  // Get Audit Log By ID
  // ==========================
  async getAuditLogById(id: string) {
    const log =
      await auditService.getLogById(id);

    if (!log) {
      throw new AppError(
        "Audit log not found",
        404,
      );
    }

    return log;
  }
}

export const adminService =
  new AdminService();