import { Role } from "@prisma/client";

import { prisma } from "../config/prisma";

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
}

export const adminService = new AdminService();