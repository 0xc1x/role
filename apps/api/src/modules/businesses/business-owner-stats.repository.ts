import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { orders } from '../../database/schema';

/** The window the aggregate is computed over, as instants. Both ends inclusive. */
export type BusinessStatsWindow = { from: Date; to: Date };

/**
 * `business_completed_orders_count`, verbatim: `count(*)` of the business's
 * `completed` orders. `::int` is the cast the money report already uses for the
 * same reason — a `bigint` reaches the driver as a string, and every caller
 * here is a number in a JSON payload.
 */
export type CompletedOrdersRow = { completed_orders: number };

/**
 * `business_sales_stats`, verbatim from the live function. `revenue` is the
 * `numeric` string Postgres sends and the rounding to money is the mapper's job,
 * as it is in `RevenueStatsMapper`; `top_products` and `daily` are the jsonb
 * documents the function builds, which Postgres returns already parsed.
 */
export type SalesStatsRow = {
  orders_count: number;
  revenue: string;
  top_products: unknown;
  daily: unknown;
};

/** One entry of `top_products`, as the jsonb carries it. */
export type TopProductStat = { name: string; sold: number; revenue: number };

/** One entry of `daily`, as the jsonb carries it. */
export type DailyStat = { day: string; orders: number; revenue: number };

/**
 * The title a period order aggregates under when its offer row is gone.
 *
 * THE LITERAL IS THE POINT. `business_sales_stats` groups by
 * `coalesce(offer.title, 'Desconocido')` over a LEFT JOIN, so an order whose
 * offer is missing lands in a bucket named by that string, and the UI has to
 * render it. A mirror that inner-joined, or that filtered those orders out,
 * would report a smaller `orders_count` and a smaller `revenue` than the SQL
 * does — and would be wrong in the direction that looks like good news.
 *
 * Worth knowing when reading the query below: with today's schema the branch is
 * NOT reachable. `orders.offer_id` is `NOT NULL REFERENCES offers(id) ON DELETE
 * CASCADE`, so deleting an offer takes its orders with it, and `offers.title` is
 * `NOT NULL` so a surviving offer always has one. The `LEFT JOIN` and the
 * `coalesce` are therefore defensive: they describe a state the foreign key
 * currently forbids. They are reproduced anyway, because (a) the mirror's job is
 * to report what the SQL reports, not what the schema permits, and (b) the day
 * that FK becomes `SET NULL` — the change that would let an order outlive the
 * offer it was placed on, the way `coupon_id` already does — this aggregate
 * starts producing real rows for it, and an inner join would quietly drop
 * revenue on that day with no test failing.
 */
const UNKNOWN_TITLE = 'Desconocido';

/** At most five products, exactly as the SQL's `limit 5` says. */
const TOP_PRODUCTS_LIMIT = 5;

/**
 * `count(*) filter (…)` / `count(*)` cast to `int`: same reason as
 * `RevenueStatsRepository.countWhere`, and the same convention this repository
 * has to keep for the aggregates nested inside the jsonb.
 */
const countInt = sql<number>`count(*)::int`;

/**
 * THE THREE MIRRORED AGGREGATES, REIMPLEMENTED IN DRIZZLE RATHER THAN CALLED AS
 * AN RPC — and the reason is worth stating, because `business_sales_stats` and
 * `business_completed_orders_count` do exist in the live database.
 *
 * The live functions carry two properties that make them safe to expose through
 * PostgREST and are both IRRELEVANT here, which is exactly why calling them
 * would be the wrong move:
 *
 *  - `business_completed_orders_count` is `SECURITY DEFINER set search_path = ''`
 *    and grants EXECUTE to `anon, authenticated, service_role`. It reads
 *    `orders`, whose RLS hides rows from everybody but the order's own parties,
 *    so the definer right is what lets a PUBLIC business profile show a
 *    completed-order count. This API is a BFF for the panel and the consumer
 *    app, not a public profile host, and it must not inherit a route whose
 *    numbers are public by construction.
 *  - The other two are `SECURITY INVOKER` and rely on the CALLER's `orders` RLS
 *    to decide what the aggregate may see. This API connects as the `postgres`
 *    pooler role, which OWNS `orders` and is exempt from every policy on it, so
 *    the same call made from here would return a merchant's whole revenue to
 *    whoever held the token — with no RLS left to stop it.
 *
 * So the aggregate is rebuilt here from the same tables, and the SAFETY moves
 * where it has to: from a function property the API does not have, to
 * `BusinessesService.assertCanViewBusiness` in front of every call. `revenue`
 * is therefore not a public number on any route in this module; it is a number
 * the owner of the business asked for.
 */
