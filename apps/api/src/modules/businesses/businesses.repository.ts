import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import {
  moderationStatus,
  publiclyVisibleBusiness,
  type BusinessModerationStatus,
} from '../../database/business-availability';
import { DRIZZLE } from '../../database/database.tokens';
import { escapeLike } from '../../common/utils/like';
import {
  businessFinance,
  businessHours,
  businessLocations,
  businessModeration,
  businessNotificationPreferences,
  businessOwnership,
  businesses,
  emailSends,
  emailTemplates,
  offers,
  type BusinessHoursRow,
} from '../../database/schema';
import { payouts } from '../../database/schema/payouts';
import type {
  ListBusinessesQuery,
  ListBusinessLocationsQuery,
  ListPublicBusinessesQuery,
} from '@0xc1x/role-commons';

export type BusinessRow = typeof businesses.$inferSelect;

/**
 * The columns a public business read is allowed to see.
 *
 * A `Pick`, not a `&` and not "whatever the select happens to return", so a new
 * column on `businesses` has to be added to this list on purpose. It is the
 * repository-side twin of `PublicBusinessSchema` in commons: the contract
 * declares the payload, this declares the query, and both have to be widened
 * deliberately for the public surface to change.
 */
export type PublicBusinessRow = Pick<
  BusinessRow,
  | 'id'
  | 'name'
  | 'type'
  | 'slug'
  | 'image'
  | 'cover_image'
  | 'rating'
  | 'review_count'
  | 'description'
  | 'phone'
  | 'email'
  | 'website'
  | 'created_at'
  | 'updated_at'
>;

/**
 * Companion fields of the business aggregate, flattened under their historical
 * column names. `businesses` no longer stores them — they moved to
 * business_ownership / business_finance / business_moderation so anon can hold
 * table-level SELECT on `businesses` for PostgREST — but the DTO keeps the same
 * shape, so the mapper reads them from here under the same names.
 */
export type BusinessCompanionFields = {
  owner_id: string;
  balance: string;
  commission_rate: string;
  verification_status: string;
  verified_at: Date | null;
  verified_by: string | null;
  rejection_reason: string | null;
};

/** A business row joined with its three companions: the aggregate the DTO maps. */
export type BusinessAggregateRow = BusinessRow & BusinessCompanionFields;

/** Companion columns a business write may carry, wherever they are stored. */
export type BusinessCompanionInsert = {
  owner_id: string;
  balance?: string;
  commission_rate?: string;
  verification_status?: string;
  verified_at?: Date | null;
  verified_by?: string | null;
  rejection_reason?: string | null;
};

/**
 * A `listPublic` row: the public business columns plus what
 * `active_businesses_near` adds.
 *
 * Optional fields, and NOT because they might be absent. Every field here is
 * always present on a row this repository returns: the `matching_offers` inner
 * join guarantees a live offer, and the LATERAL guarantees a location. They are
 * optional because `findPublicById` returns the same business WITHOUT the offer
 * aggregate, and one row type is what lets both public reads and one mapper
 * serve them — the same arrangement `PublicBusinessRow` + `PublicBusinessSchema`
 * already had before the geo work. `toDto` therefore omits rather than invents.
 *
 * The types are the SQL's types, not the contract's: `active_deals_count` is a
 * `bigint` and arrives as a string, and the coordinates are `numeric(10,7)`. The
 * mapper converts both, exactly as `toCategoryDto` does for `active_count` and
 * `toLocationDto` for latitude.
 */
export type PublicBusinessNearRow = PublicBusinessRow & {
  active_deals_count: string;
  distance_km: number | null;
  business_location_id: string;
  address: string;
  latitude: string;
  longitude: string;
  zone: string | null;
};

export type BusinessInsert = typeof businesses.$inferInsert &
  BusinessCompanionInsert;
export type BusinessUpdate = Partial<
  Pick<
    BusinessInsert,
    | 'name'
    | 'type'
    | 'slug'
    | 'image'
    | 'cover_image'
    | 'description'
    | 'phone'
    | 'email'
    | 'website'
    | 'is_active'
  >
> &
  Partial<Omit<BusinessCompanionInsert, 'owner_id'>>;

/**
 * Envío transaccional encolado para un negocio + el nombre de su plantilla.
 * `template_id` es NOT NULL con FK, así que el inner join no pierde filas.
 */
export type BusinessEmailSendRow = Pick<
  typeof emailSends.$inferSelect,
  'id' | 'email' | 'status' | 'error_message' | 'created_at' | 'updated_at'
> & { template_name: string };

export type BusinessLocationRow = typeof businessLocations.$inferSelect;

