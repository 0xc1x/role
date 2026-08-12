import type { z } from 'zod';
import type {
  BusinessHoursSchema,
  CreateBusinessHoursSchema,
  UpdateBusinessHoursSchema,
} from '../schemas/business-hours.schema';

export type BusinessHoursDto = z.infer<typeof BusinessHoursSchema>;
export type CreateBusinessHoursDto = z.infer<typeof CreateBusinessHoursSchema>;
export type UpdateBusinessHoursDto = z.infer<typeof UpdateBusinessHoursSchema>;
