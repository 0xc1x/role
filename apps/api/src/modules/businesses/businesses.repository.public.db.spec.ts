import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedBusinessHours,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { BusinessesRepository } from './businesses.repository';

let ctx: TestDbContext;
let repo: BusinessesRepository;
let approved = '';
let pending = '';
let inactive = '';

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessesRepository(ctx.db);
  const owner = await seedProfile(ctx.db);

  approved = (await seedBusiness(ctx.db, owner, { name: 'Panadería Sur' })).id;
  pending = (
    await seedBusiness(ctx.db, owner, {
      name: 'Pendiente',
      verification_status: 'pending',
    })
  ).id;
  inactive = (
    await seedBusiness(ctx.db, owner, { name: 'Inactivo', is_active: false })
  ).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('BusinessesRepository.listPublic', () => {
  test('only active, moderation-approved businesses with a LIVE OFFER are listed', async () => {
    // `active_businesses_near` (ADR-0008): the list is built from live offers, so
    // a business with none is absent rather than listed with a count of `0`. The
    // offer is what makes the approved row appear at all — which is the whole
    // difference between this being a business list and being a directory.
    const loc = await seedLocation(ctx.db, approved, { name: 'Sucursal' });
    await seedOffer(ctx.db, approved, loc.id);
    // A published location and nothing else for the other two: the gate still
    // keeps them out, and now the aggregate does too.
    await seedLocation(ctx.db, pending, { name: 'Del pendiente' });
    await seedLocation(ctx.db, inactive, { name: 'Del inactivo' });

    const { items, total } = await repo.listPublic({ page: 1, limit: 20 });

    expect(items.map((b) => b.id)).toEqual([approved]);
    expect(total).toBe(1);
  });

  test('the projection carries no owner, money or moderation column', async () => {
    // The repository-side twin of the `PublicBusinessSchema` contract. If a
    // column is added to `businesses` and to `publicSelect`, the DTO has to be
    // widened deliberately or this test fails.
    const { items } = await repo.listPublic({ page: 1, limit: 1 });
    // The fourteen public business columns, plus the five
    // `active_businesses_near` fields. Split by origin on purpose: a future
    // column added to one group and not the other is a mistake, and a flat list
    // would not say which.
    const businessColumns = [
      'cover_image',
      'created_at',
      'description',
      'email',
      'id',
      'image',
      'name',
      'phone',
      'rating',
      'review_count',
      'slug',
      'type',
      'updated_at',
      'website',
    ];
    const nearColumns = [
      'active_deals_count',
      'address',
      'business_location_id',
      'distance_km',
      'latitude',
      'longitude',
      'zone',
    ];
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      [...businessColumns, ...nearColumns].sort(),
    );
  });

  test('search filters on the name, and the count follows the same filter', async () => {
    const hit = await repo.listPublic({
      page: 1,
      limit: 20,
      search: 'Panader',
    });
    expect(hit.items.map((b) => b.id)).toEqual([approved]);
    expect(hit.total).toBe(1);

    const miss = await repo.listPublic({ page: 1, limit: 20, search: 'zzzz' });
    expect(miss.items).toEqual([]);
    expect(miss.total).toBe(0);
  });

  test('a wildcard in the search is escaped, not interpreted', async () => {
    // `%` is the LIKE wildcard. Unescaped it would match every business, which
    // turns a search box into a full-catalog dump.
    //
    // It USED TO be a divergence: `active_businesses_near` concatenated
    // `'%'||p_search||'%'` raw, the same way the offers feed did, and this route
    // escaped it anyway. `20260928041036_explore_search_escape_wildcards.sql`
    // made the function escape too, so the two surfaces now agree and this is
    // simply a property of the route. The escape CHARACTER still differs — `\`
    // here, `!` there — and the offers spec pins that the difference is invisible
    // in the result.
    const { items } = await repo.listPublic({
      page: 1,
      limit: 20,
      search: '%',
    });
    expect(items).toEqual([]);
  });

  test('meta.total counts the whole gated, offer-backed set, not the page', async () => {
    const owner = await seedProfile(ctx.db);
    for (let i = 0; i < 4; i++) {
      const extra = await seedBusiness(ctx.db, owner, { name: `Extra ${i}` });
      const extraLoc = await seedLocation(ctx.db, extra.id, {
        name: 'Sucursal',
      });
      await seedOffer(ctx.db, extra.id, extraLoc.id);
    }
    // One approved business with NO offer: it is absent from the count too, which
    // is the point — `total` is the size of the set the page walks, and the page
    // walks businesses that have a live offer.
    await seedBusiness(ctx.db, owner, { name: 'Extra sin oferta' });

    const page = await repo.listPublic({ page: 1, limit: 2 });
    expect(page.items).toHaveLength(2);
    // Four seeded above plus `approved`; the pending and inactive ones are not in
    // the set the count walks, and neither is the offer-less one.
    expect(page.total).toBe(5);
  });
});

