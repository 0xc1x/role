/** Row shape for `public.payment_events` */
export interface PaymentEvent {
  id: string;
  payment_intent_id: string;
  event_type: string;
  gateway_event_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  created_at: string;
}
