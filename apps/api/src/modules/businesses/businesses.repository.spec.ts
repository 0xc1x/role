import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  businessFinance,
  businessModeration,
  businessOwnership,
  profiles,
} from '../../database/schema';
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
    expect(
      pending.items.every((b) => b.verification_status === 'pending'),
    ).toBe(true);
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

describe('BusinessesRepository companions (DB real)', () => {
  test('insert deja los companions escritos y el agregado los lee', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Con companions',
      slug: 'con-companions',
      commission_rate: '0.1500',
      verification_status: 'rejected',
      rejection_reason: 'Docs ilegibles',
    });

    // El agregado devuelve las columnas bajo sus nombres históricos.
    expect(row).toMatchObject({
      owner_id: ownerId,
      commission_rate: '0.1500',
      balance: '0.00',
      verification_status: 'rejected',
      rejection_reason: 'Docs ilegibles',
      verified_at: null,
      verified_by: null,
    });

    const [ownership] = await ctx.db
      .select()
      .from(businessOwnership)
      .where(eq(businessOwnership.business_id, row.id));
    const [finance] = await ctx.db
      .select()
      .from(businessFinance)
      .where(eq(businessFinance.business_id, row.id));
    const [moderation] = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(ownership?.owner_id).toBe(ownerId);
    expect(finance?.commission_rate).toBe('0.1500');
    expect(moderation?.verification_status).toBe('rejected');
  });

  test('update reparte el patch entre businesses y sus companions', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Patch',
      slug: 'patch-companions',
    });
    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');

    const updated = await repo.update(ctx.db, row.id, {
      name: 'Patch 2',
      commission_rate: '0.2000',
      verification_status: 'approved',
      verified_at: verifiedAt,
      verified_by: ownerId,
      rejection_reason: null,
    });
    expect(updated).toMatchObject({
      name: 'Patch 2',
      commission_rate: '0.2000',
      verification_status: 'approved',
      verified_at: verifiedAt,
      verified_by: ownerId,
      rejection_reason: null,
    });

    const [finance] = await ctx.db
      .select()
      .from(businessFinance)
      .where(eq(businessFinance.business_id, row.id));
    const [moderation] = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(finance?.commission_rate).toBe('0.2000');
    expect(moderation?.verification_status).toBe('approved');
    expect(moderation?.rejection_reason).toBeNull();
  });

  test('update sin cambios de companion no toca business_moderation', async () => {
    const row = await seedBusiness(ctx.db, ownerId);
    const before = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    await repo.update(ctx.db, row.id, { description: 'Solo texto' });
    const after = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(after[0]?.updated_at).toEqual(before[0]?.updated_at);
  });

  test('update de un negocio inexistente devuelve null', async () => {
    expect(
      await repo.update(ctx.db, '00000000-0000-0000-0000-000000000000', {
        name: 'No existe',
      }),
    ).toBeNull();
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
