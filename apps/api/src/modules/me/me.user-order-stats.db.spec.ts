import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { orders } from '../../database/schema';
import type { AuthUser } from '../../auth/auth.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';

let ctx: TestDbContext;
let service: MeService;

let userId: string;
let offerId: string;
let businessId: string;

const authUser = (id: string) =>
  ({ id, email: `${id}@t.cl`, role: 'user' }) as AuthUser;

/** An order with explicit money, because the whole point is `price` vs `original`. */
async function orderWith(opts: {
  status: string;
  price: string;
  originalPrice: string;
}) {
  const [row] = await ctx.db
    .insert(orders)
    .values({
      user_id: userId,
      offer_id: offerId,
      business_id: businessId,
      order_number: `S-${crypto.randomUUID().slice(0, 8)}`,
      status: opts.status as never,
      price: opts.price,
      original_price: opts.originalPrice,
      pickup_code: 'ABC123',
    })
    .returning({ id: orders.id });
  if (!row) throw new Error('no se pudo insertar la orden');
  return row;
}

beforeAll(async () => {
  ctx = await createTestDb();
  service = new MeService(
    new MeRepository(ctx.db),
    new CategoriesRepository(ctx.db),
  );
  const owner = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, owner)).id;
  offerId = (
    await seedOffer(
      ctx.db,
      businessId,
      (await seedLocation(ctx.db, businessId)).id,
    )
  ).id;
  userId = await seedProfile(ctx.db);
});

afterAll(async () => {
  await ctx?.stop();
});

describe('user_order_stats (DB real)', () => {
  test('counts EVERY order that is not cancelled, and only cancelled is excluded', async () => {
    // THE RULE THIS FUNCTION HAS, and the one it does NOT share with the two
    // business aggregates. Those count `completed`; this counts "not cancelled",
    // so a pending, picked-up or expired order counts here and a cancelled one
    // never does. Pinned with a mixed set because the difference is invisible in
    // a suite that only ever writes completed orders.
    await orderWith({
      status: 'completed',
      price: '30.00',
      originalPrice: '50.00',
    });
    await orderWith({
      status: 'completed',
      price: '20.00',
      originalPrice: '40.00',
    });
    await orderWith({
      status: 'cancelled',
      price: '10.00',
      originalPrice: '10.00',
    });
    await orderWith({
      status: 'pending',
      price: '5.00',
      originalPrice: '15.00',
    });

    const answer = await service.getOrderStats(authUser(userId));

    // 4 orders, 1 cancelled → 3. A `status = 'completed'` mirror would say 2.
    expect(answer.order_stats.orders_count).toBe(3);
  });

  test('total_saved is the sum of original_price - price over the SAME orders', async () => {
    const answer = await service.getOrderStats(authUser(userId));

    // 20 + 20 + 10, and NOT the 5.00 of the cancelled order. The cancelled order
    // is the interesting one: it would have contributed a saving, and the SQL
    // excludes it from BOTH halves — the count and the money — so the two numbers
    // always describe the same set of rows.
    expect(answer.order_stats.total_saved).toBe(50);
  });

  test("another account sees nothing of this one's orders", async () => {
    // The repository's `where user_id = $1` is the entire access control here:
    // this connection owns `orders` and is exempt from every RLS policy on it, so
    // the SQL function's parameter discipline has no equivalent behind it.
    const stranger = await seedProfile(ctx.db);
    const answer = await service.getOrderStats(authUser(stranger));

    expect(answer.order_stats.orders_count).toBe(0);
    expect(answer.order_stats.total_saved).toBe(0);
  });

  test('an account with no orders reads as zeroes, not undefined', async () => {
    const empty = await seedProfile(ctx.db);
    const answer = await service.getOrderStats(authUser(empty));

    expect(answer.order_stats.orders_count).toBe(0);
    expect(answer.order_stats.total_saved).toBe(0);
    expect(Number.isNaN(answer.order_stats.total_saved)).toBe(false);
  });

  test('a cancelled order that was never completed still does not count', async () => {
    // The exact state the rule is about, isolated: not completed, cancelled. The
    // business aggregates would ignore it twice over (not completed); this one
    // excludes it once, on `cancelled`. Both end at zero for this order, and the
    // reason is stated so a future "fix" cannot quietly change one side.
    const solo = await seedProfile(ctx.db);
    const before = await service.getOrderStats(authUser(solo));

    await ctx.db.insert(orders).values({
      user_id: solo,
      offer_id: offerId,
      business_id: businessId,
      order_number: `S-${crypto.randomUUID().slice(0, 8)}`,
      status: 'cancelled' as never,
      price: '99.00',
      original_price: '199.00',
      pickup_code: 'ABC123',
    });

    const after = await service.getOrderStats(authUser(solo));
    expect(after.order_stats.orders_count).toBe(
      before.order_stats.orders_count,
    );
    expect(after.order_stats.total_saved).toBe(before.order_stats.total_saved);
  });
});
