import { z } from "zod";
import { NonNegativeIntSchema, UuidSchema } from "../../_common/schemas/common";

/**
 * The two BUSINESS aggregates, mirrors of
 * `public.business_completed_orders_count(uuid)` and
 * `public.business_sales_stats(uuid, timestamptz, timestamptz)`.
 *
 * Both SQL functions take the business id as a PARAMETER. In Supabase that is
 * safe only because `business_completed_orders_count` is `SECURITY DEFINER`
 * and the other is called under the caller's RLS. Through this API neither
 * constraint exists: the pooler role owns `orders` and `business_ownership` and
 * is exempt from both, so a `business_id` that arrived from a request and was
 * not checked against `business_ownership` would be an unchecked read of
 * another merchant's revenue. `business_id` therefore appears on the PATH
 * (`/businesses/:businessId/...`) and every handler passes it through
 * `BusinessesService.assertCanViewBusiness` BEFORE the aggregate is computed —
 * the repository is never reached for a business the caller does not own.
 *
 * The consumer sibling is `UserOrderStatsSchema` in
 * `user/schemas/user-order-stats.schema.ts`.
 */

/**
 * `GET /businesses/:businessId/stats/completed-orders` — mirror of
 * `business_completed_orders_count`.
 *
 * `count(*)` of the business's orders whose status is `completed`, and ONLY
 * that status. Note the contrast with the consumer aggregate, which counts
 * everything that is not `cancelled`; the two rules are the SQL's own and are
 * NOT to be evened out — see `BusinessOwnerStatsRepository`.
 */
export const BusinessCompletedOrdersSchema = z.object({
	/** Echoed so a client rendering several businesses cannot mislabel a card. */
	business_id: UuidSchema,
	completed_orders: NonNegativeIntSchema,
});

/** One entry of `top_products`: a title, how many sold, and what they brought. */
export const BusinessTopProductSchema = z.object({
	name: z.string(),
	sold: NonNegativeIntSchema,
	revenue: z.number(),
});

/** One entry of `daily`: a UTC calendar day, its order count and its revenue. */
export const BusinessDailyStatSchema = z.object({
	/**
	 * `YYYY-MM-DD` in **UTC**.
	 *
	 * UTC, not the server's zone and not the merchant's. The series is bucketed
	 * by `(created_at at time zone 'UTC')::date`, so an order at 02:00Z belongs
	 * to that UTC day even where the API runs at UTC-4 and the local day starts
	 * at 04:00Z. A mirror that bucketed in the session zone would silently shift
	 * the whole series by a day for every deployment east of Greenwich, and the
	 * error would be invisible in a country that has no DST transition that
	 * month.
	 */
	day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	orders: NonNegativeIntSchema,
	revenue: z.number(),
});

/**
 * `GET /businesses/:businessId/stats/sales?from=&to=` — mirror of
 * `business_sales_stats`.
 *
 * Revenue is `sum(orders.price)`, the amount actually paid. NEVER
 * `original_price`: the difference between the two columns is the entire
 * discount, and a "revenue" figure built on the pre-discount price would
 * overstate every merchant's sales by exactly the saving the platform exists
 * to create.
 */
export const BusinessSalesStatsSchema = z.object({
	business_id: UuidSchema,
	orders_count: NonNegativeIntSchema,
	revenue: z.number(),
	/**
	 * At most five entries, grouped by the offer TITLE (not by offer id — two
	 * offers that shared a title share a bucket, and one offer resold under a
	 * new title splits into two).
	 *
	 * The literal name `'Desconocido'` is a real bucket, not a placeholder: the
	 * aggregate is a `LEFT JOIN offers` with `coalesce(offer.title,
	 * 'Desconocido')`, so an order whose offer row is gone is counted and
	 * bucketed under that string. A mirror that used an inner join, or filtered
	 * those rows out, would under-report both `orders_count` and `revenue` — the
	 * UI has to render the bucket, so the number has to include it.
	 */
	top_products: z.array(BusinessTopProductSchema).max(5),
	/** Ordered by day ascending, one entry per UTC day that has completed orders. */
	daily: z.array(BusinessDailyStatSchema),
});

/**
 * The period window, REQUIRED on both ends.
 *
 * Not optional, and with no server default, on purpose: the SQL takes
 * `p_from`/`p_to` and there is no "all time" branch in it to fall back to. A
 * default would have to be invented here, and an invented default is a report
 * that silently answers a different question than the one asked.
 *
 * `z.iso.datetime({ offset: true })`, not the deliberately-lax
 * `TimestamptzSchema`. The lax schema exists because PostgREST RESPONSES carry
 * `+00:00` and nobody wants a 500 on a read; this is an INPUT that is about to
 * be compared against `orders.created_at` and bucketed by UTC day, and a bare
 * `2026-09-01` would leave the API to pick midnight in SOME zone — which is
 * precisely the silent shift the `daily` bucketing exists to avoid. Requiring
 * an explicit offset (or `Z`) makes the merchant state the instant.
 */
const WindowEdgeSchema = z.iso.datetime({ offset: true });

/**
 * INCLUSIVE AT BOTH ENDS, and the ordering is checked rather than assumed: the
 * SQL is `created_at >= p_from and created_at <= p_to`, so an order landing
 * exactly on either edge is inside the window, and an inverted pair would
 * otherwise return a well-formed report of nothing at all.
 */
export const BusinessSalesStatsQuerySchema = z
	.object({
		from: WindowEdgeSchema,
		to: WindowEdgeSchema,
	})
	.refine((value) => Date.parse(value.from) <= Date.parse(value.to), {
		message: "from must not be after to",
		path: ["to"],
	});

/** The effective window, echoed back so a client never reconstructs it. */
export const BusinessSalesStatsPeriodSchema = z.object({
	from: WindowEdgeSchema,
	to: WindowEdgeSchema,
});

/**
 * The full `business_sales_stats` response: the window that was actually
 * applied, next to the numbers computed from it.
 */
export const BusinessSalesStatsResponseSchema = z.object({
	period: BusinessSalesStatsPeriodSchema,
	stats: BusinessSalesStatsSchema,
});
