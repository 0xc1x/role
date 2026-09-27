import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { ListOffersQuery } from '@0xc1x/role-commons';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedCategory,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { offers } from '../../database/schema';
import {
  distanceKmSql,
  offerListOrderBy,
  OffersRepository,
} from './offers.repository';

let ctx: TestDbContext;
let repo: OffersRepository;
let businessId: string;
let locationId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new OffersRepository(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  locationId = (await seedLocation(ctx.db, businessId)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('OffersRepository (DB real)', () => {
  test('insert + findById + update', async () => {
    const row = await repo.insert(ctx.db, {
      business_id: businessId,
      business_location_id: locationId,
      title: 'Pack',
      original_price: '8000',
      discounted_price: '3000',
      pickup_start: new Date(Date.now() - 1000),
      pickup_end: new Date(Date.now() + 3600_000),
      // findById is the PUBLIC detail read and only returns reservable offers,
      // so the fixture has to be one. A row born is_active=false is invisible
      // there by design.
      is_active: true,
    });
    const found = await repo.findById(row.id);
    expect(found?.title).toBe('Pack');
    expect(found?.business_name).toBeDefined();
    expect(
      await repo.findById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
    expect(await repo.update(ctx.db, row.id, { title: 'Pack2' })).toMatchObject(
      {
        title: 'Pack2',
      },
    );
  });

  test('findById hides an offer that is not reservable', async () => {
    const base = {
      business_id: businessId,
      business_location_id: locationId,
      title: 'No reservable',
      original_price: '1000',
      discounted_price: '500',
    };

    // Sold out: the catalog, the search and the random hero all hide it, so the
    // public detail endpoint must not hand it out by UUID either.
    const soldOut = await repo.insert(ctx.db, {
      ...base,
      pickup_start: new Date(Date.now() - 1000),
      pickup_end: new Date(Date.now() + 3600_000),
      is_active: true,
      stock: 0,
    });
    expect(await repo.findById(soldOut.id)).toBeNull();

    // Pickup window already closed.
    const expired = await repo.insert(ctx.db, {
      ...base,
      title: 'Vencida por ventana',
      pickup_start: new Date(Date.now() - 7200_000),
      pickup_end: new Date(Date.now() - 3600_000),
      is_active: true,
    });
    expect(await repo.findById(expired.id)).toBeNull();

    // Paused by the owner.
    const paused = await repo.insert(ctx.db, {
      ...base,
      title: 'Pausada',
      pickup_start: new Date(Date.now() - 1000),
      pickup_end: new Date(Date.now() + 3600_000),
      is_active: false,
    });
    expect(await repo.findById(paused.id)).toBeNull();

    // Business not moderation-approved: the row exists and is active, and it is
    // still not reservable, so it must not be publicly readable.
    const owner = await seedProfile(ctx.db);
    const pending = await seedBusiness(ctx.db, owner, {
      verification_status: 'pending',
    });
    const pendingLocation = await seedLocation(ctx.db, pending.id);
    const unapproved = await repo.insert(ctx.db, {
      business_id: pending.id,
      business_location_id: pendingLocation.id,
      title: 'Negocio sin aprobar',
      original_price: '1000',
      discounted_price: '500',
      pickup_start: new Date(Date.now() - 1000),
      pickup_end: new Date(Date.now() + 3600_000),
    });
    expect(await repo.findById(unapproved.id)).toBeNull();
  });

  test('unapproved business forces new offers inactive', async () => {
    const owner = await seedProfile(ctx.db);
    const pending = await seedBusiness(ctx.db, owner, {
      verification_status: 'pending',
    });
    const pendingLocation = await seedLocation(ctx.db, pending.id);

    const offer = await seedOffer(ctx.db, pending.id, pendingLocation.id, {
      is_active: true,
    });

    expect(offer.is_active).toBe(false);
    expect(await repo.isBusinessAvailableForOffers(ctx.db, pending.id)).toBe(
      false,
    );
  });

  test('composite FK rejects a location from another business', async () => {
    const otherOwner = await seedProfile(ctx.db);
    const otherBusiness = await seedBusiness(ctx.db, otherOwner);
    const otherLocation = await seedLocation(ctx.db, otherBusiness.id);

    await expect(
      repo.insert(ctx.db, {
        business_id: businessId,
        business_location_id: otherLocation.id,
        title: 'Invalid relationship',
        original_price: '1000',
        discounted_price: '500',
        pickup_start: new Date(Date.now() - 1000),
        pickup_end: new Date(Date.now() + 3600_000),
      }),
    ).rejects.toThrow();
  });

  test('setCategories + findCategoryIds', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    const cat = await seedCategory(ctx.db);
    await repo.setCategories(ctx.db, offer.id, [cat.id]);
    expect(await repo.findCategoryIds(offer.id)).toEqual([cat.id]);
    await repo.setCategories(ctx.db, offer.id, []);
    expect(await repo.findCategoryIds(offer.id)).toEqual([]);
  });

  test('decrementStock/incrementStock', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    expect(await repo.decrementStock(ctx.db, offer.id, 2)).toBe(true);
    expect(await repo.incrementStock(ctx.db, offer.id, 1)).toBe(true);
    const found = await repo.findById(offer.id);
    expect(found?.stock).toBe(4);
  });

  test('findRandomActive solo activas con stock', async () => {
    await seedOffer(ctx.db, businessId, locationId, { is_active: false });
    for (let i = 0; i < 3; i++) {
      const row = await repo.findRandomActive();
      expect(row?.is_active).toBe(true);
    }
  });

  test('isBusinessOwner y locationBelongsToBusiness', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    expect(await repo.isBusinessOwner(biz.id, owner)).toBe(true);
    expect(await repo.isBusinessOwner(biz.id, businessId)).toBe(false);
    expect(await repo.locationBelongsToBusiness(locationId, businessId)).toBe(
      true,
    );
    expect(await repo.locationBelongsToBusiness(locationId, biz.id)).toBe(
      false,
    );
  });
});

