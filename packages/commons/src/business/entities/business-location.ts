import type { z } from 'zod';
import type { BusinessLocationSchema } from '../schemas/business-location.schema';

/** Row shape for `public.business_locations` — derivado del schema Zod (SSOT). */
export type BusinessLocation = z.infer<typeof BusinessLocationSchema>;
