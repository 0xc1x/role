import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { offers, orders, profiles, reviews } from '../../database/schema';
import type { ListReviewsFeedQuery } from '@0xc1x/role-commons';

/**
 * A review as the three feeds need it: the row, its author's display name, and
 * the moderation flag.
 *
 * `author_name` is `profiles.full_name` and nothing else, copied from
 * `ReviewModerationRow` in `reviews.repository.ts`. That row is the existing
 * precedent for how much of a `profiles` row the platform is willing to attach
 * to a review; `email`, `phone`, `role` and `city` are deliberately absent, so a
 * feed cannot become a directory of consumer accounts. `leftJoin`, for the same
 * reason: the review outlives its author and a review with no author still has
 * to be readable.
 */
export type ReviewFeedRow = {
  id: string;
  business_id: string;
  order_id: string | null;
  product_rating: number | null;
  business_rating: number | null;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  is_hidden: boolean;
  author_id: string;
  author_name: string | null;
};

/** The per-offer feed additionally resolves which offer the review is about. */
export type OfferReviewFeedRow = ReviewFeedRow & {
  offer_id: string;
  offer_title: string;
};

/**
 * Read side of the review feeds.
 *
 * A separate repository from `ReviewsRepository` (writes + the moderation inbox)
 * because the two disagree on purpose about what a review is: the moderation
 * queue reads the whole row including why it was hidden, and these feeds read
 * only what a reader is allowed to see. Merging them would mean one projection
 * that has to remember which audience it is serving.
 */
