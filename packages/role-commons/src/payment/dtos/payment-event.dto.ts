import type { z } from 'zod';
import type {
  CreatePaymentEventSchema,
  PaymentEventSchema,
  UpdatePaymentEventSchema,
} from '../schemas/payment-event.schema';

export type PaymentEventDto = z.infer<typeof PaymentEventSchema>;
export type CreatePaymentEventDto = z.infer<typeof CreatePaymentEventSchema>;
export type UpdatePaymentEventDto = z.infer<typeof UpdatePaymentEventSchema>;
