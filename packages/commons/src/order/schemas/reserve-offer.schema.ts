import { z } from "zod";
import { ORDER_STATUSES } from "../enums/order-status";

/**
 * Contrato de respuesta del espejo de la RPC `reserve_offer` de Supabase.
 * Debe mantenerse idéntico al jsonb que devuelve el SQL (ADR-0008).
 */
export const RESERVE_OFFER_ERROR_CODES = [
	"OFFER_NOT_FOUND",
	"OFFER_OUT_OF_STOCK",
	"OFFER_EXPIRED",
	"DUPLICATE_RESERVATION",
	"COUPON_EXHAUSTED",
	"COUPON_MIN_NOT_MET",
	"UNAUTHORIZED",
	"INVALID_IDEMPOTENCY_KEY",
	"IDEMPOTENCY_KEY_REUSED",
] as const;

export type ReserveOfferErrorCode = (typeof RESERVE_OFFER_ERROR_CODES)[number];

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
});

export const ReserveOfferResponseSchema = z.discriminatedUnion("success", [
	ReserveOfferResultSchema,
	ReserveOfferErrorSchema,
]);
