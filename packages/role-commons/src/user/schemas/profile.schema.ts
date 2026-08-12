import { z } from 'zod';
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
