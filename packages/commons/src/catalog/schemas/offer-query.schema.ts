import { z } from 'zod';
import {
  BooleanQuerySchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import { UuidSchema } from '../../_common/schemas/common';

export const ListOffersQuerySchema = PaginationQuerySchema.extend({
  category_id: UuidSchema.optional(),
  business_id: UuidSchema.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().positive().max(100).optional().default(10),
  /** Ausente → solo disponibles (comportamiento del feed). */
  available_only: BooleanQuerySchema.default(true),
});
