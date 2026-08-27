import type { z } from 'zod';
import type {
  ListBusinessesQuerySchema,
  ListBusinessLocationsQuerySchema,
} from '../schemas/business-query.schema';

export type ListBusinessesQuery = z.infer<typeof ListBusinessesQuerySchema>;
export type ListBusinessLocationsQuery = z.infer<
  typeof ListBusinessLocationsQuerySchema
>;
