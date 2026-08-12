import type { z } from 'zod';
import type {
  CouponSchema,
  CreateCouponSchema,
  UpdateCouponSchema,
} from '../schemas/coupon.schema';

export type CouponDto = z.infer<typeof CouponSchema>;
export type CreateCouponDto = z.infer<typeof CreateCouponSchema>;
export type UpdateCouponDto = z.infer<typeof UpdateCouponSchema>;
