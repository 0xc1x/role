import type { z } from 'zod';
import type {
  InviteBusinessRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
} from '../schemas/auth.schema';

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type InviteBusinessRequest = z.infer<typeof InviteBusinessRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'business' | 'admin';
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string | null;
  user: AuthUser;
}
