import type { z } from 'zod';
import type {
  CreateUserPreferencesSchema,
  UpdateUserPreferencesSchema,
  UserPreferencesSchema,
} from '../schemas/user-preferences.schema';

export type UserPreferencesDto = z.infer<typeof UserPreferencesSchema>;
export type CreateUserPreferencesDto = z.infer<
  typeof CreateUserPreferencesSchema
>;
export type UpdateUserPreferencesDto = z.infer<
  typeof UpdateUserPreferencesSchema
>;
