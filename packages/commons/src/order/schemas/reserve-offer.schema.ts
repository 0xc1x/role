import { z } from "zod";
import { ORDER_STATUSES } from "../enums/order-status";

/**
 * Contrato de respuesta del espejo de la RPC `reserve_offer` de Supabase.
 * Debe mantenerse idéntico al jsonb que devuelve el SQL (ADR-0008).
 *
 * `COUPON_NOT_APPLICABLE` and its `reason` are emitted by BOTH producers: the
 * SQL rejects an unusable coupon before touching stock or writing the order,
 * and the API mirror does the same in the same stage order. `reason` stays
 * optional because the pre-existing codes — `COUPON_EXHAUSTED` and
 * `COUPON_MIN_NOT_MET` — are loud already and carry no reason of their own.
 */
export const RESERVE_OFFER_ERROR_CODES = [
	"OFFER_NOT_FOUND",
	"OFFER_OUT_OF_STOCK",
	"OFFER_EXPIRED",
	"DUPLICATE_RESERVATION",
	"COUPON_EXHAUSTED",
	"COUPON_MIN_NOT_MET",
	"COUPON_NOT_APPLICABLE",
	"UNAUTHORIZED",
	"INVALID_IDEMPOTENCY_KEY",
	"IDEMPOTENCY_KEY_REUSED",
] as const;

export type ReserveOfferErrorCode = (typeof RESERVE_OFFER_ERROR_CODES)[number];

/**
 * Why a coupon was rejected before being applied. Each reason is one stage of
 * the check, in order: existence -> business scope -> `is_active` ->
 * `expires_at`. Later stages (`max_uses`, `min_order_amount`) keep their own
 * error codes and are never reported here.
 */
export const COUPON_REJECTION_REASONS = [
	"not_found",
	"inactive",
	"expired",
	"wrong_business",
] as const;

export type CouponRejectionReason = (typeof COUPON_REJECTION_REASONS)[number];

export const CouponRejectionReasonSchema = z.enum(COUPON_REJECTION_REASONS);

const RESERVE_OFFER_ERRORS = RESERVE_OFFER_ERROR_CODES;

export const ReserveOfferResultSchema = z.object({
	success: z.literal(true),
	order_id: z.uuid(),
	order_number: z.string(),
	pickup_code: z.string(),
	price: z.number(),
	original_price: z.number(),
	discount: z.number(),
	platform_fee: z.number(),
	net_amount: z.number(),
	status: z.enum(ORDER_STATUSES),
	replayed: z.boolean().optional(),
});

export const ReserveOfferErrorSchema = z.object({
	success: z.literal(false),
	error: z.enum(RESERVE_OFFER_ERRORS),
	message: z.string(),
	/** Only set for `COUPON_NOT_APPLICABLE`; absent for every other code. */
	reason: CouponRejectionReasonSchema.optional(),
});

export const ReserveOfferResponseSchema = z.discriminatedUnion("success", [
	ReserveOfferResultSchema,
	ReserveOfferErrorSchema,
]);
