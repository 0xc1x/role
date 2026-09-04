import { randomUUID } from 'node:crypto';
import {
  businessLocations,
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
  await db
    .insert(profiles)
    .values({ id, email: email ?? `${id}@test.cl` });
  return id;
}

export async function seedBusiness(
  db: TestDatabase,
  ownerId: string,
  overrides: { name?: string; slug?: string } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(businesses)
    .values({
      owner_id: ownerId,
      name: overrides.name ?? `Negocio ${suffix}`,
      slug: overrides.slug ?? `negocio-${suffix}`,
    })
    .returning();
  if (!row) throw new Error('seedBusiness falló');
  return row;
}

export async function seedLocation(db: TestDatabase, businessId: string) {
  const [row] = await db
    .insert(businessLocations)
    .values({
      business_id: businessId,
      name: 'Matriz',
      address: 'Calle 123',
      latitude: '-33.45',
      longitude: '-70.66',
    })
    .returning();
  if (!row) throw new Error('seedLocation falló');
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
  overrides: { status?: string; order_number?: string } = {},
) {
  const [row] = await db
    .insert(orders)
    .values({
      user_id: userId,
      offer_id: offerId,
      business_id: businessId,
      order_number: overrides.order_number ?? `R-${randomUUID().slice(0, 8)}`,
      status: (overrides.status ?? 'pending') as never,
      price: '3990',
      original_price: '10000',
      pickup_code: 'ABC123',
    })
    .returning();
  if (!row) throw new Error('seedOrder falló');
  return row;
}
