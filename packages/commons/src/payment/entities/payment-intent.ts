import type { PaymentGateway } from '../enums/payment-gateway';
import type { PaymentIntentStatus } from '../enums/payment-intent-status';

/** Row shape for `public.payment_intents` */
export interface PaymentIntent {
  id: string;
  order_id: string;
  gateway: PaymentGateway;
  gateway_id: string | null;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  gateway_response: Record<string, unknown> | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}
