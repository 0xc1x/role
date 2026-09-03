import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { appStore } from '../../database/schema';

export type StoreEntry = typeof appStore.$inferSelect;

@Injectable()
export class AppStoreRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(values: typeof appStore.$inferInsert): Promise<StoreEntry> {
    const [row] = await this.db.insert(appStore).values(values).returning();
    if (!row) throw new Error('Failed to insert app_store');
    return row as StoreEntry;
  }

  async findById(id: string): Promise<StoreEntry | null> {
    const [row] = await this.db
      .select()
      .from(appStore)
      .where(and(eq(appStore.id, id), isNull(appStore.deleted_at)))
      .limit(1);
    return (row as StoreEntry) ?? null;
  }

  async updateStatus(
    id: string,
    status: StoreEntry['status'],
    extraValue?: Record<string, unknown>,
  ): Promise<StoreEntry | null> {
    const patch: Record<string, unknown> = { status, updated_at: new Date() };
    if (extraValue) {
      // merge error info into value jsonb in JS then set
      const current = await this.findById(id);
      if (current) {
        patch['value'] = { ...(current.value as object), ...extraValue };
      }
    }
    const [row] = await this.db
      .update(appStore)
      .set(patch as never)
      .where(and(eq(appStore.id, id), isNull(appStore.deleted_at)))
      .returning();
    return (row as StoreEntry) ?? null;
  }

  async softDelete(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(appStore)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(and(eq(appStore.id, id), isNull(appStore.deleted_at)))
      .returning({ id: appStore.id });
    return row != null;
  }

  async list(filter: {
    namespace?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: StoreEntry[]; total: number }> {
    const filters: SQL[] = [isNull(appStore.deleted_at)];
    if (filter.namespace) filters.push(eq(appStore.namespace, filter.namespace));
    if (filter.status) filters.push(eq(appStore.status, filter.status as never));
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await this.db.select({ c: count() }).from(appStore).where(where);
    const rows = await this.db
      .select()
      .from(appStore)
      .where(where)
      .orderBy(desc(appStore.created_at))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);
    return { rows: rows as StoreEntry[], total: Number(totalRow?.c ?? 0) };
  }
}
