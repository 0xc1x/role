import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
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
    // The SHAPE of the statement, compiled from the very same builders `findMany`
    // uses. The harness Postgres now HAS PostGIS (see apps/api/test/db.ts), so
    // this statement CAN be executed — and running it is what caught the 42803
    // in `groupByFields`, which no amount of shape-asserting here could have:
    // the bug was that the SELECT and the GROUP BY built two copies of the same
    // expression with different placeholder numbers. The geo block at the bottom
    // of this file executes the path; this one keeps the compiled text pinned.
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

    // Which is also why the two non-geo sorts need nothing from PostGIS.
    const statement = ctx.db
      .select({ distance_km: distanceKmSql() })
      .from(offers)
      .orderBy(...offerListOrderBy({ sort: 'pickup_end' }))
      .toSQL();
    expect(statement.sql).toContain('NULL::double precision');
    expect(statement.sql).not.toContain('st_distance');
  });
});

/**
 * The geo path of `GET /offers` EXECUTED.
 *
 * Everything above asserted the SHAPE of the statement, because the harness
 * Postgres was `postgres:16-alpine` without PostGIS. It is now a PostGIS
 * database (see `apps/api/test/db.ts`, item 5) carrying the same
 * `business_locations.geog` generated column and GIST index as Supabase, so
 * the filter and the projection are run for real here — which is not a nicety:
 * the first execution of this block is what found the 42803 that made every
 * `lat` + `lng` request fail. A shape test cannot fail that way.
 *
 * The distances below were MEASURED on this database, not derived here: PostGIS
 * computes `geography` distance on the WGS84 spheroid by default, so a degree of
 * latitude is ~110.9 km and a degree of longitude at latitude -33.45 is ~93.0 km.
 */
