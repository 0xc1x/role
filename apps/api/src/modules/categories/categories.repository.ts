import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { publiclyVisibleBusiness } from '../../database/business-availability';
import { DRIZZLE } from '../../database/database.tokens';
import { escapeLike } from '../../common/utils/like';
import {
  businesses,
  categories,
  offerCategories,
  offers,
} from '../../database/schema';

/** Row as stored in Postgres (Date timestamps). */
export type CategoryRow = typeof categories.$inferSelect;

/** Insert payload for Drizzle. */
export type CategoryInsert = typeof categories.$inferInsert;

/** Partial update payload (never touch id / created_at here). */
export type CategoryUpdate = Partial<
  Pick<
    CategoryInsert,
    | 'name'
    | 'description'
    | 'emoji'
    | 'slug'
    | 'image_url'
    | 'active'
    | 'deleted_at'
  >
>;

export type ListCategoriesFilter = {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
};

export type ListCategoriesResult = {
  rows: CategoryListRow[];
  total: number;
};

/**
 * A category plus its `active_count`, the `active_offer_category_counts`
 * aggregate.
 *
 * `active_count` is `string | number` for the same reason `PopularZoneRow.deals`
 * is: the SQL keeps the RPC's `count(*)` (a `bigint`) and postgres.js returns
 * `int8` as a string — verified against the test database, not assumed. It is
 * `coalesce(..., 0)`d in SQL, so it is never null: a category nobody has an
 * active offer for reports `0`, which is an answer, where `null` would only mean
 * "this read did not count".
 */
export type CategoryListRow = CategoryRow & { active_count: string | number };

/**
 * DB executor: root client or an open transaction.
 * Call sites pass `tx` inside `transaction()` so reads/writes share the same connection.
 */
