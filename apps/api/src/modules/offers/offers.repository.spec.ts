import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { ListOffersQuery, ListZonesQuery } from '@0xc1x/role-commons';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedCategory,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { businessModeration, offers } from '../../database/schema';
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

  test('a wildcard in the search is escaped, on this side AND in the SQL', async () => {
    // `20260928041036_explore_search_escape_wildcards.sql` made
    // `active_offers_near` escape `p_search` the way this read always did. Before
    // it, the two disagreed and the API was the only one that did: a `%` typed
    // into the search box matched EVERY offer here and a literal percent on the
    // mobile feed, which is one intent answered two ways.
    //
    // Four offers in ONE business, so every assertion below is about which rows
    // the search let through and not about what else the file seeded. Only the
    // first three contain a metacharacter; the control carries none and must
    // never be reachable by a term made of one.
    const { bizId, offer } = await fixture('Panadería Aurora');
    const percent = await offer({ title: 'Pack 50% off' });
    const underscore = await offer({ title: 'Pack_5 piezas' });
    // `!` is the ESCAPE CHARACTER the function uses. It is an ordinary literal
    // here, and the two spellings have to agree about that.
    const bang = await offer({ title: 'Pack! urgente' });
    const control = await offer({ title: 'Pack normal' });

    // The function's own `p_search` expression, verbatim, including its `escape
    // '!'`. Run beside this repository's read because the two escape with
    // DIFFERENT characters — `\` here, `!` there — and the claim worth pinning is
    // that the difference is invisible in the result, not that the patterns match.
    const rpcSearchIds = async (term: string): Promise<string[]> => {
      const rows = await ctx.db.execute<{ id: string }>(sql`
        select o.id
          from offers o
          join businesses b on b.id = o.business_id
         where o.business_id = ${bizId}
           and (o.title ilike '%' || replace(replace(replace(${term}, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!'
             or o.description ilike '%' || replace(replace(replace(${term}, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!'
             or b.name ilike '%' || replace(replace(replace(${term}, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!')
      `);
      return [...(rows as unknown as Iterable<{ id: string }>)]
        .map((r) => r.id)
        .sort();
    };

    for (const [term, hit] of [
      ['%', percent],
      ['_', underscore],
      ['!', bang],
    ] as const) {
      // Exactly the literal, never the catch-all — and `control` is absent from
      // every one of these. Unescaped, `%` and `_` would return all four rows and
      // `!` would return none.
      expect(
        await listIds(bizId, { sort: 'pickup_end', search: term }),
      ).toEqual([hit.id]);
      // And the same answer from the function's own expression.
      expect(await rpcSearchIds(term)).toEqual([hit.id]);
    }

    // A term with no metacharacter is still a plain substring match over all
    // three columns, which is what makes the escaping above a change to the
    // WILDCARDS and not to the match itself.
    expect(await listIds(bizId, { sort: 'pickup_end', search: '50%' })).toEqual(
      [percent.id],
    );
    expect(
      (await listIds(bizId, { sort: 'pickup_end', search: 'Aurora' })).sort(),
    ).toEqual([percent.id, underscore.id, bang.id, control.id].sort());
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

// ─── `public.popular_zones` (ADR-0008) ──────────────────────────────────────
//
// The database is per FILE, so every test above shares it with these, and the
// `limit` of `popular_zones` is a GLOBAL top-N. Two consequences drive the
// shape of this block:
//
//   * Every zone name is unique per test. Asserting "the result is exactly
//     [a, b, c]" would be a claim about rows another test created.
//   * Every count/absence assertion asks for `limit: 500` and then looks its own
//     zones up, instead of asserting a total. `limit: 1` is tested separately,
//     where the only claim is the row COUNT — which is 1 whatever it contains.
//
// The alternative (an exclusive database per RPC, as
// `business-completed-orders-count.spec.ts` has) would make the assertions
// shorter, but it splits the repository's spec across two files that each have
// to re-seed the same fixture, and a global top-N is exactly the kind of thing
// that deserves its assertions written the hard way once.
describe('OffersRepository.listPopularZones (mirror of popular_zones)', () => {
  const HOUR = 3_600_000;

  /** A zone name no other test in this file can produce. */
  const zone = (label: string) => `zt-${label}-${randomUUID().slice(0, 8)}`;

  /**
   * The same origin and the same four displacements the `GET /offers` geo block
   * uses, so the numbers below are already established in this file:
   *
   *   origin  0.000 km
   *   nearN   1.109124 km   0.01 deg north
   *   nearE   0.929759 km   0.01 deg east
   *   farN   55.454012 km   0.50 deg north
   */
  const ORIGIN = { lat: -33.45, lng: -70.66 };
  const SPOTS = {
    origin: { latitude: '-33.45', longitude: '-70.66' },
    nearN: { latitude: '-33.44', longitude: '-70.66' },
    nearE: { latitude: '-33.45', longitude: '-70.65' },
    farN: { latitude: '-32.95', longitude: '-70.66' },
  } as const;

  /** Approved business + one location carrying `zone`, at `coords` if given. */
  async function placeIn(
    zoneName: string,
    coords?: { latitude: string; longitude: string },
  ) {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    const loc = await seedLocation(ctx.db, biz.id, {
      zone: zoneName,
      ...coords,
    });
    return { zone: zoneName, bizId: biz.id, locationId: loc.id };
  }

  /** One reservable offer in `locationId`, `count` of them. */
  async function offersIn(
    bizId: string,
    locationId: string,
    count: number,
    overrides: { is_active?: boolean; stock?: number } = {},
  ) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(
        await seedOffer(ctx.db, bizId, locationId, {
          stock: overrides.stock,
          is_active: overrides.is_active,
        }),
      );
    }
    return rows;
  }

  /** Every zone, then only the ones this test created. */
  async function zonesIn(
    mine: string[],
    query: Partial<ListZonesQuery> = {},
  ): Promise<Array<{ zone: string; deals: number }>> {
    const rows = await repo.listPopularZones({ limit: 500, ...query });
    return rows
      .filter((r) => mine.includes(r.zone))
      .map((r) => ({ zone: r.zone, deals: Number(r.deals) }));
  }

  test('counts reservable offers per zone, ordered by deals desc then zone', async () => {
    // The labels sort aaa < bbb < ccc and the counts are 1 < 5 < 2, so
    // alphabetical order and `deals desc` order DISAGREE on all three
    // positions. The returned list can therefore only be one of the two, which
    // is what makes this an assertion about the first sort key instead of an
    // assertion that three numbers happen to be right.
    const aaa = zone('aaa');
    const bbb = zone('bbb');
    const ccc = zone('ccc');
    const a = await placeIn(aaa);
    const b = await placeIn(bbb);
    const c = await placeIn(ccc);
    await offersIn(a.bizId, a.locationId, 1);
    await offersIn(b.bizId, b.locationId, 5);
    await offersIn(c.bizId, c.locationId, 2);

    expect(aaa < bbb && bbb < ccc).toBe(true);
    const rows = await zonesIn([aaa, bbb, ccc]);
    expect(rows).toEqual([
      { zone: bbb, deals: 5 },
      { zone: ccc, deals: 2 },
      { zone: aaa, deals: 1 },
    ]);
    // And explicitly NOT the alphabetical reading of the same three rows.
    expect(rows.map((r) => r.zone)).not.toEqual([aaa, bbb, ccc]);
  });

  test('breaks a deals tie on the zone name', async () => {
    // Two zones with the SAME count: without `l.zone` as the second sort key
    // their relative order is whatever the hash aggregate emitted, which is not
    // a promise this endpoint can make to a chip row.
    const alpha = zone('zzz-alpha');
    const beta = zone('aaa-beta');
    const a = await placeIn(alpha);
    const b = await placeIn(beta);
    await offersIn(a.bizId, a.locationId, 3);
    await offersIn(b.bizId, b.locationId, 3);

    // `zt-aaa-beta…` sorts BEFORE `zt-zzz-alpha…`, so this is the reverse of the
    // order they were created in and of the order the labels read.
    expect(beta < alpha).toBe(true);
    const rows = await zonesIn([alpha, beta]);
    expect(rows).toEqual([
      { zone: beta, deals: 3 },
      { zone: alpha, deals: 3 },
    ]);
  });

  test('a zone with no reservable offers does not appear', async () => {
    const soldOut = zone('sold-out');
    const paused = zone('paused');
    const closed = zone('closed-window');
    const noOffers = zone('no-offers');
    const control = zone('control');

    const a = await placeIn(soldOut);
    await offersIn(a.bizId, a.locationId, 1, { stock: 0 });
    const b = await placeIn(paused);
    await offersIn(b.bizId, b.locationId, 1, { is_active: false });
    const c = await placeIn(closed);
    const expired = await seedOffer(ctx.db, c.bizId, c.locationId);
    await ctx.db
      .update(offers)
      .set({ pickup_end: new Date(Date.now() - HOUR) })
      .where(eq(offers.id, expired.id));
    // A location with a zone and NO offers at all: the RPC inner-joins, so it
    // cannot produce a row.
    await placeIn(noOffers);
    // The control exists so the exclusions above are not vacuous: if the gate
    // were dropping everything, this would be missing too.
    const d = await placeIn(control);
    await offersIn(d.bizId, d.locationId, 1);

    const mine = [soldOut, paused, closed, noOffers, control];
    const rows = await zonesIn(mine);
    expect(rows).toEqual([{ zone: control, deals: 1 }]);
  });

  test('excludes a NULL zone and an empty-string zone, and is not vacuous', async () => {
    // Both are separate predicates in the SQL (`is not null` and `<> ''`), so the
    // spec has to produce BOTH states: a location whose zone was never filled in
    // is `NULL`, one that was filled in and cleared is `''`.
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);
    const nullZone = await seedLocation(ctx.db, biz.id, { zone: null });
    const emptyZone = await seedLocation(ctx.db, biz.id, { zone: '' });
    const control = await placeIn(zone('zone-control'));
    await offersIn(biz.id, nullZone.id, 1);
    await offersIn(biz.id, emptyZone.id, 1);
    await offersIn(control.bizId, control.locationId, 1);

    // Non-vacuity, part 1: both offers are PUBLICLY RESERVABLE. The public offer
    // list is the surface that shares this gate, so if these rows were invisible
    // for any reason other than the zone predicates, the exclusion below would
    // prove nothing.
    const visible = await repo.findMany({
      page: 1,
      limit: 50,
      business_id: biz.id,
    });
    expect(visible.items).toHaveLength(2);
    expect(visible.total).toBe(2);

    // Non-vacuity, part 2: and they DO aggregate, into no zone at all.
    const all = await repo.listPopularZones({ limit: 500 });
    const rawNull = all.filter((r) => r.zone === '' || r.zone === null);
    expect(rawNull).toEqual([]);

    const rows = await zonesIn([control.zone]);
    expect(rows).toEqual([{ zone: control.zone, deals: 1 }]);
  });

  test('the radius filter runs against real coordinates (PostGIS executed)', async () => {
    const names = {} as Record<keyof typeof SPOTS, string>;
    const ids = {} as Record<keyof typeof SPOTS, string>;
    for (const [spot, coords] of Object.entries(SPOTS) as [
      keyof typeof SPOTS,
      { latitude: string; longitude: string },
    ][]) {
      names[spot] = zone(spot);
      const place = await placeIn(names[spot], coords);
      ids[spot] = place.locationId;
      await offersIn(place.bizId, place.locationId, 1);
    }
    const mine = Object.values(names);

    // 2 km admits origin + nearN (1.109) + nearE (0.930) and rejects farN
    // (55.45). The boundary is a generous multiple of the seed, not a computed
    // geodesic: these four are ~30x apart from each other, so no tolerance
    // choice can make a 2 km radius ambiguous. The exact-metre boundary case
    // belongs to the `GET /offers` spec, which already asserts it against
    // `st_distance`; repeating it here would test the same PostGIS call twice.
    const inside = await zonesIn(mine, { ...ORIGIN, radius_km: 2 });
    expect(inside.map((r) => r.zone).sort()).toEqual(
      [names.origin, names.nearN, names.nearE].sort(),
    );

    // A radius only the searched point itself reaches: 0.1 km admits `origin` at
    // 0 km and nothing else, so this also proves the filter is measured, not
    // applied as a boolean "are coordinates present".
    const tight = await zonesIn(mine, { ...ORIGIN, radius_km: 0.1 });
    expect(tight.map((r) => r.zone)).toEqual([names.origin]);

    // No radius at all: the same four rows, unfiltered.
    expect(await zonesIn(mine)).toHaveLength(4);

    // All-or-nothing, exactly as the RPC's `p_lat is null or p_lng is null or
    // p_radius_km is null` reads. A search point WITHOUT a radius must not
    // silently become a 0 km radius, which would answer nothing.
    expect(
      await zonesIn(mine, { lat: ORIGIN.lat, lng: ORIGIN.lng }),
    ).toHaveLength(4);
    expect(await zonesIn(mine, { lat: ORIGIN.lat })).toHaveLength(4);
    expect(await zonesIn(mine, { lng: ORIGIN.lng })).toHaveLength(4);
    expect(await zonesIn(mine, { lat: ORIGIN.lat, radius_km: 2 })).toHaveLength(
      4,
    );

    // Moving the origin reverses which end of the pair survives: searched from
    // `farN`, `farN` is at 0 km and `origin` is 55 km away.
    const fromFar = await zonesIn(mine, {
      lat: Number(SPOTS.farN.latitude),
      lng: Number(SPOTS.farN.longitude),
      radius_km: 2,
    });
    expect(fromFar.map((r) => r.zone)).toEqual([names.farN]);
  });

  test('the limit applies, and greatest(p_limit, 1) returns one row at limit=0', async () => {
    const a = await placeIn(zone('lim-a'));
    const b = await placeIn(zone('lim-b'));
    const c = await placeIn(zone('lim-c'));
    await offersIn(a.bizId, a.locationId, 1);
    await offersIn(b.bizId, b.locationId, 1);
    await offersIn(c.bizId, c.locationId, 1);

    // Row COUNT only, never which row: the top-N is global across this file's
    // database, so the identity of the single survivor is not this test's to
    // claim. That it is one of the three zones is asserted separately below.
    const one = await repo.listPopularZones({ limit: 1 });
    expect(one).toHaveLength(1);

    // `limit greatest(p_limit, 1)`: 0 returns ONE row on the RPC, not zero and
    // not an error. Rejecting it in the schema instead would have made the
    // clamp unreachable and this assertion impossible to write.
    const zero = await repo.listPopularZones({ limit: 0 });
    expect(zero).toHaveLength(1);
    // And a negative value clamps the same way rather than reaching Postgres as
    // `limit -5`, which is a 42601 there.
    const negative = await repo.listPopularZones({ limit: -5 });
    expect(negative).toHaveLength(1);

    const all = await repo.listPopularZones({ limit: 500 });
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * The moderation gate, measured on BOTH sides and required to agree.
   *
   * This used to assert the opposite, and the change is worth naming: before
   * `20260928041322_explore_aggregates_require_approved_business.sql` the
   * function counted a zone whose offers belonged to a suspended merchant and
   * this repository did not, the difference was deliberate, and the test pinned
   * it — including the "and the RPC counts it" half that would have caught
   * somebody "fixing" the mirror by copying the SQL. The function carries the
   * gate now, so the risk is no longer an intentional difference: it is two
   * independent spellings of one rule drifting apart, which is what ADR-0008
   * exists to manage. The function's own body is run verbatim BESIDE the
   * repository read, and the two have to agree.
   *
   * Regression net, not divergence record — and the gate is load-bearing on both
   * sides of it. The `is_active`/`stock`/`pickup_end` assertions below are what
   * make the exclusion a statement about the business gate: without them, a
   * deleted `publiclyVisibleBusiness()` would still pass.
   */
  test('the repository applies the same moderation gate the function does', async () => {
    const z = zone('gated');
    const place = await placeIn(z);
    const seeded = await seedOffer(ctx.db, place.bizId, place.locationId);

    // The function's own body, verbatim, as
    // `20260928041322_explore_aggregates_require_approved_business.sql` left it.
    const rpcDeals = async () => {
      const rpc = await ctx.db.execute<{ zone: string; deals: string }>(sql`
        select l.zone, count(*)::bigint as deals
          from offers o
          join business_locations l on l.id = o.business_location_id
          join businesses b on b.id = o.business_id
         where o.is_active
           and b.is_active
           and exists (select 1 from public.business_moderation m
                       where m.business_id = b.id
                         and m.verification_status = 'approved')
           and o.stock > 0
           and o.pickup_end > now()
           and l.zone is not null
           and l.zone <> ''
         group by l.zone
        having l.zone = ${z}
      `);
      return rpc.length === 0 ? 0 : Number(rpc[0]!.deals);
    };

    // Baseline: both count the live offer of an approved merchant.
    expect(await zonesIn([z])).toEqual([{ zone: z, deals: 1 }]);
    expect(await rpcDeals()).toBe(1);

    // Now the business stops being publicly visible. Nothing here touches the
    // offer: `enforce_offer_business_availability` is a BEFORE INSERT/UPDATE
    // trigger on `offers`, and no trigger runs in the other direction when a
    // business is suspended. So the offer row keeps `is_active = true` — which
    // is exactly why the gate has to be what excludes it.
    await ctx.db
      .update(businessModeration)
      .set({ verification_status: 'pending' })
      .where(eq(businessModeration.business_id, place.bizId));

    // Asserted directly, because everything below depends on it: if the offer
    // were NOT still active, the exclusion that follows would prove nothing
    // about moderation — it would be the `is_active` filter doing the work, and
    // this test would keep passing with the gate deleted.
    const [raw] = await ctx.db
      .select({ is_active: offers.is_active, stock: offers.stock })
      .from(offers)
      .where(eq(offers.id, seeded.id));
    expect(raw?.is_active).toBe(true);
    expect(raw?.stock).toBeGreaterThan(0);
    // And its pickup window is still open, so the third condition is satisfied
    // too. Only the business gate is left to exclude it.
    const [window] = await ctx.db
      .select({ pickup_end: offers.pickup_end })
      .from(offers)
      .where(eq(offers.id, seeded.id));
    expect(window!.pickup_end.getTime()).toBeGreaterThan(Date.now());

    // The zone is gone from both sides now. Before the migration this half of
    // the test asserted the opposite, and that disagreement WAS the behaviour.
    expect(await zonesIn([z])).toEqual([]);
    expect(await rpcDeals()).toBe(0);
  });
});
