import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { profiles } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedLocation, seedProfile } from '../../../test/seed';
import { BusinessesRepository } from './businesses.repository';

let ctx: TestDbContext;
let repo: BusinessesRepository;
let ownerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessesRepository(ctx.db);
  ownerId = randomUUID();
  await ctx.db.insert(profiles).values({ id: ownerId, email: 'owner@biz.cl' });
});

afterAll(async () => {
  await ctx.stop();
});

describe('BusinessesRepository (DB real)', () => {
  test('insert crea preferencias + findById/findBySlug', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Panadería',
      slug: 'panaderia',
    });
    expect(await repo.findById(row.id)).toMatchObject({ name: 'Panadería' });
    expect(await repo.findBySlug('panaderia')).toMatchObject({ id: row.id });
    expect(await repo.findBySlug('nope')).toBeNull();
  });

  test('isOwner y findIdsOwnedBy', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Café',
      slug: 'cafe',
    });
    expect(await repo.isOwner(row.id, ownerId)).toBe(true);
    expect(await repo.isOwner(row.id, randomUUID())).toBe(false);
    expect(await repo.findIdsOwnedBy(ownerId)).toContain(row.id);
  });

  test('listForUser filtra por owner y estado', async () => {
    const mine = await repo.listForUser(ownerId, { page: 1, limit: 10 });
    expect(mine.total).toBeGreaterThanOrEqual(2);
    const other = await repo.listForUser(randomUUID(), { page: 1, limit: 10 });
    expect(other.total).toBe(0);
    const pending = await repo.listForUser(ownerId, {
      page: 1,
      limit: 10,
      verification_status: 'pending',
    });
    expect(pending.items.every((b) => b.verification_status === 'pending')).toBe(
      true,
    );
  });

  test('listAll busca y filtra', async () => {
    const res = await repo.listAll({ page: 1, limit: 10, search: 'panad' });
    expect(res.items.map((b) => b.name)).toContain('Panadería');
  });

  test('update', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Tmp',
      slug: 'tmp',
    });
    expect(await repo.update(ctx.db, row.id, { name: 'Tmp2' })).toMatchObject({
      name: 'Tmp2',
    });
  });
});

describe('BusinessesRepository extras (DB real)', () => {
  test('hasPendingPayout y locationBelongsToBusiness', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = (await seedBusiness(ctx.db, owner)).id;
    expect(await repo.hasPendingPayout(biz)).toBe(false);
    await ctx.db.execute(
      `insert into payouts (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status) values ('${biz}', '2025-01-01', '2025-01-15', 100, 10, 90, 'processing')`,
    );
    expect(await repo.hasPendingPayout(biz)).toBe(true);
    const loc = await seedLocation(ctx.db, biz);
    expect(await repo.locationBelongsToBusiness(loc.id, biz)).toBe(true);
    expect(await repo.locationBelongsToBusiness(loc.id, ownerId)).toBe(false);
  });
});
