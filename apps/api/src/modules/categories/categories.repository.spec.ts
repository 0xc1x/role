import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedCategory,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import {
  businessModeration,
  offerCategories,
  offers,
} from '../../database/schema';
import { CategoriesRepository } from './categories.repository';

let ctx: TestDbContext;
let repo: CategoriesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new CategoriesRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('CategoriesRepository (DB real)', () => {
  test('insert + findById', async () => {
    const row = await repo.insert(ctx.db, {
      name: 'Panadería',
      slug: 'panaderia',
    });
    expect(row.id).toBeDefined();
    expect(await repo.findById(row.id)).toMatchObject({ name: 'Panadería' });
    expect(
      await repo.findById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });

  test('findByName y findBySlug respetan excludeId', async () => {
    const a = await repo.insert(ctx.db, { name: 'Café', slug: 'cafe' });
    expect(await repo.findByName('Café')).toMatchObject({ id: a.id });
    expect(await repo.findByName('Café', { excludeId: a.id })).toBeNull();
    expect(await repo.findBySlug('cafe')).toMatchObject({ id: a.id });
    expect(await repo.findBySlug('cafe', { excludeId: a.id })).toBeNull();
    expect(await repo.findBySlug('no-existe')).toBeNull();
  });

  test('list filtra por active/search y pagina', async () => {
    await repo.insert(ctx.db, {
      name: 'Frutería',
      slug: 'fruteria',
      active: false,
    });
    const all = await repo.list({ page: 1, limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(3);

    const active = await repo.list({ page: 1, limit: 10, active: true });
    expect(active.rows.every((r) => r.active)).toBe(true);

    const search = await repo.list({ page: 1, limit: 10, search: 'frut' });
    expect(search.rows.map((r) => r.name)).toContain('Frutería');

    const page = await repo.list({ page: 2, limit: 2 });
    expect(page.rows.length).toBeLessThanOrEqual(2);
  });

  test('update y softDelete', async () => {
    const row = await repo.insert(ctx.db, { name: 'Borrar', slug: 'borrar' });
    const updated = await repo.update(ctx.db, row.id, { name: 'Borrado' });
    expect(updated?.name).toBe('Borrado');

    const deleted = await repo.softDelete(ctx.db, row.id);
    expect(deleted?.deleted_at).toBeInstanceOf(Date);
    expect(await repo.findById(row.id)).toBeNull();
    expect(await repo.softDelete(ctx.db, row.id)).toBeNull();
  });

  test('transaction comparte conexión', async () => {
    const row = await repo.transaction((tx) =>
      repo.insert(tx, { name: 'Tx', slug: 'tx' }),
    );
    expect(await repo.findByName('Tx')).toMatchObject({ id: row.id });
  });
});

// ─── `public.active_offer_category_counts` (ADR-0008) ────────────────────────
//
// `seedCategory` leaves `active` at its default (true) and `deleted_at` null, so
// a seeded category is already inside the RPC's `where c.active`. Each test
// below looks its own category up by id rather than asserting on the whole list,
// because the database is shared by every test in this file.
describe('CategoriesRepository.list — active_count (mirror of active_offer_category_counts)', () => {
  const HOUR = 3_600_000;

  /** An approved business with one active location and `count` live offers. */
  async function liveOffers(count: number) {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    const loc = await seedLocation(ctx.db, biz.id);
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(await seedOffer(ctx.db, biz.id, loc.id));
    }
    return { bizId: biz.id, offers: rows };
  }

  /** Tag every offer with every category id. */
  async function tag(offers: Array<{ id: string }>, categoryIds: string[]) {
    for (const categoryId of categoryIds) {
      for (const offer of offers) {
        await ctx.db
          .insert(offerCategories)
          .values({ offer_id: offer.id, category_id: categoryId });
      }
    }
  }

  const rowFor = async (id: string) =>
    (await repo.list({ page: 1, limit: 100 })).rows.find((r) => r.id === id);

  test('a category with offers reports the count; an empty one reports 0, not null', async () => {
    const full = await seedCategory(ctx.db, 'Con ofertas');
    const empty = await seedCategory(ctx.db, 'Sin ofertas');
    const { offers: live } = await liveOffers(3);
    await tag(live, [full.id]);

    const fullRow = await rowFor(full.id);
    expect(fullRow?.active_count).toBeDefined();
    // The contract is a NUMBER, and it arrives as a `bigint` string from the
    // driver — asserted through the mapper's coercion in
    // categories.mapper.spec.ts, and read as a number here.
    expect(Number(fullRow?.active_count)).toBe(3);

    // `0`, never `null` and never `undefined`: a chip rendering "0 deals" is
    // correct, and one rendering nothing because the number was missing is not.
    const emptyRow = await rowFor(empty.id);
    expect(emptyRow).toBeDefined();
    expect(emptyRow?.active_count).not.toBeNull();
    expect(emptyRow?.active_count).not.toBeUndefined();
    expect(Number(emptyRow?.active_count)).toBe(0);
  });

  test('does not count sold-out, paused or closed-window offers', async () => {
    const cat = await seedCategory(ctx.db, 'Filtros de disponibilidad');
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    const loc = await seedLocation(ctx.db, biz.id);
    const soldOut = await seedOffer(ctx.db, biz.id, loc.id, { stock: 0 });
    const paused = await seedOffer(ctx.db, biz.id, loc.id, {
      is_active: false,
    });
    const closing = await seedOffer(ctx.db, biz.id, loc.id);
    await ctx.db
      .update(offers)
      .set({ pickup_end: new Date(Date.now() - HOUR) })
      .where(eq(offers.id, closing.id));
    // One live offer, so the category is present at all and the zeros below are
    // an exclusion rather than an absent row.
    const live = await seedOffer(ctx.db, biz.id, loc.id);
    await tag([soldOut, paused, closing, live], [cat.id]);

    expect(Number((await rowFor(cat.id))?.active_count)).toBe(1);
  });

  test('a multi-category offer inflates neither the count nor the page', async () => {
    // The reason the aggregate is a pre-aggregated subquery and not a join on
    // `offer_categories`: one offer carrying N categories emits N join rows, so
    // a naive join counts it N times AND — worse — makes `limit`/`offset` apply
    // to duplicated rows.
    const one = await seedCategory(ctx.db, ' multicat ');
    const two = await seedCategory(ctx.db, ' multicat 2');
    const three = await seedCategory(ctx.db, ' multicat 3');
    const { offers: live } = await liveOffers(1);
    await tag(live, [one.id, two.id, three.id]);

    expect(Number((await rowFor(one.id))?.active_count)).toBe(1);
    expect(Number((await rowFor(two.id))?.active_count)).toBe(1);
    expect(Number((await rowFor(three.id))?.active_count)).toBe(1);

    // And the ROW COUNT is unaffected: the total comes from a query over
    // `categories` alone, so it can never be multiplied by the aggregate either.
    const page = await repo.list({ page: 1, limit: 100 });
    expect(page.total).toBe(
      page.rows.length === 100 ? page.total : page.rows.length,
    );
    expect(page.rows.length).toBeLessThanOrEqual(100);
  });

  test('DIVERGENCE: an offer of an unapproved business is NOT counted, and the RPC counts it', async () => {
    // The one behaviour that makes this count DIFFERENT from the SQL, pinned on
    // both sides. Dropping the gate from `activeOfferCounts()` fails the second
    // assertion, and the first is what makes the second a statement about
    // moderation instead of about `is_active`.
    const cat = await seedCategory(ctx.db, 'Gated');
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    const loc = await seedLocation(ctx.db, biz.id);
    const offer = await seedOffer(ctx.db, biz.id, loc.id);
    await tag([offer], [cat.id]);

    expect(Number((await rowFor(cat.id))?.active_count)).toBe(1);

    // Suspend the merchant. The offer row is untouched: the availability trigger
    // fires on `offers` writes, and nothing runs when a `business_moderation`
    // row changes, so `is_active` stays true — the state the RPC reads.
    await ctx.db
      .update(businessModeration)
      .set({ verification_status: 'pending' })
      .where(eq(businessModeration.business_id, biz.id));

    const [raw] = await ctx.db
      .select({ is_active: offers.is_active, stock: offers.stock })
      .from(offers)
      .where(eq(offers.id, offer.id));
    expect(raw?.is_active).toBe(true);
    expect(raw?.stock).toBeGreaterThan(0);

    // The API reports 0 — the category still exists, it just has nothing
    // publicly reservable behind it.
    expect(Number((await rowFor(cat.id))?.active_count)).toBe(0);

    // The RPC's own subquery, verbatim, still counts it.
    const rpc = await ctx.db.execute<{ active_count: string }>(sql`
      select oc.category_id, count(*) as active_count
        from offers o
        join offer_categories oc on oc.offer_id = o.id
       where o.is_active and o.stock > 0 and o.pickup_end > now()
       group by oc.category_id
      having oc.category_id = ${cat.id}::uuid
    `);
    expect(rpc).toHaveLength(1);
    expect(Number(rpc[0]!.active_count)).toBe(1);
  });

  test('the list filters keep meaning what they meant before the aggregate', async () => {
    // `active` and `search` keep meaning exactly what they meant before the
    // aggregate joined: a 0-deal category is still an active category and still
    // matches its name.
    const cat = await seedCategory(ctx.db, 'Filtros de lista');
    expect(Number((await rowFor(cat.id))?.active_count)).toBe(0);

    const search = await repo.list({ page: 1, limit: 100, search: 'Filtros' });
    expect(search.rows.map((r) => r.id)).toContain(cat.id);
    expect(Number(search.rows.find((r) => r.id === cat.id)?.active_count)).toBe(
      0,
    );

    const active = await repo.list({ page: 1, limit: 100, active: true });
    expect(active.rows.map((r) => r.id)).toContain(cat.id);

    const inactive = await repo.list({ page: 1, limit: 100, active: false });
    expect(inactive.rows.map((r) => r.id)).not.toContain(cat.id);
  });
});
