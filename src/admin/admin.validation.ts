import { Role } from "@prisma/client";
import { z } from "zod";

// ==========================
// Update User Role
// ==========================
export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export type UpdateUserRoleInput = z.infer<
  typeof updateUserRoleSchema
>;

// ==========================
// Update User Status
// ==========================
export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>;