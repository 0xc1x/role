import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  countDistinct,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessLocations,
  businesses,
  categories,
  offerCategories,
  offers,
  orders,
} from '../../database/schema';
import type { ListOffersQuery } from '@0xc1x/role-commons';

export type OfferListRow = {
  id: string;
  business_id: string;
  business_location_id: string;
  title: string;
  description: string | null;
  image: string | null;
  original_price: string;
  discounted_price: string;
  discount_percentage: string | null;
  stock: number;
  initial_stock: number;
  pickup_start: Date;
  pickup_end: Date;
  is_active: boolean;
  includes: string | null;
  allergens: string | null;
  rating: string;
  review_count: number;
  created_at: Date;
  updated_at: Date;
  category_ids: string[];
  category_names: string[];
  category_slugs: string[];
  business_name: string;
  business_slug: string;
  business_image: string | null;
  business_rating: string | null;
  location_name: string;
  location_address: string;
  location_latitude: string;
  location_longitude: string;
  location_zone: string | null;
};

export type OfferRow = typeof offers.$inferSelect;
export type OfferInsert = typeof offers.$inferInsert;
export type OfferUpdate = Partial<
  Pick<
    OfferInsert,
    | 'title'
    | 'description'
    | 'image'
    | 'original_price'
    | 'discounted_price'
    | 'stock'
    | 'initial_stock'
    | 'pickup_start'
    | 'pickup_end'
    | 'is_active'
    | 'includes'
    | 'allergens'
    | 'business_location_id'
  >
>;

export type DbExecutor = Database;