describe('OffersRepository — geo ejecutado (PostGIS real)', () => {
  const HOUR = 3_600_000;
  const at = (h: number) => new Date(Date.now() + h * HOUR);

  /** The searched point. Also `seedLocation`'s default coordinate pair. */
  const ORIGIN = { lat: -33.45, lng: -70.66 };

  /**
   * Real coordinates, and what the geodesics come out at from `ORIGIN`:
   *
   *   origin   0.00 km      0 m        the point itself
   *   nearN    1.109124 km  1109.124 m 0.01 deg NORTH, same longitude
   *   nearE    0.929759 km   929.759 m 0.01 deg EAST,  same latitude
   *   farN    55.454012 km 55454.012 m 0.50 deg NORTH, same longitude
   *
   * `nearN` and `nearE` are the pair that pins the argument order of
   * `st_makepoint(longitude, latitude)`: at this latitude a degree of longitude
   * is only ~0.84 of a degree of latitude, so a swapped pair could not produce
   * both of these numbers. Everything is displaced along ONE axis, so the
   * expected value is a meridian or parallel arc rather than a diagonal.
   */
  const SPOTS = {
    origin: { latitude: '-33.45', longitude: '-70.66' },
    nearN: { latitude: '-33.44', longitude: '-70.66' },
    nearE: { latitude: '-33.45', longitude: '-70.65' },
    farN: { latitude: '-32.95', longitude: '-70.66' },
  } as const;
  type Spot = keyof typeof SPOTS;

  /**
   * A business with one location per spot, all four offers sharing ONE pickup
   * window and (below) one `created_at`, so the only thing that can order them
   * is the key under test.
   */
  async function geoFixture() {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, { name: 'Geo Fixture' });
    const locs = {} as Record<Spot, string>;
    for (const [spot, coords] of Object.entries(SPOTS) as [
      Spot,
      { latitude: string; longitude: string },
    ][]) {
      locs[spot] = (
        await seedLocation(ctx.db, biz.id, { name: spot, ...coords })
      ).id;
    }
    const window = at(5);
    const offerIds = {} as Record<Spot, string>;
    for (const spot of Object.keys(SPOTS) as Spot[]) {
      const row = await repo.insert(ctx.db, {
        business_id: biz.id,
        business_location_id: locs[spot],
        title: spot,
        original_price: '10000',
        discounted_price: '3000',
        stock: 5,
        initial_stock: 5,
        pickup_start: new Date(Date.now() - HOUR),
        pickup_end: window,
        is_active: true,
      });
      offerIds[spot] = row.id;
    }
    const created = new Date('2026-01-01T00:00:00Z');
    for (const id of Object.values(offerIds)) {
      await ctx.db
        .update(offers)
        .set({ created_at: created })
        .where(eq(offers.id, id));
    }
    return { bizId: biz.id, offerIds };
  }

  async function list(
    bizId: string,
    query: Omit<Partial<ListOffersQuery>, 'page' | 'limit' | 'business_id'>,
  ) {
    const { items } = await repo.findMany({
      page: 1,
      limit: 50,
      business_id: bizId,
      ...query,
    });
    return items;
  }

  test('el filtro de radio devuelve lo que está dentro y oculta lo que está fuera', async () => {
    const { bizId, offerIds: ids } = await geoFixture();

    // 2 km admits `origin` and both `nearN`/`nearE` (1.109 / 0.930 km) and
    // rejects `farN` (55.45 km). Without a radius the same point returns all
    // four, which is what makes the two assertions below about the filter and
    // not about the seed.
    const inside = await list(bizId, {
      sort: 'pickup_end',
      ...ORIGIN,
      radius_km: 2,
    });
    expect(inside.map((i) => i.id).sort()).toEqual(
      [ids.origin, ids.nearN, ids.nearE].sort(),
    );
    expect(inside.map((i) => i.id)).not.toContain(ids.farN);

    // Same four rows, no radius: the geo path is live and the filter is what
    // removed `farN` above.
    const unfiltered = await list(bizId, { sort: 'pickup_end', ...ORIGIN });
    expect(unfiltered).toHaveLength(4);

    // A radius nothing reaches, and a radius everything reaches.
    expect(
      await list(bizId, { sort: 'pickup_end', ...ORIGIN, radius_km: 0.1 }),
    ).toHaveLength(1); // only `origin`, at 0 km
    expect(
      await list(bizId, { sort: 'pickup_end', ...ORIGIN, radius_km: 200 }),
    ).toHaveLength(4);

    // `lat` and `lng` alone, with no `radius_km`, must NOT filter: the RPC
    // treats the radius as independent, and a search that silently became a
    // 0 km radius would answer nothing at all.
    expect(await list(bizId, { sort: 'pickup_end', ...ORIGIN })).toHaveLength(
      4,
    );
  });

  test('el límite del radio es inclusivo: st_dwithin incluye lo que está justo en él', async () => {
    const { bizId, offerIds: ids } = await geoFixture();

    // The boundary is defined by the distance Postgres itself reports, taken
    // from a geo query with no radius. A geodesic distance is not exactly
    // representable, so "exactly on the boundary" can only be built as "at the
    // distance the database computed" — nudged by a RELATIVE epsilon that is
    // far above the noise and far below anything meaningful:
    //
    //   * `ST_DWithin` and `ST_Distance` do not agree bit-for-bit. On this
    //     database `st_dwithin(geog, origin, st_distance(geog, origin))` is
    //     FALSE: `ST_DWithin` short-circuits on a bounding box and its internal
    //     distance differs from `ST_Distance`'s by ~1e-8 m (about a thousand ULP
    //     at 55 km, so floating-point noise, not a semantic difference).
    //   * 1e-6 relative is 55 mm at 55 km and 1.1 mm at 1.1 km: five orders of
    //     magnitude above that noise, and five below the coarsest thing a
    //     radius can express. So `distance * (1 ± 1e-6)` pins the boundary
    //     without asserting anything a PostGIS rebuild could invalidate.
    const unfiltered = await list(bizId, { sort: 'pickup_end', ...ORIGIN });
    const farDistance = unfiltered.find((i) => i.id === ids.farN)!.distance_km;
    expect(farDistance).not.toBeNull();
    expect(farDistance).toBeGreaterThan(0);

    const admitted = await list(bizId, {
      sort: 'pickup_end',
      ...ORIGIN,
      radius_km: farDistance! * (1 + 1e-6),
    });
    expect(admitted.map((i) => i.id)).toContain(ids.farN);

    const refused = await list(bizId, {
      sort: 'pickup_end',
      ...ORIGIN,
      radius_km: farDistance! * (1 - 1e-6),
    });
    expect(refused.map((i) => i.id)).not.toContain(ids.farN);
  });

  test('distance_km es la distancia real, y null sin punto de búsqueda', async () => {
    const { bizId, offerIds: ids } = await geoFixture();
    const items = await list(bizId, { sort: 'pickup_end', ...ORIGIN });
    const byId = new Map(items.map((i) => [i.id, i]));

    /**
     * Tolerance: 10 m on a 1109 m distance, i.e. 0.9%.
     *
     * The value is a geodesic computation, so exact float equality would be a
     * test that fails when PostGIS changes its solver and passes when the
     * coordinate order is wrong — exactly backwards. 10 m is ~9 orders of
     * magnitude above the run-to-run noise of a fixed algorithm, and ~4 above
     * what a GEOS/GeographicLib revision could plausibly move the result by,
     * while still being far too tight to survive any of the mistakes this
     * projection is exposed to:
     *
     *   * metres instead of kilometres: 1109.12 vs 1.109
     *   * `st_makepoint(latitude, longitude)` swapped: 1109.12 vs 929.76
     *   * the division by 1000 dropped: 0.001109
     *   * a haversine-over-flat-earth approximation: 1109.1 vs ~1109.7 here, but
     *     the diagonal spots below are where an approximation shows up
     */
    const nearN = byId.get(ids.nearN)!.distance_km!;
    expect(Math.abs(nearN - 1.109124)).toBeLessThan(0.01);

    const nearE = byId.get(ids.nearE)!.distance_km!;
    expect(Math.abs(nearE - 0.929759)).toBeLessThan(0.01);

    const farN = byId.get(ids.farN)!.distance_km!;
    expect(Math.abs(farN - 55.454012)).toBeLessThan(0.01);

    // The searched point is an IDENTITY, not a geodesic: the location sits on
    // it, so this is exact and must stay exact. A non-zero here would mean the
    // search point and the generated column disagree about the coordinate pair.
    expect(byId.get(ids.origin)!.distance_km).toBe(0);

    // Monotonic, and strictly ordered: 0 < nearE < nearN < farN.
    expect([nearE, nearN, farN]).toEqual(
      [nearE, nearN, farN].sort((a, b) => a - b),
    );
    expect(new Set([nearE, nearN, farN, 0]).size).toBe(4);

    // No `lat`/`lng` in the request => no projection, no PostGIS call, `null`.
    const withoutPoint = await list(bizId, { sort: 'pickup_end' });
    expect(withoutPoint).toHaveLength(4);
    for (const item of withoutPoint) {
      expect(item.distance_km).toBeNull();
    }
  });

  test('sort=distance ordena por la distancia real y desempata por offers.id', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, { name: 'Distance Sort' });
    const window = at(5);

    // Two offers at the searched point (so they tie on distance) and one far
    // away. The pair is what exercises the tiebreaker: equal distance, equal
    // `pickup_end`, equal `created_at`, so the id is the LAST key standing.
    const here = (
      await seedLocation(ctx.db, biz.id, {
        name: 'here',
        latitude: SPOTS.origin.latitude,
        longitude: SPOTS.origin.longitude,
      })
    ).id;
    const far = (
      await seedLocation(ctx.db, biz.id, {
        name: 'far',
        latitude: SPOTS.farN.latitude,
        longitude: SPOTS.farN.longitude,
      })
    ).id;

    const make = async (locationId: string, title: string) => {
      const row = await repo.insert(ctx.db, {
        business_id: biz.id,
        business_location_id: locationId,
        title,
        original_price: '10000',
        discounted_price: '3000',
        stock: 5,
        initial_stock: 5,
        pickup_start: new Date(Date.now() - HOUR),
        pickup_end: window,
        is_active: true,
      });
      await ctx.db
        .update(offers)
        .set({ created_at: new Date('2026-01-01T00:00:00Z') })
        .where(eq(offers.id, row.id));
      return row;
    };

    const tied = await Promise.all([make(here, 'A'), make(here, 'B')]);
    const distant = await make(far, 'C');

    const fromOrigin = await list(biz.id, {
      sort: 'distance',
      ...ORIGIN,
    });
    // Both zero-distance offers first, ordered by id and by nothing else, then
    // the 55 km one.
    expect(fromOrigin.map((i) => i.id)).toEqual([
      ...tied.map((o) => o.id).sort(),
      distant.id,
    ]);
    expect(fromOrigin[0]?.distance_km).toBe(0);
    expect(fromOrigin[1]?.distance_km).toBe(0);
    expect(fromOrigin[2]?.distance_km).toBeCloseTo(55.454012, 5);

    // The order follows the POINT, not the seed: searching from the far
    // location's own coordinates reverses the ranking. Without a real
    // projection both queries would return the same order.
    const fromFar = await list(biz.id, {
      sort: 'distance',
      lat: Number(SPOTS.farN.latitude),
      lng: Number(SPOTS.farN.longitude),
    });
    expect(fromFar[0]?.id).toBe(distant.id);
    expect(fromFar.map((i) => i.id).slice(1)).toEqual(
      tied.map((o) => o.id).sort(),
    );
    expect(fromFar[0]?.distance_km).toBe(0);

    // `sort=distance` with no point leaves the key inert: the RPC's documented
    // fallback, `created_at desc` then id. All three share one `created_at`
    // here, so that is the plain id order over ALL THREE rows — and it is NOT
    // the order the same three came back in above, which is the clearest proof
    // that the ranking above came from the distance and not from the ids.
    const noPoint = await list(biz.id, { sort: 'distance' });
    expect(noPoint.map((i) => i.distance_km)).toEqual([null, null, null]);
    const idOrder = [tied[0]!.id, tied[1]!.id, distant.id].sort();
    expect(noPoint.map((i) => i.id)).toEqual(idOrder);

    // There is deliberately no `expect(noPoint ids).not.toEqual(fromOrigin ids)`
    // here, and its absence is the point. That assertion is a coin flip: the ids
    // are random UUIDs, so the distance ranking and the id ranking coincide
    // exactly when the far row's id happens to sort last — one chance in three.
    // It failed about a third of the time here, which is the worst possible
    // failure mode: a suite that is green most runs and red at random trains
    // everyone to re-run instead of read, and the next real regression arrives
    // inside that learned noise.
    //
    // The ranking follows the POINT, and the proof of that does not depend on
    // the ids at all: `fromOrigin` is [0, 0, 55.45] km and `noPoint` is
    // [null, null, null] for the same three rows, and moving the origin to the
    // far location's own coordinates (line above) puts that row FIRST. No
    // ordering of the ids can produce either result.
    expect(fromOrigin.map((i) => i.distance_km === 0)).toEqual([
      true,
      true,
      false,
    ]);
  });

  test('el filtro de radio se sirve por el índice GIST de producción', async () => {
    // The index is installed by the harness (test/db.ts, item 5) precisely so
    // the filter is not answered by a sequential scan with per-row trigonometry.
    // Its EXISTENCE is asserted, not a chosen plan: EXPLAIN output is the
    // planner's decision and would be a flaky thing to pin in a test.
    const rows = await ctx.db.execute<{ indexname: string }>(sql`
      select indexname
        from pg_indexes
       where schemaname = 'public'
         and tablename = 'business_locations'
         and indexname = 'business_locations_geog_idx'
    `);
    expect(rows).toHaveLength(1);

    // And the generated column is populated from lat/lng, in the right order.
    // `extensions.` is explicit on every PostGIS name here because the harness
    // connection's search_path does NOT include the extension schema — the same
    // discipline the repository's own raw SQL follows, and the reason
    // production depends on that schema name being right.
    const probe = await ctx.db.execute<{
      geog: string | null;
      same_as_lng_lat: boolean;
    }>(sql`
      select geog::text as geog,
             geog is not null
               and extensions.st_astext(geog::extensions.geometry)
                   = extensions.st_astext(
                       extensions.st_makepoint(
                           longitude::double precision,
                           latitude::double precision))
               as same_as_lng_lat
        from public.business_locations
       limit 1
    `);
    expect(probe).toHaveLength(1);
    expect(probe[0]!.geog).not.toBeNull();
    // `st_makepoint(longitude, latitude)`, X first: a swapped generation
    // expression would mirror the point and this would be false.
    expect(probe[0]!.same_as_lng_lat).toBe(true);
  });
});
