import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedBusinessHours,
  seedLocation,
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
  test('only active, moderation-approved businesses are listed', async () => {
    const { items, total } = await repo.listPublic({ page: 1, limit: 20 });

    expect(items.map((b) => b.id)).toEqual([approved]);
    expect(total).toBe(1);
  });

  test('the projection carries no owner, money or moderation column', async () => {
    // The repository-side twin of the `PublicBusinessSchema` contract. If a
    // column is added to `businesses` and to `publicSelect`, the DTO has to be
    // widened deliberately or this test fails.
    const { items } = await repo.listPublic({ page: 1, limit: 1 });
    expect(Object.keys(items[0] ?? {}).sort()).toEqual([
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
    ]);
  });

  test('search filters on the name, and the count follows the same filter', async () => {
    const hit = await repo.listPublic({ page: 1, limit: 20, search: 'Panader' });
    expect(hit.items.map((b) => b.id)).toEqual([approved]);
    expect(hit.total).toBe(1);

    const miss = await repo.listPublic({ page: 1, limit: 20, search: 'zzzz' });
    expect(miss.items).toEqual([]);
    expect(miss.total).toBe(0);
  });

  test('a wildcard in the search is escaped, not interpreted', async () => {
    // `%` is the LIKE wildcard. Unescaped it would match every business, which
    // turns a search box into a full-catalog dump.
    const { items } = await repo.listPublic({ page: 1, limit: 20, search: '%' });
    expect(items).toEqual([]);
  });

  test('meta.total counts the whole gated set, not the page', async () => {
    const owner = await seedProfile(ctx.db);
    for (let i = 0; i < 4; i++) {
      await seedBusiness(ctx.db, owner, { name: `Extra ${i}` });
    }

    const page = await repo.listPublic({ page: 1, limit: 2 });
    expect(page.items).toHaveLength(2);
    // Four seeded above plus `approved`; the pending and inactive ones are not in
    // the set the count walks.
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
    await seedLocation(ctx.db, approved, { name: 'Centro' });
    await seedLocation(ctx.db, approved, { name: 'Sucursal Norte' });
    await seedLocation(ctx.db, approved, { name: 'Pausada', is_active: false });
    await seedLocation(ctx.db, pending, { name: 'Del pendiente' });

    const locations = await repo.listPublicLocations(approved);
    expect(locations.map((l) => l.name).sort()).toEqual(['Centro', 'Sucursal Norte']);
    // A location of another business is never in the answer, whatever its state.
    expect(locations.some((l) => l.business_id === pending)).toBe(false);
  });

  test('the headquarters sorts first', async () => {
    await ctx.db.execute(
      `update business_locations set is_headquarter = true where business_id = '${approved}' and name = 'Centro'`,
    );
    const locations = await repo.listPublicLocations(approved);
    expect(locations[0]?.name).toBe('Centro');
  });

  test('hours are monday-first regardless of insertion order', async () => {
    await seedBusinessHours(ctx.db, approved, { day: 'friday' });
    await seedBusinessHours(ctx.db, approved, { day: 'monday' });
    await seedBusinessHours(ctx.db, approved, { day: 'wednesday', is_closed: true });
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
