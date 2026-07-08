import { Role } from "@prisma/client";
import { Router } from "express";

import { authController } from "./auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";

const router = Router();

router.post(
  "/register",
  authController.register.bind(authController),
);

router.post(
  "/login",
  authController.login.bind(authController),
);

router.get(
  "/me",
  authenticate,
  authController.me.bind(authController),
);

// Temporary Admin Test Route
router.get(
  "/admin",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome Admin!",
    });
  },
);

export default router;