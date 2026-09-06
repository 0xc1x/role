import type { z } from 'zod';
import type { BusinessSchema } from '../schemas/business.schema';

/** Row shape for `public.businesses` — derivado del schema Zod (SSOT). */
export type Business = z.infer<typeof BusinessSchema>;
