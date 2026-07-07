import { z } from "zod";

export const registerSchema = z.object({
  email: z.email("Invalid email address"),

  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(100),

  firstName: z.string().min(2).max(50),

  lastName: z.string().min(2).max(50),
});

export const loginSchema = z.object({
  email: z.email(),

  password: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export type LoginInput = z.infer<typeof loginSchema>;