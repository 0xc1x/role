import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../../auth/auth.types';
import type { Env } from '../../config/env.schema';
import { coupons, offers, orders } from '../../database/schema';
import { OffersRepository } from '../offers/offers.repository';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/**
 * The idempotency half of `POST /orders`, against a real Postgres.
 *
 * Real database, not a mock, because the thing under test IS a lock: the
 * sequential retries below only prove the lookup, and only a second connection
 * blocked on an advisory lock proves the part that keeps two concurrent
 * requests from becoming two reservations. A mocked `pg_advisory_xact_lock`
 * would assert that the code calls a function, not that the call excludes
 * anybody.
 *
 * The lock the service takes is `hashtextextended(user_id || ':' || key, 0)`,
 * the expression the live `reserve_offer` uses, so the gate in the concurrency
 * test can hold the very same lock the SQL would hold.
 */
let ctx: TestDbContext;
let service: OrdersService;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new OrdersService(
    new OrdersRepository(ctx.db),
    new OffersRepository(ctx.db),
    // Flags off, the production default: the notification path stays dormant
    // and this spec only measures the reservation.
    { get: () => false } as unknown as ConfigService<Env, true>,
  );
});

afterAll(async () => {
  await ctx.stop();
});

const authUser = (id: string) =>
  ({ id, email: `${id}@t.cl`, role: 'user' }) as AuthUser;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A consumer, a business and one reservable offer, all isolated per test. */
async function scenario(offerOverrides: { stock?: number } = {}) {
  const userId = await seedProfile(ctx.db);
  const ownerId = await seedProfile(ctx.db);
  const business = await seedBusiness(ctx.db, ownerId);
  const location = await seedLocation(ctx.db, business.id);
  const offer = await seedOffer(ctx.db, business.id, location.id, {
    stock: 5,
    ...offerOverrides,
  });
  return { userId, businessId: business.id, offerId: offer.id };
}

async function seedCoupon(
  businessId: string | null,
  code: string,
  overrides: { value?: string; is_active?: boolean } = {},
) {
  const [row] = await ctx.db
    .insert(coupons)
    .values({
      business_id: businessId,
      code,
      name: code,
      type: 'fixed',
      value: overrides.value ?? '500',
      is_active: overrides.is_active ?? true,
    })
    .returning();
  if (!row) throw new Error('seedCoupon failed');
  return row;
}

const ordersOf = (userId: string) =>
  ctx.db.select().from(orders).where(eq(orders.user_id, userId));

const stockOf = async (offerId: string) => {
  const [row] = await ctx.db
    .select({ stock: offers.stock })
    .from(offers)
    .where(eq(offers.id, offerId));
  return row?.stock ?? null;
};

const usedCountOf = async (couponId: string) => {
  const [row] = await ctx.db
    .select({ used_count: coupons.used_count })
    .from(coupons)
    .where(eq(coupons.id, couponId));
  return row?.used_count ?? null;
};

