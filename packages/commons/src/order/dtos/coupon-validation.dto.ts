import type { z } from "zod";
import type {
	CouponValidationSchema,
	ValidateCouponRequestSchema,
} from "../schemas/coupon-validation.schema";

/** Body of `POST /coupons/validate`. */
export type ValidateCouponRequest = z.infer<typeof ValidateCouponRequestSchema>;

/** Verdict of `POST /coupons/validate`, same vocabulary as `POST /orders`. */
export type CouponValidation = z.infer<typeof CouponValidationSchema>;
