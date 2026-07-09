import { Role } from "@prisma/client";

import { AppError } from "../errors/AppError";
import { prisma } from "../config/prisma";
import { userService } from "../users/user.service";

export class AdminService {
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

  async getUsers(options: {
    page: number;
    limit: number;
    search?: string;
    role?: Role;
    isActive?: boolean;
  }) {
    return userService.listUsers(options);
  }

  async getUserById(id: string) {
    const user = await userService.getUserById(id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }
}

export const adminService = new AdminService();