@Injectable()
export class BusinessOwnerStatsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * `business_completed_orders_count(p_business_id)`.
   *
   * `status = 'completed'` and nothing else. This is deliberately NARROWER than
   * the consumer aggregate in `MeRepository.userOrderStats`, which counts
   * everything that is not `cancelled`; the two rules are the SQL functions' own
   * and the asymmetry is preserved rather than reconciled, because a merchant's
   * "meals rescued" and a customer's "meals rescued" are different claims about
   * different rows and each client was built against its own.
   */
  async completedOrders(businessId: string): Promise<CompletedOrdersRow> {
    const [row] = await this.db
      .select({ completed_orders: countInt })
      .from(orders)
      .where(
        and(eq(orders.business_id, businessId), eq(orders.status, 'completed')),
      );
    return { completed_orders: row?.completed_orders ?? 0 };
  }

  /**
   * `business_sales_stats(p_business_id, p_from, p_to)`.
   *
   * ONE STATEMENT, because the SQL is one statement, and the statement is
   * reproduced CLAUSE BY CLAUSE rather than split into three round trips. That
   * is not a style preference: the three pieces are scalar subqueries over one
   * period CTE, so they cannot disagree about which orders are in the period.
   * Three round trips would be three chances for a row inserted between them to
   * land in one answer and not the others, and the report would add up to
   * nothing.
   *
   * Raw SQL, and the honest reason is that this function is not three queries
   * wearing a trench coat — it is a `WITH` CTE feeding three correlated
   * subqueries, and Drizzle's builder has no shape for a top-level `SELECT` with
   * no `FROM` (`db.select(...)` without `.from()` does not even return an
   * iterable). Rebuilding it out of nested builders would be longer than the
   * original and would drift from it on the next read. `EmailMarketingRepository`
   * already runs raw statements through this same `Database`, so this is an
   * established tool here, not a novelty.
   *
   * The parameters are BOUND, not interpolated, and the two timestamps are bound
   * as ISO STRINGS with an explicit `::timestamptz`: `db.execute` hands its
   * parameters straight to the driver without running them through Drizzle's
   * encoder, and postgres.js cannot bind a `Date` — it would raise
   * ERR_INVALID_ARG_TYPE on the way in. The cast is what keeps the comparison
   * against `o.created_at` a timestamptz-to-timestamptz one, so the window
   * cannot be reinterpreted in the session's zone.
   *
   * THE WINDOW IS `>= p_from AND <= p_to` — INCLUSIVE AT BOTH ENDS, because
   * those are the operators in the SQL and an order landing exactly on an edge
   * is inside the window. A half-open `[from, to)` reading would drop the last
   * order of the range and quietly shorten the final day of every report that
   * passes a midnight as `to`.
   */
  async sales(
    businessId: string,
    range: BusinessStatsWindow,
  ): Promise<SalesStatsRow> {
    const rows = await this.db.execute(sql`
      with period_orders as (
        select
          o.id, o.price, o.created_at,
          coalesce(offer.title, ${UNKNOWN_TITLE}) as title
        from orders o
        left join offers offer on offer.id = o.offer_id
        where o.business_id = ${businessId}
          and o.status = 'completed'
          and o.created_at >= ${range.from.toISOString()}::timestamptz
          and o.created_at <= ${range.to.toISOString()}::timestamptz
      )
      select
        (select count(*)::int from period_orders) as orders_count,
        (select coalesce(sum(price), 0)::numeric from period_orders) as revenue,
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object('name', t.title, 'sold', t.sold, 'revenue', t.revenue)
              order by t.sold desc, t.first_seen asc
            ),
            '[]'::jsonb
          )
          from (
            select title, count(*)::int as sold, sum(price)::numeric as revenue,
                   min(created_at) as first_seen
            from period_orders
            group by title
            order by sold desc, first_seen asc
            limit ${TOP_PRODUCTS_LIMIT}
          ) t
        ) as top_products,
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'day', to_char(d.day, 'YYYY-MM-DD'),
                'orders', d.orders,
                'revenue', d.revenue
              )
              order by d.day
            ),
            '[]'::jsonb
          )
          from (
            -- THE DAY IS BUCKETED IN UTC, EXPLICITLY. "at time zone 'UTC'"
            -- turns the timestamptz into a wall clock in UTC and ::date takes
            -- the day off THAT, where created_at::date would cast in the
            -- SESSION's TimeZone and shift the whole series by a day on every
            -- deployment not running UTC. to_char then renders the same value,
            -- so the label and the bucket cannot be two different days.
            --
            -- No backticks in these comments on purpose: the statement lives
            -- inside a JS template literal, so one would end the string.
            select (created_at at time zone 'UTC')::date as day,
                   count(*)::int as orders,
                   sum(price)::numeric as revenue
            from period_orders
            group by day
            order by day
          ) d
        ) as daily
    `);

    const row = rows[0];
    return (
      (row as SalesStatsRow | undefined) ?? {
        orders_count: 0,
        revenue: '0',
        top_products: [],
        daily: [],
      }
    );
  }
}
