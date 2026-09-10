import { z } from 'zod';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';
import { THEME_MODES } from '../enums/theme-mode';

export const ThemeModeSchema = z.enum(THEME_MODES);

export const UserPreferencesSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  notification_radius_km: z.number().int().nullable(),
  favorite_categories: z.array(z.string()).nullable(),
  language: z.string().nullable(),
  theme_mode: ThemeModeSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateUserPreferencesSchema = z.object({
  user_id: UuidSchema,
  notification_radius_km: z.number().int().nullable().optional(),
  favorite_categories: z.array(z.string()).nullable().optional(),
  language: z.string().nullable().optional(),
  theme_mode: ThemeModeSchema.optional(),
});

export const UpdateUserPreferencesSchema =
  CreateUserPreferencesSchema.partial().omit({ user_id: true });
