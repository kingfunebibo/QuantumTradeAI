import bcrypt from "bcrypt";
import { generateAccessToken } from "../config/jwt";
import { userService } from "../users/user.service";
import type { LoginInput, RegisterInput } from "./auth.validation";

export class AuthService {
  async register(data: RegisterInput) {
    const existingUser = await userService.findByEmail(data.email);

    if (existingUser) {
      throw new Error("Email already exists");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

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
    const user = await userService.findByEmailForLogin(data.email);

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(
      data.password,
      user.password,
    );

    if (!validPassword) {
      throw new Error("Invalid credentials");
    }

    const token = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const publicUser = await userService.findPublicById(user.id);

    return {
      user: publicUser,
      token,
    };
  }
}

export const authService = new AuthService();