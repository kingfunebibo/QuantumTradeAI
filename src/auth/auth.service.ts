import bcrypt from "bcrypt";

import { BCRYPT_SALT_ROUNDS } from "../constants/auth.constants";
import { generateAccessToken } from "../config/jwt";
import { AppError } from "../errors/AppError";
import { userService } from "../users/user.service";

import type {
  LoginInput,
  RegisterInput,
} from "./auth.validation";

export class AuthService {
  async register(data: RegisterInput) {
    const existingUser = await userService.findByEmail(
      data.email,
    );

    if (existingUser) {
      throw new AppError("Email already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(
      data.password,
      BCRYPT_SALT_ROUNDS,
    );

    const user = await userService.createUser({
      ...data,
      password: hashedPassword,
    });

    const token = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user,
      token,
    };
  }

  async login(data: LoginInput) {
    const user = await userService.findByEmailForLogin(
      data.email,
    );

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const validPassword = await bcrypt.compare(
      data.password,
      user.password,
    );

    if (!validPassword) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const publicUser =
      await userService.findPublicById(user.id);

    if (!publicUser) {
      throw new AppError("User not found", 404);
    }

    return {
      user: publicUser,
      token,
    };
  }
}

export const authService = new AuthService();