import { z } from "zod";
import {
	BooleanQuerySchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import { UuidSchema } from "../../_common/schemas/common";

/**
 * Query contract of `GET /offers`.
 *
 * `search`, `max_price`, `expiring_within_hours` and `sort` are the
 * `public.active_offers_near` parameters, same names and same semantics, so a
 * consumer can move a mobile query to this endpoint without translating it
 * (ADR-0008: the API mirrors the database's business logic).
 */
export const ListOffersQuerySchema = PaginationQuerySchema.extend({
	category_id: UuidSchema.optional(),
	business_id: UuidSchema.optional(),
	lat: z.coerce.number().min(-90).max(90).optional(),
	lng: z.coerce.number().min(-180).max(180).optional(),
	radius_km: z.coerce.number().positive().max(100).optional().default(10),
	/** Ausente → solo disponibles (comportamiento del feed). */
	available_only: BooleanQuerySchema.default(true),
	/**
	 * Case-insensitive substring over the offer title, its description AND the
	 * business name — three columns, like the RPC. Omitted or blank does not
	 * filter. The term is NOT wildcard-escaped, because the RPC concatenates
	 * `'%'||p_search||'%'` raw: a `%` typed by the user widens the match on both
	 * surfaces instead of only here.
	 */
	search: z.string().trim().min(1).max(120).optional(),
	/** Compares against `discounted_price`, the price the customer pays. */
	max_price: z.coerce.number().positive().optional(),
	/**
	 * Offers whose pickup window closes within the next N hours. The RPC also
	 * requires `pickup_end > now()`, so a window that is already closed is never
	 * in the result even if its end is inside the window.
	 */
	expiring_within_hours: z.coerce.number().int().positive().max(720).optional(),
	/**
	 * `pickup_end` is the default on purpose: it mirrors `active_offers_near`'s
	 * branch and lists what expires first, which is what the product wants.
	 * It CHANGES the ordering the API used to hardcode (`pickup_end desc`, i.e.
	 * what expires last) — and that one was unstable besides, because it had no
	 * `offers.id` tiebreaker, so a row could repeat or vanish across pages.
	 */
	sort: z
		.enum(["created_at", "distance", "pickup_end"])
		.optional()
		.default("pickup_end"),
});
