import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
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
    return this.db
      .select({
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
      })
      .from(businesses);
  }

  /**
   * Public catalog page: active + moderation-approved businesses, newest first.
   *
   * The gate (`publiclyVisibleBusiness()`) is applied here and not taken from the
   * query, which is why the admin-only filters of `ListBusinessesQuerySchema`
   * (`is_active`, `verification_status`, `owner_id`, `mine`) are simply not part
   * of `ListPublicBusinessesQuerySchema`: on a public route they could only ever
   * try to widen this predicate.
   */
  async listPublic(query: ListPublicBusinessesQuery): Promise<{
    items: PublicBusinessRow[];
    total: number;
  }> {
    const filters: SQL[] = [publiclyVisibleBusiness()];

    if (query.search) {
      filters.push(
        sql`${businesses.name} ILIKE ${`%${escapeLike(query.search)}%`}`,
      );
    }

    const where = and(...filters);
    const offset = (query.page - 1) * query.limit;

    // Same `where` object for the page and the count, and the count reads
    // `businesses` alone: with the gate being an `exists` subquery there is
    // nothing to join, so `meta.total` is the size of the set the page walks.
    const [items, totalRow] = await Promise.all([
      this.publicSelect()
        .where(where)
        .orderBy(desc(businesses.created_at), desc(businesses.id))
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
