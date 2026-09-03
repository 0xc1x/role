import type {
	CouponDto,
	CouponPaginatedData,
	CreateCouponDto,
	ListCouponsQuery,
	UpdateCouponDto,
} from "@0xc1x/role-commons";
import { createResourceApi } from "@/lib/api/resource";

export const couponsApi = createResourceApi<
	CouponDto,
	CreateCouponDto,
	UpdateCouponDto,
	ListCouponsQuery,
	CouponPaginatedData
>("/coupons");
