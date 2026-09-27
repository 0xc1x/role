import { z } from "zod";
import {
	PaginatedDataSchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import {
	RatingSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

/**
 * One row of a review feed.
 *
 * It is NOT `ReviewSchema` and it is not `ReviewModerationItemSchema`, and both
 * omissions are decisions:
 *
 *  - Nothing moderation-shaped travels here. `is_hidden`, `moderated_at`,
 *    `moderated_by`, `moderation_reason` and `hidden_reason` exist on the
 *    moderation DTO because an operator has to decide on a row. A consumer
 *    reading a public feed does not: the feed only contains visible rows, so
 *    every moderation field would carry a constant, and `hidden_reason` is
 *    free text written by staff about a person.
 *  - `user_id` does not travel either. It is the same value as `author_id`, and
 *    two names for one uuid in one payload is how a consumer ends up reading the
 *    wrong one. `author_id` is here instead.
 */
export const PublicReviewItemSchema = z.object({
	id: UuidSchema,
	business_id: UuidSchema,
	order_id: UuidSchema.nullable(),
	product_rating: RatingSchema.nullable(),
	business_rating: RatingSchema.nullable(),
	comment: z.string().nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
	/**
	 * The author, projected to a display name. `null` when the profile row is
	 * gone: the review outlives its author (the FK is `no action`, and the
	 * moderation inbox already has to render that case), so a deleted account
	 * must not take the row out of the feed.
	 *
	 * WHY NAME ONLY: the moderation mapper already decided what the platform
	 * considers the public identity of a review author — `profiles.full_name` and
	 * nothing else (`reviews-moderation.mapper.ts`). A review is attributed text,
	 * not a user directory: `email`, `phone`, `role`, `city` and `avatar_url` are
	 * all either contact data, an authorization signal, or a private Storage URL,
	 * and none of them is needed to render "Ana, 4/5, great bread". Widening this
	 * projection would be inventing a second, looser author contract next to the
	 * narrow one the moderation inbox already ships.
	 */
	author_name: z.string().nullable(),
	/** Same value as `reviews.user_id`; see the note on the field name above. */
	author_id: UuidSchema,
});

/**
 * One row of the per-offer feed: the public item plus which offer it is about.
 *
 * A separate schema, not the public item with two nullable fields, because on
 * the business feed those two fields have no value at all: resolving them means
 * joining `orders` to every review of a business, and `reviews` has no
 * `offer_id`. Carrying them as always-null on one feed and always-set on the
 * other is a contract that lies in one of its two homes.
 */
export const OfferReviewItemSchema = PublicReviewItemSchema.extend({
	/**
	 * Resolved through the order. Never null on this feed: the query reaches
	 * `orders` on `orders.offer_id = <the requested offer>`, so a review without
	 * an order cannot appear here at all.
	 */
	offer_id: UuidSchema,
	offer_title: z.string(),
});

/**
 * A row of the caller's own review history.
 *
 * It extends the public item with `is_hidden` and nothing else. The author of a
 * row is the only reader for whom "this was withheld" is their own business: the
 * public feeds exclude hidden rows entirely, so a consumer that could only see
 * visible reviews would have no way to explain to its owner that a review they
 * wrote is gone. The moderation reason stays out — that record belongs to the
 * appeal between the business and the platform, not to the author.
 */
export const MyReviewItemSchema = PublicReviewItemSchema.extend({
	is_hidden: z.boolean(),
});

/**
 * Feed pagination. Pagination only, on purpose: the two public feeds are
 * `(business_id)` and `(offer_id)` scoped, and both are served by an index whose
 * leading column is that scope. Any additional filter (a star rating, a date
 * window) would be an AND on top of it that the index cannot use, and the
 * per-offer case already has its own route with its own index story.
 */
export const ListReviewsFeedQuerySchema = PaginationQuerySchema;

export const PublicReviewListResponseSchema = PaginatedDataSchema(
	PublicReviewItemSchema,
);

export const MyReviewListResponseSchema = PaginatedDataSchema(MyReviewItemSchema);
