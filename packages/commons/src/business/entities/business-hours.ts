import type { z } from 'zod';
import type { BusinessHoursSchema } from '../schemas/business-hours.schema';

/** Row shape for `public.business_hours` — derivado del schema Zod (SSOT). */
export type BusinessHours = z.infer<typeof BusinessHoursSchema>;
