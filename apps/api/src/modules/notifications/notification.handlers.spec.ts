import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { businessOwnership, favorites } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { NotificationHandlers } from './notification.handlers';
import { NotificationsRepository } from './notifications.repository';
import type { NotificationsService } from './notifications.service';

let ctx: TestDbContext;
let handlers: NotificationHandlers;
let send: ReturnType<typeof mockSend>;

const mockSend = () => {
  const calls: Array<{ userIds: string[]; payload: unknown; opts?: unknown }> =
    [];
  return {
    calls,
    service: {
      send: async (userIds: string[], payload: unknown, opts?: unknown) => {
        calls.push({ userIds, payload, opts });
      },
    } as unknown as NotificationsService,
  };
};

let userId: string;
let businessId: string;
let offerId: string;
let orderId: string;
let businessOwnerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  send = mockSend();
  handlers = new NotificationHandlers(
    ctx.db,
    send.service,
    new NotificationsRepository(ctx.db),
  );
  userId = await seedProfile(ctx.db);
  const owner = await seedProfile(ctx.db);
  businessOwnerId = owner;
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
  orderId = (await seedOrder(ctx.db, userId, offerId, businessId)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('NotificationHandlers.onOrderStatusChanged (DB real)', () => {
  test('orden inexistente no envía', async () => {
    await handlers.onOrderStatusChanged('00000000-0000-0000-0000-000000000000');
    expect(send.calls).toHaveLength(0);
  });

  test('pending notifica consumidor + negocio', async () => {
    await handlers.onOrderStatusChanged(orderId);
    expect(send.calls.length).toBeGreaterThanOrEqual(1);
    expect(send.calls[0]?.userIds).toEqual([userId]);
    // El owner llega desde business_ownership, no desde businesses.
    expect(
      send.calls.some((call) => call.userIds.includes(businessOwnerId)),
    ).toBe(true);
  });

  /**
   * `business_ownership` no es un permiso acá: es una REGLA DE PRESENCIA.
   *
   * El handler resuelve «a quién se avisa del pedido» con un `INNER JOIN`
   * contra esa tabla, así que un negocio SIN fila de propiedad devuelve cero
   * filas y el `if (!row) return;` se come la notificación entera: no se avisa
   * ni al comprador ni al negocio, sin error y sin log.
   *
   * El fixture de este test es exactamente el estado que Plan 3 va a
   * producir si dropea la tabla sin mover este lector: el negocio conserva su
   * membresía de dueño —la fuente de verdad que viene— y pierde la fila vieja.
   *
   * El test existe para que ese cambio sea una EDICIÓN deliberada y visible, y
   * no una eliminación silenciosa que apague todas las push del negocio.
   */
  test('un negocio SIN fila en business_ownership no notifica a nadie', async () => {
    send.calls.length = 0;

    const owner = await seedProfile(ctx.db);
    const buyer = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    // El negocio se queda con su membresía de dueño y SIN la fila de propiedad.
    await ctx.db
      .delete(businessOwnership)
      .where(eq(businessOwnership.business_id, biz.id));
    const loc = await seedLocation(ctx.db, biz.id);
    const offer = await seedOffer(ctx.db, biz.id, loc.id);
    const order = await seedOrder(ctx.db, buyer, offer.id, biz.id);

    await handlers.onOrderStatusChanged(order.id);

    // CERO avisos: ni el comprador ni el negocio.
    expect(send.calls).toHaveLength(0);
  });
});

describe('NotificationHandlers.onOfferCreated (DB real)', () => {
  test('sin favoritos no envía; con favorito sí', async () => {
    send.calls.length = 0;
    await handlers.onOfferCreated(offerId);
    expect(send.calls).toHaveLength(0);
    await ctx.db
      .insert(favorites)
      .values({ user_id: userId, offer_id: offerId });
    await handlers.onOfferCreated(offerId);
    expect(send.calls).toHaveLength(1);
    expect(send.calls[0]?.userIds).toEqual([userId]);
    await handlers.onOfferCreated('00000000-0000-0000-0000-000000000000');
    expect(send.calls).toHaveLength(1);
  });
});

describe('NotificationHandlers crons (DB real)', () => {
  test('weeklySummary notifica a usuarios con favoritos', async () => {
    expect(await handlers.weeklySummary()).toBeGreaterThanOrEqual(1);
  });

  test('dispatchNearbyOffers con oferta activa', async () => {
    expect(await handlers.dispatchNearbyOffers()).toBeGreaterThanOrEqual(1);
  });

  test('pickupReminders con dedupe', async () => {
    const first = await handlers.pickupReminders();
    expect(first).toBeGreaterThanOrEqual(0);
    const second = await handlers.pickupReminders();
    expect(second).toBe(0);
  });

  test('cleanupOldTokens delega', async () => {
    expect(await handlers.cleanupOldTokens()).toBe(0);
  });
});
