import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ListReviewsForModerationQuery } from '@0xc1x/role-commons';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businesses,
  offers,
  orders,
  profiles,
  reviews,
} from '../../database/schema';

export type ReviewRow = typeof reviews.$inferSelect;

/**
 * Fila de la bandeja de moderación: la reseña más los tres nombres que un
 * operador necesita para decidir sin abrir nada (quién escribió, de qué negocio
 * es, quién la ocultó).
 *
 * Los tres son `leftJoin`: `moderated_by` es nullable por diseño y
 * `author_name`/`business_name` lo son en la Projection por si el perfil se
 * borró. Un `innerJoin` convertiría una reseña sin nombre en una fila que
 * desaparece de la bandeja, que es justo lo contrario de auditable.
 */
export type ReviewModerationRow = ReviewRow & {
  author_name: string | null;
  business_name: string | null;
  moderated_by_name: string | null;
};

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

  /** Reseña existente del usuario para la orden (idempotencia del create). */
  async findByUserAndOrder(
    tx: Database,
    userId: string,
    orderId: string,
  ): Promise<ReviewRow | null> {
    const [row] = await tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.user_id, userId), eq(reviews.order_id, orderId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Espejo del trigger `update_business_rating`: AVG(business_rating) y COUNT
   * con COALESCE(...,0), idéntico al SQL.
   *
   * `is_hidden is not true` (y no `= false`) en las dos subconsultas: una reseña
   * oculta no cuenta para el promedio público. Es el mismo predicado que usan las
   * funciones del trigger en la migración, y tiene que serlo — si el API y el
   * trigger discreparan, el número que muestra la app depende de qué camino
   * escribió la fila.
   */
  async recalcBusinessRating(tx: Database, businessId: string): Promise<void> {
    await tx
      .update(businesses)
      .set({
        rating: sql`(select coalesce(avg(${reviews.business_rating}), 0) from ${reviews} where ${reviews.business_id} = ${businesses.id} and ${reviews.is_hidden} is not true)`,
        review_count: sql`(select count(*) from ${reviews} where ${reviews.business_id} = ${businesses.id} and ${reviews.is_hidden} is not true)`,
      })
      .where(eq(businesses.id, businessId));
  }

  /**
   * Espejo del trigger `update_offer_rating`: AVG(product_rating) de las
   * reviews cuya orden apunta a la oferta. Mismo filtro `is_hidden` y por el
   * mismo motivo.
   */
  async recalcOfferRating(tx: Database, offerId: string): Promise<void> {
    await tx
      .update(offers)
      .set({
        rating: sql`(select coalesce(avg(r.product_rating), 0) from ${reviews} r join ${orders} o on o.id = r.order_id where o.offer_id = ${offers.id} and r.is_hidden is not true)`,
        review_count: sql`(select count(*) from ${reviews} r join ${orders} o on o.id = r.order_id where o.offer_id = ${offers.id} and r.is_hidden is not true)`,
      })
      .where(eq(offers.id, offerId));
  }

  // ─── Moderación (admin) ──────────────────────────────────────────────

  /**
   * Bandeja paginada con el conteo total en la misma pasada de filtros.
   *
   * Un solo filtro para el listado y para el `count` a propósito: si divergieran,
   * `meta.total` contaría reseñas que la tabla no muestra y el operador vería una
   * página vacía con "42 resultados".
   */
  async listForModeration(filter: {
    visibility: ListReviewsForModerationQuery['visibility'];
    business_id?: string;
    rating?: number;
    page: number;
    limit: number;
  }): Promise<{ rows: ReviewModerationRow[]; total: number }> {
    const where = this.moderationWhere(filter);

    // El conteo no necesita los joins: todos los filtros son de `reviews`. Con
    // los joins, el planner no puede usar un index-only scan para el total.
    const [totalRow] = await this.db
      .select({ c: count() })
      .from(reviews)
      .where(where);
    const rows = await this.moderationSelection(this.db)
      .where(where)
      .orderBy(desc(reviews.created_at), desc(reviews.id))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  /** Fila de moderación por id, o `null`. No filtra: el id es la llave. */
  async findModerationRow(
    tx: Database,
    id: string,
  ): Promise<ReviewModerationRow | null> {
    const [row] = await this.moderationSelection(tx)
      .where(eq(reviews.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Escribe la moderación y devuelve la fila resultante CON los nombres ya
   * resueltos, para que el panel no tenga que releer.
   *
   * `hidden_reason` solo se escribe si viene en `values`: un desocultamiento no
   * lo limpia, porque ese motivo es el registro de apelación de por qué se ocultó
   * en su momento y borrarlo al restaurarla dejaría la decisión sin explicación.
   */
  async setHidden(
    tx: Database,
    id: string,
    values: {
      is_hidden: boolean;
      hidden_reason?: string;
      moderated_at: Date;
      moderated_by: string;
    },
  ): Promise<ReviewModerationRow | null> {
    await tx
      .update(reviews)
      .set({
        is_hidden: values.is_hidden,
        moderated_at: values.moderated_at,
        moderated_by: values.moderated_by,
        ...(values.hidden_reason === undefined
          ? {}
          : { hidden_reason: values.hidden_reason }),
      })
      .where(eq(reviews.id, id));
    return this.findModerationRow(tx, id);
  }

  /** Oferta de la orden de la reseña, para recalcular el promedio de la oferta. */
  async findOfferIdByOrder(
    tx: Database,
    orderId: string | null,
  ): Promise<string | null> {
    if (!orderId) return null;
    const [row] = await tx
      .select({ offer_id: orders.offer_id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return row?.offer_id ?? null;
  }

  private moderationWhere(filter: {
    visibility: ListReviewsForModerationQuery['visibility'];
    business_id?: string;
    rating?: number;
  }): SQL | undefined {
    const filters: SQL[] = [];
    if (filter.visibility === 'hidden')
      filters.push(eq(reviews.is_hidden, true));
    if (filter.visibility === 'visible')
      filters.push(eq(reviews.is_hidden, false));
    if (filter.business_id)
      filters.push(eq(reviews.business_id, filter.business_id));
    if (filter.rating !== undefined) {
      // El parámetro se llama `rating` pero `reviews.rating` es legacy y está en
      // NULL en toda fila moderna: filtrar por ahí no devolvería nada. Se busca
      // en los dos puntajes que la persona dio, que es lo que el operador quiere
      // decir con "las reseñas de 1 estrella".
      const anyRating = or(
        eq(reviews.product_rating, filter.rating),
        eq(reviews.business_rating, filter.rating),
      );
      if (anyRating) filters.push(anyRating);
    }
    return filters.length ? and(...filters) : undefined;
  }

  /**
   * `profiles` aparece dos veces (autor y moderador), así que el moderador va
   * con alias. Los tres `leftJoin` y no `innerJoin`: `moderated_by` es nullable
   * por diseño, y perder de la bandeja una reseña sin autor o sin negocio la
   * haría invisible justo cuando más importa verla.
   */
  private moderationSelection(db: Database) {
    const moderator = alias(profiles, 'moderator');
    return db
      .select({
        id: reviews.id,
        user_id: reviews.user_id,
        business_id: reviews.business_id,
        order_id: reviews.order_id,
        rating: reviews.rating,
        comment: reviews.comment,
        product_rating: reviews.product_rating,
        business_rating: reviews.business_rating,
        created_at: reviews.created_at,
        updated_at: reviews.updated_at,
        is_hidden: reviews.is_hidden,
        moderated_at: reviews.moderated_at,
        moderated_by: reviews.moderated_by,
        hidden_reason: reviews.hidden_reason,
        author_name: profiles.full_name,
        business_name: businesses.name,
        moderated_by_name: moderator.full_name,
      })
      .from(reviews)
      .leftJoin(profiles, eq(reviews.user_id, profiles.id))
      .leftJoin(businesses, eq(reviews.business_id, businesses.id))
      .leftJoin(moderator, eq(reviews.moderated_by, moderator.id));
  }
}
