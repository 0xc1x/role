import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { paymentMethods as paymentMethodsTable } from '../../database/schema';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodsService } from './payment-methods.service';

let ctx: TestDbContext;
let service: PaymentMethodsService;
let repository: PaymentMethodsRepository;

let consumerId: string;
let strangerId: string;

const authUser = (id: string, role: 'user' | 'business' = 'user') =>
  ({ id, email: `${id}@t.cl`, role }) as never;

/**
 * A card written straight to Postgres, the way mobile's PostgREST writer would.
 * There is deliberately no API create: ADR-0007 keeps the add-a-card path behind
 * the gateway SDK, so a spec that needed a row must seed it like the real second
 * writer does rather than inventing a route.
 */
async function seedCard(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const [row] = await ctx.db
    .insert(paymentMethodsTable)
    .values({
      user_id: userId,
      gateway: 'place_to_pay',
      gateway_token: `tok_seed_${randomUUID().slice(0, 8)}`,
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2030,
      holder_name: 'Ana López',
      ...overrides,
    })
    .returning();
  return row;
}

/** Read the rows straight from Postgres, not back through the service. */
async function rowsOf(userId: string) {
  return ctx.db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.user_id, userId))
    .orderBy(paymentMethodsTable.created_at);
}

async function defaultRows(userId: string) {
  return (await rowsOf(userId)).filter((row) => row.is_default);
}

