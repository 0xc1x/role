import type { z } from 'zod';
import type { OfferSchema } from '../schemas/offer.schema';

/** Row shape for `public.offers` — derivado del schema Zod (SSOT). */
export type Offer = z.infer<typeof OfferSchema>;
