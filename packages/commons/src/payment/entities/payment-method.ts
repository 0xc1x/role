import type { z } from 'zod';
import type { PaymentMethodSchema } from '../schemas/payment-method.schema';

/**
 * Row shape for a tokenized payment method — derivado del schema Zod (SSOT).
 * PCI DSS: PAN/CVV nunca se almacenan — solo token + metadatos de visualización.
 */
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