describe('OffersRepository consultas (DB real)', () => {
  test('findMany con available_only y búsqueda', async () => {
    const all = await repo.findMany({ page: 1, limit: 10, sort: 'pickup_end' });
    expect(all.total).toBeGreaterThanOrEqual(1);
    const avail = await repo.findMany({
      page: 1,
      limit: 10,
      sort: 'pickup_end',
      available_only: true,
    });
    expect(avail.items.every((o) => o.is_active && o.stock > 0)).toBe(true);
    const search = await repo.findMany({
      page: 1,
      limit: 10,
      sort: 'pickup_end',
      search: 'pack',
    });
    expect(search.total).toBeGreaterThanOrEqual(1);
    const byBiz = await repo.findMany({
      page: 1,
      limit: 10,
      sort: 'pickup_end',
      business_id: businessId,
    });
    expect(byBiz.items.every((o) => o.business_id === businessId)).toBe(true);
  });

  test('findBusinessIdsOwnedBy y findActiveCategoryIds', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    expect(await repo.findBusinessIdsOwnedBy(owner)).toContain(biz.id);
    const cat = await seedCategory(ctx.db);
    expect(
      await repo.findActiveCategoryIds([
        cat.id,
        '00000000-0000-0000-0000-000000000000',
      ]),
    ).toEqual([cat.id]);
    expect(await repo.findActiveCategoryIds([])).toEqual([]);
  });

  test('findByIdForUpdate dentro de transacción', async () => {
    const offer = await seedOffer(ctx.db, businessId, locationId);
    const found = await repo.transaction((tx) =>
      repo.findByIdForUpdate(tx, offer.id),
    );
    expect(found?.id).toBe(offer.id);
  });

  test('expireStale desactiva vencidas; candidatos a expirar', async () => {
    const stale = await repo.insert(ctx.db, {
      business_id: businessId,
      business_location_id: locationId,
      title: 'Vencida',
      original_price: '1000',
      discounted_price: '500',
      pickup_start: new Date(Date.now() - 7200_000),
      pickup_end: new Date(Date.now() - 3600_000),
      is_active: true,
    });
    expect(await repo.expireStale(new Date())).toBeGreaterThanOrEqual(1);
    // findDtoById, not findById: this offer's pickup window has closed, which is
    // exactly the case the public detail endpoint must hide. The assertion here
    // is about the row's is_active flag, so it reads it unfiltered.
    expect(await repo.findDtoById(stale.id)).toMatchObject({
      is_active: false,
    });

    const user = await seedProfile(ctx.db);
    const order = await seedOrder(ctx.db, user, stale.id, businessId);
    const cands = await repo.findOrderCandidatesToExpire(new Date());
    expect(cands.map((c) => c.orderId)).toContain(order.id);
  });
});

