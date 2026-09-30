import { afterAll, beforeAll, describe, expect, jest, test } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedBusinessHours,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { BusinessesPublicService } from './businesses-public.service';
import { BusinessesRepository } from './businesses.repository';

let ctx: TestDbContext;
let service: BusinessesPublicService;
let repo: BusinessesRepository;
let approved = '';
let pending = '';
let inactive = '';
/** Set by the "nothing published" case; the list assertion below runs after it. */
let bareBusinessId = '';

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessesRepository(ctx.db);
  service = new BusinessesPublicService(repo);
  const owner = await seedProfile(ctx.db);

  approved = (await seedBusiness(ctx.db, owner, { name: 'Panadería Sur' })).id;
  pending = (
    await seedBusiness(ctx.db, owner, {
      name: 'En revisión',
      verification_status: 'pending',
    })
  ).id;
  inactive = (
    await seedBusiness(ctx.db, owner, { name: 'Desactivado', is_active: false })
  ).id;
});

afterAll(async () => {
  await ctx.stop();
});

/** Publishes a location and a schedule for a business the public must not see. */
async function publishFor(businessId: string): Promise<void> {
  await seedLocation(ctx.db, businessId, { name: 'Sucursal' });
  await seedBusinessHours(ctx.db, businessId, { day: 'monday' });
}

describe('BusinessesPublicService.storefront', () => {
  test('returns the business, its active locations and its weekly hours', async () => {
    await publishFor(approved);
    await seedLocation(ctx.db, approved, { name: 'Cerrada', is_active: false });
    await seedBusinessHours(ctx.db, approved, { day: 'friday' });

    const storefront = await service.storefront(approved);

    expect(storefront.business.id).toBe(approved);
    expect(storefront.locations.map((l) => l.name)).toEqual(['Sucursal']);
    expect(storefront.hours.map((h) => h.day)).toEqual(['monday', 'friday']);
    expect(storefront.hours[0]?.open_time).toBe('09:00:00');
  });

  test('a business in review is 404, and its hours and locations are never read', async () => {
    await publishFor(pending);
    const readLocations = jest.spyOn(repo, 'listPublicLocations');
    const readHours = jest.spyOn(repo, 'listPublicHours');

    // The invariant: without the gate, a business still in moderation review
    // would be publicly listable and its hours, locations and contact details
    // would be exposed before anyone approved it. The two spies are the proof
    // that the children are not merely filtered out of the response — they are
    // never fetched for a business that failed the gate.
    await expect(service.storefront(pending)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(readLocations).not.toHaveBeenCalled();
    expect(readHours).not.toHaveBeenCalled();

    readLocations.mockRestore();
    readHours.mockRestore();
  });

  test('a deactivated business is 404 on the same terms', async () => {
    await publishFor(inactive);

    await expect(service.storefront(inactive)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('an unknown id is 404 too — 403 would confirm the business exists', async () => {
    const error = await service
      .storefront('00000000-0000-0000-0000-000000000000')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
  });

  test('a business with nothing published answers with empty collections', async () => {
    const owner = await seedProfile(ctx.db);
    const bare = (await seedBusiness(ctx.db, owner)).id;
    bareBusinessId = bare;

    const storefront = await service.storefront(bare);
    expect(storefront.locations).toEqual([]);
    expect(storefront.hours).toEqual([]);
  });
});

describe('BusinessesPublicService.list', () => {
  test('paginates the gated set and never leaks a panel field', async () => {
    // `active_businesses_near` (ADR-0008): the list is built from live offers, so
    // both approved businesses need one. This is the service-level half of the
    // inner-join contract — before the mirror, a business with nothing to sell
    // was still listed, and the count included it.
    const owner = await seedProfile(ctx.db);
    for (const businessId of [approved, bareBusinessId]) {
      const loc = await seedLocation(ctx.db, businessId, { name: 'Sucursal' });
      await seedOffer(ctx.db, businessId, loc.id);
    }

    const page = await service.list({ page: 1, limit: 10 });

    // Two approved businesses by now: the seeded one and the bare one from the
    // previous case. The business in review and the deactivated one are not in
    // the set the count walks.
    expect(page.meta).toMatchObject({ page: 1, limit: 10, total: 2 });
    expect(page.data.map((b) => b.id).sort()).toEqual(
      [approved, bareBusinessId].sort(),
    );
    expect(Object.keys(page.data[0] ?? {})).not.toContain('owner_id');
    expect(Object.keys(page.data[0] ?? {})).not.toContain('balance');
    expect(Object.keys(page.data[0] ?? {})).not.toContain(
      'verification_status',
    );
    // `businesses.rating` is NOT NULL with a default of 0, so a business nobody
    // has reviewed yet reports 0 — the same value the panel DTO reports.
    expect(page.data[0]?.rating).toBe(0);
    expect(page.data[0]?.review_count).toBe(0);
    expect(page.data[0]?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('the list carries the offer aggregate, and the storefront does not', async () => {
    // The five `active_businesses_near` fields are OPTIONAL on the contract
    // precisely because these two reads differ. The list measures them; the
    // storefront reads a business through the same mapper with no aggregate
    // behind it, and must omit them rather than report a `0` it never counted.
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: 'Con aggregate',
    });
    const loc = await seedLocation(ctx.db, business.id, { name: 'Sucursal' });
    await seedOffer(ctx.db, business.id, loc.id);
    await seedOffer(ctx.db, business.id, loc.id);

    const { data } = await service.list({
      page: 1,
      limit: 50,
      search: 'Con aggregate',
    });
    const row = data[0]!;

    expect(row.active_deals_count).toBe(2);
    // No `lat`/`lng` in the request, so the distance is a measured `null` and the
    // location is still named.
    expect(row.distance_km).toBeNull();
    expect(row.business_location_id).toBe(loc.id);
    expect(row.address).toBe('Calle 123');
    expect(row.latitude).toBe(-33.45);
    expect(row.longitude).toBe(-70.66);
    expect(row.zone).toBeNull();

    const storefront = await service.storefront(business.id);
    expect(storefront.business.id).toBe(business.id);
    expect(Object.keys(storefront.business)).not.toContain(
      'active_deals_count',
    );
    expect(Object.keys(storefront.business)).not.toContain('distance_km');
    expect(Object.keys(storefront.business)).not.toContain(
      'business_location_id',
    );
  });

  test('the geo parameters reach the service untouched', async () => {
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, { name: 'Geo service' });
    const loc = await seedLocation(ctx.db, business.id, {
      name: 'Sucursal',
      latitude: '-33.44',
      longitude: '-70.66',
    });
    await seedOffer(ctx.db, business.id, loc.id);

    const { data } = await service.list({
      page: 1,
      limit: 50,
      search: 'Geo service',
      lat: -33.45,
      lng: -70.66,
      radius_km: 5,
      sort: 'distance',
    });

    expect(data[0]?.active_deals_count).toBe(1);
    // 0.01 deg north of the searched point, measured on this PostGIS database.
    expect(data[0]?.distance_km ?? -1).toBeGreaterThan(1.09);
    expect(data[0]?.distance_km ?? -1).toBeLessThan(1.13);
  });
});