/**
 * The merchant's own notification switches, keyed by `business_id`.
 *
 * THE BUSINESS-SIDE COUNTERPART OF `consumer_notification_preferences`, and the
 * pair is worth naming in both places: `GET/PATCH /me/notification-preferences`
 * already serves the consumer row, and this is the other half of the same
 * feature for the other side of the marketplace. Same flags, same quiet-hours
 * columns, one owner per row — so a reader who meets this table must not go
 * looking for a second consumer route for it.
 */
export type BusinessNotificationPreferencesRow =
  typeof businessNotificationPreferences.$inferSelect;

/**
 * The columns a merchant write may carry.
 *
 * `business_id` is the path, not a field, and it is the one that matters: this
 * API connects as the table's owner and is therefore exempt from
 * `business_notification_preferences`' own RLS policies, so the check that
 * `business_ownership.owner_id = caller` is the ONLY thing between a crafted id
 * and another merchant's settings. `created_at` and `updated_at` are derived,
 * never carried — the latter because nothing in the database maintains it.
 */
export type BusinessNotificationPreferencesPatch = Partial<
  Pick<
    BusinessNotificationPreferencesRow,
    | 'push_enabled'
    | 'email_enabled'
    | 'sms_enabled'
    | 'whatsapp_enabled'
    | 'new_orders_enabled'
    | 'pickup_ready_enabled'
    | 'reviews_enabled'
    | 'low_stock_enabled'
    | 'daily_summary_enabled'
    | 'quiet_hours_from'
    | 'quiet_hours_to'
  >
>;
export type BusinessLocationInsert = typeof businessLocations.$inferInsert;
export type BusinessLocationUpdate = Partial<
  Pick<
    BusinessLocationInsert,
    | 'name'
    | 'address'
    | 'phone'
    | 'latitude'
    | 'longitude'
    | 'is_active'
    | 'zone'
    | 'is_headquarter'
  >
>;

export type DbExecutor = Database;

/**
 * The searched point, or nothing.
 *
 * The RPC treats `p_lat` and `p_lng` as two independent nulls: the radius filter
 * is disabled by `p_lat is null or p_lng is null`, and `distance_km` is null when
 * EITHER is absent. Resolving them here as one value is the same decision the
 * `st_dwithin` filter in `OffersRepository` already makes, and it keeps "no
 * point" from emitting a distance expression nothing reads.
 */
type BusinessCoords = { lat: number; lng: number };

function businessCoords(
  query: Pick<ListPublicBusinessesQuery, 'lat' | 'lng'>,
): BusinessCoords | undefined {
  return query.lat !== undefined && query.lng !== undefined
    ? { lat: query.lat, lng: query.lng }
    : undefined;
}

/**
 * The geodesic distance, in kilometres, from the searched point to
 * `business_locations.geog`.
 *
 * Two things about the emitted SQL are not choices:
 *
 *  - `extensions.` qualification. PostGIS lives in the `extensions` schema and
 *    `business_locations.geog` is a generated column deliberately absent from
 *    the Drizzle mirror (see `database/schema/business-locations.ts`), so this is
 *    raw qualified SQL and the only way in.
 *  - `st_makepoint(lng, lat)`. X first. Swapping it is the classic way to get a
 *    plausible-but-wrong distance: at the latitudes this platform operates in a
 *    degree of longitude is only ~0.84 of a degree of latitude, so the mistake
 *    survives a smoke test and not a distance assertion.
 */
function distanceKmSql(coords?: BusinessCoords): SQL<number | null> {
  if (!coords) {
    return sql<number | null>`NULL::double precision`;
  }
  return sql<number | null>`extensions.st_distance(
        business_locations.geog,
        extensions.st_setsrid(extensions.st_makepoint(${coords.lng}, ${coords.lat}), 4326)::extensions.geography
      ) / 1000.0`;
}

/** Drops the keys whose value is `undefined` so the column keeps its default. */
function defined<T extends object>(values: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}

