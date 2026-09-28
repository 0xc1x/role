import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { UpdateMyMarketingPreferencesSchema } from '@0xc1x/role-commons';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { marketingPreferences } from '../../database/schema';
import type { AuthUser } from '../../auth/auth.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';

let ctx: TestDbContext;
let service: MeService;
let repository: MeRepository;

const authUser = (id: string, role: 'user' | 'business' | 'admin' = 'user') =>
  ({ id, email: `${id}@t.cl`, role }) as AuthUser;

/**
 * A fresh account per test. The unsubscribe stamp is CONDITIONAL on the
 * transition — a repeat `is_subscribed: false` deliberately does not restamp —
 * so a suite that reused one account would have its second unsubscribe silently
 * do nothing and assert against the wrong moment.
 */
async function freshAccount(): Promise<string> {
  return seedProfile(ctx.db);
}

async function row(userId: string) {
  const [found] = await ctx.db
    .select()
    .from(marketingPreferences)
    .where(eq(marketingPreferences.user_id, userId));
  return found ?? null;
}

beforeAll(async () => {
  ctx = await createTestDb();
  repository = new MeRepository(ctx.db);
  service = new MeService(repository, new CategoriesRepository(ctx.db));
});

afterAll(async () => {
  await ctx?.stop();
});

