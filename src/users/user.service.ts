import { Role } from "@prisma/client";

import { prisma } from "../config/prisma";
import type { RegisterInput } from "../auth/auth.validation";

export class UserService {
  // Used during registration to check if an email already exists
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  // Used during login (includes the password)
  async findByEmailForLogin(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  // Returns only public user information
  async findPublicById(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // Creates a new user and returns only public fields
  async createUser(
    data: RegisterInput & {
      password: string;
    },
  ) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: Role.USER,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

export const userService = new UserService();