import "dotenv/config";

import bcrypt from "bcrypt";
import { Role } from "@prisma/client";

import { prisma } from "../../src/config/prisma";

export async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME;
  const lastName = process.env.SUPER_ADMIN_LAST_NAME;

  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD is missing from .env",
    );
  }

  const existingAdmin = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingAdmin) {
    console.log("ℹ️ Super Admin already exists.");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log("✅ Super Admin created successfully.");
}