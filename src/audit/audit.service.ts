import { Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";

export class AuditService {
  // ==========================
  // Create Audit Log
  // ==========================
  async log(params: {
    actorId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details,
      },
    });
  }

  // ==========================
  // List Audit Logs
  // ==========================
  async listLogs(options: {
    page: number;
    limit: number;
    action?: string;
    actorId?: string;
    resource?: string;
  }) {
    const {
      page,
      limit,
      action,
      actorId,
      resource,
    } = options;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (actorId) {
      where.actorId = actorId;
    }

    if (resource) {
      where.resource = resource;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      }),

      prisma.auditLog.count({
        where,
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================
  // Get Audit Log By ID
  // ==========================
  async getLogById(id: string) {
    return prisma.auditLog.findUnique({
      where: {
        id,
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }
}

export const auditService =
  new AuditService();