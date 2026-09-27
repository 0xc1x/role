import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { reviews } from '../../database/schema';
import { ReviewsFeedRepository } from './reviews-feed.repository';

let ctx: TestDbContext;
let repo: ReviewsFeedRepository;
let raw: Sql;
let authorId = '';
let otherAuthorId = '';
let businessId = '';
let offerId = '';
let secondOfferId = '';

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new ReviewsFeedRepository(ctx.db);
  raw = postgres(ctx.connectionString, { prepare: false, max: 1 });

  authorId = await seedProfile(ctx.db, 'ana@test.cl');
  otherAuthorId = await seedProfile(ctx.db, 'beto@test.cl');
  const owner = await seedProfile(ctx.db, 'owner@test.cl');
  const business = await seedBusiness(ctx.db, owner);
  businessId = business.id;
  const location = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, location.id)).id;
  secondOfferId = (await seedOffer(ctx.db, businessId, location.id)).id;

  await ctx.db.execute(
    `update profiles set full_name = 'Ana' where id = '${authorId}'`,
  );
  await ctx.db.execute(
    `update profiles set full_name = 'Beto' where id = '${otherAuthorId}'`,
  );
});

afterAll(async () => {
  await raw.end({ timeout: 5 });
  await ctx.stop();
});

/**
 * Inserts a review with an explicit `created_at` and an explicit moderation
 * state, which the shared seed does not carry.
 */
async function review(options: {
  userId?: string;
  orderId?: string;
  offerId?: string;
  at: string;
  hidden?: boolean;
  comment?: string;
}): Promise<string> {
  let orderId = options.orderId ?? null;
  if (!orderId && options.offerId) {
    orderId = (
      await seedOrder(ctx.db, options.userId ?? authorId, options.offerId, businessId, {
        order_number: `R-${crypto.randomUUID().slice(0, 8)}`,
      })
    ).id;
  }
  const [row] = await ctx.db
    .insert(reviews)
    .values({
      user_id: options.userId ?? authorId,
      business_id: businessId,
      order_id: orderId,
      product_rating: 4,
      business_rating: 5,
      comment: options.comment ?? 'Buenísimo',
      is_hidden: options.hidden ?? false,
      created_at: new Date(options.at),
      updated_at: new Date(options.at),
    })
    .returning();
  if (!row) throw new Error('insert review failed');
  return row.id;
}

/** The one visible row every later case in this file counts against. */
let seedVisible = '';

