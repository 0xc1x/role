import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { businessFinance, coupons, orderEvents } from '../../database/schema';
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
    expect(await repo.findById(order.id)).toMatchObject({
      status: 'confirmed',
    });
    expect(await repo.isBusinessOwner(businessId, userId)).toBe(false);
  });

  test('el trigger de estado es la única autoridad y registra una vez', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    await ctx.db.delete(orderEvents).where(eq(orderEvents.order_id, order.id));

    await repo.transaction(async (tx) => {
      await repo.setEventActor(tx, userId);
      await repo.updateStatus(tx, order.id, 'confirmed');
    });

    const events = await ctx.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.order_id, order.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: 'confirmed',
      previous_status: 'pending',
      changed_by: userId,
    });
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

  test('nextOrderNumber es único bajo reservas concurrentes', async () => {
    const folios = await Promise.all(
      Array.from({ length: 24 }, () =>
        repo.transaction((tx) => repo.nextOrderNumber(tx)),
      ),
    );

    expect(folios).toHaveLength(24);
    expect(new Set(folios).size).toBe(24);
    for (const orderNumber of folios) {
      expect(orderNumber).toMatch(/^FD-\d{4}-\d{4}-\d{3,}$/);
      await seedOrder(ctx.db, userId, offerId, businessId, {
        order_number: orderNumber,
      });
    }
  });

  test('idempotency key is unique per user', async () => {
    await seedOrder(ctx.db, userId, offerId, businessId, {
      idempotency_key: 'reservation-key-1',
    });

    await expect(
      seedOrder(ctx.db, userId, offerId, businessId, {
        idempotency_key: 'reservation-key-1',
      }),
    ).rejects.toThrow();
  });

  test('findCommissionRate lee tarifa del negocio', async () => {
    const rate = await repo.findCommissionRate(ctx.db, businessId);
    expect(rate).not.toBeNull();
    expect(
      await repo.findCommissionRate(
        ctx.db,
        '00000000-0000-0000-0000-000000000000',
      ),
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
    await repo.transaction((tx) =>
      repo.incrementCouponUsedCount(tx, cpn?.id as string),
    );
    await repo.transaction((tx) =>
      repo.accrueBusinessBalance(tx, businessId, '500'),
    );
    // El saldo vive en business_finance (se movió fuera de businesses).
    const [finance] = await ctx.db
      .select({ balance: businessFinance.balance })
      .from(businessFinance)
      .where(eq(businessFinance.business_id, businessId));
    expect(finance?.balance).toBe('500.00');
  });

  test('findByIdForUpdate bloquea la orden', async () => {
    const order = await seedOrder(ctx.db, userId, offerId, businessId);
    const locked = await repo.transaction((tx) =>
      repo.findByIdForUpdate(tx, order.id),
    );
    expect(locked?.order.id).toBe(order.id);
  });
});
