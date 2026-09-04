import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { appConfig } from '../../database/schema';

/** Row as stored in Postgres. */
export type AppConfigRow = typeof appConfig.$inferSelect;

/** Insert payload for Drizzle. */
export type AppConfigInsert = typeof appConfig.$inferInsert;

/** Partial update payload (never touch `key` / `created_at` here). */
export type AppConfigUpdate = Partial<
  Pick<
    AppConfigInsert,
    | 'value'
    | 'value_type'
    | 'category'
    | 'label'
    | 'description'
    | 'is_public'
    | 'active'
  >
>;

export type ListAppConfigFilter = {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  active?: boolean;
};

export type ListAppConfigResult = {
  rows: AppConfigRow[];
  total: number;
};

/**
 * DB executor: root client or an open transaction.
 */
export type DbExecutor = Database;

@Injectable()
export class AppConfigRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(
    executor: DbExecutor,
    values: AppConfigInsert,
  ): Promise<AppConfigRow> {
    const [row] = await executor.insert(appConfig).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert app config');
    }
    return row;
  }

  async findByKey(
    key: string,
    executor: DbExecutor = this.db,
  ): Promise<AppConfigRow | null> {
    const [row] = await executor
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, key))
      .limit(1);
    return row ?? null;
  }

  /**
   * Lista pública: solo filas activas y públicas. Usada por landing/mobile.
   */
  async listPublic(executor: DbExecutor = this.db): Promise<AppConfigRow[]> {
    return executor
      .select()
      .from(appConfig)
      .where(and(eq(appConfig.active, true), eq(appConfig.is_public, true)))
      .orderBy(asc(appConfig.category), asc(appConfig.key));
  }

  async list(filter: ListAppConfigFilter): Promise<ListAppConfigResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [];

    if (filter.active !== undefined) {
      filters.push(eq(appConfig.active, filter.active));
    }
    if (filter.category) {
      filters.push(eq(appConfig.category, filter.category));
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      filters.push(or(ilike(appConfig.key, term), ilike(appConfig.label, term))!);
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(appConfig)
      .where(where);

    const rows = await this.db
      .select()
      .from(appConfig)
      .where(where)
      .orderBy(asc(appConfig.category), asc(appConfig.key))
      .limit(filter.limit)
      .offset(offset);

    return {
      rows,
      total: totalRow?.count ?? 0,
    };
  }

  async update(
    executor: DbExecutor,
    key: string,
    values: AppConfigUpdate,
  ): Promise<AppConfigRow | null> {
    const [row] = await executor
      .update(appConfig)
      .set({ ...values, updated_at: new Date() })
      .where(eq(appConfig.key, key))
      .returning();
    return row ?? null;
  }

  async remove(key: string): Promise<boolean> {
    const deleted = await this.db
      .delete(appConfig)
      .where(eq(appConfig.key, key))
      .returning({ key: appConfig.key });
    return deleted.length > 0;
  }
}
