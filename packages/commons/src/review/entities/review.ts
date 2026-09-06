import type { z } from 'zod';
import type { ReviewSchema } from '../schemas/review.schema';

/** Row shape for `public.reviews` — derivado del schema Zod (SSOT). */
export type Review = z.infer<typeof ReviewSchema>;