@Injectable()
export class BusinessesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** True if the business has payouts in a non-final state (pending/processing). */
  async hasPendingPayout(businessId: string): Promise<boolean> {
    const rows = await this.db
      .select({ one: eq(payouts.business_id, payouts.business_id) })
      .from(payouts)
      .where(
        and(
          eq(payouts.business_id, businessId),
          or(eq(payouts.status, 'pending'), eq(payouts.status, 'processing')),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * Inserts the business and its three companions in the caller's transaction.
   *
   * Every companion row is always written: the old NOT NULL columns carried
   * their defaults with the business row, and the one-row-per-business
   * invariant has to hold for the aggregate joins. `on conflict do nothing`
   * mirrors the notification-preferences trigger being idempotent.
   */
  async insert(
    executor: DbExecutor,
    values: BusinessInsert,
  ): Promise<BusinessAggregateRow> {
    const {
      owner_id,
      balance,
      commission_rate,
      verification_status,
      verified_at,
      verified_by,
      rejection_reason,
      ...businessValues
    } = values;

    const [row] = await executor
      .insert(businesses)
      .values(businessValues)
      .returning();
    if (!row) {
      throw new Error('Failed to insert business');
    }

    await executor
      .insert(businessOwnership)
      .values({ business_id: row.id, owner_id })
      .onConflictDoNothing();
    await executor
      .insert(businessFinance)
      .values({
        business_id: row.id,
        ...defined({ balance, commission_rate }),
      })
      .onConflictDoNothing();
    await executor
      .insert(businessModeration)
      .values({
        business_id: row.id,
        ...defined({
          verification_status,
          verified_at,
          verified_by,
          rejection_reason,
        }),
      })
      .onConflictDoNothing();
    // Espejo del trigger create_business_notification_preferences (on conflict = idempotente con el trigger activo).
    await executor
      .insert(businessNotificationPreferences)
      .values({ business_id: row.id })
      .onConflictDoNothing();

    const created = await this.findById(row.id, executor);
    if (!created) {
      throw new Error('Failed to read back business');
    }
    return created;
  }

  /**
   * Applies a business patch across the tables that hold its columns.
   *
   * `businesses.updated_at` moves for any non-empty patch, including
   * companion-only patches: it is part of the public business DTO and used to
   * move on every write.
   */
  async update(
    executor: DbExecutor,
    id: string,
    values: BusinessUpdate,
  ): Promise<BusinessAggregateRow | null> {
    const businessPatch = defined({
      name: values.name,
      type: values.type,
      slug: values.slug,
      image: values.image,
      cover_image: values.cover_image,
      description: values.description,
      phone: values.phone,
      email: values.email,
      website: values.website,
      is_active: values.is_active,
    });
    const financePatch = defined({
      balance: values.balance,
      commission_rate: values.commission_rate,
    });
    const moderationPatch = defined({
      verification_status: values.verification_status,
      verified_at: values.verified_at,
      verified_by: values.verified_by,
      rejection_reason: values.rejection_reason,
    });

    await executor
      .update(businesses)
      .set({ ...businessPatch, updated_at: sql`now()` })
      .where(eq(businesses.id, id));

    if (Object.keys(financePatch).length > 0) {
      await executor
        .update(businessFinance)
        .set({ ...financePatch, updated_at: sql`now()` })
        .where(eq(businessFinance.business_id, id));
    }
    if (Object.keys(moderationPatch).length > 0) {
      await executor
        .update(businessModeration)
        .set({ ...moderationPatch, updated_at: sql`now()` })
        .where(eq(businessModeration.business_id, id));
    }

    return this.findById(id, executor);
  }

  /**
   * Base projection + joins for the business aggregate.
   *
   * The companions are joined (1:1 by primary key) rather than left-joined so
   * `owner_id` stays non-null and the DTO contract holds. Listings rely on the
   * one-row-per-business invariant for `total` to match the page: the count
   * query reads `businesses` alone, and it is the write paths above plus the
   * Supabase backfill that keep the companions complete.
   */
  private aggregateSelect(executor: DbExecutor = this.db) {
    return executor
      .select({
        ...getTableColumns(businesses),
        owner_id: businessOwnership.owner_id,
        balance: businessFinance.balance,
        commission_rate: businessFinance.commission_rate,
        verification_status: businessModeration.verification_status,
        verified_at: businessModeration.verified_at,
        verified_by: businessModeration.verified_by,
        rejection_reason: businessModeration.rejection_reason,
      })
      .from(businesses)
      .innerJoin(
        businessOwnership,
        eq(businessOwnership.business_id, businesses.id),
      )
      .innerJoin(
        businessFinance,
        eq(businessFinance.business_id, businesses.id),
      )
      .innerJoin(
        businessModeration,
        eq(businessModeration.business_id, businesses.id),
      );
  }

  /**
   * `verification_status = <status>` over the moderation companion, delegated to
   * the one predicate definition in `database/business-availability.ts`. A
   * business with no moderation row matches nothing, which is what the old NOT
   * NULL column defaulting to 'pending' did. Written as `exists` so the count
   * query keeps reading `businesses` alone.
   */
  private moderatedAs(status: BusinessModerationStatus): SQL {
    return moderationStatus(status);
  }

  /** The business is owned by the user (business_ownership is the source). */
  private ownedBy(userId: string): SQL {
    return sql`exists (select 1 from ${businessOwnership} o where o.business_id = ${businesses.id} and o.owner_id = ${userId})`;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<BusinessAggregateRow | null> {
    const [row] = await this.aggregateSelect(executor)
      .where(eq(businesses.id, id))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(
    slug: string,
    executor: DbExecutor = this.db,
  ): Promise<BusinessAggregateRow | null> {
    const [row] = await this.aggregateSelect(executor)
      .where(eq(businesses.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async listForUser(
    userId: string,
    query: ListBusinessesQuery,
  ): Promise<{ items: BusinessAggregateRow[]; total: number }> {
    const filters: SQL[] = [this.ownedBy(userId)];

    if (query.is_active !== undefined) {
      filters.push(eq(businesses.is_active, query.is_active));
    }
    if (query.verification_status) {
      filters.push(this.moderatedAs(query.verification_status));
    }

    const where = and(...filters);
    const offset = (query.page - 1) * query.limit;

    const [items, totalRow] = await Promise.all([
      this.aggregateSelect()
        .where(where)
        .orderBy(desc(businesses.created_at))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(businesses)
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  /**
   * Envíos transaccionales de un negocio (avisos de aprobación/rechazo).
   *
   * Los inserta el trigger `notify_business_verification` sobre
   * `business_moderation` con `source_type = 'business'` y
   * `source_id = business_id`; el cron los drena contra Resend. La fila es la
   * única evidencia de si el correo al propietario salió, así que el panel la
   * lee tal cual (read-only).
   */
  async listEmailSends(businessId: string): Promise<BusinessEmailSendRow[]> {
    return this.db
      .select({
        id: emailSends.id,
        email: emailSends.email,
        status: emailSends.status,
        error_message: emailSends.error_message,
        created_at: emailSends.created_at,
        updated_at: emailSends.updated_at,
        template_name: emailTemplates.name,
      })
      .from(emailSends)
      .innerJoin(emailTemplates, eq(emailTemplates.id, emailSends.template_id))
      .where(
        and(
          eq(emailSends.type, 'transactional'),
          eq(emailSends.source_type, 'business'),
          eq(emailSends.source_id, businessId),
        ),
      )
      .orderBy(desc(emailSends.created_at));
  }

  async isOwner(businessId: string, userId: string): Promise<boolean> {
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

  // ─── Preferencias de notificación del negocio ────────────────────

  async findNotificationPreferences(
    businessId: string,
  ): Promise<BusinessNotificationPreferencesRow | null> {
    const [row] = await this.db
      .select()
      .from(businessNotificationPreferences)
      .where(eq(businessNotificationPreferences.business_id, businessId))
      .limit(1);
    return row ?? null;
  }

  /**
   * `business_notification_preferences`, the MERCHANT-side counterpart of the
   * `consumer_notification_preferences` row that `GET/PATCH
   * /me/notification-preferences` already serves. Same idea, other side of the
   * marketplace — a name this close to the consumer one is worth stating in a
   * comment so nobody adds a second consumer route for this table.
   *
   * THE `updated_at` IS WRITTEN HERE, BECAUSE NOBODY ELSE WRITES IT. There is
   * no `updated_at` trigger on this table: the only trigger in its migration is
   * `trg_create_business_notification_preferences`, an AFTER INSERT on
   * `businesses` that seeds the row, and the only other migration that mentions
   * the table grants and policies it. So the column would sit at its creation
   * value forever and every consumer of it — a "last changed" line in the
   * panel, an audit of when a merchant muted their order alerts — would be
   * reading a lie. Contrast `saved_addresses`, whose `set_saved_addresses_updated_at`
   * trigger IS real: there, and only there, the repository's explicit write is
   * redundant rather than necessary.
   *
   * AN UPSERT, and the row is normally already there: the trigger above plus
   * the `onConflictDoNothing` insert in `create()` both seed it, so a plain
   * UPDATE would be the common case. The upsert is here because the common case
   * is not the only one — a business whose preferences row predates the table,
   * or one inserted into `businesses` with the trigger disabled, has no row, and
   * a PATCH that 404s on that state is a PATCH the merchant cannot recover from.
   * `business_id` is the primary key, so `ON CONFLICT (business_id) DO UPDATE`
   * is one statement against the race as well.
   *
   * Columns the caller cannot reach: `business_id` (it is the path, and the
   * service checked ownership before calling this), `created_at`, and — see
   * `BusinessNotificationPreferencesPatch` — `updated_at`, which is derived.
   */
  async upsertNotificationPreferences(
    businessId: string,
    patch: BusinessNotificationPreferencesPatch,
  ): Promise<BusinessNotificationPreferencesRow | null> {
    if (Object.keys(patch).length === 0) {
      return this.findNotificationPreferences(businessId);
    }
    const [row] = await this.db
      .insert(businessNotificationPreferences)
      .values({ business_id: businessId, ...patch })
      .onConflictDoUpdate({
        target: businessNotificationPreferences.business_id,
        set: { ...patch, updated_at: new Date() },
      })
      .returning();
    return row ?? null;
  }

  async findIdsOwnedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: businessOwnership.business_id })
      .from(businessOwnership)
      .where(eq(businessOwnership.owner_id, userId));
    return rows.map((r) => r.id);
  }

  async listAll(
    query: ListBusinessesQuery,
  ): Promise<{ items: BusinessAggregateRow[]; total: number }> {
    const filters: SQL[] = [];

    if (query.is_active !== undefined) {
      filters.push(eq(businesses.is_active, query.is_active));
    }
    if (query.verification_status) {
      filters.push(this.moderatedAs(query.verification_status));
    }

    if (query.search) {
      filters.push(
        sql`${businesses.name} ILIKE ${`%${escapeLike(query.search)}%`}`,
      );
    }

    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [items, totalRow] = await Promise.all([
      this.aggregateSelect()
        .where(where)
        .orderBy(desc(businesses.created_at))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(businesses)
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  // ─── Superficie pública (sin sesión, sin companions) ────────────────

  /**
   * Base projection for every public business read.
   *
   * It selects from `businesses` ALONE — no join to `business_ownership`,
   * `business_finance` or `business_moderation`. Two reasons, and the second is
   * the one that matters:
   *
   *  - The public contract has none of those columns, so joining would read three
   *    tables per row to discard all of it.
   *  - `owner_id` is the merchant's user account. A projection that pulls it and
   *    then drops it in the mapper is one forgotten `.omit()` away from
   *    publishing the owner identity of every business on the platform.
   *
   * `PublicBusinessRow` is a `Pick` of the business columns for the same reason
   * the zod schema is not `BusinessSchema.omit()`: adding a column to
   * `businesses` must not silently add it to the public surface.
   */
  private publicSelect() {
    return this.db.select(this.publicColumns()).from(businesses);
  }

  /**
   * The column map behind both public reads.
   *
   * The `satisfies` is the repository-side twin of the `PublicBusinessSchema`
   * comment in commons, and it is deliberately an EXACT key-set check
   * (`Record<keyof PublicBusinessRow, unknown>` accepts every value and rejects a
   * missing or extra key) rather than a plain `Pick`. `PublicBusinessRow` is the
   * SELECTED row, so asserting the column BUILDER against it would be a
   * category error; what the two lists have in common is which columns they name,
   * and that is the thing worth pinning. Widening the public surface therefore
   * has to happen in `PublicBusinessRow` AND here AND in the contract, in that
   * order, and the compiler says so.
   */
  private publicColumns() {
    return {
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      slug: businesses.slug,
      image: businesses.image,
      cover_image: businesses.cover_image,
      rating: businesses.rating,
      review_count: businesses.review_count,
      description: businesses.description,
      phone: businesses.phone,
      email: businesses.email,
      website: businesses.website,
      created_at: businesses.created_at,
      updated_at: businesses.updated_at,
    } satisfies Record<keyof PublicBusinessRow, unknown>;
  }

  /**
   * Public catalog page: `public.active_businesses_near`, mirrored (ADR-0008).
   *
   * The RPC this replaces was a plain directory — every active, approved
   * business, newest first. This is a BUSINESS LIST BUILT FROM LIVE OFFERS, and
   * three of its properties are not what a directory reader would assume. They
   * are the SQL's behaviour and the specs pin each one, so read them before
   * "fixing" anything here:
   *
   *  1. `matching_offers` is an INNER join. A business with zero live offers is
   *     absent from the result entirely, not returned with a count of `0`. The
   *     `is_active and stock > 0 and pickup_end > now()` triple is inside the
   *     aggregate, so an expired, sold-out or deactivated offer does not merely
   *     count as nothing — it makes the business disappear.
   *
   *  2. THE TWO DISTANCES ARE COMPUTED INDEPENDENTLY AND CANNOT DISAGREE. The
   *     ORDER BY sorts on `m.min_distance_km`, the minimum over the locations of
   *     the offers that passed the RADIUS filter. The `distance_km` it RETURNS
   *     is measured against the location the LATERAL picked, which is the
   *     nearest among ALL of the business's active offers, with NO radius
   *     filter. Two different subqueries, two different sets — and yet they
   *     return the same number for every row this query can produce:
   *
   *       Let S = the active offers that passed the radius. A row exists at all
   *       only if S is non-empty (property 1), so `min(S) <= radius`. Let D be
   *       the minimum over ALL active offers. `D <= min(S) <= radius`, so the
   *       offer achieving D IS within the radius, so it IS in S, so `D = min(S)`
   *       and the LATERAL picks the same location `min(S)` does.
   *
   *     So the scenario this shape invites — "a radius that excludes the
   *     nearest-by-LATERAL location, leaving the ordering value inside the radius
   *     and the returned one outside it" — is UNREACHABLE. Excluding the
   *     nearest location excludes every location, S empties, and the inner join
   *     drops the business entirely. `businesses.repository.public.near.db.spec.ts`
   *     asserts exactly that at the radius just below the nearest location.
   *
   *     The two subqueries are kept anyway, and deliberately NOT collapsed into
   *     one. They are the RPC's, they are computed from different sets, and
   *     "they provably agree today" is a property of the radius being a
   *     distance bound — not a license to rewrite the SQL into something that
   *     happens to answer the same question. The next person to touch this should
   *     re-derive the argument above before simplifying anything.
   *
   *  3. `min_distance_km` is null when the request carried no point, which makes
   *     the distance ORDER BY key inert (`NULLS LAST`) and leaves
   *     `deals_total desc, name asc` as the ranking.
   *
   * ─── DIVERGENCES FROM THE SQL, both deliberate ───────────────────────────
   *
   *  - `publiclyVisibleBusiness()` is applied even though the RPC has no
   *    moderation gate anywhere. The RPC reaches this table through PostgREST
   *    under RLS; the API has no RLS and would otherwise publish a business
   *    still in review. Every other public surface here resolves through the
   *    same function (`availableNow()` in the offers catalog, the gate on this
   *    route's own previous shape, `activeOfferCounts()` in the categories
   *    aggregate), and this is the fourth copy of the same rule arriving at the
   *    same place. The gate sits on the OUTER query, where `businesses` is
   *    already joined for the `type` filter, and correlates to that row.
   *
   *  - `search` KEEPS `escapeLike`, which the RPC does not. This route escaped it
   *    before the geo work and a spec asserts it; the offers feed does not
   *    escape. Reversing a tested property of this route to match a sibling
   *    endpoint is a separate decision, not a side effect of mirroring a
   *    function, so it was left alone.
   */
  async listPublic(query: ListPublicBusinessesQuery): Promise<{
    items: PublicBusinessNearRow[];
    total: number;
  }> {
    const coords = businessCoords(query);
    const matching = this.matchingOffers(coords, query.radius_km);
    const loc = this.nearestLocation(matching, coords);

    const filters: SQL[] = [publiclyVisibleBusiness()];

    if (query.search) {
      filters.push(
        sql`${businesses.name} ILIKE ${`%${escapeLike(query.search)}%`}`,
      );
    }

    // `b.type::text = lower(p_type)`: the PARAMETER is lowercased, so a caller
    // that sends `Restaurant` matches `restaurant`. The cast is needed because
    // `businesses.type` is a Postgres enum and `=` has no enum/text operator.
    if (query.type) {
      filters.push(sql`${businesses.type}::text = lower(${query.type})`);
    }

    const where = and(...filters);
    const offset = (query.page - 1) * query.limit;

    // Same `where` object for the page and the count, over the same set the page
    // walks: the count joins the SAME `matching_offers` aggregate, so `meta.total`
    // counts businesses with live offers rather than the whole catalog. The two
    // `Promise.all` branches build the statement independently, so a drift
    // between them would show up here as a `total` that does not match the page.
    const [items, totalRow] = await Promise.all([
      this.db
        .select({
          ...this.publicColumns(),
          // `m.deals_total`, projected as the RPC's `active_deals_count`. It is
          // a `bigint`, so it arrives as a STRING; the mapper runs `toNumber`,
          // the same as `CategoryDto.active_count`.
          active_deals_count: matching.deals_total,
          // Measured against the LATERAL's location, not against
          // `min_distance_km` — see property 2 on this method.
          distance_km: loc.distance_km,
          business_location_id: loc.id,
          address: loc.address,
          latitude: loc.latitude,
          longitude: loc.longitude,
          zone: loc.zone,
        })
        .from(matching)
        .innerJoin(businesses, eq(matching.business_id, businesses.id))
        // `join lateral (...) loc on true` verbatim. The subquery is a correlated
        // one-row pick, so `on true` is not a cross join dressed up: it is how
        // LATERAL is spelled.
        .innerJoinLateral(loc, sql`true`)
        .where(where)
        .orderBy(
          // The RPC's ONE static `order by` serving TWO orderings: a `CASE` whose
          // value is non-null only for `sort = 'distance'`, and `NULLS LAST` so
          // every other value leaves the key inert and falls through to
          // `deals_total desc, name asc`. Same technique, and the same reason, as
          // `offerListOrderBy` in the offers catalog.
          sql`CASE WHEN ${query.sort ?? 'deals'} = 'distance' AND ${matching.min_distance_km} IS NOT NULL THEN ${matching.min_distance_km} END ASC NULLS LAST`,
          desc(matching.deals_total),
          asc(businesses.name),
        )
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(matching)
        .innerJoin(businesses, eq(matching.business_id, businesses.id))
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

  /**
   * The `matching_offers` CTE of `active_businesses_near`, as a derived table.
   *
   * Column-for-column the RPC's aggregate: `business_id`, `count(*)` as
   * `deals_total`, and `min(...)` of the distance as `min_distance_km`. The
   * radius filter lives HERE and not in the outer query, which is what makes
   * property 2 on `listPublic` true: `min_distance_km` is a minimum over the
   * offers that passed it.
   *
   * `businesses` is NOT joined, because the gate that needs it is applied on the
   * outer query where the table is already there. That is the whole difference
   * from `CategoriesRepository.activeOfferCounts()`, which has to join it for the
   * same predicate — the offers aggregate genuinely filters the offers, this one
   * filters the businesses around them.
   */
  private matchingOffers(coords?: BusinessCoords, radiusKm?: number) {
    const filters: SQL[] = [
      eq(offers.is_active, true),
      gt(offers.stock, 0),
      gt(offers.pickup_end, sql`now()`),
    ];

    // `(p_lat is null or p_lng is null or p_radius_km is null or st_dwithin(...))`
    // collapsed into "push the filter only when all three are present", the same
    // decision `OffersRepository.buildFilters` makes. A search that silently
    // became a 0 km radius would answer nothing at all.
    if (coords && radiusKm !== undefined) {
      filters.push(
        sql`extensions.st_dwithin(
          business_locations.geog,
          extensions.st_setsrid(extensions.st_makepoint(${coords.lng}, ${coords.lat}), 4326)::extensions.geography,
          ${radiusKm} * 1000.0
        )`,
      );
    }

    return this.db
      .select({
        business_id: offers.business_id,
        // `.as()` is mandatory, not cosmetic: the outer select reads both of
        // these, and Drizzle cannot reference a raw SQL field of a subquery
        // without one. Same as `CategoryRepository.activeOfferCounts`.
        deals_total: sql<string>`count(*)::bigint`.as('deals_total'),
        // `min(case when <no point> then null else <distance> end)`, which is
        // `min(NULL::double precision)` when there is no point — a null
        // `min_distance_km`, and that is what makes the distance ORDER BY key
        // inert instead of ranking everything at 0 km.
        //
        // The `.as()` is mandatory, not cosmetic: the ORDER BY references this
        // field, and Drizzle cannot reference a raw SQL field of a subquery
        // without one (it throws at build time). Same as `deals_total`.
        min_distance_km: sql<number | null>`min(${distanceKmSql(coords)})`.as(
          'min_distance_km',
        ),
      })
      .from(offers)
      .innerJoin(
        businessLocations,
        eq(offers.business_location_id, businessLocations.id),
      )
      .where(and(...filters))
      .groupBy(offers.business_id)
      .as('matching_offers');
  }

  /**
   * The RPC's `join lateral (...) loc on true`, as a correlated one-row pick.
   *
   * The nearest location among ALL of the business's active offers — no radius
   * filter. The `order by <distance> asc nulls last, l2.id` is reproduced
   * verbatim, and the `l2.id` is not decoration: without it a business with two
   * offers at the same distance could name a different pickup point on two
   * requests of the same response, and `businesses.name` is NOT unique so the
   * page-level order has no tiebreaker of its own either.
   *
   * `distance_km` is selected HERE rather than recomputed on the outer query
   * against `loc.geog`. Same value — it is the same `st_distance` over the same
   * row — and it is emitted once instead of twice. See property 2 on
   * `listPublic` for why the two subqueries are kept separate even though they
   * agree.
   */
  private nearestLocation(
    matching: ReturnType<BusinessesRepository['matchingOffers']>,
    coords?: BusinessCoords,
  ) {
    return (
      this.db
        .select({
          id: businessLocations.id,
          address: businessLocations.address,
          latitude: businessLocations.latitude,
          longitude: businessLocations.longitude,
          zone: businessLocations.zone,
          // `.as()` for the same reason `min_distance_km` has one: the outer
          // select reads this field off the lateral.
          distance_km: distanceKmSql(coords).as('distance_km'),
        })
        .from(offers)
        .innerJoin(
          businessLocations,
          eq(offers.business_location_id, businessLocations.id),
        )
        // `o2.is_active and o2.stock > 0 and o2.pickup_end > now()`: the SAME
        // triple as `matchingOffers`, re-stated, because the RPC re-states it too.
        // It is not redundant there either — the LATERAL reads every active offer
        // of the business, and an offer that sold out an instant after the
        // aggregate ran must not send a reader to a point with nothing on it.
        .where(
          and(
            eq(offers.business_id, matching.business_id),
            eq(offers.is_active, true),
            gt(offers.stock, 0),
            gt(offers.pickup_end, sql`now()`),
          ),
        )
        .orderBy(
          sql`${distanceKmSql(coords)} ASC NULLS LAST`,
          asc(businessLocations.id),
        )
        .limit(1)
        .as('loc')
    );
  }

  /**
   * One public business, or `null`.
   *
   * `null` covers all three "not for you" cases — unknown id, deactivated,
   * not approved — and the service turns every one of them into the same 404. A
   * 403 here would confirm that the id exists, which is the only thing the
   * caller did not already know.
   */
  async findPublicById(id: string): Promise<PublicBusinessRow | null> {
    const [row] = await this.publicSelect()
      .where(and(eq(businesses.id, id), publiclyVisibleBusiness()))
      .limit(1);
    return row ?? null;
  }

  /**
   * Pickup points of a public business, active only.
   *
   * `is_active = true` is the same rule the `business_locations` SELECT policy
   * applies to a direct PostgREST read, and it is a different rule from the one on
   * the business row: a business can be public while one of its points is
   * paused, and a paused point is not somewhere to collect food.
   */
  async listPublicLocations(
    businessId: string,
  ): Promise<BusinessLocationRow[]> {
    return this.db
      .select()
      .from(businessLocations)
      .where(
        and(
          eq(businessLocations.business_id, businessId),
          eq(businessLocations.is_active, true),
        ),
      )
      .orderBy(
        desc(businessLocations.is_headquarter),
        asc(businessLocations.name),
      );
  }

  /**
   * Weekly schedule of a public business, monday first.
   *
   * `day` is a Postgres enum, and enums are ordered by their declaration order,
   * so `order by day` is already monday→sunday. The rows are bounded to seven by
   * `unique(business_id, day)`, which is why this is not paginated: there is no
   * second page of a weekly schedule.
   */
  async listPublicHours(businessId: string): Promise<BusinessHoursRow[]> {
    return this.db
      .select()
      .from(businessHours)
      .where(eq(businessHours.business_id, businessId))
      .orderBy(asc(businessHours.day));
  }

  // Business Locations
  async insertLocation(
    executor: DbExecutor,
    values: BusinessLocationInsert,
  ): Promise<BusinessLocationRow> {
    const [row] = await executor
      .insert(businessLocations)
      .values(values)
      .returning();
    if (!row) {
      throw new Error('Failed to insert business location');
    }
    return row;
  }

  async updateLocation(
    executor: DbExecutor,
    id: string,
    values: BusinessLocationUpdate,
  ): Promise<BusinessLocationRow | null> {
    const [row] = await executor
      .update(businessLocations)
      .set({ ...values, updated_at: sql`now()` })
      .where(eq(businessLocations.id, id))
      .returning();
    return row ?? null;
  }

  async findLocationById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<BusinessLocationRow | null> {
    const [row] = await executor
      .select()
      .from(businessLocations)
      .where(eq(businessLocations.id, id))
      .limit(1);
    return row ?? null;
  }

  async listLocationsForBusiness(
    businessId: string,
    query: ListBusinessLocationsQuery,
  ): Promise<{ items: BusinessLocationRow[]; total: number }> {
    const filters: SQL[] = [eq(businessLocations.business_id, businessId)];

    if (query.is_active !== undefined) {
      filters.push(eq(businessLocations.is_active, query.is_active));
    }

    const where = and(...filters);
    const offset = (query.page - 1) * query.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(businessLocations)
        .where(where)
        .orderBy(desc(businessLocations.created_at))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(businessLocations)
        .where(where)
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    return { items, total: Number(totalRow) };
  }

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
}
