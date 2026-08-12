import type { z } from 'zod';
import type {
  BusinessLocationSchema,
  CreateBusinessLocationSchema,
  UpdateBusinessLocationSchema,
} from '../schemas/business-location.schema';

export type BusinessLocationDto = z.infer<typeof BusinessLocationSchema>;
export type CreateBusinessLocationDto = z.infer<
  typeof CreateBusinessLocationSchema
>;
export type UpdateBusinessLocationDto = z.infer<
  typeof UpdateBusinessLocationSchema
>;
