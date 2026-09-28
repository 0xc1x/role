import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { round2 } from '../../common/utils/numeric';
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
import { CouponsRepository, type CouponRow } from './coupons.repository';
import { CouponsService } from './coupons.service';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';

/**
 * `POST /coupons/validate` against `POST /orders`, on one real database.
 *
 * This is the spec the whole endpoint exists for. The pre-check is only worth
 * having if it cannot lie: a user who is told a code applies, fills in checkout
 * and is then rejected at submit has been told something false by us, in the one
 * moment they were about to pay. So every stage is asserted TWICE against the
 * same coupon row — once as the pre-check's verdict, once as what the
 * reservation actually did — and the two are compared in a single vocabulary.
 *
 * Real database, not mocks, for three reasons the claims need it:
 *   - the resolution ranking is SQL, and a mock cannot disagree with itself;
 *   - the reservation LOCKS the coupon row and increments `used_count`, and the
 *     claim under test is that the pre-check does neither;
 *   - the unique constraint behind the resolution is a database fact.
 */
let ctx: TestDbContext;
let couponsService: CouponsService;
let ordersService: OrdersService;
let couponsRepository: CouponsRepository;
let ordersRepository: OrdersRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  couponsRepository = new CouponsRepository(ctx.db);
  ordersRepository = new OrdersRepository(ctx.db);
  couponsService = new CouponsService(couponsRepository);
  ordersService = new OrdersService(
    ordersRepository,
    new OffersRepository(ctx.db),
    // Notification flags off, the production default: this spec measures the
    // reservation, not the queue behind it.
    { get: () => false } as unknown as ConfigService<Env, true>,
  );
});

afterAll(async () => {
  await ctx.stop();
});

const authUser = (id: string) =>
  ({ id, email: `${id}@t.cl`, role: 'user' }) as AuthUser;

const PAST = new Date('2000-01-01T00:00:00.000Z');
const FUTURE = new Date('2999-01-01T00:00:00.000Z');
/** `seedOffer` prices every offer at this subtotal. */
const AMOUNT = 3990;

async function scenario() {
  const userId = await seedProfile(ctx.db);
  const ownerId = await seedProfile(ctx.db);
  const business = await seedBusiness(ctx.db, ownerId);
  const location = await seedLocation(ctx.db, business.id);
  const offer = await seedOffer(ctx.db, business.id, location.id);
  const foreign = await seedBusiness(ctx.db, await seedProfile(ctx.db));
  return {
    userId,
    businessId: business.id,
    offerId: offer.id,
    foreignId: foreign.id,
  };
}

