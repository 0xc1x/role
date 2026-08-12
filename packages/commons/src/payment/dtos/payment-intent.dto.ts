import type { z } from 'zod';
import type {
  CreatePaymentIntentSchema,
  PaymentIntentSchema,
  UpdatePaymentIntentSchema,
} from '../schemas/payment-intent.schema';

export type PaymentIntentDto = z.infer<typeof PaymentIntentSchema>;
export type CreatePaymentIntentDto = z.infer<typeof CreatePaymentIntentSchema>;
export type UpdatePaymentIntentDto = z.infer<typeof UpdatePaymentIntentSchema>;
