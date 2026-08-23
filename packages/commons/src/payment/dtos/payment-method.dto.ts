import type { z } from 'zod';
import type {
  CreatePaymentMethodSchema,
  PatchPaymentMethodSchema,
  PaymentMethodSchema,
  UpdatePaymentMethodSchema,
  ViewPaymentMethodSchema,
} from '../schemas/payment-method.schema';

/** Wire DTO for a saved payment method (matches {@link PaymentMethodSchema}). */
export type PaymentMethodDto = z.infer<typeof PaymentMethodSchema>;

/** Public view — nunca expone el gateway_token. */
export type ViewPaymentMethodDto = z.infer<typeof ViewPaymentMethodSchema>;

export type CreatePaymentMethodDto = z.infer<typeof CreatePaymentMethodSchema>;
export type UpdatePaymentMethodDto = z.infer<typeof UpdatePaymentMethodSchema>;
export type PatchPaymentMethodDto = z.infer<typeof PatchPaymentMethodSchema>;
