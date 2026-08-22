import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CreateProfileSchema,
  ListProfilesQuerySchema,
  ProfileSchema,
  UpdateProfileSchema,
} from '../schemas/profile.schema';

export type ProfileDto = z.infer<typeof ProfileSchema>;
export type CreateProfileDto = z.infer<typeof CreateProfileSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type ProfilePaginatedData = PaginatedData<ProfileDto>;
export type ListProfilesQuery = z.infer<typeof ListProfilesQuerySchema>;