describe('OrdersService.create idempotency (DB real)', () => {
  test('the same key twice returns the original order and reserves once', async () => {
    const { userId, businessId, offerId } = await scenario();
    const coupon = await seedCoupon(businessId, 'IDEM10');
    const user = authUser(userId);
    const body = {
      offer_id: offerId,
      coupon_code: 'IDEM10',
      idempotency_key: 'retry-1',
    };

    const first = await service.create(user, body);
    const second = await service.create(user, body);

    // Same reservation, not a new one: same row, same folio, same pickup code.
    // A fresh reservation would mint a new `pickup_code` every time.
    expect(second.replayed).toBe(true);
    expect(first.replayed).toBe(false);
    expect(second.order).toEqual(first.order);

    expect(await ordersOf(userId)).toHaveLength(1);
    expect(await stockOf(offerId)).toBe(4);
    // The coupon is spent once. Counting it twice is the other half of the bug:
    // a discount the user burns on a request that was only a retry.
    expect(await usedCountOf(coupon.id)).toBe(1);
  });

  test('the key is persisted, so the next producer can find it', async () => {
    const { userId, offerId } = await scenario();

    await service.create(authUser(userId), {
      offer_id: offerId,
      idempotency_key: 'persisted-1',
    });

    const [row] = await ordersOf(userId);
    expect(row?.idempotency_key).toBe('persisted-1');
  });

  test('the same key with a different offer is IDEMPOTENCY_KEY_REUSED', async () => {
    const { userId, businessId, offerId } = await scenario();
    const otherLocation = await seedLocation(ctx.db, businessId);
    const otherOffer = await seedOffer(ctx.db, businessId, otherLocation.id);
    const user = authUser(userId);

    await service.create(user, {
      offer_id: offerId,
      idempotency_key: 'shared-key',
    });

    await expect(
      service.create(user, {
        offer_id: otherOffer.id,
        idempotency_key: 'shared-key',
      }),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');

    // The rejected attempt reserved nothing.
    expect(await ordersOf(userId)).toHaveLength(1);
    expect(await stockOf(otherOffer.id)).toBe(5);
  });

  test('the same key with a different coupon is IDEMPOTENCY_KEY_REUSED', async () => {
    const { userId, businessId, offerId } = await scenario();
    const first = await seedCoupon(businessId, 'COUPON-A');
    const second = await seedCoupon(businessId, 'COUPON-B');
    const user = authUser(userId);

    await service.create(user, {
      offer_id: offerId,
      coupon_code: 'COUPON-A',
      idempotency_key: 'shared-key',
    });

    await expect(
      service.create(user, {
        offer_id: offerId,
        coupon_code: 'COUPON-B',
        idempotency_key: 'shared-key',
      }),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');

    expect(await ordersOf(userId)).toHaveLength(1);
    // The rejected attempt did not spend the second coupon either.
    expect(await usedCountOf(first.id)).toBe(1);
    expect(await usedCountOf(second.id)).toBe(0);
  });

  test('a coupon added to a replayed key is a conflict, not a re-price', async () => {
    // The SQL compares `coupon_id IS DISTINCT FROM p_coupon_id`, so a stored
    // NULL against a supplied coupon is a mismatch — the same call, half of it.
    const { userId, businessId, offerId } = await scenario();
    const coupon = await seedCoupon(businessId, 'LATER');
    const user = authUser(userId);

    await service.create(user, {
      offer_id: offerId,
      idempotency_key: 'shared-key',
    });

    await expect(
      service.create(user, {
        offer_id: offerId,
        coupon_code: 'LATER',
        idempotency_key: 'shared-key',
      }),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    expect(await usedCountOf(coupon.id)).toBe(0);
  });

  test('a replay survives the offer selling out or closing', async () => {
    // Ordering, not luck: the RPC resolves the key before it reads the offer,
    // and it has to. A retry arrives exactly when the offer is gone, and
    // answering OFFER_OUT_OF_STOCK would hide a reservation the user already
    // holds from the client that is trying to recover it.
    const { userId, offerId } = await scenario();
    const user = authUser(userId);
    const first = await service.create(user, {
      offer_id: offerId,
      idempotency_key: 'late-retry',
    });

    await ctx.db.update(offers).set({ stock: 0 }).where(eq(offers.id, offerId));

    const replay = await service.create(user, {
      offer_id: offerId,
      idempotency_key: 'late-retry',
    });

    expect(replay.replayed).toBe(true);
    expect(replay.order).toEqual(first.order);
    expect(await ordersOf(userId)).toHaveLength(1);
  });

  test('no key keeps the previous behaviour exactly', async () => {
    const { userId, businessId, offerId } = await scenario();
    const otherLocation = await seedLocation(ctx.db, businessId);
    const otherOffer = await seedOffer(ctx.db, businessId, otherLocation.id);
    const user = authUser(userId);

    // Two reservations, two offers, no key: two orders, as before. The key is
    // what makes a retry safe; without one the API must not start deduping.
    const first = await service.create(user, { offer_id: offerId });
    const second = await service.create(user, { offer_id: otherOffer.id });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(first.order.id).not.toBe(second.order.id);
    expect(await ordersOf(userId)).toHaveLength(2);
    expect(await stockOf(offerId)).toBe(4);
    expect(await stockOf(otherOffer.id)).toBe(4);
    // And nothing is left behind that a later request could replay.
    const rows = await ordersOf(userId);
    expect(rows.every((row) => row.idempotency_key === null)).toBe(true);
  });

  test('no key on the same offer is still DUPLICATE_RESERVATION', async () => {
    const { userId, offerId } = await scenario();
    const user = authUser(userId);

    await service.create(user, { offer_id: offerId });

    await expect(service.create(user, { offer_id: offerId })).rejects.toThrow(
      'DUPLICATE_RESERVATION',
    );
  });

  test('a key is trimmed like the RPC trims it', async () => {
    // `reserve_offer` does `nullif(btrim(p_idempotency_key), '')` before it
    // hashes and before it compares. Without the same normalization here, a
    // mobile `" retry-1 "` and an API `"retry-1"` would be two different keys
    // in one column and the retry would reserve twice.
    const { userId, offerId } = await scenario();
    const user = authUser(userId);

    const first = await service.create(user, {
      offer_id: offerId,
      idempotency_key: 'trim-me',
    });
    const second = await service.create(user, {
      offer_id: offerId,
      idempotency_key: '  trim-me  ',
    });

    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    const [row] = await ordersOf(userId);
    expect(row?.idempotency_key).toBe('trim-me');
  });

  test('a whitespace-only key means no key at all', async () => {
    // The other half of the same `nullif`: `btrim` leaves an empty string, and
    // `nullif` turns that into "no idempotency". A key of " " must not be
    // stored, or two unrelated attempts collide on a key nobody chose.
    const { userId, offerId } = await scenario();
    const user = authUser(userId);

    await service.create(user, {
      offer_id: offerId,
      idempotency_key: '   ',
    });

    const [row] = await ordersOf(userId);
    expect(row?.idempotency_key).toBeNull();
    await expect(
      service.create(user, { offer_id: offerId, idempotency_key: '   ' }),
    ).rejects.toThrow('DUPLICATE_RESERVATION');
  });

  test('a rolled back attempt leaves nothing, and the retry succeeds', async () => {
    // The key is claimed by the INSERT, inside the transaction. An attempt
    // that fails before that must not burn the key, or the client's retry — the
    // one attempt that would have worked — would be answered with a conflict.
    const { userId, offerId } = await scenario({ stock: 0 });
    const user = authUser(userId);
    const body = {
      offer_id: offerId,
      idempotency_key: 'retry-after-failure',
    };

    await expect(service.create(user, body)).rejects.toThrow(
      'OFFER_OUT_OF_STOCK',
    );
    expect(await ordersOf(userId)).toHaveLength(0);
    expect(await stockOf(offerId)).toBe(0);

    await ctx.db.update(offers).set({ stock: 3 }).where(eq(offers.id, offerId));

    const retried = await service.create(user, body);

    expect(retried.replayed).toBe(false);
    expect(await ordersOf(userId)).toHaveLength(1);
    expect(await stockOf(offerId)).toBe(2);
  });

  test('two concurrent requests with the same key produce exactly one order', async () => {
    const { userId, offerId } = await scenario();
    const key = 'concurrent-1';
    const user = authUser(userId);
    const body = { offer_id: offerId, idempotency_key: key };

    // The gate holds the SAME advisory lock the RPC holds for this key, on its
    // own connection. If the service locked anything else — the bare key, the
    // offer row, nothing — neither request would park here and both would
    // insert, which is the failure this test exists to catch.
    const gate: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });
    const observer: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });

    try {
      let pending!: Promise<unknown[]>;
      let waitersWhileGated = -1;

      await gate.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${key}, 0))`;

        pending = Promise.all([
          service.create(user, body),
          service.create(user, body),
        ]);
        // Handled eagerly so a rejection surfaces here rather than as an
        // unhandled rejection while we are still polling.
        pending.catch(() => {});

        // Both requests must be WAITING on the advisory lock. Polling
        // `pg_locks` proves the lock is advisory and that it is held by two
        // distinct backends, instead of assuming it after a sleep.
        const deadline = Date.now() + 10_000;
        do {
          const [row] = await observer<{ n: number }[]>`
            select count(*)::int as n
            from pg_locks
            where locktype = 'advisory' and not granted
          `;
          waitersWhileGated = row?.n ?? 0;
          if (waitersWhileGated >= 2) break;
          await sleep(25);
        } while (Date.now() < deadline);
      });

      // Committing the gate released the lock: one request took it, reserved,
      // and committed, and the other then found the row and replayed.
      const [first, second] = (await pending) as [
        Awaited<ReturnType<typeof service.create>>,
        Awaited<ReturnType<typeof service.create>>,
      ];

      expect(waitersWhileGated).toBeGreaterThanOrEqual(2);
      expect(first.order.id).toBe(second.order.id);
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      // One reservation, one folio, one pickup code, one decrement.
      expect(await ordersOf(userId)).toHaveLength(1);
      expect(await stockOf(offerId)).toBe(4);
    } finally {
      await gate.end({ timeout: 5 });
      await observer.end({ timeout: 5 });
    }
  });

  test('the lock key is the one the RPC hashes', async () => {
    // The two producers only exclude each other if they agree on the lock id,
    // and they can only agree by letting the DATABASE hash it. Hashing the same
    // string in JavaScript would produce a different 64-bit value and two
    // implementations that merely behave alike in their own tests.
    const { userId, offerId } = await scenario();
    const key = 'lock-key-1';
    const observer: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });
    const gate: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });

    try {
      let pending!: Promise<unknown>;
      let blocked = false;

      await gate.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${key}, 0))`;

        pending = service
          .create(authUser(userId), { offer_id: offerId, idempotency_key: key })
          .catch(() => null);
        pending.catch(() => {});

        const deadline = Date.now() + 10_000;
        do {
          const [row] = await observer<{ n: number }[]>`
            select count(*)::int as n
            from pg_locks
            where locktype = 'advisory' and not granted
          `;
          blocked = (row?.n ?? 0) > 0;
          if (blocked) break;
          await sleep(25);
        } while (Date.now() < deadline);
        // Committing here releases the lock. Awaiting the request inside the
        // gate would deadlock against the lock this test is holding.
      });

      expect(blocked).toBe(true);
      // Released: the very same request now goes through, which is the other
      // half of the claim — the gate was blocking it, not the clock.
      expect(await pending).not.toBeNull();
      expect(await ordersOf(userId)).toHaveLength(1);
    } finally {
      await gate.end({ timeout: 5 });
      await observer.end({ timeout: 5 });
    }
  });

  test('the key is scoped to its user', async () => {
    // The lock, the lookup and the partial unique index are all
    // (user_id, idempotency_key): one user's key says nothing about another
    // user's reservation, and two clients that happened to generate the same
    // string must not collide.
    const { businessId, offerId } = await scenario();
    const otherLocation = await seedLocation(ctx.db, businessId);
    const otherOffer = await seedOffer(ctx.db, businessId, otherLocation.id);
    const firstUser = await seedProfile(ctx.db);
    const secondUser = await seedProfile(ctx.db);
    const key = 'shared-across-users';

    const first = await service.create(authUser(firstUser), {
      offer_id: offerId,
      idempotency_key: key,
    });
    const second = await service.create(authUser(secondUser), {
      offer_id: otherOffer.id,
      idempotency_key: key,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(second.order.id).not.toBe(first.order.id);
    expect(await ordersOf(firstUser)).toHaveLength(1);
    expect(await ordersOf(secondUser)).toHaveLength(1);
  });

  test('the service writes what the SQL would have written', async () => {
    // The insert mirrors `reserve_offer`'s column list: the same defaults the
    // RPC applies, so a row written by either producer is readable by both.
    const { userId, businessId, offerId } = await scenario();
    const coupon = await seedCoupon(businessId, 'MIRROR', { value: '10' });

    await service.create(authUser(userId), {
      offer_id: offerId,
      coupon_code: 'MIRROR',
      idempotency_key: 'mirror-1',
    });

    const [row] = await ordersOf(userId);
    expect(row).toMatchObject({
      offer_id: offerId,
      business_id: businessId,
      status: 'pending',
      coupon_id: coupon.id,
      idempotency_key: 'mirror-1',
    });
    // `order_number` comes from the shared SQL sequence, `pickup_code` from the
    // mirror's own charset: both non-empty, both written in the same
    // transaction as the decrement they belong to.
    expect(row?.order_number).toMatch(/^FD-\d{4}-\d{4}-\d{3}$/);
    expect(row?.pickup_code).toMatch(/^[A-Z2-9]{6}$/);
  });

  test('no order is written when the reservation is rejected', async () => {
    // The negative control for the whole mirror: a conflict must leave the
    // table exactly as it found it, key included.
    const { userId, offerId } = await scenario({ stock: 0 });

    await expect(
      service.create(authUser(userId), {
        offer_id: offerId,
        idempotency_key: 'never-stored',
      }),
    ).rejects.toThrow('OFFER_OUT_OF_STOCK');

    const rows = await ctx.db
      .select({ key: orders.idempotency_key })
      .from(orders)
      .where(eq(orders.idempotency_key, 'never-stored'));
    expect(rows).toHaveLength(0);
  });

  test('the sequence of folio numbers is not consumed by a replay', async () => {
    // Cheap but telling: a replay returns the ORIGINAL folio. If it went
    // through the insert, the sequence would advance and the response would
    // carry a different `order_number` than the first attempt.
    const { userId, offerId } = await scenario();
    const user = authUser(userId);
    const body = { offer_id: offerId, idempotency_key: 'folio-1' };

    const first = await service.create(user, body);
    const [sequenceAfterFirst] = await ctx.db.execute(
      sql`select last_value from public.order_number_seq`,
    );
    const second = await service.create(user, body);
    const [sequenceAfterSecond] = await ctx.db.execute(
      sql`select last_value from public.order_number_seq`,
    );

    expect(second.order.order_number).toBe(first.order.order_number);
    expect(sequenceAfterSecond?.last_value).toBe(
      sequenceAfterFirst?.last_value,
    );
  });
});
