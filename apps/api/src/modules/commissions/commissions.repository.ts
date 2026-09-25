import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  or,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { escapeLike } from '../../common/utils/like';
import { businesses } from '../../database/schema/businesses';
import { businessFinance } from '../../database/schema/business-companions';
import { payouts } from '../../database/schema/payouts';

/** Projection of a business row for commission management. */
export type CommissionRow = {
  id: string;
  name: string;
  slug: string;
  commission_rate: string | null;
  is_active: boolean;
  updated_at: Date;
  has_pending_payouts: boolean;
};

export type ListCommissionsFilter = {
  page: number;
  limit: number;
  search?: string;
};

export type ListCommissionsResult = {
  rows: CommissionRow[];
  total: number;
};

/** DB executor: root client or an open transaction. */
export type DbExecutor = Database;

const commissionColumns = (pendingPayoutsSql: SQL<boolean>) => ({
  id: businesses.id,
  name: businesses.name,
  slug: businesses.slug,
  commission_rate: businessFinance.commission_rate,
  is_active: businesses.is_active,
  updated_at: businesses.updated_at,
  has_pending_payouts: pendingPayoutsSql,
});

@Injectable()
export class CommissionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** SQL predicate: business has payouts in a non-final state (pending/processing). */
  private pendingPayoutsSql(businessId: SQLWrapper): SQL<boolean> {
    // ponytail: drizzle's exists() returns SQL<unknown>; cast so selections type as boolean
    return exists(
      this.db
        .select({ one: eq(payouts.business_id, payouts.business_id) })
        .from(payouts)
        .where(
          and(
            eq(payouts.business_id, businessId),
            or(eq(payouts.status, 'pending'), eq(payouts.status, 'processing')),
          ),
        ),
    ) as SQL<boolean>;
  }

  /** The commission projection: business columns joined with its finance row. */
  private commissionSelect() {
    return this.db
      .select(commissionColumns(this.pendingPayoutsSql(businesses.id)))
      .from(businesses)
      .innerJoin(
        businessFinance,
        eq(businessFinance.business_id, businesses.id),
      );
  }

  async list(filter: ListCommissionsFilter): Promise<ListCommissionsResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [];
    if (filter.search) {
      filters.push(ilike(businesses.name, `%${escapeLike(filter.search)}%`));
    }
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(businesses)
      .where(where);

    const rows = await this.commissionSelect()
      .where(where)
      .orderBy(desc(businesses.created_at))
      .limit(filter.limit)
      .offset(offset);

    return { rows, total: totalRow?.count ?? 0 };
  }

  async findById(id: string): Promise<CommissionRow | null> {
    const [row] = await this.commissionSelect()
      .where(eq(businesses.id, id))
      .limit(1);
    return row ?? null;
  }

  async hasPendingPayout(
    executor: DbExecutor,
    businessId: string,
  ): Promise<boolean> {
    const rows = await executor
      .select({ one: eq(payouts.business_id, payouts.business_id) })
      .from(payouts)
      .where(
        and(
          eq(payouts.business_id, businessId),
          or(eq(payouts.status, 'pending'), eq(payouts.status, 'processing')),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The rate lives in business_finance, so the update targets that table; the
   * projection is re-read because the business columns and the pending-payout
   * subquery cannot be part of a `returning` on the companion.
   *
   * `businesses.updated_at` moves with it: it is the `updated_at` the commission
   * DTO exposes, and it used to move on every rate change.
   */
  async updateCommissionRate(
    executor: DbExecutor,
    id: string,
    rate: number,
  ): Promise<CommissionRow | null> {
    const [updated] = await executor
      .update(businessFinance)
      .set({ commission_rate: rate.toString(), updated_at: new Date() })
      .where(eq(businessFinance.business_id, id))
      .returning({ business_id: businessFinance.business_id });
    if (!updated) return null;
    await executor
      .update(businesses)
      .set({ updated_at: new Date() })
      .where(eq(businesses.id, id));
    const [row] = await executor
      .select(commissionColumns(this.pendingPayoutsSql(businesses.id)))
      .from(businesses)
      .innerJoin(
        businessFinance,
        eq(businessFinance.business_id, businesses.id),
      )
      .where(eq(businesses.id, id))
      .limit(1);
    return row ?? null;
  }
}
