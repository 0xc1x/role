import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { OrderStatus } from '@0xc1x/role-commons';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessFinance,
  businessOwnership,
  businesses,
  coupons,
  orderEvents,
  offers,
  orders,
} from '../../database/schema';
import { ACTIVE_ORDER_STATUSES } from './order-status.machine';
import { couponScopeRank } from '../coupons/coupon-resolution';

export type DbExecutor = Database;

/**
 * Listado de back office: una orden + el nombre del negocio + el título y la
 * ventana de pickup de la oferta, todo en la MISMA query. El panel no puede
 * pedir el nombre del negocio fila por fila (N+1 sobre la pantalla de soporte).
 */
export type AdminOrderListRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  business_id: string;
  business_name: string | null;
  offer_id: string;
  offer_title: string;
  price: string;
  original_price: string;
  pickup_start: Date;
  pickup_end: Date;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async setEventActor(tx: DbExecutor, userId: string | null): Promise<void> {
    await tx.execute(
      sql`SELECT set_config('role.order_event_actor', ${userId ?? ''}, true)`,
    );
  }

  /**
   * Serialize every reservation attempt that carries the same
   * (user, idempotency_key) pair — espejo de
   * `pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_idempotency_key,0))`.
   *
   * Two details are load-bearing and must not be "cleaned up":
   *
   *  1. The expression is the SQL's, character for character, including the
   *     seed. `hashtextextended` is hashed by the DATABASE, so an API that
   *     hashed in JavaScript would compute a different lock id and the two
   *     producers would stop excluding each other while still behaving alike in
   *     tests that never run them against the same database.
   *  2. It is `pg_advisory_xact_lock`, taken on the transaction's connection and
   *     released at commit or rollback. A session lock would leak into the
   *     pooled connection, and a lock taken outside the transaction would leave
   *     the lookup-then-insert window open — which is the exact race the lock
   *     exists to close.
   */
  async lockIdempotencyKey(
    tx: DbExecutor,
    userId: string,
    key: string,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${key}, 0))`,
    );
  }

  /**
   * The reservation a key already produced, if any. Only meaningful after
   * `lockIdempotencyKey`, which is what makes "not found" a safe answer: the
   * partial unique index behind `orders_user_idempotency_key_unique` would
   * otherwise turn the loser of a concurrent pair into a 23505.
   */
  async findByUserAndIdempotencyKey(
    tx: DbExecutor,
    userId: string,
    key: string,
  ): Promise<typeof orders.$inferSelect | null> {
    const [row] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.user_id, userId), eq(orders.idempotency_key, key)))
      .limit(1);
    return row ?? null;
  }

  async insertOrder(
    tx: DbExecutor,
    values: typeof orders.$inferInsert,
  ): Promise<typeof orders.$inferSelect> {
    const [row] = await tx.insert(orders).values(values).returning();
    if (!row) throw new Error('Failed to insert order');
    return row;
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
        business_owner_id: businessOwnership.owner_id,
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .innerJoin(
        businessOwnership,
        eq(orders.business_id, businessOwnership.business_id),
      )
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
        business_owner_id: businessOwnership.owner_id,
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .innerJoin(
        businessOwnership,
        eq(orders.business_id, businessOwnership.business_id),
      )
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

  /**
   * Listado de back office. `stuck` = la ventana de pickup de la oferta ya
   * cerró y la orden sigue en un estado no terminal: no hay transición que la
   * cierre sola y el operador la tiene que encontrar. Comparte la definición
   * de "no terminal" con el mapper (`ACTIVE_ORDER_STATUSES`) para que el
   * filtro y la insignia de la fila no puedan discrepar.
   */
  async listForAdmin(opts: {
    status?: OrderStatus;
    businessId?: string;
    stuckOnly?: boolean;
    page: number;
    limit: number;
  }): Promise<{ items: AdminOrderListRow[]; total: number }> {
    const filters: SQL[] = [];
    if (opts.status) filters.push(eq(orders.status, opts.status));
    if (opts.businessId) filters.push(eq(orders.business_id, opts.businessId));
    if (opts.stuckOnly) {
      filters.push(lt(offers.pickup_end, sql`now()`));
      filters.push(inArray(orders.status, [...ACTIVE_ORDER_STATUSES]));
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (opts.page - 1) * opts.limit;

    const columns = {
      id: orders.id,
      order_number: orders.order_number,
      status: orders.status,
      business_id: orders.business_id,
      business_name: businesses.name,
      offer_id: orders.offer_id,
      offer_title: offers.title,
      price: orders.price,
      original_price: orders.original_price,
      pickup_start: offers.pickup_start,
      pickup_end: offers.pickup_end,
      created_at: orders.created_at,
      updated_at: orders.updated_at,
    };

    const [items, totalRow] = await Promise.all([
      this.db
        .select(columns)
        .from(orders)
        .innerJoin(offers, eq(orders.offer_id, offers.id))
        .leftJoin(businesses, eq(orders.business_id, businesses.id))
        .where(where)
        .orderBy(desc(orders.created_at))
        .limit(opts.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(orders)
        .innerJoin(offers, eq(orders.offer_id, offers.id))
        .leftJoin(businesses, eq(orders.business_id, businesses.id))
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  /**
   * The order timeline: every recorded transition, OLDEST FIRST.
   *
   * Ascending is the whole point of this endpoint — a timeline read newest-first
   * is a log, and the `id` tiebreaker keeps two transitions written in the same
   * transaction (the trigger writes them in the same clock tick) in a stable
   * order across pages, instead of letting Postgres return them arbitrarily.
   *
   * No availability or ownership filter happens here: the caller has already
   * been authorized against the order by the service.
   */
  async listEvents(
    orderId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: (typeof orderEvents.$inferSelect)[]; total: number }> {
    const where = eq(orderEvents.order_id, orderId);
    const offset = (opts.page - 1) * opts.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(orderEvents)
        .where(where)
        .orderBy(asc(orderEvents.created_at), asc(orderEvents.id))
        .limit(opts.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(orderEvents)
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
      .select({ id: businessOwnership.business_id })
      .from(businessOwnership)
      .where(
        and(
          eq(businessOwnership.business_id, businessId),
          eq(businessOwnership.owner_id, userId),
        ),
      )
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

  /** Folio diario `FD-YYYY-MMDD-NNN` desde la secuencia SQL compartida. */
  async nextOrderNumber(tx: DbExecutor): Promise<string> {
    const result = (await tx.execute(
      sql`SELECT public.generate_order_number() AS order_number`,
    )) as unknown as
      | { rows?: Array<{ order_number?: string }> }
      | Array<{ order_number: string }>;
    const row = Array.isArray(result) ? result[0] : result.rows?.[0];
    if (!row?.order_number) throw new Error('Failed to generate order number');
    return row.order_number;
  }

  /** Tarifa vigente del negocio (snapshot al crear la orden). */
  async findCommissionRate(
    tx: DbExecutor,
    businessId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ commission_rate: businessFinance.commission_rate })
      .from(businessFinance)
      .where(eq(businessFinance.business_id, businessId))
      .limit(1);
    return row?.commission_rate ?? null;
  }

  /**
   * Coupon lookup by code, locked (SELECT … FOR UPDATE) but deliberately NOT
   * narrowed by validity or scope: the caller must be able to tell
   * `not_found` apart from `inactive`, `expired` and `wrong_business`, and a
   * query that filters those away makes all four collapse into `null`.
   *
   * Ranking keeps the scope decision reproducible — own business first, then a
   * global coupon (`business_id IS NULL`), then foreign ones — so a global
   * coupon stays reachable from any business and `wrong_business` is only
   * reported when nothing else could apply. The expression is NOT written here:
   * it is `couponScopeRank`, shared with the non-locking read the checkout
   * pre-check uses, because two ranks that disagree make the pre-check approve a
   * code this reservation then rejects as `wrong_business`.
   */
  async findCouponByCodeForUpdate(
    tx: DbExecutor,
    businessId: string,
    code: string,
  ) {
    const [row] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, code))
      .orderBy(couponScopeRank(businessId))
      .for('update', { of: coupons })
      .limit(1);
    return row ?? null;
  }

  async incrementCouponUsedCount(tx: DbExecutor, couponId: string) {
    await tx
      .update(coupons)
      .set({
        used_count: sql`${coupons.used_count} + 1`,
        updated_at: sql`now()`,
      })
      .where(eq(coupons.id, couponId));
  }

  /** Espejo dormido del trigger `accrue_order_earnings` — solo con flag. */
  async accrueBusinessBalance(
    tx: DbExecutor,
    businessId: string,
    netAmount: string,
  ): Promise<void> {
    await tx
      .update(businessFinance)
      .set({ balance: sql`${businessFinance.balance} + ${netAmount}` })
      .where(eq(businessFinance.business_id, businessId));
  }
}
