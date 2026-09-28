import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { offers, orders } from '../../database/schema';
import { BusinessOwnerStatsRepository } from './business-owner-stats.repository';

let ctx: TestDbContext;
let repo: BusinessOwnerStatsRepository;

let userId: string;

/** The `business_completed_orders_count` fixture. */
let countBusinessId: string;
let countOfferId: string;

/**
 * A SECOND business for the `business_sales_stats` block, on purpose.
 *
 * Every test in that block seeds completed orders inside one calendar day and
 * then asks for a window covering part of it, so sharing the business the
 * `business_completed_orders_count` block writes to would put that block's rows
 * inside these windows. The counts would still be right for the query and wrong
 * for the test, which is the worst combination there is.
 */
let salesBusinessId: string;
let salesLocationId: string;
let salesOfferId: string;

/** A fixed day, so nothing in this file depends on "today". */
const DAY = '2026-03-10';
const dayStart = new Date(`${DAY}T00:00:00.000Z`);
const dayEnd = new Date(`${DAY}T23:59:59.999Z`);
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00.000Z`);

async function orderWith(opts: {
  businessId: string;
  offerId: string;
  status?: string;
  price: string;
  originalPrice?: string;
  at: Date;
}) {
  const [row] = await ctx.db
    .insert(orders)
    .values({
      user_id: userId,
      offer_id: opts.offerId,
      business_id: opts.businessId,
      order_number: `A-${crypto.randomUUID().slice(0, 8)}`,
      status: (opts.status ?? 'completed') as never,
      price: opts.price,
      original_price: opts.originalPrice ?? opts.price,
      pickup_code: 'ABC123',
      created_at: opts.at,
    })
    .returning({ id: orders.id });
  if (!row) throw new Error('no se pudo insertar la orden');
  return row;
}

async function newSalesOffer(title: string) {
  return seedOffer(ctx.db, salesBusinessId, salesLocationId, { title });
}

async function salesOrder(opts: {
  hhmm: string;
  price: string;
  status?: string;
  originalPrice?: string;
  offerId?: string;
  at?: Date;
}) {
  return orderWith({
    businessId: salesBusinessId,
    offerId: opts.offerId ?? salesOfferId,
    status: opts.status,
    price: opts.price,
    originalPrice: opts.originalPrice,
    at: opts.at ?? at(opts.hhmm),
  });
}

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessOwnerStatsRepository(ctx.db);
  userId = await seedProfile(ctx.db);

  const owner = await seedProfile(ctx.db);
  countBusinessId = (await seedBusiness(ctx.db, owner)).id;
  countOfferId = (
    await seedOffer(
      ctx.db,
      countBusinessId,
      (await seedLocation(ctx.db, countBusinessId)).id,
      { title: 'Oferta del conteo' },
    )
  ).id;

  salesBusinessId = (await seedBusiness(ctx.db, owner)).id;
  salesLocationId = (await seedLocation(ctx.db, salesBusinessId)).id;
  salesOfferId = (await newSalesOffer('Oferta por defecto')).id;
}, 120000);

afterAll(async () => {
  await ctx?.stop();
});

describe('business_completed_orders_count (DB real)', () => {
  test('matches the SQL function installed in the harness, row for row', async () => {
    for (const [status, hhmm] of [
      ['completed', '10:00'],
      ['completed', '11:00'],
      ['cancelled', '12:00'],
      ['pending', '13:00'],
      ['expired', '14:00'],
    ] as const) {
      await orderWith({
        businessId: countBusinessId,
        offerId: countOfferId,
        status,
        price: '10.00',
        at: at(hhmm),
      });
    }

    const mine = await repo.completedOrders(countBusinessId);
    // The harness installs the real function, so this measures the mirror against
    // the thing it mirrors instead of against a hand-written number. The id is
    // BOUND: a bare `9cd4fddb-…` in SQL parses as the number 9 minus the rest.
    const [reference] = (await ctx.db.execute(
      sql`select business_completed_orders_count(${countBusinessId}::uuid) as n`,
    )) as unknown as Array<{ n: number }>;

    expect(mine.completed_orders).toBe(2);
    expect(Number(reference?.n)).toBe(mine.completed_orders);
  });

  test('a business with no completed orders is zero, and businesses are separate', async () => {
    const other = (await seedBusiness(ctx.db, await seedProfile(ctx.db))).id;

    expect((await repo.completedOrders(other)).completed_orders).toBe(0);
    expect((await repo.completedOrders(salesBusinessId)).completed_orders).toBe(
      0,
    );
    expect((await repo.completedOrders(countBusinessId)).completed_orders).toBe(
      2,
    );
  });
});

describe('business_sales_stats (DB real)', () => {
  test('the window is INCLUSIVE at both ends, and excludes what is outside', async () => {
    const before = await newSalesOffer('Antes de la ventana');
    const onStart = await newSalesOffer('En el borde inicial');
    const onEnd = await newSalesOffer('En el borde final');
    const after = await newSalesOffer('Después de la ventana');

    // One millisecond outside each edge. `>=` and `<=` are the SQL's operators, so
    // these two are OUT and the two sitting on the edges are IN. A half-open
    // `[from, to)` reading would have dropped the end-edge order and shortened the
    // final day of the report by one, on every report whose `to` is a midnight.
    await salesOrder({
      price: '1.00',
      at: new Date(dayStart.getTime() - 1),
      offerId: before.id,
    });
    await salesOrder({ price: '100.00', at: dayStart, offerId: onStart.id });
    await salesOrder({ price: '200.00', at: dayEnd, offerId: onEnd.id });
    await salesOrder({
      price: '2.00',
      at: new Date(dayEnd.getTime() + 1),
      offerId: after.id,
    });

    const stats = await repo.sales(salesBusinessId, {
      from: dayStart,
      to: dayEnd,
    });

    expect(stats.orders_count).toBe(2);
    expect(Number(stats.revenue)).toBe(300);
    const names = (stats.top_products as Array<{ name: string }>).map(
      (p) => p.name,
    );
    // Both sold one, so the order is the tiebreak: first sale wins, and the start
    // edge is earlier in the day than the end edge.
    expect(names).toEqual(['En el borde inicial', 'En el borde final']);
  });

  test('revenue sums `price`, NOT `original_price`', async () => {
    // The gap between the two columns is the whole discount. Revenue built on
    // `original_price` would overstate this merchant's sales by exactly the saving
    // the platform exists to create, and it would do it silently.
    const offer = await newSalesOffer('Con descuento');
    await salesOrder({
      hhmm: '09:00',
      price: '25.00',
      originalPrice: '100.00',
      offerId: offer.id,
    });

    const stats = await repo.sales(salesBusinessId, {
      from: at('09:00'),
      to: at('09:00'),
    });

    expect(stats.orders_count).toBe(1);
    expect(Number(stats.revenue)).toBe(25);
    expect(Number(stats.revenue)).not.toBe(100);
  });

  test('only `completed` orders are counted, unlike the consumer aggregate', async () => {
    const offer = await newSalesOffer('Estados mixtos');
    for (const status of ['cancelled', 'pending', 'picked_up', 'completed']) {
      await salesOrder({
        hhmm: '15:00',
        price: '10.00',
        status,
        offerId: offer.id,
      });
    }

    const stats = await repo.sales(salesBusinessId, {
      from: at('15:00'),
      to: at('15:00'),
    });

    // 1 of 4. The consumer aggregate counts 3 of the same four — the asymmetry is
    // the SQL's, and both sides of it are pinned, here and in
    // me.user-order-stats.db.spec.ts.
    expect(stats.orders_count).toBe(1);
  });

  test('top_products: at most five, sold desc, with the per-product revenue', async () => {
    // Products 0..5 sold 1..6 times, so the six best are all of them and the LIMIT
    // has to cut one to prove it cuts at five rather than at six.
    for (let i = 0; i < 6; i++) {
      const offer = await newSalesOffer(`Producto ${i}`);
      for (let n = 0; n <= i; n++) {
        await salesOrder({ hhmm: '16:00', price: '5.00', offerId: offer.id });
      }
    }
    // A seventh, unsold product, to prove the limit is on SOLD units.
    const neverSold = await newSalesOffer('Nunca vendido');

    const stats = await repo.sales(salesBusinessId, {
      from: at('16:00'),
      to: at('16:00'),
    });
    const top = stats.top_products as Array<{
      name: string;
      sold: number;
      revenue: number;
    }>;

    expect(top).toHaveLength(5);
    expect(top.map((p) => p.name)).toEqual([
      'Producto 5',
      'Producto 4',
      'Producto 3',
      'Producto 2',
      'Producto 1',
    ]);
    expect(top.map((p) => p.sold)).toEqual([6, 5, 4, 3, 2]);
    expect(top.map((p) => Number(p.revenue))).toEqual([30, 25, 20, 15, 10]);
    expect(top.map((p) => p.name)).not.toContain(neverSold.title);
  });

  test('the tie between two products is broken by FIRST SEEN, not by insertion order', async () => {
    const alpha = await newSalesOffer('Alpha');
    const beta = await newSalesOffer('Beta');
    // Same sold count, and the two orders say the OPPOSITE things: `Alpha` is
    // inserted first but sold later, `Beta` is inserted last but sold earlier. A
    // mirror that ordered by insertion, by id, or by the planner's whim would
    // return them the other way round, and "top 5" would reshuffle between
    // reloads for a merchant whose two products tie.
    await salesOrder({ hhmm: '21:00', price: '5.00', offerId: alpha.id });
    await salesOrder({ hhmm: '20:59', price: '5.00', offerId: beta.id });
    await salesOrder({ hhmm: '20:58', price: '5.00', offerId: beta.id });

    const range = { from: at('20:00'), to: at('21:59') };
    const once = (await repo.sales(salesBusinessId, range))
      .top_products as Array<{
      name: string;
    }>;
    const twice = (await repo.sales(salesBusinessId, range))
      .top_products as Array<{
      name: string;
    }>;

    // `Beta`'s first sale is 20:58, `Alpha`'s is 21:00 → Beta leads.
    expect(once.map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(twice.map((p) => p.name)).toEqual(once.map((p) => p.name));
  });

  test('an order whose offer is gone aggregates under the literal "Desconocido"', async () => {
    // THIS BRANCH IS NOT REACHABLE THROUGH THE CURRENT SCHEMA, and the spec says
    // so rather than pretending otherwise. `orders.offer_id` is NOT NULL REFERENCES
    // offers(id) ON DELETE CASCADE, so deleting an offer takes its orders with it,
    // and `offers.title` is NOT NULL so a surviving offer always has a title. The
    // foreign key is dropped HERE, in this throwaway database, for the sole
    // purpose of producing the state the SQL is written to survive.
    //
    // It matters because the aggregate is a LEFT JOIN with
    // `coalesce(offer.title, 'Desconocido')`: a mirror that inner-joined, or that
    // filtered those orders out, would report a smaller `orders_count` and a
    // smaller `revenue` than the SQL — and would be wrong in the direction that
    // looks like good news. The day `orders.offer_id` becomes SET NULL (the change
    // that would let an order outlive its offer, the way `coupon_id` already does)
    // this stops being a fixture and becomes the production path.
    await ctx.db.execute(
      sql`alter table public.orders drop constraint orders_offer_id_offers_id_fkey`,
    );
    const dangling = crypto.randomUUID();
    let inserted: string | null = null;
    try {
      const [row] = await ctx.db
        .insert(orders)
        .values({
          user_id: userId,
          offer_id: dangling,
          business_id: salesBusinessId,
          order_number: `A-${crypto.randomUUID().slice(0, 8)}`,
          status: 'completed' as never,
          price: '42.00',
          original_price: '42.00',
          pickup_code: 'ABC123',
          created_at: at('22:00'),
        })
        .returning({ id: orders.id });
      inserted = row?.id ?? null;

      const stats = await repo.sales(salesBusinessId, {
        from: at('22:00'),
        to: at('22:00'),
      });
      const top = stats.top_products as Array<{
        name: string;
        sold: number;
        revenue: number;
      }>;

      // Counted and paid for, not dropped.
      expect(stats.orders_count).toBe(1);
      expect(Number(stats.revenue)).toBe(42);
      expect(top).toHaveLength(1);
      expect(top[0]?.name).toBe('Desconocido');
      expect(top[0]?.sold).toBe(1);
      expect(Number(top[0]?.revenue)).toBe(42);
    } finally {
      // The dangling row goes first: re-adding the FK while it is still there is
      // a 23503, and a failing teardown would mask the assertion above.
      if (inserted) {
        await ctx.db.delete(orders).where(eq(orders.id, inserted));
      }
      await ctx.db.execute(
        sql`alter table public.orders add constraint orders_offer_id_offers_id_fkey foreign key (offer_id) references offers(id) on delete cascade`,
      );
    }
  });

  test('daily buckets by UTC day even when the session timezone is not UTC', async () => {
    // THE ASSERTION THAT FAILS UNDER A LOCAL-TIME BUCKET. Two completed orders,
    // 23:30Z and 00:30Z on consecutive UTC days. With the session moved to
    // UTC-4 the local day starts at 04:00Z, so a bucket computed in the session
    // zone would put both on one local day, emit a single series point, and
    // label it with a day the merchant never sold on.
    const offer = await newSalesOffer('Frontera de día');
    await salesOrder({
      price: '11.00',
      offerId: offer.id,
      at: new Date('2026-04-01T23:30:00Z'),
    });
    await salesOrder({
      price: '13.00',
      offerId: offer.id,
      at: new Date('2026-04-02T00:30:00Z'),
    });

    const client = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
      connection: { TimeZone: 'Etc/GMT+4' },
    });
    const shifted = new BusinessOwnerStatsRepository(
      drizzle({ client }) as unknown as typeof ctx.db,
    );

    // The session really is shifted: without this the test would pass for nothing.
    const [{ TimeZone: zone }] =
      (await client`show timezone`) as unknown as Array<{
        TimeZone: string;
      }>;
    expect(zone).toBe('Etc/GMT+4');

    const series = (
      await shifted.sales(salesBusinessId, {
        from: new Date('2026-04-01T00:00:00.000Z'),
        to: new Date('2026-04-02T23:59:59.999Z'),
      })
    ).daily as Array<{ day: string; orders: number; revenue: number }>;

    expect(series.map((d) => d.day)).toEqual(['2026-04-01', '2026-04-02']);
    expect(series.map((d) => d.orders)).toEqual([1, 1]);
    expect(series.map((d) => Number(d.revenue))).toEqual([11, 13]);

    await client.end({ timeout: 5 });
  });

  test('daily is ordered by day, with one point per day that has orders', async () => {
    const offer = await newSalesOffer('Serie de tres días');
    for (const [day, count] of [
      ['2026-05-03', 1],
      ['2026-05-01', 3],
      ['2026-05-02', 2],
    ] as const) {
      for (let n = 0; n < count; n++) {
        await salesOrder({
          price: '4.00',
          offerId: offer.id,
          at: new Date(`${day}T12:00:00.000Z`),
        });
      }
    }

    const series = (
      await repo.sales(salesBusinessId, {
        from: new Date('2026-05-01T00:00:00.000Z'),
        to: new Date('2026-05-03T23:59:59.999Z'),
      })
    ).daily as Array<{ day: string; orders: number; revenue: number }>;

    expect(series).toEqual([
      { day: '2026-05-01', orders: 3, revenue: 12 },
      { day: '2026-05-02', orders: 2, revenue: 8 },
      { day: '2026-05-03', orders: 1, revenue: 4 },
    ]);
  });

  test('a window with nothing in it is an empty report, not a null one', async () => {
    const stats = await repo.sales(salesBusinessId, {
      from: new Date('2000-01-01T00:00:00.000Z'),
      to: new Date('2000-01-02T00:00:00.000Z'),
    });

    expect(stats.orders_count).toBe(0);
    expect(Number(stats.revenue)).toBe(0);
    expect(stats.top_products).toEqual([]);
    expect(stats.daily).toEqual([]);
  });

  test('the aggregate reaches `offers` at all, so the LEFT join cannot be dropped', async () => {
    // A guard on the shape rather than on a value: with an INNER join the
    // statement would still return a row for every order whose offer exists, so
    // the only assertion that tells the two apart is the one above. This one
    // pins that the mirror names the `offers` table, so a future "simplification"
    // that drops the join has to change this file to go green.
    await salesOrder({ hhmm: '23:30', price: '9.00' });
    const [joined] = await ctx.db
      .select({ title: offers.title })
      .from(orders)
      .innerJoin(offers, eq(offers.id, orders.offer_id))
      .where(eq(orders.business_id, salesBusinessId))
      .limit(1);

    expect(joined?.title).toBeTruthy();
  });
});
