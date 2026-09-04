import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedCategory,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { OffersRepository } from './offers.repository';

let ctx: TestDbContext;
let repo: OffersRepository;
let businessId: string;
let locationId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new OffersRepository(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  locationId = (await seedLocation(ctx.db, businessId)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('OffersRepository (DB real)', () => {
  test('insert + findById + update', async () => {
    const row = await repo.insert(ctx.db, {
      business_id: businessId,
      business_location_id: locationId,
      title: 'Pack',
      original_price: '8000',
      discounted_price: '3000',
      pickup_start: new Date(Date.now() - 1000),
      pickup_end: new Date(Date.now() + 3600_000),
    });
    const found = await repo.findById(row.id);
    expect(found?.title).toBe('Pack');
    expect(found?.business_name).toBeDefined();
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await repo.update(ctx.db, row.id, { title: 'Pack2' })).toMatchObject({
      title: 'Pack2',
    });
  });

  test('setCategories + findCategoryIds', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    const cat = await seedCategory(ctx.db);
    await repo.setCategories(ctx.db, offer.id, [cat.id]);
    expect(await repo.findCategoryIds(offer.id)).toEqual([cat.id]);
    await repo.setCategories(ctx.db, offer.id, []);
    expect(await repo.findCategoryIds(offer.id)).toEqual([]);
  });

  test('decrementStock/incrementStock', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    expect(await repo.decrementStock(ctx.db, offer.id, 2)).toBe(true);
    expect(await repo.incrementStock(ctx.db, offer.id, 1)).toBe(true);
    const found = await repo.findById(offer.id);
    expect(found?.stock).toBe(4);
  });

  test('findRandomActive solo activas con stock', async () => {
    await seedOffer(ctx.db, businessId, locationId, { is_active: false });
    for (let i = 0; i < 3; i++) {
      const row = await repo.findRandomActive();
      expect(row?.is_active).toBe(true);
    }
  });

  test('isBusinessOwner y locationBelongsToBusiness', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    expect(await repo.isBusinessOwner(biz.id, owner)).toBe(true);
    expect(await repo.isBusinessOwner(biz.id, businessId)).toBe(false);
    expect(await repo.locationBelongsToBusiness(locationId, businessId)).toBe(true);
    expect(await repo.locationBelongsToBusiness(locationId, biz.id)).toBe(false);
  });
});

describe('OffersRepository consultas (DB real)', () => {
  test('findMany con available_only y búsqueda', async () => {
    const all = await repo.findMany({ page: 1, limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(1);
    const avail = await repo.findMany({ page: 1, limit: 10, available_only: true });
    expect(avail.items.every((o) => o.is_active && o.stock > 0)).toBe(true);
    const search = await repo.findMany({ page: 1, limit: 10, search: 'pack' });
    expect(search.total).toBeGreaterThanOrEqual(1);
    const byBiz = await repo.findMany({ page: 1, limit: 10, business_id: businessId });
    expect(byBiz.items.every((o) => o.business_id === businessId)).toBe(true);
  });

  test('findBusinessIdsOwnedBy y findActiveCategoryIds', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    expect(await repo.findBusinessIdsOwnedBy(owner)).toContain(biz.id);
    const cat = await seedCategory(ctx.db);
    expect(await repo.findActiveCategoryIds([cat.id, '00000000-0000-0000-0000-000000000000'])).toEqual([
      cat.id,
    ]);
    expect(await repo.findActiveCategoryIds([])).toEqual([]);
  });

  test('findByIdForUpdate dentro de transacción', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    const found = await repo.transaction((tx) => repo.findByIdForUpdate(tx, offer.id));
    expect(found?.id).toBe(offer.id);
  });

  test('expireStale desactiva vencidas; candidatos a expirar', async () => {
    const stale = await repo.insert(ctx.db, {
      business_id: businessId,
      business_location_id: locationId,
      title: 'Vencida',
      original_price: '1000',
      discounted_price: '500',
      pickup_start: new Date(Date.now() - 7200_000),
      pickup_end: new Date(Date.now() - 3600_000),
    });
    expect(await repo.expireStale(new Date())).toBeGreaterThanOrEqual(1);
    expect(await repo.findById(stale.id)).toMatchObject({ is_active: false });

    const user = await seedProfile(ctx.db);
    const order = await seedOrder(ctx.db, user, stale.id, businessId);
    const cands = await repo.findOrderCandidatesToExpire(new Date());
    expect(cands.map((c) => c.orderId)).toContain(order.id);
  });
});
