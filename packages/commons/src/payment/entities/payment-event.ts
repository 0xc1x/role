import type { z } from 'zod';
import type { PaymentEventSchema } from '../schemas/payment-event.schema';

/** Row shape for `public.payment_events` — derivado del schema Zod (SSOT). */
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
