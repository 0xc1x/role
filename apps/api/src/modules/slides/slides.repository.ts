import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, ne, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { slides } from '../../database/schema';

/** Row as stored in Postgres (Date timestamps). */
export type SlideRow = typeof slides.$inferSelect;

/** Insert payload for Drizzle. */
export type SlideInsert = typeof slides.$inferInsert;

/** Partial update payload (never touch id / created_at here). */
export type SlideUpdate = Partial<
  Pick<
    SlideInsert,
    | 'title'
    | 'caption'
    | 'badge_text'
    | 'cta_label'
    | 'image_url'
    | 'text_color'
    | 'button_color'
    | 'type'
    | 'priority'
    | 'active'
    | 'redirect_url'
    | 'deleted_at'
    | 'start_at'
    | 'end_at'
  >
>;

export type ListSlidesFilter = {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
};

export type ListSlidesResult = {
  rows: SlideRow[];
  total: number;
};

/**
 * DB executor: root client or an open transaction.
 * Call sites pass `tx` inside `transaction()` so reads/writes share the same connection.
 */
export type DbExecutor = Database;

@Injectable()
export class SlidesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(executor: DbExecutor, values: SlideInsert): Promise<SlideRow> {
    const [row] = await executor.insert(slides).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert category');
    }
    return row;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<SlideRow | null> {
    const [row] = await executor
      .select()
      .from(slides)
      .where(and(eq(slides.id, id), isNull(slides.deleted_at)))
      .limit(1);
    return row ?? null;
  }

  async findByTitle(
    title: string,
    opts: { excludeId?: string } = {},
    executor: DbExecutor = this.db,
  ): Promise<SlideRow | null> {
    const filters: SQL[] = [eq(slides.title, title), isNull(slides.deleted_at)];
    if (opts.excludeId) {
      filters.push(ne(slides.id, opts.excludeId));
    }
    const [row] = await executor
      .select()
      .from(slides)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  }

  async list(filter: ListSlidesFilter): Promise<ListSlidesResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [isNull(slides.deleted_at)];

    if (filter.active !== undefined) {
      filters.push(eq(slides.active, filter.active));
    }
    if (filter.search) {
      filters.push(ilike(slides.title, `%${filter.search}%`));
    }

    const where = and(...filters);

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(slides)
      .where(where);

    const rows = await this.db
      .select()
      .from(slides)
      .where(where)
      .orderBy(desc(slides.created_at))
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
    values: SlideUpdate,
  ): Promise<SlideRow | null> {
    const [row] = await executor
      .update(slides)
      .set({ ...values, updated_at: new Date() })
      .where(and(eq(slides.id, id), isNull(slides.deleted_at)))
      .returning();
    return row ?? null;
  }

  async softDelete(executor: DbExecutor, id: string): Promise<SlideRow | null> {
    const now = new Date();
    const [row] = await executor
      .update(slides)
      .set({
        deleted_at: now,
        active: false,
        updated_at: now,
      })
      .where(and(eq(slides.id, id), isNull(slides.deleted_at)))
      .returning();
    return row ?? null;
  }
}
