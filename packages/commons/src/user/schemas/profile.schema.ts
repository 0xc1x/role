import { z } from 'zod';
import {
  BooleanQuerySchema,
  PaginatedDataSchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import { AppRoleSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const ProfileSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  phone: z.string().nullable(),
  role: AppRoleSchema,
  city: z.string().nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateProfileSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: AppRoleSchema.optional(),
  city: z.string().nullable().optional(),
});

export const UpdateProfileSchema = z
  .object({
    email: z.string().email(),
    full_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    phone: z.string().nullable(),
    role: AppRoleSchema,
    city: z.string().nullable(),
  })
  .partial();

// ─── Admin: listado de perfiles ────────────────────────────────────────
export const ListProfilesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  role: AppRoleSchema.optional(),
  /** Solo perfiles suscritos a esta categoría de marketing. */
  subscribed_to: z
    .enum(['announcements', 'promotions', 'news'])
    .optional(),
  /** Solo perfiles con al menos un device token de push activo. */
  has_active_push_token: BooleanQuerySchema.optional(),
});

export const ProfileListResponseSchema = PaginatedDataSchema(ProfileSchema);
