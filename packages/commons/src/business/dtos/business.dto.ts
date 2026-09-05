import type { z } from 'zod';
import type {
  BusinessSchema,
  CreateBusinessSchema,
  UpdateBusinessSchema,
} from '../schemas/business.schema';
import type {
  OnboardingBusinessRequestSchema,
  OnboardingBusinessResponseSchema,
} from '../schemas/onboarding.schema';

export type BusinessDto = z.infer<typeof BusinessSchema>;
export type CreateBusinessDto = z.infer<typeof CreateBusinessSchema>;
export type UpdateBusinessDto = z.infer<typeof UpdateBusinessSchema>;
export type OnboardingBusinessRequest = z.infer<
  typeof OnboardingBusinessRequestSchema
>;
export type OnboardingBusinessResponse = z.infer<
  typeof OnboardingBusinessResponseSchema
>;
