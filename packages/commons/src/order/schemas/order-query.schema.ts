import { z } from "zod";
import { ORDER_STATUSES } from "../enums/order-status";
import {
	BooleanQuerySchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import { UuidSchema } from "../../_common/schemas/common";

export const CreateOrderRequestSchema = z.object({
	offer_id: UuidSchema,
	coupon_code: z.string().min(1).optional(),
	/**
	 * Client-generated key that makes the reservation safe to retry (ADR-0008,
	 * mirror of the `p_idempotency_key` parameter of `reserve_offer`).
	 *
	 * Optional and nullable because a client that does not retry has nothing to
	 * send, and a key of `null` means the same as an absent one: no
	 * idempotency, exactly the behaviour that predates the key.
	 *
	 * The bound mirrors the `orders_idempotency_key_length` check constraint and
	 * the `length > 128 -> INVALID_IDEMPOTENCY_KEY` guard of the RPC, which the
	 * database enforces anyway. Zod counts code points like Postgres counts
	 * characters, so the two agree on where the limit is.
	 */
	idempotency_key: z.string().min(1).max(128).nullable().optional(),
});

export const UpdateOrderStatusSchema = z.object({
	status: z.enum(ORDER_STATUSES),
	reason: z.string().min(1).max(500).optional(),
});

/** Body para validar código de recogida (espejo de la RPC validate_pickup_code). */
export const ValidatePickupCodeSchema = z.object({
	pickup_code: z.string().min(1),
});

export const ListOrdersQuerySchema = PaginationQuerySchema.extend({
	status: z.enum(ORDER_STATUSES).optional(),
});

/** Business portal: list orders for one of the caller's businesses. */
export const ListBusinessOrdersQuerySchema = PaginationQuerySchema.extend({
	business_id: UuidSchema.optional(),
	status: z.enum(ORDER_STATUSES).optional(),
});

/**
 * Back office: every order across every business. `business_id` is a plain
 * filter here (not a scope), and `stuck` exists because the operator's real
 * question is not "list orders" but "what is not moving": a reservation whose
 * offer pickup window closed while the order is still non-terminal never
 * resolves on its own and is invisible in a list sorted by `created_at`.
 *
 * Only `stuck=true` narrows — there is no meaningful "not stuck" set, so
 * `stuck=false` is accepted and ignored rather than silently inverted.
 */
export const ListAdminOrdersQuerySchema = PaginationQuerySchema.extend({
	business_id: UuidSchema.optional(),
	status: z.enum(ORDER_STATUSES).optional(),
	stuck: BooleanQuerySchema.optional(),
});

/**
 * Order timeline (`GET /orders/{id}/events`). Pure pagination: the timeline is
 * ordered oldest-first and the caller has already been authorized against the
 * order, so there is nothing to filter here.
 */
export const ListOrderEventsQuerySchema = PaginationQuerySchema;
