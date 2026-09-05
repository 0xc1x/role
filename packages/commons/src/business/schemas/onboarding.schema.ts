import { z } from 'zod';

/**
 * Public business onboarding (landing). Single call that creates the auth
 * user (role=business, email confirmation pending) and the business row
 * (verification_status=pending, is_active=false). Server generates the slug.
 */
export const OnboardingBusinessRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(100),
  business_name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
});

export const OnboardingBusinessResponseSchema = z.object({
  message: z.string(),
});
