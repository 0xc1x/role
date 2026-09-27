import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, ne, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { escapeLike } from '../../common/utils/like';
import { categories } from '../../database/schema';

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
  rows: CategoryRow[];
  total: number;
};

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

    const rows = await this.db
      .select()
      .from(categories)
      .where(where)
      .orderBy(desc(categories.created_at))
      .limit(filter.limit)
      .offset(offset);

    return {
      rows,
      total: totalRow?.count ?? 0,
    };
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
