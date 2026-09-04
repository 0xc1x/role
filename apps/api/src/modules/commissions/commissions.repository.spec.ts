import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { payouts } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedProfile } from '../../../test/seed';
import { CommissionsRepository } from './commissions.repository';

let ctx: TestDbContext;
let repo: CommissionsRepository;
let businessId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new CommissionsRepository(ctx.db);
  const owner = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, owner)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('CommissionsRepository (DB real)', () => {
  test('list + findById', async () => {
    const list = await repo.list({ page: 1, limit: 10 });
    expect(list.total).toBeGreaterThanOrEqual(1);
    const found = await repo.findById(businessId);
    expect(found?.has_pending_payouts).toBe(false);
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('list filtra por búsqueda', async () => {
    const res = await repo.list({ page: 1, limit: 10, search: 'negocio' });
    expect(res.total).toBeGreaterThanOrEqual(1);
  });

  test('hasPendingPayout detecta pending/processing', async () => {
    expect(await repo.hasPendingPayout(ctx.db, businessId)).toBe(false);
    await ctx.db.insert(payouts).values({
      business_id: businessId,
      period_start: '2025-01-01',
      period_end: '2025-01-15',
      gross_amount: '1000',
      platform_fee: '100',
      net_amount: '900',
      status: 'pending',
    });
    expect(await repo.hasPendingPayout(ctx.db, businessId)).toBe(true);
    expect(await repo.findById(businessId)).toMatchObject({
      has_pending_payouts: true,
    });
  });

  test('updateCommissionRate', async () => {
    const updated = await repo.updateCommissionRate(ctx.db, businessId, 15);
    expect(Number(updated?.commission_rate)).toBe(15);
  });
});
