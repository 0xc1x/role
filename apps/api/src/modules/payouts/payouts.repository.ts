import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businesses } from '../../database/schema/businesses';
import { payouts } from '../../database/schema/payouts';

export type PayoutRow = typeof payouts.$inferSelect;
export type PayoutRowWithBusiness = PayoutRow & {
  business_name?: string | null;
};

@Injectable()
export class PayoutsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(opts: {
    page: number;
    limit: number;
    business_id?: string;
    status?: string;
  }) {
    const offset = (opts.page - 1) * opts.limit;
    const conds = [];
    if (opts.business_id) conds.push(eq(payouts.business_id, opts.business_id));
    if (opts.status) conds.push(eq(payouts.status, opts.status as never));
    const where = conds.length ? and(...conds) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(payouts)
      .where(where);
    const rows = await this.db
      .select({ payout: payouts, business_name: businesses.name })
      .from(payouts)
      .leftJoin(businesses, eq(payouts.business_id, businesses.id))
      .where(where)
      .orderBy(desc(payouts.created_at))
      .limit(opts.limit)
      .offset(offset);
    const mapped: PayoutRowWithBusiness[] = rows.map((r) => ({
      ...r.payout,
      business_name: r.business_name ?? null,
    }));
    return { rows: mapped, total: totalRow?.count ?? 0 };
  }

  async findById(id: string): Promise<PayoutRowWithBusiness | null> {
    const [row] = await this.db
      .select({ payout: payouts, business_name: businesses.name })
      .from(payouts)
      .leftJoin(businesses, eq(payouts.business_id, businesses.id))
      .where(eq(payouts.id, id))
      .limit(1);
    if (!row) return null;
    return { ...row.payout, business_name: row.business_name ?? null };
  }

  async markPaid(id: string): Promise<PayoutRow | null> {
    const [row] = await this.db
      .update(payouts)
      .set({ status: 'paid', paid_at: new Date(), updated_at: new Date() })
      .where(eq(payouts.id, id))
      .returning();
    return row ?? null;
  }

  async generate(): Promise<number> {
    // ponytail: drizzle pg driver returns {rows} or array depending on version — handle both
    const res = (await this.db.execute(
      sql`select public.generate_payouts() as n`,
    )) as unknown as { rows: { n: number }[] } | { n: number }[];
    const rows = Array.isArray(res) ? res : res.rows;
    const raw = rows?.[0]?.n;
    return typeof raw === 'number' ? raw : Number(raw ?? 0);
  }
}
