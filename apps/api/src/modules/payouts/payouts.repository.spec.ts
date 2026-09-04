import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { PayoutsRepository } from './payouts.repository';

let ctx: TestDbContext;
let repo: PayoutsRepository;
let userId: string;
let businessId: string;
let offerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new PayoutsRepository(ctx.db);
  userId = await seedProfile(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('PayoutsRepository (DB real)', () => {
  test('generate agrupa completed sin payout', async () => {
    await seedOrder(ctx.db, userId, offerId, businessId, {
      status: 'completed',
    });
    await seedOrder(ctx.db, userId, offerId, businessId, {
      status: 'pending',
    });
    expect(await repo.generate()).toBe(1);
    // Segunda corrida no regenera (órdenes ya vinculadas).
    expect(await repo.generate()).toBe(0);
  });

  test('list + findById + markPaid', async () => {
    const list = await repo.list({ page: 1, limit: 10 });
    expect(list.total).toBeGreaterThanOrEqual(1);
    const id = list.rows[0]?.id as string;
    const found = await repo.findById(id);
    expect(found?.business_id).toBe(businessId);
    expect(
      await repo.findById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
    expect(await repo.markPaid(id)).toMatchObject({ status: 'paid' });
    expect(
      await repo.markPaid('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });

  test('list filtra por negocio y estado', async () => {
    const paid = await repo.list({ page: 1, limit: 10, status: 'paid' });
    expect(paid.rows.every((r) => r.status === 'paid')).toBe(true);
    const biz = await repo.list({ page: 1, limit: 10, business_id: businessId });
    expect(biz.total).toBeGreaterThanOrEqual(1);
  });
});
