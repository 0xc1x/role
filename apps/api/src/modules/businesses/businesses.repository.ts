import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businessLocations, businesses } from '../../database/schema';
import { payouts } from '../../database/schema/payouts';
import type {
  ListBusinessesQuery,
  ListBusinessLocationsQuery,
} from '@0xc1x/role-commons';

export type BusinessRow = typeof businesses.$inferSelect;
export type BusinessInsert = typeof businesses.$inferInsert;
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
    | 'commission_rate'
    | 'is_active'
  >
>;

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

  async insert(
    executor: DbExecutor,
    values: BusinessInsert,
  ): Promise<BusinessRow> {
    const [row] = await executor.insert(businesses).values(values).returning();
    if (!row) {
      throw new Error('Failed to insert business');
    }
    return row;
  }

  async update(
    executor: DbExecutor,
    id: string,
    values: BusinessUpdate,
  ): Promise<BusinessRow | null> {
    const [row] = await executor
      .update(businesses)
      .set({ ...values, updated_at: sql`now()` })
      .where(eq(businesses.id, id))
      .returning();
    return row ?? null;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.db,
  ): Promise<BusinessRow | null> {
    const [row] = await executor
      .select()
      .from(businesses)
      .where(eq(businesses.id, id))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(
    slug: string,
    executor: DbExecutor = this.db,
  ): Promise<BusinessRow | null> {
    const [row] = await executor
      .select()
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async listForUser(
    userId: string,
    query: ListBusinessesQuery,
  ): Promise<{ items: BusinessRow[]; total: number }> {
    const filters: SQL[] = [eq(businesses.owner_id, userId)];

    if (query.is_active !== undefined) {
      filters.push(eq(businesses.is_active, query.is_active));
    }

    const where = and(...filters);
    const offset = (query.page - 1) * query.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(businesses)
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

  async isOwner(businessId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(eq(businesses.id, businessId), eq(businesses.owner_id, userId)),
      )
      .limit(1);
    return Boolean(row);
  }

  async findIdsOwnedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.owner_id, userId));
    return rows.map((r) => r.id);
  }

  async listAll(
    query: ListBusinessesQuery,
  ): Promise<{ items: BusinessRow[]; total: number }> {
    const filters: SQL[] = [];

    if (query.is_active !== undefined) {
      filters.push(eq(businesses.is_active, query.is_active));
    }

    if (query.search) {
      filters.push(sql`${businesses.name} ILIKE ${`%${query.search}%`}`);
    }

    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(businesses)
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
