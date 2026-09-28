import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { type Database } from '../../database/database.module';
import { publiclyVisibleBusiness } from '../../database/business-availability';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessLocations,
  businessOwnership,
  businesses,
  categories,
  offerCategories,
  offers,
  orders,
} from '../../database/schema';
import type { ListOffersQuery, ListZonesQuery } from '@0xc1x/role-commons';

/**
 * The searched point, or nothing.
 *
 * The RPC treats `p_lat`/`p_lng` as two independent nulls (`p_lat is null or
 * p_lng is null` disables the geo filter, and `distance_km` is null when
 * EITHER is absent). Resolving them here as one value is the same decision the
 * existing `st_dwithin` filter already makes, and it keeps "no point" from
 * emitting a distance expression the sort does not even use.
 */
export type OfferCoords = { lat: number; lng: number };

function offerCoords(
  query: Pick<ListOffersQuery, 'lat' | 'lng'>,
): OfferCoords | undefined {
  return query.lat !== undefined && query.lng !== undefined
    ? { lat: query.lat, lng: query.lng }
    : undefined;
}

/**
 * `distance_km`, the projection `active_offers_near` returns.
 *
 * Raw PostGIS against `extensions.st_*` for the same reason the `st_dwithin`
 * filter in {@link OffersRepository.buildFilters} is: `business_locations.geog`
 * is a generated PostGIS column that is deliberately absent from the Drizzle
 * mirror, so there is no typed column to select (see
 * `src/database/schema/business-locations.ts`).
 *
 * Without a point the projection is a typed NULL, not a PostGIS call — the
 * column-projection shape is then the same on every other read of this table,
 * and nothing needs PostGIS to resolve it.
 */
export function distanceKmSql(coords?: OfferCoords): SQL<number | null> {
  if (!coords) {
    return sql<number | null>`NULL::double precision`;
  }
  return sql<number | null>`extensions.st_distance(
        business_locations.geog,
        extensions.st_setsrid(extensions.st_makepoint(${coords.lng}, ${coords.lat}), 4326)::extensions.geography
      ) / 1000.0`;
}

/**
 * The `ORDER BY` of `active_offers_near`, key for key.
 *
 *   1. distance, `asc nulls last`, non-null ONLY for `sort = 'distance'` with a
 *      point. For every other sort the key is NULL for the whole set, so
 *      `nulls last` leaves it inert — that is what makes one static query able
 *      to serve three orderings.
 *   2. `pickup_end`, `asc nulls last`, non-null ONLY for `sort = 'pickup_end'`.
 *   3. `created_at desc`.
 *   4. `offers.id` — the tiebreaker the previous `desc(pickup_end)` order did not
 *      have. Without a total order, `LIMIT/OFFSET` is free to return the same
 *      row on two pages or skip one between them, and the count says N while
 *      the consumer can only ever see N-1 of them.
 *
 * The sort value travels as a bound parameter, so the enum validated by the
 * contract is what the `CASE` compares against.
 */
export function offerListOrderBy(
  query: Pick<ListOffersQuery, 'sort'>,
  coords?: OfferCoords,
): (SQL | PgColumn)[] {
  const sort = query.sort ?? 'pickup_end';
  return [
    // The lat/lng nulls are cast because a parameter that only appears in
    // `IS NOT NULL` has no type for Postgres to infer (42P18).
    sql`CASE WHEN ${sort} = 'distance' AND ${coords?.lat ?? null}::double precision IS NOT NULL AND ${coords?.lng ?? null}::double precision IS NOT NULL THEN ${distanceKmSql(
      coords,
    )} END ASC NULLS LAST`,
    sql`CASE WHEN ${sort} = 'pickup_end' THEN ${offers.pickup_end} END ASC NULLS LAST`,
    desc(offers.created_at),
    offers.id,
  ];
}

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
  /** `null` when the request carried no `lat`/`lng`. See `distanceKmSql`. */
  distance_km: number | null;
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

