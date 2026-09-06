import type { z } from 'zod';
import type { CouponSchema } from '../schemas/coupon.schema';

/** Row shape for `public.coupons` — derivado del schema Zod (SSOT). */
export type Coupon = z.infer<typeof CouponSchema>;
