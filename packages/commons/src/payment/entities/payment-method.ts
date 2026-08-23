/**
 * Domain entity for a tokenized payment method.
 * PCI DSS: PAN/CVV nunca se almacenan — solo token + metadatos de visualización.
 */
export interface PaymentMethod {
  id: string;
  user_id: string;
  gateway: 'place_to_pay' | 'stripe';
  /** Token opaco del gateway. */
  gateway_token: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  holder_name: string;
  is_default: boolean;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}
