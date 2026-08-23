import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { tips } from '../../database/schema';

/** Row as stored in Postgres (Date timestamps). */
export type TipRow = typeof tips.$inferSelect;

/** Insert payload for Drizzle. */
export type TipInsert = typeof tips.$inferInsert;

/** Partial update payload (never touch id / created_at here). */
export type TipUpdate = Partial<
  Pick<TipInsert, 'content' | 'active' | 'deleted_at'>
>;

export type ListTipsFilter = {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
};

export type ListTipsResult = {
  rows: TipRow[];
  total: number;
};

/**
 * DB executor: root client or an open transaction.
 * Call sites pass `tx` inside `transaction()` so reads/writes share the same connection.
 */
export type DbExecutor = Database;

@Injectable()
export class TipsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(executor: DbExecutor, values: TipInsert): Promise<TipRow> {
    const [row] = await executor.insert(tips).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert tip');
    }
    return row;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<TipRow | null> {
    const [row] = await executor
      .select()
      .from(tips)
      .where(and(eq(tips.id, id), isNull(tips.deleted_at)))
      .limit(1);
    return row ?? null;
  }

  async findRandom(): Promise<TipRow | null> {
    // ponytail: order by random() — fine at tip-table scale; swap for the
    // get_random_tip() RPC or a random-offset strategy if it grows big.
    const [row] = await this.db
      .select()
      .from(tips)
      .where(and(eq(tips.active, true), isNull(tips.deleted_at)))
      .orderBy(sql`random()`)
      .limit(1);
    return row ?? null;
  }

  async list(filter: ListTipsFilter): Promise<ListTipsResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [isNull(tips.deleted_at)];

    if (filter.active !== undefined) {
      filters.push(eq(tips.active, filter.active));
    }
    if (filter.search) {
      filters.push(ilike(tips.content, `%${filter.search}%`));
    }

    const where = and(...filters);

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(tips)
      .where(where);

    const rows = await this.db
      .select()
      .from(tips)
      .where(where)
      .orderBy(desc(tips.created_at))
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
    values: TipUpdate,
  ): Promise<TipRow | null> {
    const [row] = await executor
      .update(tips)
      .set({ ...values, updated_at: new Date() })
      .where(and(eq(tips.id, id), isNull(tips.deleted_at)))
      .returning();
    return row ?? null;
  }

  async softDelete(executor: DbExecutor, id: string): Promise<TipRow | null> {
    const now = new Date();
    const [row] = await executor
      .update(tips)
      .set({
        deleted_at: now,
        active: false,
        updated_at: now,
      })
      .where(and(eq(tips.id, id), isNull(tips.deleted_at)))
      .returning();
    return row ?? null;
  }
}
