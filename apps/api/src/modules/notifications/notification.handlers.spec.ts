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
    // El owner llega desde la membresía de dueño, no desde businesses.
    expect(
      send.calls.some((call) => call.userIds.includes(businessOwnerId)),
    ).toBe(true);
  });

  /**
   * `business_ownership` no era un permiso acá: era una REGLA DE PRESENCIA, y
   * la regla ahora la dice el modelo de membresías.
   *
   * El handler resuelve «a quién se avisa del pedido» con un `INNER JOIN`
   * contra la tabla de dueño, así que un negocio SIN fila de dueño devolvía
   * cero filas y el `if (!row) return;` se comía la notificación entera: no se
   * avisaba ni al comprador ni al negocio, sin error y sin log.
   *
   * ─── LA REGLA NUEVA, DICHA ───────────────────────────────────────────────────
   *
   * La presencia la decide la **MEMBRESÍA DE DUEÑO VIVA**: `role = 'owner'`,
   * `deleted_at is null` y `status = 'active'` —las tres mitades con las que
   * la base define «alguien es el dueño» (`public.business_member_role` y
   * `public.business_live_owner_count`)—. La fila vieja no participa.
   *
   * ─── POR QUÉ HAY DOS TESTS Y NO UNO ──────────────────────────────────────────
   *
   * Porque el cambio es DELIBERADO y visible, y un solo test no lo declara:
   *
   *  - sin dueño vivo, NO se avisa a nadie (y tampoco hay error ni log);
   *  - con dueño vivo, SÍ se avisa, aunque el negocio no tenga la fila vieja.
   *
   * El segundo es el que dice que la fila vieja ya no gobierna nada: si el
   * `INNER JOIN` contra `business_ownership` se quedara, ese test falla. Y el
   * primero es el que dice que la fila vieja tampoco alcanza para AVISAR: si
   * el `INNER JOIN` se hubiera cambiado por un `LEFT JOIN`, ese test fallaría.
   *
   * Los dos se pusieron rojos antes del cambio: el primero porque el
   * `INNER JOIN` viejo notificaba, el segundo porque el `INNER JOIN` viejo se
   * comía el handler entero.
   */
  test('un negocio SIN dueño vivo no notifica a nadie', async () => {
    send.calls.length = 0;

    const owner = await seedProfile(ctx.db);
    const buyer = await seedProfile(ctx.db);
    // El negocio TIENE la fila vieja y NO tiene membresía de dueño: es el
    // estado que decide la regla nueva, y el que la regla vieja resolvía al
    // revés.
    const biz = await seedBusiness(ctx.db, owner, { owner_membership: false });
    const loc = await seedLocation(ctx.db, biz.id);
    const offer = await seedOffer(ctx.db, biz.id, loc.id);
    const order = await seedOrder(ctx.db, buyer, offer.id, biz.id);

    await handlers.onOrderStatusChanged(order.id);

    // CERO avisos: ni el comprador ni el negocio.
    expect(send.calls).toHaveLength(0);
  });

  test('un negocio con dueño vivo notifica, aunque no tenga la fila vieja', async () => {
    send.calls.length = 0;

    const owner = await seedProfile(ctx.db);
    const buyer = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    // El negocio conserva su membresía de dueño y PIERDE la fila vieja: el
    // estado que produce el `drop table` de la Task 10.
    await ctx.db
      .delete(businessOwnership)
      .where(eq(businessOwnership.business_id, biz.id));
    const loc = await seedLocation(ctx.db, biz.id);
    const offer = await seedOffer(ctx.db, biz.id, loc.id);
    const order = await seedOrder(ctx.db, buyer, offer.id, biz.id);

    await handlers.onOrderStatusChanged(order.id);

    // Los DOS avisos: el del comprador y el del negocio.
    expect(send.calls.length).toBeGreaterThanOrEqual(2);
    expect(send.calls[0]?.userIds).toEqual([buyer]);
    expect(
      send.calls.some((call) => call.userIds.includes(owner)),
      'el negocio con dueño vivo no recibió el aviso. La fila vieja dejó de ' +
        'gobernar la presencia, y la membresía de dueño la gobierna.',
    ).toBe(true);
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
