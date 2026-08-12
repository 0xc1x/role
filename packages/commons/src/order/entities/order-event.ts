import type { OrderStatus } from '../enums/order-status';

/** Row shape for `public.order_events` */
export interface OrderEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  previous_status: OrderStatus | null;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
