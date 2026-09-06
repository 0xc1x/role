import { z } from 'zod';
import { BooleanQuerySchema, PaginationQuerySchema } from '../../_common/schemas/api.schema';
import { UuidSchema } from '../../_common/schemas/common';
import { BusinessVerificationStatusSchema } from './business.schema';

export const ListBusinessesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).optional(),
  is_active: BooleanQuerySchema.optional(),
  verification_status: BusinessVerificationStatusSchema.optional(),
  owner_id: UuidSchema.optional(),
  mine: BooleanQuerySchema.optional(),
});

export const ListBusinessLocationsQuerySchema = PaginationQuerySchema.extend({
  is_active: BooleanQuerySchema.optional(),
});