async function seedCoupon(
  code: string,
  overrides: Partial<typeof coupons.$inferInsert> = {},
): Promise<CouponRow> {
  const [row] = await ctx.db
    .insert(coupons)
    .values({
      code,
      name: code,
      type: 'fixed',
      value: '1000',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedCoupon failed');
  return row;
}

/** Postgres error codes, which Drizzle wraps one level down. */
function sqlErrorCode(error: unknown): string {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.cause?.code ?? candidate?.code ?? 'unknown';
}

const usedCountOf = async (couponId: string) => {
  const [row] = await ctx.db
    .select({ used_count: coupons.used_count })
    .from(coupons)
    .where(eq(coupons.id, couponId));
  return row?.used_count ?? null;
};

/** What `POST /orders` did, read back in the pre-check's vocabulary. */
type ReservationVerdict =
  | { applies: true; final_price: number }
  | { applies: false; error: string; reason?: string };

async function reserve(
  userId: string,
  offerId: string,
  couponCode: string,
): Promise<ReservationVerdict> {
  try {
    const { order } = await ordersService.create(authUser(userId), {
      offer_id: offerId,
      coupon_code: couponCode,
    });
    return { applies: true, final_price: order.price };
  } catch (error) {
    // The reservation reports rejections as `CODE` or `CODE: reason - text`.
    // Parsing them back is the point: the assertion is that this string and the
    // pre-check's body say the same thing, not that both were produced by the
    // same constant.
    const message = (error as Error).message;
    const [, code, reason] =
      /^([A-Z_]+)(?:: ([a-z_]+) - )?/.exec(message) ?? [];
    if (!code) throw new Error(`unparsable rejection: ${message}`);
    return reason
      ? { applies: false, error: code, reason }
      : { applies: false, error: code };
  }
}

/** The pre-check's body, reduced to the same vocabulary. */
function asVerdict(body: unknown): ReservationVerdict {
  const parsed = body as {
    applies: boolean;
    final_price?: number;
    error?: string;
    reason?: string;
  };
  if (parsed.applies)
    return { applies: true, final_price: parsed.final_price! };
  return parsed.reason
    ? { applies: false, error: parsed.error!, reason: parsed.reason }
    : { applies: false, error: parsed.error! };
}

type Case = {
  name: string;
  /** `null` = insert no coupon at all, which is how `not_found` is reached. */
  coupon: Partial<typeof coupons.$inferInsert> | null;
  expected: ReservationVerdict;
};

const CASES: Case[] = [
  {
    name: 'not_found',
    coupon: null,
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'not_found',
    },
  },
  {
    name: 'wrong_business',
    coupon: { business_id: 'FOREIGN' },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'wrong_business',
    },
  },
  {
    name: 'inactive',
    coupon: { is_active: false },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'inactive',
    },
  },
  {
    name: 'expired',
    coupon: { expires_at: PAST },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'expired',
    },
  },
  {
    name: 'COUPON_EXHAUSTED',
    coupon: { max_uses: 2, used_count: 2 },
    expected: { applies: false, error: 'COUPON_EXHAUSTED' },
  },
  {
    name: 'COUPON_MIN_NOT_MET',
    coupon: { min_order_amount: '99999' },
    expected: { applies: false, error: 'COUPON_MIN_NOT_MET' },
  },
  {
    name: 'accepted: fixed',
    coupon: { type: 'fixed', value: '1000' },
    expected: { applies: true, final_price: 2990 },
  },
  {
    name: 'accepted: percentage',
    coupon: { type: 'percentage', value: '50' },
    expected: { applies: true, final_price: 1995 },
  },
  {
    name: 'accepted: a global coupon',
    coupon: { business_id: null, type: 'percentage', value: '10' },
    expected: { applies: true, final_price: 3591 },
  },
  {
    name: 'accepted: min_order_amount exactly the amount',
    coupon: { type: 'fixed', value: '250', min_order_amount: String(AMOUNT) },
    expected: { applies: true, final_price: 3740 },
  },
  // Multi-fault rows. A coupon can fail several stages at once, and WHICH one
  // is reported is a property of the order of the stages — the order the
  // reservation has always had. These fail if that order is ever reshuffled in
  // either path, or if the two paths disagree about it.
  {
    name: 'wrong_business outranks every later stage',
    coupon: {
      business_id: 'FOREIGN',
      is_active: false,
      expires_at: PAST,
      max_uses: 1,
      used_count: 1,
      min_order_amount: '99999',
    },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'wrong_business',
    },
  },
  {
    name: 'inactive outranks expired, exhausted and min not met',
    coupon: {
      is_active: false,
      expires_at: PAST,
      max_uses: 1,
      used_count: 1,
      min_order_amount: '99999',
    },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'inactive',
    },
  },
  {
    name: 'expired outranks exhausted and min not met',
    coupon: {
      expires_at: PAST,
      max_uses: 1,
      used_count: 1,
      min_order_amount: '99999',
    },
    expected: {
      applies: false,
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'expired',
    },
  },
  {
    name: 'exhausted outranks min not met',
    coupon: { max_uses: 1, used_count: 1, min_order_amount: '99999' },
    expected: { applies: false, error: 'COUPON_EXHAUSTED' },
  },
];

