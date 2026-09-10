import type { z } from 'zod';
import type { OrderSchema } from '../schemas/order.schema';

/** Row shape for `public.orders` — derivado del schema Zod (SSOT). */
export type Order = z.infer<typeof OrderSchema>;
