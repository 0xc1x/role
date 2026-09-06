import type { z } from 'zod';
import type { OrderEventSchema } from '../schemas/order-event.schema';

/** Row shape for `public.order_events` — derivado del schema Zod (SSOT). */
export type OrderEvent = z.infer<typeof OrderEventSchema>;
