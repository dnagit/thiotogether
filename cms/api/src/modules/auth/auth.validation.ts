import { z } from 'zod';

// PostgreSQL compares strings case-sensitively, so emails are normalized to
// lowercase before they ever reach the case-sensitive `users.email` unique index.
const email = z.string().email().toLowerCase();

export const loginSchema = z.object({
  email,
  password: z.string().min(8).max(100),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
});