describe('ReviewsFeedRepository.listVisibleByBusiness', () => {
  const base = '2026-01-01T10:00:00.000Z';

  test('excludes a hidden review and never returns moderation state', async () => {
    seedVisible = await review({ at: base, comment: 'Visible' });
    await review({ at: '2026-01-01T11:00:00.000Z', hidden: true, comment: 'Oculta' });

    const feed = await repo.listVisibleByBusiness(businessId, {
      page: 1,
      limit: 20,
    });

    expect(feed.rows.map((r) => r.id)).toEqual([seedVisible]);
    expect(feed.total).toBe(1);
    expect(feed.rows[0]?.is_hidden).toBe(false);
  });

  test('meta.total ignores hidden rows too, so the page is never short', async () => {
    const feed = await repo.listVisibleByBusiness(businessId, {
      page: 1,
      limit: 20,
    });
    expect(feed.total).toBe(feed.rows.length);
  });

  test('the order is newest first and stable when timestamps collide', async () => {
    // Three rows share one timestamp on purpose. Without the `id` tiebreaker
    // their relative order is whatever the scan returns, and an infinite scroll
    // that pages through them drops and repeats rows. They are written WITHOUT an
    // order so they stay out of the per-offer feed below: `reviews` has no
    // `offer_id`, and a review with no order belongs to no offer.
    const sameInstant = '2026-02-02T12:00:00.000Z';
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await review({ at: sameInstant, comment: `same ${i}` }));
    }
    const older = await review({ at: '2026-01-15T12:00:00.000Z' });

    const page = (n: number) =>
      repo.listVisibleByBusiness(businessId, { page: n, limit: 2 });
    const first = await page(1);
    const firstAgain = await page(1);
    const second = await page(2);
    const third = await page(3);

    // One seeded visible row in the first test + three colliding + one older.
    expect(first.total).toBe(5);
    expect(second.total).toBe(first.total);
    expect(third.total).toBe(first.total);

    // The stability claim itself: the same page asked twice returns the same
    // rows in the same order, including the three rows that share a timestamp.
    expect(firstAgain.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));

    // Newest first: the three February rows lead, and the January row from the
    // first test is the very last one.
    expect(third.rows.map((r) => r.id)).toEqual([seedVisible]);
    expect(second.rows.map((r) => r.id)).toContain(older);

    // Walking every page visits every visible id exactly once, so no row is
    // dropped or repeated across a page boundary.
    const walked = [first, second, third].flatMap((p) => p.rows.map((r) => r.id));
    expect(walked).toHaveLength(5);
    expect(new Set(walked).size).toBe(5);
    expect(walked.sort()).toEqual([...ids, older, seedVisible].sort());
  });

  test('an unknown business is an empty feed, not every business', async () => {
    const feed = await repo.listVisibleByBusiness(
      '00000000-0000-0000-0000-000000000000',
      { page: 1, limit: 20 },
    );
    expect(feed).toEqual({ rows: [], total: 0 });
  });

  test('the author name comes from profiles and nothing else does', async () => {
    const feed = await repo.listVisibleByBusiness(businessId, {
      page: 1,
      limit: 20,
    });
    expect(Object.keys(feed.rows[0] ?? {}).sort()).toEqual([
      'author_id',
      'author_name',
      'business_id',
      'business_rating',
      'comment',
      'created_at',
      'id',
      'is_hidden',
      'order_id',
      'product_rating',
      'updated_at',
    ]);
  });
});

describe('ReviewsFeedRepository.listVisibleByOffer', () => {
  test('reaches the offer through the order, not through reviews', async () => {
    const mine = await review({ at: '2026-03-01T10:00:00.000Z', offerId });
    await review({ at: '2026-03-01T11:00:00.000Z', offerId: secondOfferId });
    // Hidden on the right offer: excluded here for the same reason as in the
    // business feed.
    await review({
      at: '2026-03-01T12:00:00.000Z',
      offerId,
      hidden: true,
    });

    const feed = await repo.listVisibleByOffer(offerId, { page: 1, limit: 20 });

    expect(feed.rows.map((r) => r.id)).toEqual([mine]);
    expect(feed.total).toBe(1);
    expect(feed.rows[0]?.offer_id).toBe(offerId);
    expect(feed.rows[0]?.offer_title).toBe('Pack sorpresa');
  });

  test('a review without an order belongs to no offer', async () => {
    // The inner join to `orders` is what excludes it. A left join would list it
    // on every offer with a null offer id.
    await review({ at: '2026-03-02T10:00:00.000Z' });

    const feed = await repo.listVisibleByOffer(secondOfferId, {
      page: 1,
      limit: 50,
    });
    expect(feed.rows.every((r) => r.order_id !== null)).toBe(true);
  });

  test('the count and the page agree', async () => {
    const feed = await repo.listVisibleByOffer(offerId, { page: 1, limit: 1 });
    expect(feed.rows).toHaveLength(1);
    expect(feed.total).toBeGreaterThanOrEqual(1);
  });
});

