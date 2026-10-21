import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  businessFinance,
  businessHours,
  businessLocations,
  businessMembers,
  businessModeration,
  businesses,
  categories,
  offers,
  orders,
  profiles,
} from '../src/database/schema';
import type { BusinessMemberRole } from '@0xc1x/role-commons';
import type { TestDatabase } from './db';

/** Seeds mínimos para specs de repositories (DB real, aislada por archivo). */
export async function seedProfile(db: TestDatabase, email?: string) {
  const id = randomUUID();
  await db.insert(profiles).values({ id, email: email ?? `${id}@test.cl` });
  return id;
}

/**
 * A `business_members` row: the membership that decides the §8 erase path.
 *
 * It exists because `business_members` is the table whose `user_id` cascades from
 * `profiles`, and a fixture without a membership row cannot observe anything about
 * that cascade. The alias is unique per business on `lower(alias)` and is NOT
 * partial on `deleted_at`, so a spec can assert that an archived row still burns
 * its alias by trying to insert the same one.
 *
 * `session_ttl_hours` and `last_authenticated_at` son overrides y no accidents:
 * el TTL decide si la sesión de esa membresía está dentro de la promesa del
 * §5.2, y `0` es el modo «equipo propio» —sin vencimiento— con el que nacen
 * los dueños. Una fila con TTL y sin sello está vencida, y una spec que no lo
 * diga está probando una sesión que en producción no existe.
 */
export async function seedBusinessMember(
  db: TestDatabase,
  businessId: string,
  userId: string,
  overrides: {
    role?: BusinessMemberRole;
    label?: string;
    alias?: string;
    status?: 'active' | 'disabled';
    session_ttl_hours?: number;
    last_authenticated_at?: Date | null;
    deleted_at?: Date | null;
  } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(businessMembers)
    .values({
      business_id: businessId,
      user_id: userId,
      role: overrides.role ?? 'staff',
      label: overrides.label ?? `Miembro ${suffix}`,
      alias: overrides.alias ?? `miembro-${suffix}@negocio.role.ec`,
      status: overrides.status ?? 'active',
      session_ttl_hours: overrides.session_ttl_hours ?? 24,
      last_authenticated_at: overrides.last_authenticated_at ?? null,
      deleted_at: overrides.deleted_at ?? null,
    })
    .returning();
  if (!row) throw new Error('seedBusinessMember falló');
  return row;
}

/**
 * Inserta el negocio y sus dos companions. El espejo no tiene los triggers de
 * Supabase que crean estas filas, así que el seed las escribe explícitamente
 * (mismo inventario que el backfill de la migración).
 *
 * Y escribe TAMBIÉN la membresía del dueño, porque es lo que hace el API desde
 * que el permiso se resuelve por `business_members`: un negocio sin fila de
 * dueño en `business_members` es un negocio sin dueño, y un spec que siembra un
 * negocio sin dueño midiendo otra cosa.
 *
 * `owner_membership: false` es el escape para el spec que siembra su propia
 * membresía —porque necesita el id de la fila— y para el que necesita el
 * estado anterior al backfill. Por defecto está en `true`, porque el estado por
 * defecto de una base es el de producción: un negocio con dueño.
 *
 * El alias es el correo del dueño —como el backfill—, y el TTL es 0 —como
 * `20261016022631`—: un dueño no es una tablet compartida.
 */
export async function seedBusiness(
  db: TestDatabase,
  ownerId: string,
  overrides: {
    name?: string;
    slug?: string;
    type?: 'restaurant' | 'bakery' | 'cafe' | 'grocery' | 'other';
    is_active?: boolean;
    verification_status?: 'pending' | 'approved' | 'rejected';
    owner_membership?: boolean;
  } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(businesses)
    .values({
      name: overrides.name ?? `Negocio ${suffix}`,
      slug: overrides.slug ?? `negocio-${suffix}`,
      // Defaults to `restaurant` the same way the table does. Overridable
      // because the public catalog filters on `b.type::text = lower(p_type)`, and
      // a spec that cannot set a type cannot prove that comparison.
      type: overrides.type,
      is_active: overrides.is_active ?? true,
    })
    .returning();
  if (!row) throw new Error('seedBusiness falló');
  if (overrides.owner_membership !== false) {
    const [ownerProfile] = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, ownerId))
      .limit(1);
    await db.insert(businessMembers).values({
      business_id: row.id,
      user_id: ownerId,
      role: 'owner',
      label: row.name,
      alias: ownerProfile?.email ?? `${ownerId}@owner.invalid`,
      status: 'active',
      session_ttl_hours: 0,
    });
  }
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
  overrides: {
    stock?: number;
    is_active?: boolean;
    /**
     * Overridable because `pickup_end > now()` is one third of the definition of
     * a live offer, and a spec that cannot write an expired window cannot prove
     * that an expired offer removes its BUSINESS from `active_businesses_near`
     * rather than merely counting as nothing.
     */
    pickup_end?: Date;
    title?: string;
  } = {},
) {
  const [row] = await db
    .insert(offers)
    .values({
      business_id: businessId,
      business_location_id: locationId,
      title: overrides.title ?? 'Pack sorpresa',
      original_price: '10000',
      discounted_price: '3990',
      stock: overrides.stock ?? 5,
      initial_stock: 5,
      pickup_start: new Date(Date.now() - 3600_000),
      pickup_end: overrides.pickup_end ?? new Date(Date.now() + 3600_000),
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
