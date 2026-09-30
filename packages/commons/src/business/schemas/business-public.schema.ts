import { z } from "zod";
import {
	PaginatedDataSchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import {
	BusinessTypeSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";
import { BusinessHoursSchema } from "./business-hours.schema";
import { BusinessLocationSchema } from "./business-location.schema";

/**
 * Public catalog projection of a business. It is NOT `BusinessSchema` minus a
 * couple of fields: it is a different, narrower contract, and the difference is
 * the point.
 *
 * WHY A SEPARATE PROJECTION: `BusinessSchema` is the panel/owner DTO and it
 * carries `owner_id`, `balance`, `commission_rate`, `verification_status`,
 * `verified_at`, `verified_by` and `rejection_reason`. None of those belongs to
 * a reader who just wants to know where the surplus food is:
 *
 *  - `owner_id` is the uuid of the merchant's user account. Publishing it hands
 *    every consumer the owner-panel identifiers of every business on the
 *    platform.
 *  - `balance` and `commission_rate` are the platform's money terms, not the
 *    merchant's storefront.
 *  - the moderation quartet is the platform's internal state. A business that is
 *    publicly readable here is approved by definition, so shipping the status
 *    would only tell a reader about a decision they never have to make.
 *
 * Extending `BusinessSchema` with `.omit()` would be the same contract with a
 * name, and the next field added to the panel DTO would leak by default. This
 * schema has to be edited deliberately, which is the property worth having on
 * the one surface that needs no authentication.
 *
 * `is_active` is absent for the same reason the gate exists: every row returned
 * by this surface is active, so the field could only ever carry the constant
 * `true`. The guarantee is the WHERE clause, not a value in the payload.
 *
 * ─── The five `active_businesses_near` fields ───────────────────────────────
 *
 * `active_businesses_near` (ADR-0008) is a business list BUILT FROM live offers
 * rather than a business directory: a business only appears if it has at least
 * one active, in-stock, unexpired offer, and each row carries that count plus the
 * pickup point the reader would walk to. Five fields carry that, and all five are
 * OPTIONAL — a deliberate non-breaking decision, not laziness. This schema has
 * three producers and only one of them runs the aggregate: `GET /businesses/public`
 * emits all five, `GET /businesses/public/:id` reads a single row through the same
 * schema WITHOUT the aggregate, and `apps/admin` types against it. A required
 * field would force the other two to invent a `0` they never measured, which is
 * the exact lie `CategoryDto` refuses to tell by making `active_count` optional
 * (see `categories.mapper.ts`). The API always emits them on the list; the schema
 * only declines to FORCE a producer to.
 */
export const PublicBusinessSchema = z.object({
	id: UuidSchema,
	name: z.string().min(1),
	type: BusinessTypeSchema,
	slug: z.string().min(1),
	image: z.string().nullable(),
	cover_image: z.string().nullable(),
	description: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.email().nullable(),
	website: z.string().nullable(),
	rating: z.number().nullable(),
	review_count: z.number().int().nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
	/**
	 * Live offers counted for this business. The inner join that produces the row
	 * is what makes it ≥ 1 whenever the field is present, so the floor states a
	 * property of the query and not of the catalog a producer may be answering.
	 */
	active_deals_count: z.number().int().nonnegative().optional(),
	/**
	 * Kilometres from the search point to the RETURNED pickup point; `null` when
	 * the request carried no `lat`/`lng`.
	 *
	 * Measured against the LOCATION, which is the nearest of the business's live
	 * offers, while the list's `sort=distance` ranks on the minimum over the
	 * offers that passed the RADIUS filter. Those are computed from different sets
	 * and, for every row this endpoint can return, they are the same number — a
	 * radius that excluded the nearest location would exclude all of them and the
	 * business would drop out of the result. The repository derives it; the
	 * contract carries it separately because a reader that shows a distance needs
	 * it beside the location it belongs to, not inferred from the sort.
	 */
	distance_km: z.number().nonnegative().nullable().optional(),
	/** The pickup point this row is about; see `distance_km`. */
	business_location_id: UuidSchema.optional(),
	address: z.string().min(1).optional(),
	/** `numeric(10,7)` on the row, a `number` on the wire — see `toLocationDto`. */
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	zone: z.string().nullable().optional(),
});

/**
 * Filters of the public catalog.
 *
 * It is NOT `ListBusinessesQuerySchema` reused as-is, for the same reason the
 * response is not `BusinessSchema`: every admin-only field of that query
 * (`is_active`, `verification_status`, `owner_id`, `mine`) is a way to ask "show
 * me something the public surface must not show". An unfiltered public route
 * already returns active+approved businesses only, so those four can only ever
 * be a no-op or an attempt to widen the gate.
 *
 * They are therefore IGNORED, not rejected: a zod object strips unknown keys, so
 * `?is_active=false` on this route is dropped before the query is built and the
 * approved+active gate is applied unconditionally. Rejecting with a 400 was the
 * other option and it is worse — a public URL that 400s is a URL a client has to
 * special-case, and the caller's intent there is not a security question.
 *
 * `search` is the one filter that survives: it matches on `businesses.name` and
 * a public reader legitimately wants to find a shop by name.
 *
 * ─── The `active_businesses_near` parameters ───────────────────────────────
 *
 * `lat` / `lng` / `radius_km` / `type` / `sort` are the RPC's `p_lat`, `p_lng`,
 * `p_radius_km`, `p_type` and `p_sort`, and all five are OPTIONAL with the RPC's
 * own defaults, because the RPC is what the mobile Explore map already calls and
 * a client must be able to move a query here without translating it (ADR-0008).
 *
 * Three decisions in here are NOT obvious and each one is load-bearing:
 *
 *  - `radius_km` has NO default, unlike {@link ListOffersQuerySchema}. The RPC
 *    declares `p_radius_km double precision default null`, and the offers feed
 *    legitimately defaults to 10 km because a location-less offer request is a
 *    feed request. A location-less BUSINESS request is a catalog request, so
 *    defaulting it here would silently turn every existing
 *    `GET /businesses/public` into a 10 km search the first time a caller adds a
 *    map. Same reason `ListZonesQuerySchema` does it this way.
 *
 *  - `type` is a plain `string`, NOT {@link BusinessTypeSchema}. The RPC compares
 *    `b.type::text = lower(p_type)`, so the PARAMETER is lowercased: a caller
 *    that sends `Restaurant` matches `restaurant` instead of 400ing. Typing it
 *    as the enum would reject the exact input the SQL accepts.
 *
 *  - `search` is NOT wildcard-escaped here. The RPC concatenates
 *    `'%'||p_search||'%'` raw, and a `%` typed by the user widens the match on
 *    both surfaces instead of only on the API. This is the same decision
 *    `ListOffersQuerySchema` documents, deliberately, for the same RPC family.
 */
export const ListPublicBusinessesQuerySchema = PaginationQuerySchema.extend({
	search: z.string().min(1).optional(),
	lat: z.coerce.number().min(-90).max(90).optional(),
	lng: z.coerce.number().min(-180).max(180).optional(),
	/** `p_radius_km`, and it filters only when `lat` AND `lng` are both present. */
	radius_km: z.coerce.number().positive().max(100).optional(),
	type: z.string().min(1).max(40).optional(),
	/** `p_sort text default 'deals'`. `deals` = `active_deals_count desc`. */
	sort: z.enum(["deals", "distance"]).optional().default("deals"),
});

/**
 * Storefront read: the business plus everything a visitor needs to plan a
 * pickup, in ONE response.
 *
 * WHY EMBEDDED AND NOT THREE ROUTES: the consumer that renders this screen has
 * to show the shop, its pickup points and its weekly schedule before it can
 * paint anything useful, and all three rows are gated by the same predicate on
 * the same business. Three routes would mean three round trips and three places
 * where "is this business public?" has to be answered consistently. One read
 * cannot disagree with itself.
 *
 * `locations` and `hours` are arrays and not optional fields: an empty array is
 * "this business has no pickup point published yet", which is a state the UI has
 * to render. `null` would mean the same thing with a second branch to write.
 */
export const PublicBusinessStorefrontSchema = z.object({
	business: PublicBusinessSchema,
	/** Active pickup points only; an inactive one is not a place to collect. */
	locations: z.array(BusinessLocationSchema),
	/** Weekly schedule, ordered by weekday. */
	hours: z.array(BusinessHoursSchema),
});

/** Canonical paginated body for the public catalog. */
export const PublicBusinessListResponseSchema =
	PaginatedDataSchema(PublicBusinessSchema);
