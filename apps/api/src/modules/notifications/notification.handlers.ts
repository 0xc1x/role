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
      })
      .from(orders)
      .innerJoin(businesses, eq(orders.business_id, businesses.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return;

    const title = `Pedido ${row.order.status}`;
    const body = `Tu pedido cambió a ${row.order.status}`;

    await this.notificationsService.send([row.order.user_id], {
      title,
      body,
      data: { link: `/orders/${orderId}`, type: 'order_status' },
    });

    await this.notificationsService.send([row.business_owner_id], {
      title: `Pedido ${row.order.status}`,
      body: `Pedido ${row.order.order_number} → ${row.order.status}`,
      data: {
        link: `/business/${row.order.business_id}/orders/${orderId}`,
        type: 'order_status_business',
      },
    });
  }

  async onOfferCreated(offerId: string): Promise<void> {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(eq(offers.id, offerId))
      .limit(1);
    if (!offer) return;

    const favUsers = await this.db
      .select({ user_id: favorites.user_id })
      .from(favorites)
      .innerJoin(offers, eq(favorites.offer_id, offers.id))
      .where(eq(offers.business_id, offer.business_id))
      .groupBy(favorites.user_id);

    const userIds = favUsers.map((r) => r.user_id);
    if (userIds.length === 0) return;

    await this.notificationsService.send(
      userIds,
      {
        title: offer.title,
        body: `Nueva oferta disponible: ${offer.title}`,
        data: { link: `/offers/${offerId}`, type: 'offer_created' },
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
