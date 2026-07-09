import { Role } from "@prisma/client";

/**
 * Default roles.
 */

export const DEFAULT_USER_ROLE = Role.USER;

export const ADMIN_ROLES = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
] as const;