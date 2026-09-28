import { randomUUID } from 'node:crypto';
import {
  businessFinance,
  businessHours,
  businessLocations,
  businessModeration,
  businessOwnership,
  businesses,
  categories,
  offers,
  orders,
  profiles,
} from '../src/database/schema';
import type { TestDatabase } from './db';

/** Seeds mínimos para specs de repositories (DB real, aislada por archivo). */
export async function seedProfile(db: TestDatabase, email?: string) {
  const id = randomUUID();
  await db.insert(profiles).values({ id, email: email ?? `${id}@test.cl` });
  return id;
}

/**
 * Inserta el negocio y sus tres companions. El espejo no tiene los triggers de
 * Supabase que crean estas filas, así que el seed las escribe explícitamente
 * (mismo inventario que el backfill de la migración).
 */
export async function seedBusiness(
  db: TestDatabase,
  ownerId: string,
  overrides: {
    name?: string;
    slug?: string;
    is_active?: boolean;
    verification_status?: 'pending' | 'approved' | 'rejected';
  } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(businesses)
    .values({
      name: overrides.name ?? `Negocio ${suffix}`,
      slug: overrides.slug ?? `negocio-${suffix}`,
      is_active: overrides.is_active ?? true,
    })
    .returning();
  if (!row) throw new Error('seedBusiness falló');
  await db
    .insert(businessOwnership)
    .values({ business_id: row.id, owner_id: ownerId });
  await db.insert(businessFinance).values({ business_id: row.id });
  await db.insert(businessModeration).values({
    business_id: row.id,
    verification_status: overrides.verification_status ?? 'approved',
  });
  return row;
}

/**
 * A business location. `latitude`/`longitude` are NOT NULL in the mirror and
 * keep the pair every spec has always used as their default; the geo specs
 * override them because the geo path of `GET /offers` is a function of these two
 * columns (through the generated `geog`), and one shared coordinate would make
 * every location equidistant from every search point.
 *
 * `zone` is a three-state override on purpose: pass a string for a labelled
 * location, `null` for "never filled in" and `''` for "filled in with nothing".
 * `popular_zones` filters those last two out with two DIFFERENT predicates
 * (`zone is not null` and `zone <> ''`), so a spec that cannot produce both
 * cannot prove either.
 */
export async function seedLocation(
  db: TestDatabase,
  businessId: string,
  overrides: {
    name?: string;
    is_active?: boolean;
    latitude?: string;
    longitude?: string;
    zone?: string | null;
  } = {},
) {
  const [row] = await db
    .insert(businessLocations)
    .values({
      business_id: businessId,
      name: overrides.name ?? 'Matriz',
      address: 'Calle 123',
      is_active: overrides.is_active ?? true,
      latitude: overrides.latitude ?? '-33.45',
      longitude: overrides.longitude ?? '-70.66',
      zone: overrides.zone ?? null,
    })
    .returning();
  if (!row) throw new Error('seedLocation falló');
  return row;
}

/**
 * One weekday of a weekly schedule. `day` accepts any `DAYS_OF_WEEK` value; the
 * storefront spec seeds two of them out of order on purpose, because the read
 * orders by the enum's declaration order and not by insertion order.
 */
export async function seedBusinessHours(
  db: TestDatabase,
  businessId: string,
  overrides: {
    day?:
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday'
      | 'sunday';
    open_time?: string;
    close_time?: string;
    is_closed?: boolean;
  } = {},
) {
  const [row] = await db
    .insert(businessHours)
    .values({
      business_id: businessId,
      day: overrides.day ?? 'monday',
      open_time: overrides.open_time ?? '09:00:00',
      close_time: overrides.close_time ?? '18:00:00',
      is_closed: overrides.is_closed ?? false,
    })
    .returning();
  if (!row) throw new Error('seedBusinessHours falló');
  return row;
}

export async function seedCategory(db: TestDatabase, name?: string) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(categories)
    .values({ name: name ?? `Cat ${suffix}`, slug: `cat-${suffix}` })
    .returning();
  if (!row) throw new Error('seedCategory falló');
  return row;
}

export async function seedOffer(
  db: TestDatabase,
  businessId: string,
  locationId: string,
  overrides: { stock?: number; is_active?: boolean } = {},
) {
  const [row] = await db
    .insert(offers)
    .values({
      business_id: businessId,
      business_location_id: locationId,
      title: 'Pack sorpresa',
      original_price: '10000',
      discounted_price: '3990',
      stock: overrides.stock ?? 5,
      initial_stock: 5,
      pickup_start: new Date(Date.now() - 3600_000),
      pickup_end: new Date(Date.now() + 3600_000),
      is_active: overrides.is_active ?? true,
    })
    .returning();
  if (!row) throw new Error('seedOffer falló');
  return row;
}

export async function seedOrder(
  db: TestDatabase,
  userId: string,
  offerId: string,
  businessId: string,
  overrides: {
    status?: string;
    order_number?: string;
    idempotency_key?: string;
  } = {},
) {
  const [row] = await db
    .insert(orders)
    .values({
      user_id: userId,
      offer_id: offerId,
      business_id: businessId,
      order_number: overrides.order_number ?? `R-${randomUUID().slice(0, 8)}`,
      status: (overrides.status ?? 'pending') as never,
      idempotency_key: overrides.idempotency_key,
      price: '3990',
      original_price: '10000',
      pickup_code: 'ABC123',
    })
    .returning();
  if (!row) throw new Error('seedOrder falló');
  return row;
}
