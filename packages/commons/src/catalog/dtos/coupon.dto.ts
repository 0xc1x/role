import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CouponSchema,
  CouponListItemSchema,
  CreateCouponSchema,
  UpdateCouponSchema,
  ListCouponsQuerySchema,
  CouponListResponseSchema,
} from '../schemas/coupon.schema';

/** Wire DTO for a coupon resource (matches {@link CouponSchema}). */
export type CouponDto = z.infer<typeof CouponSchema>;

export type CreateCouponDto = z.infer<typeof CreateCouponSchema>;
export type UpdateCouponDto = z.infer<typeof UpdateCouponSchema>;
export type ListCouponsQuery = z.infer<typeof ListCouponsQuerySchema>;

/** Enriched list item (includes the associated business name, if any). */
export type CouponListItemDto = z.infer<typeof CouponListItemSchema>;
export type CouponListResponse = z.infer<typeof CouponListResponseSchema>;

/** Paginated list response for coupons. */
export type CouponPaginatedData = PaginatedData<CouponListItemDto>;
