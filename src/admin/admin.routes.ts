import { Router } from "express";
import { Role } from "@prisma/client";

import { adminController } from "./admin.controller";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";

const router = Router();

router.get(
  "/dashboard",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  adminController.dashboard,
);

export default router;