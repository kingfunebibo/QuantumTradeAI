import { Router } from "express";
import { Role } from "@prisma/client";

import { adminController } from "./admin.controller";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";

const router = Router();

// ==========================
// Dashboard
// ==========================
router.get(
  "/dashboard",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.dashboard,
);

// ==========================
// User Management
// ==========================
router.get(
  "/users",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.users,
);

router.get(
  "/users/:id",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.user,
);

router.patch(
  "/users/:id/role",
  authenticate,
  authorize(Role.SUPER_ADMIN),
  adminController.updateRole,
);

router.patch(
  "/users/:id/status",
  authenticate,
  authorize(Role.SUPER_ADMIN),
  adminController.updateStatus,
);

// ==========================
// Audit Logs
// ==========================
router.get(
  "/audit-logs",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.auditLogs,
);

router.get(
  "/audit-logs/:id",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.auditLog,
);

export default router;