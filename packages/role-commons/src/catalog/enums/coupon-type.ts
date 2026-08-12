export const COUPON_TYPES = ['percentage', 'fixed'] as const;

export type CouponType = (typeof COUPON_TYPES)[number];

export const CouponType = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
} as const satisfies Record<string, CouponType>;