export type DbExecutor = Database;

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(
    executor: DbExecutor,
    values: CategoryInsert,
  ): Promise<CategoryRow> {
    const [row] = await executor.insert(categories).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert category');
    }
    return row;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<CategoryRow | null> {
    const [row] = await executor
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deleted_at)))
      .limit(1);
    return row ?? null;
  }

  async findByName(
    name: string,
    opts: { excludeId?: string } = {},
    executor: DbExecutor = this.db,
  ): Promise<CategoryRow | null> {
    const filters: SQL[] = [
      eq(categories.name, name),
      isNull(categories.deleted_at),
    ];
    if (opts.excludeId) {
      filters.push(ne(categories.id, opts.excludeId));
    }
    const [row] = await executor
      .select()
      .from(categories)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(
    slug: string,
    opts: { excludeId?: string } = {},
    executor: DbExecutor = this.db,
  ): Promise<CategoryRow | null> {
    const filters: SQL[] = [
      eq(categories.slug, slug),
      isNull(categories.deleted_at),
    ];
    if (opts.excludeId) {
      filters.push(ne(categories.id, opts.excludeId));
    }
    const [row] = await executor
      .select()
      .from(categories)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  }

  /**
   * The catalog values a `user_preferences.favorite_categories` entry can
   * ACTUALLY match, and nothing else.
   *
   * The consumer of that column is the `dispatch-nearby-offers` edge function,
   * which builds its per-offer set from `categories.name` — the Spanish display
   * names, NOT the ASCII-folded `slug` — and only for rows that are active and
   * not soft-deleted (`supabase/functions/dispatch-nearby-offers/index.ts`: an
   * inactive or deleted category is skipped, and an offer with no usable
   * category gets no entry at all). It lowercases both sides before comparing.
   *
   * So the set of strings that can ever match is exactly: `name` of every
   * category where `active AND deleted_at IS NULL`. The predicate here is
   * deliberately the SAME one, spelled in Drizzle instead of in the edge
   * function: a category that is inactive is a value that looks valid, is
   * accepted by any free-text schema, and filters nothing — which is the silent
   * failure `favorite_categories` already has today, since nothing writes it.
   *
   * Both `name` and `slug` are returned because they are two namespaces a
   * client may legitimately hold (a picker sends the name, a route param carries
   * the slug) and the caller normalises into `name`, which is the only one that
   * matches. Not paginated: this is the whole catalog, it is bounded by the
   * number of categories a platform has, and it is read once per preference
   * write.
   */
  async listMatchable(): Promise<
    Array<{ id: string; name: string; slug: string }>
  > {
    return this.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      })
      .from(categories)
      .where(and(isNull(categories.deleted_at), eq(categories.active, true)));
  }

  /**
   * The public/admin list, each row carrying `active_count` — the
   * `active_offer_category_counts` aggregate of ADR-0008.
   *
   * ─── THE MODERATION GATE IS NOW IN THE FUNCTION TOO ───────────────────────
   *
   * This read applied `publiclyVisibleBusiness()` while the SQL did not, and
   * documented the gap as deliberate: the RPC's subquery was
   * `o.is_active and o.stock > 0 and o.pickup_end > now()` with no business
   * condition, over an `offers` policy that is `USING (is_active = true)` and
   * nothing else, so it counted offers of a business that was deactivated or no
   * longer approved. The consequence — a count LOWER than the RPC's for a
   * category whose offers belong to an unapproved business — was stated as the
   * intended reading, and a spec pinned both sides disagreeing.
   *
   * `20260928041322_explore_aggregates_require_approved_business.sql` put the
   * same gate inside the function, and the two implementations now agree. The
   * spec beside it asserts agreement rather than divergence, and the gate below
   * is the function's rule mirrored rather than a local decision that happens to
   * be stricter. It still matters on this endpoint — `GET /categories` is public,
   * and a chip that says "12 deals" for a suspended merchant sends the caller to
   * `GET /offers`, which applies the same gate, to find nothing — but the two
   * are no longer at risk of drifting apart.
   *
   * A LEFT JOIN over a pre-aggregated subquery, not a join on `offer_categories`
   * and not a correlated scalar subquery, for one reason: an offer can carry
   * several categories, so joining the raw join table would emit one row per
   * (category, offer) pair and inflate BOTH the count and the page — `limit` and
   * `offset` would apply to duplicated rows. Aggregating first makes the
   * subquery one row per category, so the LEFT JOIN cannot multiply and the
   * pagination above it stays honest.
   */
  async list(filter: ListCategoriesFilter): Promise<ListCategoriesResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [isNull(categories.deleted_at)];

    if (filter.active !== undefined) {
      filters.push(eq(categories.active, filter.active));
    }
    if (filter.search) {
      filters.push(ilike(categories.name, `%${escapeLike(filter.search)}%`));
    }

    const where = and(...filters);

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(categories)
      .where(where);

    const activeCounts = this.activeOfferCounts();

    const rows = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        description: categories.description,
        emoji: categories.emoji,
        slug: categories.slug,
        image_url: categories.image_url,
        active: categories.active,
        created_at: categories.created_at,
        updated_at: categories.updated_at,
        deleted_at: categories.deleted_at,
        active_count: sql<
          string | number
        >`coalesce(${activeCounts.active_count}, 0)::bigint`,
      })
      .from(categories)
      .leftJoin(activeCounts, eq(categories.id, activeCounts.category_id))
      .where(where)
      .orderBy(desc(categories.created_at))
      .limit(filter.limit)
      .offset(offset);

    return {
      rows,
      total: totalRow?.count ?? 0,
    };
  }

  /**
   * `active_offer_category_counts`' inner aggregate, as a derived table.
   *
   * Column-for-column the RPC's subquery, moderation gate included: the function
   * carries it as of
   * `20260928041322_explore_aggregates_require_approved_business.sql`, so the
   * `publiclyVisibleBusiness()` below is the same rule on this side. Kept as its
   * own method because it is a self-contained subquery that the outer select
   * `coalesce`s, not a fragment of that query.
   */
  private activeOfferCounts() {
    return (
      this.db
        .select({
          category_id: offerCategories.category_id,
          // The `.as()` is mandatory, not cosmetic: Drizzle cannot reference a raw
          // SQL field of a subquery without one and throws at build time
          // ("it doesn't have an alias declared"), and the outer select has to read
          // this value to `coalesce` it.
          active_count: sql<string | number>`count(*)::bigint`.as(
            'active_count',
          ),
        })
        .from(offerCategories)
        .innerJoin(offers, eq(offerCategories.offer_id, offers.id))
        // Joined only for `publiclyVisibleBusiness()`, which correlates against
        // `businesses.id`.
        .innerJoin(businesses, eq(offers.business_id, businesses.id))
        .where(
          and(
            eq(offers.is_active, true),
            publiclyVisibleBusiness(),
            gt(offers.stock, 0),
            gt(offers.pickup_end, sql`now()`),
          ),
        )
        .groupBy(offerCategories.category_id)
        .as('active_offer_counts')
    );
  }

  async update(
    executor: DbExecutor,
    id: string,
    values: CategoryUpdate,
  ): Promise<CategoryRow | null> {
    const [row] = await executor
      .update(categories)
      .set({ ...values, updated_at: new Date() })
      .where(and(eq(categories.id, id), isNull(categories.deleted_at)))
      .returning();
    return row ?? null;
  }

  async softDelete(
    executor: DbExecutor,
    id: string,
  ): Promise<CategoryRow | null> {
    const now = new Date();
    const [row] = await executor
      .update(categories)
      .set({
        deleted_at: now,
        active: false,
        updated_at: now,
      })
      .where(and(eq(categories.id, id), isNull(categories.deleted_at)))
      .returning();
    return row ?? null;
  }
}