/**
 * One row of `listPopularZones`.
 *
 * `deals` is `string | number` and not `number` because postgres.js hands back
 * `bigint`/`int8` as a STRING to avoid silent precision loss — verified against
 * the test database, not assumed. The count crosses the wire as a number (every
 * count in this contract does), so the coercion belongs in the mapper that owns
 * the DB/wire boundary, exactly like `toNumber(row.rating)` in
 * `OfferMapper.toResponse`.
 */
export type PopularZoneRow = {
  zone: string;
  deals: string | number;
};

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

  private baseSelect(coords?: OfferCoords) {
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
        distance_km: distanceKmSql(coords),
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

  private groupByFields(coords?: OfferCoords) {
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
      // The distance projection is an EXPRESSION over a column this query does
      // not group otherwise, and a generated column is NOT expanded into its
      // generation expression in a grouped select: `geog` stays a Var, so
      // Postgres rejects the projection with 42803 unless `geog` itself is a
      // group key. Verified against the real test database, not inferred.
      //
      // It has to be the COLUMN, not the projection. Grouping by
      // `distanceKmSql(coords)` reads as the obvious equivalent and is not:
      // the projection carries the search point as bound parameters, and this
      // GROUP BY builds its OWN copy of that expression, so the two copies get
      // different placeholder numbers ($1,$2 in the SELECT, $4,$5 here).
      // Postgres matches a grouped expression by structural equality, and two
      // Params with a different `paramno` are not equal, so the SELECT
      // expression matched no group key and EVERY `GET /offers` carrying
      // `lat` + `lng` failed with 42803 regardless of `sort`.
      //
      // Nothing caught it because the projection had only ever been COMPILED:
      // the harness Postgres was `postgres:16-alpine` without PostGIS, so the
      // geo specs asserted the shape of this statement (`.toSQL()`) and never
      // ran it. See the geo block in offers.repository.spec.ts, which now
      // executes the path against a real PostGIS database.
      ...(coords ? [sql`business_locations.geog`] : []),
    ];
  }

  /**
   * The one definition of "this offer can be reserved right now": active, owned
   * by an active and moderation-approved business, in stock, and inside its
   * pickup window.
   *
   * Single source on purpose. This predicate is a security boundary, and it was
   * already spelled out twice — the random hero pick and the `available_only`
   * list filter. A third copy for the detail endpoint is how an offer that is
   * sold out, expired or under moderation review ends up readable by UUID while
   * being correctly hidden everywhere else. If a condition belongs here, it
   * belongs in all three call sites at once.
   *
   * The business half (`is_active` + moderation approval) is NOT re-spelled
   * here: it is `publiclyVisibleBusiness()` from
   * `database/business-availability.ts`, the same gate the public business and
   * review surfaces use. Two predicates that read the same but live in two files
   * diverge the first time one of them is edited.
   */
  private availableNow(): SQL[] {
    return [
      eq(offers.is_active, true),
      publiclyVisibleBusiness(),
      gt(offers.stock, 0),
      gt(offers.pickup_end, sql`now()`),
    ];
  }

  /** Oferta activa aleatoria con stock y pickup vigente (hero landing). */
  async findRandomActive(): Promise<OfferListRow | null> {
    const [row] = await this.baseSelect()
      .where(and(...this.availableNow()))
      .groupBy(...this.groupByFields())
      .orderBy(sql`random()`)
      .limit(1);
    return row ?? null;
  }

  /**
   * `public.popular_zones`, key for key (ADR-0008) — the mobile Explore screen's
   * "top zones by live deals", optionally inside a radius of the user.
   *
   * ─── DELIBERATE DIVERGENCE FROM THE RPC: the moderation gate ─────────────
   *
   * THE SQL COUNTS MORE THAN THIS DOES, and on purpose. The function's `where`
   * clause is `o.is_active and o.stock > 0 and o.pickup_end > now()` and nothing
   * about the business. It cannot do better as written: the functions are
   * `security invoker`, and both RLS policies it reads through are weaker than
   * the API's gate —
   *
   *   * `offers` — "Anyone can view active offers" is `USING (is_active = true)`
   *     and nothing else (supabase/migrations/20260507193325_create_offers_and_coupons.sql).
   *   * `business_locations` — "Anyone can view active business locations" is
   *     `USING (is_active = true)` (20260507193215_create_businesses_and_locations.sql).
   *     The RPC never reads `businesses` at all, so no policy on that table can
   *     narrow it either.
   *
   * The only thing keeping a suspended merchant's offers out of that count in
   * production is the `enforce_offer_business_availability` BEFORE INSERT/UPDATE
   * trigger, which forces `is_active := false` at WRITE time. There is no
   * trigger in the opposite direction: nothing deactivates a business's offers
   * when the business is deactivated or its moderation status moves off
   * `approved`. So the moment a merchant is suspended, their offers keep
   * `is_active = true` and `popular_zones` keeps counting them.
   *
   * That is a leak on a public, unauthenticated endpoint, and it contradicts
   * every other public surface in this API: `GET /offers`, the random hero, the
   * business list and the review feeds all resolve through
   * `publiclyVisibleBusiness()`. A caller would see a zone full of deals, tap
   * it, and get an empty result from the list the same gate protects. So this
   * read applies that gate even though the SQL does not, and the `businesses`
   * join below exists for that half alone.
   *
   * Consequence, stated plainly: for a zone holding offers of an unapproved or
   * deactivated business, this returns a LOWER `deals` than the RPC, and the
   * zone can drop out of the top-N entirely. That is the intended reading, not a
   * bug to be "fixed" by copying the RPC.
   *
   * The rest is verbatim, including the parts that look odd:
   *
   *   * `greatest(p_limit, 1)` — the RPC clamps, so `limit=0` yields ONE row
   *     there. Mirrored instead of rejected, or the clamp would be dead code.
   *   * The geo filter is all-or-nothing: `p_lat`, `p_lng` and `p_radius_km`
   *     are independent nulls there, and the filter only engages when all three
   *     are present. Same test as `buildFilters`.
   *   * `zone <> ''` is not redundant with `zone is not null`: a location whose
   *     zone was never filled in is stored as `''` as often as `NULL`, and
   *     either way it is not a zone.
   */
  async listPopularZones(query: ListZonesQuery): Promise<PopularZoneRow[]> {
    const filters: SQL[] = [
      ...this.availableNow(),
      isNotNull(businessLocations.zone),
      sql`${businessLocations.zone} <> ''`,
    ];

    if (
      query.lat !== undefined &&
      query.lng !== undefined &&
      query.radius_km !== undefined
    ) {
      // Same expression, same `extensions.` qualification and same
      // `st_makepoint(longitude, latitude)` argument order as the radius filter
      // in `buildFilters` — the generated `geog` column it reads is not in the
      // Drizzle mirror, so raw qualified SQL is the only way in.
      filters.push(
        sql`extensions.st_dwithin(
          business_locations.geog,
          extensions.st_setsrid(extensions.st_makepoint(${query.lng}, ${query.lat}), 4326)::extensions.geography,
          ${query.radius_km} * 1000.0
        )`,
      );
    }

    return (
      this.db
        .select({
          // `string`, not `string | null`: `isNotNull(zone)` above already decided
          // it, and the Drizzle type of the column cannot see that. The `sql` cast
          // states the invariant the WHERE clause enforces instead of widening the
          // contract to admit the `null` the query can never return.
          zone: sql<string>`${businessLocations.zone}`,
          deals: sql<string | number>`count(*)::bigint`,
        })
        .from(offers)
        // Present only so `publiclyVisibleBusiness()` — which correlates against
        // `businesses.id` — has a `businesses` row to correlate to. See the
        // divergence note above.
        .innerJoin(businesses, eq(offers.business_id, businesses.id))
        .innerJoin(
          businessLocations,
          eq(offers.business_location_id, businessLocations.id),
        )
        .where(and(...filters))
        .groupBy(businessLocations.zone)
        // `order by deals desc, l.zone` verbatim — with the alias spelled as the
        // expression it stands for, because Drizzle's object-form `select()` keys
        // are the JS result mapping and NOT SQL aliases: `deals: sql\`count(*)\``
        // emits `count(*)` with no `as deals`, and an `order by deals` against that
        // is a 42703 (verified by running it, not by reading the docs). The second
        // key is the group key, so a tie on `deals` resolves deterministically
        // instead of in whatever order the hash aggregate happened to emit.
        .orderBy(desc(sql`count(*)::bigint`), asc(businessLocations.zone))
        // The RPC's `limit greatest(p_limit, 1)`. Applied in JS rather than as
        // `sql\`greatest(...)\`` because Drizzle's `.limit()` takes a bound value
        // and not a SQL expression, and because the two are the same number for
        // every value that can reach here: `ListZonesQuerySchema` defaults `limit`
        // and rejects a non-integer, so it is never null, never NaN, and
        // `greatest(x, 1)` is `Math.max(x, 1)`. The clamp is the point — it is
        // what makes `limit=0` return one row on both surfaces instead of none.
        .limit(Math.max(query.limit, 1))
    );
  }

  private buildFilters(query: ListOffersQuery): SQL[] {
    const filters: SQL[] = [];

    if (query.available_only) {
      filters.push(...this.availableNow());
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
      // ST_DWithin sobre geog (geography) aprovecha el índice GIST de
      // business_locations; la fórmula haversine previa hacía seq-scan con
      // trigonometría por fila. PostGIS vive en el schema extensions y la
      // columna geog no está en el espejo drizzle (ver business-locations.ts).
      filters.push(
        sql`extensions.st_dwithin(
          business_locations.geog,
          extensions.st_setsrid(extensions.st_makepoint(${query.lng}, ${query.lat}), 4326)::extensions.geography,
          ${query.radius_km} * 1000.0
        )`,
      );
    }

    // ─── Mirrors of `active_offers_near` (ADR-0008) ────────────────────────
    //
    // The three filters below used to exist only inside the Supabase function,
    // so `GET /offers` answered a different question than the mobile feed for
    // the same search. They are spelled as the RPC spells them, on purpose.

    if (query.search !== undefined) {
      // THREE columns: title, description and the business name. Matching only
      // the offer's own text is how a search for a merchant's name returned
      // nothing while the map showed their shelf.
      //
      // Not wildcard-escaped, unlike the sibling `escapeLike` searches in this
      // codebase: the RPC concatenates `'%'||p_search||'%'` raw, and the same
      // term has to select the same rows here as it does on the mobile surface.
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          ilike(offers.title, pattern),
          ilike(offers.description, pattern),
          ilike(businesses.name, pattern),
        )!,
      );
    }

    if (query.max_price !== undefined) {
      // `discounted_price`, the price actually charged — not `original_price`.
      // Filtering on the original would admit every offer of a 50%-off
      // merchant to a `max_price=5` request and hide nothing. The bound value
      // is sent as a parameter and Postgres resolves it against the numeric
      // column, so `5` and `5.00` mean the same thing here as in the RPC.
      filters.push(lte(offers.discounted_price, sql`${query.max_price}`));
    }

    if (query.expiring_within_hours !== undefined) {
      // `pickup_end > now()` is the RPC's own first condition, and it is not
      // redundant: the lower bound of the window is `now()`, and an offer whose
      // window closed an hour ago is inside "the next 0-N hours" by arithmetic
      // alone.
      filters.push(
        and(
          gt(offers.pickup_end, sql`now()`),
          lt(
            offers.pickup_end,
            sql`now() + make_interval(hours => ${query.expiring_within_hours})`,
          ),
        )!,
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
    const coords = offerCoords(query);

    const groupBy = this.groupByFields(coords);

    // Count without category joins so multi-category offers are not inflated.
    // category_id filter is applied via subquery in buildFilters.
    const [items, totalRow] = await Promise.all([
      this.baseSelect(coords)
        .where(where)
        .groupBy(...groupBy)
        .orderBy(...offerListOrderBy(query, coords))
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

  /**
   * True when this offer is readable by the public — the same `availableNow()`
   * predicate `findById` filters with, asked as a yes/no question.
   *
   * It exists for the surfaces that must not narrate an offer they refuse to
   * show: the review feed answers 404 for a paused, sold-out, expired or
   * unapproved offer, and an empty review page would be a way to confirm the
   * offer exists. Reusing `findById` instead would work and would be wasteful —
   * it builds the whole offer card projection, groups by 28 columns and
   * aggregates categories, all to answer a boolean.
   */
  async isPubliclyAvailable(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: offers.id })
      .from(offers)
      .innerJoin(businesses, eq(offers.business_id, businesses.id))
      .where(and(eq(offers.id, id), ...this.availableNow()))
      .limit(1);
    return Boolean(row);
  }

  async isBusinessAvailableForOffers(
    executor: DbExecutor,
    businessId: string,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.id, businessId), publiclyVisibleBusiness()))
      .limit(1);
    return Boolean(row);
  }

  /**
   * Public detail by id. Availability-filtered for the same reason the list is:
   * without it, a sold-out, expired or not-yet-moderated offer stayed readable
   * by UUID even though the catalog, the random hero and the search all hid it.
   *
   * Moderation and ownership deliberately do not come through here. The admin
   * reviews inactive offers with `GET /offers?available_only=false` and edits
   * them through PATCH/DELETE, which resolve the row with `findDtoById` and
   * `findByIdForUpdate` — neither of which filters. So this endpoint has exactly
   * one consumer, a public reader, and gating it costs the panel nothing.
   */
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
      .where(and(eq(offers.id, id), ...this.availableNow()))
      .groupBy(...groupBy)
      .limit(1);
    return row ?? null;
  }

  /**
   * Offer card projection for a known set of ids, with NO availability filter.
   *
   * `findById` and `findMany` both answer "what can be reserved right now", and
   * that filter is a security boundary. This one is deliberately the opposite:
   * it serves the saved-offers list, where a sold-out, expired or paused offer
   * must still be RETURNED so the consumer can show it as unavailable. Hiding it
   * there would make a favorite silently vanish from the user's own list.
   *
   * The caller re-keys by id, so no order is guaranteed. `[]` short-circuits
   * because `inArray` with an empty list is not a query Postgres should see.
   */
  async findManyByIds(ids: string[]): Promise<OfferListRow[]> {
    if (ids.length === 0) return [];

    return this.baseSelect()
      .where(inArray(offers.id, ids))
      .groupBy(...this.groupByFields());
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
      .select({ id: businessOwnership.business_id })
      .from(businessOwnership)
      .where(
        and(
          eq(businessOwnership.business_id, businessId),
          eq(businessOwnership.owner_id, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findBusinessIdsOwnedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: businessOwnership.business_id })
      .from(businessOwnership)
      .where(eq(businessOwnership.owner_id, userId));
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
   * Tope 500 por corrida: sin LIMIT un backlog grande solapa el tick de cada
   * minuto consigo mismo (una transacción por orden en el service).
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
      )
      .limit(500);
    return rows;
  }

  /**
   * Espejo de la parte temporal del `check_offer_expiry`: desactiva ofertas
   * activas con ventana vencida. La desactivación por stock=0 la cubre el
   * trigger SQL en cada cambio de stock (y el decremento del espejo).
   */
  async expireStale(now: Date): Promise<number> {
    const rows = await this.db
      .update(offers)
      .set({ is_active: false, updated_at: sql`now()` })
      .where(and(eq(offers.is_active, true), lte(offers.pickup_end, now)))
      .returning({ id: offers.id });
    return rows.length;
  }
}
