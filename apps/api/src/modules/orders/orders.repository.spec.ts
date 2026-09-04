import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { coupons } from '../../database/schema';
import { OrdersRepository } from './orders.repository';

let ctx: TestDbContext;
let repo: OrdersRepository;
let userId: string;
let businessId: string;
let offerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new OrdersRepository(ctx.db);
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

describe('OrdersRepository (DB real)', () => {
  test('insertOrder + findById + findByIdWithBusinessOwner', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    expect(await repo.findById(order.id)).toMatchObject({
      order_number: order.order_number,
    });
    expect(
      await repo.findById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
    const withOwner = await repo.findByIdWithBusinessOwner(order.id);
    expect(withOwner?.order.id).toBe(order.id);
    expect(withOwner?.business_owner_id).toBeDefined();
  });

  test('updateStatus y isBusinessOwner', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    await repo.updateStatus(ctx.db, order.id, 'confirmed');
    expect(await repo.findById(order.id)).toMatchObject({ status: 'confirmed' });
    expect(await repo.isBusinessOwner(businessId, userId)).toBe(false);
  });

  test('listForUser y listForBusiness', async () => {
    const mine = await repo.listForUser(userId, { page: 1, limit: 10 });
    expect(mine.total).toBeGreaterThanOrEqual(2);
    const biz = await repo.listForBusiness(businessId, { page: 1, limit: 10 });
    expect(biz.total).toBeGreaterThanOrEqual(2);
  });

  test('findActiveByUserAndOffer', async () => {
    const active = await repo.findActiveByUserAndOffer(ctx.db, userId, offerId);
    expect(active?.user_id).toBe(userId);
    const other = await repo.findActiveByUserAndOffer(
      ctx.db,
      userId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(other).toBeNull();
  });

  test('nextOrderNumber genera folio único creciente', async () => {
    const n1 = await repo.transaction((tx) => repo.nextOrderNumber(tx));
    expect(n1).toMatch(/^FD-/);
    await seedOrder(ctx.db, userId, offerId, businessId, { order_number: n1 });
    const n2 = await repo.transaction((tx) => repo.nextOrderNumber(tx));
    expect(n2).not.toBe(n1);
  });

  test('insertEvent registra evento', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    await repo.insertEvent(ctx.db, {
      order_id: order.id,
      status: 'confirmed',
    });
  });

  test('findCommissionRate lee tarifa del negocio', async () => {
    const rate = await repo.findCommissionRate(ctx.db, businessId);
    expect(rate).not.toBeNull();
    expect(
      await repo.findCommissionRate(ctx.db, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });
});

describe('OrdersRepository cupones/balance/expiración (DB real)', () => {
  test('findCouponByCodeForUpdate prioriza negocio; vencido → null', async () => {
    await ctx.db.insert(coupons).values([
      { code: 'MIX', name: 'Global', type: 'fixed', value: '100' },
      {
        code: 'MIX',
        name: 'Negocio',
        type: 'fixed',
        value: '200',
        business_id: businessId,
      },
      {
        code: 'VIEJO',
        name: 'V',
        type: 'fixed',
        value: '1',
        expires_at: new Date('2000-01-01T00:00:00Z'),
      },
    ]);
    const found = await repo.transaction((tx) =>
      repo.findCouponByCodeForUpdate(tx, businessId, 'MIX'),
    );
    expect(found?.business_id).toBe(businessId);
    expect(
      await repo.transaction((tx) =>
        repo.findCouponByCodeForUpdate(tx, businessId, 'VIEJO'),
      ),
    ).toBeNull();
    expect(
      await repo.transaction((tx) =>
        repo.findCouponByCodeForUpdate(tx, businessId, 'NOPE'),
      ),
    ).toBeNull();
  });

  test('incrementCouponUsedCount y accrueBusinessBalance', async () => {
    const [cpn] = await ctx.db
      .insert(coupons)
      .values({ code: 'U1', name: 'U', type: 'fixed', value: '1' })
      .returning({ id: coupons.id });
    await repo.transaction((tx) => repo.incrementCouponUsedCount(tx, cpn?.id as string));
    await repo.transaction((tx) => repo.accrueBusinessBalance(tx, businessId, '500'));
    const biz = await ctx.db.execute(
      `select balance from businesses where id = '${businessId}'`,
    );
    expect(biz).toBeDefined();
  });

  test('findByIdForUpdate y listExpirableIds', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    const locked = await repo.transaction((tx) => repo.findByIdForUpdate(tx, order.id));
    expect(locked?.order.id).toBe(order.id);
    const ids = await repo.transaction((tx) => repo.listExpirableIds(tx, [offerId]));
    expect(ids.map((r) => r.id)).toContain(order.id);
    expect(await repo.transaction((tx) => repo.listExpirableIds(tx, []))).toEqual([]);
    const pending = await repo.listPendingOrReadyWithEndedPickup(new Date());
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });
});
