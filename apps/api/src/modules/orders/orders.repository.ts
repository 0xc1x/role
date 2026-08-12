import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { OrderStatus } from '@0xc1x/role-commons';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businesses, orderEvents, orders } from '../../database/schema';
import { ACTIVE_ORDER_STATUSES } from './order-status.machine';

export type DbExecutor = Database;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insertOrder(
    tx: DbExecutor,
    values: typeof orders.$inferInsert,
  ): Promise<typeof orders.$inferSelect> {
    const [row] = await tx.insert(orders).values(values).returning();
    if (!row) throw new Error('Failed to insert order');
    return row;
  }

  async insertEvent(
    tx: DbExecutor,
    values: typeof orderEvents.$inferInsert,
  ): Promise<void> {
    await tx.insert(orderEvents).values(values);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByIdWithBusinessOwner(id: string) {
    const [row] = await this.db
      .select({
        order: orders,
        business_owner_id: businesses.owner_id,
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .where(eq(orders.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Lock the order row inside an open transaction (SELECT … FOR UPDATE). */
  async findByIdForUpdate(
    tx: DbExecutor,
    id: string,
  ): Promise<{
    order: typeof orders.$inferSelect;
    business_owner_id: string;
  } | null> {
    const [row] = await tx
      .select({
        order: orders,
        business_owner_id: businesses.owner_id,
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .where(eq(orders.id, id))
      .for('update', { of: orders })
      .limit(1);
    return row ?? null;
  }

  async listForUser(
    userId: string,
    opts: { status?: OrderStatus; page: number; limit: number },
  ) {
    const filters: SQL[] = [eq(orders.user_id, userId)];
    if (opts.status) filters.push(eq(orders.status, opts.status));
    const where = and(...filters);
    const offset = (opts.page - 1) * opts.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.created_at))
        .limit(opts.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(orders)
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  async listForBusiness(
    businessId: string,
    opts: { status?: OrderStatus; page: number; limit: number },
  ) {
    const filters: SQL[] = [eq(orders.business_id, businessId)];
    if (opts.status) filters.push(eq(orders.status, opts.status));
    const where = and(...filters);
    const offset = (opts.page - 1) * opts.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.created_at))
        .limit(opts.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(orders)
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  async updateStatus(
    tx: DbExecutor,
    id: string,
    status: OrderStatus,
    expectedCurrent?: OrderStatus,
  ): Promise<typeof orders.$inferSelect | null> {
    const filters: SQL[] = [eq(orders.id, id)];
    if (expectedCurrent) {
      filters.push(eq(orders.status, expectedCurrent));
    }
    const [row] = await tx
      .update(orders)
      .set({ status, updated_at: new Date() })
      .where(and(...filters))
      .returning();
    return row ?? null;
  }

  async isBusinessOwner(businessId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.id, businessId), eq(businesses.owner_id, userId)))
      .limit(1);
    return Boolean(row);
  }

  /**
   * Find an active (non-terminal) order for the same user + offer.
   * Enforces max 1 active order per offer/user.
   */
  async findActiveByUserAndOffer(
    tx: DbExecutor,
    userId: string,
    offerId: string,
  ): Promise<typeof orders.$inferSelect | null> {
    const [row] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.user_id, userId),
          eq(orders.offer_id, offerId),
          inArray(orders.status, [...ACTIVE_ORDER_STATUSES]),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Orders that should expire: pending/ready whose offer pickup window ended.
   * Joined against offers via offer_id; caller filters by pickup_end.
   */
  async listExpirableIds(
    tx: DbExecutor,
    offerIdsWithEndedPickup: string[],
  ): Promise<Array<typeof orders.$inferSelect>> {
    if (offerIdsWithEndedPickup.length === 0) return [];
    return tx
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.offer_id, offerIdsWithEndedPickup),
          inArray(orders.status, ['pending', 'ready_for_pickup']),
        ),
      )
      .for('update');
  }

  async listPendingOrReadyWithEndedPickup(now: Date) {
    // Deferred to service using offers repository join for pickup_end.
    void now;
    return this.db
      .select({
        order: orders,
      })
      .from(orders)
      .where(inArray(orders.status, ['pending', 'ready_for_pickup']));
  }
}
