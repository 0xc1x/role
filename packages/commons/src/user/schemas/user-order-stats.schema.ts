import { z } from "zod";
import { NonNegativeIntSchema } from "../../_common/schemas/common";

/**
 * `GET /me/order-stats` — the CONSUMER aggregate, mirror of
 * `public.user_order_stats(p_user_id uuid)`.
 *
 * THERE IS NO `user_id` ON THIS CONTRACT, and that is the whole authorisation
 * story: the SQL function takes the caller's id as a PARAMETER, which is only
 * safe in Supabase because it is called under the caller's RLS. There is no RLS
 * in this API's request path — the pooler role OWNS `orders` and is exempt from
 * every policy on it — so a `user_id` (or a `p_user_id`) that arrived from a
 * request would be an unchecked cross-account read. The owner is the token
 * subject, and the `where user_id = $1` inside `MeRepository.userOrderStats` IS
 * the access control.
 *
 * The two business siblings of this aggregate live in
 * `stats/schemas/business-stats.schema.ts`. They are owner-gated on
 * `business_ownership` instead. The asymmetry in the RULES — this one counts
 * everything that is not `cancelled`, both of those count only `completed` — is
 * the SQL's behaviour and is documented there and in the repository.
 */
export const UserOrderStatsSchema = z.object({
	/**
	 * Orders that are NOT `cancelled` — completed, pending, picked_up, expired,
	 * anything but the one status. Deliberately wider than the two business
	 * aggregates, which count only `completed`.
	 */
	orders_count: NonNegativeIntSchema,
	/**
	 * `sum(original_price - price)` over those same orders.
	 *
	 * NO `nonnegative()` FLOOR, unlike the money report's `MoneySchema`, and the
	 * difference is deliberate rather than an oversight: a discount can round
	 * against the customer, and a negative saving is a fact about the data that
	 * a floor would turn into a 400 at READ time, on a GET. The sign belongs to
	 * the caller to interpret, not to the contract to hide.
	 */
	total_saved: z.number(),
});

/**
 * Wrapped in the same key shape the rest of `/me` uses, for the same reason as
 * `MePreferencesSchema`: one decoder for the aggregate account snapshot and the
 * standalone settings resources.
 */
export const UserOrderStatsResponseSchema = z.object({
	order_stats: UserOrderStatsSchema,
});
