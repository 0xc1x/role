import { z } from 'zod';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';
import { CONSENT_TYPES } from '../enums/consent-type';

export const ConsentTypeSchema = z.enum(CONSENT_TYPES);

export const UserConsentSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  consent_type: ConsentTypeSchema,
  granted: z.boolean(),
  granted_at: TimestamptzSchema.nullable(),
  revoked_at: TimestamptzSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateUserConsentSchema = z.object({
  user_id: UuidSchema,
  consent_type: ConsentTypeSchema,
  granted: z.boolean().optional(),
  granted_at: TimestamptzSchema.nullable().optional(),
  revoked_at: TimestamptzSchema.nullable().optional(),
});

export const UpdateUserConsentSchema = z
  .object({
    granted: z.boolean(),
    granted_at: TimestamptzSchema.nullable(),
    revoked_at: TimestamptzSchema.nullable(),
  })
  .partial();
