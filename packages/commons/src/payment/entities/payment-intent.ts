import type { z } from 'zod';
import type { PaymentIntentSchema } from '../schemas/payment-intent.schema';

/** Row shape for `public.payment_intents` — derivado del schema Zod (SSOT). */
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;