@Injectable()
export class ReviewsFeedRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The columns every feed reads. A function and not a literal in each builder
   * so the business feed, the offer feed and the "my" feed cannot drift apart on
   * a field.
   */
  private feedColumns() {
    return {
      id: reviews.id,
      business_id: reviews.business_id,
      order_id: reviews.order_id,
      product_rating: reviews.product_rating,
      business_rating: reviews.business_rating,
      comment: reviews.comment,
      created_at: reviews.created_at,
      updated_at: reviews.updated_at,
      is_hidden: reviews.is_hidden,
      author_id: reviews.user_id,
      author_name: profiles.full_name,
    };
  }

  /**
   * Base projection. `is_hidden` is selected although the public feeds pin it to
   * false: the "my" feed needs the real value, and a second projection that
   * differs by one column is a second place to forget a filter.
   */
  private baseSelect() {
    return this.db
      .select(this.feedColumns())
      .from(reviews)
      .leftJoin(profiles, eq(reviews.user_id, profiles.id));
  }

  /**
   * The same projection plus the two joins that resolve the offer. Both joins are
   * inner; see `listVisibleByOffer` for why each one is.
   */
  private offerSelect() {
    return this.db
      .select({
        ...this.feedColumns(),
        offer_id: offers.id,
        offer_title: offers.title,
      })
      .from(reviews)
      .leftJoin(profiles, eq(reviews.user_id, profiles.id))
      .innerJoin(orders, eq(reviews.order_id, orders.id))
      .innerJoin(offers, eq(orders.offer_id, offers.id));
  }

  /**
   * WHERE clause of the two public feeds.
   *
   * `eq(reviews.is_hidden, false)` and NOT `is_hidden is not true`, even though
   * both mean the same thing for a NOT NULL column and
   * `ReviewsRepository.recalcBusinessRating` uses the latter. The difference is
   * the whole point:
   *
   * `idx_reviews_visible_business_created on reviews (business_id, created_at
   * desc) where is_hidden = false` is PARTIAL, and Postgres will only use a
   * partial index when the query's predicate implies the index predicate as
   * written. `is_hidden is not true` is not something the planner can prove is
   * `is_hidden = false`, so that spelling silently falls back to a sequential
   * scan of every review in the table plus a sort. The mirror of the trigger
   * uses `is not true` because a trigger has no index to serve; a feed does.
   */
  private visibleAnd(filters: SQL[]): SQL {
    return and(eq(reviews.is_hidden, false), ...filters) as SQL;
  }

  /**
   * Public feed of one business.
   *
   * INDEX: `idx_reviews_visible_business_created (business_id, created_at desc)
   * where is_hidden = false`. The leading column is the scope, the partial
   * predicate is implied by `visibleAnd`, and the ordering is the index order.
   *
   * The `id` tiebreaker in the ORDER BY is not in the index, so Postgres adds an
   * INCREMENTAL sort on top of the index scan: it walks the index in
   * `created_at desc` order and only sorts the rows that share a timestamp,
   * which is bounded by `limit`. That is the price of a stable page boundary and
   * it is worth paying — `created_at desc` alone lets two reviews written in the
   * same millisecond swap places between page 1 and page 2, and an infinite
   * scroll that drops a row is a bug nobody reproduces twice.
   *
   * NO JOIN to `orders` here, and that is a decision with a cost. The per-offer
   * feed needs `offer_title`; resolving it here would mean joining `orders` (and
   * then `offers`) for every review of the business, and a join on the outer side
   * of the scan can turn the bounded `limit` into "read the whole business first,
   * then sort". The business feed therefore does not carry the offer, and the
   * offer feed is the route for "reviews of this pack".
   */
  async listVisibleByBusiness(
    businessId: string,
    query: ListReviewsFeedQuery,
  ): Promise<{ rows: ReviewFeedRow[]; total: number }> {
    const where = this.visibleAnd([eq(reviews.business_id, businessId)]);

    // Same `where` for the page and for the count, and the count reads `reviews`
    // ALONE: with no join in the query, `count(*)` is an index-only scan of the
    // same partial index over the same rows, so `meta.total` costs a bounded walk
    // and never a sequential scan of the table.
    const [totalRow] = await this.db
      .select({ c: count() })
      .from(reviews)
      .where(where);
    const rows = await this.baseSelect()
      .where(where)
      .orderBy(desc(reviews.created_at), desc(reviews.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  /**
   * Public feed of one offer.
   *
   * THE JOIN, and why it exists: `reviews` has NO `offer_id`. A review is written
   * against an order (`reviews.order_id`), and the order is what knows the offer
   * (`orders.offer_id`). So the feed is `reviews -> orders -> offers`, and the
   * offer being asked about is a condition on `orders.offer_id`, not on
   * anything in `reviews`.
   *
   * Both joins are INNER, which is not a style choice:
   *  - `inner join orders on orders.id = reviews.order_id` is what makes
   *    "this review is about that offer" true. A legacy review with a NULL
   *    `order_id` cannot be attributed to any offer and is excluded, rather than
   *    showing up on every offer with a null offer id.
   *  - `inner join offers on offers.id = orders.offer_id` resolves the title the
   *    row displays. `orders.offer_id` is NOT NULL with an FK to `offers`, so
   *    this join drops nothing in practice; it is inner so that the contract can
   *    declare `offer_title` as a plain string instead of a nullable one that a
   *    client would have to render defensively.
   *
   * INDEX: there is no purpose-built partial index for this path — the one that
   * exists is keyed on `business_id` — so this feed rides `idx_orders_offer` to
   * find the offer's orders and `idx_reviews_order_id` to reach each order's
   * review, and the count is a join bounded by how many orders that offer has.
   * The right fix is a partial index on `reviews (order_id) where is_hidden =
   * false` plus carrying `offer_id` on `reviews`, and both are Supabase
   * migrations: out of scope for a read surface, and the current cost is bounded
   * by one offer's order count.
   *
   * The offer itself is NOT gated here. `ReviewsFeedsService` asks
   * `OffersRepository` first, through the same predicate the public offer detail
   * uses, so the reviews of a paused or unapproved offer are a 404 rather than
   * an empty page that implies the offer exists.
   */
  async listVisibleByOffer(
    offerId: string,
    query: ListReviewsFeedQuery,
  ): Promise<{ rows: OfferReviewFeedRow[]; total: number }> {
    const where = this.visibleAnd([eq(orders.offer_id, offerId)]);

    const [totalRow] = await this.db
      .select({ c: count() })
      .from(reviews)
      .innerJoin(orders, eq(reviews.order_id, orders.id))
      .where(where);
    const rows = await this.offerSelect()
      .where(where)
      .orderBy(desc(reviews.created_at), desc(reviews.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  /**
   * The caller's own review history, hidden rows included.
   *
   * The `reviews` SELECT policy is `is_hidden is not true or user_id =
   * auth.uid()`, so a direct PostgREST read already lets an author see their own
   * withheld row. That policy is NOT the enforcement point for this endpoint:
   * the API connects with the pooler role and does not go through PostgREST, so
   * the same rule has to be written into the query. `user_id = <caller>` and
   * nothing else — there is no `or is_hidden = false` branch, because that branch
   * is what would let a caller read somebody else's hidden review.
   *
   * INDEX: `idx_reviews_user on reviews (user_id)`, the index that has been there
   * since the table was created. There is no purpose-built `(user_id, created_at
   * desc)` index, so the filter is an index range and the ordering is a sort of
   * the caller's own rows — bounded by one person's own history, which is the
   * same argument the soft-hide migration makes for leaving the author path on
   * the plain index. The `id` tiebreaker keeps the page boundary stable, as in
   * the public feeds.
   */
  async listForUser(
    userId: string,
    query: ListReviewsFeedQuery,
  ): Promise<{ rows: ReviewFeedRow[]; total: number }> {
    const where = eq(reviews.user_id, userId);

    const [totalRow] = await this.db
      .select({ c: count() })
      .from(reviews)
      .where(where);
    const rows = await this.baseSelect()
      .where(where)
      .orderBy(desc(reviews.created_at), desc(reviews.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return { rows, total: Number(totalRow?.c ?? 0) };
  }
}
