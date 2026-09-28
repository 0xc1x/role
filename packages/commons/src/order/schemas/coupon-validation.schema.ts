import { z } from "zod";
import { UuidSchema } from "../../_common/schemas/common";
import { CouponRejectionReasonSchema } from "./reserve-offer.schema";

/**
 * The checkout coupon pre-check, `POST /coupons/validate`.
 *
 * It lives in the ORDER domain, not in `catalog`, because its whole reason to
 * exist is parity with the reservation: every value below is read by
 * `POST /orders` first, and this endpoint is only allowed to repeat that answer
 * before the user submits. A schema in the coupon domain would invite exactly
 * the split this is meant to remove.
 *
 * The rejection vocabulary is a strict SUBSET of `RESERVE_OFFER_ERROR_CODES`,
 * and its `reason` is the very same `COUPON_REJECTION_REASONS` the reservation
 * emits. Not a parallel enum: a client that already branches on
 * `COUPON_NOT_APPLICABLE: <reason>` at reservation needs no second branch to
 * render a pre-check rejection, and the two cannot drift into disagreeing
 * vocabularies because there is only one list.
 */
export const COUPON_VALIDATION_ERROR_CODES = [
	"COUPON_NOT_APPLICABLE",
	"COUPON_EXHAUSTED",
	"COUPON_MIN_NOT_MET",
] as const;

export type CouponValidationErrorCode =
	(typeof COUPON_VALIDATION_ERROR_CODES)[number];

export const ValidateCouponRequestSchema = z.object({
	/**
	 * The code exactly as the reservation will receive it: `POST /orders`
	 * compares it verbatim (`eq(coupons.code, code)`) and neither trims nor
	 * upper-cases it, so this field must not either. Normalizing here would
	 * validate one code and reserve another.
	 */
	code: z.string().min(1),
	/** The business of the offer being reserved, not the caller's. */
	business_id: UuidSchema,
	/**
	 * The order subtotal BEFORE any coupon is applied — `offer.discounted_price`,
	 * the same number the reservation puts in `price` before stage 6 reads
	 * `min_order_amount`.
	 *
	 * Required, not optional: `min_order_amount` cannot be evaluated without an
	 * amount, and a pre-check that skipped that stage would approve coupons the
	 * reservation then rejects with `COUPON_MIN_NOT_MET` — in the one place
	 * where the user is about to pay.
	 */
	amount: z.coerce.number().nonnegative(),
});

/** The coupon applies. `final_price` is what the reservation will charge. */
export const CouponValidationAcceptedSchema = z.object({
	applies: z.literal(true),
	code: z.string().min(1),
	discount: z.number().nonnegative(),
	final_price: z.number().nonnegative(),
});

/**
 * The coupon does not apply. `error` is the code the reservation would raise and
 * `reason` is set only for `COUPON_NOT_APPLICABLE`, exactly as
 * `ReserveOfferErrorSchema` does it.
 */
export const CouponValidationRejectedSchema = z.object({
	applies: z.literal(false),
	code: z.string().min(1),
	error: z.enum(COUPON_VALIDATION_ERROR_CODES),
	reason: CouponRejectionReasonSchema.optional(),
});

export const CouponValidationSchema = z.discriminatedUnion("applies", [
	CouponValidationAcceptedSchema,
	CouponValidationRejectedSchema,
]);