describe('BusinessesRepository.findPublicById', () => {
  test('returns the row for an active, approved business', async () => {
    const row = await repo.findPublicById(approved);
    expect(row?.id).toBe(approved);
    expect(row?.name).toBe('Panadería Sur');
  });

  test('returns null for unapproved, inactive and unknown ids alike', async () => {
    // One `null` for all three, because the service turns it into one 404. A 403
    // for two of them would confirm the id exists.
    expect(await repo.findPublicById(pending)).toBeNull();
    expect(await repo.findPublicById(inactive)).toBeNull();
    expect(
      await repo.findPublicById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });
});

describe('BusinessesRepository public children', () => {
  test('locations are scoped to the business and only the active ones', async () => {
    // A business of this test's own, not `approved`: the `listPublic` block above
    // seeds locations for `approved` too, and sharing one business between two
    // blocks makes each one's assertions depend on the other having run.
    const owner = await seedProfile(ctx.db);
    const scoped = await seedBusiness(ctx.db, owner, {
      name: 'Con sucursales',
    });
    await seedLocation(ctx.db, scoped.id, { name: 'Centro' });
    await seedLocation(ctx.db, scoped.id, { name: 'Sucursal Norte' });
    await seedLocation(ctx.db, scoped.id, {
      name: 'Pausada',
      is_active: false,
    });
    await seedLocation(ctx.db, pending, { name: 'Del pendiente' });

    const locations = await repo.listPublicLocations(scoped.id);
    expect(locations.map((l) => l.name).sort()).toEqual([
      'Centro',
      'Sucursal Norte',
    ]);
    // A location of another business is never in the answer, whatever its state.
    expect(locations.some((l) => l.business_id === pending)).toBe(false);
  });

  test('the headquarters sorts first', async () => {
    await ctx.db.execute(
      `update business_locations set is_headquarter = true where business_id = '${approved}' and name = 'Sucursal'`,
    );
    const locations = await repo.listPublicLocations(approved);
    expect(locations[0]?.name).toBe('Sucursal');
  });

  test('hours are monday-first regardless of insertion order', async () => {
    await seedBusinessHours(ctx.db, approved, { day: 'friday' });
    await seedBusinessHours(ctx.db, approved, { day: 'monday' });
    await seedBusinessHours(ctx.db, approved, {
      day: 'wednesday',
      is_closed: true,
    });
    await seedBusinessHours(ctx.db, pending, { day: 'monday' });

    const hours = await repo.listPublicHours(approved);
    expect(hours.map((h) => h.day)).toEqual(['monday', 'wednesday', 'friday']);
    expect(hours.every((h) => h.business_id === approved)).toBe(true);
    expect(hours.find((h) => h.day === 'wednesday')?.is_closed).toBe(true);
  });

  test('a business with no published schedule is an empty list, not an error', async () => {
    expect(await repo.listPublicHours(inactive)).toEqual([]);
  });
});