@Injectable()
export class OffersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(executor: DbExecutor, values: OfferInsert): Promise<OfferRow> {
    const [row] = await executor.insert(offers).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert offer');
    }
    return row;
  }

  async update(
    executor: DbExecutor,
    id: string,
    values: OfferUpdate,
  ): Promise<OfferRow | null> {
    const [row] = await executor
      .update(offers)
      .set({ ...values, updated_at: sql`now()` })
      .where(eq(offers.id, id))
      .returning();
    return row ?? null;
  }

  async findDtoById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<OfferRow | null> {
    const [row] = await executor
      .select()
      .from(offers)
      .where(eq(offers.id, id))
      .limit(1);
    return row ?? null;
  }

  async setCategories(
    executor: DbExecutor,
    offerId: string,
    categoryIds: string[],
  ): Promise<void> {
    await executor
      .delete(offerCategories)
      .where(eq(offerCategories.offer_id, offerId));
    if (categoryIds.length > 0) {
      await executor.insert(offerCategories).values(
        categoryIds.map((categoryId) => ({
          offer_id: offerId,
          category_id: categoryId,
        })),
      );
    }
  }

  async findCategoryIds(offerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ category_id: offerCategories.category_id })
      .from(offerCategories)
      .where(eq(offerCategories.offer_id, offerId));
    return rows.map((r) => r.category_id);
  }

  private baseSelect() {
    return this.db
      .select({
        id: offers.id,
        business_id: offers.business_id,
        business_location_id: offers.business_location_id,
        title: offers.title,
        description: offers.description,
        image: offers.image,
        original_price: offers.original_price,
        discounted_price: offers.discounted_price,
        discount_percentage: offers.discount_percentage,
        stock: offers.stock,
        initial_stock: offers.initial_stock,
        pickup_start: offers.pickup_start,
        pickup_end: offers.pickup_end,
        is_active: offers.is_active,
        includes: offers.includes,
        allergens: offers.allergens,
        rating: offers.rating,
        review_count: offers.review_count,
        created_at: offers.created_at,
        updated_at: offers.updated_at,
        business_name: businesses.name,
        business_slug: businesses.slug,
        business_image: businesses.image,
        business_rating: businesses.rating,
        location_name: businessLocations.name,
        location_address: businessLocations.address,
        location_latitude: businessLocations.latitude,
        location_longitude: businessLocations.longitude,
        location_zone: businessLocations.zone,
        category_ids: sql<
          string[]
        >`COALESCE(array_agg(DISTINCT ${offerCategories.category_id}) FILTER (WHERE ${offerCategories.category_id} IS NOT NULL), '{}'::uuid[])`,
        category_names: sql<
          string[]
        >`COALESCE(array_agg(DISTINCT ${categories.name}) FILTER (WHERE ${categories.name} IS NOT NULL), '{}'::text[])`,
        category_slugs: sql<
          string[]
        >`COALESCE(array_agg(DISTINCT ${categories.slug}) FILTER (WHERE ${categories.slug} IS NOT NULL), '{}'::text[])`,
      })
      .from(offers)
      .innerJoin(businesses, eq(offers.business_id, businesses.id))
      .innerJoin(
        businessLocations,
        eq(offers.business_location_id, businessLocations.id),
      )
      .leftJoin(offerCategories, eq(offerCategories.offer_id, offers.id))
      .leftJoin(categories, eq(categories.id, offerCategories.category_id));
  }

  private groupByFields() {
    return [
      offers.id,
      offers.business_id,
      offers.business_location_id,
      offers.title,
      offers.description,
      offers.image,
      offers.original_price,
      offers.discounted_price,
      offers.discount_percentage,
      offers.stock,
      offers.initial_stock,
      offers.pickup_start,
      offers.pickup_end,
      offers.is_active,
      offers.includes,
      offers.allergens,
      offers.rating,
      offers.review_count,
      offers.created_at,
      offers.updated_at,
      businesses.name,
      businesses.slug,
      businesses.image,
      businesses.rating,
      businessLocations.name,
      businessLocations.address,
      businessLocations.latitude,
      businessLocations.longitude,
      businessLocations.zone,
    ];
  }

  /** Oferta activa aleatoria con stock y pickup vigente (hero landing). */
  async findRandomActive(): Promise<OfferListRow | null> {
    const [row] = await this.baseSelect()
      .where(
        and(
          eq(offers.is_active, true),
          eq(businesses.is_active, true),
          gt(offers.stock, 0),
          gt(offers.pickup_end, sql`now()`),
        ),
      )
      .groupBy(...this.groupByFields())
      .orderBy(sql`random()`)
      .limit(1);
    return row ?? null;
  }

  private buildFilters(query: ListOffersQuery): SQL[] {
    const filters: SQL[] = [];

    if (query.available_only) {
      filters.push(eq(offers.is_active, true));
      filters.push(eq(businesses.is_active, true));
      filters.push(gt(offers.stock, 0));
      filters.push(gt(offers.pickup_end, sql`now()`));
    }

    if (query.category_id) {
      filters.push(
        sql`${offers.id} IN (SELECT ${offerCategories.offer_id} FROM ${offerCategories} WHERE ${offerCategories.category_id} = ${query.category_id})`,
      );
    }
    if (query.business_id) {
      filters.push(eq(offers.business_id, query.business_id));
    }

    if (
      query.lat !== undefined &&
      query.lng !== undefined &&
      query.radius_km !== undefined
    ) {
      filters.push(
        sql`(
          6371 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(${query.lat}))
              * cos(radians(${businessLocations.latitude}::double precision))
              * cos(radians(${businessLocations.longitude}::double precision) - radians(${query.lng}))
              + sin(radians(${query.lat}))
              * sin(radians(${businessLocations.latitude}::double precision))
            ))
          )
        ) <= ${query.radius_km}`,
      );
    }

    return filters;
  }

  async findMany(query: ListOffersQuery): Promise<{
    items: OfferListRow[];
    total: number;
  }> {
    const filters = this.buildFilters(query);
    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.limit;

    const groupBy = this.groupByFields();

    // Count without category joins so multi-category offers are not inflated.
    // category_id filter is applied via subquery in buildFilters.
    const [items, totalRow] = await Promise.all([
      this.baseSelect()
        .where(where)
        .groupBy(...groupBy)
        .orderBy(desc(offers.pickup_end))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: countDistinct(offers.id) })
        .from(offers)
        .innerJoin(businesses, eq(offers.business_id, businesses.id))
        .innerJoin(
          businessLocations,
          eq(offers.business_location_id, businessLocations.id),
        )
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items: items, total: Number(totalRow) };
  }

  async findById(id: string): Promise<OfferListRow | null> {
    const groupBy = [
      offers.id,
      offers.business_id,
      offers.business_location_id,
      offers.title,
      offers.description,
      offers.image,
      offers.original_price,
      offers.discounted_price,
      offers.discount_percentage,
      offers.stock,
      offers.initial_stock,
      offers.pickup_start,
      offers.pickup_end,
      offers.is_active,
      offers.includes,
      offers.allergens,
      offers.rating,
      offers.review_count,
      offers.created_at,
      offers.updated_at,
      businesses.name,
      businesses.slug,
      businesses.image,
      businesses.rating,
      businessLocations.name,
      businessLocations.address,
      businessLocations.latitude,
      businessLocations.longitude,
      businessLocations.zone,
    ];

    const [row] = await this.baseSelect()
      .where(eq(offers.id, id))
      .groupBy(...groupBy)
      .limit(1);
    return row ?? null;
  }

  async findByIdForUpdate(
    tx: Database,
    id: string,
  ): Promise<typeof offers.$inferSelect | null> {
    const [row] = await tx
      .select()
      .from(offers)
      .where(eq(offers.id, id))
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async decrementStock(tx: Database, id: string, amount = 1): Promise<boolean> {
    const result = await tx
      .update(offers)
      .set({
        stock: sql`${offers.stock} - ${amount}`,
        updated_at: sql`now()`,
      })
      .where(and(eq(offers.id, id), gte(offers.stock, amount)))
      .returning({ id: offers.id });
    return result.length > 0;
  }

  async incrementStock(tx: Database, id: string, amount = 1): Promise<boolean> {
    const result = await tx
      .update(offers)
      .set({
        stock: sql`${offers.stock} + ${amount}`,
        updated_at: sql`now()`,
      })
      .where(eq(offers.id, id))
      .returning({ id: offers.id });
    return result.length > 0;
  }

  async isBusinessOwner(businessId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(eq(businesses.id, businessId), eq(businesses.owner_id, userId)),
      )
      .limit(1);
    return Boolean(row);
  }

  async findBusinessIdsOwnedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.owner_id, userId));
    return rows.map((r) => r.id);
  }

  /** Ensure location belongs to the given business. */
  async locationBelongsToBusiness(
    locationId: string,
    businessId: string,
    executor: DbExecutor = this.db,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: businessLocations.id })
      .from(businessLocations)
      .where(
        and(
          eq(businessLocations.id, locationId),
          eq(businessLocations.business_id, businessId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Return active category ids that exist among the requested set.
   * Missing or inactive ids are omitted from the result.
   */
  async findActiveCategoryIds(
    categoryIds: string[],
    executor: DbExecutor = this.db,
  ): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const rows = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          inArray(categories.id, categoryIds),
          eq(categories.active, true),
          isNull(categories.deleted_at),
        ),
      );
    return rows.map((r) => r.id);
  }

  /**
   * Orders in pending/ready_for_pickup whose offer pickup_end has passed.
   * Recommended DB indexes (Supabase): offers(is_active, pickup_end), offers(business_id),
   * orders(status, offer_id), orders(user_id, offer_id, status).
   */
  async findOrderCandidatesToExpire(
    now: Date,
  ): Promise<Array<{ orderId: string }>> {
    const rows = await this.db
      .select({ orderId: orders.id })
      .from(orders)
      .innerJoin(offers, eq(orders.offer_id, offers.id))
      .where(
        and(
          inArray(orders.status, ['pending', 'ready_for_pickup']),
          lte(offers.pickup_end, now),
        ),
      );
    return rows;
  }
}
