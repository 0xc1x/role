import { z } from 'zod';
import {
  BusinessTypeSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';
import { BUSINESS_VERIFICATION_STATUSES } from '../enums/business-verification-status';

export const BusinessVerificationStatusSchema = z.enum(BUSINESS_VERIFICATION_STATUSES);

export const BusinessSchema = z.object({
  id: UuidSchema,
  owner_id: UuidSchema,
  name: z.string().min(1),
  type: BusinessTypeSchema,
  slug: z.string().min(1),
  image: z.string().nullable(),
  cover_image: z.string().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().int().nullable(),
  description: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  website: z.string().nullable(),
  commission_rate: z.number().nullable(),
  balance: z.number().nullable(),
  is_active: z.boolean(),
  verification_status: BusinessVerificationStatusSchema,
  verified_at: TimestamptzSchema.nullable(),
  verified_by: UuidSchema.nullable(),
  rejection_reason: z.string().nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateBusinessSchema = z.object({
  /** Admin may set owner; business role always uses the authenticated user. */
  owner_id: UuidSchema.optional(),
  name: z.string().min(1),
  type: BusinessTypeSchema.optional(),
  slug: z.string().min(1),
  image: z.string().nullable().optional(),
  cover_image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().nullable().optional(),
  commission_rate: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
  verification_status: BusinessVerificationStatusSchema.optional(),
  rejection_reason: z.string().nullable().optional(),
});

export const UpdateBusinessSchema = CreateBusinessSchema.partial().omit({
  owner_id: true,
});
