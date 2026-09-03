import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businesses, coupons } from '../../database/schema';

/** Row as stored in Postgres (Date timestamps, numeric as string). */
export type CouponRow = typeof coupons.$inferSelect;

/** List row enriquecido con el nombre del negocio (null para cupones globales). */
export type CouponListRow = CouponRow & { business_name: string | null };

/** Insert payload for Drizzle. */
export type CouponInsert = typeof coupons.$inferInsert;

/** Partial update payload (never touch id / used_count / created_at here). */
export type CouponUpdate = Partial<
  Pick<
    CouponInsert,
    | 'code'
    | 'name'
    | 'type'
    | 'value'
    | 'min_order_amount'
    | 'max_uses'
    | 'is_active'
    | 'expires_at'
  >
>;

export type ListCouponsFilter = {
  page: number;
  limit: number;
  search?: string;
  is_active?: boolean;
  /** `true` → solo globales (business_id null); `false` → solo de negocio. */
  global?: boolean;
};

export type ListCouponsResult = {
  rows: CouponListRow[];
  total: number;
};

/**
 * DB executor: root client or an open transaction.
 * Call sites pass `tx` inside `transaction()` so reads/writes share the same connection.
 */
export type DbExecutor = Database;

@Injectable()
export class CouponsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(
    executor: DbExecutor,
    values: CouponInsert,
  ): Promise<CouponRow> {
    const [row] = await executor.insert(coupons).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert coupon');
    }
    return row;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<CouponRow | null> {
    const [row] = await executor
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Unicidad de código entre cupones globales (business_id null). Los códigos
   * de cupones de negocio pueden repetirse entre negocios por diseño: el
   * lookup de redención cas primero el del negocio y luego el global.
   */
  async findGlobalByCode(
    code: string,
    opts: { excludeId?: string } = {},
    executor: DbExecutor = this.db,
  ): Promise<CouponRow | null> {
    const filters: SQL[] = [eq(coupons.code, code), isNull(coupons.business_id)];
    if (opts.excludeId) {
      filters.push(ne(coupons.id, opts.excludeId));
    }
    const [row] = await executor
      .select()
      .from(coupons)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  }

  async list(filter: ListCouponsFilter): Promise<ListCouponsResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [];

    if (filter.is_active !== undefined) {
      filters.push(eq(coupons.is_active, filter.is_active));
    }
    if (filter.global === true) {
      filters.push(isNull(coupons.business_id));
    } else if (filter.global === false) {
      filters.push(isNotNull(coupons.business_id));
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      const searchFilter = or(
        ilike(coupons.code, term),
        ilike(coupons.name, term),
      );
      if (searchFilter) filters.push(searchFilter);
    }

    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(coupons)
      .where(where);

    const rows = await this.db
      .select({ coupon: coupons, business_name: businesses.name })
      .from(coupons)
      .leftJoin(businesses, eq(coupons.business_id, businesses.id))
      .where(where)
      // Negocio primero: los cupones de plataforma al final de la lista.
      .orderBy(asc(coupons.business_id), desc(coupons.created_at))
      .limit(filter.limit)
      .offset(offset);

    return {
      rows: rows.map((r) => ({ ...r.coupon, business_name: r.business_name })),
      total: totalRow?.count ?? 0,
    };
  }

  async update(
    executor: DbExecutor,
    id: string,
    values: CouponUpdate,
  ): Promise<CouponRow | null> {
    const [row] = await executor
      .update(coupons)
      .set({ ...values, updated_at: new Date() })
      .where(eq(coupons.id, id))
      .returning();
    return row ?? null;
  }

  /** Delete físico: `orders.coupon_id` no tiene FK y queda como referencia histórica. */
  async remove(executor: DbExecutor, id: string): Promise<CouponRow | null> {
    const [row] = await executor
      .delete(coupons)
      .where(eq(coupons.id, id))
      .returning();
    return row ?? null;
  }
}
