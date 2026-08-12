import type { z } from 'zod';
import type {
  CreateProfileSchema,
  ProfileSchema,
  UpdateProfileSchema,
} from '../schemas/profile.schema';

export type ProfileDto = z.infer<typeof ProfileSchema>;
export type CreateProfileDto = z.infer<typeof CreateProfileSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
