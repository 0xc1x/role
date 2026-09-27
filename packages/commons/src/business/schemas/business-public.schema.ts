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
 */
export const ListPublicBusinessesQuerySchema = PaginationQuerySchema.extend({
	search: z.string().min(1).optional(),
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
export const PublicBusinessListResponseSchema = PaginatedDataSchema(
	PublicBusinessSchema,
);