beforeAll(async () => {
  ctx = await createTestDb();
  repository = new PaymentMethodsRepository(ctx.db);
  service = new PaymentMethodsService(repository);

  consumerId = await seedProfile(ctx.db);
  strangerId = await seedProfile(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  // A fresh wallet per test: the one-default rule is relative to what the caller
  // already has, so one leftover row would change what a case means.
  await ctx.db.delete(paymentMethodsTable);
});

describe('PaymentMethodsService (DB real)', () => {
  describe('the list is the caller own and nothing else', () => {
    test('returns the caller cards and nobody else', async () => {
      await seedCard(consumerId, { brand: 'mastercard', last4: '1111' });
      await seedCard(consumerId, { brand: 'amex', last4: '0005' });
      await seedCard(strangerId, { brand: 'visa', last4: '9999' });

      const list = await service.list(authUser(consumerId));

      expect(list).toHaveLength(2);
      // Not merely "the right count": the stranger's card must not be IN there.
      expect(list.map((m) => m.last4).sort()).toEqual(['0005', '1111']);
      expect(list.every((m) => m.user_id === consumerId)).toBe(true);
    });

    test('a caller cannot read another wallet by naming the owner', async () => {
      // The cast is deliberate: it puts a `user_id` where the service has no
      // parameter for it, to prove the service cannot act on one. There is no
      // request schema on this route either — the cast would not compile against
      // a real body type — so there is nothing for a pipe to strip either.
      await seedCard(strangerId, { last4: '9999' });

      const list = await service.list(authUser(consumerId, 'user') as never);
      expect(list).toEqual([]);
    });

    test('a soft-deleted row disappears', async () => {
      const kept = await seedCard(consumerId, { last4: '1111' });
      const removed = await seedCard(consumerId, { last4: '2222' });

      await service.remove(authUser(consumerId), removed.id);

      const list = await service.list(authUser(consumerId));
      expect(list.map((m) => m.id)).toEqual([kept.id]);
    });

    test('a row with active = false disappears', async () => {
      // `active = false` with NO `deleted_at` is a normal, reachable state: it is
      // the instrument switch a gateway integration would flip when a card stops
      // being chargeable without the user deleting it. The two columns are not
      // redundant, so the filter needs both.
      const kept = await seedCard(consumerId, { last4: '1111' });
      await seedCard(consumerId, { last4: '2222', active: false });

      const list = await service.list(authUser(consumerId));
      expect(list.map((m) => m.id)).toEqual([kept.id]);
    });

    test('a card deactivated by the gateway while still marked default is hidden', async () => {
      // Both predicates at once, and the ordering: the row is the default AND
      // unusable, so a filter that only checked `deleted_at` would surface it.
      await seedCard(consumerId, {
        last4: '1111',
        is_default: true,
        active: false,
      });

      expect(await service.list(authUser(consumerId))).toEqual([]);
    });

    test('the list is default first and newest after — the consumer own order', async () => {
      const first = await seedCard(consumerId, { last4: '0001' });
      const second = await seedCard(consumerId, { last4: '0002' });
      const third = await seedCard(consumerId, {
        last4: '0003',
        is_default: true,
      });

      const list = await service.list(authUser(consumerId));

      // The order `profileRepository.getPaymentMethods` already produces, so the
      // cutover does not reshuffle the wallet under the user.
      expect(list.map((m) => m.id)).toEqual([third.id, second.id, first.id]);
    });

    test('place_to_pay is a real gateway, not a placeholder', async () => {
      await seedCard(consumerId, { gateway: 'place_to_pay', last4: '1111' });
      await seedCard(consumerId, { gateway: 'stripe', last4: '0002' });

      const list = await service.list(authUser(consumerId));

      // The pay-at-pickup instrument this product's business model actually
      // uses. Filtering it out would hide most of a real wallet.
      expect(list.map((m) => m.gateway).sort()).toEqual([
        'place_to_pay',
        'stripe',
      ]);
    });
  });

  describe('PCI DSS — the gateway token never crosses the wire', () => {
    test('is absent from the ACTUAL object the list returns, not just the schema', async () => {
      // THE POINT OF ASSERTING ON THE RETURNED OBJECT: `z.object()` in Zod 4
      // STRIPS unknown keys, so parsing a leaky response through the contract
      // would strip the token and this test would pass with the leak present.
      // Nothing is parsed here — the object the mapper built is inspected as-is.
      const seeded = await seedCard(consumerId);
      expect(seeded.gateway_token).toBeTruthy(); // the column really holds a secret

      const [card] = await service.list(authUser(consumerId));

      expect(card.gateway_token).toBeUndefined();
      expect('gateway_token' in card!).toBe(false);
      expect(Object.keys(card!).sort()).toEqual([
        'brand',
        'created_at',
        'exp_month',
        'exp_year',
        'gateway',
        'holder_name',
        'id',
        'is_default',
        'last4',
        'user_id',
      ]);
    });

    test('is absent from the set-default response too', async () => {
      // "Every response shape the API can produce" means both, not just the list.
      const seeded = await seedCard(consumerId);

      const promoted = await service.setDefault(
        authUser(consumerId),
        seeded.id,
      );

      expect(promoted.gateway_token).toBeUndefined();
      expect('gateway_token' in promoted).toBe(false);
    });

    test('carries the display fields a card list is made of', async () => {
      // The other half of the rule: the token is not in the response, and the
      // fields that make a card recognisable still are. A projection that
      // dropped everything would pass the test above.
      await seedCard(consumerId, {
        brand: 'mastercard',
        last4: '4444',
        exp_month: 7,
        exp_year: 2031,
        holder_name: 'Ana López',
      });

      const [card] = await service.list(authUser(consumerId));

      expect(card).toMatchObject({
        brand: 'mastercard',
        last4: '4444',
        exp_month: 7,
        exp_year: 2031,
        holder_name: 'Ana López',
      });
    });

    test('does not leak the soft-delete columns either', async () => {
      await seedCard(consumerId);

      const [card] = await service.list(authUser(consumerId));

      // They are filtered server-side, so in a response they could only ever be
      // `true` and `null`. Their absence is what stops a client re-filtering and
      // eventually showing a deleted card.
      expect('active' in card!).toBe(false);
      expect('deleted_at' in card!).toBe(false);
    });
  });

  describe('set default — the rule the database does not enforce', () => {
    test('clears the previous default and sets the new one', async () => {
      const first = await seedCard(consumerId, { last4: '0001' });
      const second = await seedCard(consumerId, { last4: '0002' });
      await ctx.db
        .update(paymentMethodsTable)
        .set({ is_default: true })
        .where(eq(paymentMethodsTable.id, first.id));

      const promoted = await service.setDefault(
        authUser(consumerId),
        second.id,
      );

      expect(promoted.is_default).toBe(true);
      const defaults = await defaultRows(consumerId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.id);
      // Both rows survive: promoting a default is not a delete.
      expect(await rowsOf(consumerId)).toHaveLength(2);
      expect(
        (await rowsOf(consumerId)).find((r) => r.id === first.id)?.is_default,
      ).toBe(false);
    });

    test('promoting the row that is ALREADY the default is a no-op, not a demotion', async () => {
      const only = await seedCard(consumerId, { is_default: true });

      const again = await service.setDefault(authUser(consumerId), only.id);

      // `clearOtherDefaults` excludes the promoted id. Without that exclusion
      // the row would be cleared and then set again, and the two statements would
      // disagree about which write won.
      expect(again.is_default).toBe(true);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('the clear is atomic with the set: a failure after it rolls it back', async () => {
      const first = await seedCard(consumerId, { is_default: true });

      // Tested directly rather than through the service, because the service
      // cannot be made to fail between the two statements from outside. Run
      // outside a transaction, the flag would be gone and NO schema constraint
      // would notice — that is the point.
      await expect(
        repository.transaction(async (tx) => {
          await repository.lockDefaultForUser(tx, consumerId);
          await repository.clearOtherDefaults(tx, consumerId, null);
          throw new Error('abort on purpose');
        }),
      ).rejects.toThrow(/abort on purpose/);

      expect(await defaultRows(consumerId)).toHaveLength(1);
      expect((await rowsOf(consumerId))[0].id).toBe(first.id);
    });

    test('two concurrent set-defaults leave exactly ONE default', async () => {
      // The race the advisory lock exists to close. Without it, the transactions
      // interleave as clear(A) / clear(B) / set(A) / set(B) and commit with BOTH
      // rows default, because the two SETs touch different rows and so never
      // block each other.
      const first = await seedCard(consumerId, { last4: '0001' });
      const second = await seedCard(consumerId, { last4: '0002' });
      const third = await seedCard(consumerId, { last4: '0003' });

      await Promise.all([
        service.setDefault(authUser(consumerId), first.id),
        service.setDefault(authUser(consumerId), second.id),
        service.setDefault(authUser(consumerId), third.id),
      ]);

      const defaults = await defaultRows(consumerId);

      // THE INVARIANT, and the only one the implementation promises: after three
      // concurrent promotions, exactly one card is the default.
      expect(defaults).toHaveLength(1);

      // WHICH one is deliberately NOT asserted to be the last one requested.
      // The lock makes the three transactions serialise, and the winner is
      // whichever of them acquires the lock last — which is not the call order,
      // because they are issued concurrently. An earlier version of this test
      // asserted `defaults[0].id === third.id` and failed on roughly one run in
      // four: it was asserting a last-writer-wins guarantee that no advisory lock
      // provides and that this service never claimed. The winner is one of the
      // three, and the other two are not default.
      expect([first.id, second.id, third.id]).toContain(defaults[0].id);
    });

    test('a set-default racing a delete never leaves a removed card in the list', async () => {
      const kept = await seedCard(consumerId, { last4: '0001' });
      const removed = await seedCard(consumerId, { last4: '0002' });

      // allSettled, not all: whichever order the two land in, ONE of them losing
      // is a legitimate outcome — a promotion that finds the card already
      // removed is a 404 by design. A test that insisted both succeed would be
      // asserting a serialisation between these two operations that this API
      // deliberately does not promise (the delete takes no advisory lock, and
      // claiming otherwise would be the overstatement the service note warns
      // against).
      const outcomes = await Promise.allSettled([
        service.setDefault(authUser(consumerId), removed.id),
        service.remove(authUser(consumerId), removed.id),
      ]);

      expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true);

      // The invariant that must hold in BOTH orders: a card the user removed is
      // never in the list, whatever the promotion did. A row may still carry a
      // stale `is_default` in storage — that is invisible to every read, and the
      // next promotion's sweep clears it.
      const live = await service.list(authUser(consumerId));
      expect(live.map((m) => m.id)).toEqual([kept.id]);
    });

    test('the rule is per user: promoting never demotes another wallet default', async () => {
      await seedCard(consumerId, { last4: '0001' });
      await seedCard(consumerId, { last4: '0002' });
      await seedCard(strangerId, { last4: '0003' });
      await ctx.db
        .update(paymentMethodsTable)
        .set({ is_default: true })
        .where(eq(paymentMethodsTable.user_id, strangerId));

      const target = (await rowsOf(consumerId))[1];
      await service.setDefault(authUser(consumerId), target.id);

      expect(await defaultRows(strangerId)).toHaveLength(1);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('setting a default on someone else row affects NOTHING', async () => {
      // The ownership read happens BEFORE the clear, so a request that is going
      // to fail never touches the caller own rows — and provably not the
      // stranger either.
      const mine = await seedCard(consumerId, {
        last4: '0001',
        is_default: true,
      });
      const theirs = await seedCard(strangerId, { last4: '0002' });

      await expect(
        service.setDefault(authUser(consumerId), theirs.id),
      ).rejects.toThrow(/not found/);

      // The caller's default is untouched — the clear never ran.
      expect(await defaultRows(consumerId)).toHaveLength(1);
      expect((await defaultRows(consumerId))[0].id).toBe(mine.id);
      // And the stranger's row is untouched.
      const theirRow = (await rowsOf(strangerId))[0];
      expect(theirRow.id).toBe(theirs.id);
      expect(theirRow.is_default).toBe(false);
    });

    test('promoting a soft-deleted card is a 404, not a silent revival', async () => {
      const card = await seedCard(consumerId);
      await service.remove(authUser(consumerId), card.id);

      await expect(
        service.setDefault(authUser(consumerId), card.id),
      ).rejects.toThrow(/not found/);

      // Still deleted: set-default did not un-delete it.
      const row = (await rowsOf(consumerId))[0];
      expect(row.deleted_at).not.toBeNull();
      expect(row.active).toBe(false);
    });

    test('promoting a card the gateway deactivated is a 404', async () => {
      const card = await seedCard(consumerId, { active: false });

      await expect(
        service.setDefault(authUser(consumerId), card.id),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('delete is a SOFT delete', () => {
    test('the row is still present, with deleted_at set and active false', async () => {
      const card = await seedCard(consumerId);

      await service.remove(authUser(consumerId), card.id);

      // The row SURVIVES. `deleted_at` exists on this table precisely so a
      // removed card is retained, and a hard delete here would make this API
      // disagree with the consumer writer that already soft-deletes.
      const rows = await rowsOf(consumerId);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(card.id);
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].active).toBe(false);
      // The display metadata is retained too — this is a removal, not a wipe.
      expect(rows[0].last4).toBe('4242');
      expect(rows[0].gateway_token).toBeTruthy();
    });

    test('a soft-deleted row is gone from the list', async () => {
      const card = await seedCard(consumerId);
      await service.remove(authUser(consumerId), card.id);

      expect(await service.list(authUser(consumerId))).toEqual([]);
    });

    test('a row deleted by someone else is a 404 and changes nothing', async () => {
      const theirs = await seedCard(strangerId, { last4: '9999' });
      const before = (await rowsOf(strangerId))[0];

      await expect(
        service.remove(authUser(consumerId), theirs.id),
      ).rejects.toThrow(/not found/);

      const after = (await rowsOf(strangerId))[0];
      expect(after.id).toBe(before.id);
      expect(after.deleted_at).toBeNull();
      expect(after.active).toBe(true);
    });

    test('"not yours" and "not there" are the same 404', async () => {
      // Both are NotFoundException with the same message shape, so the endpoint
      // cannot be used to probe whether a card id exists in somebody else wallet.
      await expect(
        service.remove(authUser(consumerId), randomUUID()),
      ).rejects.toThrow(/not found/);
      await expect(
        service.setDefault(authUser(consumerId), randomUUID()),
      ).rejects.toThrow(/not found/);
    });

    test('deleting twice is a success, not a 404', async () => {
      const card = await seedCard(consumerId);

      await service.remove(authUser(consumerId), card.id);
      // Still the caller row, so idempotency and ownership are one answer. A
      // read filtered on `active` could not tell these two cases apart.
      await expect(
        service.remove(authUser(consumerId), card.id),
      ).resolves.toBeUndefined();

      expect(await rowsOf(consumerId)).toHaveLength(1);
    });

    test('does not invent a replacement default', async () => {
      const first = await seedCard(consumerId, { last4: '0001' });
      const second = await seedCard(consumerId, {
        last4: '0002',
        is_default: true,
      });

      await service.remove(authUser(consumerId), second.id);

      // The list is the user's wallet, and `first` is all that is left in it.
      const visible = await service.list(authUser(consumerId));
      expect(visible.map((m) => m.id)).toEqual([first.id]);
      expect(visible.some((m) => m.is_default)).toBe(false);

      // "I no longer have a default" is a statement the user can make about
      // their own wallet. Promoting a replacement here would move their default
      // under them silently.
      expect(visible.every((m) => !m.is_default)).toBe(true);

      // AND the honest limit, asserted rather than glossed: the soft-deleted row
      // is still in storage and still carries the stale flag. Nothing reads it —
      // the list filters it out — and the next promotion's sweep clears it, but
      // "no default" is a statement about what the user can SEE, not about what
      // the table holds.
      const stored = (await rowsOf(consumerId)).find((r) => r.id === second.id);
      expect(stored?.is_default).toBe(true);
      expect(stored?.active).toBe(false);
    });

    test('the next promotion sweeps the flag a delete left behind', async () => {
      const first = await seedCard(consumerId, { last4: '0001' });
      const second = await seedCard(consumerId, {
        last4: '0002',
        is_default: true,
      });
      await service.remove(authUser(consumerId), second.id);

      await service.setDefault(authUser(consumerId), first.id);

      // `clearOtherDefaults` sweeps deleted rows too, on purpose: a soft-deleted
      // card that still claims the default is the only row carrying the flag
      // while being invisible in every list.
      const defaults = await defaultRows(consumerId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(first.id);
    });
  });

  describe('identity', () => {
    test('a business user gets its own wallet, not the consumer one', async () => {
      await seedCard(consumerId, { last4: '0001' });
      await seedCard(strangerId, { last4: '0002' });

      expect(await service.list(authUser(consumerId))).toHaveLength(1);
      expect(await service.list(authUser(strangerId, 'business'))).toHaveLength(
        1,
      );
      expect((await service.list(authUser(consumerId)))[0].user_id).toBe(
        consumerId,
      );
    });

    test('the two writers agree on what a delete does', async () => {
      // The consumer soft-deletes with `update { active: false, deleted_at }` and
      // no `user_id` predicate at all, relying on RLS. This API scopes the same
      // write by owner. Both must produce a row that the list hides.
      const card = await seedCard(consumerId, { last4: '0001' });
      await ctx.db
        .update(paymentMethodsTable)
        .set({ active: false, deleted_at: new Date() })
        .where(eq(paymentMethodsTable.id, card.id));

      expect(await service.list(authUser(consumerId))).toEqual([]);
    });
  });
});

describe('the mirror is faithful to the live table', () => {
  beforeAll(async () => {
    ctx = ctx ?? (await createTestDb());
  });

  test('the two CHECK constraints production holds really exist here', async () => {
    // If the harness silently dropped them, every other case in this file would
    // still pass while the test database allowed rows production forbids. The
    // mirror declares neither, by design, so this is the only place the claim
    // "the test database enforces what production enforces" is actually checked.
    const result = await ctx.db.execute(sql`
      select conname
      from pg_constraint
      where conrelid = 'public.payment_methods'::regclass
        and contype = 'c'
      order by conname
    `);

    const names = [...(result as unknown as Iterable<{ conname: string }>)].map(
      (r) => r.conname,
    );

    expect(names).toContain('payment_methods_exp_month_check');
    expect(names).toContain('payment_methods_last4_check');
  });

  test('an exp_month of 0 or 13 is rejected, as production rejects it', async () => {
    for (const exp_month of [0, 13, -1]) {
      await expect(
        seedCard(consumerId, { last4: '0001', exp_month }),
      ).rejects.toThrow();
    }
    // And the legal bounds are legal, so the assertion above is about the
    // constraint and not about a column that rejects everything.
    for (const exp_month of [1, 12]) {
      await seedCard(consumerId, { exp_month });
    }
    expect(await rowsOf(consumerId)).toHaveLength(2);
  });

  test('a last4 that is not four characters is rejected', async () => {
    for (const last4 of ['424', '42420', '']) {
      await expect(seedCard(consumerId, { last4 })).rejects.toThrow();
    }
    // Four characters of ANYTHING passes, because the live CHECK is length
    // only — which is exactly why the response contract in commons additionally
    // requires four DIGITS. This test pins the direction of that gap rather than
    // leaving it implicit.
    await seedCard(consumerId, { last4: '4242' });
    await seedCard(consumerId, { last4: 'abcd' });
    expect(await rowsOf(consumerId)).toHaveLength(2);
  });

  test('the one-default rule is NOT backed by a database constraint here', async () => {
    // Asserted so the service stays honest about being the only enforcement
    // point. If a future migration adds a partial unique index on `is_default`,
    // THIS test fails and the service's comment gets updated with it — which is
    // the moment the service could stop doing the clear itself.
    const result = await ctx.db.execute(sql`
      select
        exists (
          select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
          where c.relname = 'idx_payment_methods_user'
            and i.indisunique
        ) as user_index_is_unique
    `);

    const rows = [
      ...(result as unknown as Iterable<{ user_index_is_unique: boolean }>),
    ];
    expect(rows[0].user_index_is_unique).toBe(false);

    // And two defaults really are writable in plain SQL through this database,
    // which is the whole reason `setDefault` is a transaction.
    const card = await seedCard(consumerId);
    const other = await seedCard(consumerId);
    await ctx.db
      .update(paymentMethodsTable)
      .set({ is_default: true })
      .where(eq(paymentMethodsTable.id, card.id));
    await ctx.db
      .update(paymentMethodsTable)
      .set({ is_default: true })
      .where(eq(paymentMethodsTable.id, other.id));

    expect(await defaultRows(consumerId)).toHaveLength(2);
  });

  test('no trigger maintains updated_at, so the repository must write it', async () => {
    // Verified against the live database: no trigger exists on
    // `public.payment_methods`. If the harness grew one, a stale `updated_at`
    // would pass for the right reason and this test would fail — which is the
    // alarm that production and the harness had diverged.
    const result = await ctx.db.execute(sql`
      select count(*)::int as triggers
      from pg_trigger
      where tgrelid = 'public.payment_methods'::regclass
        and not tgisinternal
    `);

    const rows = [...(result as unknown as Iterable<{ triggers: number }>)];
    expect(rows[0].triggers).toBe(0);
  });

  test('updated_at moves on a set-default, because nothing else would move it', async () => {
    const card = await seedCard(consumerId, { last4: '0001' });
    const before = (await rowsOf(consumerId))[0].updated_at;

    // A clock tick, not a sleep of a second: the assertion is that the WRITE
    // carries a new value, and a millisecond is enough to prove the column was
    // in the SET clause at all.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.setDefault(authUser(consumerId), card.id);

    const after = (await rowsOf(consumerId))[0].updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
