import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(100),
});

export const RefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

export const LogoutRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

/** Admin-only: invite a business operator account. */
export const InviteBusinessRequestSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  /** Optional temporary password; if omitted, Supabase invite email is used when possible. */
  password: z.string().min(8).optional(),
});
