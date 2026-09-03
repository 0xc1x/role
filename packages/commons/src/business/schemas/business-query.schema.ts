import { z } from 'zod';
import { BooleanQuerySchema } from '../../_common/schemas/api.schema';
import { UuidSchema } from '../../_common/schemas/common';
import { BusinessVerificationStatusSchema } from './business.schema';

export const ListBusinessesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().min(1).optional(),
  is_active: BooleanQuerySchema.optional(),
  verification_status: BusinessVerificationStatusSchema.optional(),
  owner_id: UuidSchema.optional(),
  mine: BooleanQuerySchema.optional(),
});

export const ListBusinessLocationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  is_active: BooleanQuerySchema.optional(),
});
