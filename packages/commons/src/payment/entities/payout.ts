import type { z } from 'zod';
import type { PayoutSchema } from '../schemas/payout.schema';

/** Row shape for `public.payouts` — derivado del schema Zod (SSOT). */
export type Payout = z.infer<typeof PayoutSchema>;