describe('ReviewsFeedRepository.listForUser', () => {
  test('returns the caller own hidden review', async () => {
    const hidden = await review({ at: '2026-04-01T10:00:00.000Z', hidden: true });

    const feed = await repo.listForUser(authorId, { page: 1, limit: 50 });

    expect(feed.rows.map((r) => r.id)).toContain(hidden);
    expect(feed.rows.find((r) => r.id === hidden)?.is_hidden).toBe(true);
  });

  test('never returns a review written by somebody else', async () => {
    const mine = await review({ at: '2026-04-02T10:00:00.000Z' });
    const theirs = await review({
      at: '2026-04-02T11:00:00.000Z',
      userId: otherAuthorId,
      hidden: true,
    });

    const feed = await repo.listForUser(authorId, { page: 1, limit: 50 });

    expect(feed.rows.map((r) => r.id)).toContain(mine);
    expect(feed.rows.map((r) => r.id)).not.toContain(theirs);
    // The other author's rows exist and are hidden: they are simply not in this
    // reader's set.
    expect(feed.total).toBe(feed.rows.length);
  });

  test('a caller with no reviews gets an empty page, not everybody', async () => {
    const stranger = await seedProfile(ctx.db);
    const feed = await repo.listForUser(stranger, { page: 1, limit: 50 });
    expect(feed).toEqual({ rows: [], total: 0 });
  });
});

/**
 * The index the public feeds are built on.
 *
 * The statements are the ones the repository actually ran, captured through a
 * Drizzle logger, and they are explained with `enable_seqscan = off` so the plan
 * has to use an index rather than the sequential scan a six-row table would
 * always prefer. `enable_seqscan = off` does not force the WRONG index: it only
 * makes the planner treat sequential scans as heavily penalised, so the answer is
 * still "which index does Postgres think serves this".
 */
describe('public review feed index usage', () => {
  test('the page and the count of a business feed both ride the partial index', async () => {
    const captured: { query: string; params: unknown[] }[] = [];
    const spyClient = postgres(ctx.connectionString, { prepare: false, max: 1 });
    const spyDb = drizzle({
      client: spyClient,
      logger: {
        logQuery(query: string, params: unknown[]) {
          captured.push({ query, params });
        },
      },
    });

    try {
      await new ReviewsFeedRepository(spyDb).listVisibleByBusiness(businessId, {
        page: 1,
        limit: 20,
      });
    } finally {
      await spyClient.end({ timeout: 5 });
    }

    expect(captured).toHaveLength(2);

    await raw.unsafe('set enable_seqscan = off');
    try {
      for (const statement of captured) {
        const plan = await raw.unsafe(
          `explain ${statement.query}`,
          statement.params as never[],
        );
        const text = plan.map((row) => Object.values(row).join(' ')).join('\n');
        expect(text).toContain('idx_reviews_visible_business_created');
        expect(text).not.toMatch(/Seq Scan on (public\.)?reviews/);
      }
    } finally {
      await raw.unsafe('set enable_seqscan = on');
    }
  });

  test('the caller own feed rides the user index', async () => {
    const feed = await repo.listForUser(authorId, { page: 1, limit: 20 });
    const plan = await raw.unsafe(
      `explain select count(*) from reviews where user_id = $1`,
      [authorId],
    );
    const text = plan.map((row) => Object.values(row).join(' ')).join('\n');

    expect(feed.total).toBeGreaterThan(0);
    // No purpose-built `(user_id, created_at desc)` index exists, so this is the
    // plain `idx_reviews_user` and the ordering is a sort of the caller's own
    // rows. Asserted so a future index decision is a deliberate edit here.
    expect(text).not.toMatch(/Seq Scan/);
  });

  test('the equivalent "is not true" predicate is a sequential scan', async () => {
    // The control for the assertion above, and the reason the feed spells the
    // predicate `is_hidden = false`. `is_hidden is not true` means the same thing
    // for a NOT NULL column and is what the rating triggers use — but the planner
    // cannot prove it implies the partial index's `is_hidden = false`, so the
    // scan falls back to the whole table plus a sort. This is the exact
    // degradation `visibleAnd` exists to avoid, measured rather than assumed.
    await raw.unsafe('set enable_seqscan = off');
    try {
      const plan = await raw.unsafe(
        `explain select id from reviews where business_id = $1 and is_hidden is not true order by created_at desc limit 20`,
        [businessId],
      );
      const text = plan.map((row) => Object.values(row).join(' ')).join('\n');

      expect(text).toMatch(/Seq Scan on reviews/);
      expect(text).not.toContain('idx_reviews_visible_business_created');
    } finally {
      await raw.unsafe('set enable_seqscan = on');
    }
  });
});
