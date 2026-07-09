import { Router } from "express";

import { ADMIN_ROLES } from "../constants/roles.constants";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";

import { adminController } from "./admin.controller";

const router = Router();

// ==========================
// Dashboard
// ==========================
router.get(
  "/dashboard",
  authenticate,
  authorize(...ADMIN_ROLES),
  adminController.dashboard,
);

// ==========================
// User Management
// ==========================
router.get(
  "/users",
  authenticate,
  authorize(...ADMIN_ROLES),
  adminController.users,
);

router.get(
  "/users/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  adminController.user,
);

export default router;