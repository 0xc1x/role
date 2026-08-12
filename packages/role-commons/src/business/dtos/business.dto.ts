import type { z } from 'zod';
import type {
  BusinessSchema,
  CreateBusinessSchema,
  UpdateBusinessSchema,
} from '../schemas/business.schema';

export type BusinessDto = z.infer<typeof BusinessSchema>;
export type CreateBusinessDto = z.infer<typeof CreateBusinessSchema>;
export type UpdateBusinessDto = z.infer<typeof UpdateBusinessSchema>;
