import type { CouponType } from '../enums/coupon-type';

/** Row shape for `public.coupons` — `business_id: null` = cupón global de plataforma. */
export interface Coupon {
  id: string;
  business_id: string | null;
  code: string;
  name: string;
  type: CouponType;
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
