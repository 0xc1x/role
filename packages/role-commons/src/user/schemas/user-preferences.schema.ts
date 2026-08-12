import { z } from 'zod';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const UserPreferencesSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  notification_radius_km: z.number().int().nullable(),
  favorite_categories: z.array(z.string()).nullable(),
  language: z.string().nullable(),
  theme_mode: z.string().min(1),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateUserPreferencesSchema = z.object({
  user_id: UuidSchema,
  notification_radius_km: z.number().int().nullable().optional(),
  favorite_categories: z.array(z.string()).nullable().optional(),
  language: z.string().nullable().optional(),
  theme_mode: z.string().min(1).optional(),
});

export const UpdateUserPreferencesSchema =
  CreateUserPreferencesSchema.partial().omit({ user_id: true });
