import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { savedAddresses as savedAddressesTable } from '../../database/schema';
import { SavedAddressesRepository } from './saved-addresses.repository';
import { SavedAddressesService } from './saved-addresses.service';

let ctx: TestDbContext;
let service: SavedAddressesService;
let repository: SavedAddressesRepository;

let consumerId: string;
let strangerId: string;

const authUser = (id: string, role: 'user' | 'business' = 'user') =>
  ({ id, email: `${id}@t.cl`, role }) as never;

const address = (overrides: Record<string, unknown> = {}) => ({
  label: 'Casa',
  address: 'Calle Falsa 123',
  latitude: -33.4372,
  longitude: -70.6506,
  ...overrides,
});

beforeAll(async () => {
  ctx = await createTestDb();
  repository = new SavedAddressesRepository(ctx.db);
  service = new SavedAddressesService(repository);

  consumerId = await seedProfile(ctx.db);
  strangerId = await seedProfile(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  // A fresh book per test: every default-flag rule is relative to what the
  // caller already has, so one leftover row would change what a case means.
  await ctx.db.delete(savedAddressesTable);
});

/** Read the rows straight from Postgres, not back through the service. */
async function rowsOf(userId: string) {
  return ctx.db
    .select()
    .from(savedAddressesTable)
    .where(eq(savedAddressesTable.user_id, userId))
    .orderBy(savedAddressesTable.created_at);
}

async function defaultRows(userId: string) {
  return (await rowsOf(userId)).filter((row) => row.is_default);
}

describe('SavedAddressesService (DB real)', () => {
  describe('identity', () => {
    test('a caller cannot read another user address book', async () => {
      await service.create(authUser(consumerId), address());

      expect(await service.list(authUser(strangerId))).toEqual([]);
      // And the row is still there for its real owner.
      expect(await rowsOf(consumerId)).toHaveLength(1);
    });

    test('a caller cannot update another user address', async () => {
      const created = await service.create(authUser(consumerId), address());
      const before = (await rowsOf(consumerId))[0];

      // "Not yours" and "not there" are the same answer, and nothing is written.
      await expect(
        service.update(authUser(strangerId), created.id, {
          label: 'Sequestrado',
          is_default: false,
        }),
      ).rejects.toThrow(/not found/);

      const after = (await rowsOf(consumerId))[0];
      expect(after.label).toBe(before.label);
      expect(after.is_default).toBe(true);
    });

    test("a stranger's PATCH cannot demote the owner's default", async () => {
      const created = await service.create(authUser(consumerId), address());

      await expect(
        service.update(authUser(strangerId), created.id, { is_default: false }),
      ).rejects.toThrow(/not found/);

      // The read that proves ownership happens BEFORE the clear, so a request
      // that is going to fail never touches the owner's rows at all.
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('a caller cannot delete another user address', async () => {
      const created = await service.create(authUser(consumerId), address());

      await service.remove(authUser(strangerId), created.id);

      expect(await rowsOf(consumerId)).toHaveLength(1);
    });

    test('a user_id in the create body is ignored, not honoured', async () => {
      // The cast is deliberate: it puts a `user_id` in the payload to prove the
      // service cannot act on it even if the pipe were bypassed. The type would
      // not compile without it, because `AddSavedAddressRequestSchema` has no
      // such field — which is the contract, and the e2e spec is where the HTTP
      // boundary shows the pipe stripping it.
      const created = await service.create(authUser(consumerId), {
        ...address(),
        user_id: strangerId,
      } as never);

      expect(created.user_id).toBe(consumerId);
      expect(await rowsOf(consumerId)).toHaveLength(1);
      expect(await rowsOf(strangerId)).toHaveLength(0);
    });

    test('a business user gets its own book, not the consumer one', async () => {
      await service.create(authUser(consumerId), address());
      await service.create(authUser(strangerId, 'business'), address());

      expect(await rowsOf(consumerId)).toHaveLength(1);
      expect(await rowsOf(strangerId)).toHaveLength(1);
    });
  });

  describe('the first address a user saves', () => {
    test('becomes the default when the caller omits the flag', async () => {
      const created = await service.create(authUser(consumerId), address());

      expect(created.is_default).toBe(true);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('becomes the default when the caller asks for it', async () => {
      const created = await service.create(
        authUser(consumerId),
        address({ is_default: true }),
      );

      expect(created.is_default).toBe(true);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('refuses an explicit is_default false, because nothing else could be the default', async () => {
      await expect(
        service.create(authUser(consumerId), address({ is_default: false })),
      ).rejects.toThrow(/default/i);

      // The rejection is inside the transaction: no half-written row survives.
      expect(await rowsOf(consumerId)).toHaveLength(0);
    });

    test('a second address saved without the flag is NOT promoted', async () => {
      await service.create(authUser(consumerId), address());
      const second = await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo' }),
      );

      expect(second.is_default).toBe(false);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('the fields the body omitted keep the column defaults', async () => {
      const created = await service.create(authUser(consumerId), address());

      // The mapper leaves undefined optional fields undefined instead of
      // writing null, so the table's defaults apply: `type` is 'home' and the
      // two nullable text columns are NULL. Writing null here would have turned
      // the NOT NULL default on `type` into a 23502.
      expect(created.type).toBe('home');
      expect(created.references).toBeNull();
      expect(created.housing_type).toBeNull();
    });
  });

  describe('at most one default — the rule the database does not enforce', () => {
    test('creating a second default clears the first', async () => {
      const first = await service.create(authUser(consumerId), address());
      const second = await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo', is_default: true }),
      );

      expect(second.is_default).toBe(true);
      const defaults = await defaultRows(consumerId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.id);
      // Both rows survive: promoting a default is not a delete.
      expect(await rowsOf(consumerId)).toHaveLength(2);
      const demoted = (await rowsOf(consumerId)).find((r) => r.id === first.id);
      expect(demoted?.is_default).toBe(false);
    });

    test('setting an existing address as default clears the other', async () => {
      const first = await service.create(authUser(consumerId), address());
      const second = await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo' }),
      );

      const promoted = await service.update(authUser(consumerId), second.id, {
        is_default: true,
      });

      expect(promoted.is_default).toBe(true);
      const defaults = await defaultRows(consumerId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.id);
      expect(
        (await rowsOf(consumerId)).find((r) => r.id === first.id)?.is_default,
      ).toBe(false);
    });

    test('promoting the row that is already the default is a no-op, not a demotion', async () => {
      const first = await service.create(authUser(consumerId), address());

      const again = await service.update(authUser(consumerId), first.id, {
        is_default: true,
      });

      // `clearOtherDefaults` excludes the promoted id. Without that exclusion
      // the row would be cleared and then set again, and the two statements
      // would disagree about which write won.
      expect(again.is_default).toBe(true);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('the clear is transaction-scoped: a failure after it rolls it back', async () => {
      await service.create(authUser(consumerId), address());

      // The transaction is the whole point, so it is tested directly: the clear
      // inside an aborted transaction must leave the default standing. Run
      // outside a transaction, the flag would be gone and no schema constraint
      // would notice.
      await expect(
        repository.transaction(async (tx) => {
          await repository.clearOtherDefaults(tx, consumerId, null);
          throw new Error('abort on purpose');
        }),
      ).rejects.toThrow(/abort on purpose/);

      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('a PATCH that would leave no default at all is rejected with 409', async () => {
      const only = await service.create(authUser(consumerId), address());

      // THE BEHAVIOUR PINNED HERE: an explicit `is_default: false` on the only
      // default row is NOT allowed to leave the book with no default. Honouring
      // it was rejected because the request has no coherent reading — "I want a
      // different default" is expressible directly — and because the one
      // consumer of this flag skips a user with no default silently, so a 200
      // here would be a silent downgrade. See SavedAddressesService.update.
      await expect(
        service.update(authUser(consumerId), only.id, { is_default: false }),
      ).rejects.toThrow(/default/i);

      expect(await defaultRows(consumerId)).toHaveLength(1);
      expect(await rowsOf(consumerId)).toHaveLength(1);
    });

    test('a PATCH that clears the flag on a NON-default row is allowed', async () => {
      await service.create(authUser(consumerId), address());
      const second = await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo' }),
      );

      // Same body, different row: the guard is about the end state, not about
      // the verb, so this must not be rejected.
      const res = await service.update(authUser(consumerId), second.id, {
        is_default: false,
      });

      expect(res.is_default).toBe(false);
      expect(await defaultRows(consumerId)).toHaveLength(1);
    });

    test('the rule is per user: one user default never demotes another', async () => {
      await service.create(authUser(consumerId), address());
      await service.create(authUser(strangerId), address());

      await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo', is_default: true }),
      );

      expect(await defaultRows(consumerId)).toHaveLength(1);
      expect(await defaultRows(strangerId)).toHaveLength(1);
    });
  });

  describe('read and write shapes', () => {
    test('the list is the caller own, default first and newest after', async () => {
      const first = await service.create(authUser(consumerId), address());
      const second = await service.create(
        authUser(consumerId),
        address({ label: 'Trabajo' }),
      );
      const third = await service.create(
        authUser(consumerId),
        address({ label: 'Otro', is_default: true }),
      );

      const list = await service.list(authUser(consumerId));

      // The order the consumer already had from PostgREST, so the cutover does
      // not reshuffle the address book under the user.
      expect(list.map((a) => a.id)).toEqual([third.id, second.id, first.id]);
    });

    test('numeric columns come back as numbers, as the Zod contract promises', async () => {
      const created = await service.create(
        authUser(consumerId),
        address({ latitude: -33.4372123, longitude: -70.6506123 }),
      );

      // postgres-js hands `numeric` back as a string; the mapper coerces, so the
      // response really is `z.number()`.
      const row = (await rowsOf(consumerId))[0];
      expect(typeof row.latitude).toBe('string');
      expect(created.latitude).toBe(-33.4372123);
      expect(created.longitude).toBe(-70.6506123);
    });

    test('a partial PATCH leaves the fields it did not mention alone', async () => {
      const created = await service.create(
        authUser(consumerId),
        address({ references: 'Portón 4', type: 'work' }),
      );

      const updated = await service.update(authUser(consumerId), created.id, {
        label: 'Casa nueva',
      });

      expect(updated.label).toBe('Casa nueva');
      expect(updated.references).toBe('Portón 4');
      expect(updated.type).toBe('work');
      expect(updated.address).toBe(created.address);
    });

    test('a PATCH on an id that is not mine is a 404 and the row stays', async () => {
      const created = await service.create(authUser(consumerId), address());

      await expect(
        service.update(
          authUser(consumerId),
          '00000000-0000-0000-0000-000000000000',
          { label: 'Nada' },
        ),
      ).rejects.toThrow(/not found/);

      expect(await rowsOf(consumerId)).toHaveLength(1);
    });

    test('deleting the default is allowed and no replacement is invented', async () => {
      // THE BEHAVIOUR PINNED HERE: the one-default rule does NOT extend to
      // delete. "I no longer have a default" is a statement the user can make
      // about their own book, and promoting a replacement during a delete would
      // silently move their default under them — which the consumer's own
      // repository does not do either.
      await service.create(authUser(consumerId), address());
      await service.create(authUser(consumerId), address({ label: 'Trabajo' }));
      const removed = await service.create(
        authUser(consumerId),
        address({ label: 'Sede', is_default: true }),
      );

      await service.remove(authUser(consumerId), removed.id);

      const remaining = await rowsOf(consumerId);
      expect(remaining).toHaveLength(2);
      expect(remaining.map((r) => r.id)).not.toContain(removed.id);
      // The book is intact and simply has no default, which is the state the
      // delete asked for.
      expect(await defaultRows(consumerId)).toHaveLength(0);
    });

    test('deleting twice is a success, not a 404', async () => {
      const created = await service.create(authUser(consumerId), address());

      await service.remove(authUser(consumerId), created.id);
      await expect(
        service.remove(authUser(consumerId), created.id),
      ).resolves.toBeUndefined();
      expect(await rowsOf(consumerId)).toHaveLength(0);
    });
  });
});
