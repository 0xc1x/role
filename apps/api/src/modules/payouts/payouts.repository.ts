import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businesses } from '../../database/schema/businesses';
import { orders } from '../../database/schema/orders';
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

  /**
   * Espejo del cron SQL `generate_payouts` (ADR-0008): agrupa órdenes
   * completed sin payout por negocio, crea payout pending, backfillea fee/net
   * legacy y recalcula el balance. Mismo comportamiento, mismo orden.
   */
  async generate(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const groups = await tx
        .select({
          businessId: orders.business_id,
          gross: sql<string>`sum(${orders.price})`,
          // deriva fee si platform_fee es 0 por legacy: round(price * commission_rate)
          fee: sql<string>`sum(case when ${orders.platform_fee} = 0 and ${orders.commission_rate} > 0 then round(${orders.price} * ${orders.commission_rate}, 2) else ${orders.platform_fee} end)`,
          periodStart: sql<string>`min(${orders.created_at})::date`,
        })
        .from(orders)
        .where(and(eq(orders.status, 'completed'), isNull(orders.payout_id)))
        .groupBy(orders.business_id);

      let created = 0;

      for (const g of groups) {
        const gross = Number(g.gross);
        const fee = Number(g.fee);
        const net = gross - fee;

        const [payout] = await tx
          .insert(payouts)
          .values({
            business_id: g.businessId,
            period_start: g.periodStart,
            period_end: sql`current_date`,
            gross_amount: String(gross),
            platform_fee: String(fee),
            net_amount: String(net),
            status: 'pending',
          })
          .returning({ id: payouts.id });
        if (!payout) continue;

        await tx
          .update(orders)
          .set({
            payout_id: payout.id,
            // backfill legacy fee/net para consistencia futura
            platform_fee: sql`case when ${orders.platform_fee} = 0 and ${orders.commission_rate} > 0 then round(${orders.price} * ${orders.commission_rate}, 2) else ${orders.platform_fee} end`,
            net_amount: sql`${orders.price} - case when ${orders.platform_fee} = 0 and ${orders.commission_rate} > 0 then round(${orders.price} * ${orders.commission_rate}, 2) else ${orders.platform_fee} end`,
          })
          .where(
            and(
              eq(orders.business_id, g.businessId),
              eq(orders.status, 'completed'),
              isNull(orders.payout_id),
            ),
          );

        await tx
          .update(businesses)
          .set({
            balance: sql`coalesce((select sum(o.net_amount) from ${orders} o where o.business_id = ${businesses.id} and o.status = 'completed' and o.payout_id is null), 0)`,
          })
          .where(eq(businesses.id, g.businessId));

        created += 1;
      }

      return created;
    });
  }
}