describe('marketing_preferences (DB real)', () => {
  test('an account with no row reads as an explicit null, and none is created', async () => {
    // There is NO signup trigger for this table — the only seed is the one-off
    // backfill in the email-marketing migration — so "no row" is the normal state
    // of an account created since, not a broken one. And a GET does not fix it.
    const ownerId = await freshAccount();

    const answer = await service.getMarketingPreferences(authUser(ownerId));

    expect(answer.marketing_preferences).toBeNull();
    expect(await row(ownerId)).toBeNull();
  });

  test('the PATCH creates the row, stamps the source, and reads back', async () => {
    const ownerId = await freshAccount();

    const answer = await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: false,
    });

    expect(answer.marketing_preferences?.user_id).toBe(ownerId);
    expect(answer.marketing_preferences?.is_subscribed).toBe(false);
    // `source` is not a request field: the server writes it, so the record says
    // which surface performed the change.
    expect(answer.marketing_preferences?.source).toBe('app');
    // The column default, carried by the INSERT rather than by the caller.
    expect(answer.marketing_preferences?.categories).toEqual(['announcements']);

    const again = await service.getMarketingPreferences(authUser(ownerId));
    expect(again.marketing_preferences?.is_subscribed).toBe(false);
  });

  test('THE SERVER STAMPS unsubscribed_at, and the caller cannot', async () => {
    // Stated as a spec because it is the decision this route exists to make: the
    // timestamp is derived, never accepted. A body carrying one parses into
    // nothing (the schema has no such key), and the stored value is the moment
    // the server handled the request.
    const ownerId = await freshAccount();
    const strangerId = await seedProfile(ctx.db);

    const parsed = UpdateMyMarketingPreferencesSchema.parse({
      is_subscribed: false,
      user_id: strangerId,
      unsubscribed_at: '2000-01-01T00:00:00.000Z',
      source: 'forged',
    });
    expect('user_id' in parsed).toBe(false);
    expect('unsubscribed_at' in parsed).toBe(false);
    expect('source' in parsed).toBe(false);

    const before = Date.now();
    const answer = await service.updateMarketingPreferences(authUser(ownerId), {
      ...parsed,
    });
    const after = Date.now();

    const stamped = answer.marketing_preferences?.unsubscribed_at;
    expect(stamped).not.toBeNull();
    const at = Date.parse(stamped as string);
    // Server time, and nowhere near the year 2000 the body asked for.
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(after + 1000);

    // The forged owner did not receive a row either.
    expect(await row(strangerId)).toBeNull();
  });

  test('resubscribing CLEARS the stamp, and unsubscribing again keeps the first', async () => {
    const ownerId = await freshAccount();

    await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: false,
    });
    await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: true,
    });

    const resubscribed = await service.getMarketingPreferences(
      authUser(ownerId),
    );
    expect(resubscribed.marketing_preferences?.is_subscribed).toBe(true);
    // A subscribed person has no moment of withdrawal; leaving the old value
    // would make the pair (true, <date>) mean two different things.
    expect(resubscribed.marketing_preferences?.unsubscribed_at).toBeNull();

    await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: false,
    });
    const first = await row(ownerId);
    const firstAt = first?.unsubscribed_at?.getTime();
    expect(firstAt).toBeDefined();

    // A client retrying the same request on a flaky connection must not move the
    // moment of withdrawal forward.
    await new Promise((resolve) => setTimeout(resolve, 15));
    await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: false,
    });
    const second = await row(ownerId);

    expect(second?.unsubscribed_at?.getTime()).toBe(firstAt);
  });

  test('updated_at moves on a real change and NOT on a no-op', async () => {
    const other = await freshAccount();

    await service.updateMarketingPreferences(authUser(other), {
      categories: ['announcements', 'promotions'],
    });
    const created = await row(other);
    expect(created?.categories).toEqual(['announcements', 'promotions']);
    const createdAt = created?.updated_at.getTime() ?? 0;

    await new Promise((resolve) => setTimeout(resolve, 20));

    // A PATCH that changes nothing is a read. `ON CONFLICT DO UPDATE` with no
    // SET columns is a syntax error, and bumping the timestamp anyway would make
    // "last changed" mean "last asked".
    await service.updateMarketingPreferences(authUser(other), {
      categories: ['announcements', 'promotions'],
    });
    const unchanged = await row(other);
    expect(unchanged?.updated_at.getTime()).toBe(createdAt);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await service.updateMarketingPreferences(authUser(other), {
      categories: ['news'],
    });
    const changed = await row(other);
    expect(changed?.updated_at.getTime()).toBeGreaterThan(createdAt);
    expect(changed?.categories).toEqual(['news']);
  });

  test('categories round-trip on their own, leaving the subscription alone', async () => {
    const other = await freshAccount();
    await service.updateMarketingPreferences(authUser(other), {
      is_subscribed: false,
    });
    const unsubscribedAt = (await row(other))?.unsubscribed_at?.getTime();

    // The two keys answer different questions ("may campaigns reach me" and
    // "which of them"), so moving one must not disturb the other — least of all
    // the compliance timestamp.
    await service.updateMarketingPreferences(authUser(other), {
      categories: ['news'],
    });
    const after = await row(other);

    expect(after?.categories).toEqual(['news']);
    expect(after?.is_subscribed).toBe(false);
    expect(after?.unsubscribed_at?.getTime()).toBe(unsubscribedAt);
  });

  test('an empty PATCH body creates nothing and moves nothing', async () => {
    const bare = await freshAccount();
    const answer = await service.updateMarketingPreferences(authUser(bare), {});

    expect(answer.marketing_preferences).toBeNull();
    expect(await row(bare)).toBeNull();
  });

  test('categories are validated against the declared union', () => {
    const ok = UpdateMyMarketingPreferencesSchema.safeParse({
      categories: ['announcements', 'news'],
    });
    expect(ok.success).toBe(true);

    // A category outside the union can never match a campaign, so accepting it
    // would store a preference that does nothing.
    const unknown = UpdateMyMarketingPreferencesSchema.safeParse({
      categories: ['black-friday'],
    });
    expect(unknown.success).toBe(false);
  });

  test("the row is the caller's, and a stranger cannot read it", async () => {
    const ownerId = await freshAccount();
    const strangerId = await seedProfile(ctx.db);

    await service.updateMarketingPreferences(authUser(ownerId), {
      is_subscribed: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await service.updateMarketingPreferences(authUser(strangerId), {
      is_subscribed: false,
    });

    const mine = await service.getMarketingPreferences(authUser(ownerId));
    const theirs = await service.getMarketingPreferences(authUser(strangerId));

    expect(mine.marketing_preferences?.user_id).toBe(ownerId);
    expect(theirs.marketing_preferences?.user_id).toBe(strangerId);
    // Two accounts, two independent stamps — the `where user_id = $1` in the
    // repository is the only thing standing between them, since this connection
    // owns the table and answers to no RLS policy. Asserted as "each has one and
    // they differ" rather than against a fixed clock, so the test states the
    // isolation and not the millisecond.
    expect(mine.marketing_preferences?.unsubscribed_at).not.toBeNull();
    expect(theirs.marketing_preferences?.unsubscribed_at).not.toBeNull();
    expect(mine.marketing_preferences?.unsubscribed_at).not.toBe(
      theirs.marketing_preferences?.unsubscribed_at,
    );
  });
});