/**
 * The search / filter / sort semantics of `public.active_offers_near`, which
 * until now only existed inside the Supabase function: `GET /offers` answered a
 * different question than the mobile feed for the same intent (ADR-0008).
 *
 * One business per test, so each ordering assertion is about a known set and
 * cannot be satisfied by rows an earlier test happened to leave behind.
 */
describe('OffersRepository — espejo de active_offers_near (ADR-0008)', () => {
  const HOUR = 3_600_000;
  const at = (hours: number) => new Date(Date.now() + hours * HOUR);

  type OfferOverrides = {
    title?: string;
    description?: string | null;
    original_price?: string;
    discounted_price?: string;
    pickup_end?: Date;
    is_active?: boolean;
    stock?: number;
  };

  /** An approved business + location and a factory for its offers. */
  async function fixture(name?: string) {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, name ? { name } : {});
    const loc = await seedLocation(ctx.db, biz.id);
    const offer = async (over: OfferOverrides = {}) =>
      repo.insert(ctx.db, {
        business_id: biz.id,
        business_location_id: loc.id,
        title: over.title ?? 'Oferta',
        description: over.description ?? null,
        original_price: over.original_price ?? '10000',
        discounted_price: over.discounted_price ?? '3000',
        stock: over.stock ?? 5,
        initial_stock: 5,
        pickup_start: new Date(Date.now() - HOUR),
        pickup_end: over.pickup_end ?? at(2),
        is_active: over.is_active ?? true,
      });
    return { bizId: biz.id, offer };
  }

  /** `created_at` is a column default, so an ordering test has to pin it. */
  async function pinCreatedAt(id: string, when: Date) {
    await ctx.db
      .update(offers)
      .set({ created_at: when })
      .where(eq(offers.id, id));
  }

  async function listIds(
    bizId: string,
    query: Omit<Partial<ListOffersQuery>, 'page' | 'limit' | 'business_id'>,
  ): Promise<string[]> {
    const { items } = await repo.findMany({
      page: 1,
      limit: 50,
      business_id: bizId,
      ...query,
    });
    return items.map((i) => i.id);
  }

  test('search mira título, descripción y nombre del negocio (ilike)', async () => {
    const { bizId, offer } = await fixture('Panadería Aurora');
    const row = await offer({
      title: 'Mesa de sobrantes',
      description: 'Pan y pastelería del día anterior',
    });

    // Business name: the column the endpoint used to ignore, so searching a
    // merchant returned nothing while the map showed their shelf.
    expect(
      await listIds(bizId, { sort: 'pickup_end', search: 'Aurora' }),
    ).toEqual([row.id]);
    // Case-insensitive on both sides of the term, like the RPC's `ilike`.
    expect(
      await listIds(bizId, { sort: 'pickup_end', search: 'AURORA' }),
    ).toEqual([row.id]);
    expect(
      await listIds(bizId, { sort: 'pickup_end', search: 'panadería' }),
    ).toEqual([row.id]);
    // Title.
    expect(
      await listIds(bizId, { sort: 'pickup_end', search: 'sobrantes' }),
    ).toEqual([row.id]);
    // A term in none of the three columns.
    expect(await listIds(bizId, { sort: 'pickup_end', search: 'zzz' })).toEqual(
      [],
    );
  });

  test('max_price filtra por discounted_price, no por original_price', async () => {
    const { bizId, offer } = await fixture();
    // Same original price AND the same window on both rows: if the filter
    // compared `original_price` it would reject the two of them together and
    // the result would be empty.
    const window = at(5);
    const cheap = await offer({
      title: 'Barata',
      original_price: '10000',
      discounted_price: '3000',
      pickup_end: window,
    });
    const pricey = await offer({
      title: 'Cara',
      original_price: '10000',
      discounted_price: '9000',
      pickup_end: window,
    });
    // Same creation instant too, so the only thing the assertion below can be
    // reacting to is which rows the price filter let through.
    const created = new Date('2026-01-01T00:00:00Z');
    await pinCreatedAt(cheap.id, created);
    await pinCreatedAt(pricey.id, created);

    expect(
      await listIds(bizId, { sort: 'pickup_end', max_price: 5000 }),
    ).toEqual([cheap.id]);
    expect(
      await listIds(bizId, { sort: 'pickup_end', max_price: 9000 }),
    ).toEqual([cheap.id, pricey.id].sort());
    // `<=`, not `<`: the RPC admits the offer whose price IS the cap.
    expect(
      await listIds(bizId, { sort: 'pickup_end', max_price: 3000 }),
    ).toEqual([cheap.id]);
    expect(await listIds(bizId, { sort: 'pickup_end', max_price: 10 })).toEqual(
      [],
    );
  });

  test('expiring_within_hours devuelve solo lo que cierra dentro de la ventana', async () => {
    const { bizId, offer } = await fixture();
    const soon = await offer({ title: 'Cierra en 2h', pickup_end: at(2) });
    await offer({ title: 'Cierra en 10h', pickup_end: at(10) });
    const closed = await offer({
      title: 'Ventana cerrada',
      pickup_end: at(-2),
    });

    // `available_only: false` on purpose: with the default the closed offer is
    // hidden by the availability gate, which would hide a missing `pickup_end >
    // now()`. Here it can only be excluded by the window filter itself.
    expect(
      await listIds(bizId, {
        sort: 'pickup_end',
        available_only: false,
        expiring_within_hours: 3,
      }),
    ).toEqual([soon.id]);
    expect(closed.id).not.toBe(soon.id);
  });

  test('sort=pickup_end ordena por ventana asc, con id como desempate', async () => {
    const { bizId, offer } = await fixture();
    const early = await offer({ title: 'Cierra primero', pickup_end: at(2) });
    const late = await offer({ title: 'Cierra último', pickup_end: at(30) });
    // Three offers sharing ONE window: without the `offers.id` tiebreaker the
    // order among them is undefined, which is what let a row repeat on one page
    // and vanish from the next.
    const tiedEnd = at(10);
    const tied = await Promise.all([
      offer({ title: 'A', pickup_end: tiedEnd }),
      offer({ title: 'B', pickup_end: tiedEnd }),
      offer({ title: 'C', pickup_end: tiedEnd }),
    ]);
    const created = new Date('2026-01-01T00:00:00Z');
    for (const o of [early, late, ...tied]) await pinCreatedAt(o.id, created);

    const order = await listIds(bizId, { sort: 'pickup_end' });
    // The window decides, and only the window: `early` first, `late` last, even
    // though its id sorts before the tied rows'.
    expect(order[0]).toBe(early.id);
    expect(order[order.length - 1]).toBe(late.id);
    // Equal window + equal created_at => ordered by id, and by nothing else.
    expect(order.slice(1, 4)).toEqual(tied.map((o) => o.id).sort());
  });

  test('sort=created_at ordena por creación desc, con id como desempate', async () => {
    const { bizId, offer } = await fixture();
    // Every row shares the same pickup window on purpose: only `created_at`
    // (and then the id) may decide the order.
    const window = at(5);
    const older = await offer({ title: 'Vieja', pickup_end: window });
    const newer = await offer({ title: 'Nueva', pickup_end: window });
    const tiedA = await offer({ title: 'A', pickup_end: window });
    const tiedB = await offer({ title: 'B', pickup_end: window });
    await pinCreatedAt(older.id, new Date('2026-01-01T00:00:00Z'));
    await pinCreatedAt(newer.id, new Date('2026-03-01T00:00:00Z'));
    const sameInstant = new Date('2026-02-01T00:00:00Z');
    await pinCreatedAt(tiedA.id, sameInstant);
    await pinCreatedAt(tiedB.id, sameInstant);

    const order = await listIds(bizId, { sort: 'created_at' });
    // The whole order, key by key: newest first, the pair that shares an instant
    // between them ordered by id, and the oldest last.
    expect(order).toEqual([newer.id, ...[tiedA.id, tiedB.id].sort(), older.id]);
  });

  test('sort=distance sin coordenadas deja la clave inerte y cae en created_at desc + id', async () => {
    const { bizId, offer } = await fixture();
    const window = at(5);
    const a = await offer({ title: 'A', pickup_end: window });
    const b = await offer({ title: 'B', pickup_end: window });
    const c = await offer({ title: 'C', pickup_end: window });
    await pinCreatedAt(a.id, new Date('2026-01-01T00:00:00Z'));
    await pinCreatedAt(b.id, new Date('2026-03-01T00:00:00Z'));
    await pinCreatedAt(c.id, new Date('2026-03-01T00:00:00Z'));

    const order = await listIds(bizId, { sort: 'distance' });
    // No point => the distance key is NULL for every row, so what decides is
    // `created_at desc` and then the id: the RPC's documented fallback.
    expect(order.slice(0, 2)).toEqual([b.id, c.id].sort());
    expect(order[2]).toBe(a.id);
  });

  test('sort=distance compone la clave de distancia y conserva el desempate por id', async () => {
    const coords = { lat: -33.45, lng: -70.66 };
    // The harness Postgres is `postgres:16-alpine` WITHOUT PostGIS (see
    // apps/api/test/db.ts), and `business_locations.geog` is not in the Drizzle
    // mirror, so this statement cannot be executed here — its SHAPE is what
    // this asserts, compiled from the very same builders `findMany` uses.
    const statement = ctx.db
      .select({ distance_km: distanceKmSql(coords) })
      .from(offers)
      .orderBy(...offerListOrderBy({ sort: 'distance' }, coords))
      .toSQL();

    expect(statement.sql).toContain('extensions.st_distance');
    // km, not metres.
    expect(statement.sql).toContain('/ 1000.0');
    expect(statement.sql).toMatch(/CASE WHEN \$\d+ = 'distance'/);
    // The sort travels as a bound parameter, so the enum the contract validated
    // is what the CASE compares against.
    expect(statement.params).toContain('distance');
    // The pickup key stays, inert for this sort.
    expect(statement.sql).toMatch(
      /CASE WHEN \$\d+ = 'pickup_end' THEN "offers"\."pickup_end" END ASC NULLS LAST/,
    );
    expect(statement.sql).toContain('"offers"."created_at" desc');
    // The tiebreaker is the last key, always: it is what makes LIMIT/OFFSET a
    // total order.
    expect(
      statement.sql
        .slice(statement.sql.indexOf('order by'))
        .trimEnd()
        .endsWith('"offers"."id"'),
    ).toBe(true);
  });

  test('sin punto de búsqueda la proyección es NULL y no toca PostGIS', async () => {
    const { bizId, offer } = await fixture();
    const row = await offer({ title: 'Sin coordenadas' });

    const { items } = await repo.findMany({
      page: 1,
      limit: 10,
      sort: 'pickup_end',
      business_id: bizId,
    });
    expect(items.find((i) => i.id === row.id)?.distance_km).toBeNull();

    // Which is also why the two non-geo sorts run in a PostGIS-less harness.
    const statement = ctx.db
      .select({ distance_km: distanceKmSql() })
      .from(offers)
      .orderBy(...offerListOrderBy({ sort: 'pickup_end' }))
      .toSQL();
    expect(statement.sql).toContain('NULL::double precision');
    expect(statement.sql).not.toContain('st_distance');
  });
});
