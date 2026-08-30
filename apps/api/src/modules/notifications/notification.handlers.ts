import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  favorites,
  offers,
  orders,
  orderEvents,
  businesses,
  businessNotificationPreferences,
} from '../../database/schema';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationHandlers {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notificationsService: NotificationsService,
    private readonly repo: NotificationsRepository,
  ) {}

  async onOrderStatusChanged(orderId: string): Promise<void> {
    const [row] = await this.db
      .select({
        order: orders,
        business_owner_id: businesses.owner_id,
        business_name: businesses.name,
        business_image: businesses.image,
        offer_image: offers.image,
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .innerJoin(offers, eq(orders.offer_id, offers.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return;

    const STATUS_LABELS: Record<string, string> = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      ready_for_pickup: 'Listo para recoger',
      picked_up: 'Recogido',
      completed: 'Completado',
      cancelled: 'Cancelado',
      expired: 'Expirado',
    };
    const STATUS_MESSAGES: Record<string, { consumer: string; business: string }> = {
      pending: { consumer: 'Reserva creada. Espera la confirmación del negocio.', business: 'Nueva reserva recibida. Confirma el pedido.' },
      confirmed: { consumer: 'Tu pedido ha sido confirmado. Prepara tu código de recogida.', business: 'Nuevo pedido confirmado. Prepara el pedido.' },
      ready_for_pickup: { consumer: 'Tu pedido está listo para recoger. ¡No esperes demasiado!', business: 'El pedido está marcado como listo para recoger.' },
      picked_up: { consumer: 'Gracias por recoger tu pedido. ¡Buen provecho!', business: 'El cliente ha recogido su pedido.' },
      completed: { consumer: 'Pedido completado. Cuéntanos cómo fue tu experiencia.', business: 'Pedido completado exitosamente.' },
      cancelled: { consumer: 'Tu pedido ha sido cancelado.', business: 'El pedido ha sido cancelado.' },
      expired: { consumer: 'El tiempo para recoger tu pedido ha expirado.', business: 'El pedido ha expirado por falta de recogida.' },
    };
    const label = STATUS_LABELS[row.order.status] ?? row.order.status;
    const msgs = STATUS_MESSAGES[row.order.status];
    const image = row.offer_image ?? row.business_image ?? undefined;
    const baseData = (extra: Record<string, string>): Record<string, string> => ({
      type: 'order',
      order_id: orderId,
      order_number: row.order.order_number,
      status: row.order.status,
      icon: '/icons/Icon-192.png',
      badge: '/icons/Icon-72.png',
      tag: `order-${orderId}-${row.order.status}`,
      ...(image ? { image } : {}),
      ...extra,
    });

    await this.notificationsService.send([row.order.user_id], {
      title: `${row.business_name ?? 'Rolé'} — ${label}`,
      body: msgs?.consumer ?? `Tu pedido cambió a ${label}`,
      data: baseData({ link: `/order/${orderId}` }),
    });

    // Espejo dormido: pending (nueva reserva) + confirmed/cancelled/expired — respeta new_orders_enabled
    if (['pending', 'confirmed', 'cancelled', 'expired'].includes(row.order.status)) {
      const [prefs] = await this.db
        .select()
        .from(businessNotificationPreferences)
        .where(eq(businessNotificationPreferences.business_id, row.order.business_id))
        .limit(1);
      const pushOk = (prefs as unknown as { push_enabled?: boolean } | undefined)?.push_enabled !== false;
      const newOrdersOk = (prefs as unknown as { new_orders_enabled?: boolean } | undefined)?.new_orders_enabled !== false || row.order.status !== 'pending';
      if (pushOk && newOrdersOk) {
        await this.notificationsService.send([row.business_owner_id], {
          title: row.order.status === 'pending' ? `Nueva reserva #${row.order.order_number} — ${row.business_name}` : `Pedido #${row.order.order_number} — ${label}`,
          body: msgs?.business ?? `Pedido ${row.order.order_number} → ${label}`,
          data: baseData({ link: `/(business)/orders`, role: 'business', tag: `order-${orderId}-biz-${row.order.status}` }),
        });
      }
    }
  }

  async onOfferCreated(offerId: string): Promise<void> {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(eq(offers.id, offerId))
      .limit(1);
    if (!offer) return;

    const [business] = await this.db.select({ name: businesses.name, image: businesses.image }).from(businesses).where(eq(businesses.id, offer.business_id)).limit(1);

    const favUsers = await this.db
      .select({ user_id: favorites.user_id })
      .from(favorites)
      .innerJoin(offers, eq(favorites.offer_id, offers.id))
      .where(eq(offers.business_id, offer.business_id))
      .groupBy(favorites.user_id);

    const userIds = favUsers.map((r) => r.user_id);
    if (userIds.length === 0) return;

    const image = offer.image ?? business?.image ?? undefined;
    await this.notificationsService.send(
      userIds,
      {
        title: `${business?.name ?? 'Negocio'} publicó una nueva oferta`,
        body: `${offer.title} por $${offer.discounted_price}. ¡Rescátala antes de que se agote!`,
        data: {
          link: `/offer/${offerId}`,
          type: 'favorite_alert',
          offer_id: offerId,
          business_id: offer.business_id,
          icon: '/icons/Icon-192.png',
          badge: '/icons/Icon-72.png',
          tag: `offer-${offerId}`,
          ...(image ? { image } : {}),
        },
      },
      { prefFlag: 'favorite_alerts_enabled' },
    );
  }

  async pickupReminders(): Promise<number> {
    const candidates = await this.db
      .select({
        id: orders.id,
        user_id: orders.user_id,
        pickup_end: offers.pickup_end,
      })
      .from(orders)
      .innerJoin(offers, eq(orders.offer_id, offers.id))
      .where(
        and(
          inArray(orders.status, ['pending', 'confirmed', 'ready_for_pickup']),
          gte(offers.pickup_end, sql`now()`),
          lte(offers.pickup_end, sql`now() + interval '2 hours'`),
        ),
      );

    let sent = 0;
    for (const c of candidates) {
      const [existing] = await this.db
        .select({ id: orderEvents.id })
        .from(orderEvents)
        .where(
          and(
            eq(orderEvents.order_id, c.id),
            sql`${orderEvents.metadata}->>'dedupe' = 'pickup_reminder'`,
            sql`${orderEvents.created_at} > now() - interval '24 hours'`,
          ),
        )
        .limit(1);
      if (existing) continue;

      await this.notificationsService.send(
        [c.user_id],
        {
          title: 'Recordatorio de recogida',
          body: `Tu pedido vence a las ${c.pickup_end.toLocaleTimeString()}`,
          data: { link: `/orders/${c.id}`, type: 'pickup_reminder' },
        },
        { prefFlag: 'pickup_reminders_enabled' },
      );

      await this.db.insert(orderEvents).values({
        order_id: c.id,
        status: 'pending',
        previous_status: null,
        reason: 'pickup_reminder dedupe',
        metadata: { dedupe: 'pickup_reminder' },
      });
      sent += 1;
    }
    return sent;
  }

  async weeklySummary(): Promise<number> {
    const users = await this.db
      .select({ user_id: favorites.user_id })
      .from(favorites)
      .groupBy(favorites.user_id);
    let sent = 0;
    for (const u of users) {
      await this.notificationsService.send(
        [u.user_id],
        {
          title: 'Resumen semanal',
          body: 'Descubre nuevas ofertas esta semana',
          data: { link: '/', type: 'weekly_summary' },
        },
        { prefFlag: 'weekly_summary_enabled' },
      );
      sent += 1;
    }
    return sent;
  }

  async dispatchNearbyOffers(): Promise<number> {
    const [active] = await this.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.is_active, true), sql`${offers.stock} > 0`))
      .limit(1);
    if (!active) return 0;

    const optedIn = await this.db
      .select({ user_id: favorites.user_id })
      .from(favorites)
      .groupBy(favorites.user_id);

    let sent = 0;
    for (const u of optedIn) {
      await this.notificationsService.send(
        [u.user_id],
        {
          title: 'Ofertas cerca de ti',
          body: 'Hay ofertas disponibles cerca',
          data: { link: '/', type: 'nearby_offers' },
        },
        { prefFlag: 'last_minute_deals_enabled' },
      );
      sent += 1;
    }
    return sent;
  }

  async cleanupOldTokens(): Promise<number> {
    return this.repo.cleanupOldTokens();
  }
}
