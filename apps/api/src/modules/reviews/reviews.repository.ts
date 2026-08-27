import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businesses,
  offers,
  orders,
  reviews,
} from '../../database/schema';

export type ReviewRow = typeof reviews.$inferSelect;

@Injectable()
export class ReviewsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** Orden mínima para validar propiedad y derivar business/offer. */
  async findOrderById(
    tx: Database,
    orderId: string,
  ): Promise<{
    id: string;
    user_id: string;
    business_id: string;
    offer_id: string;
    status: string;
  } | null> {
    const [row] = await tx
      .select({
        id: orders.id,
        user_id: orders.user_id,
        business_id: orders.business_id,
        offer_id: orders.offer_id,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return row ?? null;
  }

  async insert(
    tx: Database,
    values: typeof reviews.$inferInsert,
  ): Promise<ReviewRow> {
    const [row] = await tx.insert(reviews).values(values).returning();
    if (!row) throw new Error('Failed to insert review');
    return row;
  }

  /**
   * Espejo del trigger `update_business_rating`: AVG(business_rating) y COUNT
   * con COALESCE(...,0), idéntico al SQL.
   */
  async recalcBusinessRating(tx: Database, businessId: string): Promise<void> {
    await tx
      .update(businesses)
      .set({
        rating: sql`(select coalesce(avg(${reviews.business_rating}), 0) from ${reviews} where ${reviews.business_id} = ${businesses.id})`,
        review_count: sql`(select count(*) from ${reviews} where ${reviews.business_id} = ${businesses.id})`,
      })
      .where(eq(businesses.id, businessId));
  }

  /**
   * Espejo del trigger `update_offer_rating`: AVG(product_rating) de las
   * reviews cuya orden apunta a la oferta.
   */
  async recalcOfferRating(tx: Database, offerId: string): Promise<void> {
    await tx
      .update(offers)
      .set({
        rating: sql`(select coalesce(avg(r.product_rating), 0) from ${reviews} r join ${orders} o on o.id = r.order_id where o.offer_id = ${offers.id})`,
        review_count: sql`(select count(*) from ${reviews} r join ${orders} o on o.id = r.order_id where o.offer_id = ${offers.id})`,
      })
      .where(eq(offers.id, offerId));
  }
}
