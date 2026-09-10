import { z } from 'zod';
import { AppRoleSchema, TimestamptzSchema } from '../../_common/schemas/common';

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const RegisterRequestSchema = z.object({
  email: z.email(),
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
  email: z.email(),
  full_name: z.string().min(2).max(100),
  /** Optional temporary password; if omitted, Supabase invite email is used when possible. */
  password: z.string().min(8).optional(),
});

/**
 * Usuario autenticado expuesto por la API (`/auth/me`, sesión de admin).
 * Espejo del perfil sin `city` ni timestamps de auditoría.
 */
export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: AppRoleSchema,
});

/** Respuesta de login/refresh de la API: tokens de sesión + usuario autenticado. */
export const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  expires_at: TimestamptzSchema.nullable(),
  user: AuthUserSchema,
});
