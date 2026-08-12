import type { z } from 'zod';
import type {
  CreateUserConsentSchema,
  UpdateUserConsentSchema,
  UserConsentSchema,
} from '../schemas/user-consent.schema';

export type UserConsentDto = z.infer<typeof UserConsentSchema>;
export type CreateUserConsentDto = z.infer<typeof CreateUserConsentSchema>;
export type UpdateUserConsentDto = z.infer<typeof UpdateUserConsentSchema>;