describe('POST /coupons/validate agrees with POST /orders at every stage', () => {
  for (const testCase of CASES) {
    test(testCase.name, async () => {
      const { userId, businessId, offerId, foreignId } = await scenario();
      const code = `PARITY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const seeded =
        testCase.coupon === null
          ? null
          : await seedCoupon(
              code,
              testCase.coupon.business_id === 'FOREIGN'
                ? { ...testCase.coupon, business_id: foreignId }
                : { business_id: businessId, ...testCase.coupon },
            );

      const validation = await couponsService.validate({
        code,
        business_id: businessId,
        amount: AMOUNT,
      });
      const reserved = await reserve(userId, offerId, code);

      // The table above is the specification, written by hand.
      expect(reserved).toEqual(testCase.expected);
      // And the endpoint says the same as the reservation, field for field.
      expect(asVerdict(validation)).toEqual(reserved);
      // The accepted branch also reports the money, not just a yes.
      if (testCase.expected.applies) {
        expect(validation).toEqual({
          applies: true,
          code,
          discount: round2(AMOUNT - testCase.expected.final_price),
          final_price: testCase.expected.final_price,
        });
      } else {
        expect(validation.applies).toBe(false);
        expect(validation.code).toBe(code);
      }

      // Only a reservation that actually applied the coupon spends it, and it
      // spends exactly one — the delta, because a fixture may start exhausted.
      const spent = seeded ? await usedCountOf(seeded.id) : null;
      expect(spent).toBe(
        testCase.expected.applies
          ? (seeded?.used_count ?? 0) + 1
          : (seeded?.used_count ?? null),
      );
    });
  }
});

describe('the pre-check charges what the reservation charges', () => {
  test.each([
    ['percentage 10', { type: 'percentage', value: '10' } as const, 3591],
    // 33.33% of 3990 is 1329.8670000000003, which `orders.price` stores as
    // 1329.87 because the column is `numeric(12,2)`. The pre-check has to quote
    // the stored number, not the float: this row is the whole reason
    // `toCouponValidation` rounds.
    [
      'percentage 33.33',
      { type: 'percentage', value: '33.33' } as const,
      2660.13,
    ],
    ['fixed 1234.56', { type: 'fixed', value: '1234.56' } as const, 2755.44],
    ['fixed above the amount', { type: 'fixed', value: '99999' } as const, 0],
  ])(
    '%s: discount and final price match the order row',
    async (_name, shape, expected) => {
      const { userId, businessId, offerId } = await scenario();
      const code = `MONEY-${_name.replace(/\W+/g, '').toUpperCase()}`;
      const coupon = await seedCoupon(code, {
        business_id: businessId,
        ...shape,
      });

      const validation = await couponsService.validate({
        code,
        business_id: businessId,
        amount: AMOUNT,
      });
      const { order } = await ordersService.create(authUser(userId), {
        offer_id: offerId,
        coupon_code: code,
      });

      expect(validation.applies).toBe(true);
      if (validation.applies) {
        expect(validation.final_price).toBe(expected);
        expect(validation.discount).toBe(round2(AMOUNT - expected));
      }
      // The number the user was shown is the number the order carries.
      expect(order.price).toBe(expected);
      expect(order.coupon_id).toBe(coupon.id);
      const [row] = await ctx.db
        .select({ price: orders.price })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(Number(row?.price)).toBe(expected);
    },
  );
});

describe('the pre-check reserves nothing', () => {
  test('it does not consume max_uses, write an order or touch stock', async () => {
    const { businessId, offerId } = await scenario();
    const coupon = await seedCoupon('ADVISORY', {
      business_id: businessId,
      max_uses: 1,
      used_count: 0,
      type: 'percentage',
      value: '10',
    });

    // The plain read does not narrow by validity or scope either: the row is
    // the only way to tell `inactive` from `not_found`.
    expect(
      await couponsRepository.findApplicableByCode(businessId, 'ADVISORY'),
    ).toMatchObject({ is_active: true });

    for (let attempt = 0; attempt < 3; attempt++) {
      const validation = await couponsService.validate({
        code: 'ADVISORY',
        business_id: businessId,
        amount: AMOUNT,
      });
      expect(validation).toMatchObject({ applies: true, final_price: 3591 });
    }

    // Three pre-checks, zero redemptions. Incrementing here would exhaust the
    // coupon on lookups the user never converts.
    expect(await usedCountOf(coupon.id)).toBe(0);
    const [stock] = await ctx.db
      .select({ stock: offers.stock })
      .from(offers)
      .where(eq(offers.id, offerId));
    expect(stock?.stock).toBe(5);
    const written = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.offer_id, offerId));
    expect(written).toHaveLength(0);
  });

  test('it does not wait for a lock the reservation would take', async () => {
    // The reservation locks the coupon row (`SELECT … FOR UPDATE`) because it
    // is about to spend `used_count`. This pre-check holds no lock, so it must
    // answer while that row is locked by someone else. If it ever grew the
    // `.for('update')`, this test would park on the gate until the suite
    // timeout instead of answering — hence the explicit race, which fails fast
    // and says so.
    const { businessId, offerId } = await scenario();
    const coupon = await seedCoupon('NOLOCK', {
      business_id: businessId,
      max_uses: 1,
      used_count: 0,
    });
    const gate: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });
    const prober: Sql = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
    });

    try {
      await gate.begin(async (tx) => {
        await tx`SELECT id FROM public.coupons WHERE id = ${coupon.id} FOR UPDATE`;

        const TIMED_OUT = Symbol('validate blocked on the coupon lock');
        const validation = await Promise.race([
          couponsService.validate({
            code: 'NOLOCK',
            business_id: businessId,
            amount: AMOUNT,
          }),
          new Promise((resolve) => setTimeout(() => resolve(TIMED_OUT), 2000)),
        ]);

        // The pre-check answered. Now prove the lock was real and held, so a
        // passing test cannot be explained by the gate never having taken it.
        let blockedWith = 'none';
        try {
          // `unsafe`, not a tagged template: the extended protocol refuses more
          // than one statement per prepared query (42601).
          await prober.unsafe(
            `SET lock_timeout = '250ms';
             SELECT id FROM public.coupons WHERE id = '${coupon.id}' FOR UPDATE`,
          );
        } catch (error) {
          blockedWith = sqlErrorCode(error);
        }
        expect(blockedWith).toBe('55P03');
        expect(validation).not.toBe(TIMED_OUT);
        expect(validation).toEqual({
          applies: true,
          code: 'NOLOCK',
          discount: 1000,
          final_price: 2990,
        });
      });

      // The pre-check had read a coupon that a concurrent reservation could
      // exhaust, and that is the documented, correct behaviour of an advisory
      // check. The reservation is the only writer, and it is the only thing
      // that decides the outcome.
      expect(await usedCountOf(coupon.id)).toBe(0);
      const { order } = await ordersService.create(
        authUser(await seedProfile(ctx.db)),
        { offer_id: offerId, coupon_code: 'NOLOCK' },
      );
      expect(order.coupon_id).toBe(coupon.id);
    } finally {
      await gate.end({ timeout: 5 });
      await prober.end({ timeout: 5 });
    }
  });
});

describe('both resolution reads answer identically', () => {
  // The reads differ in exactly one way — the lock — and MUST NOT differ in
  // the row they pick. If they did, the pre-check would approve a code the
  // reservation rejects as `wrong_business`: the original bug, reintroduced
  // through the query instead of through the rules.
  const lockRead = (businessId: string, code: string) =>
    ordersRepository.transaction((tx) =>
      ordersRepository.findCouponByCodeForUpdate(tx, businessId, code),
    );
  const plainRead = (businessId: string, code: string) =>
    couponsRepository.findApplicableByCode(businessId, code);

  test('a business-scoped and a global coupon sharing a code', async () => {
    const { businessId, foreignId } = await scenario();
    const global = await seedCoupon('SHARED', { business_id: null });
    const own = await seedCoupon('SHARED', { business_id: businessId });

    // From the business that owns one of them, the business-scoped row wins.
    expect((await lockRead(businessId, 'SHARED'))?.id).toBe(own.id);
    expect((await plainRead(businessId, 'SHARED'))?.id).toBe(own.id);

    // From a business that owns neither, the global row is the fallback.
    expect((await lockRead(foreignId, 'SHARED'))?.id).toBe(global.id);
    expect((await plainRead(foreignId, 'SHARED'))?.id).toBe(global.id);

    // And through the endpoint, from the owning business: the pre-check sees
    // the business coupon, not the global one that also answers to the code.
    expect(
      await couponsService.validate({
        code: 'SHARED',
        business_id: businessId,
        amount: AMOUNT,
      }),
    ).toEqual({
      applies: true,
      code: 'SHARED',
      discount: 1000,
      final_price: 2990,
    });
  });

  test('an inactive business-scoped coupon outranks an active global one', async () => {
    // The other half of the same fixture, and the one the ranking exists for: if
    // the pre-check skipped the business-scoped row it would fall back to the
    // global coupon and approve a code whose own business's version is switched
    // off.
    const { businessId } = await scenario();
    await seedCoupon('SHADOW', {
      business_id: null,
      type: 'percentage',
      value: '90',
    });
    await seedCoupon('SHADOW', { business_id: businessId, is_active: false });

    const lock = await lockRead(businessId, 'SHADOW');
    const plain = await plainRead(businessId, 'SHADOW');
    expect(lock?.id).toBe(plain?.id);
    expect(lock?.is_active).toBe(false);

    expect(
      await couponsService.validate({
        code: 'SHADOW',
        business_id: businessId,
        amount: AMOUNT,
      }),
    ).toEqual({
      applies: false,
      code: 'SHADOW',
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'inactive',
    });
  });

  test('a code that only a foreign business answers', async () => {
    const { businessId, foreignId } = await scenario();
    const foreign = await seedCoupon('FOREIGN-ONLY', {
      business_id: foreignId,
    });

    // Both reads must return the foreign row, not null: the rows are the only
    // thing that can tell `wrong_business` apart from `not_found`, and a read
    // that filtered by scope would collapse the two.
    expect((await lockRead(businessId, 'FOREIGN-ONLY'))?.id).toBe(foreign.id);
    expect((await plainRead(businessId, 'FOREIGN-ONLY'))?.id).toBe(foreign.id);
  });

  test('a code no coupon answers is null on both reads', async () => {
    const { businessId } = await scenario();

    expect(await lockRead(businessId, 'ABSENT')).toBeNull();
    expect(await plainRead(businessId, 'ABSENT')).toBeNull();
  });

  test('the pre-check reaches wrong_business through the same row', async () => {
    const { businessId, foreignId } = await scenario();
    await seedCoupon('ONLY-FOREIGN', { business_id: foreignId });

    const validation = await couponsService.validate({
      code: 'ONLY-FOREIGN',
      business_id: businessId,
      amount: AMOUNT,
    });

    expect(validation).toEqual({
      applies: false,
      code: 'ONLY-FOREIGN',
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'wrong_business',
    });
  });
});

describe('the mirror gap the resolution depends on', () => {
  // `coupons_business_id_code_key UNIQUE (business_id, code)` exists in
  // production and is patched into the test database by `test/db.ts`. Because
  // Postgres treats NULLs as distinct, it does NOT stop two GLOBAL coupons from
  // sharing a code — so the constraint alone does not make the `limit(1)`
  // resolution unambiguous, and these are the two halves of that fact stated as
  // executable expectations rather than as a comment.
  test('the constraint is in the test database', async () => {
    const result = await ctx.db.execute(
      `select pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname = 'coupons_business_id_code_key'`,
    );
    const rows = result as unknown as Iterable<{ def: string }>;
    expect([...rows].map((row) => row.def)).toEqual([
      'UNIQUE (business_id, code)',
    ]);
  });

  test('a code can repeat per business but not within one', async () => {
    const { businessId } = await scenario();
    await seedCoupon('PER-SCOPE', { business_id: businessId });
    const other = await seedBusiness(ctx.db, await seedProfile(ctx.db));
    // Same code, different business: exactly what the redemption ranking
    // exists to disambiguate.
    await seedCoupon('PER-SCOPE', { business_id: other.id });

    let conflict = 'none';
    try {
      await seedCoupon('PER-SCOPE', { business_id: businessId });
    } catch (error) {
      conflict = sqlErrorCode(error);
    }
    expect(conflict).toBe('23505');
  });

  test('two global coupons may still share a code — NULLs are distinct', async () => {
    const first = await seedCoupon('NULLS-DISTINCT', { business_id: null });
    const second = await seedCoupon('NULLS-DISTINCT', { business_id: null });

    expect(first.id).not.toBe(second.id);
    // Which is why `CouponsService.assertGlobalCodeAvailable` exists: the
    // database permits this pair, the service refuses to create it, and the
    // resolution's `limit(1)` is safe only because of the service.
    const created = new CouponsService(couponsRepository);
    await expect(
      created.create({
        code: 'NULLS-DISTINCT',
        name: 'x',
        type: 'fixed',
        value: 1,
      }),
    ).rejects.toThrow('already exists');
  });
});
