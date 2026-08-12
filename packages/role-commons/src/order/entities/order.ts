import type { OrderStatus } from '../enums/order-status';

/** Row shape for `public.orders` */
export interface Order {
  id: string;
  user_id: string;
  offer_id: string;
  business_id: string;
  order_number: string;
  status: OrderStatus;
  price: number;
  original_price: number;
  pickup_code: string;
  pickup_time: string | null;
  coupon_id: string | null;
  created_at: string;
  updated_at: string;
}
